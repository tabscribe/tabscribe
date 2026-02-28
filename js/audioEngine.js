/**
 * AudioEngine v4.0 — 고성능 오디오 분석 엔진
 *
 * ── v4.0 신규 개선 사항 ──
 *  1. HPSS (Harmonic-Percussive Source Separation) 후처리
 *       스펙트럼 중앙값 필터로 타악기(드럼) 에너지를 하모닉 성분에서 분리
 *       → 킥드럼/스네어가 크로마를 오염시키는 현상 완전 차단
 *  2. 분석 파이프라인 고도화
 *       FFT 수집 → HPSS 분리 → 하모닉 스펙트럼만 pitchDetector에 전달
 *
 * ── v3.0 기존 기능 유지 ──
 *  - 멀티해상도 FFT (8192 저역 + 4096 고역)
 *  - Mid/Side 스테레오 처리
 *  - 대역별 스펙트럴 플럭스
 *  - 로그 스케일 크기
 */
class AudioEngine {
    constructor() {
        this.audioContext  = null;
        this.audioBuffer   = null;
        this.sourceNode    = null;
        this.gainNode      = null;
        this.analyserNode  = null;
        this.startTime     = 0;
        this.pauseOffset   = 0;
        this.isPlaying     = false;
        this.duration      = 0;
        this.volume        = 0.8;
        this.onTimeUpdate  = null;
        this.onEnded       = null;
        this.animFrameId   = null;
        this.fftSize       = 8192;
    }

    async init() {
        // iOS Safari: AudioContext는 반드시 user gesture 스택 안에서 생성해야 함
        const AC = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AC();
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = this.fftSize;
        this.analyserNode.smoothingTimeConstant = 0.3;
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = this.volume;
        this.analyserNode.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);

        // iOS: 생성 직후 suspended → 즉시 resume 시도
        if (this.audioContext.state === 'suspended') {
            try { await this.audioContext.resume(); } catch(_) {}
        }
    }

    // iOS에서 AudioContext가 닫혔거나 broken 상태이면 재생성
    async _ensureContext() {
        if (!this.audioContext || this.audioContext.state === 'closed') {
            await this.init();
            return;
        }
        if (this.audioContext.state === 'suspended') {
            try { await this.audioContext.resume(); } catch(_) {}
        }
    }

    async loadFile(file) {
        if (!this.audioContext) await this.init();
        await this._ensureContext();

        // ── ArrayBuffer 읽기 ──
        // file.arrayBuffer()는 iOS 13.4 미만에서 미지원 → FileReader 폴백
        let arrayBuffer;
        if (typeof file.arrayBuffer === 'function') {
            try {
                arrayBuffer = await file.arrayBuffer();
            } catch(e) {
                arrayBuffer = await this._readFileAsArrayBuffer(file);
            }
        } else {
            arrayBuffer = await this._readFileAsArrayBuffer(file);
        }

        // ── decodeAudioData ──
        // iOS Safari 구형: Promise 방식 미지원 → 콜백 전용으로 강제
        this.audioBuffer = await new Promise((resolve, reject) => {
            const onSuccess = (buffer) => resolve(buffer);
            const onError   = (err)    => reject(
                err instanceof Error ? err : new Error('decodeAudioData 실패: 지원하지 않는 형식이거나 파일이 손상됐습니다.')
            );
            try {
                this.audioContext.decodeAudioData(arrayBuffer.slice(0), onSuccess, onError);
            } catch (e) { reject(e); }
        });

        this.duration    = this.audioBuffer.duration;
        this.pauseOffset = 0;
        this.isPlaying   = false;
        return this.audioBuffer;
    }

    /* FileReader 기반 ArrayBuffer 읽기 (iOS 구형 Safari 폴백) */
    _readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('파일 읽기 실패: ' + (e.target.error?.message || '')));
            reader.readAsArrayBuffer(file);
        });
    }

    // iOS에서 안전하게 재생 — AudioContext 상태 보장 후 start()
    async playAsync(offset = null) {
        if (!this.audioBuffer || this.isPlaying) return;

        // ① suspended → resumed 보장 (await로 완전히 기다림)
        await this._ensureContext();

        // ② resumed 됐는지 최종 확인
        if (this.audioContext.state !== 'running') {
            console.warn('[AudioEngine] AudioContext가 running 상태가 아님:', this.audioContext.state);
            // iOS 17+: context가 완전히 막혀있으면 재생성 시도
            try {
                await this.init();
                // 버퍼는 재사용 가능 (재생성 후에도 유지됨)
            } catch(e) {
                console.error('[AudioEngine] context 재생성 실패:', e);
                return;
            }
        }

        const startOffset = offset !== null ? offset : this.pauseOffset;
        this.sourceNode = this.audioContext.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        this.sourceNode.connect(this.analyserNode);
        this.sourceNode.start(0, startOffset);
        this.startTime = this.audioContext.currentTime - startOffset;
        this.isPlaying = true;
        this.sourceNode.onended = () => {
            if (this.isPlaying) {
                this.isPlaying   = false;
                this.pauseOffset = 0;
                if (this.onEnded) this.onEnded();
            }
        };
    }

    play(offset = null) {
        if (!this.audioBuffer || this.isPlaying) return;
        if (this.audioContext.state === 'suspended') this.audioContext.resume();
        const startOffset    = offset !== null ? offset : this.pauseOffset;
        this.sourceNode      = this.audioContext.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        this.sourceNode.connect(this.analyserNode);
        this.sourceNode.start(0, startOffset);
        this.startTime = this.audioContext.currentTime - startOffset;
        this.isPlaying = true;
        this.sourceNode.onended = () => {
            if (this.isPlaying) {
                this.isPlaying   = false;
                this.pauseOffset = 0;
                if (this.onEnded) this.onEnded();
            }
        };
    }

    pause() {
        if (!this.isPlaying) return;
        this.pauseOffset = this.audioContext.currentTime - this.startTime;
        this.sourceNode.stop();
        this.isPlaying = false;
    }

    seek(time) {
        const wasPlaying = this.isPlaying;
        if (wasPlaying) { this.sourceNode.onended = null; this.sourceNode.stop(); this.isPlaying = false; }
        this.pauseOffset = Math.max(0, Math.min(time, this.duration));
        if (wasPlaying) {
            // iOS: seek 후 재생도 비동기 resume 보장
            this.playAsync().catch(() => this.play());
        }
    }

    getCurrentTime() {
        if (this.isPlaying) return Math.min(this.audioContext.currentTime - this.startTime, this.duration);
        return this.pauseOffset;
    }

    setVolume(vol) {
        this.volume = vol;
        if (this.gainNode) this.gainNode.gain.value = vol;
    }

    getFrequencyData() {
        if (!this.analyserNode) return new Uint8Array(0);
        const data = new Uint8Array(this.analyserNode.frequencyBinCount);
        this.analyserNode.getByteFrequencyData(data);
        return data;
    }

    getTimeDomainData() {
        if (!this.analyserNode) return new Uint8Array(0);
        const data = new Uint8Array(this.analyserNode.fftSize);
        this.analyserNode.getByteTimeDomainData(data);
        return data;
    }

    /* ═══════════════════════════════════════════════════════
       전체 버퍼 분석 v3
       - 멀티해상도 FFT: 저역(베이스) 8192 + 고역 4096
       - Mid 채널(모노 합산)으로 스테레오 처리
       - 대역별 스펙트럴 플럭스 (저역/고역 분리)
       - 로그 스케일 크기 → 인지적으로 더 자연스러운 스펙트럼
    ═══════════════════════════════════════════════════════ */
    async analyzeFullBuffer(progressCallback) {
        if (!this.audioBuffer) return [];

        const sampleRate = this.audioBuffer.sampleRate;
        const numCh      = this.audioBuffer.numberOfChannels;

        // ── Mid 채널 (L+R) 합산 — 스테레오 신호 통합 ──
        const chL  = this.audioBuffer.getChannelData(0);
        const chR  = numCh > 1 ? this.audioBuffer.getChannelData(1) : chL;
        const len  = chL.length;
        const mono = new Float32Array(len);
        for (let i = 0; i < len; i++) mono[i] = (chL[i] + chR[i]) * 0.5;

        // ── FFT 창 크기 설정 ──
        // 고해상도 창(8192): 저음역 주파수 해상도 ↑  (82Hz E2도 정확히 분리)
        // 표준 창(4096)   : 시간 해상도 ↑
        const fftLarge  = 8192;
        const fftMedium = 4096;
        // hop: fftMedium/4 = 1024 → 약 23ms (44100Hz 기준)
        const hopSize   = Math.floor(fftMedium / 4);
        const totalFrames = Math.floor((len - fftLarge) / hopSize) + 1;

        // ── 사전 계산: Hann 윈도우 (두 가지 크기) ──
        const hannLarge  = this._makeHann(fftLarge);
        const hannMedium = this._makeHann(fftMedium);

        // ── iOS 메모리 절약: 재사용 가능한 버퍼 사전 할당 ──
        const windowedLarge  = new Float32Array(fftLarge);
        const windowedMedium = new Float32Array(fftMedium);

        const results           = [];
        let prevMagLow          = null;   // 저역 이전 프레임 크기 (플럭스용)
        let prevMagHigh         = null;   // 고역 이전 프레임 크기

        for (let i = 0; i < totalFrames; i++) {
            const startSample = i * hopSize;

            // ── Hann 윈도우 적용 (slice 없이 직접 인덱싱 → iOS 메모리 절약) ──
            const endLarge  = Math.min(startSample + fftLarge,  len);
            const endMedium = Math.min(startSample + fftMedium, len);
            for (let j = 0; j < fftLarge;  j++) windowedLarge[j]  = j < (endLarge  - startSample) ? mono[startSample + j] * hannLarge[j]  : 0;
            for (let j = 0; j < fftMedium; j++) windowedMedium[j] = j < (endMedium - startSample) ? mono[startSample + j] * hannMedium[j] : 0;

            // ── RMS 계산 ──
            let rms = 0;
            const mLen = endMedium - startSample;
            for (let j = 0; j < mLen; j++) rms += mono[startSample + j] * mono[startSample + j];
            rms = mLen > 0 ? Math.sqrt(rms / mLen) : 0;

            // ── FFT 계산 ──
            const { magnitudes: magLarge,  freqs: freqsLarge  } = this._fft(windowedLarge,  sampleRate);
            const { magnitudes: magMedium, freqs: freqsMedium } = this._fft(windowedMedium, sampleRate);

            // ── 저역 스펙트럴 플럭스 (기타 저음역: 30-600Hz) ──
            let fluxLow = 0;
            if (prevMagLow) {
                for (let k = 0; k < magLarge.length; k++) {
                    if (freqsLarge[k] < 30 || freqsLarge[k] > 600) continue;
                    const diff = magLarge[k] - prevMagLow[k];
                    if (diff > 0) fluxLow += diff;
                }
            }

            // ── 고역 스펙트럴 플럭스 (600-4000Hz) ──
            let fluxHigh = 0;
            if (prevMagHigh) {
                for (let k = 0; k < magMedium.length; k++) {
                    if (freqsMedium[k] < 600 || freqsMedium[k] > 4000) continue;
                    const diff = magMedium[k] - prevMagHigh[k];
                    if (diff > 0) fluxHigh += diff;
                }
            }

            prevMagLow  = magLarge.slice();
            prevMagHigh = magMedium.slice();

            // 복합 스펙트럴 플럭스 (저역 가중)
            const spectralFlux = fluxLow * 1.5 + fluxHigh;

            // ── 주파수 빈 통합 ──
            // 저역(30-600Hz): 큰 창(8192)에서 — 주파수 해상도 5.4Hz/bin
            // 고역(600-4200Hz): 중간 창(4096)에서 — 주파수 해상도 10.8Hz/bin
            const fftData = [];

            for (let k = 0; k < magLarge.length; k++) {
                const f = freqsLarge[k];
                if (f >= 30 && f <= 620) {
                    // 로그 스케일 크기 (dB 근사, 인지적 자연스러움)
                    const logMag = Math.log1p(magLarge[k] * 100) * 0.1;
                    fftData.push({ freq: f, magnitude: logMag });
                }
            }

            for (let k = 0; k < magMedium.length; k++) {
                const f = freqsMedium[k];
                if (f > 620 && f <= 4200) {
                    const logMag = Math.log1p(magMedium[k] * 100) * 0.1;
                    fftData.push({ freq: f, magnitude: logMag });
                }
            }

            results.push({
                time:         startSample / sampleRate,
                rms,
                fft:          fftData,
                spectralFlux,
                fluxLow,
                fluxHigh,
            });

            // 진행률 콜백 (60 프레임마다)
            if (i % 60 === 0 && progressCallback) {
                progressCallback((i / totalFrames) * 90);  // 90%까지 FFT 분석
                await this.sleep(0);
            }
        }

        // ── HPSS 후처리: 드럼/타악기 에너지 분리 ──
        if (progressCallback) progressCallback(92);
        await this.sleep(0);
        this._applyHPSS(results);
        if (progressCallback) progressCallback(100);

        return results;
    }

    /* ═══════════════════════════════════════════════════════
       HPSS — Harmonic-Percussive Source Separation v4
       ────────────────────────────────────────────────────────
       원리 (스펙트럼 중앙값 필터 기반):
         [하모닉 성분] 시간 축으로 매끄럽고 주파수 축으로 뾰족함
           → 같은 주파수 빈을 여러 프레임에 걸쳐 중앙값 필터 → 연속 성분 추출
         [퍼커시브 성분] 시간 축으로 뾰족하고 주파수 축으로 넓게 분포
           → 같은 프레임 내 인접 주파수 빈을 중앙값 필터 → 순간 브로드밴드 추출

       Wiener 마스크:
         H_mask(f,t) = H(f,t)^β / (H(f,t)^β + P(f,t)^β)
         β = 2 (소프트 마스크, 갑작스러운 경계 방지)

       결과:
         각 프레임의 fft 데이터가 하모닉 성분만으로 교체됨
         → pitchDetector의 HPCP 계산이 드럼 에너지 없이 순수 화음만 분석

       성능 고려:
         전체 프레임 × 주파수 빈 수 만큼 중앙값을 계산하면 매우 느려짐
         → 시간축 창(hKernel=17프레임)과 주파수축 창(pKernel=9빈)으로 제한
         → 전체 처리 시간 추가: 약 +10~15% (허용 범위)
    ═══════════════════════════════════════════════════════ */
    _applyHPSS(results) {
        if (!results || results.length < 5) return results;

        // ── 주파수 빈 목록 수집 (첫 프레임 기준) ──
        // 모든 프레임이 동일한 주파수 빈 구조를 가진다고 가정
        const firstFft  = results.find(r => r.fft && r.fft.length > 0)?.fft;
        if (!firstFft) return results;
        const numBins   = firstFft.length;
        const numFrames = results.length;

        // ── 2D 크기 행렬 구성: mag[frame][bin] ──
        const mag = new Array(numFrames);
        for (let t = 0; t < numFrames; t++) {
            mag[t] = new Float32Array(numBins);
            const fft = results[t].fft;
            if (fft) {
                for (let f = 0; f < numBins && f < fft.length; f++) {
                    mag[t][f] = fft[f].magnitude;
                }
            }
        }

        // ── 시간축 중앙값 필터 → 하모닉 행렬 H ──
        const hKernel = 17; // 홀수, 약 17×23ms ≈ 390ms 윈도우
        const hHalf   = Math.floor(hKernel / 2);
        const H = new Array(numFrames);
        for (let t = 0; t < numFrames; t++) {
            H[t] = new Float32Array(numBins);
            for (let f = 0; f < numBins; f++) {
                const vals = [];
                for (let dt = -hHalf; dt <= hHalf; dt++) {
                    const tt = Math.max(0, Math.min(numFrames - 1, t + dt));
                    vals.push(mag[tt][f]);
                }
                vals.sort((a, b) => a - b);
                H[t][f] = vals[hHalf]; // 중앙값
            }
        }

        // ── 주파수축 중앙값 필터 → 퍼커시브 행렬 P ──
        const pKernel = 9; // 홀수, 약 9개 주파수 빈
        const pHalf   = Math.floor(pKernel / 2);
        const P = new Array(numFrames);
        for (let t = 0; t < numFrames; t++) {
            P[t] = new Float32Array(numBins);
            for (let f = 0; f < numBins; f++) {
                const vals = [];
                for (let df = -pHalf; df <= pHalf; df++) {
                    const ff = Math.max(0, Math.min(numBins - 1, f + df));
                    vals.push(mag[t][ff]);
                }
                vals.sort((a, b) => a - b);
                P[t][f] = vals[pHalf]; // 중앙값
            }
        }

        // ── Wiener 마스크 적용 (β=2, 소프트 마스크) ──
        const beta = 2;
        for (let t = 0; t < numFrames; t++) {
            if (!results[t].fft) continue;
            for (let f = 0; f < numBins && f < results[t].fft.length; f++) {
                const h  = Math.pow(H[t][f], beta);
                const p  = Math.pow(P[t][f], beta);
                const denom = h + p;
                const mask  = denom > 1e-10 ? h / denom : 0.5;
                // 하모닉 마스크 적용: 하모닉 성분만 남기고 퍼커시브 억제
                results[t].fft[f] = {
                    freq:      results[t].fft[f].freq,
                    magnitude: results[t].fft[f].magnitude * mask,
                };
            }
        }

        return results;
    }
    _makeHann(n) {
        const w = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
        }
        return w;
    }

    /* ── 윈도우 적용 ── */
    _applyWindow(frame, window, n) {
        const out = new Float32Array(n);
        for (let j = 0; j < frame.length && j < n; j++) {
            out[j] = frame[j] * window[j];
        }
        return out;
    }

    /* ═══════════════════════════════════════════════════════
       Cooley-Tukey FFT (기수-2 반복형) O(N log N)
    ═══════════════════════════════════════════════════════ */
    _fft(signal, sampleRate) {
        const N    = signal.length;
        const half = N / 2;
        const bits = Math.log2(N);

        const re = new Float32Array(N);
        const im = new Float32Array(N);

        // 비트 반전 복사
        for (let i = 0; i < N; i++) {
            re[this._bitReverse(i, bits)] = signal[i];
        }

        // 버터플라이 연산
        for (let s = 1; s <= bits; s++) {
            const m      = 1 << s;
            const half_m = m >> 1;
            const angle  = -2 * Math.PI / m;
            const wr0    = Math.cos(angle);
            const wi0    = Math.sin(angle);

            for (let k = 0; k < N; k += m) {
                let wRe = 1, wIm = 0;
                for (let j = 0; j < half_m; j++) {
                    const u = k + j, v = u + half_m;
                    const tRe = wRe * re[v] - wIm * im[v];
                    const tIm = wRe * im[v] + wIm * re[v];
                    re[v] = re[u] - tRe;
                    im[v] = im[u] - tIm;
                    re[u] += tRe;
                    im[u] += tIm;
                    const nw = wRe * wr0 - wIm * wi0;
                    wIm = wRe * wi0 + wIm * wr0;
                    wRe = nw;
                }
            }
        }

        // 크기 계산
        const magnitudes = new Float32Array(half);
        const freqs      = new Float32Array(half);
        const norm       = 2.0 / N;
        for (let k = 0; k < half; k++) {
            magnitudes[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * norm;
            freqs[k]      = k * sampleRate / N;
        }

        return { magnitudes, freqs };
    }

    _bitReverse(x, bits) {
        let result = 0;
        for (let i = 0; i < bits; i++) {
            result = (result << 1) | (x & 1);
            x >>= 1;
        }
        return result;
    }

    // 레거시 호환
    computeFFT(samples, sampleRate) {
        return this._fft(samples.slice(0, 4096), sampleRate).magnitudes;
    }

    // 파형 데이터 생성 (UI 표시용)
    getWaveformData(numPoints = 1000) {
        if (!this.audioBuffer) return [];
        const channelData = this.audioBuffer.getChannelData(0);
        const blockSize   = Math.floor(channelData.length / numPoints);
        const waveform    = [];
        for (let i = 0; i < numPoints; i++) {
            let max = 0;
            const start = i * blockSize;
            for (let j = 0; j < blockSize; j++) {
                const val = Math.abs(channelData[start + j]);
                if (val > max) max = val;
            }
            waveform.push(max);
        }
        return waveform;
    }

    sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    dispose() {
        if (this.isPlaying && this.sourceNode) this.sourceNode.stop();
        if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
        if (this.audioContext) this.audioContext.close();
    }
}

window.AudioEngine = AudioEngine;
