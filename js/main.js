/**
 * Main - 코드덕(CodeDuck) 메인 컨트롤러
 * UI 이벤트 처리, 분석 파이프라인, 상태 관리
 */

// 전역 인스턴스
let audioEngine    = new AudioEngine();
let pitchDetector  = new PitchDetector();
let tabConverter   = new TabConverter();
let tabRenderer    = null;

// 상태
let state = {
    file:              null,
    waveformData:      [],
    analysisData:      null,   // 원본 noteSequence (재분석용)
    currentInstrument: 'acoustic',
    tabData:           null,
    bars:              null,
    bpm:               120,
    key:               'C Major',
    chords:            [],      // 전조가 적용된 현재 코드 목록
    chordsOriginal:    [],      // 전조 전 원본 코드 목록
    transposeSemitones: 0,      // 현재 전조 반음 수
    isAnalyzed:        false,
    isPlaying:         false,
    isAnalyzing:       false,   // 분석 진행 중 플래그
    zoom:              1.0,
    animFrameId:       null,
    /* ── v4.1: 수동 코드 편집 ── */
    manualChordEdits:  {},      // { barIndex: { chord: {...}, protected: true } }
};

// DOM 요소
const dom = {
    uploadSection:       document.getElementById('uploadSection'),
    introSection:        document.getElementById('introSection'),
    playerSection:       document.getElementById('playerSection'),
    fileInput:           document.getElementById('fileInput'),
    dropZone:            document.getElementById('dropZone'),
    fileName:            document.getElementById('fileName'),
    btnChange:           document.getElementById('btnChange'),
    btnPlay:             document.getElementById('btnPlay'),
    playIcon:            document.getElementById('playIcon'),
    waveformCanvas:      document.getElementById('waveformCanvas'),
    vizCanvas:           document.getElementById('vizCanvas'),
    progressFill:        document.getElementById('progressFill'),
    progressThumb:       document.getElementById('progressThumb'),
    progressBarWrap:     document.getElementById('progressBarWrap'),
    timeCurrent:         document.getElementById('timeCurrent'),
    timeTotal:           document.getElementById('timeTotal'),
    volumeSlider:        document.getElementById('volumeSlider'),
    analysisBtnWrap:     document.getElementById('analysisBtnWrap'),
    btnAnalyze:          document.getElementById('btnAnalyze'),
    analysisProgress:    document.getElementById('analysisProgress'),
    analysisProgressFill:document.getElementById('analysisProgressFill'),
    progressText:        document.getElementById('progressText'),
    tabSection:          document.getElementById('tabSection'),
    tabCanvas:           document.getElementById('tabCanvas'),
    tabScoreContainer:   document.getElementById('tabScoreContainer'),
    bpmValue:            document.getElementById('bpmValue'),
    keyValue:            document.getElementById('keyValue'),
    timeSignature:       document.getElementById('timeSignature'),
    mainChords:          document.getElementById('mainChords'),
    chordDiagrams:       document.getElementById('chordDiagrams'),
    toggleSync:          document.getElementById('toggleSync'),
    toggleChords:        document.getElementById('toggleChords'),
    zoomIn:              document.getElementById('zoomIn'),
    zoomOut:             document.getElementById('zoomOut'),
    zoomLevel:           document.getElementById('zoomLevel'),
    step1:               document.getElementById('step1'),
    step2:               document.getElementById('step2'),
    step3:               document.getElementById('step3'),
    step4:               document.getElementById('step4'),
    // 전조 UI
    transposePanel:      document.getElementById('transposePanel'),
    tcCurrentChord:      document.getElementById('tcCurrentChord'),
    tcChordGrid:         document.getElementById('tcChordGrid'),
    tcManualInput:       document.getElementById('tcManualInput'),
    btnTcManual:         document.getElementById('btnTcManual'),
    btnTcReset:          document.getElementById('btnTcReset'),
    transposeBadge:      document.getElementById('transposeBadge'),
    transposeBadgeText:  document.getElementById('transposeBadgeText'),
    transposeToggleBtn:  document.getElementById('transposeToggleBtn'),
    transposeBody:       document.getElementById('transposeBody'),
    transposeChevron:    document.getElementById('transposeChevron'),
};

// 전조 패널 접기/펼치기 토글 + iOS 감지
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('transposeToggleBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const body    = document.getElementById('transposeBody');
            const chevron = document.getElementById('transposeChevron');
            if (!body) return;
            const isHidden = body.classList.toggle('hidden');
            if (chevron) chevron.style.transform = isHidden ? '' : 'rotate(180deg)';
        });
    }

    // iOS / Safari 감지 → 힌트 메시지 표시
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const iosHint  = document.getElementById('iosHint');
    if (iosHint && (isIOS || isSafari)) {
        iosHint.style.display = 'block';
    }
    // iOS에서 drop-text("끌어다 놓거나") 숨기기 — 터치 기기에서 D&D 미지원
    if (isIOS) {
        const dropText = document.querySelector('.drop-text');
        if (dropText) dropText.style.display = 'none';
    }
});

// ==========================================
// iOS Safari AudioContext 완전 해결책
// ──────────────────────────────────────────
// iOS 정책: AudioContext는 반드시 직접적인 user gesture
// (touchstart/touchend/click) 핸들러 내에서 생성·resume 해야 함.
//
// 문제의 흐름:
//   [터치] → label 클릭 → 파일선택 dialog 열림
//   → dialog 닫힘(파일선택) → change 이벤트 → handleFile()
//   → audioContext.resume() 시도 → 실패 (gesture 스택 소멸)
//
// 해결책:
//   1) 화면의 모든 첫 터치에서 AudioContext를 미리 생성·resume
//   2) 재생 버튼 touchstart에서 resume 후 즉시 playAsync() 호출
//   3) 파일 로드 완료 후 "탭해서 재생" 안내 배너 표시
// ==========================================

// iOS/Safari 여부 한 번만 판별
const _isIOS = /iP(hone|ad|od)/i.test(navigator.userAgent) ||
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const _isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const _needsGesture = _isIOS || _isSafari;

// ── 전략 1: 화면 첫 터치에서 AudioContext 미리 생성 ──
if (_needsGesture) {
    const _unlockAudio = async () => {
        try {
            if (!audioEngine.audioContext) {
                await audioEngine.init();
            } else if (audioEngine.audioContext.state === 'suspended') {
                await audioEngine.audioContext.resume();
            }
        } catch(e) {
            console.warn('[iOS] AudioContext unlock 실패:', e);
        }
    };
    // passive:false 로 등록 → iOS gesture 체인 유지
    document.addEventListener('touchstart', _unlockAudio, { once: true, passive: true });
    document.addEventListener('touchend',   _unlockAudio, { once: true, passive: true });
}

// ==========================================
// 파일 업로드
// ==========================================
dom.fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleFile(file);
});
dom.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dom.dropZone.classList.add('drag-over'); });
dom.dropZone.addEventListener('dragleave', () => dom.dropZone.classList.remove('drag-over'));
dom.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && isAudioFile(file)) handleFile(file);
    else showToast('지원하지 않는 파일 형식입니다', 'error');
});
dom.btnChange.addEventListener('click', () => {
    // 분석 진행 중이면 중단 확인
    if (state.isAnalyzing) {
        if (!confirm('분석이 진행 중입니다. 파일을 변경하면 현재 분석이 중단됩니다. 계속하시겠습니까?')) return;
        state.isAnalyzing = false;  // 분석 중단 플래그
    }
    resetAll();
});

function isAudioFile(file) {
    // iOS Safari는 파일 type이 비어있는 경우가 많음 → 확장자 우선 체크
    const ext = (file.name || '').split('.').pop().toLowerCase();
    const supportedExts = ['mp3','wav','ogg','flac','m4a','aac','opus','webm'];
    return supportedExts.includes(ext) || (file.type && file.type.startsWith('audio/'));
}

async function handleFile(file) {
    if (!file) return;
    state.file = file;
    dom.fileName.textContent = file.name;

    // 파일 크기 체크 (100MB 초과 시 경고)
    if (file.size > 100 * 1024 * 1024) {
        showToast('파일이 너무 큽니다. 100MB 이하 파일을 사용해주세요.', 'error');
        return;
    }

    // 파일 형식 체크
    if (!isAudioFile(file)) {
        showToast('지원하지 않는 파일 형식입니다. MP3, WAV, M4A, OGG, FLAC을 사용해주세요.', 'error');
        return;
    }

    try {
        showToast('파일 로딩 중...', 'info');

        // AudioContext가 없으면 생성 (첫 터치에서 이미 생성됐을 가능성 높음)
        if (!audioEngine.audioContext) {
            await audioEngine.init();
        }

        await audioEngine.loadFile(file);
        state.waveformData = audioEngine.getWaveformData(800);
        dom.uploadSection.classList.add('hidden');
        if (dom.introSection) dom.introSection.classList.add('hidden');
        dom.playerSection.classList.remove('hidden');
        dom.timeTotal.textContent = formatTime(audioEngine.duration);
        drawWaveform(0);

        // iOS: 파일 로드 후 AudioContext 상태 확인
        // dialog 열림/닫힘으로 gesture 체인이 끊겼을 수 있으므로
        // "재생 버튼을 탭하세요" 안내 배너 표시
        if (_needsGesture) {
            const ctx = audioEngine.audioContext;
            if (!ctx || ctx.state === 'suspended') {
                _showIosPlayBanner();
            }
        }

        showToast('파일 로드 완료! ▶ 재생 버튼을 눌러주세요.', 'success');
    } catch (err) {
        console.error('파일 로드 오류:', err);
        let msg = '파일 로드에 실패했습니다.';
        const errMsg = (err.message || '').toLowerCase();
        const errName = err.name || '';

        if (errName === 'NotAllowedError' || errMsg.includes('not allowed')) {
            msg = '오디오 재생 권한이 없습니다.\n화면을 한 번 탭(터치)한 뒤 다시 파일을 선택해주세요.';
        } else if (errName === 'EncodingError' || errName === 'NotSupportedError' ||
                   errMsg.includes('decode') || errMsg.includes('format') ||
                   errMsg.includes('not supported')) {
            const ext = (file.name || '').split('.').pop().toUpperCase();
            if (['OGG','FLAC','OPUS','WEBM'].includes(ext)) {
                msg = `${ext} 형식은 iPhone/Safari에서 지원되지 않습니다.\nMP3 또는 M4A/AAC 파일로 변환 후 다시 시도해주세요.`;
            } else {
                msg = '파일을 디코딩할 수 없습니다. MP3 또는 M4A(AAC) 파일을 사용해주세요.';
            }
        } else if (file.size === 0) {
            msg = '파일이 비어있습니다. 다른 파일을 선택해주세요.';
        } else if (errMsg.includes('memory') || errMsg.includes('quota')) {
            msg = '메모리가 부족합니다. 파일 크기를 줄이거나 다른 앱을 닫은 후 다시 시도해주세요.';
        }
        showToast(msg, 'error');
    }
}

// ── iOS 전용: 재생 버튼 탭 안내 배너 ──────────────────────────
function _showIosPlayBanner() {
    // 이미 있으면 중복 생성 방지
    if (document.getElementById('iosPlayBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'iosPlayBanner';
    banner.style.cssText = `
        position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
        background: #1e293b; color: #fff; border-radius: 14px;
        padding: 13px 22px; font-size: 0.88rem; font-weight: 600;
        display: flex; align-items: center; gap: 10px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.35);
        z-index: 9999; white-space: nowrap;
        animation: fadeInUp 0.3s ease;
    `;
    banner.innerHTML = `<i class="fas fa-hand-pointer" style="color:#f97316;font-size:1.1rem;"></i> ▶ 재생 버튼을 탭해 주세요`;

    // 재생 버튼 누르면 배너 자동 제거
    const removeBanner = () => { banner.remove(); };
    dom.btnPlay.addEventListener('touchstart', removeBanner, { once: true });
    dom.btnPlay.addEventListener('click', removeBanner, { once: true });
    // 5초 후 자동 사라짐
    setTimeout(removeBanner, 5000);

    document.body.appendChild(banner);
}

function resetAll() {
    if (state.animFrameId) { cancelAnimationFrame(state.animFrameId); state.animFrameId = null; }
    if (audioEngine.isPlaying) audioEngine.pause();

    // state 객체를 교체하지 않고 프로퍼티만 초기화 (참조 유지 → 진행 중인 분석이 isAnalyzing 체크 가능)
    state.file              = null;
    state.waveformData      = [];
    state.analysisData      = null;
    state.tabData           = null;
    state.bars              = null;
    state.bpm               = 120;
    state.key               = 'C Major';
    state.chords            = [];
    state.chordsOriginal    = [];
    state.transposeSemitones= 0;
    state.isAnalyzed        = false;
    state.isAnalyzing       = false;
    state.isPlaying         = false;
    state.manualChordEdits  = {};

    _lastScrollRow = -1; _lastBarIdx = -1;
    dom.uploadSection.classList.remove('hidden');
    if (dom.introSection) dom.introSection.classList.remove('hidden');
    dom.playerSection.classList.add('hidden');
    dom.tabSection.classList.add('hidden');
    dom.analysisBtnWrap.classList.remove('hidden');
    dom.analysisProgress.classList.add('hidden');
    dom.fileInput.value = '';
    // 분석 정보 칩 숨기기
    const cpbChips = document.getElementById('cpbInfoChips');
    if (cpbChips) cpbChips.style.display = 'none';
    resetProgressSteps();
}

// ==========================================
// 플레이어 컨트롤
// ==========================================
dom.btnPlay.addEventListener('click', togglePlay);

// iOS: touchstart에서 즉시 AudioContext resume + playAsync 호출
// e.preventDefault()로 300ms click 지연 제거 → 이중 호출 방지
dom.btnPlay.addEventListener('touchstart', (e) => {
    e.preventDefault();
    togglePlay();
}, { passive: false });

// 스페이스바로 재생/정지
document.addEventListener('keydown', (e) => {
    // input, textarea, select, button에 포커스 중이면 무시
    const tag = document.activeElement ? document.activeElement.tagName : '';
    const type = document.activeElement ? (document.activeElement.type || '') : '';
    // range(볼륨슬라이더), text, textarea, select는 무시
    if (tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (tag === 'INPUT' && type !== 'range') return;  // range는 허용 (볼륨 슬라이더)
    // range 슬라이더에 포커스 있을 때 스페이스는 페이지 스크롤이므로 막음
    if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (audioEngine.audioBuffer) {
            togglePlay();
        }
    }
});

function togglePlay() {
    // 연속 호출 방지 (touchstart + click 이중 발생 대비)
    const now = Date.now();
    if (togglePlay._lastCall && now - togglePlay._lastCall < 300) return;
    togglePlay._lastCall = now;

    if (!audioEngine.audioBuffer) return;

    if (audioEngine.isPlaying) {
        // ── 정지 ──
        audioEngine.pause();
        state.isPlaying = false;
        dom.playIcon.className = 'fas fa-play';
        dom.btnPlay.classList.remove('playing');
        if (state.animFrameId) { cancelAnimationFrame(state.animFrameId); state.animFrameId = null; }
    } else {
        // ── 재생 ──
        if (state.animFrameId) { cancelAnimationFrame(state.animFrameId); state.animFrameId = null; }

        // iOS/Safari: playAsync로 resume 완전 보장 후 재생
        if (_needsGesture) {
            audioEngine.playAsync().then(() => {
                if (audioEngine.isPlaying) {
                    state.isPlaying = true;
                    dom.playIcon.className = 'fas fa-pause';
                    dom.btnPlay.classList.add('playing');
                    startRenderLoop();
                } else {
                    // 재생 실패 → 사용자에게 안내
                    showToast('재생 버튼을 다시 탭해 주세요.', 'info');
                }
            }).catch((err) => {
                console.error('[togglePlay] playAsync 실패:', err);
                showToast('재생에 실패했습니다. 다시 탭해 주세요.', 'error');
            });
        } else {
            // 일반 브라우저: 기존 동기 방식
            const ctx = audioEngine.audioContext;
            const doPlay = () => {
                audioEngine.play();
                state.isPlaying = true;
                dom.playIcon.className = 'fas fa-pause';
                dom.btnPlay.classList.add('playing');
                startRenderLoop();
            };
            if (ctx && ctx.state === 'suspended') {
                ctx.resume().then(doPlay).catch(doPlay);
            } else {
                doPlay();
            }
        }
    }
}

audioEngine.onEnded = () => {
    state.isPlaying = false;
    dom.playIcon.className = 'fas fa-play';
    dom.btnPlay.classList.remove('playing');
    if (state.animFrameId) { cancelAnimationFrame(state.animFrameId); state.animFrameId = null; }
    _lastScrollRow = -1; _lastBarIdx = -1;
    drawWaveform(audioEngine.duration);
    if (state.isAnalyzed && tabRenderer) tabRenderer.updateTime(audioEngine.duration);
};

dom.progressBarWrap.addEventListener('click', (e) => {
    const rect  = dom.progressBarWrap.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const time  = ratio * audioEngine.duration;
    audioEngine.seek(time);
    updateProgressUI(time);
    if (state.isAnalyzed && dom.toggleSync.checked) scrollToCurrentBar(time);
});
// iOS 터치 시크 지원
dom.progressBarWrap.addEventListener('touchstart', (e) => {
    if (!audioEngine.audioBuffer) return;
    const touch = e.touches[0];
    const rect  = dom.progressBarWrap.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    const time  = ratio * audioEngine.duration;
    audioEngine.seek(time);
    updateProgressUI(time);
    if (state.isAnalyzed && dom.toggleSync.checked) scrollToCurrentBar(time);
}, { passive: true });

dom.waveformCanvas.addEventListener('click', (e) => {
    if (!audioEngine.audioBuffer) return;
    const rect  = dom.waveformCanvas.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const time  = ratio * audioEngine.duration;
    audioEngine.seek(time);
    updateProgressUI(time);
});
// iOS 터치 파형 시크 지원
dom.waveformCanvas.addEventListener('touchstart', (e) => {
    if (!audioEngine.audioBuffer) return;
    const touch = e.touches[0];
    const rect  = dom.waveformCanvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    const time  = ratio * audioEngine.duration;
    audioEngine.seek(time);
    updateProgressUI(time);
}, { passive: true });

dom.volumeSlider.addEventListener('input', (e) => {
    audioEngine.setVolume(parseFloat(e.target.value));
});
// iOS: 슬라이더 터치 시 AudioContext 깨우기
dom.volumeSlider.addEventListener('touchstart', () => {
    if (audioEngine.audioContext) {
        audioEngine._ensureContext().catch(() => {});
    }
}, { passive: true });

function updateProgressUI(currentTime) {
    const ratio = audioEngine.duration > 0 ? currentTime / audioEngine.duration : 0;
    dom.progressFill.style.width   = `${ratio * 100}%`;
    dom.progressThumb.style.left   = `${ratio * 100}%`;
    dom.timeCurrent.textContent    = formatTime(currentTime);
    drawWaveform(currentTime);
}

let wfRenderer = null;
function drawWaveform(currentTime) {
    if (!wfRenderer) wfRenderer = new TabRenderer(dom.waveformCanvas);
    wfRenderer.drawWaveform(dom.waveformCanvas, state.waveformData, currentTime, audioEngine.duration);
}

// ==========================================
// 실시간 렌더 루프
// ==========================================
let _lastScrollRow = -1;
let _lastBarIdx    = -1;
let _vizFrameSkip  = 0;

function startRenderLoop() {
    _lastScrollRow = -1;
    _lastBarIdx    = -1;
    _vizFrameSkip  = 0;

    function loop() {
        if (!state.isPlaying || !audioEngine.isPlaying) {
            state.animFrameId = null;
            return;
        }
        const currentTime = audioEngine.getCurrentTime();
        updateProgressUI(currentTime);

        _vizFrameSkip++;
        if (_vizFrameSkip >= 3) {
            _vizFrameSkip = 0;
            const freqData = audioEngine.getFrequencyData();
            if (tabRenderer) tabRenderer.drawVisualizer(dom.vizCanvas, freqData);
        }

        if (state.isAnalyzed && dom.toggleSync.checked && tabRenderer) {
            const barIdx = tabRenderer.getCurrentBarIndexByTime(currentTime);
            if (barIdx !== _lastBarIdx) {
                _lastBarIdx = barIdx;
                tabRenderer.updateTime(currentTime);
            } else {
                tabRenderer.updatePlayheadOnly(currentTime);
            }
            scrollToCurrentBar(currentTime);
            highlightCurrentChord(currentTime);
        }
        // 코드 박스 동기화 (항상 업데이트)
        if (state.isAnalyzed && _cbState.bars.length) {
            updateChordBoxByTime(currentTime);
        }
        state.animFrameId = requestAnimationFrame(loop);
    }
    state.animFrameId = requestAnimationFrame(loop);
}

function scrollToCurrentBar(currentTime) {
    if (!state.bars || !tabRenderer) return;
    if (!dom.toggleSync.checked) return;
    const barIdx = tabRenderer.getCurrentBarIndexByTime(currentTime);
    if (barIdx < 0) return;

    const container  = dom.tabScoreContainer;

    // ── SVG 렌더 기준 행 높이 계산 ──
    // tabRenderer.CFG 기반 (실제 SVG에서 사용하는 값과 동일)
    const z       = state.zoom;
    const CFG     = tabRenderer.CFG;
    const nStr    = tabRenderer.numStrings;  // 6 or 4
    const svgH    = Math.round((CFG.PAD_TOP + nStr * CFG.STRING_H + CFG.PAD_BOTTOM) * z);
    const rowH    = svgH + 24;   // margin-bottom:20 + padding-bottom:4

    // 실제 BARS_PER_ROW: 마지막 렌더에서 저장된 값 우선 사용 (가장 정확)
    const barsPerRow = tabRenderer._lastBarsPerRow || tabRenderer._calcBarsPerRow(z);
    const currentRow = Math.floor(barIdx / barsPerRow);

    if (currentRow === _lastScrollRow) return;
    _lastScrollRow = currentRow;

    // 첫 행은 위에서 바로 시작 → scrollTop 0
    const targetScrollTop = Math.max(0, currentRow * rowH - 16);
    container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
}

function highlightCurrentChord(currentTime) {
    const chords = state.chords;
    if (!chords || !chords.length) return;
    const current = chords.reduce((best, c) => (c.time <= currentTime ? c : best), chords[0]);
    document.querySelectorAll('.chord-diagram').forEach(el => {
        el.classList.remove('highlight');
        if (current?.chord?.name && el.dataset.chord === current.chord.name)
            el.classList.add('highlight');
    });
}

// ==========================================
// 분석 실행
// ==========================================
dom.btnAnalyze.addEventListener('click', startAnalysis);

async function startAnalysis() {
    if (!audioEngine.audioBuffer) return;
    if (state.isAnalyzing) return;  // 중복 실행 방지
    state.isAnalyzing = true;
    dom.analysisBtnWrap.classList.add('hidden');
    dom.analysisProgress.classList.remove('hidden');

    try {
        setStep(1, 'active');
        updateProgress(5, '음원 분석 중...');
        const analysisData = await audioEngine.analyzeFullBuffer((pct) => {
            updateProgress(5 + pct * 0.4, `음원 분석 중... ${Math.round(pct)}%`);
        });

        // 분석 중단 체크 ①
        if (!state.isAnalyzing) return;

        setStep(1, 'done'); setStep(2, 'active');
        updateProgress(45, '음정 감지 중...');
        await sleep(100);

        const range = pitchDetector.getInstrumentRange(state.currentInstrument);
        const noteSequence = [];
        for (let i = 0; i < analysisData.length; i++) {
            const frame = analysisData[i];
            const note  = pitchDetector.detectPitch(frame.fft, range.minFreq, range.maxFreq);
            // fft 데이터도 포함 → detectChords의 크로마 계산에 활용
            noteSequence.push({
                time: frame.time,
                note,
                rms:  frame.rms,
                fft:  frame.fft,            // ← 크로마 계산에 필수
                spectralFlux: frame.spectralFlux ?? 0,
            });
            if (i % 100 === 0) {
                updateProgress(45 + (i / analysisData.length) * 20, `음정 감지 중... ${Math.round(i / analysisData.length * 100)}%`);
                await sleep(0);
            }
        }

        // 분석 중단 체크 ②
        if (!state.isAnalyzing) return;

        setStep(2, 'done'); setStep(3, 'active');
        updateProgress(65, 'BPM 및 코드 분석 중...');
        await sleep(100);

        state.bpm = pitchDetector.estimateBPM(analysisData);

        // 윈도우 크기: hop 약 23ms 기준 → 프레임당 약 23ms
        // BPM 기반 동적 윈도우: 박자당 프레임 수 * 1.5
        const framesPerBeat   = Math.round((60 / state.bpm) / 0.023);
        const chordWindowSize = Math.max(8, Math.min(28, Math.round(framesPerBeat * 1.5)));

        // ── 1패스: 키 컨텍스트 없이 코드 감지 → 조성 추정 ──
        // (조성을 먼저 구하기 위해 빠른 1회 감지 수행)
        const chordSeqPass1 = pitchDetector.detectChords(noteSequence, chordWindowSize, state.bpm, null);
        const rawChordsPass1 = chordSeqPass1.filter(c => c.chord);

        // 조성 판별: 1패스 코드 목록 기반 → 키 컨텍스트 확보
        state.key = pitchDetector.detectKey(noteSequence, rawChordsPass1);

        // ── 2패스: 조성 컨텍스트 반영한 정밀 코드 감지 ──
        // (다이어토닉 보너스로 텐션코드 오인식 대폭 감소)
        const chordSeqRaw = pitchDetector.detectChords(noteSequence, chordWindowSize, state.bpm, state.key);

        // ── 3단계: 텐션 코드 → 단순형 자동 치환 ──
        // 9, 11, 13, m9, maj9, mmaj7 등 실제 악보에서 보기 어려운 코드를
        // 음향적으로 가장 가까운 기본형(7, m7, maj7, major, minor 등)으로 치환
        const chordSeqSimplified = pitchDetector.simplifyChordList(chordSeqRaw, state.currentInstrument);

        // ── 4단계: A — 인접 모호 코드 스냅 (C#→C 등) ──
        // 샵/플랫 루트 코드가 인접 자연음 코드로 배음 노이즈 오인식 교정
        // threshold=0.15: score < 0.85 인 코드를 자연음 루트로 스냅
        const chordSeqEnharmonic = pitchDetector.snapEnharmonic(chordSeqSimplified, state.key, 0.15);

        // ── 5단계: C — 조성 기반 다이어토닉 스냅 ──
        // 감지된 Key의 다이어토닉 7코드 범위 내로 비다이어토닉 코드 교체
        // snapStrength 'hard': 사실상 모든 비다이어토닉 코드 → 인접 다이어토닉 코드로 교체
        const chordSequence = pitchDetector.snapToDiatonic(chordSeqEnharmonic, state.key, 'hard');

        const rawChords = chordSequence.filter(c => c.chord);

        // 코드 정보를 noteSequence에 부착 — O(N) 투포인터 방식
        // chordSequence는 시간순 정렬되어 있으므로 포인터를 앞으로만 이동
        {
            let ci = 0;
            for (const item of noteSequence) {
                // item.time 이후의 다음 코드 경계로 포인터 전진
                while (ci + 1 < chordSequence.length &&
                       chordSequence[ci + 1].time <= item.time) {
                    ci++;
                }
                item.chord = chordSequence[ci]?.chord || null;
            }
        }

        // 원본 코드 저장 (전조 전)
        state.chordsOriginal    = rawChords;
        state.chords            = rawChords;
        state.transposeSemitones= 0;

        // 분석 중단 체크 ③
        if (!state.isAnalyzing) return;

        setStep(3, 'done'); setStep(4, 'active');
        updateProgress(80, '코드 악보 생성 중...');
        await sleep(100);

        // 타브 변환
        const tabData = tabConverter.convertToTab(noteSequence, state.currentInstrument, state.bpm);
        const bars    = tabConverter.groupIntoBars(tabData, state.bpm);
        state.tabData      = tabData;
        state.bars         = bars;
        state.analysisData = noteSequence;

        // 분석 도중 파일 변경됐으면 중단
        if (!state.isAnalyzing) return;

        updateProgress(95, '악보 렌더링 중...');
        await sleep(100);

        tabRenderer = new TabRenderer(dom.tabCanvas);
        tabRenderer.setData(tabData, bars, state.currentInstrument, state.bpm);

        // ── TAB 편집기 초기화 (분석 완료 후) ──
        if (!window.tabEditor) {
            window.tabEditor = new TabEditor(tabRenderer);
        } else {
            window.tabEditor.renderer = tabRenderer;
            window.tabEditor.active   = false;
        }
        initTabEditorUI();
        setStep(4, 'done');
        updateProgress(100, '완료!');
        await sleep(400);

        // 최종 완료 전에도 중단 여부 재확인
        if (!state.isAnalyzing) return;

        showResults();
        state.isAnalyzed  = true;
        state.isAnalyzing = false;

    } catch (err) {
        state.isAnalyzing = false;
        console.error('분석 오류:', err);
        showToast('분석 중 오류가 발생했습니다: ' + err.message, 'error');
        dom.analysisBtnWrap.classList.remove('hidden');
        dom.analysisProgress.classList.add('hidden');
        resetProgressSteps();
    }
}

// ==========================================
// 결과 표시
// ==========================================
function showResults() {
    dom.analysisProgress.classList.add('hidden');
    dom.tabSection.classList.remove('hidden');

    dom.bpmValue.textContent      = state.bpm;
    dom.keyValue.textContent      = state.key;
    dom.timeSignature.textContent = '4/4';

    // 분석 완료 → 플레이어 바 정보 칩 표시
    const cpbChips = document.getElementById('cpbInfoChips');
    if (cpbChips) cpbChips.style.display = 'flex';

    // ── 코드 박스 초기화 ──
    initChordBox();

    // 주요 코드 (빈도순 Top5)
    const chordCounts = {};
    state.chords.forEach(c => {
        if (c.chord?.name) chordCounts[c.chord.name] = (chordCounts[c.chord.name] || 0) + 1;
    });
    const topChords = Object.entries(chordCounts).sort((a,b) => b[1]-a[1]).slice(0,5).map(([n]) => n);
    dom.mainChords.textContent = topChords.length ? topChords.join(', ') : '분석 중';

    // 코드 다이어그램
    renderChordDiagrams(topChords);

    // 전조 패널 표시
    showTransposePanel();

    // 악기별 힌트 표시
    showInstrumentHint(state.currentInstrument);

    // 악보 3줄 높이 적용 (렌더 완료 후)
    setTimeout(applyTabScrollHeight, 500);

    // tabSection 표시 후 실제 너비로 재렌더링 (hidden 해제 후 clientWidth 정상화)
    setTimeout(() => {
        if (window.tabRenderer) {
            window.tabRenderer.render();
            if (window.tabEditor?.active) {
                window.tabEditor._buildOverlay();
            }
        }
        applyTabScrollHeight();
    }, 150);

    // 코드 클릭 편집 이벤트 바인딩
    setTimeout(bindChordClickEvents, 600);
}

// ==========================================
// 악기별 힌트 (instrument-hint 배너)
// ==========================================
const INSTRUMENT_HINTS = {
    acoustic: {
        icon: '🎸',
        title: '어쿠스틱 기타 — 기본 기타 코드폼',
        desc: '오픈 코드(0~5프렛) 위주의 기본 기타 코드폼으로 표시됩니다. ' +
              'C, G, Am, Dm 등 개방현이 포함된 코드 형태이며, ' +
              '바레코드(F, Bm 등)도 포함됩니다. 세븐스(Am7, G7), maj7(Cmaj7) 코드도 지원합니다.',
        color: '#e85d04',
        bg:    '#fff8f4',
        border:'#fcd9c0',
    },
    electric1: {
        icon: '⚡',
        title: '일렉기타 1 — 파워코드폼',
        desc: '파워코드(루트 + 5th, 2~3현)만 표시됩니다. 일렉 기타 리듬/리프 연주에 특화된 형태입니다. ' +
              '예) E5: E현0+A현2+D현2 / A5: A현0+D현2+G현2 ' +
              '(루트+5th 2현만 또는 루트+5th+옥타브 3현)',
        color: '#2563eb',
        bg:    '#eff6ff',
        border:'#bfdbfe',
    },
    electric2: {
        icon: '🔥',
        title: '일렉기타 2 — 트라이어드 코드폼',
        desc: '트라이어드(3음 구성) 코드폼으로 표시됩니다. G·B·e 3현만 사용하는 상위 포지션 폼입니다. ' +
              '세븐스(Am7, Dm7, G7), maj7(Cmaj7, Gmaj7)도 G·B·e 보이싱으로 지원합니다.',
        color: '#7c3aed',
        bg:    '#f5f3ff',
        border:'#ddd6fe',
    },
    bass: {
        icon: '🎵',
        title: '베이스 기타 — 베이스 코드폼',
        desc: '베이스 기타는 코드의 루트음만 단음으로 표시합니다. ' +
              'E현·A현 우선 배치 (0~7프렛), 필요 시 D현으로 전환합니다. ' +
              '한 번에 1현만 울리는 베이스라인 형태입니다.',
        color: '#16a34a',
        bg:    '#f0fdf4',
        border:'#bbf7d0',
    },
};

function showInstrumentHint(instrument) {
    // 악기 힌트 박스 삭제됨 — 표시하지 않음
    const oldHint = document.getElementById('instrumentHint');
    if (oldHint) oldHint.remove();
}

// ==========================================
// 파워코드 / 트라이어드 테이블 (preview.html과 동일)
// ==========================================
const POWER_TABLE = {
    'C' :{str:'A',fret:3},   'C#':{str:'A',fret:4},  'D' :{str:'A',fret:5},
    'D#':{str:'A',fret:6},   'Eb':{str:'A',fret:6},   'E' :{str:'E',fret:0,open:true},
    'F' :{str:'E',fret:1},   'F#':{str:'E',fret:2},   'G' :{str:'E',fret:3},
    'G#':{str:'E',fret:4},   'Ab':{str:'E',fret:4},   'A' :{str:'E',fret:5},
    'A#':{str:'E',fret:6},   'Bb':{str:'E',fret:6},   'B' :{str:'A',fret:2},
    'Am':{str:'E',fret:0,open:true,note:'Am5 = E현0+A현2'},
    'Em':{str:'E',fret:0,open:true},
    'Dm':{str:'A',fret:5},   'Fm':{str:'E',fret:1},   'Gm':{str:'E',fret:3},
    'Bm':{str:'A',fret:2},   'Cm':{str:'A',fret:3},
};
const TRIAD_TABLE = {
    'C' :{shape:'5-5-5',    note:'G현5 B현5 e현5'},
    'C#':{shape:'6-6-6',    note:'G현6 B현6 e현6'},
    'D' :{shape:'7-7-7',    note:'G현7 B현7 e현7'},
    'D#':{shape:'8-8-8',    note:'G현8 B현8 e현8'},
    'Eb':{shape:'8-8-8',    note:'G현8 B현8 e현8'},
    'E' :{shape:'9-9-9',    note:'또는 개방현 E폼'},
    'F' :{shape:'10-10-10', note:'G현10 B현10 e현10'},
    'F#':{shape:'11-11-11', note:'G현11 B현11 e현11'},
    'G' :{shape:'12-12-12', note:'또는 D현5 G현4 B현3'},
    'G#':{shape:'1-1-1',    note:'G현1 B현1 e현1(13프렛 동일)'},
    'Ab':{shape:'1-1-1',    note:'G현1 B현1 e현1'},
    'A' :{shape:'2-2-2',    note:'G현2 B현2 e현2'},
    'A#':{shape:'3-3-3',    note:'G현3 B현3 e현3'},
    'Bb':{shape:'3-3-3',    note:'G현3 B현3 e현3'},
    'B' :{shape:'4-4-4',    note:'G현4 B현4 e현4'},
    'Am':{shape:'2-1-0',    note:'G현2 B현1 e개방 (Am 트라이어드)'},
    'Em':{shape:'0-0-0',    note:'전부 개방 (Em 트라이어드)'},
    'Dm':{shape:'7-6-5',    note:'G현7 B현6 e현5'},
    'Fm':{shape:'10-10-9',  note:'G현10 B현10 e현9'},
    'Gm':{shape:'12-11-10', note:'G현12 B현11 e현10'},
    'Bm':{shape:'4-3-2',    note:'G현4 B현3 e현2'},
    'Cm':{shape:'5-4-3',    note:'G현5 B현4 e현3'},
};

// ==========================================
// 코드 다이어그램 렌더링
// ==========================================
function renderChordDiagrams(chords) {
    dom.chordDiagrams.innerHTML = '';
    if (!chords || !chords.length) {
        dom.chordDiagrams.innerHTML = '<p style="color:#94a3b8;font-size:0.82rem;padding:16px 4px;">감지된 코드가 없습니다.</p>';
        _renderBeginnerGuide([]);
        return;
    }
    if (!tabRenderer) tabRenderer = new TabRenderer(dom.tabCanvas);

    chords.forEach(chordName => {
        if (!chordName) return;
        const diagramData = tabConverter.generateChordDiagram(chordName, state.currentInstrument);

        const wrapper        = document.createElement('div');
        wrapper.className    = 'chord-diagram';
        wrapper.dataset.chord= chordName;

        // 캔버스 (현 이름 레이블 공간 확보로 높이 늘림)
        const canvas   = document.createElement('canvas');
        canvas.width   = 100;
        canvas.height  = 136;
        wrapper.appendChild(canvas);

        // 코드 이름
        const label      = document.createElement('div');
        label.className  = 'chord-name';
        label.textContent = chordName;
        wrapper.appendChild(label);

        // 코드 타입 뱃지 (악기별 폼 안내)
        const typeBadge    = document.createElement('div');
        typeBadge.className= 'chord-type-badge';
        const formLabels = {
            acoustic : '기본코드폼',
            electric1: '파워코드폼',
            electric2: '트라이어드',
            bass     : '베이스폼',
        };
        typeBadge.textContent = formLabels[state.currentInstrument] || '';
        wrapper.appendChild(typeBadge);

        dom.chordDiagrams.appendChild(wrapper);
        tabRenderer.drawChordDiagram(canvas, diagramData, chordName);
    });

    // 일렉 기타 초보자 코드 가이드 렌더
    _renderBeginnerGuide(chords);
}

// ==========================================
// 일렉 기타 초보자 코드 가이드 (preview.html과 동일)
// ==========================================
/* ─────────────────────────────────────────────────────────
   SVG 코드 다이어그램 — 세로형 표준 코드표
   strings 배열: [E(idx0,6번현), A, D, G, B, e(idx5,1번현)]
   왼쪽=E(6번,두꺼운) / 오른쪽=e(1번,얇은)
   개방○/뮤트× = 너트 위 상단 배치
───────────────────────────────────────────────────────── */
function _drawChordDiagramSVG(cd) {
    if (!cd) return '<div style="color:#bbb;text-align:center;padding:10px;">—</div>';

    const W=80, H=104, FRETS=5;
    const ns=(cd.strings||[]).length || 6;
    const strNames = ns===4 ? ['E','A','D','G'] : ['E','A','D','G','B','e'];

    const padL=10, padR=8, padT=28, padB=6;
    const gridW=W-padL-padR, gridH=H-padT-padB;
    const FW=gridW/(ns-1), FH=gridH/FRETS;

    // baseFret 계산
    const frettedNotes=(cd.strings||[]).filter(f=>f!==null&&f>0);
    let startFret=1;
    if(cd.barre&&cd.barre.fret>1) startFret=cd.barre.fret;
    else if(frettedNotes.length){ const m=Math.min(...frettedNotes); if(m>3) startFret=m; }

    const p=[`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`];

    // 현 이름 레이블 (최상단)
    strNames.forEach((n,i)=>{
        const x=padL+i*FW;
        p.push(`<text x="${x}" y="9" font-size="7" font-family="monospace" fill="${i===0?'#7a6040':'#9298b0'}" text-anchor="middle" font-weight="${i===0?'bold':'normal'}">${n}</text>`);
    });

    // 개방○ / 뮤트× (현이름 아래, 너트 위)
    (cd.strings||[]).forEach((fret,i)=>{
        const x=padL+i*FW, oy=padT-9;
        if(fret===null){
            p.push(`<line x1="${x-3.5}" y1="${oy-3.5}" x2="${x+3.5}" y2="${oy+3.5}" stroke="#b0b8cc" stroke-width="1.5"/>`);
            p.push(`<line x1="${x+3.5}" y1="${oy-3.5}" x2="${x-3.5}" y2="${oy+3.5}" stroke="#b0b8cc" stroke-width="1.5"/>`);
        } else if(fret===0){
            p.push(`<circle cx="${x}" cy="${oy}" r="4" fill="none" stroke="#2a3a5a" stroke-width="1.6"/>`);
        }
    });

    // 너트 또는 프렛번호
    if(startFret===1){
        p.push(`<rect x="${padL-1}" y="${padT-3}" width="${gridW+2}" height="4" fill="#1e2a45" rx="1"/>`);
    } else {
        p.push(`<line x1="${padL}" y1="${padT}" x2="${padL+gridW}" y2="${padT}" stroke="#aaa" stroke-width="1"/>`);
        p.push(`<text x="${padL+gridW+4}" y="${padT+FH*0.6}" font-size="7.5" font-family="monospace" fill="#555" text-anchor="start">${startFret}fr</text>`);
    }

    // 프렛 가로선
    for(let f=1;f<=FRETS;f++){
        const y=padT+f*FH;
        p.push(`<line x1="${padL}" y1="${y}" x2="${padL+gridW}" y2="${y}" stroke="#cdd1dc" stroke-width="0.7"/>`);
    }

    // 현 세로선 (i=0 E=가장 두꺼움)
    for(let i=0;i<ns;i++){
        const x=padL+i*FW;
        const sw=(0.55+(ns-1-i)*0.18).toFixed(2);
        p.push(`<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT+gridH}" stroke="#9298b8" stroke-width="${sw}"/>`);
    }

    // 바레
    if(cd.barre){
        const b=cd.barre;
        const relF=b.fret-startFret+1;
        if(relF>=1&&relF<=FRETS){
            const fy=padT+(relF-0.5)*FH;
            const fromI=b.from!==undefined?b.from:0;
            const x1=padL+fromI*FW-4, x2=padL+gridW+4;
            p.push(`<rect x="${x1}" y="${fy-5}" width="${x2-x1}" height="10" rx="5" fill="#1e2a45" opacity="0.85"/>`);
        }
    }

    // 손가락 점
    (cd.strings||[]).forEach((fret,i)=>{
        if(fret===null||fret===0) return;
        const relF=fret-startFret+1;
        if(relF<1||relF>FRETS) return;
        const x=padL+i*FW, y=padT+(relF-0.5)*FH;
        p.push(`<circle cx="${x}" cy="${y}" r="5" fill="#1e2a45"/>`);
    });

    p.push('</svg>');
    return p.join('');
}

/* ─────────────────────────────────────────────────────────
   SVG 파워코드 다이어그램 — 세로형 표준 코드표
   si=줄번호(6=E,5=A,4=D,3=G,2=B,1=e)
   col 공식: col = STRINGS - si  (si=6→col=0=왼쪽 ✓)
───────────────────────────────────────────────────────── */
function _drawPowerChordSVG(name, pwr) {
    const W=80, H=104, FRETS=4, STRINGS=6;
    const padL=10, padR=8, padT=28, padB=6;
    const gridW=W-padL-padR, gridH=H-padT-padB;
    const FW=gridW/(STRINGS-1), FH=gridH/FRETS;

    const startFret=pwr.open?1:Math.max(1,pwr.fret-1);

    // notes: {si: 줄번호(6=E~1=e), f: 프렛}
    const notes=[];
    if(!pwr.open){
        if(pwr.str==='E'){
            notes.push({si:6,f:pwr.fret},{si:5,f:pwr.fret+2},{si:4,f:pwr.fret+2});
        } else {
            notes.push({si:5,f:pwr.fret},{si:4,f:pwr.fret+2});
        }
    } else {
        if(name==='E'||name==='Em') notes.push({si:6,f:0},{si:5,f:2},{si:4,f:2});
        else notes.push({si:5,f:0},{si:4,f:2},{si:3,f:2});
    }

    const p=[`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`];
    const strNames=['E','A','D','G','B','e'];

    // 현 이름 레이블 (i=0→왼쪽=E)
    strNames.forEach((n,i)=>{
        const x=padL+i*FW;
        p.push(`<text x="${x}" y="9" font-size="7" font-family="monospace" fill="${i===0?'#7a6040':'#9298b0'}" text-anchor="middle" font-weight="${i===0?'bold':'normal'}">${n}</text>`);
    });

    // 개방○ / 뮤트× (너트 위)
    const activeSet=new Set(notes.map(n=>n.si));
    for(let si=6;si>=1;si--){
        const col=STRINGS-si; // si=6→col=0(왼쪽), si=1→col=5(오른쪽)
        const x=padL+col*FW, oy=padT-9;
        if(!activeSet.has(si)){
            // 파워코드에서 사용 안 하는 현은 ×
            p.push(`<line x1="${x-3.5}" y1="${oy-3.5}" x2="${x+3.5}" y2="${oy+3.5}" stroke="#ccc" stroke-width="1.5"/>`);
            p.push(`<line x1="${x+3.5}" y1="${oy-3.5}" x2="${x-3.5}" y2="${oy+3.5}" stroke="#ccc" stroke-width="1.5"/>`);
        } else {
            const note=notes.find(n=>n.si===si);
            if(note&&note.f===0){
                p.push(`<circle cx="${x}" cy="${oy}" r="4" fill="none" stroke="#2a3a5a" stroke-width="1.6"/>`);
            }
        }
    }

    // 너트
    if(startFret===1){
        p.push(`<rect x="${padL-1}" y="${padT-3}" width="${gridW+2}" height="4" fill="#1e2a45" rx="1"/>`);
    } else {
        p.push(`<line x1="${padL}" y1="${padT}" x2="${padL+gridW}" y2="${padT}" stroke="#aaa" stroke-width="1"/>`);
        p.push(`<text x="${padL+gridW+4}" y="${padT+FH*0.6}" font-size="7.5" font-family="monospace" fill="#555" text-anchor="start">${startFret}fr</text>`);
    }

    // 프렛 가로선
    for(let f=1;f<=FRETS;f++){
        const y=padT+f*FH;
        p.push(`<line x1="${padL}" y1="${y}" x2="${padL+gridW}" y2="${y}" stroke="#ddd" stroke-width="0.7"/>`);
    }

    // 현 세로선
    for(let i=0;i<STRINGS;i++){
        const x=padL+i*FW;
        const sw=(0.55+(STRINGS-1-i)*0.18).toFixed(2);
        p.push(`<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT+gridH}" stroke="#aaa" stroke-width="${sw}"/>`);
    }

    // 손가락 점: si=6→col=0(왼쪽)
    notes.forEach((n,idx)=>{
        if(n.f===0) return; // 개방현은 위에 ○으로 처리
        const col=STRINGS-n.si;
        const x=padL+col*FW;
        const fy=padT+(n.f-startFret)*FH+FH/2;
        const fill=idx===0?'#c44400':'#1e2a45'; // 루트=빨강
        p.push(`<circle cx="${x}" cy="${fy}" r="5" fill="${fill}"/>`);
    });

    p.push('</svg>');
    return p.join('');
}

// ==========================================
// 베이스 코드 포지션 가이드 테이블
// E현(4현), A현(3현), D현(2현) 기준 루트 위치
// ==========================================
const BASS_POSITION_TABLE = {
    'E' : [{str:'E', fret:0,  open:true}, {str:'A', fret:7}],
    'F' : [{str:'E', fret:1}, {str:'A', fret:8}],
    'F#': [{str:'E', fret:2}, {str:'A', fret:9}],
    'Gb': [{str:'E', fret:2}, {str:'A', fret:9}],
    'G' : [{str:'E', fret:3}, {str:'A', fret:10}],
    'G#': [{str:'E', fret:4}, {str:'A', fret:11}],
    'Ab': [{str:'E', fret:4}, {str:'A', fret:11}],
    'A' : [{str:'E', fret:5}, {str:'A', fret:0, open:true}],
    'A#': [{str:'E', fret:6}, {str:'A', fret:1}],
    'Bb': [{str:'E', fret:6}, {str:'A', fret:1}],
    'B' : [{str:'E', fret:7}, {str:'A', fret:2}],
    'C' : [{str:'A', fret:3}, {str:'D', fret:10}],
    'C#': [{str:'A', fret:4}, {str:'D', fret:11}],
    'Db': [{str:'A', fret:4}, {str:'D', fret:11}],
    'D' : [{str:'A', fret:5}, {str:'D', fret:0, open:true}],
    'D#': [{str:'A', fret:6}, {str:'D', fret:1}],
    'Eb': [{str:'A', fret:6}, {str:'D', fret:1}],
};

function _getBassPositionText(chordName) {
    const rootMatch = chordName.match(/^([A-G][#b]?)/);
    if (!rootMatch) return null;
    const root = rootMatch[1];
    const positions = BASS_POSITION_TABLE[root];
    if (!positions) return null;
    return positions.map(p =>
        p.open
            ? `<span class="bass-pos bass-pos--open">${p.str}현 개방(0프렛)</span>`
            : `<span class="bass-pos">${p.str}현 ${p.fret}프렛</span>`
    ).join(' <span class="bass-pos-sep">또는</span> ');
}

function _drawBassPosNeckSVG(chordName) {
    const rootMatch = chordName.match(/^([A-G][#b]?)/);
    if (!rootMatch) return '';
    const root = rootMatch[1];
    const positions = BASS_POSITION_TABLE[root];
    if (!positions) return '';

    // 베이스 4현 지판 미니 SVG
    // 표준: 왼쪽=4번줄(E,두꺼운) / 오른쪽=1번줄(G,얇은)
    const W = 90, H = 80, FRETS = 5, STRINGS = 4;
    const L = 18, T = 22, FW = (W - L - 8) / (STRINGS - 1), FH = (H - T - 8) / FRETS;
    // 왼쪽→오른쪽 순서: E(4번,두꺼운), A(3번), D(2번), G(1번,얇은)
    const strNames = ['E','A','D','G'];
    // strIdx: 현 이름 → 열 번호 (0=왼쪽=E)
    const strIdx   = { E:0, A:1, D:2, G:3 };

    // 첫 포지션 기준으로 시작 프렛 계산
    const firstFret = positions[0].fret || 0;
    const startFret = (firstFret > 2 && !positions[0].open) ? firstFret - 1 : 1;

    const p = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`];
    // 현 이름 레이블 (왼쪽=E, 오른쪽=G)
    strNames.forEach((n, i) => {
        const x = L + i * FW;
        p.push(`<text x="${x}" y="${T - 9}" font-size="7.5" font-family="monospace" fill="${i===0?'#8b7355':'#aaa'}" text-anchor="middle" font-weight="${i===0?'bold':'normal'}">${n}</text>`);
    });
    if (startFret > 1) {
        p.push(`<text x="${L - 3}" y="${T + FH * 0.7}" font-size="7" font-family="monospace" fill="#666" text-anchor="end">${startFret}</text>`);
    }
    // 너트/상단 라인
    p.push(`<line x1="${L}" y1="${T}" x2="${L + FW * (STRINGS - 1)}" y2="${T}" stroke="#333" stroke-width="${startFret === 1 ? 2.5 : 1}"/>`);
    // 프렛 선
    for (let f = 1; f <= FRETS; f++) {
        const y = T + f * FH;
        p.push(`<line x1="${L}" y1="${y}" x2="${L + FW * (STRINGS - 1)}" y2="${y}" stroke="#ccc" stroke-width="0.7"/>`);
    }
    // 현 선 (왼쪽 i=0이 E=4번현 → 두껍게)
    for (let i = 0; i < STRINGS; i++) {
        const x = L + i * FW;
        const sw = 0.6 + (STRINGS - 1 - i) * 0.3;  // i=0(E)가 가장 두꺼움
        p.push(`<line x1="${x}" y1="${T}" x2="${x}" y2="${T + FRETS * FH}" stroke="#bbb" stroke-width="${sw.toFixed(2)}"/>`);
    }
    // 포지션 점 표시
    positions.forEach((pos, idx) => {
        const col = strIdx[pos.str];
        if (col === undefined) return;
        const x = L + col * FW;
        const fill = idx === 0 ? '#c44400' : '#3b82f6';
        if (pos.open || pos.fret === 0) {
            p.push(`<circle cx="${x}" cy="${T - 7}" r="4" fill="none" stroke="${fill}" stroke-width="1.5"/>`);
        } else {
            const relFret = pos.fret - startFret;
            if (relFret >= 0 && relFret < FRETS) {
                const y = T + relFret * FH + FH / 2;
                p.push(`<circle cx="${x}" cy="${y}" r="5" fill="${fill}"/>`);
            }
        }
    });
    p.push('</svg>');
    return p.join('');
}

function _renderBeginnerGuide(chords) {
    // 기존 가이드 제거
    const old = document.getElementById('beginnerGuideSection');
    if (old) old.remove();

    const isBass = state.currentInstrument === 'bass';

    const guideEl = document.createElement('div');
    guideEl.id = 'beginnerGuideSection';
    guideEl.className = 'beginner-guide-section';

    // ──────────────────────────────────────────
    // 베이스 전용 가이드
    // ──────────────────────────────────────────
    if (isBass) {
        const baseCodes = ['E','A','D','G','C','F','B','Am','Em','Dm'];
        const guideChords = [...new Set([...(chords.length ? chords : []), ...baseCodes])].slice(0, 10);

        let bassCards = '';
        guideChords.forEach(name => {
            const rootMatch = name.match(/^([A-G][#b]?)/);
            const root = rootMatch ? rootMatch[1] : name;
            const posText = _getBassPositionText(name);
            const neckSvg = _drawBassPosNeckSVG(name);
            const positions = BASS_POSITION_TABLE[root] || [];
            const mainPos = positions[0];
            const posDesc = mainPos
                ? (mainPos.open ? `${mainPos.str}현 개방현` : `${mainPos.str}현 ${mainPos.fret}프렛`)
                : '—';

            bassCards += `
            <div class="gc-card gc-card--bass">
              <div class="gc-top">
                <div class="gc-name">${name}</div>
                <div class="gc-bass-neck">${neckSvg}</div>
              </div>
              <div class="gc-bass-pos-wrap">
                <div class="gc-bass-pos-label">🎯 루트음 위치</div>
                <div class="gc-bass-pos-text">${posText || '<span style="color:#aaa">—</span>'}</div>
                <div class="gc-bass-main-pos">주 위치: <strong>${posDesc}</strong></div>
              </div>
              <div class="gc-bass-tip">
                💡 <strong>${name}</strong> — 루트음만 단음으로. 리듬에 맞게 정확하게!
              </div>
            </div>`;
        });

        guideEl.innerHTML = `
        <div class="guide-section guide-section--bass">
          <div class="guide-header">
            <span class="guide-icon">🎵</span>
            <div>
              <div class="guide-title">베이스 기타 연주 가이드</div>
              <div class="guide-sub">코드별 루트음 위치 &amp; 베이스라인 연주 팁</div>
            </div>
          </div>
          <div class="guide-cards">${bassCards}</div>
          <div class="guide-tips guide-tips--bass">
            <div class="guide-tips-title">🎓 베이스 초보자 연주 포인트</div>
            <div class="guide-tips-list">
              <div class="guide-tip-item"><span class="tip-num tip-num--bass">1</span><div><strong>루트음만 연주</strong> — 베이스는 코드 전체가 아닌 루트(근음) 한 음만 짚습니다. 위 지판에서 빨간 점이 루트음입니다.</div></div>
              <div class="guide-tip-item"><span class="tip-num tip-num--bass">2</span><div><strong>E현·A현 우선</strong> — 대부분의 루트음은 4현(E)과 3현(A)에서 찾을 수 있습니다. 0~7프렛 범위를 먼저 익히세요.</div></div>
              <div class="guide-tip-item"><span class="tip-num tip-num--bass">3</span><div><strong>옥타브 활용</strong> — 같은 음이 다른 현에도 있습니다 (파란 점). E현의 음은 A현에서 2프렛 위, A현의 음은 D현에서 2프렛 위에 있어요.</div></div>
              <div class="guide-tip-item"><span class="tip-num tip-num--bass">4</span><div><strong>타이밍이 핵심</strong> — 드럼의 킥(베이스 드럼)과 함께 연주하세요. 음정보다 리듬 정확성이 베이스에서 더 중요합니다.</div></div>
              <div class="guide-tip-item"><span class="tip-num tip-num--bass">5</span><div><strong>타브 읽는 법</strong> — 위 줄 = 1현(G, 가장 높은 음), 아래 줄 = 4현(E, 가장 낮은 음). 숫자 = 프렛 번호입니다.</div></div>
            </div>
          </div>
        </div>`;

    } else {
        // ──────────────────────────────────────────
        // 일렉 기타 초보자 코드 가이드 (기존 로직)
        // ──────────────────────────────────────────
        const baseCodes  = ['Am','Em','C','G','D','F'];
        const guideChords = [...new Set([...( chords.length ? chords : []), ...baseCodes])].slice(0, 8);

        const diagramDataList = guideChords.map(name => {
            // slash chord 처리: "G/B" → 루트 "G"로 다이어그램, 이름은 유지
            const displayName = name;
            const lookupName  = name.includes('/') ? name.split('/')[0] : name;
            const raw = tabConverter.generateChordDiagram(name, 'acoustic')
                     || tabConverter.generateChordDiagram(lookupName, 'acoustic');
            return { name: displayName, raw };
        });

        let cards = '';
        diagramDataList.forEach(({ name, raw }) => {
            const rootMatch = name.match(/^([A-G][#b]?)/);
            const root = rootMatch ? rootMatch[1] : name;
            const isSlashChord = name.includes('/');
            const bassNote = isSlashChord ? name.split('/')[1] : null;
            // slash chord는 루트 기반으로 파워코드/트라이어드 조회
            const lookupRoot = isSlashChord ? name.split('/')[0].replace(/m$/, '') : root;
            let pwrKey = isSlashChord ? lookupRoot : name;
            let triKey = isSlashChord ? lookupRoot : name;
            const pwr = POWER_TABLE[pwrKey] || POWER_TABLE[root];
            const tri = TRIAD_TABLE[triKey] || TRIAD_TABLE[root];

            const openSvg = _drawChordDiagramSVG(raw);
            // slash chord 추가 안내 배지
            const slashBadge = isSlashChord
                ? `<div style="display:inline-block;background:#ccfbf1;color:#0f766e;border:1px solid #99f6e4;border-radius:4px;font-size:0.72rem;padding:2px 7px;margin-top:4px;">전위코드 / 베이스음: ${bassNote}</div>`
                : '';
            cards += `
            <div class="gc-card">
              <div class="gc-top">
                <div class="gc-name" style="${isSlashChord ? 'color:#0d9488;' : ''}">${name}</div>
                ${slashBadge}
                <div class="gc-diagram">${openSvg}</div>
                <div class="gc-open-label">${isSlashChord ? `전위코드 폼 (베이스: ${bassNote})` : '오픈 코드'}</div>
              </div>
              <div class="gc-form gc-form--power">
                <div class="gc-form-title"><span class="gc-badge gc-badge--power">⚡파워코드</span></div>
                ${pwr
                  ? `<div class="gc-pow-diagram">${_drawPowerChordSVG(name, pwr)}</div>
                     <div class="gc-form-desc">
                       ${pwr.open ? `<strong>${lookupRoot}5</strong> 개방 파워코드` : `<strong>${lookupRoot}5</strong> — ${pwr.str}현 ${pwr.fret}프렛`}
                       <br><span class="gc-tip">💡 루트(●빨강)+5음(●검정) 두 손가락만!</span>
                     </div>`
                  : `<div class="gc-na">—</div>`}
              </div>
              <div class="gc-form gc-form--triad">
                <div class="gc-form-title"><span class="gc-badge gc-badge--triad">🔺트라이어드</span></div>
                ${tri
                  ? `<div class="gc-triad-shape">${tri.shape.replace(/-/g,' — ')}</div>
                     <div class="gc-form-desc">
                       G · B · e 세 현<br>${tri.note}
                       <br><span class="gc-tip">💡 3현 묶음 — 솔로 중 코드 삽입에 유용!</span>
                     </div>`
                  : `<div class="gc-na">—</div>`}
              </div>
            </div>`;
        });

        guideEl.innerHTML = `
        <div class="guide-section">
          <div class="guide-header">
            <span class="guide-icon">🎸</span>
            <div>
              <div class="guide-title">기타 초보자 코드 가이드</div>
              <div class="guide-sub">감지된 코드를 일렉 기타로 치는 3가지 방법</div>
            </div>
          </div>
          <div class="guide-cards">${cards}</div>
          <div class="guide-tips">
            <div class="guide-tips-title">🎓 초보자 연주 포인트</div>
            <div class="guide-tips-list">
              <div class="guide-tip-item"><span class="tip-num">1</span><div><strong>파워코드부터 시작</strong> — 검지로 루트음, 약지로 5음. 2~3개 현만 울립니다.</div></div>
              <div class="guide-tip-item"><span class="tip-num">2</span><div><strong>트라이어드로 발전</strong> — G·B·e 3현 폼을 외우면 넥 전체에서 코드 위치를 찾을 수 있어요.</div></div>
              <div class="guide-tip-item"><span class="tip-num">3</span><div><strong>타브 읽는 법</strong> — 위 줄 = 1번 현(가는 e), 아래 줄 = 6번 현(굵은 E). 숫자 = 프렛 번호입니다.</div></div>
              <div class="guide-tip-item"><span class="tip-num">4</span><div><strong>음표 기둥 읽는 법</strong> — 숫자 위의 기둥/꼬리가 음표 길이입니다. 꼬리 없음=4분, 꼬리 1개=8분, 꼬리 2개=16분.</div></div>
            </div>
          </div>
        </div>`;
    }

    // chordSection 뒤에 삽입
    const chordSection = document.getElementById('chordSection');
    if (chordSection && chordSection.parentNode) {
        chordSection.parentNode.insertBefore(guideEl, chordSection.nextSibling);
    } else {
        dom.tabSection.appendChild(guideEl);
    }
}

// ==========================================
// 전조 패널
// ==========================================
// 12음 목록 (메이저 + 마이너)
const ALL_NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const MAJOR_CHORDS = ALL_NOTES;
const MINOR_CHORDS = ALL_NOTES.map(n => n+'m');

function showTransposePanel() {
    if (!state.chords.length) return;
    dom.transposePanel.classList.remove('hidden');

    // 현재 첫 번째 코드 표시
    const firstChord = state.chords.find(c => c.chord)?.chord?.name || '—';
    dom.tcCurrentChord.textContent = firstChord;

    // 코드 선택 버튼 그리드 생성
    buildTransposeChordGrid(firstChord);
}

function buildTransposeChordGrid(currentFirstChord) {
    dom.tcChordGrid.innerHTML = '';

    // 현재 첫 코드의 타입 파악 (major/minor/power)
    const isMinor  = currentFirstChord.endsWith('m') && !currentFirstChord.endsWith('dim');
    const isPower  = currentFirstChord.endsWith('5');
    const chordList = isPower  ? ALL_NOTES.map(n => n+'5') :
                      isMinor  ? MINOR_CHORDS : MAJOR_CHORDS;

    chordList.forEach(chName => {
        const btn       = document.createElement('button');
        btn.className   = 'btn-tc-chord' + (chName.endsWith('m') ? ' minor-chord' : '');
        btn.textContent = chName;
        if (chName === currentFirstChord) btn.classList.add('selected');

        btn.addEventListener('click', () => {
            applyTransposeToChord(chName);
            // 선택 상태 업데이트
            dom.tcChordGrid.querySelectorAll('.btn-tc-chord').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
        dom.tcChordGrid.appendChild(btn);
    });
}

function applyTransposeToChord(targetChordName) {
    // 원본 첫 코드 루트 구하기
    const origFirst = state.chordsOriginal.find(c => c.chord)?.chord;
    if (!origFirst) return;

    const origRootName = origFirst.root;
    const origRootIdx  = ALL_NOTES.indexOf(origRootName);
    if (origRootIdx < 0) return;

    // 목표 코드 루트 구하기
    const targetRoot    = targetChordName.replace(/m$|5$/,'');
    const targetRootIdx = ALL_NOTES.indexOf(targetRoot);
    if (targetRootIdx < 0) {
        showToast(`인식할 수 없는 코드: ${targetChordName}`, 'error');
        return;
    }

    // 반음 차이 계산
    let semitones = (targetRootIdx - origRootIdx + 12) % 12;
    // 더 짧은 방향 선택 (-6~+6)
    if (semitones > 6) semitones -= 12;

    applyTranspose(semitones);
}

function applyTranspose(semitones) {
    if (semitones === state.transposeSemitones) return;

    state.transposeSemitones = semitones;

    // 원본 코드를 기준으로 전조
    const transposed = tabConverter.transposeChords(state.chordsOriginal, semitones);
    state.chords     = transposed;

    // noteSequence의 chord 정보도 업데이트
    if (state.analysisData) {
        state.analysisData.forEach(item => {
            if (item.chord) {
                item.chord = tabConverter._transposeChord(item.chord, semitones);
            }
        });
    }

    // ── 수동 편집 코드도 전조 반영 (protected 마디는 전조 후에도 유지) ──
    if (state.manualChordEdits) {
        Object.entries(state.manualChordEdits).forEach(([bi, edit]) => {
            if (edit.chord && !edit.chord._transposeBase) {
                // 최초 전조 시 원본 코드 저장
                edit.chord._transposeBase = { ...edit.chord };
            }
            if (edit.chord?._transposeBase) {
                const base = edit.chord._transposeBase;
                const transposedChord = tabConverter._transposeChord(base, semitones);
                edit.chord = { ...transposedChord, _manual: true, _transposeBase: base };
            }
        });
    }

    // key 표시 업데이트
    const newKey = tabConverter.transposeKey(
        state.key.replace(/\+\d+반음.*$/, '').trim(),
        semitones - (state.transposeSemitones - semitones) // 원본 기준
    );
    // 원본 key에서 semitones 적용
    const origKeyTransposed = transposeKeyFromOriginal(semitones);
    dom.keyValue.textContent = origKeyTransposed;

    // 전조 뱃지 업데이트
    if (semitones === 0) {
        dom.transposeBadge.style.display = 'none';
    } else {
        dom.transposeBadge.style.display = 'inline-flex';
        dom.transposeBadgeText.textContent = `${semitones > 0 ? '+' : ''}${semitones}반음`;
    }

    // 첫 코드 표시 업데이트
    const newFirstChord = state.chords.find(c => c.chord)?.chord?.name || '—';
    dom.tcCurrentChord.textContent = newFirstChord;

    // 타브 재생성 (코드 다이어그램은 아래에서 별도 갱신)
    reRenderTab(true);

    // 코드 다이어그램 재생성
    const chordCounts = {};
    state.chords.forEach(c => {
        if (c.chord?.name) chordCounts[c.chord.name] = (chordCounts[c.chord.name] || 0) + 1;
    });
    const topChords = Object.entries(chordCounts).sort((a,b) => b[1]-a[1]).slice(0,5).map(([n]) => n);
    dom.mainChords.textContent = topChords.join(', ');
    renderChordDiagrams(topChords);

    showToast(`전조 완료: ${semitones > 0 ? '+' : ''}${semitones}반음`, 'success');

    // 코드 박스 동기화
    setTimeout(refreshChordBoxAfterTranspose, 200);
}

// 원본 key에서 semitones 반음 이동
function transposeKeyFromOriginal(semitones) {
    const origKey = state.key;
    const m       = origKey.match(/^([A-G][#b]?)\s*(Major|Minor)$/i);
    if (!m) return origKey + (semitones !== 0 ? ` (+${semitones}반음)` : '');
    const rootIdx    = ALL_NOTES.findIndex(n => n === m[1].replace('b','#'));
    const noteIdx    = ALL_NOTES.indexOf(m[1]);
    const base       = noteIdx >= 0 ? noteIdx : (rootIdx >= 0 ? rootIdx : 0);
    const newBase    = ((base + semitones) % 12 + 12) % 12;
    return `${ALL_NOTES[newBase]} ${m[2]}`;
}

// 타브 재렌더 (전조/악기 변경/수동편집 공통)
// skipDiagram=true이면 코드 다이어그램/초보자 가이드 갱신 생략 (호출자가 직접 처리)
function reRenderTab(skipDiagram = false) {
    if (!state.analysisData) return;
    const tabData = tabConverter.convertToTab(state.analysisData, state.currentInstrument, state.bpm);
    const bars    = tabConverter.groupIntoBars(tabData, state.bpm);

    // ── 수동 편집 코드 보존: _manual 플래그가 있는 마디는 건드리지 않음 ──
    // v4.3: tabData.strings(프렛폼)도 새 코드로 재생성
    applyManualEditsToTabData(tabData, bars);

    state.tabData = tabData;
    state.bars    = bars;
    if (!tabRenderer) tabRenderer = new TabRenderer(dom.tabCanvas);
    tabRenderer.setData(tabData, bars, state.currentInstrument, state.bpm);
    _lastScrollRow = -1; _lastBarIdx = -1;
    setTimeout(applyTabScrollHeight, 400);

    // ── 코드 다이어그램 + 초보자 가이드도 갱신 (skipDiagram=false일 때만) ──
    if (!skipDiagram) {
        // 수동편집된 코드도 포함하여 Top 코드 재계산
        const allChordNames = new Map();
        bars.forEach(bar => {
            (bar.chords?.length ? bar.chords : [{ chord: bar.chord }]).forEach(slot => {
                const n = slot.chord?.name;
                if (n) allChordNames.set(n, (allChordNames.get(n) || 0) + 1);
            });
        });
        // 수동편집 코드를 우선 포함
        const manualChordNames = new Set(
            Object.values(state.manualChordEdits || {}).map(e => e.chord?.name).filter(Boolean)
        );
        // Top5 = 수동편집 코드 먼저 + 빈도순 나머지
        const sorted = [...allChordNames.entries()].sort((a,b) => {
            const aM = manualChordNames.has(a[0]) ? 1e6 : 0;
            const bM = manualChordNames.has(b[0]) ? 1e6 : 0;
            return (bM + b[1]) - (aM + a[1]);
        });
        const topChords = sorted.slice(0, 5).map(([n]) => n);
        if (topChords.length) {
            dom.mainChords.textContent = topChords.join(', ');
            renderChordDiagrams(topChords);   // 다이어그램 + 초보자 가이드 갱신
        }
    }

    // 렌더 완료 후 클릭 이벤트 바인딩
    setTimeout(bindChordClickEvents, 500);

    // 코드 박스 동기화 (악기 변경, 전조 외 재렌더 시)
    if (state.isAnalyzed) setTimeout(refreshChordBoxAfterTranspose, 300);
}

// ==========================================
// 전조 패널 이벤트
// ==========================================
// 직접 입력 적용
dom.btnTcManual.addEventListener('click', () => {
    const val = dom.tcManualInput.value.trim();
    if (!val) { showToast('코드를 입력해주세요', 'error'); return; }
    applyTransposeToChord(val);
    // 그리드에서 매칭 버튼 활성화
    dom.tcChordGrid.querySelectorAll('.btn-tc-chord').forEach(b => {
        b.classList.toggle('selected', b.textContent === val);
    });
});

dom.tcManualInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') dom.btnTcManual.click();
});

// 원래대로 리셋
dom.btnTcReset.addEventListener('click', () => {
    if (state.transposeSemitones === 0) return;

    state.transposeSemitones = 0;
    state.chords = state.chordsOriginal;

    // noteSequence chord 원복
    if (state.analysisData) {
        state.analysisData.forEach(item => {
            if (item.chord) {
                item.chord = tabConverter._transposeChord(item.chord, 0);
            }
        });
        // 원본 재적용
        const origChordMap = new Map(state.chordsOriginal.map(c => [Math.round(c.time * 10), c.chord]));
        state.analysisData.forEach(item => {
            const key     = Math.round(item.time * 10);
            const nearest = state.chordsOriginal.reduce((best, c) =>
                Math.abs(c.time - item.time) < Math.abs(best.time - item.time) ? c : best,
                state.chordsOriginal[0] || { time:0, chord:null }
            );
            item.chord = nearest?.chord || null;
        });
    }

    dom.keyValue.textContent = state.key;
    dom.transposeBadge.style.display = 'none';

    const firstChord = state.chordsOriginal.find(c => c.chord)?.chord?.name || '—';
    dom.tcCurrentChord.textContent = firstChord;
    buildTransposeChordGrid(firstChord);

    reRenderTab(true);

    const chordCounts = {};
    state.chordsOriginal.forEach(c => {
        if (c.chord?.name) chordCounts[c.chord.name] = (chordCounts[c.chord.name] || 0) + 1;
    });
    const topChords = Object.entries(chordCounts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n])=>n);
    dom.mainChords.textContent = topChords.join(', ');
    renderChordDiagrams(topChords);
    showToast('원래 조성으로 복원했습니다', 'info');
});

// ==========================================
// 악기 선택
// ==========================================
document.querySelectorAll('.btn-instrument').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-instrument').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.currentInstrument = btn.dataset.instrument;
        showInstrumentHint(state.currentInstrument);
        if (state.isAnalyzed) reAnalyzeForInstrument();
    });
});

async function reAnalyzeForInstrument() {
    if (!state.analysisData) return;
    showToast('악기 변경 후 재분석 중...', 'info');
    reRenderTab(true);
    // 코드 다이어그램 재생성
    const chordCounts = {};
    state.chords.forEach(c => {
        if (c.chord?.name) chordCounts[c.chord.name] = (chordCounts[c.chord.name] || 0) + 1;
    });
    const topChords = Object.entries(chordCounts).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n])=>n);
    renderChordDiagrams(topChords);

    // ── 코드박스 프리뷰 악기 변경 반영 ──
    if (_cbState.bars.length) {
        // 시퀀스 초기화 → 강제 재렌더
        _CBP.sequence = Array(7).fill(null);
        _CBP.prevSequence = Array(7).fill(null);
        updateChordBoxPreview(_cbState.currentBarIdx, _cbState.currentBeat);
        // 악기 표시 라벨 업데이트
        _updateCbInstrumentBadge();
    }

    showToast('악보 업데이트 완료!', 'success');
}

// ==========================================
// 옵션 컨트롤
// ==========================================
dom.toggleSync.addEventListener('change', () => {});

dom.toggleChords.addEventListener('change', () => {
    if (tabRenderer) tabRenderer.setShowChords(dom.toggleChords.checked);
});

dom.zoomIn.addEventListener('click', () => {
    state.zoom = Math.min(2.0, state.zoom + 0.2);
    dom.zoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
    if (tabRenderer) tabRenderer.setZoom(state.zoom);
});

dom.zoomOut.addEventListener('click', () => {
    state.zoom = Math.max(0.6, state.zoom - 0.2);
    dom.zoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
    if (tabRenderer) tabRenderer.setZoom(state.zoom);
});

// ==========================================
// 진행 단계 UI
// ==========================================
function setStep(stepNum, status) {
    const stepEl = dom[`step${stepNum}`];
    if (!stepEl) return;
    stepEl.classList.remove('pending', 'done', 'active');
    const statusEl = stepEl.querySelector('.step-status');
    if (status === 'active') {
        statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    } else if (status === 'done') {
        stepEl.classList.add('done');
        statusEl.innerHTML = '<i class="fas fa-check" style="color:#22c55e"></i>';
    } else {
        stepEl.classList.add('pending');
        statusEl.innerHTML = '<i class="fas fa-clock"></i>';
    }
}

function resetProgressSteps() { [1,2,3,4].forEach(n => setStep(n,'pending')); }

function updateProgress(pct, text) {
    dom.analysisProgressFill.style.width = `${pct}%`;
    dom.progressText.textContent = text;
}

// ==========================================
// 유틸리티
// ==========================================
function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2,'0')}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas ${type==='success'?'fa-check-circle':type==='error'?'fa-exclamation-circle':'fa-info-circle'}"></i>
        <span>${message}</span>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

window.addEventListener('resize', () => {
    if (state.isAnalyzed && tabRenderer) tabRenderer.render();
    if (state.waveformData.length > 0) drawWaveform(audioEngine.getCurrentTime());
    if (state.isAnalyzed) {
        // 코드박스 프리뷰 재렌더 (카드 위치 재계산)
        _CBP.sequence = Array(7).fill(null); // 강제 재렌더
        updateChordBoxPreview();
    }
});

// ==========================================
// 코드 악보 4줄 높이 제한 (분석 완료 후 자동 계산)
// ==========================================
function applyTabScrollHeight() {
    const wrap = dom.tabScoreContainer;
    if (!wrap) return;

    const svgWrapper = document.getElementById('tabSvgWrapper');
    if (svgWrapper) {
        const rows = svgWrapper.querySelectorAll('[data-row]');
        if (rows.length > 0) {
            const firstRowH = rows[0].getBoundingClientRect().height || 220;
            // 4행 높이 + 여유 패딩
            const targetH = Math.round(firstRowH * 4 + 60);
            wrap.style.maxHeight = `${Math.max(440, Math.min(targetH, 1000))}px`;
        } else {
            wrap.style.maxHeight = '540px';
        }
    } else {
        wrap.style.maxHeight = '540px';
    }
    wrap.style.overflowY = 'auto';
}

console.log('CodeDuck v4.1 - 확장코드 + 수동편집 + BPM보정 초기화 완료');

/* ══════════════════════════════════════════════════════════════
   코드 박스 (Chord Box) — v4.4
   파형 박스 아래 마디별 4칸 코드 흐름 / 재생 동기화
══════════════════════════════════════════════════════════════ */

// 코드박스 상태
const _cbState = {
    bars:          [],   // [{startTime, slots:[{beat,chordName}×4]}]
    currentBarIdx: -1,
    currentBeat:   -1,
    editPopup:     null,
    editMode:      false, // 오렌지 편집 버튼 ON/OFF
};

/**
 * 코드박스 헤더의 악기 배지 텍스트·색상 업데이트
 */
function _updateCbInstrumentBadge() {
    const badge = document.getElementById('cbInstrumentBadge');
    if (!badge) return;
    const inst = state.currentInstrument || 'acoustic';
    const info = {
        acoustic:  { label: '🎸 기본코드폼',   color: '#3b82f6' },
        electric1: { label: '⚡ 파워코드폼',   color: '#ea580c' },
        electric2: { label: '🔥 트라이어드폼', color: '#16a34a' },
        bass:      { label: '🎵 베이스폼',     color: '#7c3aed' },
    };
    const d = info[inst] || info.acoustic;
    badge.textContent  = d.label;
    badge.style.background  = d.color + '33'; // 20% opacity
    badge.style.borderColor = d.color;
    badge.style.color       = d.color;
}

/**
 * 분석 완료 후 코드 박스를 초기화/재렌더
 */
function initChordBox() {
    const section = document.getElementById('chordBoxSection');
    if (!section) return;

    // bars 데이터가 없으면 숨김
    if (!state.bars || !state.bars.length) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');

    // ── 편집 토글 버튼 초기화 ──
    const editBtn = document.getElementById('cbEditToggleBtn');
    const editBadge = document.getElementById('cbEditBadge');
    if (editBtn && !editBtn._cbInitialized) {
        editBtn._cbInitialized = true;
        editBtn.addEventListener('click', () => {
            _cbState.editMode = !_cbState.editMode;
            const on = _cbState.editMode;
            editBtn.classList.toggle('cb-edit-on', on);
            if (editBadge) editBadge.textContent = on ? 'ON' : 'OFF';
            section.classList.toggle('cb-edit-mode', on);
            // 슬롯 title 업데이트
            section.querySelectorAll('.cb-slot').forEach(el => {
                const bi = parseInt(el.dataset.barIdx);
                const si = parseInt(el.dataset.slotIdx);
                el.title = on
                    ? `마디 ${bi+1} · ${si+1}번째 — 클릭으로 코드 추가/삭제`
                    : `마디 ${bi+1} · ${si+1}번째 — 클릭으로 해당 위치 이동`;
            });
        });
    }
    // 초기 상태 동기화
    if (editBtn) {
        const on = _cbState.editMode;
        editBtn.classList.toggle('cb-edit-on', on);
        if (editBadge) editBadge.textContent = on ? 'ON' : 'OFF';
        section.classList.toggle('cb-edit-mode', on);
    }

    _buildChordBoxData();
    _renderChordBoxTrack();
    // 악기 배지 업데이트
    _updateCbInstrumentBadge();
    // 프리뷰 강제 재렌더
    _CBP.sequence = Array(7).fill(null);
    updateChordBoxPreview(); // 현재 시간 기준 프리뷰 초기화
}

/**
 * state.bars에서 코드박스 데이터 구축
 * 각 마디를 4칸(beat 0~3)으로 정규화
 */
function _buildChordBoxData() {
    _cbState.bars = [];
    // tabRenderer.bars를 우선 사용 (최신 수동 편집 반영)
    const sourceBars = (window.tabRenderer?.bars?.length ? window.tabRenderer.bars : null) || state.bars;
    if (!sourceBars) return;

    const barDur = (60 / state.bpm) * 4; // 4/4박자 1마디 duration

    sourceBars.forEach((bar, barIdx) => {
        const startTime = bar.startTime ?? barIdx * barDur;
        // 4칸 슬롯 초기화
        const slots = [
            { beat: 0, chordName: '', barIdx, slotIdx: 0 },
            { beat: 1, chordName: '', barIdx, slotIdx: 1 },
            { beat: 2, chordName: '', barIdx, slotIdx: 2 },
            { beat: 3, chordName: '', barIdx, slotIdx: 3 },
        ];

        // bar.chords (멀티슬롯) 처리
        if (bar.chords && bar.chords.length) {
            bar.chords.forEach(slot => {
                const beatOffset = Math.round(slot.beatOffset ?? slot.slotIndex ?? 0);
                const name       = slot.chord?.name || '';
                if (!name) return;
                if (beatOffset >= 0 && beatOffset < 4) {
                    slots[beatOffset].chordName = name;
                }
            });
        } else if (bar.chord?.name) {
            // 하위호환: 마디 전체에 1개 코드 → 1번 칸에 표시
            slots[0].chordName = bar.chord.name;
        }

        _cbState.bars.push({ startTime, slots, barIdx });
    });
}

/**
 * DOM 렌더: 코드 박스 트랙 생성
 */
function _renderChordBoxTrack() {
    const track = document.getElementById('chordBoxTrack');
    if (!track) return;
    track.innerHTML = '';

    _cbState.bars.forEach((barData, i) => {
        const barEl = document.createElement('div');
        barEl.className = 'cb-bar';
        barEl.dataset.barIdx = i;

        // 마디 번호
        const numEl = document.createElement('div');
        numEl.className = 'cb-bar-num';
        numEl.textContent = i + 1;
        barEl.appendChild(numEl);

        // 4개 슬롯
        barData.slots.forEach((slot, si) => {
            const slotEl = document.createElement('div');
            slotEl.className = 'cb-slot';
            slotEl.dataset.barIdx  = i;
            slotEl.dataset.slotIdx = si;
            slotEl.title = `마디 ${i+1} · ${si+1}번째 박자 — 클릭으로 코드 수정`;

            const beatEl = document.createElement('div');
            beatEl.className = 'cb-slot-beat';
            beatEl.textContent = `${si+1}`;
            slotEl.appendChild(beatEl);

            const chordEl = document.createElement('div');
            chordEl.className = 'cb-slot-chord' + (slot.chordName ? '' : ' cb-empty');
            chordEl.textContent = slot.chordName || '—';
            chordEl.dataset.chordName = slot.chordName;
            slotEl.appendChild(chordEl);

            const editIcon = document.createElement('i');
            editIcon.className = 'fas fa-pen cb-slot-edit-icon';
            slotEl.appendChild(editIcon);

            // 클릭 이벤트: 편집 모드 ON → 코드 편집 팝업, OFF → 해당 위치로 이동
            slotEl.addEventListener('click', (e) => {
                e.stopPropagation();
                if (_cbState.editMode) {
                    // 편집 모드: 팝업으로 코드 추가/삭제
                    _openCbEditPopup(i, si, slotEl);
                } else {
                    // 일반 모드: 해당 마디/박자 위치로 오디오 이동
                    const barData = _cbState.bars[i];
                    if (barData) {
                        const barDur  = (60 / state.bpm) * 4;
                        const beatDur = barDur / 4;
                        const targetTime = barData.startTime + si * beatDur;
                        if (audioEngine && typeof audioEngine.seekTo === 'function') {
                            audioEngine.seekTo(targetTime);
                        } else if (audioEngine && audioEngine.audioBuffer) {
                            // seekTo 대신 currentTime 직접 설정
                            audioEngine._seekTime = targetTime;
                        }
                        // 코드박스 프리뷰 즉시 업데이트
                        updateChordBoxPreview(i, si);
                        // 활성 슬롯 강조 즉시 업데이트
                        _cbState.currentBarIdx = i;
                        _cbState.currentBeat   = si;
                        const track2 = document.getElementById('chordBoxTrack');
                        track2?.querySelectorAll('.cb-slot').forEach(s => s.classList.remove('cb-slot-active'));
                        slotEl.classList.add('cb-slot-active');
                        track2?.querySelectorAll('.cb-bar').forEach(b => b.classList.remove('cb-active'));
                        slotEl.closest('.cb-bar')?.classList.add('cb-active');
                    }
                }
            });

            barEl.appendChild(slotEl);
        });

        track.appendChild(barEl);
    });
}

/**
 * 재생 시간에 따라 코드 박스 활성 슬롯 업데이트
 */
function updateChordBoxByTime(currentTime) {
    if (!_cbState.bars.length) return;

    const barDur  = (60 / state.bpm) * 4;
    const beatDur = barDur / 4;

    // 현재 마디 찾기
    let barIdx = -1;
    for (let i = 0; i < _cbState.bars.length; i++) {
        const b    = _cbState.bars[i];
        const next = _cbState.bars[i+1];
        const end  = next ? next.startTime : b.startTime + barDur;
        if (currentTime >= b.startTime && currentTime < end) {
            barIdx = i;
            break;
        }
    }
    if (barIdx < 0) return;

    const bar       = _cbState.bars[barIdx];
    const elapsed   = currentTime - bar.startTime;
    const beatInBar = (elapsed < 0) ? 0 : Math.min(3, Math.floor(elapsed / beatDur));

    const changed = (barIdx !== _cbState.currentBarIdx || beatInBar !== _cbState.currentBeat);
    _cbState.currentBarIdx = barIdx;
    _cbState.currentBeat   = beatInBar;

    if (!changed) return;

    // DOM 업데이트: 활성 마디/슬롯 강조
    document.querySelectorAll('.cb-bar').forEach((el, i) => {
        el.classList.toggle('cb-active', i === barIdx);
    });
    document.querySelectorAll('.cb-slot').forEach(el => {
        const bi = parseInt(el.dataset.barIdx);
        const si = parseInt(el.dataset.slotIdx);
        el.classList.toggle('cb-slot-active', bi === barIdx && si === beatInBar);
    });

    // 재생 동기화 켜져있을 때 스크롤
    const syncToggle = document.getElementById('chordBoxSyncToggle');
    if (syncToggle?.checked) {
        _scrollChordBoxToBar(barIdx);
    }

    // 코드 폼 프리뷰 업데이트
    updateChordBoxPreview(barIdx, beatInBar);
}

/**
 * 코드박스를 해당 마디로 스크롤
 */
function _scrollChordBoxToBar(barIdx) {
    const track = document.getElementById('chordBoxTrack');
    if (!track) return;
    const barEls = track.querySelectorAll('.cb-bar');
    if (!barEls[barIdx]) return;
    const wrap = document.getElementById('chordBoxSection')?.querySelector('.chord-box-scroll-wrap');
    if (!wrap) return;
    const barEl = barEls[barIdx];
    const offsetLeft = barEl.offsetLeft;
    const viewWidth  = wrap.clientWidth;
    const targetScroll = Math.max(0, offsetLeft - viewWidth / 3);
    wrap.scrollTo({ left: targetScroll, behavior: 'smooth' });
}

/**
 * 코드박스 프리뷰 — 7카드 슬라이드 (오른쪽→왼쪽 이동)
 * pos: -2(과거2), -1(과거1), 0(현재★), 1(다음1), 2(다음2), 3(다음3), 4(다음4)
 */
const _CBP = {
    // 현재 슬라이드에 표시 중인 7개 코드 [pos-2 .. pos+4]
    // null = 빈 슬롯
    sequence:    Array(7).fill(null),
    prevSequence:Array(7).fill(null),
    animating:   false,
};

function updateChordBoxPreview(barIdx, beatIdx) {
    if (barIdx === undefined) barIdx  = _cbState.currentBarIdx;
    if (beatIdx === undefined) beatIdx = _cbState.currentBeat;

    const stage = document.getElementById('cbpStage');
    if (!stage) return;

    // 7개 코드 수집: [-2, -1, 0(현재), +1, +2, +3, +4]
    const seq = _collect7Chords(barIdx, beatIdx);

    // 변화 없으면 스킵
    const changed = seq.some((v, i) => v !== _CBP.sequence[i]);
    if (!changed && stage.children.length === 7) return;

    _CBP.prevSequence = [..._CBP.sequence];
    _CBP.sequence     = seq;

    _renderCbpStage(stage, seq, barIdx, beatIdx);
}

/**
 * 현재 위치 기준 -2~+4 범위 7개 코드 수집
 * (코드가 없는 슬롯은 null)
 */
function _collect7Chords(barIdx, beatIdx) {
    // 전체 코드 시퀀스를 선형으로 추출 (각 슬롯별, 빈칸도 포함)
    const linearSlots = [];
    if (_cbState.bars.length) {
        _cbState.bars.forEach(bar => {
            bar.slots.forEach(slot => linearSlots.push(slot.chordName || null));
        });
    }

    // 현재 위치의 선형 인덱스 계산
    const curLinear = (barIdx < 0 ? 0 : barIdx) * 4 + Math.max(0, beatIdx < 0 ? 0 : beatIdx);
    const result = [];
    for (let offset = -2; offset <= 4; offset++) {
        const li = curLinear + offset;
        result.push((li >= 0 && li < linearSlots.length) ? linearSlots[li] : null);
    }
    return result; // [pos-2, pos-1, pos0(현재), pos1, pos2, pos3, pos4]
}

/**
 * 스테이지 DOM 렌더 (7개 카드)
 */
function _renderCbpStage(stage, seq, barIdx, beatIdx) {
    stage.innerHTML = '';
    const stageW = stage.parentElement?.clientWidth || window.innerWidth;

    // 현재 카드(pos=0) 가로형 너비: 스테이지에서 양쪽 카드 2개씩 + 간격 제외
    // 사이드 카드 2쌍 합계 ≈ (83+104+104+92) + 간격 = ~400px → 나머지를 현재 카드에
    const sideWidth = 83 + 104 + 104 + 92 + 78 + 62; // pos±1~±2 합
    const totalGap  = 8+10+14+10+9+8+7;
    const curW = Math.max(240, Math.min(360, stageW - sideWidth - totalGap - 20));
    const curH = 160;

    // 카드 크기 정의 (pos별)
    // pos=0: 현재(가로형) — 가로로 넓고 낮음
    // 나머지: 세로형 (기존 스타일 유지)
    const configs = [
        { pos:-2, w:83,  h:121, canW:69,      canH:90,      cname:'cbp-card-past',    lbl:'PREV', horiz:false },
        { pos:-1, w:104, h:150, canW:88,      canH:115,     cname:'cbp-card-past',    lbl:'PREV', horiz:false },
        { pos: 0, w:curW,h:curH,canW:curW-8,  canH:curH-8,  cname:'cbp-card-current', lbl:'NOW',  horiz:true  },
        { pos: 1, w:104, h:150, canW:88,      canH:115,     cname:'cbp-card-next',    lbl:'NEXT', horiz:false },
        { pos: 2, w:92,  h:132, canW:76,      canH:101,     cname:'cbp-card-next cbp-card-next-2', lbl:'NEXT', horiz:false },
        { pos: 3, w:78,  h:115, canW:64,      canH:85,      cname:'cbp-card-next cbp-card-next-3', lbl:'NEXT', horiz:false },
        { pos: 4, w:62,  h:94,  canW:53,      canH:71,      cname:'cbp-card-next cbp-card-next-4', lbl:'NEXT', horiz:false },
    ];

    // 카드 X 위치 계산 (현재=중앙, 좌우로 배치)
    const centerX = stageW / 2;
    const gaps = [8, 10, 14, 10, 9, 8, 7]; // 카드 사이 간격
    // 각 카드의 left 위치 계산
    const positions = [];
    // 현재 카드(idx=2) 중앙
    let cx = centerX - configs[2].w / 2;
    positions[2] = cx;
    // 왼쪽
    let lx = cx;
    for (let i = 1; i >= 0; i--) {
        lx -= gaps[i] + configs[i].w;
        positions[i] = lx;
    }
    // 오른쪽
    let rx = cx + configs[2].w;
    for (let i = 3; i <= 6; i++) {
        rx += gaps[i];
        positions[i] = rx;
        rx += configs[i].w;
    }

    // 카드 생성
    configs.forEach((cfg, cardIdx) => {
        const chordName = seq[cardIdx] || null;
        const isEmpty   = (chordName === null);

        const card = document.createElement('div');
        card.className = `cbp-card ${cfg.cname}`;
        if (isEmpty) card.classList.add('cbp-card-empty');

        // 위치/크기 직접 설정
        card.style.cssText = `
            left:${positions[cardIdx]}px;
            width:${cfg.w}px; height:${cfg.h}px;
            top:50%; transform:translateY(-50%);
        `;

        if (isEmpty) {
            // 빈 카드 — 점선 박스 (가로형 현재 카드는 더 넓은 안내 문구)
            card.style.borderStyle = 'dashed';
            const inner = document.createElement('div');
            inner.className = 'cbp-card-empty-inner';
            if (cfg.horiz) {
                inner.innerHTML = `
                    <div style="color:#2a3060;font-size:0.7rem;letter-spacing:0.05em;opacity:0.7;">코드 없음</div>
                    <div class="cbp-card-empty-line" style="width:40%;margin-top:4px;"></div>
                `;
            } else {
                inner.innerHTML = `
                    <div class="cbp-card-empty-line"></div>
                    <div class="cbp-card-empty-line"></div>
                    <div class="cbp-card-empty-line"></div>
                `;
            }
            card.appendChild(inner);
        } else {
            const inner = document.createElement('div');
            inner.className = 'cbp-card-inner';

            // 레이블 (NOW / PREV / NEXT → 현재 카드는 악기형 이름)
            const lbl = document.createElement('div');
            lbl.className = 'cbp-card-label';
            if (cfg.pos === 0) {
                // 현재 카드: 악기형 이름 표시
                const instLbls = { acoustic:'코드폼', electric1:'파워코드', electric2:'트라이어드', bass:'베이스' };
                lbl.textContent = instLbls[state.currentInstrument] || '코드폼';
                const instColors = { acoustic:'#6080ff', electric1:'#fb923c', electric2:'#4ade80', bass:'#a78bfa' };
                lbl.style.color = instColors[state.currentInstrument] || '#6080ff';
            } else {
                lbl.textContent = cfg.lbl;
            }
            inner.appendChild(lbl);

            // 코드명 (가로형 카드는 다이어그램 안에 내장 → 생략)
            if (!cfg.horiz) {
                const nm = document.createElement('div');
                nm.className = 'cbp-card-chord-name';
                if (Math.abs(cfg.pos) === 1) nm.style.fontSize = '0.82rem';
                else nm.style.fontSize = '0.68rem';
                nm.textContent = chordName;
                inner.appendChild(nm);
            }

            // 다이어그램 캔버스
            const canvas = _makeMiniChordCanvas(chordName, cfg.canW, cfg.canH, null, cfg.horiz);
            if (canvas) {
                canvas.style.cssText = cfg.horiz
                    ? 'margin:0; border-radius:6px; display:block;'
                    : 'margin-top:2px;';
                inner.appendChild(canvas);
            } else {
                // 다이어그램 없을 때 빈 영역
                const placeholder = document.createElement('div');
                placeholder.style.cssText = `width:${cfg.canW}px;height:${cfg.canH}px;display:flex;align-items:center;justify-content:center;color:#2a3060;font-size:0.65rem;`;
                placeholder.textContent = cfg.horiz ? `${chordName}\n(폼 없음)` : '—';
                inner.appendChild(placeholder);
            }

            card.appendChild(inner);
        }

        stage.appendChild(card);
    });
}

/**
 * 특정 마디/박자 위치의 코드명 반환 (없으면 이전 코드)
 */
function _findChordAtPosition(barIdx, beatIdx) {
    if (barIdx < 0 || !_cbState.bars.length) return null;
    for (let bi = barIdx; bi >= 0; bi--) {
        const bar   = _cbState.bars[bi];
        const start = (bi === barIdx) ? beatIdx : 3;
        for (let si = start; si >= 0; si--) {
            const name = bar.slots[si]?.chordName;
            if (name) return name;
        }
    }
    return null;
}

/**
 * 현재 위치 이후 다음 코드 n개 수집 (중복 제거)
 */
function _getNextChords(barIdx, beatIdx, count) {
    const result = [];
    let lastChord = _findChordAtPosition(barIdx, beatIdx);

    if (barIdx < 0 || !_cbState.bars.length) return result;

    let bi = barIdx;
    let si = (beatIdx < 0 ? 0 : beatIdx) + 1;
    while (result.length < count && bi < _cbState.bars.length) {
        if (si >= 4) { bi++; si = 0; continue; }
        const name = _cbState.bars[bi]?.slots[si]?.chordName;
        if (name && name !== lastChord) {
            result.push(name);
            lastChord = name;
        }
        si++;
    }
    return result;
}

/**
 * 코드 다이어그램 캔버스 (코드박스 카드용 — 다크 배경)
 * instrument를 명시하면 해당 폼으로 그림 (기본: state.currentInstrument)
 * horizontal=true: 가로형(기타 눕힌 뷰), false: 기존 세로형
 */
function _makeMiniChordCanvas(chordName, w, h, instrument, horizontal) {
    if (!chordName || !tabConverter) return null;
    instrument = instrument || state.currentInstrument || 'acoustic';
    try {
        // instrument별 다이어그램 데이터 획득
        const diagramData = _getChordDiagramByInstrument(chordName, instrument);
        if (!diagramData) return null;
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        if (!tabRenderer) return null;
        if (horizontal) {
            // 가로형 렌더 (기타를 눕혀서 보는 방향)
            _drawChordDiagramHorizontal(canvas, diagramData, chordName, w, h);
        } else {
            // 기존 세로형 렌더
            _drawChordDiagramDark(canvas, diagramData, chordName, w, h);
        }
        return canvas;
    } catch(e) {
        return null;
    }
}

/**
 * instrument별 코드 다이어그램 데이터 반환
 * acoustic  : 오픈 코드폼 (strings 6개, barre, fingers)
 * electric1 : 파워코드폼 (strings 6개, null=뮤트)
 * electric2 : 트라이어드폼 (G·B·e 3현, strings 6개)
 * bass      : 베이스 단음 (strings 4개)
 */
function _getChordDiagramByInstrument(chordName, instrument) {
    if (!chordName || !tabConverter) return null;

    // chord 객체 생성 (tabConverter 내부 메서드 호환)
    const rootMatch = chordName.match(/^([A-G][#b]?)/);
    const root = rootMatch ? rootMatch[1] : chordName;
    const type = chordName.slice(root.length) || 'major';
    const chordObj = { name: chordName, root, type };

    try {
        if (instrument === 'electric1') {
            // 파워코드폼: strings 배열 (6현, null=뮤트)
            const strings = tabConverter._getPowerChordForm(chordObj);
            if (!strings || strings.every(s => s === null)) return null;
            return { strings, barre: null, fingers: null, instrument: 'electric1' };

        } else if (instrument === 'electric2') {
            // 트라이어드폼: G·B·e 3현
            const strings = tabConverter._getTriadForm(chordObj);
            if (!strings || strings.every(s => s === null)) return null;
            return { strings, barre: null, fingers: null, instrument: 'electric2' };

        } else if (instrument === 'bass') {
            // 베이스 단음
            const strings = tabConverter._getBassForm(chordObj);
            if (!strings || strings.every(s => s === null)) return null;
            return { strings, barre: null, fingers: null, instrument: 'bass' };

        } else {
            // 어쿠스틱 오픈코드 (기본)
            const data = tabConverter.generateChordDiagram(chordName, 'acoustic');
            return data;
        }
    } catch(e) {
        // 폴백: generateChordDiagram
        return tabConverter.generateChordDiagram(chordName, 'acoustic');
    }
}

/**
 * ══════════════════════════════════════════════════════════
 *  세로형 코드 다이어그램 (기존 코드북 형식)
 *
 *  strings 배열 규칙: index 0 = e(1현 가는현), index 5 = E(6현 굵은현)
 *  화면 표시 규칙:    왼쪽 = E(6현, 굵은), 오른쪽 = e(1현, 가는)
 *
 *  ∴ 화면 위치 di(0=왼)  ↔  strings[ns-1-di]
 *     di=0 → strings[5]=E(굵은)  왼쪽
 *     di=5 → strings[0]=e(가는)  오른쪽
 * ══════════════════════════════════════════════════════════
 */
function _drawChordDiagramDark(canvas, chordData, chordName, reqW, reqH) {
    reqW = reqW || 96; reqH = reqH || 120;
    canvas.width = reqW; canvas.height = reqH;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, reqW, reqH);

    if (!chordData) {
        ctx.font = `bold ${Math.round(reqW*0.11)}px Inter,sans-serif`;
        ctx.fillStyle = '#3a4268'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('—', reqW/2, reqH/2); return;
    }

    const inst = chordData.instrument || 'acoustic';
    const theme = {
        acoustic:  {dot:'#2060ff',barre:'#3a6aff',nut:'#4a5580',open:'#6080c8',fret:'#2a3060',str:'#3a4268',label:'#5a6290',mute:'#3a4268'},
        electric1: {dot:'#c2410c',barre:'#ea580c',nut:'#7c2d12',open:'#ea580c',fret:'#3a2010',str:'#5a3020',label:'#a05030',mute:'#7c2d12'},
        electric2: {dot:'#15803d',barre:'#16a34a',nut:'#14532d',open:'#22c55e',fret:'#142a18',str:'#1a4020',label:'#3a8050',mute:'#14532d'},
        bass:      {dot:'#6d28d9',barre:'#7c3aed',nut:'#3b0764',open:'#7c3aed',fret:'#1e1030',str:'#2d1860',label:'#6040a0',mute:'#3b0764'},
    };
    const T = theme[inst] || theme.acoustic;

    const BASE_W=96, BASE_H=120;
    const scale = Math.min(reqW/BASE_W, reqH/BASE_H);
    ctx.save();
    ctx.translate((reqW-BASE_W*scale)/2, (reqH-BASE_H*scale)/2);
    ctx.scale(scale, scale);

    const { strings, barre, fingers } = chordData;
    const ns = strings.length;          // 6(기타) or 4(베이스)
    const nFrets = 5;
    const padL=10, padR=18, padT=32, padB=8;
    const gridW = BASE_W - padL - padR;
    const gridH = BASE_H - padT - padB;
    const strGap  = gridW / (ns-1);     // 현 간격(가로)
    const fretGap = gridH / nFrets;     // 프렛 간격(세로)

    // ── 화면 위치 di → strings 인덱스 si ──
    // di=0(왼쪽)=E(굵은6현)=strings[ns-1]
    // di=ns-1(오른쪽)=e(가는1현)=strings[0]
    const si = (di) => ns - 1 - di;     // 역매핑 함수
    const dx = (di) => padL + di*strGap; // di → x 좌표

    // 현 이름: 왼쪽→오른쪽 = E,A,D,G,B,e (또는 베이스 E,A,D,G)
    const strNames = ns===4 ? ['E','A','D','G'] : ['E','A','D','G','B','e'];

    // baseFret 계산
    let baseFret = 1;
    if (barre && barre.fret > 1) baseFret = barre.fret;
    else {
        const ft = strings.filter(f => f!==null && f>0);
        if (ft.length && Math.min(...ft)>3) baseFret = Math.min(...ft);
    }

    // ── 현 이름 (상단) ──
    ctx.font = 'bold 7.5px Inter,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let di=0; di<ns; di++) {
        const fret = strings[si(di)];
        ctx.fillStyle = (di===0 && inst!=='bass') ? '#8a7050'
                      : (fret!==null ? T.label : '#2a3050');
        ctx.fillText(strNames[di], dx(di), 8);
    }

    // ── 개방(○)/뮤트(✕) 기호 ──
    for (let di=0; di<ns; di++) {
        const fret = strings[si(di)];
        const x = dx(di), oy = padT-10;
        if (fret === null) {
            ctx.strokeStyle=T.mute; ctx.lineWidth=1.5;
            ctx.beginPath(); ctx.moveTo(x-4,oy-4); ctx.lineTo(x+4,oy+4); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x+4,oy-4); ctx.lineTo(x-4,oy+4); ctx.stroke();
        } else if (fret === 0) {
            ctx.strokeStyle=T.open; ctx.lineWidth=1.8;
            ctx.beginPath(); ctx.arc(x, oy, 4.5, 0, Math.PI*2); ctx.stroke();
        }
    }

    // ── 너트 ──
    if (baseFret === 1) {
        ctx.fillStyle = T.nut;
        ctx.fillRect(padL-1, padT-3, gridW+2, 3);
    } else {
        ctx.font='bold 8px Inter,sans-serif';
        ctx.fillStyle=T.label; ctx.textAlign='left'; ctx.textBaseline='bottom';
        ctx.fillText(`${baseFret}fr`, padL, padT-2);
        ctx.strokeStyle=T.fret; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(padL,padT); ctx.lineTo(padL+gridW,padT); ctx.stroke();
    }

    // ── 프렛선(가로) ──
    ctx.strokeStyle=T.fret; ctx.lineWidth=0.8;
    for (let f=1; f<=nFrets; f++) {
        const fy = padT + f*fretGap;
        ctx.beginPath(); ctx.moveTo(padL,fy); ctx.lineTo(padL+gridW,fy); ctx.stroke();
    }

    // ── 현선(세로) — di=0(왼,E) 굵게, di=ns-1(오,e) 얇게 ──
    for (let di=0; di<ns; di++) {
        const fret = strings[si(di)];
        ctx.strokeStyle = fret!==null ? T.str : '#1e2240';
        ctx.lineWidth = Math.max(0.5, 0.5 + (ns-1-di)*0.18); // di 작을수록(E쪽) 굵게
        ctx.beginPath(); ctx.moveTo(dx(di),padT); ctx.lineTo(dx(di),padT+gridH); ctx.stroke();
    }

    // ── 바레 ──
    // barre.from: strings 인덱스(0=e가는현). 화면 di로 변환: di = ns-1-fromI
    if (barre) {
        const relFret = barre.fret - baseFret + 1;
        if (relFret>=1 && relFret<=nFrets) {
            const barY = padT + (relFret-0.5)*fretGap;
            const fromI = barre.from ?? 0;
            // fromI(strings idx) → di_from(화면 위치)
            const di_from = ns-1-fromI; // fromI=0(e) → di=ns-1(오른쪽)
            // 바레: di_from(오른끝)~0(왼끝=E)
            const x1 = dx(0) - 4;              // 왼쪽 끝(E현)
            const x2 = dx(di_from) + 4;        // 오른쪽 끝(from현)
            ctx.fillStyle=T.barre; ctx.globalAlpha=0.9;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x1, barY-5.5, x2-x1, 11, 5.5);
            else ctx.rect(x1, barY-5.5, x2-x1, 11);
            ctx.fill(); ctx.globalAlpha=1;
            ctx.font='bold 6.5px Inter,sans-serif';
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText('1', dx(0), barY); // E현(왼쪽)에 '1' 표시
        }
    }

    // ── 손가락 점 + 번호 ──
    for (let di=0; di<ns; di++) {
        const fret = strings[si(di)];
        if (fret===null || fret===0) continue;
        const relFret = fret - baseFret + 1;
        if (relFret<1 || relFret>nFrets) continue;
        const x  = dx(di);
        const fy = padT + (relFret-0.5)*fretGap;
        const fn = fingers ? fingers[si(di)] : null;
        // 바레로 이미 덮인 경우 스킵
        const isBarred = barre && fret===barre.fret &&
            (barre.from!==undefined ? si(di)>=barre.from : true);
        if (isBarred) continue;

        ctx.fillStyle = T.dot;
        ctx.beginPath(); ctx.arc(x, fy, 6, 0, Math.PI*2); ctx.fill();

        if (fn && fn>=1 && fn<=4) {
            ctx.font='bold 7px Inter,sans-serif';
            ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText(String(fn), x, fy);
        } else if (inst==='electric1') {
            ctx.font='bold 5.5px Inter,sans-serif';
            ctx.fillStyle='rgba(255,255,255,0.8)';
            ctx.textAlign='center'; ctx.textBaseline='middle';
            const activeIdx = strings.filter(f2=>f2!==null&&f2>0).indexOf(fret);
            ctx.fillText(['R','5','8'][activeIdx]||'', x, fy);
        }
    }

    // ── 악기 타입 라벨 (우하단) ──
    const instLabel={acoustic:'코드',electric1:'파워',electric2:'트라이어드',bass:'베이스'};
    ctx.font='bold 6px Inter,sans-serif'; ctx.fillStyle=T.label;
    ctx.textAlign='right'; ctx.textBaseline='bottom';
    ctx.fillText(instLabel[inst]||'', BASE_W-2, BASE_H-1);

    ctx.restore();
}



/**
 * ════════════════════════════════════════════════════════
 *  가로형 코드 다이어그램 렌더러 (완전 재작성)
 *
 *  연주자 시점 (기타를 가로로 잡고 봄):
 *    위쪽 = E(6현, 가장 굵은)
 *    아래쪽 = e(1현, 가장 가는)
 *
 *  내부 통일 인덱스 di (display index):
 *    di=0 → 위(E굵은6현), di=ns-1 → 아래(e가는1현)
 *    strings 배열: [0]=e(가는), [ns-1]=E(굵은)
 *    → si(di) = ns-1-di  (strings 배열 인덱스로 변환)
 *
 *  모든 루프(현선, 이름, 도트, 바레)가 동일한 di 기준 사용
 * ════════════════════════════════════════════════════════
 */
function _drawChordDiagramHorizontal(canvas, chordData, chordName, reqW, reqH) {
    reqW = reqW || 200; reqH = reqH || 130;
    canvas.width  = reqW;
    canvas.height = reqH;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, reqW, reqH);

    if (!chordData) {
        ctx.font = `bold ${Math.round(reqW * 0.1)}px Inter,sans-serif`;
        ctx.fillStyle = '#3a4268'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('—', reqW / 2, reqH / 2); return;
    }

    const inst = chordData.instrument || 'acoustic';
    const theme = {
        acoustic:  { dot:'#2060ff', barre:'#3a6aff', nut:'#6070a8', open:'#6080c8', fret:'#2a3060', str:'#3a4268', label:'#7080b0', mute:'#3a4268' },
        electric1: { dot:'#ea580c', barre:'#fb923c', nut:'#a03010', open:'#fb923c', fret:'#3a2010', str:'#6a3820', label:'#c06030', mute:'#7c2d12' },
        electric2: { dot:'#16a34a', barre:'#22c55e', nut:'#1a5c30', open:'#4ade80', fret:'#142a18', str:'#1a4828', label:'#40a060', mute:'#14532d' },
        bass:      { dot:'#7c3aed', barre:'#a78bfa', nut:'#4c1d95', open:'#a78bfa', fret:'#1e1030', str:'#3d2070', label:'#7050c0', mute:'#3b0764' },
    };
    const T = theme[inst] || theme.acoustic;

    const { strings, barre, fingers } = chordData;
    const ns = strings.length; // 6(기타) or 4(베이스)
    const nFrets = 5;

    // ── 레이아웃 상수 ──
    const PAD_TOP    = 22;  // 프렛 번호 영역
    const PAD_BOTTOM = 8;
    const PAD_LEFT   = 28;  // 현 이름 + 뮤트/개방 영역
    const PAD_RIGHT  = 10;
    const gridH = reqH - PAD_TOP - PAD_BOTTOM;
    const gridW = reqW - PAD_LEFT - PAD_RIGHT;
    const strGap  = gridH / (ns - 1);
    const fretGap = gridW / nFrets;

    // ── 통일된 di 매핑 함수 ──
    // di=0(위=E굵은) ↔ strings[ns-1], di=ns-1(아래=e가는) ↔ strings[0]
    const si  = (di) => ns - 1 - di;              // di → strings 인덱스
    const diy = (di) => PAD_TOP + di * strGap;    // di → 화면 Y 좌표
    const fretX = (relFret) => PAD_LEFT + (relFret - 0.5) * fretGap;

    // 현 이름: di=0='E'(위,굵은), di=ns-1='e'(아래,가는)
    const strNames = ns === 4 ? ['E','A','D','G'] : ['E','A','D','G','B','e'];

    // ── baseFret 계산 ──
    let baseFret = 1;
    if (barre && barre.fret > 1) baseFret = barre.fret;
    else {
        const ft = strings.filter(f => f !== null && f > 0);
        if (ft.length && Math.min(...ft) > 3) baseFret = Math.min(...ft);
    }

    // ── 프렛 번호 (상단) ──
    ctx.font = 'bold 7.5px Inter,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (let f = 1; f <= nFrets; f++) {
        ctx.fillStyle = T.label;
        ctx.fillText(String(baseFret + f - 1), PAD_LEFT + (f - 0.5) * fretGap, PAD_TOP - 4);
    }

    // ── 너트 / 시작선 ──
    if (baseFret === 1) {
        ctx.fillStyle = T.nut;
        ctx.fillRect(PAD_LEFT - 3, PAD_TOP, 4, gridH);
    } else {
        ctx.strokeStyle = T.fret; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(PAD_LEFT, PAD_TOP); ctx.lineTo(PAD_LEFT, PAD_TOP + gridH); ctx.stroke();
    }

    // ── 프렛선 (세로) ──
    ctx.strokeStyle = T.fret; ctx.lineWidth = 0.8;
    for (let f = 1; f <= nFrets; f++) {
        const fx = PAD_LEFT + f * fretGap;
        ctx.beginPath(); ctx.moveTo(fx, PAD_TOP); ctx.lineTo(fx, PAD_TOP + gridH); ctx.stroke();
    }

    // ── 현선 (가로) — di=0(위,E) 굵게, di=ns-1(아래,e) 얇게 ──
    for (let di = 0; di < ns; di++) {
        const y = diy(di);
        const fret = strings[si(di)];
        ctx.strokeStyle = fret !== null ? T.str : '#1e2240';
        // di=0(E)이 가장 굵게, di=ns-1(e)이 가장 얇게
        ctx.lineWidth = Math.max(0.5, 0.5 + (ns - 1 - di) * 0.22);
        ctx.beginPath(); ctx.moveTo(PAD_LEFT, y); ctx.lineTo(PAD_LEFT + gridW, y); ctx.stroke();
    }

    // ── 현 이름 + 뮤트/개방 기호 (왼쪽) ──
    for (let di = 0; di < ns; di++) {
        const y     = diy(di);
        const fret  = strings[si(di)];
        const name  = strNames[di]; // di=0='E', di=1='A', ..., di=5='e'

        ctx.font = 'bold 7px Inter,sans-serif';
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillStyle = fret !== null ? T.label : '#2a3050';
        ctx.fillText(name, PAD_LEFT - 6, y);

        if (fret === null) {
            ctx.strokeStyle = T.mute; ctx.lineWidth = 1.2;
            const mx = PAD_LEFT - 20, d = 3;
            ctx.beginPath(); ctx.moveTo(mx-d,y-d); ctx.lineTo(mx+d,y+d); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(mx+d,y-d); ctx.lineTo(mx-d,y+d); ctx.stroke();
        } else if (fret === 0) {
            ctx.strokeStyle = T.open; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(PAD_LEFT - 20, y, 3.5, 0, Math.PI * 2); ctx.stroke();
        }
    }

    // ── 바레 (세로 막대) ──
    // barre.from: strings 인덱스 (0=e가는현, ns-1=E굵은현)
    // di 변환: di_from = ns-1-fromI (e=di 가장 아래, E=di 가장 위)
    if (barre) {
        const relFret = barre.fret - baseFret + 1;
        if (relFret >= 1 && relFret <= nFrets) {
            const bx = fretX(relFret);
            const fromI = barre.from ?? 0;
            const di_from = ns - 1 - fromI; // e쪽 fromI → 아래쪽 di
            // 바레: di=0(E,위) ~ di=di_from(fromI에 해당하는 위치)
            const yTop    = diy(0);         // E현 (위)
            const yBottom = diy(di_from);   // fromI에 해당 (아래쪽)
            const barTop  = Math.min(yTop, yBottom) - 5;
            const barH    = Math.abs(yBottom - yTop) + 10;
            ctx.fillStyle = T.barre; ctx.globalAlpha = 0.88;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(bx - 5.5, barTop, 11, barH, 5.5);
            else ctx.rect(bx - 5.5, barTop, 11, barH);
            ctx.fill(); ctx.globalAlpha = 1;
            ctx.font = 'bold 6.5px Inter,sans-serif';
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('1', bx, barTop + barH / 2);
        }
    }

    // ── 손가락 점 + 번호 ──
    for (let di = 0; di < ns; di++) {
        const fret = strings[si(di)];
        if (fret === null || fret === 0) continue;
        const relFret = fret - baseFret + 1;
        if (relFret < 1 || relFret > nFrets) continue;
        const bx = fretX(relFret);
        const by = diy(di);
        const fn = fingers ? fingers[si(di)] : null;
        // 바레로 이미 덮인 현 스킵
        const isBarred = barre && fret === barre.fret &&
            (barre.from !== undefined ? si(di) >= barre.from : true);
        if (isBarred) continue;

        ctx.fillStyle = T.dot;
        ctx.beginPath(); ctx.arc(bx, by, 6, 0, Math.PI * 2); ctx.fill();

        if (fn && fn >= 1 && fn <= 4) {
            ctx.font = 'bold 7px Inter,sans-serif';
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(String(fn), bx, by);
        } else if (inst === 'electric1') {
            ctx.font = 'bold 6px Inter,sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const activeIdx = strings.filter(f2 => f2 !== null && f2 > 0).indexOf(fret);
            ctx.fillText(['R','5','8'][activeIdx] ?? '', bx, by);
        }
    }

    // ── 파워코드 루트 강조 링 ──
    if (inst === 'electric1') {
        for (let di = 0; di < ns; di++) {
            const fret = strings[si(di)];
            if (fret === null || fret === 0) continue;
            const relFret = fret - baseFret + 1;
            if (relFret < 1 || relFret > nFrets) continue;
            const activeIdx = strings.filter(f2 => f2 !== null && f2 > 0).indexOf(fret);
            if (activeIdx !== 0) continue;
            ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 1.8;
            ctx.beginPath(); ctx.arc(fretX(relFret), diy(di), 9, 0, Math.PI * 2); ctx.stroke();
        }
    }

    // ── 코드명 (좌상단) ──
    ctx.font = `bold ${Math.round(reqH * 0.13)}px 'JetBrains Mono',Inter,monospace`;
    ctx.fillStyle = '#b0c4ff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(chordName || '', 2, 2);

    // ── 악기 타입 라벨 (우상단) ──
    const instLabel = { acoustic:'코드폼', electric1:'파워코드', electric2:'트라이어드', bass:'베이스' };
    if (instLabel[inst]) {
        ctx.font = 'bold 6.5px Inter,sans-serif';
        ctx.fillStyle = T.label; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText(instLabel[inst], reqW - 3, 3);
    }
}

/**
 * 코드박스 편집 팝업 열기
 */
function _openCbEditPopup(barIdx, slotIdx, anchorEl) {
    // 기존 팝업 닫기
    _closeCbEditPopup();

    const currentName = _cbState.bars[barIdx]?.slots[slotIdx]?.chordName || '';

    const popup = document.createElement('div');
    popup.className = 'cb-edit-popup';

    // 퀵 코드 목록 (주요 코드)
    const quickChords = ['C','Cm','C7','Cmaj7','D','Dm','D7','E','Em','E7',
                         'F','Fm','Fmaj7','G','Gm','G7','A','Am','A7','Amaj7',
                         'B','Bm','B7','Bb','Bbm'];

    popup.innerHTML = `
        <div class="cbep-title"><i class="fas fa-music"></i> 코드 수정 — 마디 ${barIdx+1} · ${slotIdx+1}번째 박자</div>
        <input class="cbep-input" id="cbepInput" type="text" value="${currentName}"
               placeholder="코드명 입력 (예: Am, G7)" maxlength="10" autocomplete="off" spellcheck="false">
        <div class="cbep-quick" id="cbepQuick">
            ${quickChords.map(c => `<button class="cbep-qbtn" data-chord="${c}">${c}</button>`).join('')}
        </div>
        <div class="cbep-actions">
            <button class="cbep-ok" id="cbepOk"><i class="fas fa-check"></i> 적용</button>
            ${currentName ? `<button class="cbep-del" id="cbepDel"><i class="fas fa-trash"></i></button>` : ''}
            <button class="cbep-cancel" id="cbepCancel">취소</button>
        </div>
    `;

    document.body.appendChild(popup);
    _cbState.editPopup = popup;

    // 위치 계산
    const anchorRect = anchorEl.getBoundingClientRect();
    let top  = anchorRect.bottom + window.scrollY + 6;
    let left = anchorRect.left   + window.scrollX;
    // 화면 밖으로 나가지 않도록 조정
    if (left + 240 > window.innerWidth) left = window.innerWidth - 248;
    if (top + 280 > window.scrollY + window.innerHeight) top = anchorRect.top + window.scrollY - 284;
    popup.style.top  = top  + 'px';
    popup.style.left = left + 'px';

    // 포커스
    const input = popup.querySelector('#cbepInput');
    setTimeout(() => input?.focus(), 50);

    // 이벤트 바인딩
    const apply = () => {
        const newName = (input?.value || '').trim();
        _applyCbChordEdit(barIdx, slotIdx, newName);
        _closeCbEditPopup();
    };
    const del = () => {
        _applyCbChordEdit(barIdx, slotIdx, '');
        _closeCbEditPopup();
    };

    popup.querySelector('#cbepOk')?.addEventListener('click', apply);
    popup.querySelector('#cbepDel')?.addEventListener('click', del);
    popup.querySelector('#cbepCancel')?.addEventListener('click', _closeCbEditPopup);
    input?.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); apply(); }
        if (e.key === 'Escape') { e.preventDefault(); _closeCbEditPopup(); }
    });
    popup.querySelector('#cbepQuick')?.addEventListener('click', e => {
        const btn = e.target.closest('.cbep-qbtn');
        if (!btn) return;
        if (input) input.value = btn.dataset.chord;
        apply();
    });

    // 외부 클릭 시 닫기
    setTimeout(() => {
        document.addEventListener('click', _onCbOutsideClick);
    }, 0);
}

function _onCbOutsideClick(e) {
    if (_cbState.editPopup && !_cbState.editPopup.contains(e.target)) {
        _closeCbEditPopup();
    }
}

function _closeCbEditPopup() {
    if (_cbState.editPopup) {
        _cbState.editPopup.remove();
        _cbState.editPopup = null;
    }
    document.removeEventListener('click', _onCbOutsideClick);
}

/**
 * 코드박스 코드 수정 → 타브 악보 동기화
 */
function _applyCbChordEdit(barIdx, slotIdx, newChordName) {
    if (!_cbState.bars[barIdx]) return;

    // 1) 코드박스 내부 상태 업데이트
    const slot = _cbState.bars[barIdx].slots[slotIdx];
    if (!slot) return;
    const oldName = slot.chordName;
    slot.chordName = newChordName;

    // 2) DOM 업데이트
    const track   = document.getElementById('chordBoxTrack');
    const barEls  = track?.querySelectorAll('.cb-bar');
    const barEl   = barEls?.[barIdx];
    const slotEls = barEl?.querySelectorAll('.cb-slot');
    const slotEl  = slotEls?.[slotIdx];
    if (slotEl) {
        const chordEl = slotEl.querySelector('.cb-slot-chord');
        if (chordEl) {
            chordEl.textContent = newChordName || '—';
            chordEl.dataset.chordName = newChordName;
            chordEl.classList.toggle('cb-empty', !newChordName);
        }
    }

    // 3) 타브 렌더러의 bars 동기화
    if (state.bars && state.bars[barIdx] && window.tabRenderer) {
        const R   = window.tabRenderer;
        const bar = R.bars?.[barIdx];
        if (bar) {
            // bar.chords 배열에서 해당 슬롯 찾아서 업데이트
            if (!bar.chords) bar.chords = [];

            // beatOffset을 slotIdx로 매핑 (각 슬롯 = 1 beat)
            let existing = bar.chords.find(c =>
                Math.round(c.beatOffset ?? c.slotIndex ?? 0) === slotIdx
            );
            if (newChordName) {
                const chordObj = {
                    name: newChordName, root: newChordName.replace(/[^A-G#b]/g,''),
                    type: 'major', _manual: true
                };
                if (existing) {
                    existing.chord = chordObj;
                } else {
                    bar.chords.push({
                        chord:      chordObj,
                        slotIndex:  slotIdx,
                        beatOffset: slotIdx,
                        beatLen:    1,
                        totalSlots: 4,
                    });
                    bar.chords.sort((a,b) => (a.beatOffset ?? a.slotIndex ?? 0) - (b.beatOffset ?? b.slotIndex ?? 0));
                }
            } else {
                // 삭제
                if (existing) {
                    const idx = bar.chords.indexOf(existing);
                    bar.chords.splice(idx, 1);
                }
            }
            bar.chord = bar.chords[0]?.chord || null; // 하위호환

            // tabEditor를 통해 쓰기 + 재렌더
            if (window.tabEditor) {
                if (newChordName) {
                    window.tabEditor._writeChord(barIdx, slotIdx, newChordName);
                } else {
                    window.tabEditor._writeChord(barIdx, slotIdx, '');
                }
                window.tabEditor._rerender();
            } else {
                R.render();
            }
        }
    }

    // 4) 코드 다이어그램 갱신
    if (state.bars) {
        const allChordNames = new Map();
        _cbState.bars.forEach(barData => {
            barData.slots.forEach(s => {
                if (s.chordName) allChordNames.set(s.chordName, (allChordNames.get(s.chordName)||0)+1);
            });
        });
        const topChords = [...allChordNames.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n])=>n);
        if (topChords.length) {
            dom.mainChords.textContent = topChords.join(', ');
            renderChordDiagrams(topChords);
        }
    }

    // 5) 프리뷰 업데이트 (강제 재렌더)
    _CBP.sequence = Array(7).fill(null);
    updateChordBoxPreview(_cbState.currentBarIdx, _cbState.currentBeat);

    showToast(`코드 박스 수정: 마디 ${barIdx+1} · ${slotIdx+1}번째 → ${newChordName || '(삭제)'}`, 'success');
}

/**
 * 전조 시 코드박스 동기화
 */
function refreshChordBoxAfterTranspose() {
    _buildChordBoxData();
    _renderChordBoxTrack();
    _CBP.sequence = Array(7).fill(null); // 강제 재렌더
    updateChordBoxPreview(_cbState.currentBarIdx, _cbState.currentBeat);
}



/* ══════════════════════════════════════════════════════════════
   수동 코드 편집 기능 (v4.1)
   - 악보 위 코드명 클릭 → 팝업 코드 선택
   - 유사 구간 자동 반영 (수동 보호된 마디 제외)
   - 수동 변경 마디는 전조/재분석에서 보호
══════════════════════════════════════════════════════════════ */

// 전체 코드 목록 (선택 팝업용)
const ALL_CHORD_NAMES = (() => {
    const notes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const types = [
        { suffix: '',      label: '메이저'      },
        { suffix: 'm',     label: '마이너'      },
        { suffix: '7',     label: '7th'         },
        { suffix: 'm7',    label: 'm7'          },
        { suffix: 'maj7',  label: 'maj7'        },
        { suffix: 'sus2',  label: 'sus2'        },
        { suffix: 'sus4',  label: 'sus4'        },
        { suffix: 'add9',  label: 'add9'        },
        { suffix: 'madd9', label: 'madd9'       },
        { suffix: 'm9',    label: 'm9'          },
        { suffix: 'maj9',  label: 'maj9'        },
        { suffix: '11',    label: '11'          },
        { suffix: 'm11',   label: 'm11'         },
        { suffix: 'dim',   label: 'dim'         },
        { suffix: 'dim7',  label: 'dim7'        },
        { suffix: 'm7b5',  label: 'm7b5'        },
        { suffix: 'aug',   label: 'aug'         },
        { suffix: '5',     label: '5 (파워)'    },
        { suffix: '6',     label: '6'           },
        { suffix: 'm6',    label: 'm6'          },
    ];
    return { notes, types };
})();

/* ── 수동 편집 적용: bars의 슬롯 코드를 수동 코드로 덮어씀 (멀티슬롯 지원) ──
   v4.3: tabData.strings(프렛폼)도 새 코드로 재생성하여 코드 악보에 반영 */
function applyManualEditsToTabData(tabData, bars) {
    if (!state.manualChordEdits || !bars) return;

    Object.entries(state.manualChordEdits).forEach(([key, edit]) => {
        // key 형식: "barIdx_slotIdx" (v4.2) 또는 숫자 문자열 (하위호환)
        let barIdx, slotIdx;
        if (key.includes('_')) {
            [barIdx, slotIdx] = key.split('_').map(Number);
        } else {
            barIdx  = parseInt(key);
            slotIdx = 0;
        }

        const bar = bars[barIdx];
        if (!bar) return;

        const manualChord = { ...edit.chord, _manual: true };

        // ── 새 코드의 프렛 폼 재생성 ──
        let newStrings = null;
        try {
            const inst = state.currentInstrument;
            if (inst === 'bass') {
                newStrings = tabConverter._getBassForm(manualChord);
            } else if (inst === 'electric1') {
                newStrings = tabConverter._getPowerChordForm(manualChord);
            } else if (inst === 'electric2') {
                newStrings = tabConverter._getTriadForm(manualChord);
            } else {
                newStrings = tabConverter._getAcousticForm(manualChord);
            }
        } catch(e) { newStrings = null; }

        // bar.chords 배열에서 해당 슬롯 업데이트
        if (bar.chords?.length > slotIdx) {
            bar.chords[slotIdx] = { ...bar.chords[slotIdx], chord: manualChord };
        } else if (bar.chords) {
            // 슬롯이 없으면 추가
            while (bar.chords.length <= slotIdx) {
                bar.chords.push({ chord: null, slotIndex: bar.chords.length, totalSlots: slotIdx + 1, beatLen: 4 });
            }
            bar.chords[slotIdx] = { chord: manualChord, slotIndex: slotIdx, totalSlots: bar.chords.length, beatLen: 4 };
        }

        // 하위호환: 슬롯0이면 bar.chord도 업데이트
        if (slotIdx === 0) {
            bar.chord = manualChord;
        }

        // tabData에서 해당 마디+슬롯의 노트 chord + strings(프렛폼)도 업데이트
        if (tabData) {
            let found = false;
            tabData.forEach(note => {
                if (note.barIndex === barIdx && (note.slotIndex ?? 0) === slotIdx) {
                    note.chord   = manualChord;
                    note.type    = 'chord';
                    if (newStrings) note.strings = newStrings;
                    found = true;
                }
            });

            // 해당 슬롯에 노트가 없으면 새로 추가 (rest → chord 변환)
            if (!found && newStrings) {
                const barDur = (60 / state.bpm) * 4;
                const startTime = barIdx * barDur + slotIdx * (barDur / (bar.chords?.length || 1));
                tabData.push({
                    time      : startTime,
                    type      : 'chord',
                    strings   : newStrings,
                    chord     : manualChord,
                    barIndex  : barIdx,
                    slotIndex : slotIdx,
                    totalSlots: bar.chords?.length || 1,
                    beatLen   : bar.chords?.[slotIdx]?.beatLen ?? 4,
                });
            }
        }
    });
}

/* ── 클릭 이벤트 바인딩 ── */
function bindChordClickEvents() {
    const wrapper = document.getElementById('tabSvgWrapper');
    if (!wrapper) return;

    // 기존 이벤트 제거 후 재등록
    wrapper.removeEventListener('click', _onChordClick);
    wrapper.addEventListener('click', _onChordClick);
}

function _onChordClick(e) {
    const target = e.target.closest('.chord-click');
    if (!target) return;
    const barIdx  = parseInt(target.dataset.bar);
    const slotIdx = parseInt(target.dataset.slot ?? '0');
    if (isNaN(barIdx)) return;
    const currentChordName = target.dataset.chord || '';
    showChordEditPopup(barIdx, slotIdx, currentChordName, target);
}

/* ── 코드 편집 팝업 표시 ── */
let _chordEditPopup = null;

function showChordEditPopup(barIdx, slotIdx, currentChordName, anchorEl) {
    // 기존 팝업 제거
    if (_chordEditPopup) { _chordEditPopup.remove(); _chordEditPopup = null; }

    const popup = document.createElement('div');
    popup.id = 'chordEditPopup';
    popup.style.cssText = `
        position:fixed; z-index:9999;
        background:#fff; border:1.5px solid #e2e8f0;
        border-radius:14px; box-shadow:0 8px 32px rgba(0,0,0,0.18);
        padding:16px; width:340px; max-height:480px;
        display:flex; flex-direction:column; gap:10px;
        font-family:'Inter',sans-serif;
    `;

    const bar = state.bars?.[barIdx];
    const editKey = `${barIdx}_${slotIdx}`;
    const isManual = state.manualChordEdits?.[editKey] != null
                  || state.manualChordEdits?.[barIdx] != null;

    popup.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
            <div style="font-size:0.9rem;font-weight:700;color:#1e2a45;flex:1;">
                🎵 마디 ${barIdx+1}${slotIdx > 0 ? ` (슬롯 ${slotIdx+1})` : ''} 코드 편집
                ${isManual ? '<span style="font-size:0.72rem;color:#7c3aed;margin-left:6px;">✏ 수동편집됨</span>' : ''}
            </div>
            ${currentChordName ? '<button id="chordEditDeleteBtn" title="이 슬롯 코드 삭제" style="padding:4px 10px;background:#fee2e2;color:#dc2626;border:1.5px solid #fecaca;border-radius:7px;cursor:pointer;font-size:0.76rem;font-weight:700;white-space:nowrap;"><i class=\'fas fa-trash-alt\'></i> 코드 삭제</button>' : ''}
            <button id="chordEditClose" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:#94a3b8;padding:2px 6px;">✕</button>
        </div>
        <div style="font-size:0.78rem;color:#64748b;">${currentChordName ? '현재: <strong style=\'color:#1a3a7a;\'>' + currentChordName + '</strong> &nbsp;→&nbsp; 새 코드 선택 또는 직접 입력' : '<strong style=\'color:#2563eb;\'>+ 코드 추가</strong> — 아래에서 선택하거나 직접 입력하세요'}</div>

        <div style="display:flex;gap:6px;">
            <input id="chordEditSearch" type="text" placeholder="코드 검색 (예: Am7, F#m...)"
                style="flex:1;padding:7px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.82rem;outline:none;"
                value="${currentChordName}">
            <button id="chordEditApplyDirect" style="padding:7px 12px;background:#1a3a7a;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.78rem;white-space:nowrap;">적용</button>
        </div>

        <div style="font-size:0.75rem;color:#64748b;display:flex;align-items:center;gap:8px;">
            <span>루트:</span>
            <div id="chordEditNotes" style="display:flex;flex-wrap:wrap;gap:3px;"></div>
        </div>
        <div style="font-size:0.75rem;color:#64748b;display:flex;align-items:center;gap:8px;">
            <span>타입:</span>
            <div id="chordEditTypes" style="display:flex;flex-wrap:wrap;gap:3px;"></div>
        </div>

        <div id="chordEditResults" style="flex:1;overflow-y:auto;display:flex;flex-wrap:wrap;gap:4px;max-height:160px;border-top:1px solid #f1f5f9;padding-top:8px;"></div>

        <div style="display:flex;gap:6px;border-top:1px solid #f1f5f9;padding-top:8px;">
            <label style="display:flex;align-items:center;gap:5px;font-size:0.78rem;color:#64748b;cursor:pointer;">
                <input type="checkbox" id="chordEditAutoSync"
                    style="accent-color:#7c3aed;">
                유사 구간 자동 반영
            </label>
            ${isManual ? '<button id="chordEditRemoveManual" style="margin-left:auto;padding:4px 10px;background:#fee2e2;color:#dc2626;border:none;border-radius:6px;cursor:pointer;font-size:0.75rem;">수동편집 해제</button>' : ''}
        </div>
    `;

    document.body.appendChild(popup);
    _chordEditPopup = popup;

    // 위치 계산
    _positionPopup(popup, anchorEl);

    // ── 코드 삭제 버튼 ──
    popup.querySelector('#chordEditDeleteBtn')?.addEventListener('click', () => {
        if (!confirm(`마디 ${barIdx+1}의 코드를 삭제할까요?`)) return;
        applyChordEdit(barIdx, slotIdx, '', popup);
    });

    // 루트 버튼 렌더
    const notesContainer = popup.querySelector('#chordEditNotes');
    let selectedNote = currentChordName.match(/^([A-G][#b]?)/)?.[1] || '';
    let selectedType = '';

    ALL_CHORD_NAMES.notes.forEach(note => {
        const btn = document.createElement('button');
        btn.textContent = note;
        btn.style.cssText = `padding:2px 7px;border-radius:5px;border:1px solid #cbd5e1;cursor:pointer;font-size:0.75rem;background:${note===selectedNote?'#1a3a7a':'#f8fafc'};color:${note===selectedNote?'#fff':'#374151'};`;
        btn.addEventListener('click', () => {
            selectedNote = note;
            notesContainer.querySelectorAll('button').forEach(b => {
                b.style.background = b.textContent===note?'#1a3a7a':'#f8fafc';
                b.style.color = b.textContent===note?'#fff':'#374151';
            });
            updateSearchInput();
            renderChordResults();
        });
        notesContainer.appendChild(btn);
    });

    // 타입 버튼 렌더
    const typesContainer = popup.querySelector('#chordEditTypes');
    if (currentChordName && selectedNote) {
        selectedType = currentChordName.slice(selectedNote.length);
    }

    ALL_CHORD_NAMES.types.forEach(({ suffix, label }) => {
        const btn = document.createElement('button');
        btn.textContent = suffix || '메이저';
        btn.title = label;
        btn.style.cssText = `padding:2px 7px;border-radius:5px;border:1px solid #cbd5e1;cursor:pointer;font-size:0.72rem;background:${suffix===selectedType?'#7c3aed':'#f8fafc'};color:${suffix===selectedType?'#fff':'#374151'};`;
        btn.addEventListener('click', () => {
            selectedType = suffix;
            typesContainer.querySelectorAll('button').forEach(b => {
                const bSuffix = ALL_CHORD_NAMES.types.find(t => (t.suffix||'메이저')===b.textContent)?.suffix ?? b.textContent;
                b.style.background = bSuffix===selectedType?'#7c3aed':'#f8fafc';
                b.style.color = bSuffix===selectedType?'#fff':'#374151';
            });
            updateSearchInput();
            renderChordResults();
        });
        typesContainer.appendChild(btn);
    });

    function updateSearchInput() {
        if (selectedNote) {
            popup.querySelector('#chordEditSearch').value = selectedNote + selectedType;
        }
    }

    // 검색 결과 렌더
    function renderChordResults(filter = '') {
        const resultsEl = popup.querySelector('#chordEditResults');
        resultsEl.innerHTML = '';
        const searchVal = (filter || popup.querySelector('#chordEditSearch').value || '').trim().toLowerCase();

        let candidates = [];
        if (selectedNote) {
            ALL_CHORD_NAMES.types.forEach(({ suffix }) => {
                candidates.push(selectedNote + suffix);
            });
        } else {
            ALL_CHORD_NAMES.notes.forEach(note => {
                ALL_CHORD_NAMES.types.forEach(({ suffix }) => {
                    candidates.push(note + suffix);
                });
            });
        }

        if (searchVal) {
            candidates = candidates.filter(c => c.toLowerCase().includes(searchVal));
        }

        candidates.slice(0, 40).forEach(chordName => {
            const btn = document.createElement('button');
            btn.textContent = chordName;
            const isCurrent = chordName === currentChordName;
            btn.style.cssText = `padding:4px 8px;border-radius:6px;border:1.5px solid ${isCurrent?'#1a3a7a':'#e2e8f0'};cursor:pointer;font-size:0.78rem;font-weight:600;background:${isCurrent?'#eff6ff':'#f8fafc'};color:${isCurrent?'#1a3a7a':'#374151'};`;
            btn.addEventListener('click', () => applyChordEdit(barIdx, slotIdx, chordName, popup));
            resultsEl.appendChild(btn);
        });
    }

    renderChordResults();

    // 검색 입력 이벤트
    popup.querySelector('#chordEditSearch').addEventListener('input', (e) => {
        renderChordResults(e.target.value);
    });

    // 직접 적용 버튼
    popup.querySelector('#chordEditApplyDirect').addEventListener('click', () => {
        const val = popup.querySelector('#chordEditSearch').value.trim();
        if (val) applyChordEdit(barIdx, slotIdx, val, popup);
    });

    // 엔터키
    popup.querySelector('#chordEditSearch').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = popup.querySelector('#chordEditSearch').value.trim();
            if (val) applyChordEdit(barIdx, slotIdx, val, popup);
        }
    });

    // 닫기
    popup.querySelector('#chordEditClose').addEventListener('click', () => {
        popup.remove(); _chordEditPopup = null;
    });

    // 수동 편집 해제 버튼
    const removeBtn = popup.querySelector('#chordEditRemoveManual');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            delete state.manualChordEdits[editKey];
            delete state.manualChordEdits[barIdx];  // 구버전 키도 삭제
            showToast(`마디 ${barIdx+1} 수동편집 해제됨`, 'info');
            popup.remove(); _chordEditPopup = null;
            reRenderTab();
        });
    }

    // 바깥 클릭 닫기
    setTimeout(() => {
        document.addEventListener('click', _closePopupOutside, { once: true });
    }, 100);
}

function _closePopupOutside(e) {
    if (_chordEditPopup && !_chordEditPopup.contains(e.target)) {
        _chordEditPopup.remove();
        _chordEditPopup = null;
    }
}

function _positionPopup(popup, anchorEl) {
    // 앵커 요소의 SVG 좌표를 화면 좌표로 변환
    let rect;
    try {
        if (anchorEl && anchorEl.getBoundingClientRect) {
            rect = anchorEl.getBoundingClientRect();
        }
    } catch(e) {}

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = 340, ph = 480;

    let left = rect ? rect.left : vw/2 - pw/2;
    let top  = rect ? rect.bottom + 6 : vh/2 - ph/2;

    // 화면 밖으로 나가지 않게 클램핑
    left = Math.max(8, Math.min(left, vw - pw - 8));
    top  = Math.max(8, Math.min(top, vh - ph - 8));

    popup.style.left = `${left}px`;
    popup.style.top  = `${top}px`;
}

/* ── 코드 편집 실제 적용 ── */
function applyChordEdit(barIdx, slotIdx, chordName, popup) {
    const autoSync = popup.querySelector('#chordEditAutoSync')?.checked ?? false;

    // ── 코드 삭제 처리 (빈 문자열) ──
    if (!chordName) {
        const bars = state.bars;
        if (!bars?.[barIdx]) return;
        const bar = bars[barIdx];
        if (bar.chords && bar.chords[slotIdx] !== undefined) {
            bar.chords[slotIdx].chord = { name: '', _manual: true };
        } else if (!bar.chords) {
            bar.chord = { name: '', _manual: true };
        }
        // manualChordEdits 기록
        if (!state.manualChordEdits) state.manualChordEdits = {};
        state.manualChordEdits[`${barIdx}_${slotIdx}`] = { chord: { name: '' }, protected: true, barIdx, slotIdx };
        popup.remove();
        _chordEditPopup = null;
        showToast(`마디 ${barIdx+1} 슬롯${slotIdx+1}: 코드 삭제됨`, 'success');
        reRenderTab();
        return;
    }

    const autoSyncFinal = autoSync;

    // 코드 객체 생성
    const rootMatch = chordName.match(/^([A-G][#b]?)/);
    const root = rootMatch?.[1] || chordName;
    const type = chordName.slice(root.length) || 'major';
    // 타입 정규화 (빈 문자열 → 'major')
    const typeNorm = type === '' ? 'major' : type;

    const newChord = { root, type: typeNorm, name: chordName, _manual: true };

    // 현재 슬롯의 기존 코드 (유사도 비교용)
    const editKey = `${barIdx}_${slotIdx}`;
    const bar = state.bars?.[barIdx];
    const oldChordName = slotIdx > 0
        ? bar?.chords?.[slotIdx]?.chord?.name || bar?.chord?.name || null
        : bar?.chord?.name || null;

    // 수동 편집 등록 (보호됨) — slotIdx 도 함께 저장
    if (!state.manualChordEdits) state.manualChordEdits = {};
    state.manualChordEdits[editKey] = { chord: newChord, protected: true, barIdx, slotIdx };

    // 유사 구간 자동 반영 (autoSyncFinal=true일 때, oldChord가 같은 마디만)
    if (autoSyncFinal && oldChordName && state.bars) {
        let autoCount = 0;
        state.bars.forEach((b, bi) => {
            if (bi === barIdx) return;  // 이미 처리한 마디 스킵

            // 이 마디의 모든 슬롯 중 보호된 슬롯이 있는지 제외
            const allSlotsCount = b.chords?.length || 1;
            for (let si = 0; si < allSlotsCount; si++) {
                const sk = `${bi}_${si}`;
                if (state.manualChordEdits?.[sk]?.protected) continue;  // 보호된 슬롯 스킵
                if (state.manualChordEdits?.[bi]?.protected) continue;  // 구버전 코드

                const slotChordName = b.chords?.[si]?.chord?.name || b.chord?.name;
                if (slotChordName === oldChordName) {
                    state.manualChordEdits[sk] = { chord: { ...newChord }, protected: false, barIdx: bi, slotIdx: si };
                    autoCount++;
                }
            }
        });
        if (autoCount > 0) {
            showToast(`마디 ${barIdx+1} 슬롯${slotIdx+1}: ${chordName} 적용 + 유사 ${autoCount}개 슬롯 자동 반영`, 'success');
        } else {
            showToast(`마디 ${barIdx+1} 슬롯${slotIdx+1}: ${chordName} 적용`, 'success');
        }
    } else {
        showToast(`마디 ${barIdx+1} 슬롯${slotIdx+1}: ${chordName} 적용`, 'success');
    }

    popup.remove();
    _chordEditPopup = null;

    // 악보 재렌더
    reRenderTab();
}

/* ══════════════════════════════════════════════════════════════
   TAB 편집기 UI 초기화 v2.0 — 분석 완료 후 호출
══════════════════════════════════════════════════════════════ */
function initTabEditorUI() {
    const toolbar = document.getElementById('teToolbar');
    if (!toolbar) return;
    toolbar.style.display = 'flex';

    const btnEditMode   = document.getElementById('btnEditMode');
    const teEditBadge   = document.getElementById('teEditBadge');
    const teTools       = document.getElementById('teTools');
    const teTechPalette = document.getElementById('teTechPalette');
    const btnTeUndo     = document.getElementById('btnTeUndo');
    const btnTeRedo     = document.getElementById('btnTeRedo');
    const btnTeAddBar   = document.getElementById('btnTeAddBar');

    const editor = window.tabEditor;
    if (!editor) return;

    // 초기 상태: 편집 모드 OFF
    editor.setActive(false);
    teEditBadge.textContent = 'OFF';
    btnEditMode.classList.remove('active');
    _setEnabled(false);

    // 편집 모드 ON/OFF
    btnEditMode.addEventListener('click', () => {
        const isOn = editor.toggle();
        teEditBadge.textContent = isOn ? 'ON' : 'OFF';
        btnEditMode.classList.toggle('active', isOn);
        _setEnabled(isOn);
        const wrap = document.getElementById('tabScoreContainer');
        if (wrap) wrap.classList.toggle('edit-active', isOn);
        showToast(isOn
            ? '✏️ 편집 모드 ON — 코드명 영역 또는 줄 칸을 클릭하여 편집하세요.'
            : '편집 모드 OFF', 'info');
    });

    // 도구 버튼 선택
    toolbar.querySelectorAll('.te-tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            toolbar.querySelectorAll('.te-tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            editor.setTool(btn.dataset.tool);
        });
    });

    // 실행 취소 / 다시 실행
    btnTeUndo?.addEventListener('click', () => editor.undo());
    btnTeRedo?.addEventListener('click', () => editor.redo());

    // 마디 추가
    btnTeAddBar?.addEventListener('click', () => editor.addBar());

    function _setEnabled(on) {
        [teTools, teTechPalette, btnTeUndo, btnTeRedo, btnTeAddBar].forEach(el => {
            if (!el) return;
            el.style.opacity       = on ? '1' : '0.4';
            el.style.pointerEvents = on ? ''  : 'none';
        });
    }
}
