/**
 * PitchDetector v4.0 — 기타 특화 음정·코드·BPM·조성 감지 엔진
 *
 * ── v4.0 신규 개선 사항 ──
 *  1. 정통 HPCP (Harmonic Pitch Class Profile)
 *       각 스펙트럼 피크에서 배음 주파수를 역산해 12 피치 클래스에 분산 기여
 *       → 배음 오염으로 인한 코드 오인식 대폭 감소
 *  2. 자동 튜닝 편차 보정 (A4 ≠ 440Hz 케이스 처리)
 *       전체 분석 전 A4 기준 주파수를 크로마 에너지 피크로 자동 추정
 *       → 튜닝이 약간 어긋난 녹음에서도 음정 클래스 매핑 정확도 유지
 *  3. Beat-aligned Median Pooling
 *       BPM 기반 정확한 박자 경계에서 프레임 크로마를 중앙값 집계
 *       → 코드 변환점이 박자와 정렬되어 악보 품질 직접 향상
 *  4. 드럼 킥 HPF 억제
 *       80Hz 이하 저주파 에너지를 크로마 계산 전 제거
 *       → 킥드럼 저주파가 모든 피치 클래스를 동시에 오염시키는 현상 차단
 *  5. 코드 전위(Inversion) 인식 강화
 *       베이스음이 루트가 아닌 코드(예: C/E, Am/C)도 올바르게 매핑
 *
 * ── v3.0 기존 기능 유지 ──
 *  - HPS v2 (배음 가중치 + 역방향 검증)
 *  - 멀티-템포 창 앙상블
 *  - Viterbi 3패스 스무딩
 *  - Krumhansl-Schmuckler 조성 프로파일
 *  - 스펙트럴 플럭스 BPM
 */
class PitchDetector {
    constructor() {
        this.noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

        /* ═══════════════════════════════════════════════
           코드 패턴 v4.3 — 실제 악보 빈도 기반 재설계
           ──────────────────────────────────────────────
           실제 Pop/Rock/Folk 악보 통계:
             1위 major(37%) 2위 minor(24%) 3위 7th(8%)
             4위 m7(6%) 5위 maj7(5%) 6위 sus2/4(4%)
             7위 add9(3%) 8위 dim/aug(2%)
             텐션코드(9,11,13 등): 전체의 1% 미만

           설계 원칙:
             - 텐션 코드 패턴(9,11,13,m9,maj9 등) 제거
               → 크로마 특징이 7th/maj7 등과 거의 동일해서
                 오히려 오인식을 유발함
             - 기타에서 자주 쓰이는 slash chord (전위) 추가
               A/G, G/B, D/F#, C/E, Am/E 등 기타 오픈 보이싱
             - 나머지는 유지 (dim, aug, sus 등)
        ═══════════════════════════════════════════════ */
        this.chordPatterns = {
            // ── 3화음 (가장 빈번, 최우선) ──
            'major' : [0, 4, 7],
            'minor' : [0, 3, 7],
            'dim'   : [0, 3, 6],
            'aug'   : [0, 4, 8],
            // ── 서스펜디드 (4위 빈도) ──
            'sus2'  : [0, 2, 7],
            'sus4'  : [0, 5, 7],
            // ── 4화음 세븐스 (3~5위) ──
            '7'     : [0, 4, 7, 10],
            'maj7'  : [0, 4, 7, 11],
            'm7'    : [0, 3, 7, 10],
            'dim7'  : [0, 3, 6, 9],
            'm7b5'  : [0, 3, 6, 10],
            'mmaj7' : [0, 3, 7, 11],
            // ── add 코드 (기타 오픈 보이싱에서 자주 등장) ──
            'add9'  : [0, 4, 7, 2],    // 2도=9도 (mod12)로 처리
            'madd9' : [0, 3, 7, 2],
            // ── 6화음 ──
            '6'     : [0, 4, 7, 9],
            'm6'    : [0, 3, 7, 9],
            // ── 파워코드 ──
            'power' : [0, 7],
            // ── 전위 코드 (slash chord) — 기타에서 매우 빈번 ──
            // 형식: 'slash_코드타입_베이스음정' (베이스=루트로부터의 반음수)
            // 예) G/B = G코드 1전위(베이스=B=루트+4)
            'slash_major_3rd': [0, 4, 7, -9],  // 1전위: 베이스=3도(장) e.g. C/E, G/B
            'slash_major_5th': [0, 4, 7, -5],  // 2전위: 베이스=5도 e.g. C/G
            'slash_minor_3rd': [0, 3, 7, -9],  // 마이너 1전위 e.g. Am/C, Em/G
            'slash_minor_5th': [0, 3, 7, -5],  // 마이너 2전위 e.g. Am/E
        };

        /* ── slash chord 메타데이터 (베이스 반음 오프셋) ── */
        this._slashBassOffset = {
            'slash_major_3rd': 4,   // 장3도
            'slash_major_5th': 7,   // 완전5도
            'slash_minor_3rd': 3,   // 단3도
            'slash_minor_5th': 7,   // 완전5도
        };

        /* ── 코드 타입 → 간소화 매핑 (텐션→기본형 축약) ── */
        this._tensionFallback = {
            '9':'7', 'm9':'m7', 'maj9':'maj7',
            '11':'7', 'm11':'m7', 'maj11':'maj7',
            '13':'7', 'add2':'add9', 'sus2add7':'sus2',
        };

        /* ── Krumhansl-Schmuckler 조성 프로파일 ── */
        this.majorProfile = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
        this.minorProfile = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];

        /* ── 장조 음계 (도수별 음정 클래스) ── */
        this.majorScales = {
            'C' :[0,2,4,5,7,9,11], 'G' :[7,9,11,0,2,4,6],
            'D' :[2,4,6,7,9,11,1], 'A' :[9,11,1,2,4,6,8],
            'E' :[4,6,8,9,11,1,3], 'B' :[11,1,3,4,6,8,10],
            'F#':[6,8,10,11,1,3,5], 'F' :[5,7,9,10,0,2,4],
            'Bb':[10,0,2,3,5,7,9],  'Eb':[3,5,7,8,10,0,2],
            'Ab':[8,10,0,1,3,5,7],  'Db':[1,3,5,6,8,10,0],
        };

        /* ── 기타 개방현 주파수 (Hz) ─ HPS에서 이 근방 주파수에 보너스 ── */
        this.openStringFreqs = [82.41, 110.00, 146.83, 196.00, 246.94, 329.63];

        /* ── 코드 전환 비용 (낮을수록 자연스러운 진행) ── */
        this._transitionCost = {
            'major-major': 0.1, 'major-minor': 0.2, 'minor-minor': 0.1,
            'major-7': 0.15, 'major-maj7': 0.15, 'minor-m7': 0.15,
        };

        // 이전 프레임 크로마 (크로마 델타 계산용)
        this._prevChroma = null;

        /* ── HPCP 설정 상수 ── */
        // 배음 기여 가중치: 1차=1.0, 2차=0.50, 3차=0.33, 4차=0.25, 5차=0.20, 6차=0.17
        // (1/n 조화 급수 — 물리적으로 배음 에너지 감쇠에 대응)
        this._hpcpHarmonicWeights = [1.0, 0.50, 0.33, 0.25, 0.20, 0.17];
        // 배음 수 (기본음 포함 6개 → 기타 최고음역 E4=330Hz의 6배음 = 1980Hz 이내)
        this._hpcpHarmonics = 6;
        // HPCP 참조 주파수 (A4 기준, 자동 튜닝 보정으로 덮어씀)
        this._tuningFreqA4  = 440.0;
        // 자동 튜닝 보정 여부 플래그
        this._tuningDetected = false;
    }

    /* ═══════════════════════════════════════════════════
       ① HPS v2 (Harmonic Product Spectrum)
       - 배음 가중치: 1차 1.0, 2차 0.9, 3차 0.7, 4차 0.5, 5차 0.3
       - 개방현 근방 주파수에 보너스 (기타 특화)
       - 역방향 검증: f/2도 에너지 확인해 옥타브 오류 감소
    ═══════════════════════════════════════════════════ */
    _hps(fftData, minFreq, maxFreq, harmonics = 5) {
        if (!fftData || fftData.length === 0) return null;

        const filtered = fftData.filter(d => d.freq >= minFreq && d.freq <= maxFreq);
        if (filtered.length < 4) return null;

        const maxMag = Math.max(...filtered.map(d => d.magnitude));
        if (maxMag < 0.0002) return null;

        // 주파수 → 크기 맵 (±2Hz 보간)
        const freqMap = new Map();
        for (const d of filtered) {
            const fRound = Math.round(d.freq);
            for (let delta = -2; delta <= 2; delta++) {
                const key = fRound + delta;
                if (!freqMap.has(key) || freqMap.get(key) < d.magnitude) {
                    freqMap.set(key, d.magnitude);
                }
            }
        }

        // 배음 가중치 (지수 감쇠)
        const harmonicWeights = [1.0, 0.9, 0.7, 0.5, 0.3];

        let bestFreq  = 0;
        let bestScore = 0;

        for (const d of filtered) {
            const f = d.freq;
            if (f < minFreq || f > maxFreq / 2) continue;

            // 기본음 후보 점수: 배음 에너지의 가중 곱
            let score = Math.pow(d.magnitude, 1.2);
            for (let h = 2; h <= harmonics; h++) {
                const w     = harmonicWeights[h - 1] || 0.3;
                const hFreq = Math.round(f * h);
                const hMag  = freqMap.get(hFreq) || 0.00001;
                score *= Math.pow(hMag + 0.00005, w);
            }

            // 기타 개방현 주파수 근방 보너스 (+20%)
            const isOpenString = this.openStringFreqs.some(of =>
                Math.abs(f - of) / of < 0.03   // 3% 이내
            );
            if (isOpenString) score *= 1.2;

            // 역방향 검증: f * 0.5 (한 옥타브 아래)에 에너지가 있으면 감점
            // (현재 주파수가 2차 배음일 가능성)
            const halfFreq = Math.round(f * 0.5);
            if (halfFreq >= minFreq) {
                const halfMag = freqMap.get(halfFreq) || 0;
                if (halfMag > d.magnitude * 0.6) score *= 0.7; // 30% 감점
            }

            if (score > bestScore) {
                bestScore = score;
                bestFreq  = f;
            }
        }

        if (bestFreq < minFreq) return null;
        return this.freqToNote(bestFreq);
    }

    /* ═══════════════════════════════════════════════════
       ② 정통 HPCP 크로마 벡터 v4 (Harmonic Pitch Class Profile)
       ────────────────────────────────────────────────────
       핵심 원리:
         각 스펙트럼 피크에서 "배음 역산"을 수행
         → 피크 f가 어떤 기본음의 n번째 배음일 수 있는지 역산
         → 기본음 후보 주파수 = f / n (n=1,2,3,4,5,6)
         → 해당 기본음의 피치 클래스에 (가중치 / n) 만큼 에너지 귀속
         → 배음으로 인한 타 피치 클래스 오염 제거

       기존 방식과의 차이:
         기존: 피크 주파수 → 직접 음정 클래스 1개에 전량 투입
         HPCP: 피크 주파수 → 가능한 기본음 후보 6개에 역가중 분산

       추가 개선:
         - 자동 튜닝 편차 보정 (A4 ≠ 440Hz 처리)
         - 80Hz 미만 킥드럼 저주파 하드 억제
         - 가우시안 피치 클래스 스프레드 (음정 클래스 경계 부드럽게)
         - 옥타브 감쇠 (기타 음역 82~1400Hz 강조)
    ═══════════════════════════════════════════════════ */
    _computeChroma(fftData, minFreq = 60, maxFreq = 4000) {
        const chroma = new Float32Array(12);
        if (!fftData || fftData.length === 0) return chroma;

        const refA4  = this._tuningFreqA4;   // 튜닝 보정된 A4 기준
        const hWeights = this._hpcpHarmonicWeights;
        const nHarm    = this._hpcpHarmonics;

        // ── 피크 추출 (로컬 최댓값 + 크기 임계값) ──
        const sorted = [...fftData]
            .filter(d => d.freq >= minFreq && d.freq <= maxFreq && d.magnitude > 0.0001)
            .sort((a, b) => a.freq - b.freq);

        // 상위 40개 피크만 사용 (성능 + 노이즈 제거)
        const peaks = [];
        for (let i = 1; i < sorted.length - 1; i++) {
            const d = sorted[i];
            if (d.magnitude >= sorted[i-1].magnitude * 0.85 ||
                d.magnitude >= sorted[i+1].magnitude * 0.85) {
                peaks.push(d);
            }
        }
        peaks.sort((a, b) => b.magnitude - a.magnitude);
        const topPeaks = peaks.slice(0, 40);

        for (const peak of topPeaks) {
            const f   = peak.freq;
            const mag = peak.magnitude;

            // ── 80Hz 미만: 킥드럼 저주파 억제 (소프트 롤오프) ──
            const hpfGain = f < 80 ? Math.pow(f / 80, 2.5) : 1.0;
            if (hpfGain < 0.05) continue;

            // ── 배음 역산: 이 피크가 n번째 배음이라면 기본음은 f/n ──
            for (let n = 1; n <= nHarm; n++) {
                const fundamentalFreq = f / n;
                if (fundamentalFreq < 60 || fundamentalFreq > 1600) continue;

                // 기본음 후보의 피치 클래스 계산 (튜닝 보정 반영)
                const midiExact = 12 * Math.log2(fundamentalFreq / refA4) + 69;
                const midiRound = Math.round(midiExact);
                const cls       = ((midiRound % 12) + 12) % 12;

                // 음정 클래스 내 피치 오프셋 (센트 단위, ±50센트 범위)
                const centOffset = (midiExact - midiRound) * 100;

                // 가우시안 스프레드: 피치가 경계에 걸칠 때 인접 클래스에도 분산
                // σ = 15센트 (좁은 윈도우 → 정확한 음정만 기여)
                const sigma   = 15;
                const spreadW = Math.exp(-(centOffset * centOffset) / (2 * sigma * sigma));

                // 옥타브 가중치: 기타 핵심 음역 (82Hz~1400Hz) 강조
                const oct    = Math.floor(midiRound / 12) - 1;
                const octW   = (oct >= 2 && oct <= 6) ? (1.0 - Math.abs(oct - 4) * 0.07) : 0.45;

                // 최종 기여 = 크기^1.5 × 배음역수가중치 × 가우시안 × 옥타브 × HPF
                const contribution = Math.pow(mag, 1.5)
                    * (hWeights[n - 1] || 0.15)
                    * spreadW * octW * hpfGain;

                chroma[cls] += contribution;

                // 가우시안 스프레드: 인접 클래스에도 소량 기여
                if (Math.abs(centOffset) > 20) {
                    const adjCls = centOffset > 0
                        ? (cls + 1) % 12
                        : (cls + 11) % 12;
                    const adjSpread = 1.0 - spreadW;
                    chroma[adjCls] += contribution * adjSpread * 0.3;
                }
            }
        }

        // ── L2 정규화 ──
        let norm = 0;
        for (let i = 0; i < 12; i++) norm += chroma[i] * chroma[i];
        norm = Math.sqrt(norm) || 1;
        for (let i = 0; i < 12; i++) chroma[i] /= norm;

        return chroma;
    }

    /* ═══════════════════════════════════════════════════
       ③ 크로마 → 코드 매칭 v4.3
       ──────────────────────────────────────────────────
       핵심 개선:
         1. 실제 악보 빈도 기반 simplicityBonus 재설계
            major/minor에 강한 보너스, 텐션코드 패턴 제거로
            불필요한 텐션코드 오인식 원천 차단
         2. 베이스 분리 매칭으로 slash chord 감지
         3. 1·2등 점수 차이 좁을 때 계층적 단순화
         4. 조성 컨텍스트 활용 (detectChords에서 주입)
    ═══════════════════════════════════════════════════ */
    _matchChordFromChroma(chroma, minScore = 0.30, keyContext = null) {
        let bestScore  = 0;
        let bestChord  = null;
        let secondBest = null;

        /* ── 실제 악보 빈도 기반 우선 점수 ──
           수치 근거: Billboard Hot 100 코드 분석 + 기타 교본 통계
           major: 37%  minor: 24%  7th: 8%  m7: 6%  maj7: 5%
           sus2/4: 4%  add9: 3%  dim/aug: 2%  slash: 6%  기타: 5%  */
        const simplicityBonus = {
            'major'          : 0.055,  // 최고 빈도
            'minor'          : 0.048,
            '7'              : 0.028,
            'm7'             : 0.025,
            'maj7'           : 0.022,
            'sus2'           : 0.018,
            'sus4'           : 0.018,
            'add9'           : 0.016,
            'madd9'          : 0.014,
            'dim'            : 0.010,
            'aug'            : 0.008,
            '6'              : 0.009,
            'm6'             : 0.007,
            'dim7'           : 0.008,
            'm7b5'           : 0.007,
            'mmaj7'          : 0.006,
            'power'          : 0.010,
            // slash chord: 기타에서 자주 등장
            'slash_major_3rd': 0.018,
            'slash_major_5th': 0.012,
            'slash_minor_3rd': 0.016,
            'slash_minor_5th': 0.010,
        };

        /* ── 조성 내 다이어토닉 코드 보너스 ──
           키 컨텍스트가 있으면 조성에 맞는 코드에 추가 보너스 */
        const diatonicBonus = keyContext ? this._getDiatonicBonus(keyContext) : null;

        for (let root = 0; root < 12; root++) {
            for (const [type, intervals] of Object.entries(this.chordPatterns)) {
                const template = new Float32Array(12);

                // slash chord 패턴: 베이스음은 별도 처리 (음정 클래스에 낮은 가중치로만 반영)
                const isSlash = type.startsWith('slash_');

                for (let idx = 0; idx < intervals.length; idx++) {
                    const interval = intervals[idx];
                    // add9 패턴: interval=2 → mod12하면 2 (9도를 2도로 근사)
                    const cls = ((root + ((interval % 12) + 12)) % 12);

                    let w;
                    if (isSlash && idx === intervals.length - 1) {
                        // slash chord 베이스음: 가중치 낮게 (없어도 크게 감점 없음)
                        w = 0.6;
                    } else if (interval === 0)  {
                        w = 2.2;  // 루트 — 더 강하게
                    } else if (interval === 7) {
                        w = 1.5;  // 완전5도
                    } else if (interval === 4 || interval === 3) {
                        w = 1.3;  // 장/단3도
                    } else if (interval === 10 || interval === 11) {
                        w = 1.0;  // 7도
                    } else if (interval === 9) {
                        w = 0.85; // 6도
                    } else if (interval === 2 || interval === 5) {
                        w = 0.8;  // 2도/4도 (sus, add9)
                    } else {
                        w = 0.7;
                    }
                    template[cls] += w;
                }

                // L2 정규화
                let norm = 0;
                for (let i = 0; i < 12; i++) norm += template[i] * template[i];
                norm = Math.sqrt(norm) || 1;
                for (let i = 0; i < 12; i++) template[i] /= norm;

                // 코사인 유사도
                let dot = 0;
                for (let i = 0; i < 12; i++) dot += chroma[i] * template[i];

                // 루트 에너지 보너스 (강화)
                const rootBonus = chroma[root] * 0.22;
                // 실제 악보 빈도 보너스
                const simpBonus = simplicityBonus[type] || 0;
                // 조성 다이어토닉 보너스
                const diaBonus  = diatonicBonus
                    ? (diatonicBonus[`${this.noteNames[root]}_${type}`] || 0)
                    : 0;

                const score = dot + rootBonus + simpBonus + diaBonus;

                if (score > bestScore) {
                    secondBest = bestChord ? { ...bestChord } : null;
                    bestScore  = score;
                    bestChord  = { root: this.noteNames[root], type, score, rootIdx: root };
                } else if (score > (secondBest?.score || 0)) {
                    secondBest = { root: this.noteNames[root], type, score, rootIdx: root };
                }
            }
        }

        if (!bestChord || bestScore < minScore) return null;

        /* ── 1·2등 점수 차이 좁을 때 계층적 단순화 ──
           우선순위: major > minor > 7 > m7 > maj7 > sus > add9 > dim > aug
           → 점수가 비슷하면 더 단순(빈도 높은) 코드 선택 */
        if (secondBest && bestScore - secondBest.score < 0.025) {
            const priority = [
                'major','minor','7','m7','maj7',
                'sus2','sus4','add9','madd9','power',
                '6','m6','dim','aug','dim7','m7b5','mmaj7',
                'slash_major_3rd','slash_minor_3rd',
                'slash_major_5th','slash_minor_5th',
            ];
            const winP = priority.indexOf(bestChord.type);
            const secP = priority.indexOf(secondBest.type);
            if (secP >= 0 && (winP < 0 || secP < winP)) {
                bestChord = secondBest;
                bestScore = secondBest.score;
            }
        }

        /* ── slash chord 처리 ──
           slash 타입이면 코드명을 "루트/베이스" 형식으로 변환 */
        if (bestChord.type.startsWith('slash_')) {
            return this._resolveSlashChord(bestChord, chroma);
        }

        return {
            root : bestChord.root,
            type : bestChord.type,
            name : this.formatChordName(bestChord.root, bestChord.type),
            score: bestChord.score,
        };
    }

    /* ── slash chord → 코드명 변환 ──
       기타에서 자주 쓰이는 전위코드를 루트/베이스 형식으로 표현
       단, 베이스 에너지가 충분히 강할 때만 slash로 표현
       그렇지 않으면 기본 코드(major/minor)로 단순화 */
    _resolveSlashChord(candidate, chroma) {
        const root    = candidate.rootIdx;
        const type    = candidate.type;
        const offset  = this._slashBassOffset[type];
        if (offset === undefined) return {
            root: candidate.root, type: 'major',
            name: candidate.root, score: candidate.score * 0.9,
        };

        const bassCls = (root + offset) % 12;
        const rootCls = root;

        // 베이스음이 루트보다 약하면 → 일반 코드로 반환
        const bassEnergy = chroma[bassCls];
        const rootEnergy = chroma[rootCls];

        // 베이스 에너지가 루트의 60% 이상이면 slash 표현
        if (bassEnergy >= rootEnergy * 0.6) {
            const baseType = type.includes('minor') ? 'minor' : 'major';
            const bassNote = this.noteNames[bassCls];
            const chordName = this.formatChordName(candidate.root, baseType);
            return {
                root    : candidate.root,
                type    : baseType,
                bassNote: bassNote,           // 베이스 분리음
                name    : `${chordName}/${bassNote}`,  // A/G 형식
                isSlash : true,
                score   : candidate.score,
            };
        }

        // 베이스 에너지 부족 → 기본 코드로
        const baseType = type.includes('minor') ? 'minor' : 'major';
        return {
            root : candidate.root,
            type : baseType,
            name : this.formatChordName(candidate.root, baseType),
            score: candidate.score * 0.9,
        };
    }

    /* ── 조성 다이어토닉 코드 보너스 맵 생성 ──
       예) C Major → C, Dm, Em, F, G, Am, Bdim 에 보너스 */
    _getDiatonicBonus(keyString) {
        if (!keyString) return null;
        const m = keyString.match(/^([A-G][#b]?)\s*(Major|Minor)$/i);
        if (!m) return null;

        const keyRoot = m[1];
        const mode    = m[2].toLowerCase();
        const rootIdx = this.noteNames.indexOf(keyRoot.replace('b','').replace('#',''));
        if (rootIdx < 0) return null;

        const bonus = {};
        // 장조 다이어토닉 코드 타입 (I=maj, II=min, III=min, IV=maj, V=maj, VI=min, VII=dim)
        const majorDiatonic = [
            [0,'major'], [2,'minor'], [4,'minor'],
            [5,'major'], [7,'major'], [9,'minor'], [11,'dim'],
        ];
        // 단조 다이어토닉 (I=min, II=m7b5, III=maj, IV=min, V=min, VI=maj, VII=maj)
        const minorDiatonic = [
            [0,'minor'], [2,'m7b5'], [3,'major'],
            [5,'minor'], [7,'minor'], [8,'major'], [10,'major'],
        ];

        const diatonic = mode === 'minor' ? minorDiatonic : majorDiatonic;
        diatonic.forEach(([interval, type]) => {
            const note = this.noteNames[(rootIdx + interval) % 12];
            // 기본 코드 보너스
            bonus[`${note}_${type}`] = 0.018;
            // 같은 루트의 7th 확장도 보너스 (V7, IIm7 등)
            if (type === 'major') bonus[`${note}_7`]    = 0.012;
            if (type === 'major') bonus[`${note}_maj7`] = 0.010;
            if (type === 'minor') bonus[`${note}_m7`]   = 0.012;
            // sus 변형도 약소 보너스
            bonus[`${note}_sus4`] = 0.006;
            bonus[`${note}_sus2`] = 0.006;
        });
        return bonus;
    }

    /* ═══════════════════════════════════════════════════
       ④ 메인 코드 감지 v4 — HPCP + 튜닝보정 + Beat-aligned 앙상블
       ────────────────────────────────────────────────────
       파이프라인:
         1. 자동 튜닝 편차 보정 (detectTuning)
         2. Beat-aligned Median Pooling (박자 단위 코드)
         3. 멀티 윈도우 앙상블 (기존 shortWin+longWin, 크로마 캐시 활용)
         4. 두 결과 앙상블 (beat 결과 가중치 높게)
         5. Viterbi 3패스 스무딩
    ═══════════════════════════════════════════════════ */
    detectChords(noteSequence, windowSize = 16, bpm = null, keyContext = null) {
        if (!noteSequence || noteSequence.length === 0) return [];

        // ── Step 1: 자동 튜닝 편차 보정 ──
        if (!this._tuningDetected) {
            this.detectTuning(noteSequence);
        }

        const shortWin = Math.max(6,  Math.round(windowSize * 0.6));
        const longWin  = Math.max(16, Math.round(windowSize * 1.5));

        // ── Step 2: 프레임별 크로마 캐시 사전 계산 (HPCP 방식) ──
        this._chromaCache = this._precomputeFrameChroma(noteSequence);

        // ── Step 3: 멀티 윈도우 앙상블 (기존 방식, 캐시 활용) ──
        const shortRaw = this._detectPassWithWindow(noteSequence, shortWin, keyContext);
        const longRaw  = this._detectPassWithWindow(noteSequence, longWin, keyContext);
        this._chromaCache = null;

        const ensemble = this._ensembleChords(shortRaw, longRaw);

        // ── Step 4: Beat-aligned Median Pooling (BPM이 주어진 경우 활성화) ──
        let finalResult = ensemble;
        if (bpm && bpm > 40) {
            const beatAligned = this.detectChordsBeatsAligned(noteSequence, bpm, 4, keyContext);

            // beat 결과와 앙상블 결과를 시간 기준으로 합성
            // beat 결과가 신뢰도가 더 높을 때 우선 사용
            finalResult = ensemble.map(e => {
                // 가장 가까운 beat 코드 탐색
                const nearBeat = beatAligned.reduce((best, b) =>
                    Math.abs(b.time - e.time) < Math.abs(best.time - e.time) ? b : best,
                    beatAligned[0]);

                if (!nearBeat?.chord) return e;
                if (!e.chord)         return { ...e, chord: nearBeat.chord, confidence: nearBeat.confidence * 0.9 };

                // beat 결과와 앙상블 결과가 같으면 신뢰도 보강
                if (nearBeat.chord.name === e.chord.name) {
                    return { ...e, confidence: e.confidence + nearBeat.confidence * 0.4 };
                }

                // 다를 경우: beat 결과가 신뢰도 높으면 beat 우선
                const beatConf = nearBeat.confidence * 1.2; // beat pooling에 20% 가중치 보너스
                return beatConf > e.confidence
                    ? { ...e, chord: nearBeat.chord, confidence: nearBeat.confidence }
                    : e;
            });
        }

        // ── Step 5: Viterbi 스무딩 ──
        const smoothed = this._viterbiSmooth(finalResult);

        // ── Step 6: 공백 보간 ──
        const chords = [];
        let lastGood = null;
        for (const item of smoothed) {
            if (item.chord) {
                lastGood = item.chord;
                chords.push(item);
            } else {
                chords.push({ ...item, chord: lastGood });
            }
        }

        // 다음 분석을 위해 튜닝 감지 플래그 리셋
        this._tuningDetected = false;

        return chords;
    }

    /* ─ 단일 윈도우 패스 ─
       개선: mergedFft 배열 복사 없이 프레임 참조 리스트만 보관 후
             _computeChromaFromFrames()에서 직접 순회 → 메모리 절약
    ─ */
    _detectPassWithWindow(noteSequence, win, keyContext = null) {
        const results = [];
        const hop     = Math.max(1, Math.floor(win / 2));

        for (let i = 0; i < noteSequence.length; i += hop) {
            const end       = Math.min(i + win, noteSequence.length);
            const timeStart = noteSequence[i]?.time ?? (i * 0.023);

            let totalRms  = 0;
            let totalFlux = 0;
            for (let j = i; j < end; j++) {
                totalRms  += noteSequence[j].rms           || 0;
                totalFlux += noteSequence[j].spectralFlux  || 0;
            }
            const avgRms = totalRms / (end - i);

            // 무음 구간 스킵
            if (avgRms < 0.002) {
                results.push({ time: timeStart, chord: null, rms: avgRms, confidence: 0 });
                continue;
            }

            // ── 크로마 계산: 캐시 있으면 합산, 없으면 직접 계산 ──
            const chroma = this._chromaCache
                ? this._computeChromaFromCache(i, end)
                : this._computeChromaFromRange(noteSequence, i, end);

            // 온셋 강도
            const fluxFactor = 1.0 + Math.min(totalFlux / (end - i), 0.5);

            // 코드 매칭 (키 컨텍스트 반영)
            const chord = this._matchChordFromChroma(chroma, 0.30, keyContext);

            results.push({
                time:       timeStart,
                chord,
                rms:        avgRms,
                confidence: (chord?.score || 0) * fluxFactor,
                chroma,
            });
        }
        return results;
    }

    /* ─ 프레임별 크로마 사전 계산 (캐시) ─
       각 프레임의 크로마를 한 번만 계산해두고 윈도우 패스에서 재활용
    ─ */
    _precomputeFrameChroma(noteSequence, minFreq = 55, maxFreq = 3500) {
        const cache = new Array(noteSequence.length);
        for (let i = 0; i < noteSequence.length; i++) {
            cache[i] = this._computeChromaFromRange(noteSequence, i, i + 1, minFreq, maxFreq);
        }
        return cache;
    }

    /* ─ 캐시된 크로마를 범위 합산으로 윈도우 크로마 계산 ─ */
    _computeChromaFromCache(start, end) {
        const sum = new Float32Array(12);
        const cache = this._chromaCache;
        if (!cache) return sum;

        for (let i = start; i < end && i < cache.length; i++) {
            for (let c = 0; c < 12; c++) sum[c] += cache[i][c];
        }

        // L2 정규화
        let norm = 0;
        for (let i = 0; i < 12; i++) norm += sum[i] * sum[i];
        norm = Math.sqrt(norm) || 1;
        for (let i = 0; i < 12; i++) sum[i] /= norm;
        return sum;
    }


    /* ─ 두 패스 앙상블 (신뢰도 가중 투표) ─ */
    _ensembleChords(shortPass, longPass) {
        // longPass 시간 인덱스 맵
        const longMap = new Map(longPass.map(d => [Math.round(d.time * 10), d]));

        return shortPass.map(s => {
            const l = longMap.get(Math.round(s.time * 10))
                   || longPass.reduce((best, d) =>
                        Math.abs(d.time - s.time) < Math.abs(best.time - s.time) ? d : best,
                        longPass[0]);

            if (!s.chord && !l?.chord) return s;
            if (!s.chord)  return { ...s, chord: l.chord, confidence: l.confidence * 0.8 };
            if (!l?.chord) return s;

            // 같은 코드면 신뢰도 합산
            if (s.chord.name === l.chord.name) {
                return { ...s, confidence: s.confidence + l.confidence * 0.5 };
            }

            // 다른 코드면 신뢰도 높은 쪽 선택 (단, 같은 루트면 단순 코드 우선)
            if (s.chord.root === l.chord.root) {
                const simpleTypes = ['major','minor','power','7','m7'];
                const sIdx = simpleTypes.indexOf(s.chord.type);
                const lIdx = simpleTypes.indexOf(l.chord.type);
                if (lIdx >= 0 && (sIdx < 0 || lIdx < sIdx)) {
                    return { ...s, chord: l.chord, confidence: l.confidence };
                }
            }

            return s.confidence >= (l?.confidence || 0) ? s : { ...s, chord: l.chord };
        });
    }

    /* ─ 비터비 스무딩 (HMM 근사) ─
       v4.1 개선: 스무딩 강도 완화 → 빠른 코드 전환 곡에서 올바른 변환점 보존
    ─ */
    _viterbiSmooth(rawChords) {
        if (rawChords.length < 3) return rawChords;

        // 1차: 단발 노이즈 제거 — 임계값 상향으로 더 적극적 노이즈 제거
        const pass1 = [...rawChords];

        for (let i = 1; i < pass1.length - 1; i++) {
            const prev = pass1[i-1].chord?.name;
            const curr = pass1[i].chord?.name;
            const next = pass1[i+1].chord?.name;
            const currConf = pass1[i].confidence || 0;
            if (prev && next && prev === next && curr !== prev && currConf < 0.42) {
                pass1[i] = { ...pass1[i], chord: pass1[i-1].chord };
            }
        }

        // 2차: 2프레임 이하 단독 코드 병합
        const pass2 = [...pass1];
        for (let i = 1; i < pass2.length - 3; i++) {
            const a    = pass2[i-1].chord?.name;
            const b1   = pass2[i].chord?.name;
            const b2   = pass2[i+1].chord?.name;
            const c    = pass2[i+2].chord?.name;
            const b1Cf = pass2[i].confidence   || 0;
            const b2Cf = pass2[i+1].confidence || 0;

            if (a && c && a === c && b1 === b2 && b1 !== a &&
                b1Cf < 0.32 && b2Cf < 0.32) {
                pass2[i]   = { ...pass2[i],   chord: pass2[i-1].chord };
                pass2[i+1] = { ...pass2[i+1], chord: pass2[i-1].chord };
                i++;
            } else if (a && c && a === c && a !== b1 && b1Cf < 0.30) {
                pass2[i] = { ...pass2[i], chord: pass2[i-1].chord };
            }
        }

        // 3차: 신뢰도 기반 재검사 — 임계값 상향
        const pass3 = [...pass2];
        for (let i = 1; i < pass3.length - 1; i++) {
            const curr = pass3[i];
            if (!curr.chord || curr.confidence < 0.22) {
                const prev = pass3[i-1];
                const next = pass3[i+1];
                if ((prev.confidence || 0) > (next.confidence || 0) && prev.chord) {
                    pass3[i] = { ...curr, chord: prev.chord };
                } else if (next.chord) {
                    pass3[i] = { ...curr, chord: next.chord };
                }
            }
        }

        return pass3;
    }

    /* ═══════════════════════════════════════════════════
       ⑧ 자동 튜닝 편차 보정 v4
       ────────────────────────────────────────────────────
       A4 기준 주파수가 440Hz가 아닌 녹음(예: 432Hz, 445Hz)에서
       음정 클래스 매핑 오류를 방지합니다.

       원리:
         전체 프레임의 가장 강한 피크들의 MIDI 소수점을 모아
         히스토그램에서 가장 많이 등장하는 센트 오프셋을 계산,
         A4 기준 주파수를 ±50센트 범위 내에서 보정합니다.

       효과:
         - 표준 튜닝(440Hz)이면 보정값 = 0 (아무 영향 없음)
         - 432Hz 튜닝이면 약 -31.8센트 → 음정 클래스 정렬 복원
         - 라이브 녹음의 불안정한 튜닝에도 대응
    ═══════════════════════════════════════════════════ */
    detectTuning(analysisData) {
        const centBins = new Float32Array(100); // -50 ~ +49 센트, 1센트 단위
        let totalWeight = 0;

        for (const frame of analysisData) {
            if (!frame.fft || frame.rms < 0.003) continue;

            // 상위 5개 강한 피크만 사용
            const sorted = [...frame.fft]
                .filter(d => d.freq > 80 && d.freq < 2000 && d.magnitude > 0.001)
                .sort((a, b) => b.magnitude - a.magnitude)
                .slice(0, 5);

            for (const peak of sorted) {
                const midiExact = 12 * Math.log2(peak.freq / 440.0) + 69;
                const midiRound = Math.round(midiExact);
                const centOff   = (midiExact - midiRound) * 100; // -50 ~ +50

                // 50센트 범위 히스토그램 (인덱스: centOff+50)
                const bin = Math.round(centOff + 50);
                if (bin >= 0 && bin < 100) {
                    centBins[bin] += peak.magnitude;
                    totalWeight   += peak.magnitude;
                }
            }
        }

        if (totalWeight < 0.1) {
            this._tuningFreqA4  = 440.0;
            this._tuningDetected = true;
            return 440.0;
        }

        // 가우시안 스무딩 (±3센트 윈도우) 후 최댓값 위치 찾기
        const smoothed = new Float32Array(100);
        for (let i = 0; i < 100; i++) {
            let sum = 0, wSum = 0;
            for (let d = -4; d <= 4; d++) {
                const j = i + d;
                if (j < 0 || j >= 100) continue;
                const w = Math.exp(-(d * d) / 8);
                sum  += centBins[j] * w;
                wSum += w;
            }
            smoothed[i] = sum / (wSum || 1);
        }

        let maxBin = 50; // 기본값 = 0센트 오프셋
        let maxVal = smoothed[50];
        for (let i = 0; i < 100; i++) {
            if (smoothed[i] > maxVal) { maxVal = smoothed[i]; maxBin = i; }
        }

        const centOffset = maxBin - 50;          // -50 ~ +49 센트
        const freqA4     = 440.0 * Math.pow(2, centOffset / 1200);

        this._tuningFreqA4   = freqA4;
        this._tuningDetected = true;
        return freqA4;
    }

    /* ═══════════════════════════════════════════════════
       ⑨ Beat-aligned Median Pooling v4
       ────────────────────────────────────────────────────
       BPM을 기반으로 정확한 박자 경계를 계산하고,
       각 박자 구간의 크로마 벡터를 중앙값(median)으로 집계합니다.

       왜 median인가:
         - 박자 구간 안에 드럼 히트(순간적 노이즈)가 있어도
           중앙값은 그 순간 값을 무시하고 지속음 크로마만 반영
         - mean(평균) 대비 이상치 억제력 훨씬 강함

       효과:
         코드 변환점이 박자와 정렬 → 악보에서 코드 전환 위치 정확도 향상
         드럼 히트 순간 코드가 바뀌는 오감지 대폭 감소
    ═══════════════════════════════════════════════════ */
    detectChordsBeatsAligned(noteSequence, bpm, beatsPerMeasure = 4, keyContext = null) {
        if (!noteSequence || noteSequence.length === 0) return [];
        if (!bpm || bpm < 40) bpm = 120;

        const beatDuration  = 60.0 / bpm;           // 박자 하나의 시간(초)
        const totalDuration = noteSequence[noteSequence.length - 1]?.time || 0;
        const totalBeats    = Math.ceil(totalDuration / beatDuration) + 1;

        // 프레임 시간 → 인덱스 매핑용 (빠른 이진 탐색)
        const times = noteSequence.map(f => f.time);

        const beatChords = [];

        for (let b = 0; b < totalBeats; b++) {
            const beatStart = b * beatDuration;
            const beatEnd   = beatStart + beatDuration;

            // 이 박자 구간에 해당하는 프레임 인덱스 범위
            const iStart = this._lowerBound(times, beatStart);
            const iEnd   = this._lowerBound(times, beatEnd);

            if (iEnd <= iStart) {
                beatChords.push({
                    time:       beatStart,
                    beat:       b,
                    chord:      beatChords[beatChords.length - 1]?.chord || null,
                    confidence: 0,
                    pooled:     true,
                });
                continue;
            }

            // 평균 RMS로 무음 구간 판별
            let rmsSum = 0;
            for (let i = iStart; i < iEnd; i++) rmsSum += (noteSequence[i].rms || 0);
            const avgRms = rmsSum / (iEnd - iStart);
            if (avgRms < 0.002) {
                beatChords.push({ time: beatStart, beat: b, chord: null, confidence: 0, pooled: true });
                continue;
            }

            // ── Median Pooling ──
            // 각 피치 클래스별로 구간 내 값들의 중앙값을 계산
            const frameCount = iEnd - iStart;
            const chromaMatrix = [];
            for (let i = iStart; i < iEnd; i++) {
                const fft = noteSequence[i]?.fft;
                if (fft) chromaMatrix.push(this._computeChromaFromRange(noteSequence, i, i + 1));
            }

            if (chromaMatrix.length === 0) {
                beatChords.push({ time: beatStart, beat: b, chord: null, confidence: 0, pooled: true });
                continue;
            }

            const medianChroma = new Float32Array(12);
            for (let c = 0; c < 12; c++) {
                const vals = chromaMatrix.map(ch => ch[c]).sort((a, b) => a - b);
                const mid  = Math.floor(vals.length / 2);
                medianChroma[c] = vals.length % 2 === 1
                    ? vals[mid]
                    : (vals[mid - 1] + vals[mid]) * 0.5;
            }

            // L2 재정규화
            let norm = 0;
            for (let i = 0; i < 12; i++) norm += medianChroma[i] * medianChroma[i];
            norm = Math.sqrt(norm) || 1;
            for (let i = 0; i < 12; i++) medianChroma[i] /= norm;

            const chord = this._matchChordFromChroma(medianChroma, 0.30, keyContext);

            beatChords.push({
                time:       beatStart,
                beat:       b,
                chord,
                confidence: (chord?.score || 0) * (0.5 + avgRms * 2),
                pooled:     true,
            });
        }

        // Viterbi 스무딩 적용
        return this._viterbiSmooth(beatChords);
    }

    /* ─ HPCP 크로마 (인덱스 범위 직접 순회, RMS 기반 동적 임계값) v5 ─ */
    _computeChromaFromRange(noteSequence, start, end, minFreq = 55, maxFreq = 3500) {
        const chroma   = new Float32Array(12);
        const refA4    = this._tuningFreqA4;
        const hWeights = this._hpcpHarmonicWeights;
        const nHarm    = this._hpcpHarmonics;

        for (let si = start; si < end; si++) {
            const fftData = noteSequence[si]?.fft;
            if (!fftData) continue;

            const rms = noteSequence[si].rms || 0.001;
            const absThr = Math.max(0.0001, rms * 0.05);

            // 피크 추출 (강화된 조건)
            const localPeaks = [];
            for (let k = 1; k < fftData.length - 1; k++) {
                const d    = fftData[k];
                const freq = d.freq;
                if (freq < minFreq || freq > maxFreq) continue;
                if (d.magnitude < absThr) continue;
                if (d.magnitude < fftData[k-1].magnitude * 0.75 &&
                    d.magnitude < fftData[k+1].magnitude * 0.75) continue;
                localPeaks.push(d);
            }
            localPeaks.sort((a, b) => b.magnitude - a.magnitude);
            const topN = localPeaks.slice(0, 50);

            for (const d of topN) {
                const freq = d.freq;
                const mag  = d.magnitude;
                const hpfGain = freq < 80 ? Math.pow(freq / 80, 2.5) : 1.0;
                if (hpfGain < 0.05) continue;

                for (let n = 1; n <= nHarm; n++) {
                    const fundFreq = freq / n;
                    if (fundFreq < 55 || fundFreq > 1600) continue;

                    const midiExact = 12 * Math.log2(fundFreq / refA4) + 69;
                    const midiRound = Math.round(midiExact);
                    const cls       = ((midiRound % 12) + 12) % 12;
                    const centOff   = (midiExact - midiRound) * 100;

                    const sigma   = 15;
                    const spreadW = Math.exp(-(centOff * centOff) / (2 * sigma * sigma));
                    const oct     = Math.floor(midiRound / 12) - 1;
                    const octW    = (oct >= 2 && oct <= 6) ? (1.0 - Math.abs(oct - 4) * 0.07) : 0.45;

                    const contrib = Math.pow(mag, 1.3) * (hWeights[n-1] || 0.12)
                        * spreadW * octW * hpfGain;
                    chroma[cls] += contrib;

                    if (Math.abs(centOff) > 20) {
                        const adj = centOff > 0 ? (cls + 1) % 12 : (cls + 11) % 12;
                        chroma[adj] += contrib * (1.0 - spreadW) * 0.3;
                    }
                }
            }
        }

        let norm = 0;
        for (let i = 0; i < 12; i++) norm += chroma[i] * chroma[i];
        norm = Math.sqrt(norm) || 1;
        for (let i = 0; i < 12; i++) chroma[i] /= norm;
        return chroma;
    }

    /* ─ 이진 탐색: times 배열에서 target 이상인 첫 인덱스 ─ */
    _lowerBound(times, target) {
        let lo = 0, hi = times.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (times[mid] < target) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    /* ═══════════════════════════════════════════════════
       ⑩ 코드 전위(Inversion) 인식 강화 v4
       ────────────────────────────────────────────────────
       예: E 음이 가장 낮게 들리면 → C/E (C코드 1전위) 가능성 탐지
       베이스 음역(55~220Hz) 에너지가 가장 강한 피치 클래스를
       루트 후보에서 보너스로 처리합니다.

       실용적 효과:
         - 기타 코드의 오픈 보이싱에서 최저음 ≠ 루트인 경우 정확도 향상
         - 예) Cadd9(x32030) → 최저음 C, Gadd9(320032) → 최저음 G 올바르게 인식
    ═══════════════════════════════════════════════════ */
    _detectBassNote(fftData) {
        if (!fftData || fftData.length === 0) return -1;

        // 베이스 음역 (55~220Hz: 기타 E2~A3 범위)
        const bassBand = fftData.filter(d => d.freq >= 55 && d.freq <= 220);
        if (bassBand.length === 0) return -1;

        // 가장 강한 저음 피크
        const strongest = bassBand.reduce((best, d) =>
            d.magnitude > best.magnitude ? d : best, bassBand[0]);

        if (strongest.magnitude < 0.0005) return -1;

        const midiRound = Math.round(12 * Math.log2(strongest.freq / this._tuningFreqA4) + 69);
        return ((midiRound % 12) + 12) % 12;
    }

    /* ── 전위 보정을 포함한 코드 매칭 래퍼 ── */
    _matchChordWithBass(chroma, fftDataForBass) {
        const baseChord = this._matchChordFromChroma(chroma);
        if (!fftDataForBass) return baseChord;

        const bassNote = this._detectBassNote(fftDataForBass);
        if (bassNote < 0) return baseChord;

        // 베이스 음정이 루트가 아닌 경우: 크로마 벡터에서 베이스 음정 가중치 보너스
        // → 재매칭해서 베이스음이 루트인 코드를 우선 탐색
        const boostedChroma = new Float32Array(chroma);
        boostedChroma[bassNote] = Math.min(boostedChroma[bassNote] * 1.4, 1.0);

        // 재정규화
        let norm = 0;
        for (let i = 0; i < 12; i++) norm += boostedChroma[i] * boostedChroma[i];
        norm = Math.sqrt(norm) || 1;
        for (let i = 0; i < 12; i++) boostedChroma[i] /= norm;

        const bassChord = this._matchChordFromChroma(boostedChroma);
        if (!bassChord) return baseChord;
        if (!baseChord) return bassChord;

        // 베이스 보정 코드가 기본 코드보다 점수 차이가 5% 이내면
        // 베이스음이 루트인 코드를 우선 선택
        if (bassChord.root === this.noteNames[bassNote] &&
            bassChord.score >= baseChord.score * 0.95) {
            return bassChord;
        }
        return baseChord;
    }
    detectPitch(fftData, minFreq = 60, maxFreq = 1400) {
        return this._hps(fftData, minFreq, maxFreq, 5);
    }

    /* ═══════════════════════════════════════════════════
       ⑥ BPM 추정 v2 — 스펙트럴 플럭스 + ACF 결합
       - 스펙트럴 플럭스 기반 온셋 감지
       - 자기 상관 함수(ACF)로 주기성 확인
       - IOI 히스토그램 투표
    ═══════════════════════════════════════════════════ */
    estimateBPM(analysisData) {
        if (!analysisData || analysisData.length < 20) return 120;

        const hasFlux = analysisData[0]?.spectralFlux !== undefined;
        const signal  = hasFlux
            ? analysisData.map(d => d.spectralFlux || 0)
            : analysisData.map(d => d.rms || 0);
        const times   = analysisData.map(d => d.time);

        // ── 신호 정규화 ──
        const maxSig = Math.max(...signal) || 1;
        const normSig = signal.map(v => v / maxSig);

        // ── 동적 임계값 온셋 감지 (개선: 중앙값 기반 임계값 + 2프레임 확인) ──
        const windowW = 30;
        const onsets  = [];

        for (let i = windowW; i < normSig.length - 2; i++) {
            const slice = normSig.slice(i - windowW, i);
            const localMean = slice.reduce((s, v) => s + v, 0) / windowW;
            const sortedSlice = slice.slice().sort((a, b) => a - b);
            const localMedian = sortedSlice[Math.floor(windowW / 2)];
            const threshold = Math.max(localMedian * 1.8, localMean * 1.5, 0.012);

            if (normSig[i] > threshold &&
                normSig[i] > normSig[i-1] &&
                normSig[i] >= normSig[i+1] &&
                normSig[i] >= normSig[i+2]) {
                if (onsets.length === 0 || times[i] - onsets[onsets.length - 1] > 0.06) {
                    onsets.push(times[i]);
                }
            }
        }

        if (onsets.length < 4) return this._estimateBPMfallback(analysisData);

        // ── IOI 계산 + 히스토그램 투표 (가우시안 가중치) ──
        const intervals = [];
        for (let i = 1; i < onsets.length; i++) {
            const dt = onsets[i] - onsets[i-1];
            if (dt > 0.06 && dt < 3.0) intervals.push(dt);
        }

        if (intervals.length < 3) return this._estimateBPMfallback(analysisData);

        // BPM 후보 투표 (가우시안 가중치 + 배수 고려)
        const bpmVotes = new Map();
        for (const ioi of intervals) {
            for (let mult = 1; mult <= 4; mult++) {
                const bpmCand = 60 / (ioi * mult);
                const bpmR = Math.round(bpmCand);
                if (bpmR >= 55 && bpmR <= 220) {
                    const weight = Math.exp(-0.5 * Math.pow(bpmCand - bpmR, 2)) / mult;
                    bpmVotes.set(bpmR, (bpmVotes.get(bpmR) || 0) + weight);
                }
            }
        }

        // ── ACF 보강: 스펙트럴 플럭스 자기상관으로 BPM 신뢰도 향상 ──
        const acfBpm = this._estimateBPMfromACF(normSig, times);
        if (acfBpm > 0) {
            for (let d = -2; d <= 2; d++) {
                const b = acfBpm + d;
                if (b >= 55 && b <= 220) {
                    bpmVotes.set(b, (bpmVotes.get(b) || 0) + 5.0 / (Math.abs(d) + 1));
                }
            }
        }

        // ±2 BPM 그룹화 후 최다 득표
        let bestBpm   = acfBpm > 0 ? acfBpm : 120;
        let bestVotes = 0;
        for (const [bpm, votes] of bpmVotes) {
            let total = votes;
            for (let d = -2; d <= 2; d++) if (d !== 0) total += bpmVotes.get(bpm + d) || 0;
            if (total > bestVotes) { bestVotes = total; bestBpm = bpm; }
        }

        bestBpm = Math.max(55, Math.min(220, bestBpm));

        // 60~180 BPM 범위로 정규화 (배수 조정)
        while (bestBpm < 60)  bestBpm *= 2;
        while (bestBpm > 180) bestBpm = Math.round(bestBpm / 2);

        return Math.max(55, Math.min(220, bestBpm));
    }

    /* ─ ACF 기반 BPM 추정 (스펙트럴 플럭스 자기상관) ─ */
    _estimateBPMfromACF(normSig, times) {
        if (!normSig || normSig.length < 50) return 0;
        const frameTime = times.length > 1 ? times[1] - times[0] : 0.023;
        if (frameTime <= 0) return 0;
        const N = Math.min(normSig.length, 2000);
        const sig = normSig.slice(0, N);
        const mean = sig.reduce((s, v) => s + v, 0) / N;
        const centered = sig.map(v => v - mean);
        const lagMin = Math.floor(60 / (220 * frameTime));
        const lagMax = Math.ceil(60 / (55 * frameTime));
        let bestLag = 0, bestCorr = -Infinity;
        for (let lag = lagMin; lag <= lagMax && lag < N / 2; lag++) {
            let corr = 0;
            for (let i = 0; i < N - lag; i++) corr += centered[i] * centered[i + lag];
            corr /= (N - lag);
            if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
        }
        if (bestLag <= 0 || bestCorr <= 0) return 0;
        const bpmFromACF = Math.round(60 / (bestLag * frameTime));
        return (bpmFromACF >= 55 && bpmFromACF <= 220) ? bpmFromACF : 0;
    }

    _estimateBPMfallback(data) {
        const onsets = [];
        for (let i = 1; i < data.length; i++) {
            if ((data[i].rms || 0) - (data[i-1].rms || 0) > 0.015) {
                onsets.push(data[i].time);
            }
        }
        if (onsets.length < 4) return 120;
        const intervals = [];
        for (let i = 1; i < onsets.length; i++) {
            const d = onsets[i] - onsets[i-1];
            if (d > 0.1 && d < 2) intervals.push(d);
        }
        if (!intervals.length) return 120;
        intervals.sort((a, b) => a - b);
        const med = intervals[Math.floor(intervals.length / 2)];
        let bpm = Math.round(60 / med);
        if (bpm < 55)  bpm *= 2;
        if (bpm > 220) bpm = Math.round(bpm / 2);
        return Math.max(55, Math.min(220, bpm));
    }

    /* ═══════════════════════════════════════════════════
       ⑦ 조성 추정 v4 — HPCP 크로마 + Krumhansl-Schmuckler + 코드 투표
       - 전체 크로마 누적에 피어슨 상관 적용
       - 감지된 코드 목록으로 후보 조성에 보너스 가산
       - HPCP 기반 크로마 사용으로 정확도 향상
    ═══════════════════════════════════════════════════ */
    detectKey(noteSequence, chordList = []) {
        // 튜닝 보정이 안 되어 있으면 먼저 수행
        if (!this._tuningDetected) this.detectTuning(noteSequence);

        // HPCP 크로마 히스토그램 누적 (RMS 가중)
        const chroma = new Float32Array(12);
        for (const item of noteSequence) {
            if (!item.fft) continue;
            const frameChroma = this._computeChroma(item.fft, 55, 3500);
            const w = Math.pow(item.rms || 0.01, 0.5);
            for (let i = 0; i < 12; i++) chroma[i] += frameChroma[i] * w;
        }

        // L2 정규화
        let norm = 0;
        for (let i = 0; i < 12; i++) norm += chroma[i] * chroma[i];
        norm = Math.sqrt(norm) || 1;
        const normalized = chroma.map(v => v / norm);

        const chromaMean = normalized.reduce((s, v) => s + v, 0) / 12;
        const chromaVar  = normalized.reduce((s, v) => s + (v - chromaMean) ** 2, 0);

        // 코드 목록으로부터 루트 음정 빈도 집계
        const rootVotes = new Array(12).fill(0);
        for (const c of chordList) {
            if (c?.chord?.root) {
                const idx = this.noteNames.indexOf(c.chord.root);
                if (idx >= 0) rootVotes[idx]++;
            }
        }

        let bestKey   = 'C Major';
        let bestScore = -Infinity;

        const allKeys = [
            ...Object.keys(this.majorScales).map(k => ({ key: k, mode: 'major' })),
            ...Object.keys(this.majorScales).map(k => {
                const scale     = this.majorScales[k];
                const minorRoot = this.noteNames[scale[5]];
                return { key: minorRoot, mode: 'minor', offset: scale[5] };
            }),
        ];

        for (const { key, mode, offset = null } of allKeys) {
            const profile  = mode === 'major' ? this.majorProfile : this.minorProfile;
            const rootIdx  = offset !== null ? offset : this.noteNames.indexOf(key);
            if (rootIdx < 0) continue;

            const rotated  = [];
            for (let i = 0; i < 12; i++) rotated.push(profile[(i - rootIdx + 12) % 12]);

            const profMean = rotated.reduce((s, v) => s + v, 0) / 12;
            const profVar  = rotated.reduce((s, v) => s + (v - profMean) ** 2, 0);

            let cov = 0;
            for (let i = 0; i < 12; i++) {
                cov += (normalized[i] - chromaMean) * (rotated[i] - profMean);
            }
            const denom = Math.sqrt(chromaVar * profVar) || 1;
            let   corr  = cov / denom;

            // 코드 투표 보너스: 해당 조성의 주요 음이 자주 등장하면 +
            const scale = this.majorScales[key] || this.majorScales['C'];
            let chordBonus = 0;
            scale.forEach(pc => { chordBonus += (rootVotes[pc] || 0) * 0.05; });
            corr += Math.min(chordBonus, 0.15);

            if (corr > bestScore) {
                bestScore = corr;
                bestKey   = mode === 'major' ? `${key} Major` : `${key} Minor`;
            }
        }

        return bestKey;
    }

    /* ═══════════════════════════════════════════════════
       유틸리티
    ═══════════════════════════════════════════════════ */
    freqToNote(freq) {
        if (freq <= 0) return null;
        const midi = Math.round(12 * Math.log2(freq / 440) + 69);
        if (midi < 0 || midi > 127) return null;
        const octave    = Math.floor(midi / 12) - 1;
        const noteName  = this.noteNames[midi % 12];
        const exactFreq = 440 * Math.pow(2, (midi - 69) / 12);
        const cents     = 1200 * Math.log2(freq / exactFreq);
        return { name: noteName, octave, fullName: `${noteName}${octave}`, midi, freq, exactFreq, cents: Math.round(cents) };
    }

    formatChordName(root, type) {
        const typeMap = {
            'major':'', 'minor':'m', '7':'7', 'maj7':'maj7',
            'm7':'m7', 'm7b5':'m7b5', 'dim7':'dim7',
            'sus2':'sus2', 'sus4':'sus4', 'dim':'dim',
            'aug':'aug', 'add9':'add9', 'power':'5',
            '9':'9', 'madd9':'madd9',
            /* v4.1 추가 */
            'm9':'m9', 'maj9':'maj9', '11':'11', 'm11':'m11',
            'maj11':'maj11', '13':'13', 'add2':'add2',
            'sus2add7':'sus2add7', '6':'6', 'm6':'m6', 'mmaj7':'mMaj7',
        };
        return root + (typeMap[type] !== undefined ? typeMap[type] : type);
    }

    inferChordFromRoot(noteClass) {
        const root = this.noteNames[noteClass];
        return { root, type: 'major', name: root, score: 0.3, inferred: true };
    }

    getInstrumentRange(instrument) {
        const ranges = {
            'acoustic' : { minFreq: 75,  maxFreq: 1200 },
            'electric1': { minFreq: 150, maxFreq: 1400 },
            'electric2': { minFreq: 75,  maxFreq: 1000 },
            'bass'     : { minFreq: 35,  maxFreq: 420  },
        };
        return ranges[instrument] || ranges['acoustic'];
    }

    /* ── 하위 호환성 유지 ── */
    matchChord(noteClasses, noteWeights = null) {
        const chroma = new Float32Array(12);
        if (noteWeights) {
            for (const [cls, w] of noteWeights) chroma[cls] += w;
        } else {
            noteClasses.forEach(cls => chroma[cls]++);
        }
        return this._matchChordFromChroma(chroma);
    }

    extractFundamental(peaks, minFreq) {
        if (!peaks || peaks.length === 0) return null;
        const valid = peaks.filter(p => p.freq >= minFreq);
        return valid.length ? valid[0] : null;
    }

    /* ═══════════════════════════════════════════════════
       ⑫ 텐션 코드 → 단순형 자동 치환 (v4.3 신규)
       ────────────────────────────────────────────────────
       실제 락밴드·팝 악보에서 자주 볼 수 없는 텐션 코드를
       음향적으로 가장 가까운 기본형으로 치환합니다.

       치환 규칙 (실제 악보 분석 기반):
         9   → 7    (G9  → G7  : 7th feel 유지, 9th 생략)
         11  → 7    (C11 → C7  : 거의 동일 음향)
         13  → 7    (A13 → A7  : 가장 흔한 단순화)
         m9  → m7   (Dm9 → Dm7 : 마이너 세븐스로)
         maj9→ maj7 (Cmaj9 → Cmaj7)
         m11 → m7
         m13 → m7
         maj11→ maj7
         add2 → major  (add2는 기타에서 add9와 동일)
         mmaj7→ minor  (너무 복잡한 코드는 기본 마이너로)
         sus2add7→ sus2
         6   → major  (6th는 메이저로 충분)
         m6  → minor
         power→ major (파워코드는 맥락에 따라 메이저로 표시 가능)
                      ※ power는 electric 악기에서는 유지

       슬래시 코드(isSlash)는 변환 안 함 - 베이스라인 정보 보존
    ═══════════════════════════════════════════════════ */
    _simplifyChord(chord, instrument = 'acoustic') {
        if (!chord || !chord.type) return chord;

        // slash chord는 그대로 유지
        if (chord.isSlash) return chord;

        /* ── 텐션 → 단순형 매핑 ── */
        const tensionMap = {
            // 9th 계열 → 7th
            '9'    : '7',
            'm9'   : 'm7',
            'maj9' : 'maj7',
            // 11th 계열 → 7th
            '11'   : '7',
            'm11'  : 'm7',
            'maj11': 'maj7',
            // 13th 계열 → 7th
            '13'   : '7',
            'm13'  : 'm7',
            // 기타 복잡한 코드
            'add2'     : 'major',
            'mmaj7'    : 'minor',
            'sus2add7' : 'sus2',
            // 6화음 → 3화음
            '6'   : 'major',
            'm6'  : 'minor',
            // 감·증화음 → 3화음 (악보상 잘 표기되지 않음)
            'dim7'  : 'dim',
            'm7b5'  : 'minor',
            'aug'   : 'major',
        };

        // 파워코드: 일렉 악기는 유지, 어쿠스틱은 메이저로
        if (chord.type === 'power' && instrument === 'acoustic') {
            const newName = this.formatChordName(chord.root, 'major');
            return { ...chord, type: 'major', name: newName };
        }

        const simpleType = tensionMap[chord.type];
        if (!simpleType) return chord;  // 변환 대상 아님 → 그대로

        const newName = this.formatChordName(chord.root, simpleType);
        return {
            ...chord,
            type: simpleType,
            name: newName,
            _simplified: true,          // 변환 여부 마킹
            _originalType: chord.type,  // 원래 타입 보존 (디버깅용)
        };
    }

    /* 코드 배열 전체에 _simplifyChord 적용 */
    simplifyChordList(chordItems, instrument = 'acoustic') {
        if (!chordItems) return chordItems;
        return chordItems.map(item => {
            if (!item?.chord) return item;
            return { ...item, chord: this._simplifyChord(item.chord, instrument) };
        });
    }

    /* ═══════════════════════════════════════════════════
       ★ A. 후처리 필터: 인접 모호 코드 스냅
       ────────────────────────────────────────────────────
       원리:
         - C# / Db 같은 조표에 잘 쓰이지 않는 반음 루트 코드가
           실제 음악에서 C, D 등 인접한 자연음 코드와 얼마나 비슷한지 판단
         - "enharmonic distance" 1반음 이내 + 코드 타입 동일 or 유사 → 스냅
         - 단, 코드가 이미 diatonic 코드면 스냅 안 함 (A 메서드 단독 적용용)
         
       규칙:
         1. 루트가 샵/플랫 → 인접 자연음(±1반음) 코드로 스냅 후보 생성
         2. 후보가 현재 조성의 다이어토닉 코드에 속하면 → 무조건 스냅
         3. 후보가 다이어토닉 아닐 때 → 점수 차이가 threshold 이내면 스냅
    ═══════════════════════════════════════════════════ */
    snapEnharmonic(chordItems, keyString = null, threshold = 0.06) {
        if (!chordItems || chordItems.length === 0) return chordItems;

        // 다이어토닉 코드 세트 생성 (있으면)
        const diaSet = keyString ? this._buildDiatonicSet(keyString) : null;

        const naturalNotes = new Set(['C','D','E','F','G','A','B']);

        return chordItems.map(item => {
            if (!item?.chord) return item;
            const chord = item.chord;
            if (!chord.root || chord.isSlash) return item;

            // 이미 자연음 루트면 스냅 불필요
            if (naturalNotes.has(chord.root)) return item;

            const rootIdx = this.noteNames.indexOf(chord.root);
            if (rootIdx < 0) return item;

            // 인접 자연음 후보 (±1반음)
            const candidates = [];
            for (const delta of [-1, 1]) {
                const adjIdx  = (rootIdx + delta + 12) % 12;
                const adjNote = this.noteNames[adjIdx];
                if (naturalNotes.has(adjNote)) {
                    candidates.push({ note: adjNote, idx: adjIdx, delta });
                }
            }
            if (candidates.length === 0) return item;

            for (const cand of candidates) {
                const candKey = `${cand.note}_${chord.type}`;

                // 후보가 다이어토닉에 있으면 → 강제 스냅
                if (diaSet && diaSet.has(candKey)) {
                    const newName = this.formatChordName(cand.note, chord.type);
                    return {
                        ...item,
                        chord: {
                            ...chord,
                            root: cand.note,
                            name: newName,
                            _snappedFrom: chord.root,
                            _snapReason: 'enharmonic→diatonic',
                        }
                    };
                }

                // 다이어토닉이 없거나, 다이어토닉에 없더라도 자연음으로의 스냅 허용
                // score < (1 - threshold) 이면 낮은 신뢰 → 스냅 허용
                // threshold=0.15 → score < 0.85 이면 스냅 (대부분의 오감지 코드 커버)
                const score = chord.score || 0.5;
                if (score < (1 - threshold)) {
                    const newName = this.formatChordName(cand.note, chord.type);
                    return {
                        ...item,
                        chord: {
                            ...chord,
                            root: cand.note,
                            name: newName,
                            _snappedFrom: chord.root,
                            _snapReason: 'enharmonic→natural',
                        }
                    };
                }
            }
            return item;
        });
    }

    /* ═══════════════════════════════════════════════════
       ★ C. 조성 기반 다이어토닉 스냅
       ────────────────────────────────────────────────────
       원리:
         감지된 Key(예: C Major)의 다이어토닉 7코드를 기준으로,
         코드 목록에 있는 비다이어토닉 코드를 가장 음정 거리 가까운
         다이어토닉 코드로 교체합니다.

       세부 로직:
         1. 비다이어토닉 코드의 루트에서 반음 거리가 가장 가까운
            다이어토닉 루트를 찾음
         2. 타입이 같으면 우선 선택, 다르면 major↔7, minor↔m7 허용
         3. 코드의 confidence(score)가 임계값 이하일 때만 스냅
            (고신뢰 코드는 실제로 비다이어토닉 코드일 수 있으므로 보존)
         4. 연속 동일 코드 구간은 한 번만 처리 (효율)

       snapStrength 파라미터:
         - 'soft'  : score < 0.60 일 때만 스냅 (보수적)
         - 'medium': score < 0.75 일 때만 스냅 (권장 기본값)
         - 'hard'  : score < 0.90, 즉 거의 모든 코드 스냅 (공격적)
    ═══════════════════════════════════════════════════ */
    snapToDiatonic(chordItems, keyString, snapStrength = 'medium') {
        if (!chordItems || chordItems.length === 0 || !keyString) return chordItems;

        const diaSet    = this._buildDiatonicSet(keyString);
        const diaChords = this._buildDiatonicList(keyString);  // [{root, type, name}]
        if (!diaSet || diaChords.length === 0) return chordItems;

        const scoreThreshold = { soft: 0.80, medium: 1.00, hard: 9.99 }[snapStrength] ?? 1.00;

        return chordItems.map(item => {
            if (!item?.chord) return item;
            const chord = item.chord;
            if (!chord.root || !chord.type) return item;

            const key = `${chord.root}_${chord.type}`;

            // 이미 다이어토닉 → 스냅 불필요
            if (diaSet.has(key)) return item;

            // slash chord의 루트는 다이어토닉 검사 후 스냅
            // (slash는 타입 유지하고 루트만 스냅)

            // 고신뢰 코드는 스냅 안 함 (실제 비다이어토닉 코드 보존)
            const score = chord.score ?? 0.5;
            if (score >= scoreThreshold) return item;

            // 가장 가까운 다이어토닉 코드 찾기
            const snapped = this._findNearestDiatonic(chord, diaChords);
            if (!snapped) return item;

            return {
                ...item,
                chord: {
                    ...chord,
                    root: snapped.root,
                    type: snapped.type,
                    name: snapped.name,
                    _snappedFrom: chord.name,
                    _snapReason: 'diatonic-snap',
                }
            };
        });
    }

    /* ── 다이어토닉 코드 Set 생성 (빠른 조회용) ──
       예) C Major → Set { 'C_major', 'D_minor', 'E_minor', ... }
       7th 확장도 포함: 'G_7', 'F_maj7', 'D_m7' 등 */
    _buildDiatonicSet(keyString) {
        const list = this._buildDiatonicList(keyString);
        if (!list) return null;
        const s = new Set();
        list.forEach(c => {
            s.add(`${c.root}_${c.type}`);
            // 7th·확장형 허용
            if (c.type === 'major') {
                s.add(`${c.root}_7`);
                s.add(`${c.root}_maj7`);
                s.add(`${c.root}_sus4`);
                s.add(`${c.root}_sus2`);
                s.add(`${c.root}_add9`);
                s.add(`${c.root}_6`);
            }
            if (c.type === 'minor') {
                s.add(`${c.root}_m7`);
                s.add(`${c.root}_m7b5`);
                s.add(`${c.root}_madd9`);
                s.add(`${c.root}_m6`);
            }
            if (c.type === 'dim') {
                s.add(`${c.root}_dim7`);
                s.add(`${c.root}_m7b5`);
            }
        });
        return s;
    }

    /* ── 다이어토닉 코드 리스트 [{root, type, name}] 생성 ── */
    _buildDiatonicList(keyString) {
        if (!keyString) return null;
        const m = keyString.match(/^([A-G][#b]?)\s*(Major|Minor)$/i);
        if (!m) return null;

        const keyRootRaw = m[1];
        const mode       = m[2].toLowerCase();

        // 조표 별칭 정규화: Bb→A#, Eb→D#, Ab→G#, Db→C#, Gb→F#
        const enharmonicMap = { 'Bb':'A#','Eb':'D#','Ab':'G#','Db':'C#','Gb':'F#',
                                 'Cb':'B', 'Fb':'E' };
        const keyRoot = enharmonicMap[keyRootRaw] || keyRootRaw;

        const rootIdx = this.noteNames.indexOf(keyRoot);
        if (rootIdx < 0) return null;

        const majorDiatonic = [
            [0,'major'], [2,'minor'], [4,'minor'],
            [5,'major'], [7,'major'], [9,'minor'], [11,'dim'],
        ];
        const minorDiatonic = [
            [0,'minor'], [2,'dim'],   [3,'major'],
            [5,'minor'], [7,'minor'], [8,'major'], [10,'major'],
        ];
        // 단조에서 하모닉 마이너 V코드 (장조 V7 허용)
        const diatonic = mode === 'minor' ? minorDiatonic : majorDiatonic;

        return diatonic.map(([interval, type]) => {
            const root = this.noteNames[(rootIdx + interval) % 12];
            return { root, type, name: this.formatChordName(root, type) };
        });
    }

    /* ── 가장 가까운 다이어토닉 코드 탐색 ──
       1순위: 루트 동일 + 타입 호환
       2순위: 루트 반음 거리 최소 + 타입 호환
       타입 호환 기준: major↔7↔maj7↔sus2↔sus4↔aug, minor↔m7↔m7b5↔dim↔dim7 */
    _findNearestDiatonic(chord, diaChords) {
        const rootIdx = this.noteNames.indexOf(chord.root);
        if (rootIdx < 0) return null;

        // 타입 호환 그룹
        const majorGroup = new Set(['major','7','maj7','sus2','sus4','add9','power','aug','6']);
        const minorGroup = new Set(['minor','m7','m7b5','dim','dim7','madd9','m6']);

        const inMajorGroup = majorGroup.has(chord.type);
        const inMinorGroup = minorGroup.has(chord.type);
        // 어느 그룹에도 없으면 양쪽 모두 허용
        const inNeither = !inMajorGroup && !inMinorGroup;

        let best = null;
        let bestDist = 99;

        for (const dia of diaChords) {
            const diaIdx = this.noteNames.indexOf(dia.root);
            if (diaIdx < 0) continue;

            // 반음 거리 (원형 거리, 최대 6)
            const dist = Math.min(
                Math.abs(diaIdx - rootIdx),
                12 - Math.abs(diaIdx - rootIdx)
            );

            // 타입 호환 여부
            const diaIsMajor = majorGroup.has(dia.type);
            const diaIsMinor = minorGroup.has(dia.type);
            const typeMatch  = inNeither ||
                               (inMajorGroup && diaIsMajor) ||
                               (inMinorGroup && diaIsMinor);

            // 점수: 거리 * 2 - 타입 매칭 보너스
            const score = dist * 2 - (typeMatch ? 1 : 0);

            if (score < bestDist) {
                bestDist = score;
                best = { ...dia };
                // 타입 호환 시 원래 타입 최대한 유지 (major→major, minor→minor)
                if (typeMatch) {
                    // dim/m7b5/aug → minor 또는 major로 귀결
                    const keepType = inMajorGroup ? 'major' : 'minor';
                    best = {
                        root: dia.root,
                        type: keepType,
                        name: this.formatChordName(dia.root, keepType),
                    };
                }
            }
        }
        return best;
    }
}

window.PitchDetector = PitchDetector;
