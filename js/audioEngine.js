/**
 * AudioEngine v5.0 — <audio> 태그 기반 재생 + WebAudio 분석
 *
 * iOS Safari 호환 핵심 변경:
 *  - 재생은 <audio> 태그 .play() 사용 → iOS가 일반 미디어로 인식, 소리 나옴
 *  - 분석은 createMediaElementSource()로 AudioContext에 연결 → FFT 그대로 작동
 *  - AudioContext는 재생과 무관하게 suspended 상태여도 소리가 나옴
 */
class AudioEngine {
    constructor() {
        this.audioEl       = null;   // <audio> 태그 (외부에서 주입)
        this.audioContext  = null;
        this.sourceNode    = null;   // MediaElementSourceNode (한 번만 생성)
        this.gainNode      = null;
        this.analyserNode  = null;
        this.audioBuffer   = null;   // 분석 전용 버퍼 (재생에는 미사용)
        this.isPlaying     = false;
        this.duration      = 0;
        this.volume        = 0.8;
        this.onTimeUpdate  = null;
        this.onEnded       = null;
        this.animFrameId   = null;
        this.fftSize       = 8192;
        this._objectUrl    = null;   // revokeObjectURL용
    }

    /* ── <audio> 태그 등록 (index.html에서 한 번 호출) ── */
    setAudioElement(el) {
        this.audioEl = el;
        this.audioEl.volume = this.volume;
        this.audioEl.addEventListener('ended', () => {
            this.isPlaying = false;
            if (this.onEnded) this.onEnded();
        });
    }

    /* ── AudioContext + 분석 노드 초기화 (첫 파일 로드 시 1회) ── */
    _initContext() {
        if (this.audioContext) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AC();
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = this.fftSize;
        this.analyserNode.smoothingTimeConstant = 0.3;
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = this.volume;
        this.analyserNode.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);
    }

    /* ── MediaElementSource 연결 (파일 로드 후 1회) ── */
    _connectMediaElement() {
        if (this.sourceNode) return; // 이미 연결됨
        if (!this.audioContext || !this.audioEl) return;
        try {
            this.sourceNode = this.audioContext.createMediaElementSource(this.audioEl);
            this.sourceNode.connect(this.analyserNode);
        } catch(e) {
            console.warn('[AudioEngine] MediaElementSource 연결 실패:', e);
        }
    }

    /* ── 파일 로드 ── */
    async loadFile(file) {
        if (!this.audioEl) throw new Error('audio element가 설정되지 않았습니다.');

        // 이전 ObjectURL 해제
        if (this._objectUrl) {
            URL.revokeObjectURL(this._objectUrl);
            this._objectUrl = null;
        }

        // <audio> 태그에 ObjectURL 세팅 → 브라우저가 직접 디코딩
        this._objectUrl = URL.createObjectURL(file);
        this.audioEl.src = this._objectUrl;
        this.audioEl.load();

        // 메타데이터 로드 대기 (duration 확보)
        await new Promise((resolve, reject) => {
            const onMeta  = () => { cleanup(); resolve(); };
            const onError = (e) => { cleanup(); reject(new Error('파일을 로드할 수 없습니다.')); };
            const cleanup = () => {
                this.audioEl.removeEventListener('loadedmetadata', onMeta);
                this.audioEl.removeEventListener('error', onError);
            };
            this.audioEl.addEventListener('loadedmetadata', onMeta, { once: true });
            this.audioEl.addEventListener('error', onError, { once: true });
            // 이미 로드됐을 경우
            if (this.audioEl.readyState >= 1) { cleanup(); resolve(); }
        });

        this.duration = this.audioEl.duration || 0;
        this.isPlaying = false;

        // 분석용 ArrayBuffer 먼저 디코딩 → 샘플레이트 확인
        // AudioContext는 음원과 동일한 샘플레이트로 생성해야 피치/속도 왜곡 없음
        this.audioBuffer = null;
        try {
            const arrayBuffer = await this._readFileAsArrayBuffer(file);

            // 임시 AudioContext로 디코딩해서 샘플레이트 파악
            const AC = window.AudioContext || window.webkitAudioContext;
            const tmpCtx = new AC();
            this.audioBuffer = await new Promise((resolve, reject) => {
                tmpCtx.decodeAudioData(arrayBuffer, buf => resolve(buf), err => reject(err));
            });
            const fileSampleRate = this.audioBuffer.sampleRate;
            tmpCtx.close().catch(() => {});

            // 기존 AudioContext가 없거나 샘플레이트가 다르면 새로 생성
            if (!this.audioContext || this.audioContext.sampleRate !== fileSampleRate) {
                if (this.audioContext) {
                    // 기존 sourceNode 연결 해제 후 context 교체
                    this.sourceNode = null;
                    this.audioContext.close().catch(() => {});
                }
                this.audioContext = new AC({ sampleRate: fileSampleRate });
                this.analyserNode = this.audioContext.createAnalyser();
                this.analyserNode.fftSize = this.fftSize;
                this.analyserNode.smoothingTimeConstant = 0.3;
                this.gainNode = this.audioContext.createGain();
                this.gainNode.gain.value = this.volume;
                this.analyserNode.connect(this.gainNode);
                this.gainNode.connect(this.audioContext.destination);
                this.sourceNode = null; // context 바뀌었으므로 재연결 필요
            }
        } catch(e) {
            console.warn('[AudioEngine] 분석용 버퍼 디코딩 실패 (재생에는 영향 없음):', e);
            // AudioContext가 없으면 기본으로 생성
            this._initContext();
        }

        // MediaElementSource 연결 (context가 준비된 후)
        this._connectMediaElement();

        return this.audioBuffer;
    }

    /* ── 재생 ── */
    play(offset = null) {
        if (!this.audioEl) return;
        if (offset !== null) this.audioEl.currentTime = offset;
        // AudioContext resume (소리와 무관하지만 analyser 동작을 위해)
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {});
        }
        const p = this.audioEl.play();
        if (p && p.catch) p.catch(e => console.warn('[AudioEngine] play() 거부:', e));
        this.isPlaying = true;
    }

    pause() {
        if (!this.audioEl) return;
        this.audioEl.pause();
        this.isPlaying = false;
    }

    seek(time) {
        if (!this.audioEl) return;
        this.audioEl.currentTime = Math.max(0, Math.min(time, this.duration));
    }

    getCurrentTime() {
        if (!this.audioEl) return 0;
        return this.audioEl.currentTime;
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
        if (this.audioEl) this.audioEl.volume = this.volume;
        if (this.gainNode) this.gainNode.gain.value = this.volume;
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

    // 파형 데이터 (UI 표시용) — 분석 버퍼 사용
    getWaveformData(numPoints = 1000) {
        if (!this.audioBuffer) return [];
        const channelData = this.audioBuffer.getChannelData(0);
        const blockSize   = Math.floor(channelData.length / numPoints);
        const waveform    = [];
        for (let i = 0; i < numPoints; i++) {
            let max = 0;
            const start = i * blockSize;
            for (let j = 0; j < blockSize; j++) {
                const val = Math.abs(channelData[start + j] || 0);
                if (val > max) max = val;
            }
            waveform.push(max);
        }
        return waveform;
    }

    /* ── FileReader 기반 ArrayBuffer (iOS 구형 폴백) ── */
    _readFileAsArrayBuffer(file) {
        if (typeof file.arrayBuffer === 'function') {
            return file.arrayBuffer().catch(() => this._readFileAsArrayBufferLegacy(file));
        }
        return this._readFileAsArrayBufferLegacy(file);
    }
    _readFileAsArrayBufferLegacy(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = e => resolve(e.target.result);
            reader.onerror = e => reject(new Error('파일 읽기 실패'));
            reader.readAsArrayBuffer(file);
        });
    }

    /* ══════════════════════════════════════════════════════
       전체 버퍼 분석 (FFT + HPSS) — v4.0 그대로 유지
    ══════════════════════════════════════════════════════ */
    async analyzeFullBuffer(progressCallback) {
        if (!this.audioBuffer) return [];

        const sampleRate = this.audioBuffer.sampleRate;
        const numCh      = this.audioBuffer.numberOfChannels;
        const chL  = this.audioBuffer.getChannelData(0);
        const chR  = numCh > 1 ? this.audioBuffer.getChannelData(1) : chL;
        const len  = chL.length;
        const mono = new Float32Array(len);
        for (let i = 0; i < len; i++) mono[i] = (chL[i] + chR[i]) * 0.5;

        const fftLarge  = 8192;
        const fftMedium = 4096;
        const hopSize   = Math.floor(fftMedium / 4);
        const totalFrames = Math.floor((len - fftLarge) / hopSize) + 1;

        const hannLarge  = this._makeHann(fftLarge);
        const hannMedium = this._makeHann(fftMedium);
        const windowedLarge  = new Float32Array(fftLarge);
        const windowedMedium = new Float32Array(fftMedium);

        const results  = [];
        let prevMagLow  = null;
        let prevMagHigh = null;

        for (let i = 0; i < totalFrames; i++) {
            const startSample = i * hopSize;
            const endLarge  = Math.min(startSample + fftLarge,  len);
            const endMedium = Math.min(startSample + fftMedium, len);
            for (let j = 0; j < fftLarge;  j++) windowedLarge[j]  = j < (endLarge  - startSample) ? mono[startSample + j] * hannLarge[j]  : 0;
            for (let j = 0; j < fftMedium; j++) windowedMedium[j] = j < (endMedium - startSample) ? mono[startSample + j] * hannMedium[j] : 0;

            let rms = 0;
            const mLen = endMedium - startSample;
            for (let j = 0; j < mLen; j++) rms += mono[startSample + j] * mono[startSample + j];
            rms = mLen > 0 ? Math.sqrt(rms / mLen) : 0;

            const { magnitudes: magLarge,  freqs: freqsLarge  } = this._fft(windowedLarge,  sampleRate);
            const { magnitudes: magMedium, freqs: freqsMedium } = this._fft(windowedMedium, sampleRate);

            let fluxLow = 0;
            if (prevMagLow) {
                for (let k = 0; k < magLarge.length; k++) {
                    if (freqsLarge[k] < 30 || freqsLarge[k] > 600) continue;
                    const diff = magLarge[k] - prevMagLow[k];
                    if (diff > 0) fluxLow += diff;
                }
            }
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
            const spectralFlux = fluxLow * 1.5 + fluxHigh;

            const fftData = [];
            for (let k = 0; k < magLarge.length; k++) {
                const f = freqsLarge[k];
                if (f >= 30 && f <= 620) fftData.push({ freq: f, magnitude: Math.log1p(magLarge[k] * 100) * 0.1 });
            }
            for (let k = 0; k < magMedium.length; k++) {
                const f = freqsMedium[k];
                if (f > 620 && f <= 4200) fftData.push({ freq: f, magnitude: Math.log1p(magMedium[k] * 100) * 0.1 });
            }

            results.push({ time: startSample / sampleRate, rms, fft: fftData, spectralFlux, fluxLow, fluxHigh });

            if (i % 60 === 0 && progressCallback) {
                progressCallback((i / totalFrames) * 90);
                await this.sleep(0);
            }
        }

        if (progressCallback) progressCallback(92);
        await this.sleep(0);
        this._applyHPSS(results);
        if (progressCallback) progressCallback(100);
        return results;
    }

    _applyHPSS(results) {
        if (!results || results.length < 5) return results;
        const firstFft = results.find(r => r.fft && r.fft.length > 0)?.fft;
        if (!firstFft) return results;
        const numBins   = firstFft.length;
        const numFrames = results.length;

        const mag = new Array(numFrames);
        for (let t = 0; t < numFrames; t++) {
            mag[t] = new Float32Array(numBins);
            const fft = results[t].fft;
            if (fft) for (let f = 0; f < numBins && f < fft.length; f++) mag[t][f] = fft[f].magnitude;
        }

        const hKernel = 17, hHalf = Math.floor(hKernel / 2);
        const H = new Array(numFrames);
        for (let t = 0; t < numFrames; t++) {
            H[t] = new Float32Array(numBins);
            for (let f = 0; f < numBins; f++) {
                const vals = [];
                for (let dt = -hHalf; dt <= hHalf; dt++) { const tt = Math.max(0, Math.min(numFrames-1, t+dt)); vals.push(mag[tt][f]); }
                vals.sort((a,b) => a-b);
                H[t][f] = vals[hHalf];
            }
        }

        const pKernel = 9, pHalf = Math.floor(pKernel / 2);
        const P = new Array(numFrames);
        for (let t = 0; t < numFrames; t++) {
            P[t] = new Float32Array(numBins);
            for (let f = 0; f < numBins; f++) {
                const vals = [];
                for (let df = -pHalf; df <= pHalf; df++) { const ff = Math.max(0, Math.min(numBins-1, f+df)); vals.push(mag[t][ff]); }
                vals.sort((a,b) => a-b);
                P[t][f] = vals[pHalf];
            }
        }

        for (let t = 0; t < numFrames; t++) {
            if (!results[t].fft) continue;
            for (let f = 0; f < numBins && f < results[t].fft.length; f++) {
                const h = Math.pow(H[t][f], 2), p = Math.pow(P[t][f], 2);
                const denom = h + p;
                const mask = denom > 1e-10 ? h / denom : 0.5;
                results[t].fft[f] = { freq: results[t].fft[f].freq, magnitude: results[t].fft[f].magnitude * mask };
            }
        }
        return results;
    }

    _makeHann(n) {
        const w = new Float32Array(n);
        for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
        return w;
    }

    _fft(signal, sampleRate) {
        const N = signal.length, half = N / 2, bits = Math.log2(N);
        const re = new Float32Array(N), im = new Float32Array(N);
        for (let i = 0; i < N; i++) re[this._bitReverse(i, bits)] = signal[i];
        for (let s = 1; s <= bits; s++) {
            const m = 1 << s, half_m = m >> 1;
            const angle = -2 * Math.PI / m;
            const wr0 = Math.cos(angle), wi0 = Math.sin(angle);
            for (let k = 0; k < N; k += m) {
                let wRe = 1, wIm = 0;
                for (let j = 0; j < half_m; j++) {
                    const u = k+j, v = u+half_m;
                    const tRe = wRe*re[v] - wIm*im[v], tIm = wRe*im[v] + wIm*re[v];
                    re[v] = re[u]-tRe; im[v] = im[u]-tIm; re[u] += tRe; im[u] += tIm;
                    const nw = wRe*wr0 - wIm*wi0; wIm = wRe*wi0 + wIm*wr0; wRe = nw;
                }
            }
        }
        const magnitudes = new Float32Array(half), freqs = new Float32Array(half), norm = 2.0/N;
        for (let k = 0; k < half; k++) {
            magnitudes[k] = Math.sqrt(re[k]*re[k] + im[k]*im[k]) * norm;
            freqs[k] = k * sampleRate / N;
        }
        return { magnitudes, freqs };
    }

    _bitReverse(x, bits) {
        let result = 0;
        for (let i = 0; i < bits; i++) { result = (result << 1) | (x & 1); x >>= 1; }
        return result;
    }

    computeFFT(samples, sampleRate) { return this._fft(samples.slice(0, 4096), sampleRate).magnitudes; }

    sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    dispose() {
        if (this.audioEl) { this.audioEl.pause(); this.audioEl.src = ''; }
        if (this._objectUrl) { URL.revokeObjectURL(this._objectUrl); this._objectUrl = null; }
        if (this.audioContext) this.audioContext.close();
    }
}

window.AudioEngine = AudioEngine;
