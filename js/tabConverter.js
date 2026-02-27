/**
 * TabConverter v4.0
 *
 * 핵심 설계:
 *  - 타브악보를 FFT 음정 데이터 직접 변환이 아닌
 *    "마디별 대표 코드 → 악기 폼" 방식으로 표시
 *  - 악기 4종 폼 완전 차별화
 *    1) acoustic   : 기타 오픈 코드폼 (기본 기타 코드폼)
 *    2) electric1  : 파워코드폼 (루트+5th, E/A/D현 2-3현)
 *    3) electric2  : 트라이어드 코드폼 (G·B·e 3현 상위 포지션)
 *    4) bass       : 베이스 코드폼 (E·A 현 루트 단음)
 *  - 세븐스 코드(m7, maj7, 7, dim7, m7b5 등) 대폭 확장
 */
class TabConverter {
    constructor() {
        this.NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

        /* ── 튜닝 MIDI (index 0 = 가장 높은 현) ── */
        this.guitarTuning = {
            acoustic : [64,59,55,50,45,40],  // e B G D A E
            electric1: [64,59,55,50,45,40],
            electric2: [64,59,55,50,45,40],
            bass     : [43,38,33,28],         // G D A E
        };
        this.stringNames = {
            acoustic : ['e','B','G','D','A','E'],
            electric1: ['e','B','G','D','A','E'],
            electric2: ['e','B','G','D','A','E'],
            bass     : ['G','D','A','E'],
        };
        this.maxFret = 19;
    }

    /* ════════════════════════════════════════════════════════
       ① 마디별 대표 코드 추출 (v4.2: 마디당 최대 4개 코드)
       ─────────────────────────────────────────────────────
       4/4박자 기준으로 마디를 최대 4개의 서브비트 구간으로 분할.
       각 구간(2비트=반마디, 1비트=분기)에 코드 변화가 감지되면
       해당 구간 코드를 별도로 기록 → 한 마디에 1~4개 코드 표시.

       분할 기준:
         - 구간을 1비트(최소), 2비트, 4비트 단위로 시도
         - 인접 구간과 코드가 다를 때만 별도 슬롯으로 등록
         - 같은 코드가 연속이면 병합(슬롯 절약)
         - 최대 슬롯 수: MAX_SLOTS = 4
    ════════════════════════════════════════════════════════ */
    extractBarChords(chords, bpm, beatsPerBar = 4) {
        if (!chords || !chords.length) return [];
        const beatDur = 60.0 / bpm;
        const barDur  = beatDur * beatsPerBar;
        const MAX_SLOTS = 4;  // 한 마디 최대 코드 수

        // BPM 오프셋 보정
        const beatOffset = this._estimateBeatOffset(chords, bpm);

        // ── 전체 코드를 비트 단위 버킷으로 집계 ──
        // 버킷 단위: beatDur (1비트)
        const beatMap = new Map();   // beatIdx → [chordObj, ...]
        chords.forEach(c => {
            if (!c.chord) return;
            const adjTime = c.time - beatOffset;
            const beatIdx = Math.max(0, Math.floor(adjTime / beatDur));
            if (!beatMap.has(beatIdx)) beatMap.set(beatIdx, []);
            beatMap.get(beatIdx).push({ ...c.chord, score: c.confidence || 0.5 });
        });

        // 비트 버킷별 대표 코드 계산
        const beatChordMap = new Map();  // beatIdx → representative chord
        beatMap.forEach((list, beatIdx) => {
            beatChordMap.set(beatIdx, this._pickRepresentativeChord(list));
        });

        // ── 마디 단위로 묶어 슬롯 분배 ──
        const allBeatIdxs = [...beatChordMap.keys()].sort((a,b) => a-b);
        if (!allBeatIdxs.length) return [];

        const maxBeat   = allBeatIdxs[allBeatIdxs.length - 1];
        const numBars   = Math.floor(maxBeat / beatsPerBar) + 1;
        const result    = [];

        for (let barIdx = 0; barIdx < numBars; barIdx++) {
            const barStartBeat = barIdx * beatsPerBar;

            // 이 마디의 비트 인덱스 범위
            const beats = [];
            for (let b = 0; b < beatsPerBar; b++) {
                const bi = barStartBeat + b;
                beats.push(beatChordMap.get(bi) || null);
            }

            // 비트 배열에서 코드 변화 구간 감지 → 슬롯 리스트 생성
            const slots = this._buildBarSlots(beats, beatsPerBar, MAX_SLOTS);

            slots.forEach(slot => {
                const startTime = (barStartBeat + slot.beatOffset) * beatDur + beatOffset;
                result.push({
                    barIndex   : barIdx,
                    slotIndex  : slot.slotIndex,    // 마디 내 슬롯 번호 (0~3)
                    totalSlots : slot.totalSlots,   // 이 마디의 총 슬롯 수
                    beatOffset : slot.beatOffset,   // 마디 시작 기준 비트 오프셋
                    beatLen    : slot.beatLen,       // 이 슬롯의 비트 길이
                    startTime,
                    chord      : slot.chord,
                });
            });
        }

        return result;
    }

    /* ── 마디 내 비트 배열 → 코드 슬롯 리스트 생성 ──
       beats: [chord or null, chord or null, chord or null, chord or null]  (4비트)
       반환: [ { slotIndex, totalSlots, beatOffset, beatLen, chord } ]
    ── */
    _buildBarSlots(beats, beatsPerBar, maxSlots) {
        // null 채우기: 앞 코드 전파
        const filled = [...beats];
        let last = null;
        for (let i = 0; i < filled.length; i++) {
            if (filled[i]) { last = filled[i]; }
            else if (last) { filled[i] = last; }
        }
        // 앞이 null이면 뒤에서 역전파
        last = null;
        for (let i = filled.length - 1; i >= 0; i--) {
            if (filled[i]) { last = filled[i]; }
            else if (last) { filled[i] = last; }
        }

        if (!filled.some(Boolean)) {
            // 마디 전체가 무음
            return [{ slotIndex:0, totalSlots:1, beatOffset:0, beatLen:beatsPerBar, chord:null }];
        }

        // 연속된 동일 코드 묶기 (run-length encoding)
        const runs = [];
        let runStart = 0;
        for (let i = 1; i <= filled.length; i++) {
            const prev = filled[i-1];
            const curr = filled[i];
            const sameChord = curr && prev && curr.name === prev.name;
            if (!sameChord || i === filled.length) {
                runs.push({ chord: prev, beatOffset: runStart, beatLen: i - runStart });
                runStart = i;
            }
        }

        // 슬롯 수 제한: runs가 maxSlots 초과이면 짧은 것부터 병합
        while (runs.length > maxSlots) {
            // 가장 짧은 run 찾기
            let minIdx = 0;
            for (let i = 1; i < runs.length; i++) {
                if (runs[i].beatLen < runs[minIdx].beatLen) minIdx = i;
            }
            // 인접한 더 긴 run과 병합 (앞 or 뒤)
            const mergeWith = (minIdx > 0 && (minIdx === runs.length-1 || runs[minIdx-1].beatLen >= runs[minIdx+1]?.beatLen))
                ? minIdx - 1 : minIdx + 1;
            if (mergeWith < 0 || mergeWith >= runs.length) break;

            const a = runs[Math.min(minIdx, mergeWith)];
            const b = runs[Math.max(minIdx, mergeWith)];
            // 더 긴 쪽 코드를 대표로
            const mergedChord = a.beatLen >= b.beatLen ? a.chord : b.chord;
            const merged = {
                chord     : mergedChord,
                beatOffset: a.beatOffset,
                beatLen   : a.beatLen + b.beatLen,
            };
            runs.splice(Math.min(minIdx, mergeWith), 2, merged);
        }

        const totalSlots = runs.length;
        return runs.map((r, si) => ({
            slotIndex : si,
            totalSlots,
            beatOffset: r.beatOffset,
            beatLen   : r.beatLen,
            chord     : r.chord,
        }));
    }

    /* 마디 내 코드 목록에서 대표 코드 1개 선정
       v4.1 개선:
         - 점수(confidence) 가중 투표 방식 도입
         - 복잡 코드 타입도 올바르게 선택
         - BPM 드리프트 보정을 위해 시간 중앙값 기반 선택 병행
    */
    _pickRepresentativeChord(chordList) {
        if (!chordList.length) return null;

        // 루트별 그룹화 (score 가중치 포함)
        // slash chord는 "루트/베이스" 키로 분리해서 집계
        const rootGroups = {};
        const slashGroups = {};  // slash chord 별도 집계

        chordList.forEach(c => {
            if (!c || !c.root) return;

            // slash chord 별도 처리
            if (c.isSlash && c.bassNote) {
                const slashKey = `${c.root}/${c.bassNote}`;
                slashGroups[slashKey] = (slashGroups[slashKey] || 0) + (c.score || 0.5);
                // 루트 그룹에도 일반 코드로 포함 (fallback 용)
            }

            const key  = c.root;
            if (!rootGroups[key]) rootGroups[key] = {};
            const tkey = c.type || 'major';
            // confidence 가중치 적용 (없으면 1)
            const weight = (c.score || 0.5) * 1.0;
            rootGroups[key][tkey] = (rootGroups[key][tkey] || 0) + weight;
        });

        // 가장 가중 빈도 높은 루트 선택
        let bestRoot = null, bestRootCount = 0;
        Object.entries(rootGroups).forEach(([root, types]) => {
            const total = Object.values(types).reduce((a,b) => a+b, 0);
            if (total > bestRootCount) { bestRootCount = total; bestRoot = root; }
        });
        if (!bestRoot) return chordList[0];

        // 같은 루트 중 가장 가중 빈도 높은 type 선택
        const types = rootGroups[bestRoot];
        // 우선순위: 자주 나오는 코드 타입 순서 (v4.1: 확장 코드 추가)
        const typePriority = [
            'major','minor','m7','maj7','7',
            'madd9','add9','sus2','sus4','power',
            'm7b5','dim7','dim','aug',
            '6','m6','mmaj7',
            // 텐션 코드는 우선순위 맨 아래 (최후 수단)
            'm9','maj9','9','m11','11','13'
        ];
        let bestType = null, bestTypeCount = 0;
        Object.entries(types).forEach(([type, cnt]) => {
            const newPri = typePriority.indexOf(type);
            const oldPri = typePriority.indexOf(bestType);
            if (cnt > bestTypeCount * 1.05 || // 5% 이상 더 많으면 교체
               (cnt > bestTypeCount * 0.95 && (newPri >= 0) && (oldPri < 0 || newPri < oldPri))) {
                bestTypeCount = cnt; bestType = type;
            }
        });

        /* ── 텐션 코드 자동 치환 (악보 단순화) ──
           감지 결과가 텐션 코드여도 기본형으로 대체
           → 실제 락밴드 악보처럼 단순명료하게 표현
        */
        const TENSION_SIMPLIFY = {
            '9'    : '7',     'm9'  : 'm7',   'maj9' : 'maj7',
            '11'   : '7',     'm11' : 'm7',   'maj11': 'maj7',
            '13'   : '7',     'm13' : 'm7',
            'add2' : 'major', 'mmaj7': 'minor',
            '6'    : 'major', 'm6'  : 'minor',
        };
        if (bestType && TENSION_SIMPLIFY[bestType]) {
            bestType = TENSION_SIMPLIFY[bestType];
        }

        // slash chord가 선택된 루트와 동일한 루트로 충분히 등장했는지 확인
        // (slash chord가 전체의 35% 이상이면 slash로 표현)
        const bestName = this._buildChordName(bestRoot, bestType || 'major');
        const slashMatch = Object.entries(slashGroups)
            .filter(([k]) => k.startsWith(bestRoot + '/'))
            .sort((a, b) => b[1] - a[1]);

        if (slashMatch.length > 0) {
            const slashScore   = slashMatch[0][1];
            const totalForRoot = Object.values(types).reduce((a,b) => a+b, 0);
            if (slashScore >= totalForRoot * 0.35) {
                // slash 표현 비율이 충분하면 slash chord로 반환
                const [slashKey] = slashMatch[0];
                const parts = slashKey.split('/');
                const origChord = chordList.find(c =>
                    c.isSlash && c.root === parts[0] && c.bassNote === parts[1]);
                if (origChord) return origChord;
            }
        }

        return { root: bestRoot, type: bestType || 'major', name: bestName };
    }

    _buildChordName(root, type) {
        const typeMap = {
            major:'', minor:'m', '7':'7', maj7:'maj7', m7:'m7',
            m7b5:'m7b5', dim7:'dim7', dim:'dim', aug:'aug',
            sus2:'sus2', sus4:'sus4', add9:'add9', power:'5',
            /* v4.1 추가 */
            madd9:'madd9', m9:'m9', maj9:'maj9', '11':'11',
            m11:'m11', maj11:'maj11', '13':'13', add2:'add2',
            '6':'6', m6:'m6', mmaj7:'mMaj7',
        };
        // slash chord 타입은 변환 없이 그대로 반환 (e.g. type='major' + bassNote='B' → slash 학치리)
        return root + (typeMap[type] !== undefined ? typeMap[type] : (type||''));
    }

    /* ════════════════════════════════════════════════════════
       ② 악기별 코드폼 → 타브 데이터 변환 (v4.2: 멀티슬롯)
       barChords 각 항목은 slotIndex / totalSlots 포함
    ════════════════════════════════════════════════════════ */
    convertBarChordsToTab(barChords, instrument, bpm) {
        const tabData = [];

        barChords.forEach(bc => {
            if (!bc.chord) {
                tabData.push({
                    time      : bc.startTime, type: 'rest',
                    strings   : new Array(this.guitarTuning[instrument].length).fill(null),
                    chord     : null,
                    barIndex  : bc.barIndex,
                    slotIndex : bc.slotIndex  ?? 0,
                    totalSlots: bc.totalSlots ?? 1,
                    beatLen   : bc.beatLen    ?? 4,
                });
                return;
            }

            let strings;
            if (instrument === 'bass') {
                strings = this._getBassForm(bc.chord);
            } else if (instrument === 'electric1') {
                strings = this._getPowerChordForm(bc.chord);
            } else if (instrument === 'electric2') {
                strings = this._getTriadForm(bc.chord);
            } else {
                strings = this._getAcousticForm(bc.chord);
            }

            tabData.push({
                time      : bc.startTime,
                type      : strings.some(s => s !== null) ? 'chord' : 'rest',
                strings,
                chord     : bc.chord,
                barIndex  : bc.barIndex,
                slotIndex : bc.slotIndex  ?? 0,
                totalSlots: bc.totalSlots ?? 1,
                beatLen   : bc.beatLen    ?? 4,
            });
        });

        return tabData;
    }

    /* ── 어쿠스틱 오픈 코드폼 (기본 기타 코드폼) ── */
    _getAcousticForm(chord) {
        const ns  = 6;
        const map = this._getAcousticChordMap();
        const key = chord.name;

        // [슬래시 코드 우선 처리] isSlash 플래그 또는 '/' 포함된 코드명
        if (chord.isSlash || (chord.name && chord.name.includes('/'))) {
            const slashResult = this._getSlashChordForm(chord, map);
            if (slashResult) return slashResult;
        }

        // 정확 매칭
        if (map[key]) return [...map[key]];

        // 동의어 시도
        const enharmonic = {
            'C#':'Db','Db':'C#','D#':'Eb','Eb':'D#','F#':'Gb','Gb':'F#',
            'G#':'Ab','Ab':'G#','A#':'Bb','Bb':'A#',
        };
        // 루트 동의어 변환 시도
        const root = chord.root;
        const enh  = enharmonic[root];
        if (enh) {
            const type    = chord.type || 'major';
            const altKey  = this._buildChordName(enh, type);
            if (map[altKey]) return [...map[altKey]];
        }

        const fallbackOrder = this._getFallbackOrder(chord.root, chord.type);
        for (const k of fallbackOrder) {
            if (map[k]) return [...map[k]];
        }
        return new Array(ns).fill(null);
    }

    /* ── Slash chord 폼 처리 (e.g. G/B, C/E, Am/E) ──
       어쿠스틱 코드 맵에 직접 등록된 슬래시 코드 폼 사용,
       없으면 루트 코드를 베이스 음으로 가장 낙은 현의 트리거로
    ── */
    _getSlashChordForm(chord, map) {
        const ns = 6;

        // 맵에 직접 등록되어 있으면 바로 사용
        if (map[chord.name]) return [...map[chord.name]];

        // slash chord 이름에서 베이스음 추출: "G/B" → 베이스 = 'B'
        const parts = chord.name ? chord.name.split('/') : [];
        const bassNote = chord.bassNote || (parts.length === 2 ? parts[1] : null);
        if (!bassNote) return null;

        // 루트 코드 폼 가져오기
        const baseType = chord.type && !chord.type.startsWith('slash') ? chord.type : 'major';
        const baseKey  = chord.root + (baseType === 'major' ? '' : baseType === 'minor' ? 'm' : baseType);
        const baseForm = map[baseKey] ? [...map[baseKey]] : null;
        if (!baseForm) return null;

        // 베이스음이 들어갈 수 있는 가장 낙은 현 찾기
        const NOTE_NAMES = this.NOTE_NAMES;
        const bassIdx    = NOTE_NAMES.indexOf(bassNote);
        if (bassIdx < 0) return baseForm;

        // 기타 E현(5스트링 = index 5), A현(index 4) 베이스음 확인
        const E_OPEN = 4;  // E MIDI % 12
        const A_OPEN = 9;  // A MIDI % 12

        const eFret = (bassIdx - E_OPEN + 12) % 12;
        const aFret = (bassIdx - A_OPEN + 12) % 12;

        const result = [...baseForm];

        // E현에 베이스음 배치 (프렛 0-7이면 이상적)
        if (eFret <= 7) {
            result[5] = eFret;
            // A현이 무효화되어 있으면 베이스를 위해 활성화
            if (result[4] === null) result[5] = eFret;
            return result;
        }

        // A현에 베이스음 배치
        if (aFret <= 7) {
            result[4] = aFret;
            return result;
        }

        return baseForm;
    }

    /* ── 파워코드폼 (일렉1) ── */
    _getPowerChordForm(chord) {
        const ns      = 6;
        const strings = new Array(ns).fill(null);

        const rootName = chord.root;
        const rootIdx  = this.NOTE_NAMES.indexOf(rootName);
        if (rootIdx < 0) return strings;

        const E_OPEN_CLASS = 4; // E = 4 (mod 12)
        const A_OPEN_CLASS = 9; // A = 9
        const D_OPEN_CLASS = 2; // D = 2

        // E현(idx5) 루트 파워코드: 0~9프렛
        let fret = ((rootIdx - E_OPEN_CLASS + 12) % 12);
        if (fret <= 9) {
            strings[5] = fret;      // E현 루트
            strings[4] = fret + 2;  // A현 5th
            strings[3] = fret + 2;  // D현 옥타브 (3현 파워코드)
            return strings;
        }

        // A현(idx4) 루트 파워코드: 0~9프렛
        fret = ((rootIdx - A_OPEN_CLASS + 12) % 12);
        if (fret <= 9) {
            strings[4] = fret;      // A현 루트
            strings[3] = fret + 2;  // D현 5th
            strings[2] = fret + 2;  // G현 옥타브
            return strings;
        }

        // D현(idx3) 루트 파워코드: 0~7프렛
        fret = ((rootIdx - D_OPEN_CLASS + 12) % 12);
        if (fret <= 7) {
            strings[3] = fret;
            strings[2] = fret + 2;
            strings[1] = fret + 2;
            return strings;
        }

        return strings;
    }

    /* ── 트라이어드 코드폼 (일렉2) G·B·e 3현 ── */
    _getTriadForm(chord) {
        const ns  = 6;
        const map = this._getTriadChordMap();
        const key = chord.name;

        if (map[key]) {
            const result = new Array(ns).fill(null);
            result[2] = map[key].g;
            result[1] = map[key].b;
            result[0] = map[key].e;
            return result;
        }

        // 동의어 + 루트 fallback
        const enharmonic = {
            'C#':'Db','Db':'C#','D#':'Eb','Eb':'D#','F#':'Gb','Gb':'F#',
            'G#':'Ab','Ab':'G#','A#':'Bb','Bb':'A#',
        };
        const root = chord.root;
        const type = chord.type || 'major';
        const enh  = enharmonic[root];
        if (enh) {
            const altKey = this._buildChordName(enh, type);
            if (map[altKey]) {
                const result = new Array(ns).fill(null);
                result[2] = map[altKey].g;
                result[1] = map[altKey].b;
                result[0] = map[altKey].e;
                return result;
            }
        }

        const fallbacks = this._getFallbackOrder(root, type);
        for (const k of fallbacks) {
            if (map[k]) {
                const result = new Array(ns).fill(null);
                result[2] = map[k].g;
                result[1] = map[k].b;
                result[0] = map[k].e;
                return result;
            }
        }
        return new Array(ns).fill(null);
    }

    /* ── 베이스 코드폼 (E·A 현 루트 단음) ── */
    _getBassForm(chord) {
        const ns      = 4; // G D A E (index 0=G 3=E)
        const rootName= chord.root;
        const rootIdx = this.NOTE_NAMES.indexOf(rootName);
        if (rootIdx < 0) return new Array(ns).fill(null);

        const strings = new Array(ns).fill(null);
        const E_OPEN = 4;  // E (28 % 12)
        const A_OPEN = 9;  // A (33 % 12)
        const D_OPEN = 2;  // D (38 % 12)

        // E현(idx3) 루트: 0~7프렛 우선
        let fret = ((rootIdx - E_OPEN + 12) % 12);
        if (fret <= 7) { strings[3] = fret; return strings; }

        // A현(idx2) 루트: 0~7프렛
        fret = ((rootIdx - A_OPEN + 12) % 12);
        if (fret <= 7) { strings[2] = fret; return strings; }

        // D현(idx1) 루트: fallback
        fret = ((rootIdx - D_OPEN + 12) % 12);
        if (fret <= 9) { strings[1] = fret; return strings; }

        return new Array(ns).fill(null);
    }

    /* ── fallback 코드명 순서 생성 ── */
    _getFallbackOrder(root, type) {
        // slash chord일 때는 루트 코드로 fallback
        if (!type || type.startsWith('slash_')) {
            return [root, root + 'm'];
        }

        const typeSuffix = this._buildChordName('', type);
        const exact      = root + typeSuffix;
        const order = [exact];

        // 세븐스/확장 계열 → 기본 코드로 폴백 (v4.1 확장)
        const seventh2base = {
            'm7'   : ['m', 'major'],
            'maj7' : ['major'],
            '7'    : ['major'],
            'm7b5' : ['m'],
            'dim7' : ['dim', 'm'],
            'dim'  : ['m'],
            'aug'  : ['major'],
            'add9' : ['major'],
            'sus2' : ['major'],
            'sus4' : ['major'],
            /* v4.1 추가 */
            'madd9': ['m', 'minor', 'major'],
            'm9'   : ['m7', 'm', 'minor'],
            'maj9' : ['maj7', 'major'],
            'm11'  : ['m7', 'm', 'minor'],
            '11'   : ['7', 'major'],
            '9'    : ['7', 'major'],
            '13'   : ['7', 'major'],
            '6'    : ['major'],
            'm6'   : ['m', 'minor'],
            'mmaj7': ['m', 'minor'],
        };
        if (seventh2base[type]) {
            seventh2base[type].forEach(t => {
                const n = root + this._buildChordName('', t);
                if (!order.includes(n)) order.push(n);
            });
        }
        // 기본 메이저/마이너 추가
        [root, root+'m', root+'7', root+'maj7', root+'m7'].forEach(n => {
            if (!order.includes(n)) order.push(n);
        });

        // 샵/플랫 동의어
        const enharmonic = {
            'C#':'Db','Db':'C#','D#':'Eb','Eb':'D#','F#':'Gb','Gb':'F#',
            'G#':'Ab','Ab':'G#','A#':'Bb','Bb':'A#',
        };
        const enh = enharmonic[root];
        if (enh) {
            [enh+typeSuffix, enh, enh+'m', enh+'7'].forEach(n => {
                if (!order.includes(n)) order.push(n);
            });
        }
        return [...new Set(order)];
    }

    /* ════════════════════════════════════════════════════════
       ③ 마디 그룹화 (tabData → bars) v4.2: 멀티슬롯 지원
       bar.chords  = [{chord, slotIndex, totalSlots, beatLen}, ...]
       bar.chord   = 첫 번째 슬롯 코드 (하위호환)
    ════════════════════════════════════════════════════════ */
    groupIntoBars(tabData, bpm, beatsPerBar = 4) {
        const barDur  = (60 / bpm) * beatsPerBar;
        const barMap  = new Map();  // barIdx → { notes:[], slots:[] }

        tabData.forEach(note => {
            const bn = note.barIndex ?? Math.floor(note.time / barDur);
            if (!barMap.has(bn)) {
                barMap.set(bn, {
                    index    : bn,
                    // startTime: 이 마디의 첫 노트 time 또는 bn*barDur
                    // 첫 노트 time이 실제 음원 위치와 더 가까움 (beatOffset 보정 반영)
                    startTime: note.time,
                    notes    : [],
                    chords   : [],   // 멀티슬롯 코드 배열
                    chord    : null, // 하위호환 (첫 슬롯)
                });
            }
            const entry = barMap.get(bn);
            // startTime은 최솟값 유지 (가장 빠른 노트 기준)
            if (note.time < entry.startTime) entry.startTime = note.time;
            entry.notes.push(note);

            // 슬롯 코드 수집 (slotIndex 기준 정렬)
            if (note.chord) {
                const existing = entry.chords.find(c => c.slotIndex === (note.slotIndex ?? 0));
                if (!existing) {
                    const slotsTotal = note.totalSlots ?? 1;
                    // beatLen: note에서 가져오되, 없으면 totalSlots로 균등분할
                    const bLen = note.beatLen ?? (slotsTotal > 1 ? beatsPerBar / slotsTotal : beatsPerBar);
                    entry.chords.push({
                        chord     : note.chord,
                        slotIndex : note.slotIndex  ?? 0,
                        totalSlots: slotsTotal,
                        beatLen   : bLen,
                    });
                }
            }
        });

        // Map → 정렬된 배열
        const bars = [];
        const sortedKeys = [...barMap.keys()].sort((a,b) => a-b);
        sortedKeys.forEach(bn => {
            const b = barMap.get(bn);
            b.chords.sort((a,c) => a.slotIndex - c.slotIndex);
            b.chord = b.chords[0]?.chord || null;  // 하위호환
            bars.push(b);
        });
        return bars;
    }

    /* ════════════════════════════════════════════════════════
       ④ 레거시 호환 (main.js에서 호출하는 convertToTab 유지)
    ════════════════════════════════════════════════════════ */
    convertToTab(noteSequence, instrument, bpm = 120) {
        // noteSequence에서 chord + confidence 정보 추출
        // confidence(score)를 함께 전달해야 extractBarChords에서 정확한 슬롯 분할이 가능
        const chords = noteSequence
            .filter(n => n.chord)
            .map(n => ({
                time      : n.time,
                chord     : n.chord,
                confidence: n.chord?.score ?? n.confidence ?? 0.5,
            }));

        if (!chords.length) {
            const ns = this.guitarTuning[instrument].length;
            return [{ time: 0, type: 'rest', strings: new Array(ns).fill(null), chord: null }];
        }

        // 마디별 대표 코드 추출 (멀티슬롯, 최대 4개/마디)
        const barChords = this.extractBarChords(chords, bpm);

        // 악기폼 타브 변환
        return this.convertBarChordsToTab(barChords, instrument, bpm);
    }

    /* ════════════════════════════════════════════════════════
       ④-2 크로마 유사도 기반 코드 구간 비교
       두 크로마 벡터(또는 코드)가 충분히 유사한지 판단
       유사도 임계값 0.82 이상이면 '비슷한 구간'으로 판단
    ════════════════════════════════════════════════════════ */
    chromaSimilarity(chordA, chordB) {
        if (!chordA || !chordB) return 0;
        // 루트가 같으면 기본 유사도 0.7
        if (chordA.root === chordB.root) {
            if (chordA.type === chordB.type) return 1.0;
            // 같은 루트, 유사 타입 (major↔maj7, minor↔m7 등)
            const similar = [
                ['major','maj7'],['major','add9'],['major','6'],
                ['minor','m7'],['minor','madd9'],['minor','m9'],['minor','m6'],
                ['7','9'],['7','11'],['m7','m9'],['m7','m11'],
            ];
            for (const [a,b] of similar) {
                if ((chordA.type===a&&chordB.type===b)||(chordA.type===b&&chordB.type===a)) return 0.85;
            }
            return 0.72;
        }
        return 0;
    }

    /* ════════════════════════════════════════════════════════
       ④-3 BPM 오프셋 보정 (마디 경계 정렬 개선)
       chords 배열과 BPM으로 실제 마디 경계 오프셋을 추정
    ════════════════════════════════════════════════════════ */
    /* ════════════════════════════════════════════════════════
       비트 오프셋 추정 v2 — 히스토그램 클러스터링 기반
       ────────────────────────────────────────────────────────
       개선:
         1. 코드 변환점 외에 RMS 온셋(강한 에너지 시작점)도 활용
         2. 오프셋을 0~beatDur 범위로 정규화 후 히스토그램 최빈값 선택
            → 단순 중앙값 대비 이상치에 훨씬 강인
         3. 상위 신뢰도 코드만 사용 (노이즈 필터링)
    ════════════════════════════════════════════════════════ */
    _estimateBeatOffset(chords, bpm) {
        if (!chords || chords.length < 4 || !bpm) return 0;
        const beatDur = 60.0 / bpm;

        // 코드 변환점 수집 (신뢰도 0.3 이상만)
        const transitions = [];
        for (let i = 1; i < chords.length; i++) {
            const prev = chords[i-1];
            const curr = chords[i];
            if (curr.chord?.name !== prev.chord?.name &&
                (curr.confidence || 0) > 0.3 &&
                curr.time > 0.5) {  // 곡 시작 직후 노이즈 제외
                transitions.push(curr.time);
            }
        }

        if (transitions.length < 2) return 0;

        // 오프셋 계산 후 0~beatDur 범위로 정규화
        const rawOffsets = transitions.map(t => {
            const nearBeat = Math.round(t / beatDur) * beatDur;
            let off = t - nearBeat;
            // -beatDur/2 ~ +beatDur/2 범위로 정규화
            while (off >  beatDur / 2) off -= beatDur;
            while (off < -beatDur / 2) off += beatDur;
            return off;
        });

        // 히스토그램으로 가장 밀집된 오프셋 클러스터 찾기
        // 빈 크기: beatDur/20 (약 50개 빈)
        const binSize = beatDur / 20;
        const binCount = 40;
        const bins = new Float32Array(binCount);

        for (const off of rawOffsets) {
            // -beatDur/2 ~ +beatDur/2 범위를 0~binCount 으로 매핑
            const binIdx = Math.round((off / beatDur + 0.5) * binCount);
            if (binIdx >= 0 && binIdx < binCount) bins[binIdx]++;
        }

        // 가우시안 스무딩 (±2빈)
        const smoothed = new Float32Array(binCount);
        for (let i = 0; i < binCount; i++) {
            let sum = 0, wSum = 0;
            for (let d = -2; d <= 2; d++) {
                const j = i + d;
                if (j < 0 || j >= binCount) continue;
                const w = Math.exp(-(d * d) / 2);
                sum  += bins[j] * w;
                wSum += w;
            }
            smoothed[i] = sum / (wSum || 1);
        }

        // 최빈 빈 → 오프셋 역산
        let maxBin = 0;
        for (let i = 1; i < binCount; i++) {
            if (smoothed[i] > smoothed[maxBin]) maxBin = i;
        }

        const bestOffset = (maxBin / binCount - 0.5) * beatDur;

        // 오프셋이 너무 크면 보정 생략 (비트가 잘못 추정됐을 가능성)
        if (Math.abs(bestOffset) > beatDur * 0.4) return 0;

        return bestOffset;
    }

    /* ════════════════════════════════════════════════════════
       ⑤ 코드 전조
    ════════════════════════════════════════════════════════ */
    transposeChords(chords, semitones) {
        if (!semitones || !chords) return chords;
        return chords.map(c => {
            if (!c.chord) return c;
            return {...c, chord: this._transposeChord(c.chord, semitones)};
        });
    }

    _transposeChord(chord, semitones) {
        if (!chord || !chord.root) return chord;
        const rootIdx    = this.NOTE_NAMES.indexOf(chord.root);
        if (rootIdx < 0) return chord;
        const newRootIdx = ((rootIdx + semitones) % 12 + 12) % 12;
        const newRoot    = this.NOTE_NAMES[newRootIdx];

        // slash chord: 베이스음도 함께 전조
        if (chord.isSlash && chord.bassNote) {
            const bassIdx    = this.NOTE_NAMES.indexOf(chord.bassNote);
            const newBassIdx = ((bassIdx + semitones) % 12 + 12) % 12;
            const newBass    = this.NOTE_NAMES[newBassIdx];
            const baseType   = chord.type && !chord.type.startsWith('slash') ? chord.type : 'major';
            const baseName   = this._buildChordName(newRoot, baseType);
            return {
                ...chord,
                root    : newRoot,
                bassNote: newBass,
                name    : `${baseName}/${newBass}`,
                isSlash : true,
            };
        }

        const newName    = this._buildChordName(newRoot, chord.type);
        return {...chord, root: newRoot, name: newName};
    }

    transposeKey(keyString, semitones) {
        if (!keyString || !semitones) return keyString;
        const m = keyString.match(/^([A-G][#b]?)\s*(Major|Minor)$/i);
        if (!m) return keyString;
        const base    = this.NOTE_NAMES.indexOf(m[1]);
        if (base < 0) return keyString;
        const newBase = ((base + semitones) % 12 + 12) % 12;
        return `${this.NOTE_NAMES[newBase]} ${m[2]}`;
    }

    /* ════════════════════════════════════════════════════════
       ⑥ 악기 음역 (pitchDetector 호환용)
    ════════════════════════════════════════════════════════ */
    getInstrumentRange(instrument) {
        const ranges = {
            acoustic : { minMidi:40, maxMidi:88,  minFreq:82,  maxFreq:1175 },
            electric1: { minMidi:40, maxMidi:100, minFreq:82,  maxFreq:1397 },
            electric2: { minMidi:40, maxMidi:100, minFreq:82,  maxFreq:1175 },
            bass     : { minMidi:28, maxMidi:55,  minFreq:41,  maxFreq:392  },
        };
        return ranges[instrument] || ranges.acoustic;
    }

    /* ════════════════════════════════════════════════════════
       ⑦ 코드 다이어그램 생성
       strings 배열: [E(6번현), A(5번현), D(4번현), G(3번현), B(2번현), e(1번현)]
       null=뮤트, 0=개방, 양수=프렛
    ════════════════════════════════════════════════════════ */
    generateChordDiagram(chordName, instrument) {
        if (!chordName) return null;

        const CHORDS = this._getFullChordDictionary();
        const ALIASES = this._getEnharmonicAliases();

        // 1) 정확 매칭
        if (CHORDS[chordName]) return CHORDS[chordName];
        // 2) 동의어 매칭
        if (ALIASES[chordName] && CHORDS[ALIASES[chordName]]) return CHORDS[ALIASES[chordName]];

        // 2.5) Slash chord: "G/B" → 코드 맵에서 "G/B" 직접 매칭 → 없으면 "G"로 폴백
        if (chordName.includes('/')) {
            const acousticMap = this._getAcousticChordMap();
            // 어쿠스틱 맵에 직접 등록된 slash chord 사용
            if (acousticMap[chordName]) {
                const frets = acousticMap[chordName];
                return { frets, barres: [], startFret: 1 };
            }
            // 없으면 루트 코드로 폴백
            const rootPart = chordName.split('/')[0];
            if (CHORDS[rootPart]) return CHORDS[rootPart];
            if (ALIASES[rootPart] && CHORDS[ALIASES[rootPart]]) return CHORDS[ALIASES[rootPart]];
        }

        // 3) 파워코드 → 메이저로 시도
        if (!chordName.endsWith('5') && CHORDS[chordName+'5']) return CHORDS[chordName+'5'];

        // 4) suffix 순서대로 제거 후 시도
        const suffixOrder = ['maj9','maj7','m7b5','m7','m9','dim7','sus2','sus4','dim','aug','add9','7','m','5'];
        for (const suf of suffixOrder) {
            if (chordName.endsWith(suf)) {
                const root = chordName.slice(0, chordName.length - suf.length);
                const similar = [root+'m', root+'7', root+'m7', root+'maj7', root];
                for (const s of similar) {
                    if (CHORDS[s]) return CHORDS[s];
                    if (ALIASES[s] && CHORDS[ALIASES[s]]) return CHORDS[ALIASES[s]];
                }
                break;
            }
        }

        // 5) 루트만 추출해서 시도
        const rootMatch = chordName.match(/^([A-G][#b]?)/);
        if (rootMatch) {
            const root = rootMatch[1];
            if (CHORDS[root]) return CHORDS[root];
        }

        return null;
    }

    _getEnharmonicAliases() {
        const pairs = [
            ['C#','Db'],['D#','Eb'],['F#','Gb'],['G#','Ab'],['A#','Bb']
        ];
        const map = {};
        const suffixes = [
            '','m','7','m7','maj7','m7b5','dim7','dim','aug','sus2','sus4','5','add9',
            /* v4.1 추가 */
            'madd9','m9','maj9','11','m11','maj11','13','6','m6','mMaj7',
        ];
        pairs.forEach(([a, b]) => {
            suffixes.forEach(s => {
                map[a+s] = b+s;
                map[b+s] = a+s;
            });
        });
        return map;
    }

    /* ─── 전체 코드 딕셔너리 (크게 확장 - 세븐스 포함) ─── */
    _getFullChordDictionary() {
        //           E      A      D      G      B      e
        return {
            /* ═══ 메이저 ═══ */
            // fingers: E A D G B e (null=뮤트/개방, 1=검지, 2=중지, 3=약지, 4=소지, T=엄지)
            'C':    { strings:[null,3,2,0,1,0],       barre:null, fingers:[null,3,2,null,1,null] },
            'D':    { strings:[null,null,0,2,3,2],     barre:null, fingers:[null,null,null,1,3,2] },
            'E':    { strings:[0,2,2,1,0,0],           barre:null, fingers:[null,2,3,1,null,null] },
            'F':    { strings:[1,3,3,2,1,1],           barre:{fret:1,from:0}, fingers:[1,3,4,2,1,1] },
            'G':    { strings:[3,2,0,0,0,3],           barre:null, fingers:[2,1,null,null,null,3] },
            'A':    { strings:[null,0,2,2,2,0],        barre:null, fingers:[null,null,1,2,3,null] },
            'B':    { strings:[null,2,4,4,4,2],        barre:{fret:2,from:1}, fingers:[null,1,3,4,4,2] },
            'C#':   { strings:[null,4,6,6,6,4],        barre:{fret:4,from:1}, fingers:[null,1,3,4,4,2] },
            'Db':   { strings:[null,4,6,6,6,4],        barre:{fret:4,from:1}, fingers:[null,1,3,4,4,2] },
            'D#':   { strings:[null,6,8,8,8,6],        barre:{fret:6,from:1}, fingers:[null,1,3,4,4,2] },
            'Eb':   { strings:[null,6,8,8,8,6],        barre:{fret:6,from:1}, fingers:[null,1,3,4,4,2] },
            'F#':   { strings:[2,4,4,3,2,2],           barre:{fret:2,from:0}, fingers:[1,3,4,2,1,1] },
            'Gb':   { strings:[2,4,4,3,2,2],           barre:{fret:2,from:0}, fingers:[1,3,4,2,1,1] },
            'G#':   { strings:[4,6,6,5,4,4],           barre:{fret:4,from:0}, fingers:[1,3,4,2,1,1] },
            'Ab':   { strings:[4,6,6,5,4,4],           barre:{fret:4,from:0}, fingers:[1,3,4,2,1,1] },
            'A#':   { strings:[null,1,3,3,3,1],        barre:{fret:1,from:1}, fingers:[null,1,3,4,4,2] },
            'Bb':   { strings:[null,1,3,3,3,1],        barre:{fret:1,from:1}, fingers:[null,1,3,4,4,2] },

            /* ═══ 마이너 ═══ */
            'Am':   { strings:[null,0,2,2,1,0],        barre:null, fingers:[null,null,2,3,1,null] },
            'Bm':   { strings:[null,2,4,4,3,2],        barre:{fret:2,from:1}, fingers:[null,1,3,4,2,1] },
            'Cm':   { strings:[null,3,5,5,4,3],        barre:{fret:3,from:1}, fingers:[null,1,3,4,2,1] },
            'Dm':   { strings:[null,null,0,2,3,1],     barre:null, fingers:[null,null,null,2,3,1] },
            'Em':   { strings:[0,2,2,0,0,0],           barre:null, fingers:[null,2,3,null,null,null] },
            'Fm':   { strings:[1,3,3,1,1,1],           barre:{fret:1,from:0}, fingers:[1,3,4,1,1,1] },
            'Gm':   { strings:[3,5,5,3,3,3],           barre:{fret:3,from:0}, fingers:[1,3,4,1,1,1] },
            'C#m':  { strings:[null,4,6,6,5,4],        barre:{fret:4,from:1}, fingers:[null,1,3,4,2,1] },
            'Dbm':  { strings:[null,4,6,6,5,4],        barre:{fret:4,from:1}, fingers:[null,1,3,4,2,1] },
            'D#m':  { strings:[null,6,8,8,7,6],        barre:{fret:6,from:1}, fingers:[null,1,3,4,2,1] },
            'Ebm':  { strings:[null,6,8,8,7,6],        barre:{fret:6,from:1}, fingers:[null,1,3,4,2,1] },
            'F#m':  { strings:[2,4,4,2,2,2],           barre:{fret:2,from:0}, fingers:[1,3,4,1,1,1] },
            'Gbm':  { strings:[2,4,4,2,2,2],           barre:{fret:2,from:0}, fingers:[1,3,4,1,1,1] },
            'G#m':  { strings:[4,6,6,4,4,4],           barre:{fret:4,from:0}, fingers:[1,3,4,1,1,1] },
            'Abm':  { strings:[4,6,6,4,4,4],           barre:{fret:4,from:0}, fingers:[1,3,4,1,1,1] },
            'A#m':  { strings:[null,1,3,3,2,1],        barre:{fret:1,from:1}, fingers:[null,1,3,4,2,1] },
            'Bbm':  { strings:[null,1,3,3,2,1],        barre:{fret:1,from:1}, fingers:[null,1,3,4,2,1] },

            /* ═══ 도미넌트 7th ═══ */
            'C7':   { strings:[null,3,2,3,1,0],        barre:null, fingers:[null,3,2,4,1,null] },
            'D7':   { strings:[null,null,0,2,1,2],     barre:null, fingers:[null,null,null,2,1,3] },
            'E7':   { strings:[0,2,0,1,0,0],           barre:null, fingers:[null,2,null,1,null,null] },
            'F7':   { strings:[1,3,1,2,1,1],           barre:{fret:1,from:0}, fingers:[1,3,1,2,1,1] },
            'G7':   { strings:[3,2,0,0,0,1],           barre:null, fingers:[3,2,null,null,null,1] },
            'A7':   { strings:[null,0,2,0,2,0],        barre:null, fingers:[null,null,2,null,3,null] },
            'B7':   { strings:[null,2,1,2,0,2],        barre:null, fingers:[null,2,1,3,null,4] },
            'C#7':  { strings:[null,4,3,4,2,2],        barre:{fret:2,from:1}, fingers:[null,4,3,4,2,1] },
            'Db7':  { strings:[null,4,3,4,2,2],        barre:{fret:2,from:1}, fingers:[null,4,3,4,2,1] },
            'D#7':  { strings:[null,6,5,6,7,6],        barre:{fret:5,from:1}, fingers:[null,2,1,3,4,1] },
            'Eb7':  { strings:[null,6,5,6,7,6],        barre:{fret:5,from:1}, fingers:[null,2,1,3,4,1] },
            'F#7':  { strings:[2,4,2,3,2,2],           barre:{fret:2,from:0}, fingers:[1,3,1,2,1,1] },
            'Gb7':  { strings:[2,4,2,3,2,2],           barre:{fret:2,from:0}, fingers:[1,3,1,2,1,1] },
            'G#7':  { strings:[4,6,4,5,4,4],           barre:{fret:4,from:0}, fingers:[1,3,1,2,1,1] },
            'Ab7':  { strings:[4,6,4,5,4,4],           barre:{fret:4,from:0}, fingers:[1,3,1,2,1,1] },
            'A#7':  { strings:[null,1,3,1,3,1],        barre:{fret:1,from:1}, fingers:[null,1,3,1,4,1] },
            'Bb7':  { strings:[null,1,3,1,3,1],        barre:{fret:1,from:1}, fingers:[null,1,3,1,4,1] },

            /* ═══ 마이너 7th (m7) ═══ */
            'Am7':  { strings:[null,0,2,0,1,0],        barre:null, fingers:[null,null,2,null,1,null] },
            'Bm7':  { strings:[null,2,4,2,3,2],        barre:{fret:2,from:1}, fingers:[null,1,3,1,2,1] },
            'Cm7':  { strings:[null,3,5,3,4,3],        barre:{fret:3,from:1}, fingers:[null,1,3,1,2,1] },
            'Dm7':  { strings:[null,null,0,2,1,1],     barre:null, fingers:[null,null,null,3,1,1] },
            'Em7':  { strings:[0,2,2,0,3,0],           barre:null, fingers:[null,2,3,null,4,null] },
            'Fm7':  { strings:[1,3,3,1,4,1],           barre:{fret:1,from:0}, fingers:[1,3,4,1,4,1] },
            'Gm7':  { strings:[3,5,3,3,3,3],           barre:{fret:3,from:0}, fingers:[1,3,1,1,1,1] },
            'C#m7': { strings:[null,4,6,4,5,4],        barre:{fret:4,from:1}, fingers:[null,1,3,1,2,1] },
            'Dbm7': { strings:[null,4,6,4,5,4],        barre:{fret:4,from:1}, fingers:[null,1,3,1,2,1] },
            'D#m7': { strings:[null,6,8,6,7,6],        barre:{fret:6,from:1}, fingers:[null,1,3,1,2,1] },
            'Ebm7': { strings:[null,6,8,6,7,6],        barre:{fret:6,from:1}, fingers:[null,1,3,1,2,1] },
            'F#m7': { strings:[2,4,4,2,5,2],           barre:{fret:2,from:0}, fingers:[1,2,3,1,4,1] },
            'Gbm7': { strings:[2,4,4,2,5,2],           barre:{fret:2,from:0}, fingers:[1,2,3,1,4,1] },
            'G#m7': { strings:[4,6,6,4,7,4],           barre:{fret:4,from:0}, fingers:[1,2,3,1,4,1] },
            'Abm7': { strings:[4,6,6,4,7,4],           barre:{fret:4,from:0}, fingers:[1,2,3,1,4,1] },
            'A#m7': { strings:[null,1,3,1,2,1],        barre:{fret:1,from:1}, fingers:[null,1,3,1,2,1] },
            'Bbm7': { strings:[null,1,3,1,2,1],        barre:{fret:1,from:1}, fingers:[null,1,3,1,2,1] },

            /* ═══ 메이저 7th (maj7) ═══ */
            'Cmaj7':  { strings:[null,3,2,0,0,0],      barre:null, fingers:[null,3,2,null,null,null] },
            'Dmaj7':  { strings:[null,null,0,2,2,2],   barre:null, fingers:[null,null,null,1,1,1] },
            'Emaj7':  { strings:[0,2,1,1,0,0],         barre:null, fingers:[null,3,1,2,null,null] },
            'Fmaj7':  { strings:[1,3,3,2,1,0],         barre:null, fingers:[1,3,4,2,1,null] },
            'Gmaj7':  { strings:[3,2,0,0,0,2],         barre:null, fingers:[3,1,null,null,null,2] },
            'Amaj7':  { strings:[null,0,2,1,2,0],      barre:null, fingers:[null,null,3,1,4,null] },
            'Bmaj7':  { strings:[null,2,4,3,4,2],      barre:{fret:2,from:1}, fingers:[null,1,3,2,4,1] },
            'C#maj7': { strings:[null,4,6,5,6,4],      barre:{fret:4,from:1}, fingers:[null,1,3,2,4,1] },
            'Dbmaj7': { strings:[null,4,6,5,6,4],      barre:{fret:4,from:1}, fingers:[null,1,3,2,4,1] },
            'D#maj7': { strings:[null,6,8,7,8,6],      barre:{fret:6,from:1}, fingers:[null,1,3,2,4,1] },
            'Ebmaj7': { strings:[null,6,8,7,8,6],      barre:{fret:6,from:1}, fingers:[null,1,3,2,4,1] },
            'F#maj7': { strings:[2,4,4,3,2,1],         barre:{fret:2,from:0}, fingers:[1,3,4,2,1,1] },
            'Gbmaj7': { strings:[2,4,4,3,2,1],         barre:{fret:2,from:0}, fingers:[1,3,4,2,1,1] },
            'G#maj7': { strings:[4,6,6,5,4,3],         barre:{fret:4,from:0}, fingers:[1,3,4,2,1,1] },
            'Abmaj7': { strings:[4,6,6,5,4,3],         barre:{fret:4,from:0}, fingers:[1,3,4,2,1,1] },
            'A#maj7': { strings:[null,1,3,2,3,1],      barre:{fret:1,from:1}, fingers:[null,1,3,2,4,1] },
            'Bbmaj7': { strings:[null,1,3,2,3,1],      barre:{fret:1,from:1}, fingers:[null,1,3,2,4,1] },

            /* ═══ 하프-디미니시드 m7b5 ═══ */
            'Am7b5':  { strings:[null,0,1,2,1,null],   barre:null },
            'Bm7b5':  { strings:[null,2,3,4,3,2],      barre:{fret:2,from:1} },
            'Cm7b5':  { strings:[null,3,4,5,4,3],      barre:{fret:3,from:1} },
            'Dm7b5':  { strings:[null,null,0,1,1,1],   barre:null },
            'Em7b5':  { strings:[0,1,2,0,0,null],      barre:null },
            'Fm7b5':  { strings:[1,2,3,1,null,null],   barre:null },
            'Gm7b5':  { strings:[3,4,5,3,null,null],   barre:{fret:3,from:0} },
            'F#m7b5': { strings:[2,3,4,2,null,null],   barre:{fret:2,from:0} },
            'Gbm7b5': { strings:[2,3,4,2,null,null],   barre:{fret:2,from:0} },

            /* ═══ 디미니시드 7th (dim7) ═══ */
            'Adim7':  { strings:[null,0,1,2,1,2],      barre:null },
            'Bdim7':  { strings:[null,2,3,4,3,2],      barre:{fret:2,from:1} },
            'Cdim7':  { strings:[null,3,4,5,4,3],      barre:{fret:3,from:1} },
            'Ddim7':  { strings:[null,null,0,1,0,1],   barre:null },
            'Edim7':  { strings:[0,1,2,3,2,null],      barre:null },
            'Fdim7':  { strings:[1,2,3,4,3,null],      barre:null },
            'Gdim7':  { strings:[3,4,5,3,null,null],   barre:{fret:3,from:0} },
            'F#dim7': { strings:[2,3,4,2,1,null],      barre:null },
            'Gbdim7': { strings:[2,3,4,2,1,null],      barre:null },

            /* ═══ 디미니시드 ═══ */
            'Adim':   { strings:[null,0,1,2,1,null],   barre:null },
            'Bdim':   { strings:[null,2,3,4,3,null],   barre:null },
            'Cdim':   { strings:[null,3,4,5,4,null],   barre:null },
            'Ddim':   { strings:[null,null,0,1,3,1],   barre:null },
            'Edim':   { strings:[0,1,2,3,null,null],   barre:null },
            'Fdim':   { strings:[1,2,3,4,null,null],   barre:null },
            'Gdim':   { strings:[3,4,5,6,null,null],   barre:null },
            'F#dim':  { strings:[2,3,4,5,null,null],   barre:null },
            'Gbdim':  { strings:[2,3,4,5,null,null],   barre:null },

            /* ═══ 어그멘티드 (aug) ═══ */
            'Caug':   { strings:[null,3,2,1,1,0],      barre:null },
            'Daug':   { strings:[null,null,0,3,3,2],   barre:null },
            'Eaug':   { strings:[0,3,2,1,1,0],         barre:null },
            'Faug':   { strings:[1,4,3,2,2,1],         barre:null },
            'Gaug':   { strings:[3,null,4,3,3,null],   barre:null },
            'Aaug':   { strings:[null,0,3,2,2,1],      barre:null },
            'Baug':   { strings:[null,2,1,0,0,null],   barre:null },

            /* ═══ sus ═══ */
            'Asus2':  { strings:[null,0,2,2,0,0],      barre:null },
            'Asus4':  { strings:[null,0,2,2,3,0],      barre:null },
            'Dsus2':  { strings:[null,null,0,2,3,0],   barre:null },
            'Dsus4':  { strings:[null,null,0,2,3,3],   barre:null },
            'Esus4':  { strings:[0,2,2,2,0,0],         barre:null },
            'Gsus2':  { strings:[3,2,0,0,3,3],         barre:null },
            'Gsus4':  { strings:[3,2,0,0,1,3],         barre:null },
            'Csus2':  { strings:[null,3,0,0,1,0],      barre:null },
            'Csus4':  { strings:[null,3,3,0,1,0],      barre:null },
            'Fsus2':  { strings:[1,3,3,0,1,1],         barre:{fret:1,from:0} },
            'Fsus4':  { strings:[1,3,3,1,1,1],         barre:{fret:1,from:0} },

            /* ═══ add9 ═══ */
            'Cadd9':  { strings:[null,3,2,0,3,0],      barre:null },
            'Dadd9':  { strings:[null,null,0,2,3,0],   barre:null },
            'Eadd9':  { strings:[0,2,2,1,0,2],         barre:null },
            'Gadd9':  { strings:[3,2,0,2,0,3],         barre:null },
            'Aadd9':  { strings:[null,0,2,4,2,0],      barre:null },

            /* ═══ 9th ═══ */
            'C9':     { strings:[null,3,2,3,3,0],      barre:null },
            'D9':     { strings:[null,null,0,2,1,0],   barre:null },
            'E9':     { strings:[0,2,0,1,3,2],         barre:null },
            'G9':     { strings:[3,2,0,2,0,1],         barre:null },
            'A9':     { strings:[null,0,2,4,2,3],      barre:null },
            'Am9':    { strings:[null,0,2,0,1,3],      barre:null },

            /* ═══ 파워코드 5 ═══ */
            'E5':     { strings:[0,2,2,null,null,null],   barre:null },
            'F5':     { strings:[1,3,3,null,null,null],   barre:null },
            'F#5':    { strings:[2,4,4,null,null,null],   barre:null },
            'Gb5':    { strings:[2,4,4,null,null,null],   barre:null },
            'G5':     { strings:[3,5,5,null,null,null],   barre:null },
            'G#5':    { strings:[4,6,6,null,null,null],   barre:null },
            'Ab5':    { strings:[4,6,6,null,null,null],   barre:null },
            'A5':     { strings:[null,0,2,2,null,null],   barre:null },
            'A#5':    { strings:[null,1,3,3,null,null],   barre:null },
            'Bb5':    { strings:[null,1,3,3,null,null],   barre:null },
            'B5':     { strings:[null,2,4,4,null,null],   barre:null },
            'C5':     { strings:[null,3,5,5,null,null],   barre:null },
            'C#5':    { strings:[null,4,6,6,null,null],   barre:null },
            'Db5':    { strings:[null,4,6,6,null,null],   barre:null },
            'D5':     { strings:[null,null,0,2,3,null],   barre:null },
            'D#5':    { strings:[null,null,1,3,4,null],   barre:null },
            'Eb5':    { strings:[null,null,1,3,4,null],   barre:null },
        };
    }

    /* ════════════════════════════════════════════════════════
       ⑧ 어쿠스틱 오픈 코드 맵 (기본 기타 코드폼)
       strings 순서: [e(0), B(1), G(2), D(3), A(4), E(5)]
    ════════════════════════════════════════════════════════ */
    _getAcousticChordMap() {
        return {
            /* ─ 메이저 ─ */
            'C':      [0,1,0,2,3,null],
            'D':      [2,3,2,0,null,null],
            'E':      [0,0,1,2,2,0],
            'F':      [1,1,2,3,3,1],
            'G':      [3,0,0,0,2,3],
            'A':      [0,2,2,2,0,null],
            'B':      [2,4,4,4,2,null],
            'Bb':     [1,3,3,3,1,null],
            'A#':     [1,3,3,3,1,null],

            /* ─ 마이너 ─ */
            'Am':     [0,1,2,2,0,null],
            'Bm':     [2,3,4,4,2,null],
            'Cm':     [3,4,5,5,3,null],
            'Dm':     [1,3,2,0,null,null],
            'Em':     [0,0,0,2,2,0],
            'Fm':     [1,1,1,3,3,1],
            'Gm':     [3,3,3,5,5,3],
            'F#m':    [2,2,2,4,4,2],
            'Gbm':    [2,2,2,4,4,2],
            'G#m':    [4,4,4,6,6,4],
            'Abm':    [4,4,4,6,6,4],
            'C#m':    [4,5,6,6,4,null],
            'Dbm':    [4,5,6,6,4,null],
            'D#m':    [6,7,8,8,6,null],
            'Ebm':    [6,7,8,8,6,null],

            /* ─ 도미넌트 7th ─ */
            'A7':     [0,2,0,2,0,null],
            'B7':     [2,0,2,1,2,null],
            'C7':     [0,1,3,2,3,null],
            'D7':     [2,1,2,0,null,null],
            'E7':     [0,0,1,0,2,0],
            'F7':     [1,1,2,1,3,1],
            'G7':     [1,0,0,0,2,3],

            /* ─ 마이너 7th (m7) ─ */
            'Am7':    [0,1,0,2,0,null],
            'Bm7':    [2,3,2,4,2,null],
            'Cm7':    [3,4,3,5,3,null],
            'Dm7':    [1,1,2,0,null,null],
            'Em7':    [0,3,0,2,2,0],
            'Fm7':    [1,1,1,1,3,1],
            'Gm7':    [3,3,3,3,5,3],
            'F#m7':   [2,2,2,2,4,2],
            'Gbm7':   [2,2,2,2,4,2],
            'G#m7':   [4,4,4,4,6,4],
            'Abm7':   [4,4,4,4,6,4],
            'C#m7':   [4,5,4,6,4,null],
            'Dbm7':   [4,5,4,6,4,null],

            /* ─ 메이저 7th (maj7) ─ */
            'Cmaj7':  [0,0,0,2,3,null],
            'Dmaj7':  [2,2,2,0,null,null],
            'Emaj7':  [0,0,1,1,0,0],
            'Fmaj7':  [0,1,2,3,3,1],
            'Gmaj7':  [2,0,0,0,2,3],
            'Amaj7':  [0,2,1,2,0,null],
            'Bmaj7':  [2,4,3,4,2,null],

            /* ─ sus ─ */
            'Asus2':  [0,0,2,2,0,null],
            'Asus4':  [3,0,2,2,0,null],
            'Dsus2':  [0,3,2,0,null,null],
            'Dsus4':  [3,3,2,0,null,null],
            'Esus4':  [0,0,2,2,2,0],

            /* ─ dim ─ */
            'Adim':   [null,0,1,2,1,null],
            'Bdim':   [null,2,3,4,3,null],
            'Edim':   [0,1,2,3,null,null],

            /* ─ aug ─ */
            'Eaug':   [0,1,2,1,1,0],
            'Aaug':   [0,2,3,2,0,null],

            /* ─ Slash Chords (전위코드) — 기타에서 빈번하게 사용 ─
               형식: "루트/베이스" — 예) G/B, C/E, Am/E, D/F#
               strings 순서: [e(0), B(1), G(2), D(3), A(4), E(5)]
            ─ */
            // ── G/B: G 코드 1전위 (베이스 B) ──
            // G코드(3,0,0,0,2,3) 에서 E현 = x, A현 = 2(=B)
            'G/B':    [3,0,0,0,2,null],

            // ── C/E: C 코드 1전위 (베이스 E) ──
            // C코드(0,1,0,2,3,null) 에서 E현 개방
            'C/E':    [0,1,0,2,3,0],

            // ── D/F#: D 코드 1전위 (베이스 F#) ──
            // 베이스 F# = E현 2프렛
            'D/F#':   [2,3,2,0,null,2],

            // ── Am/E: Am 코드 2전위 (베이스 E) ──
            // Am코드(0,1,2,2,0,null) 에서 E현 개방
            'Am/E':   [0,1,2,2,0,0],

            // ── Am/G: Am 코드 + 베이스 G ──
            'Am/G':   [0,1,2,2,3,3],

            // ── Em/B: Em 코드 1전위 (베이스 B) ──
            'Em/B':   [0,0,0,2,2,2],

            // ── F/C: F 코드 2전위 (베이스 C) ──
            'F/C':    [1,1,2,3,3,null],

            // ── A/E: A 코드 2전위 (베이스 E) ──
            'A/E':    [0,2,2,2,0,0],

            // ── E/B: E 코드 1전위 (베이스 B) ──
            'E/B':    [0,0,1,2,2,2],

            // ── C/G: C 코드 2전위 (베이스 G) ──
            'C/G':    [3,1,0,2,3,null],

            // ── D/A: D 코드 2전위 (베이스 A) ──
            'D/A':    [2,3,2,0,0,null],

            // ── F#/C#: F# 코드 + 베이스 C# ──
            'F#/C#':  [2,2,3,4,4,null],
        };
    }

    /* ════════════════════════════════════════════════════════
       ⑨ 트라이어드 코드 맵 (일렉2: G·B·e 3현)
       {g: G현 프렛, b: B현 프렛, e: e현 프렛}
       - 메이저 트라이어드: 코드폼 (e형, d형, c형 포지션)
       - 마이너 트라이어드: 마이너 인터벌 적용
       - 세븐스 계열: G·B·e 3현에서 7th 보이싱
    ════════════════════════════════════════════════════════ */
    _getTriadChordMap() {
        return {
            /* ── 메이저 트라이어드 (e형 바레 포지션) ── */
            'C':    {g:5,  b:5,  e:5  },
            'C#':   {g:6,  b:6,  e:6  },
            'Db':   {g:6,  b:6,  e:6  },
            'D':    {g:7,  b:7,  e:7  },
            'D#':   {g:8,  b:8,  e:8  },
            'Eb':   {g:8,  b:8,  e:8  },
            'E':    {g:9,  b:9,  e:9  },
            'F':    {g:10, b:10, e:10 },
            'F#':   {g:11, b:11, e:11 },
            'Gb':   {g:11, b:11, e:11 },
            'G':    {g:0,  b:0,  e:3  },  // G 오픈 트라이어드 (G B e)
            'G#':   {g:1,  b:1,  e:1  },
            'Ab':   {g:1,  b:1,  e:1  },
            'A':    {g:2,  b:2,  e:2  },
            'A#':   {g:3,  b:3,  e:3  },
            'Bb':   {g:3,  b:3,  e:3  },
            'B':    {g:4,  b:4,  e:4  },

            /* ── 마이너 트라이어드 ── */
            'Am':   {g:2,  b:1,  e:0  },
            'A#m':  {g:3,  b:2,  e:1  },
            'Bbm':  {g:3,  b:2,  e:1  },
            'Bm':   {g:4,  b:3,  e:2  },
            'Cm':   {g:5,  b:4,  e:3  },
            'C#m':  {g:6,  b:5,  e:4  },
            'Dbm':  {g:6,  b:5,  e:4  },
            'Dm':   {g:7,  b:6,  e:5  },
            'D#m':  {g:8,  b:7,  e:6  },
            'Ebm':  {g:8,  b:7,  e:6  },
            'Em':   {g:9,  b:8,  e:7  },
            'Fm':   {g:10, b:9,  e:8  },
            'F#m':  {g:11, b:10, e:9  },
            'Gbm':  {g:11, b:10, e:9  },
            'Gm':   {g:0,  b:11, e:10 },
            'G#m':  {g:1,  b:0,  e:11 },
            'Abm':  {g:1,  b:0,  e:11 },

            /* ── 도미넌트 7th (G·B·e 보이싱) ── */
            'A7':   {g:0,  b:2,  e:0  },
            'A#7':  {g:1,  b:3,  e:1  },
            'Bb7':  {g:1,  b:3,  e:1  },
            'B7':   {g:2,  b:0,  e:2  },
            'C7':   {g:3,  b:1,  e:3  },
            'C#7':  {g:4,  b:2,  e:4  },
            'Db7':  {g:4,  b:2,  e:4  },
            'D7':   {g:2,  b:1,  e:2  },
            'D#7':  {g:3,  b:2,  e:3  },
            'Eb7':  {g:3,  b:2,  e:3  },
            'E7':   {g:1,  b:0,  e:0  },
            'F7':   {g:2,  b:1,  e:1  },
            'F#7':  {g:3,  b:2,  e:2  },
            'Gb7':  {g:3,  b:2,  e:2  },
            'G7':   {g:0,  b:0,  e:1  },
            'G#7':  {g:1,  b:1,  e:2  },
            'Ab7':  {g:1,  b:1,  e:2  },

            /* ── 마이너 7th (G·B·e 보이싱) ── */
            'Am7':  {g:0,  b:1,  e:0  },
            'A#m7': {g:1,  b:2,  e:1  },
            'Bbm7': {g:1,  b:2,  e:1  },
            'Bm7':  {g:2,  b:3,  e:2  },
            'Cm7':  {g:3,  b:4,  e:3  },
            'C#m7': {g:4,  b:5,  e:4  },
            'Dbm7': {g:4,  b:5,  e:4  },
            'Dm7':  {g:2,  b:1,  e:1  },
            'D#m7': {g:3,  b:2,  e:2  },
            'Ebm7': {g:3,  b:2,  e:2  },
            'Em7':  {g:0,  b:3,  e:0  },
            'Fm7':  {g:1,  b:4,  e:1  },
            'F#m7': {g:2,  b:5,  e:2  },
            'Gbm7': {g:2,  b:5,  e:2  },
            'Gm7':  {g:0,  b:3,  e:3  },
            'G#m7': {g:1,  b:4,  e:4  },
            'Abm7': {g:1,  b:4,  e:4  },

            /* ── 메이저 7th (G·B·e 보이싱) ── */
            'Cmaj7':  {g:4, b:5,  e:3  },
            'Dmaj7':  {g:2, b:2,  e:2  },
            'Emaj7':  {g:1, b:0,  e:0  },  // E형 Δ7
            'Fmaj7':  {g:2, b:1,  e:0  },
            'Gmaj7':  {g:0, b:0,  e:2  },
            'Amaj7':  {g:1, b:2,  e:0  },
            'Bmaj7':  {g:3, b:4,  e:2  },
        };
    }
}

window.TabConverter = TabConverter;
