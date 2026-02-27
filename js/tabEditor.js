/**
 * TabEditor v2.0 — 전문 TAB 악보 에디터
 *
 * ■ 기능
 *   - 코드명 영역 클릭 → 코드명 입력/수정/삭제 팝업
 *   - 프렛 셀 클릭 → 프렛 번호 + 기법 입력 팝업
 *   - 마디 추가 / 슬롯 분할(÷) / 슬롯 병합
 *   - 실행 취소(Ctrl+Z) / 다시 실행(Ctrl+Y) — 최대 50단계
 *   - 편집 모드 ON 시 SVG 위에 투명 히트 영역 오버레이
 */
class TabEditor {
    constructor(tabRenderer) {
        this.renderer  = tabRenderer;
        this.active    = false;
        this.tool      = 'fret';  // 'fret' | 'chord' | 'erase' | 기법 키

        this._history  = [];
        this._histIdx  = -1;
        this._popup    = null;

        this._boundKeydown = this._onKeydown.bind(this);
        this._boundClick   = this._onDocClick.bind(this);
        document.addEventListener('keydown', this._boundKeydown);
        document.addEventListener('click',   this._boundClick, true);
    }

    /* ═══════════════════════════════════════════
       공개 API
    ═══════════════════════════════════════════ */
    toggle() {
        this.active = !this.active;
        if (this.active) { this._saveSnap(); this._buildOverlay(); }
        else             { this._removeOverlay(); this._closePopup(); }
        return this.active;
    }
    setActive(v) {
        const was = this.active;
        this.active = !!v;
        if (this.active && !was) { this._saveSnap(); this._buildOverlay(); }
        else if (!this.active && was) { this._removeOverlay(); this._closePopup(); }
    }
    setTool(t) { this.tool = t; }

    undo() {
        if (this._histIdx <= 0) { _toast('더 이상 취소할 수 없습니다.', 'info'); return; }
        this._histIdx--;
        this._applySnap(this._history[this._histIdx]);
    }
    redo() {
        if (this._histIdx >= this._history.length - 1) { _toast('다시 실행할 수 없습니다.', 'info'); return; }
        this._histIdx++;
        this._applySnap(this._history[this._histIdx]);
    }

    addBar() {
        this._saveSnap();
        const bars    = this.renderer.bars;
        const last    = bars[bars.length - 1];
        const dur     = last?.duration || (4 * 60 / (this.renderer.bpm || 120));
        bars.push({
            barIndex : bars.length,
            startTime: (last?.startTime || 0) + (last?.duration || dur),
            duration : dur,
            chords   : [{ chord: { name: '' }, beatOffset: 0, beatLen: 4, slotIndex: 0 }],
            notes    : [{ type:'rest', strings: new Array(this.renderer.numStrings).fill(null), slotIndex:0, techniques:{} }],
        });
        this._rerender();
        _toast('마디가 추가되었습니다.', 'success');
    }

    /* ═══════════════════════════════════════════
       히스토리
    ═══════════════════════════════════════════ */
    _saveSnap() {
        const snap = JSON.parse(JSON.stringify(this.renderer.bars));
        this._history = this._history.slice(0, this._histIdx + 1);
        this._history.push(snap);
        if (this._history.length > 50) { this._history.shift(); }
        this._histIdx = this._history.length - 1;
    }
    _applySnap(snap) {
        this.renderer.bars = JSON.parse(JSON.stringify(snap));
        this._rerender();
    }

    /* ═══════════════════════════════════════════
       오버레이 구성
       SVG 위에 각 코드 슬롯 + 각 줄 프렛 셀을 투명 rect로 덮어
       클릭 이벤트를 받음
    ═══════════════════════════════════════════ */
    _buildOverlay() {
        const wrapper = document.getElementById('tabSvgWrapper');
        if (!wrapper) return;
        this._removeOverlay();

        const R     = this.renderer;
        const bars  = R.bars;
        if (!bars?.length) return;

        // renderer에 editMode 플래그 전달
        R._editMode = true;

        const svgs  = wrapper.querySelectorAll('svg');
        const bpr   = R._lastBarsPerRow || 4;

        svgs.forEach((svg, rowIdx) => {
            const rowOffset = rowIdx * bpr;
            const rowBars   = bars.slice(rowOffset, rowOffset + bpr);
            if (!rowBars.length) return;

            const svgRect = svg.getBoundingClientRect();
            const svgW    = parseFloat(svg.getAttribute('width')) || svgRect.width || 800;
            const scale   = R.zoom;
            const nStr    = R.numStrings;
            const CFG     = R.CFG;
            const strH    = Math.round(CFG.STRING_H * scale);
            const padTop  = Math.round(CFG.PAD_TOP  * scale);
            const staffH  = nStr * strH;
            const LW      = Math.round(42 * scale);
            // barW 계산을 renderer와 동일하게 (PAD_SAFE=12 사용)
            const PAD_SAFE   = 12;
            const containerW = wrapper.parentElement?.clientWidth || 900;
            const safeW      = Math.max(360, containerW - PAD_SAFE);
            const availW     = safeW - LW - 4;
            const barW       = Math.max(Math.round(72 * scale), Math.floor(availW / bpr));

            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.classList.add('te-ov');

            rowBars.forEach((bar, bi) => {
                const gbi    = rowOffset + bi;
                const bx     = LW + bi * barW;
                const slots  = R._resolveBarSlots(bar);
                const nSlots = slots.length;

                /* ★ 편집 모드 항상 4칸 고정 레이아웃
                   실제 슬롯 수에 무관하게 4칸으로 표시
                   각 칸은 beatOffset 0~3에 매핑 */
                const overlaySlots = (() => {
                    return [0,1,2,3].map(i => {
                        // i번 박자에 해당하는 실제 슬롯 찾기
                        const realSlot = slots.find(s =>
                            s.beatOffset <= i && (s.beatOffset + s.beatLen) > i
                        );
                        const realIdx = realSlot ? slots.indexOf(realSlot) : 0;
                        // 실제 슬롯의 beatOffset이 정확히 i와 같을 때만 '진짜 시작점'
                        const isSlotStart = realSlot ? (realSlot.beatOffset === i) : (i === 0);
                        return {
                            beatOffset  : i,
                            beatLen     : 1,
                            slotIndex   : i,
                            _virtual    : !isSlotStart,   // 슬롯 시작점이 아니면 가상
                            _realSlotIdx: realIdx,
                            _realSlot   : realSlot,
                        };
                    });
                })();

                overlaySlots.forEach((oslot, oi) => {
                    const slotX  = bx + Math.round(barW * (oslot.beatOffset / 4));
                    const slotW  = Math.round(barW * (oslot.beatLen / 4));
                    const slotCx = slotX + Math.round(slotW / 2);
                    // 실제 data-slot은 가상이면 0으로, 실제면 _realSlotIdx
                    const realSlot = oslot._virtual ? 0 : oslot._realSlotIdx;

                    /* ─── 코드명 히트 영역 — 항상 파란 하이라이트 (편집 모드) ─── */
                    const chordHitH = Math.round(padTop * 0.95);  // 코드명 전체 영역 커버
                    const chordHitY = Math.round(padTop * 0.02);
                    const hlFill    = oslot._virtual
                        ? 'rgba(99,102,241,0.06)'
                        : 'rgba(99,102,241,0.10)';
                    const chordR = _mkRect(slotX + 1, chordHitY, slotW - 2, chordHitH, {
                        'data-te':'chord',
                        'data-bar': gbi,
                        'data-slot': oslot._virtual ? `v${oi}` : realSlot,
                        'data-virtual': oslot._virtual ? '1' : '0',
                        fill: hlFill,
                        rx: 4, cursor: 'pointer',
                        stroke: '#6366f1', 'stroke-width': '0.8', 'stroke-dasharray': '4,3',
                        opacity: '0.9',
                    });
                    _addHover(chordR, hlFill, 'rgba(99,102,241,0.28)');
                    g.appendChild(chordR);

                    /* ─── ÷/− 버튼 완전 제거: 4칸 고정이므로 분할/삭제 불필요 ─── */

                    /* ─── 각 현 프렛 히트 셀 ─── */
                    for (let str = 0; str < nStr; str++) {
                        const cy = padTop + str * strH;
                        const r  = _mkRect(slotX + 1, cy, slotW - 2, strH, {
                            'data-te'  : 'fret',
                            'data-bar' : gbi,
                            'data-slot': oslot._virtual ? `v${oi}` : realSlot,
                            'data-str' : str,
                            'data-virtual': oslot._virtual ? '1' : '0',
                            fill: 'transparent', rx: 3, cursor: 'crosshair',
                        });
                        _addHover(r, 'rgba(99,102,241,0.04)', 'rgba(59,130,246,0.18)');
                        g.appendChild(r);
                    }
                });

                /* ─── 마지막 마디 뒤 [+ 마디 추가] 버튼 ─── */
                if (rowIdx === svgs.length - 1 && bi === rowBars.length - 1) {
                    // SVG 너비 기준으로 오른쪽 안쪽에 배치 (overflow:hidden 대응)
                    const svgW2  = parseFloat(svg.getAttribute('width')) || (LW + bpr * barW + 4);
                    const btnH   = Math.max(26, Math.round(staffH * 0.45));
                    const btnW   = 52;
                    const ax     = svgW2 - btnW - 4;  // SVG 우측 안쪽 4px
                    const btnY   = padTop + Math.round((staffH - btnH) / 2);
                    const addG   = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    addG.setAttribute('data-te', 'addbar');
                    addG.style.cursor = 'pointer';
                    addG.innerHTML = `
                      <rect x="${ax}" y="${btnY}" width="${btnW}" height="${btnH}"
                            rx="6" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.8" opacity="0.92"/>
                      <text x="${ax + btnW/2}" y="${btnY + Math.round(btnH * 0.68)}"
                            font-family="sans-serif" font-size="12" font-weight="800"
                            fill="#2563eb" text-anchor="middle">+ 마디</text>`;
                    g.appendChild(addG);
                }
            });

            svg.appendChild(g);
        });
    }

    _removeOverlay() {
        document.querySelectorAll('.te-ov').forEach(g => g.remove());
        if (this.renderer) this.renderer._editMode = false;
    }

    /* ═══════════════════════════════════════════
       이벤트 핸들러
    ═══════════════════════════════════════════ */
    _onDocClick(e) {
        if (!this.active) return;

        /* 팝업 외부 클릭 → 팝업 닫기 */
        if (this._popup && !this._popup.contains(e.target)) {
            this._closePopup();
            return;
        }

        const el = e.target.closest('[data-te]');
        if (!el) return;
        e.stopPropagation();
        e.preventDefault();

        const act      = el.getAttribute('data-te');
        const barRaw   = parseInt(el.getAttribute('data-bar') ?? '-1');
        const sltRaw   = el.getAttribute('data-slot') ?? '0';
        const str      = parseInt(el.getAttribute('data-str')  ?? '-1');
        const isVirt   = el.getAttribute('data-virtual') === '1';

        // 가상 슬롯(빈 칸) 클릭 → 해당 박자 위치에 슬롯 생성 후 팝업
        if (isVirt && (act === 'chord' || act === 'fret')) {
            const virtIdx = parseInt(sltRaw) || 0;  // 0~3 박자 위치
            this._createVirtualSlot(barRaw, virtIdx, e, act, str);
            return;
        }

        const bar = isNaN(barRaw) ? -1 : barRaw;
        const slt = isNaN(parseInt(sltRaw)) ? 0 : parseInt(sltRaw);

        if (act === 'chord') {
            if (this.tool === 'erase') {
                this._saveSnap();
                this._writeChord(bar, slt, '');
                this._clearSlotNotes(bar, slt);  // 코드 삭제 시 타브 숫자도 삭제
                this._rerender();
            } else {
                this._openChordPopup(bar, slt, e.target.getBoundingClientRect());
            }
            return;
        }
        if (act === 'fret')    { this._handleFretClick(bar, slt, str, e); return; }
        if (act === 'split')   { this._splitSlot(bar, slt); return; }
        if (act === 'delslot') { this._deleteSlot(bar, slt); return; }
        if (act === 'addbar')  { this.addBar(); return; }
    }

    _onKeydown(e) {
        if (!this.active) return;
        const isCtrl = e.ctrlKey || e.metaKey;
        if (isCtrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
        if (isCtrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); this.redo(); }
        if (e.key === 'Escape') this._closePopup();
    }

    /* ═══════════════════════════════════════════
       프렛 클릭 처리
    ═══════════════════════════════════════════ */
    _handleFretClick(barIdx, slotIdx, strIdx, e) {
        const tool = this.tool;
        if (tool === 'erase') {
            this._saveSnap();
            this._writeFret(barIdx, slotIdx, strIdx, null);
            this._writeTech(barIdx, slotIdx, strIdx, '');
            this._rerender();
            return;
        }
        if (tool === 'chord') {
            // chord 도구 선택 → 코드명 팝업
            this._openChordPopup(barIdx, slotIdx, e.target.getBoundingClientRect());
            return;
        }
        if (['h','p','b','/','\\','~','x'].includes(tool)) {
            this._saveSnap();
            this._writeTech(barIdx, slotIdx, strIdx, tool);
            this._rerender();
            return;
        }
        // fret 도구 (기본)
        const rect = e.target.getBoundingClientRect();
        this._openFretPopup(barIdx, slotIdx, strIdx, rect);
    }

    /* ═══════════════════════════════════════════
       코드명 팝업 — 입력/수정/삭제 + 탭 자동 삽입
    ═══════════════════════════════════════════ */
    _openChordPopup(barIdx, slotIdx, anchorEl) {
        this._closePopup();
        const bar   = this.renderer.bars[barIdx];
        if (!bar) return;
        const slots = this.renderer._resolveBarSlots(bar);
        const slot  = slots[slotIdx] || slots[0];
        const curName = slot?.chord?.name || '';

        const p = _makePopup();
        p.innerHTML = `
          <div class="tep-head">
            <span class="tep-title"><i class="fas fa-music"></i> 코드명 — 마디 ${barIdx+1}${slotIdx>0?' 슬롯'+(slotIdx+1):''}</span>
            <button class="tep-x">×</button>
          </div>
          <div class="tep-body">
            <div class="tep-row">
              <input class="tep-chord-input" id="tepCI" type="text" placeholder="예: Am, G, Cmaj7, F/C"
                     value="${curName}" autocomplete="off" spellcheck="false" maxlength="12">
              <button class="tep-btn tep-ok" id="tepOk"><i class="fas fa-check"></i> 적용</button>
            </div>
            <label class="tep-lbl" style="margin-top:6px;display:flex;align-items:center;gap:5px;cursor:pointer;">
              <input type="checkbox" id="tepAutoTab" checked style="width:14px;height:14px;">
              <span>코드 선택 시 탭 기보 자동 삽입</span>
            </label>
            <div class="tep-quick" id="tepQuick">
              ${_quickChords().map(c=>`<button class="tep-q-btn" data-chord="${c}">${c}</button>`).join('')}
            </div>
            ${curName ? `<button class="tep-btn tep-del" id="tepDel" style="margin-top:4px;"><i class="fas fa-trash"></i> 코드 삭제</button>` : ''}
          </div>
        `;
        _positionPopup(p, anchorEl instanceof DOMRect ? anchorEl : anchorEl?.target?.getBoundingClientRect?.());
        document.body.appendChild(p);
        this._popup = p;

        const input      = p.querySelector('#tepCI');
        const autoTabChk = p.querySelector('#tepAutoTab');
        input.focus(); input.select();

        const apply = () => {
            const v = input.value.trim();
            this._saveSnap();
            this._writeChord(barIdx, slotIdx, v || '');
            // 자동 탭 삽입 체크 시 tabConverter로 폼 가져오기
            if (v && autoTabChk?.checked) {
                this._autoInsertTab(barIdx, slotIdx, v);
            }
            this._rerender();
            this._closePopup();
        };
        input.addEventListener('keydown', ev => {
            if (ev.key === 'Enter')  { ev.preventDefault(); apply(); }
            if (ev.key === 'Escape') { ev.preventDefault(); this._closePopup(); }
        });
        p.querySelector('#tepOk').addEventListener('click', apply);
        p.querySelector('.tep-x').addEventListener('click', () => this._closePopup());
        p.querySelectorAll('.tep-q-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                input.value = btn.dataset.chord;
                input.focus();
                // 빠른 버튼 클릭 시 즉시 적용 (자동 탭 포함)
                if (autoTabChk?.checked) {
                    this._saveSnap();
                    this._writeChord(barIdx, slotIdx, btn.dataset.chord);
                    this._autoInsertTab(barIdx, slotIdx, btn.dataset.chord);
                    this._rerender();
                    this._closePopup();
                }
            });
        });
        p.querySelector('#tepDel')?.addEventListener('click', () => {
            this._saveSnap();
            this._writeChord(barIdx, slotIdx, '');
            // 코드 삭제 시 해당 슬롯의 프렛 숫자(타브)도 함께 삭제
            this._clearSlotNotes(barIdx, slotIdx);
            this._rerender();
            this._closePopup();
        });
    }



    /* ═══════════════════════════════════════════
       코드 입력기 — TAB 악보 스타일 + 코드 다이어그램
       줄 클릭 시 전체 슬롯을 한 패널에서 입력·미리보기
    ═══════════════════════════════════════════ */
    _openFretPopup(barIdx, slotIdx, focusStrIdx, rect) {
        this._closePopup();
        const R        = this.renderer;
        const bar      = R.bars[barIdx];
        if (!bar) return;
        const slots    = R._resolveBarSlots(bar);
        const slot     = slots[slotIdx] || slots[0];
        const note     = R._getSlotNote(bar, slot, slotIdx);
        const strNames = R.getStringNames();   // ['e','B','G','D','A','E']
        const nStr     = R.numStrings;
        const curChord = slot?.chord?.name || '';

        const initFrets = Array.from({length: nStr}, (_, i) => {
            const v = note?.strings?.[i];
            return (v === null || v === undefined) ? null : v;
        });
        const initTechs = Array.from({length: nStr}, (_, i) => note?.techniques?.[i] || '');

        /* ───────────────────────────────────────
           SVG 헬퍼: TAB 미리보기 + 코드 다이어그램
        ─────────────────────────────────────── */
        const buildTabPreviewSVG = (frets, chordName) => {
            const W = 220, strH = 22, padL = 40, padT = 28, padB = 12;
            const H = padT + nStr * strH + padB;
            const lineColor = '#5a4030', fretColor = '#111', openColor = '#0a7a0a', muteColor = '#cc2200';
            let out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="font-family:'JetBrains Mono',monospace;">`];
            // 배경
            out.push(`<rect width="${W}" height="${H}" fill="#fdf8f2" rx="6"/>`);
            // TAB 레이블
            ['T','A','B'].forEach((c, i) => {
                out.push(`<text x="8" y="${padT + (nStr/2 - 1 + i)*strH - strH*0.5 + 6}" font-size="11" font-weight="900" fill="#6b5040" text-anchor="middle">${c}</text>`);
            });
            // 줄 + 줄이름 + 프렛 숫자
            for (let si = 0; si < nStr; si++) {
                const y = padT + si * strH + Math.round(strH / 2);
                const lw = si === nStr-1 ? 1.6 : si === 0 ? 0.8 : 1.0;
                out.push(`<line x1="${padL-4}" y1="${y}" x2="${W-8}" y2="${y}" stroke="${lineColor}" stroke-width="${lw}"/>`);
                out.push(`<text x="${padL-8}" y="${y+4}" font-size="9" font-weight="700" fill="#888" text-anchor="middle">${strNames[si]}</text>`);
                const fv = frets[si];
                if (fv === null || fv === undefined) continue;
                if (fv === 'x') {
                    out.push(`<text x="${padL+16}" y="${y+5}" font-size="13" font-weight="900" fill="${muteColor}" text-anchor="middle">✕</text>`);
                } else {
                    const col = fv === 0 ? openColor : fretColor;
                    out.push(`<text x="${padL+16}" y="${y+5}" font-size="14" font-weight="900" fill="${col}" text-anchor="middle">${fv}</text>`);
                }
            }
            // 코드명
            if (chordName) {
                out.push(`<text x="${W/2+10}" y="${padT - 8}" font-size="14" font-weight="900" fill="#1040a0" text-anchor="middle">${chordName}</text>`);
            }
            out.push('</svg>');
            return out.join('');
        };

        const buildChordDiagramSVG = (frets, chordName) => {
            // 코드 다이어그램: 클래식 기타 코드표 스타일
            const nFrets = 5;   // 표시할 프렛 수
            const cW = 160, cH = 180;
            const strGap = Math.floor((cW - 40) / (nStr - 1));
            const fretGap = Math.floor((cH - 60) / nFrets);
            const oX = 20, oY = 42;
            const dotR = 10;

            // 유효 프렛값만 추출해 범위 계산
            const numericFrets = frets.map(f => (f !== null && f !== undefined && f !== 'x' && f !== 0) ? Number(f) : null).filter(f => f !== null);
            const minFret = numericFrets.length ? Math.min(...numericFrets) : 1;
            const maxFret = numericFrets.length ? Math.max(...numericFrets) : 5;
            const startFret = minFret <= 2 ? 1 : minFret - 1;

            let out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${cW}" height="${cH}" style="font-family:'JetBrains Mono',monospace;">`];
            out.push(`<rect width="${cW}" height="${cH}" fill="#fffdf7" rx="8"/>`);

            // 코드명
            const cn = chordName || '?';
            out.push(`<text x="${cW/2}" y="18" font-size="16" font-weight="900" fill="#1040a0" text-anchor="middle">${cn}</text>`);

            // 줄이름 (상단)
            for (let s = 0; s < nStr; s++) {
                const x = oX + s * strGap;
                out.push(`<text x="${x}" y="34" font-size="8" font-weight="700" fill="#888" text-anchor="middle">${strNames[s]}</text>`);
            }

            // 넛(nut) 또는 포지션 번호
            if (startFret === 1) {
                out.push(`<rect x="${oX-3}" y="${oY}" width="${strGap*(nStr-1)+6}" height="5" fill="#3d2a1a" rx="2"/>`);
            } else {
                out.push(`<text x="${oX-6}" y="${oY+fretGap*0.7}" font-size="9" fill="#888" text-anchor="end">${startFret}fr</text>`);
                out.push(`<line x1="${oX-3}" y1="${oY}" x2="${oX+strGap*(nStr-1)+3}" y2="${oY}" stroke="#bbb" stroke-width="1.5"/>`);
            }

            // 가로선 (프렛)
            for (let f = 0; f <= nFrets; f++) {
                const y = oY + f * fretGap;
                out.push(`<line x1="${oX}" y1="${y}" x2="${oX+strGap*(nStr-1)}" y2="${y}" stroke="#c0a882" stroke-width="${f===0?0:0.8}"/>`);
            }
            // 세로선 (줄)
            for (let s = 0; s < nStr; s++) {
                const x = oX + s * strGap;
                out.push(`<line x1="${x}" y1="${oY}" x2="${x}" y2="${oY+fretGap*nFrets}" stroke="#c0a882" stroke-width="${s===0||s===nStr-1?1.5:0.8}"/>`);
            }

            // 점(포지션) & 뮤트/개방
            for (let s = 0; s < nStr; s++) {
                const x  = oX + s * strGap;
                const fv = frets[s];
                if (fv === null || fv === undefined) continue;
                if (fv === 'x') {
                    // 뮤트: X 표시
                    out.push(`<text x="${x}" y="${oY-10}" font-size="11" font-weight="900" fill="#cc2200" text-anchor="middle">✕</text>`);
                } else if (fv === 0) {
                    // 개방현: O
                    out.push(`<circle cx="${x}" cy="${oY-10}" r="5" fill="none" stroke="#0a7a0a" stroke-width="1.8"/>`);
                } else {
                    const fi = Number(fv) - startFret;
                    if (fi >= 0 && fi < nFrets) {
                        const cy = oY + (fi + 0.5) * fretGap;
                        out.push(`<circle cx="${x}" cy="${cy}" r="${dotR}" fill="#1040a0"/>`);
                        out.push(`<text x="${x}" y="${cy+4}" font-size="9" font-weight="700" fill="#fff" text-anchor="middle">${fv}</text>`);
                    }
                }
            }
            out.push('</svg>');
            return out.join('');
        };

        /* ───────────────────────────────────────
           팝업 HTML
        ─────────────────────────────────────── */
        const p = _makePopup();
        p.classList.add('cei-popup');

        // 줄별 행 HTML
        const rowHtml = (si) => {
            const fv    = initFrets[si];
            const fvStr = fv === null ? '' : String(fv);
            const tc    = initTechs[si];
            const isFocused = si === focusStrIdx;
            return `
            <tr class="cei-tr${isFocused?' cei-tr-focus':''}" data-str="${si}">
              <td class="cei-td-str">
                <span class="cei-str-badge">${strNames[si]}</span>
              </td>
              <td class="cei-td-fret">
                <input class="cei-fret-input${isFocused?' focus':''}" id="ceiFret${si}"
                  type="text" value="${fvStr}" placeholder="—"
                  maxlength="3" autocomplete="off" inputmode="numeric" data-str="${si}">
              </td>
              <td class="cei-td-pad">
                <div class="cei-numpad">
                  ${[0,1,2,3,4,5,6,7,8,9,10,11,12].map(f =>
                    `<button class="cei-nb${String(fvStr)===String(f)?' on':''}" data-fret="${f}" data-str="${si}">${f}</button>`
                  ).join('')}
                  <button class="cei-nb cei-nb-x${fvStr==='x'?' on':''}" data-fret="x" data-str="${si}">✕</button>
                  <button class="cei-nb cei-nb-clr" data-fret="" data-str="${si}">—</button>
                </div>
              </td>
              <td class="cei-td-tech">
                <select class="cei-tech-sel" data-str="${si}" title="연주 기법">
                  <option value="" ${tc===''?'selected':''}>—</option>
                  <option value="h" ${tc==='h'?'selected':''}>h</option>
                  <option value="p" ${tc==='p'?'selected':''}>p</option>
                  <option value="b" ${tc==='b'?'selected':''}>b</option>
                  <option value="/" ${tc==='/'?'selected':''}>↑/</option>
                  <option value="\\" ${tc==='\\'?'selected':''}>↓\\</option>
                  <option value="~" ${tc==='~'?'selected':''}>~</option>
                  <option value="x" ${tc==='x'?'selected':''}>×</option>
                </select>
              </td>
            </tr>`;
        };

        p.innerHTML = `
          <div class="tep-head cei-head">
            <div class="cei-head-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-3px;margin-right:6px;color:#6366f1;"><rect x="2" y="3" width="20" height="18" rx="3"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="2" y1="15" x2="22" y2="15"/><line x1="8" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="16" y2="21"/></svg>
              코드 입력기
              <span class="cei-head-sub">마디 ${barIdx+1}${slotIdx>0?' · 슬롯'+(slotIdx+1):''}</span>
            </div>
            <button class="tep-x cei-close-btn">×</button>
          </div>
          <div class="cei-main">

            <!-- 왼쪽: 입력 패널 -->
            <div class="cei-input-panel">

              <!-- 코드명 입력 -->
              <div class="cei-chord-name-row">
                <div class="cei-chord-name-label">🎵 코드명</div>
                <input class="cei-chord-name-input" id="ceiChordIn"
                  type="text" value="${curChord}"
                  placeholder="자동 인식 또는 직접 입력 (Am, G…)"
                  maxlength="14" autocomplete="off" spellcheck="false">
              </div>

              <!-- TAB 헤더 -->
              <div class="cei-tab-header">
                <div class="cei-tab-label-cell">TAB</div>
                <div class="cei-tab-str-col">줄</div>
                <div class="cei-tab-fret-col">프렛</div>
                <div class="cei-tab-pad-col">빠른 입력</div>
                <div class="cei-tab-tech-col">기법</div>
              </div>

              <!-- 줄별 입력 테이블 -->
              <div class="cei-tab-body">
                <table class="cei-table">
                  <tbody id="ceiTbody">
                    ${Array.from({length: nStr}, (_, i) => rowHtml(i)).join('')}
                  </tbody>
                </table>
              </div>

              <!-- 버튼 -->
              <div class="cei-btn-row">
                <button class="cei-btn-ok" id="ceiOk">
                  <i class="fas fa-check"></i> 입력 완료
                </button>
                <button class="cei-btn-clear" id="ceiClear">
                  <i class="fas fa-eraser"></i> 초기화
                </button>
                <button class="cei-btn-cancel" id="ceiCancel">취소</button>
              </div>

              <!-- 코드 선택 메뉴 -->
              <div class="cei-chord-picker">
                <div class="cei-picker-title">
                  <i class="fas fa-th" style="color:#6366f1;"></i>
                  코드 선택
                  <span class="cei-picker-hint">클릭하면 프렛이 자동 입력됩니다</span>
                </div>
                <!-- 카테고리 탭 -->
                <div class="cei-cat-tabs" id="ceiCatTabs">
                  <button class="cei-cat-tab active" data-cat="major">Major</button>
                  <button class="cei-cat-tab" data-cat="minor">Minor</button>
                  <button class="cei-cat-tab" data-cat="7th">7th</button>
                  <button class="cei-cat-tab" data-cat="maj7">maj7</button>
                  <button class="cei-cat-tab" data-cat="sus">sus</button>
                  <button class="cei-cat-tab" data-cat="add">add9</button>
                  <button class="cei-cat-tab" data-cat="power">Power</button>
                  <button class="cei-cat-tab" data-cat="slash">Slash</button>
                </div>
                <!-- 코드 버튼 그리드 -->
                <div class="cei-chord-grid" id="ceiChordGrid"></div>
              </div>
            </div>

            <!-- 오른쪽: 미리보기 패널 -->
            <div class="cei-preview-panel">

              <!-- 인식된 코드 배너 -->
              <div id="ceiAutoChordBanner" class="cei-auto-banner" style="display:none;">
                <div class="cei-auto-inner">
                  <span class="cei-auto-icon">🎵</span>
                  <div class="cei-auto-info">
                    <span class="cei-auto-label">인식된 코드</span>
                    <span class="cei-auto-chord" id="ceiAutoChordName"></span>
                    <span class="cei-auto-score" id="ceiAutoChordScore"></span>
                  </div>
                  <button id="ceiAutoApply" class="cei-auto-apply-btn">적용</button>
                </div>
              </div>

              <!-- TAB 미리보기 -->
              <div class="cei-preview-section">
                <div class="cei-preview-title">TAB 미리보기</div>
                <div class="cei-tab-preview" id="ceiTabPreview">
                  ${buildTabPreviewSVG(initFrets, curChord)}
                </div>
              </div>

              <!-- 코드 다이어그램 -->
              <div class="cei-preview-section">
                <div class="cei-preview-title">코드 다이어그램</div>
                <div class="cei-chord-diagram" id="ceiChordDiagram">
                  ${buildChordDiagramSVG(initFrets, curChord)}
                </div>
              </div>

              <!-- 유사 코드폼 추천 -->
              <div class="cei-preview-section" id="ceiSuggestSection">
                <div class="cei-preview-title">🔍 유사 코드폼 추천</div>
                <div class="cei-suggest-grid" id="ceiSuggest">
                  <span class="cei-suggest-empty-msg">프렛을 입력하면<br>코드가 자동 인식됩니다</span>
                </div>
              </div>
            </div>
          </div>
        `;

        // 모달 스타일
        Object.assign(p.style, {
            position: 'fixed', left: '50%', top: '50%',
            transform: 'translate(-50%,-50%)',
            width: 'min(820px,97vw)', maxHeight: '92vh',
            overflowY: 'auto', zIndex: '9999',
            background: '#fff', border: 'none',
            borderRadius: '16px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
            padding: '0',
        });
        document.body.appendChild(p);
        this._popup = p;

        // 반투명 오버레이
        const overlay = document.createElement('div');
        overlay.id = 'ceiOverlay';
        Object.assign(overlay.style, {
            position:'fixed', inset:'0',
            background:'rgba(10,10,20,0.55)',
            backdropFilter:'blur(2px)',
            zIndex:'9998',
        });
        overlay.addEventListener('click', () => cleanup());
        document.body.appendChild(overlay);

        const cleanup = () => { overlay.remove(); this._closePopup(); };

        /* ─── 작업 상태 ─── */
        let workingFrets = [...initFrets];
        let workingTechs = [...initTechs];
        let chordManual  = !!curChord;

        const chordIn = p.querySelector('#ceiChordIn');

        /* ─── 미리보기 갱신 ─── */
        const refreshPreview = () => {
            const nm = chordIn.value.trim();
            const tabPrev = p.querySelector('#ceiTabPreview');
            const diagPrev = p.querySelector('#ceiChordDiagram');
            if (tabPrev)  tabPrev.innerHTML  = buildTabPreviewSVG(workingFrets, nm);
            if (diagPrev) diagPrev.innerHTML = buildChordDiagramSVG(workingFrets, nm);
        };

        /* ─── 자동 인식 배너 ─── */
        const updateBanner = () => {
            const banner = p.querySelector('#ceiAutoChordBanner');
            if (!banner) return;
            if (chordManual && chordIn.value.trim()) { banner.style.display = 'none'; return; }
            const filled = workingFrets.filter(f => f !== null && f !== undefined).length;
            if (filled < 2) { banner.style.display = 'none'; return; }
            const forms = _suggestChordForms(workingFrets, nStr);
            if (!forms.length) { banner.style.display = 'none'; return; }
            const best = forms[0];
            const pct  = Math.round(best.score * 100);
            banner.style.display = 'block';
            p.querySelector('#ceiAutoChordName').textContent = best.chord;
            p.querySelector('#ceiAutoChordScore').textContent = `일치도 ${pct}%`;
            if (pct >= 80 && !chordManual) {
                chordIn.value = best.chord;
                chordIn.classList.add('has-value');
            }
        };

        /* ─── 유사 코드폼 추천 갱신 ─── */
        const updateSuggest = () => {
            const cont = p.querySelector('#ceiSuggest');
            if (!cont) return;
            const forms = _suggestChordForms(workingFrets, nStr);
            if (!forms.length) {
                cont.innerHTML = '<span class="cei-suggest-empty-msg">프렛을 입력하면<br>코드가 자동 인식됩니다</span>';
                return;
            }
            cont.innerHTML = forms.map(f => `
              <button class="cei-suggest-card" data-frets='${JSON.stringify(f.frets)}' data-chord="${f.chord}">
                <span class="cei-sc-chord">${f.chord}</span>
                <span class="cei-sc-diagram">${buildChordDiagramSVG(f.frets, '')}</span>
                <span class="cei-sc-frets">${_fretsToDisplay(f.frets)}</span>
              </button>`).join('');
            cont.querySelectorAll('.cei-suggest-card').forEach(btn => {
                btn.addEventListener('click', () => {
                    const frets = JSON.parse(btn.dataset.frets);
                    const nm    = btn.dataset.chord;
                    frets.forEach((f, si) => {
                        if (si >= nStr) return;
                        workingFrets[si] = f;
                        const inp = p.querySelector(`#ceiFret${si}`);
                        if (inp) inp.value = (f === null || f === undefined) ? '' : String(f);
                        p.querySelectorAll(`.cei-nb[data-str="${si}"]`).forEach(b =>
                            b.classList.toggle('on', String(b.dataset.fret) === String(f) && f !== null));
                    });
                    chordIn.value = nm;
                    chordManual = true;
                    chordIn.classList.add('has-value');
                    updateBanner(); updateSuggest(); refreshPreview();
                    _toast(`${nm} 코드폼 적용!`, 'success');
                });
            });
        };

        /* ─── 프렛 변경 핸들러 ─── */
        const onFretChange = (si, rawVal) => {
            const v = rawVal.trim();
            if (v === '') {
                workingFrets[si] = null;
            } else if (v === 'x') {
                workingFrets[si] = 'x';
            } else {
                const n = parseInt(v);
                workingFrets[si] = isNaN(n) ? null : Math.min(24, Math.max(0, n));
            }
            // 패드 상태 갱신
            p.querySelectorAll(`.cei-nb[data-str="${si}"]`).forEach(b => {
                const bv = b.dataset.fret;
                const isOn = bv === '' ? workingFrets[si] === null
                           : String(bv) === String(workingFrets[si]);
                b.classList.toggle('on', isOn);
            });
            // 행 강조
            p.querySelectorAll('.cei-tr').forEach(tr =>
                tr.classList.toggle('cei-tr-active', parseInt(tr.dataset.str) === si));
            if (!chordManual) { chordIn.value = ''; chordIn.classList.remove('has-value'); }
            updateBanner(); updateSuggest(); refreshPreview();
        };

        /* ─── 이벤트 ─── */
        chordIn.addEventListener('input', () => {
            chordManual = true;
            chordIn.classList.toggle('has-value', !!chordIn.value.trim());
            refreshPreview();
        });
        chordIn.addEventListener('keydown', ev => {
            if (ev.key === 'Enter') { ev.preventDefault(); p.querySelector('#ceiFret0')?.focus(); }
        });

        p.querySelector('#ceiAutoApply')?.addEventListener('click', () => {
            const nm = p.querySelector('#ceiAutoChordName')?.textContent;
            if (nm) {
                chordIn.value = nm;
                chordManual = true;
                chordIn.classList.add('has-value');
                p.querySelector('#ceiAutoChordBanner').style.display = 'none';
                refreshPreview();
            }
        });

        p.querySelectorAll('.cei-fret-input').forEach(inp => {
            const si = parseInt(inp.dataset.str);
            inp.addEventListener('input', () => onFretChange(si, inp.value));
            inp.addEventListener('focus', () =>
                p.querySelectorAll('.cei-tr').forEach(tr =>
                    tr.classList.toggle('cei-tr-active', parseInt(tr.dataset.str) === si)));
            inp.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    const next = p.querySelector(`#ceiFret${si + 1}`);
                    if (next) next.focus(); else apply();
                }
                if (ev.key === 'Escape') { ev.preventDefault(); cleanup(); }
            });
        });

        p.querySelectorAll('.cei-nb').forEach(btn => {
            btn.addEventListener('click', () => {
                const si = parseInt(btn.dataset.str);
                const fv = btn.dataset.fret;
                const inp = p.querySelector(`#ceiFret${si}`);
                if (inp) inp.value = fv;
                onFretChange(si, fv);
                const next = p.querySelector(`#ceiFret${si + 1}`);
                if (next) setTimeout(() => next.focus(), 50);
            });
        });

        p.querySelectorAll('.cei-tech-sel').forEach(sel => {
            sel.addEventListener('change', () => {
                workingTechs[parseInt(sel.dataset.str)] = sel.value;
            });
        });

        /* ─── 입력 완료 ─── */
        const apply = () => {
            this._saveSnap();
            workingFrets.forEach((fv, si) => this._writeFret(barIdx, slotIdx, si, fv));
            workingTechs.forEach((tv, si) => this._writeTech(barIdx, slotIdx, si, tv));
            const cv = chordIn.value.trim();
            if (cv) {
                this._writeChord(barIdx, slotIdx, cv);
            } else {
                const forms = _suggestChordForms(workingFrets, nStr);
                if (forms.length && forms[0].score >= 0.75) {
                    this._writeChord(barIdx, slotIdx, forms[0].chord);
                    _toast(`🎵 ${forms[0].chord} 코드 자동 인식!`, 'success');
                }
            }
            this._rerender(); cleanup();
        };

        const clearAll = () => {
            workingFrets = new Array(nStr).fill(null);
            workingTechs = new Array(nStr).fill('');
            p.querySelectorAll('.cei-fret-input').forEach(inp => inp.value = '');
            p.querySelectorAll('.cei-nb').forEach(b => b.classList.remove('on'));
            p.querySelectorAll('.cei-tech-sel').forEach(s => s.value = '');
            chordIn.value = ''; chordManual = false;
            chordIn.classList.remove('has-value');
            updateBanner(); updateSuggest(); refreshPreview();
        };

        p.querySelector('#ceiOk').addEventListener('click', apply);
        p.querySelector('#ceiClear').addEventListener('click', clearAll);
        p.querySelector('#ceiCancel').addEventListener('click', () => cleanup());
        p.querySelector('.cei-close-btn').addEventListener('click', () => cleanup());
        document.addEventListener('keydown', function escH(ev) {
            if (ev.key === 'Escape') { cleanup(); document.removeEventListener('keydown', escH); }
        });

        /* ─── 코드 선택 메뉴 ─── */
        const PICKER_DB = {
            major: [
                {chord:'C',   frets:[null,3,2,0,1,0]},
                {chord:'D',   frets:[null,null,0,2,3,2]},
                {chord:'E',   frets:[0,2,2,1,0,0]},
                {chord:'F',   frets:[1,3,3,2,1,1]},
                {chord:'G',   frets:[3,2,0,0,0,3]},
                {chord:'A',   frets:[null,0,2,2,2,0]},
                {chord:'B',   frets:[null,2,4,4,4,2]},
                {chord:'Bb',  frets:[null,1,3,3,3,1]},
            ],
            minor: [
                {chord:'Cm',  frets:[null,3,5,5,4,3]},
                {chord:'Dm',  frets:[null,null,0,2,3,1]},
                {chord:'Em',  frets:[0,2,2,0,0,0]},
                {chord:'Fm',  frets:[1,3,3,1,1,1]},
                {chord:'Gm',  frets:[3,5,5,3,3,3]},
                {chord:'Am',  frets:[null,0,2,2,1,0]},
                {chord:'Bm',  frets:[null,2,4,4,3,2]},
                {chord:'C#m', frets:[null,4,6,6,5,4]},
                {chord:'F#m', frets:[2,4,4,2,2,2]},
                {chord:'G#m', frets:[4,6,6,4,4,4]},
            ],
            '7th': [
                {chord:'C7',  frets:[null,3,2,3,1,0]},
                {chord:'D7',  frets:[null,null,0,2,1,2]},
                {chord:'E7',  frets:[0,2,0,1,0,0]},
                {chord:'F7',  frets:[1,3,1,2,1,1]},
                {chord:'G7',  frets:[3,2,0,0,0,1]},
                {chord:'A7',  frets:[null,0,2,0,2,0]},
                {chord:'B7',  frets:[null,2,1,2,0,2]},
                {chord:'Am7', frets:[null,0,2,0,1,0]},
                {chord:'Dm7', frets:[null,null,0,2,1,1]},
                {chord:'Em7', frets:[0,2,2,0,3,0]},
                {chord:'Bm7', frets:[null,2,4,2,3,2]},
            ],
            maj7: [
                {chord:'Cmaj7', frets:[null,3,2,0,0,0]},
                {chord:'Dmaj7', frets:[null,null,0,2,2,2]},
                {chord:'Emaj7', frets:[0,2,1,1,0,0]},
                {chord:'Fmaj7', frets:[1,3,2,2,1,0]},
                {chord:'Gmaj7', frets:[3,2,0,0,0,2]},
                {chord:'Amaj7', frets:[null,0,2,1,2,0]},
            ],
            sus: [
                {chord:'Dsus2', frets:[null,null,0,2,3,0]},
                {chord:'Dsus4', frets:[null,null,0,2,3,3]},
                {chord:'Asus2', frets:[null,0,2,2,0,0]},
                {chord:'Asus4', frets:[null,0,2,2,3,0]},
                {chord:'Esus4', frets:[0,2,2,2,0,0]},
                {chord:'Gsus4', frets:[3,3,0,0,1,3]},
            ],
            add: [
                {chord:'Cadd9', frets:[null,3,2,0,3,0]},
                {chord:'Dadd9', frets:[null,null,0,2,3,0]},
                {chord:'Gadd9', frets:[3,2,0,2,0,3]},
                {chord:'Aadd9', frets:[null,0,2,4,2,0]},
            ],
            power: [
                {chord:'E5', frets:[0,2,2,null,null,null]},
                {chord:'A5', frets:[null,0,2,2,null,null]},
                {chord:'D5', frets:[null,null,0,2,3,null]},
                {chord:'G5', frets:[3,5,5,null,null,null]},
                {chord:'B5', frets:[null,2,4,4,null,null]},
            ],
            slash: [
                {chord:'G/B',  frets:[null,2,0,0,0,3]},
                {chord:'C/E',  frets:[0,3,2,0,1,0]},
                {chord:'D/F#', frets:[2,null,0,2,3,2]},
                {chord:'Am/C', frets:[null,3,2,2,1,0]},
                {chord:'Em/B', frets:[null,2,2,0,0,0]},
            ],
        };

        let activeCat = 'major';

        const renderPickerGrid = (cat) => {
            const grid = p.querySelector('#ceiChordGrid');
            if (!grid) return;
            const items = PICKER_DB[cat] || [];
            grid.innerHTML = items.map(item => {
                const fvStr = item.frets.map(f =>
                    f === null ? '—' : f === 'x' ? '✕' : String(f)
                ).join(' ');
                return `
                <button class="cei-pick-btn" data-frets='${JSON.stringify(item.frets)}' data-chord="${item.chord}">
                  <span class="cei-pick-diagram">${buildChordDiagramSVG(item.frets, '')}</span>
                  <span class="cei-pick-name">${item.chord}</span>
                  <span class="cei-pick-frets">${fvStr}</span>
                </button>`;
            }).join('');

            grid.querySelectorAll('.cei-pick-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const frets   = JSON.parse(btn.dataset.frets);
                    const chordNm = btn.dataset.chord;
                    // 프렛 채우기
                    frets.forEach((f, si) => {
                        if (si >= nStr) return;
                        workingFrets[si] = f;
                        const inp = p.querySelector(`#ceiFret${si}`);
                        if (inp) inp.value = (f === null || f === undefined) ? '' : String(f);
                        p.querySelectorAll(`.cei-nb[data-str="${si}"]`).forEach(b =>
                            b.classList.toggle('on', b.dataset.fret !== '' && String(b.dataset.fret) === String(f)));
                    });
                    // 코드명 채우기
                    chordIn.value = chordNm;
                    chordManual = true;
                    chordIn.classList.add('has-value');
                    // 선택 시각 피드백
                    p.querySelectorAll('.cei-pick-btn').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    updateBanner(); updateSuggest(); refreshPreview();
                });
            });
        };

        // 탭 클릭
        p.querySelectorAll('.cei-cat-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                p.querySelectorAll('.cei-cat-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                activeCat = tab.dataset.cat;
                renderPickerGrid(activeCat);
            });
        });

        // 초기 그리드 렌더
        renderPickerGrid(activeCat);

        // 초기 렌더
        updateBanner(); updateSuggest(); refreshPreview();
        setTimeout(() => {
            const fi = p.querySelector(`#ceiFret${focusStrIdx}`);
            if (fi) { fi.focus(); fi.select(); }
        }, 80);
    }

    _closePopup() {
        if (this._popup) { this._popup.remove(); this._popup = null; }
    }

    /* ═══════════════════════════════════════════
       가상 슬롯(빈 칸) 클릭 처리
       — 편집 모드 4칸 레이아웃에서 빈 칸을 클릭하면
         해당 박 위치에 새 슬롯을 생성 후 팝업 표시
    ═══════════════════════════════════════════ */
    _createVirtualSlot(barIdx, virtualIdx, e, action, strIdx) {
        const R   = this.renderer;
        const bar = R.bars[barIdx];
        if (!bar) return;

        // bar.chords 정규화
        if (!bar.chords) {
            bar.chords = [{ chord: bar.chord || { name:'' }, beatOffset:0, beatLen:4, slotIndex:0 }];
        }

        // 이미 해당 beat에 슬롯이 있으면 그냥 팝업
        const targetBeat = virtualIdx; // virtualIdx는 0~3 박 위치
        const existing = bar.chords.find(c =>
            c.beatOffset <= targetBeat && (c.beatOffset + c.beatLen) > targetBeat
        );
        if (existing) {
            const realIdx = bar.chords.indexOf(existing);
            if (action === 'chord') {
                this._openChordPopup(barIdx, realIdx, e.target.getBoundingClientRect());
            } else {
                this._openFretPopup(barIdx, realIdx, strIdx, e.target.getBoundingClientRect());
            }
            return;
        }

        // 새 슬롯 생성: 기존 슬롯의 beatLen 조정
        this._saveSnap();

        // 모든 슬롯을 1박씩 조정 → 4슬롯으로 분할
        bar.chords = [0,1,2,3].map(i => {
            const ex = bar.chords.find(c => c.beatOffset <= i && (c.beatOffset + c.beatLen) > i);
            return {
                chord     : ex ? ex.chord : { name:'' },
                beatOffset: i,
                beatLen   : 1,
                slotIndex : i,
            };
        });

        this._rerender();

        // 렌더 후 팝업 표시
        requestAnimationFrame(() => {
            const rect = e.target.getBoundingClientRect();
            if (action === 'chord') {
                this._openChordPopup(barIdx, virtualIdx, rect);
            } else {
                this._openFretPopup(barIdx, virtualIdx, strIdx, rect);
            }
        });
    }

    /* ═══════════════════════════════════════════
       슬롯 분할 / 삭제
    ═══════════════════════════════════════════ */
    _splitSlot(barIdx, slotIdx) {
        const bar = this.renderer.bars[barIdx];
        if (!bar) return;
        if (!bar.chords) {
            bar.chords = [{ chord: bar.chord || { name:'' }, beatOffset:0, beatLen:4, slotIndex:0 }];
        }
        if (bar.chords.length >= 4) { _toast('최대 4슬롯까지 분할 가능합니다.', 'info'); return; }
        const tgt = bar.chords[slotIdx];
        if (!tgt || tgt.beatLen <= 1) { _toast('더 이상 분할할 수 없습니다.', 'info'); return; }
        this._saveSnap();
        const half = tgt.beatLen / 2;
        const newC = { chord:{ name:'' }, beatLen:half, beatOffset:tgt.beatOffset + half, slotIndex:slotIdx + 0.5 };
        tgt.beatLen = half;
        bar.chords.splice(slotIdx + 1, 0, newC);
        bar.chords.forEach((c, i) => { c.slotIndex = i; });
        if (!bar.notes) bar.notes = [];
        bar.notes.push({ type:'rest', strings:new Array(this.renderer.numStrings).fill(null), slotIndex:slotIdx+1, techniques:{} });
        this._rerender();
    }

    _deleteSlot(barIdx, slotIdx) {
        const bar = this.renderer.bars[barIdx];
        if (!bar?.chords || bar.chords.length <= 1) { _toast('마지막 슬롯은 삭제할 수 없습니다.', 'info'); return; }
        this._saveSnap();
        const removed = bar.chords.splice(slotIdx, 1)[0];
        // beatLen 분배: 앞 슬롯이 있으면 앞에, 없으면 뒤에
        const sibling = bar.chords[slotIdx > 0 ? slotIdx - 1 : 0];
        if (sibling) sibling.beatLen += removed.beatLen;
        bar.chords.forEach((c, i) => { c.slotIndex = i; });
        bar.notes = (bar.notes || []).filter(n => (n.slotIndex ?? 0) !== slotIdx);
        bar.notes.forEach((n, i) => { if ((n.slotIndex ?? 0) > slotIdx) n.slotIndex--; });
        this._rerender();
    }

    /* ═══════════════════════════════════════════
       탭 자동 삽입 — 코드명으로 폼 조회 후 노트 생성
    ═══════════════════════════════════════════ */
    _autoInsertTab(barIdx, slotIdx, chordName) {
        if (!chordName) return;
        const R   = this.renderer;
        const bar = R.bars[barIdx];
        if (!bar) return;

        // tabConverter가 있으면 폼 조회
        let fretsArr = null;
        if (window.tabConverter?._getAcousticForm) {
            try { fretsArr = tabConverter._getAcousticForm(chordName); } catch(e) {}
        }
        if (!fretsArr && window.tabConverter?.convertBarChordsToTab) {
            try {
                const result = tabConverter.convertBarChordsToTab(
                    [{ chord: chordName, time:0, barIndex: barIdx }],
                    R.instrument || 'acoustic', R.bpm || 120
                );
                fretsArr = result?.[0]?.strings;
            } catch(e) {}
        }

        if (!fretsArr || !fretsArr.some(f => f !== null && f !== undefined)) return;

        // 노트 데이터 삽입
        if (!bar.notes) bar.notes = [];
        let note = bar.notes.find(n => (n.slotIndex ?? 0) === slotIdx);
        if (!note) {
            note = { type:'note', strings: new Array(R.numStrings).fill(null), slotIndex: slotIdx, techniques:{} };
            bar.notes.push(note);
        }
        note.strings  = fretsArr.slice(0, R.numStrings);
        note.type     = 'note';
        note._manual  = true;
        note.chord    = { name: chordName };
    }

    /* ═══════════════════════════════════════════
       데이터 쓰기 헬퍼
    ═══════════════════════════════════════════ */
    _writeChord(barIdx, slotIdx, name) {
        const bar = this.renderer.bars[barIdx];
        if (!bar) return;
        const chordObj = { name, _manual: true };
        if (bar.chords && bar.chords[slotIdx] !== undefined) {
            bar.chords[slotIdx].chord = chordObj;
        } else if (!bar.chords) {
            bar.chord = chordObj;
        }
    }

    /* 슬롯의 타브 숫자(프렛 데이터)를 모두 삭제 */
    _clearSlotNotes(barIdx, slotIdx) {
        const bar = this.renderer.bars[barIdx];
        if (!bar) return;
        if (!bar.notes) return;
        const note = bar.notes.find(n => (n.slotIndex ?? 0) === slotIdx);
        if (note) {
            // 모든 줄의 프렛값을 null로 초기화
            note.strings = new Array(this.renderer.numStrings).fill(null);
            note.techniques = {};
            note.type = 'rest';
            note._manual = false;
        }
    }

    _writeFret(barIdx, slotIdx, strIdx, fret) {
        const bar = this.renderer.bars[barIdx];
        if (!bar) return;
        if (!bar.notes) bar.notes = [];
        let note = bar.notes.find(n => (n.slotIndex ?? 0) === slotIdx);
        if (!note) {
            note = { type:'rest', strings: new Array(this.renderer.numStrings).fill(null), slotIndex:slotIdx, techniques:{} };
            bar.notes.push(note);
        }
        if (!note.strings) note.strings = new Array(this.renderer.numStrings).fill(null);
        note.strings[strIdx] = fret;
        note._manual = true;
        note.type = note.strings.some(f => f !== null && f !== undefined) ? 'note' : 'rest';
    }

    _writeTech(barIdx, slotIdx, strIdx, tech) {
        const bar = this.renderer.bars[barIdx];
        if (!bar?.notes) return;
        const note = bar.notes.find(n => (n.slotIndex ?? 0) === slotIdx);
        if (!note) return;
        if (!note.techniques) note.techniques = {};
        if (tech) note.techniques[strIdx] = tech;
        else      delete note.techniques[strIdx];
    }

    /* ═══════════════════════════════════════════
       재렌더
    ═══════════════════════════════════════════ */
    _rerender() {
        this.renderer.render();
        if (this.active) requestAnimationFrame(() => this._buildOverlay());
        // 코드 박스 동기화 (편집 시)
        if (typeof refreshChordBoxAfterTranspose === 'function') {
            setTimeout(refreshChordBoxAfterTranspose, 50);
        }
    }
}

/* ══════════════════════════════════════════
   유틸리티 (module-private)
══════════════════════════════════════════ */
function _mkRect(x, y, w, h, attrs) {
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x',  x);  r.setAttribute('y',  y);
    r.setAttribute('width', Math.max(1, w));
    r.setAttribute('height', Math.max(1, h));
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'fill' || k === 'cursor') r.style[k] = v;
        else r.setAttribute(k, v);
    }
    return r;
}

function _addHover(el, normalFill, hoverFill) {
    el.addEventListener('mouseenter', () => el.style.fill = hoverFill);
    el.addEventListener('mouseleave', () => el.style.fill = normalFill);
}

function _makePopup() {
    const p = document.createElement('div');
    p.className = 'tep';
    p.style.cssText = 'position:fixed;z-index:10000;';
    return p;
}

function _positionPopup(p, rect) {
    if (!rect) { p.style.top = '50%'; p.style.left = '50%'; p.style.transform = 'translate(-50%,-50%)'; return; }
    let top  = rect.bottom + 8;
    let left = rect.left;
    document.body.appendChild(p);
    requestAnimationFrame(() => {
        const pr = p.getBoundingClientRect();
        if (left + pr.width  > window.innerWidth  - 8) left = Math.max(4, window.innerWidth  - pr.width  - 8);
        if (top  + pr.height > window.innerHeight - 8) top  = Math.max(4, rect.top - pr.height - 8);
        p.style.left = left + 'px';
        p.style.top  = top  + 'px';
    });
}

function _quickChords() {
    return ['C','Cm','C7','Cmaj7','D','Dm','D7','Dmaj7',
            'E','Em','E7','F','Fmaj7','G','G7','A','Am','A7','B','Bm',
            'C#m','F#m','G#m','Bb','Bb7','Am7','Dm7','Em7','G/B','C/E'];
}

function _techBtns(cur) {
    const list = [
        {k:'',   l:'없음'},  {k:'h', l:'h 해머온'}, {k:'p', l:'p 풀오프'},
        {k:'b',  l:'b 벤딩'},{k:'/', l:'/ 슬라이드↑'},{k:'\\',l:'\\ 슬라이드↓'},
        {k:'~',  l:'~ 비브라토'},{k:'x', l:'× 뮤트'},
    ];
    return list.map(t =>
        `<button class="tep-tech-btn${t.k===cur?' on':''}" data-tech="${t.k}" title="${t.l}">${t.l}</button>`
    ).join('');
}

function _toast(msg, type = 'info') {
    if (window.showToast) { showToast(msg, type); return; }
    console.log(`[${type}] ${msg}`);
}

/* ══════════════════════════════════════════
   유사 코드폼 추천 — 현재 프렛 배열 기반
   일반 기타 코드폼 DB와 비교해 가장 유사한 2~3개 추천
══════════════════════════════════════════ */
function _suggestChordForms(currentFrets, numStrings) {
    if (!currentFrets || !currentFrets.length) return [];

    // 자주 쓰이는 코드폼 DB (6현 기준)
    const CHORD_DB = [
        // Major
        { chord:'C',      frets:[null,3,2,0,1,0] },
        { chord:'D',      frets:[null,null,0,2,3,2] },
        { chord:'E',      frets:[0,2,2,1,0,0] },
        { chord:'F',      frets:[1,3,3,2,1,1] },
        { chord:'G',      frets:[3,2,0,0,0,3] },
        { chord:'A',      frets:[null,0,2,2,2,0] },
        { chord:'B',      frets:[null,2,4,4,4,2] },
        { chord:'Bb',     frets:[null,1,3,3,3,1] },
        // Minor
        { chord:'Cm',     frets:[null,3,5,5,4,3] },
        { chord:'Dm',     frets:[null,null,0,2,3,1] },
        { chord:'Em',     frets:[0,2,2,0,0,0] },
        { chord:'Fm',     frets:[1,3,3,1,1,1] },
        { chord:'Gm',     frets:[3,5,5,3,3,3] },
        { chord:'Am',     frets:[null,0,2,2,1,0] },
        { chord:'Bm',     frets:[null,2,4,4,3,2] },
        { chord:'C#m',    frets:[null,4,6,6,5,4] },
        { chord:'F#m',    frets:[2,4,4,2,2,2] },
        { chord:'G#m',    frets:[4,6,6,4,4,4] },
        // 7th
        { chord:'C7',     frets:[null,3,2,3,1,0] },
        { chord:'D7',     frets:[null,null,0,2,1,2] },
        { chord:'E7',     frets:[0,2,0,1,0,0] },
        { chord:'F7',     frets:[1,3,1,2,1,1] },
        { chord:'G7',     frets:[3,2,0,0,0,1] },
        { chord:'A7',     frets:[null,0,2,0,2,0] },
        { chord:'B7',     frets:[null,2,1,2,0,2] },
        { chord:'Am7',    frets:[null,0,2,0,1,0] },
        { chord:'Dm7',    frets:[null,null,0,2,1,1] },
        { chord:'Em7',    frets:[0,2,2,0,3,0] },
        { chord:'Bm7',    frets:[null,2,4,2,3,2] },
        // maj7
        { chord:'Cmaj7',  frets:[null,3,2,0,0,0] },
        { chord:'Dmaj7',  frets:[null,null,0,2,2,2] },
        { chord:'Emaj7',  frets:[0,2,1,1,0,0] },
        { chord:'Fmaj7',  frets:[1,3,2,2,1,0] },
        { chord:'Gmaj7',  frets:[3,2,0,0,0,2] },
        { chord:'Amaj7',  frets:[null,0,2,1,2,0] },
        // sus2 / sus4
        { chord:'Dsus2',  frets:[null,null,0,2,3,0] },
        { chord:'Dsus4',  frets:[null,null,0,2,3,3] },
        { chord:'Asus2',  frets:[null,0,2,2,0,0] },
        { chord:'Asus4',  frets:[null,0,2,2,3,0] },
        { chord:'Esus4',  frets:[0,2,2,2,0,0] },
        { chord:'Gsus4',  frets:[3,3,0,0,1,3] },
        // add9
        { chord:'Cadd9',  frets:[null,3,2,0,3,0] },
        { chord:'Dadd9',  frets:[null,null,0,2,3,0] },
        { chord:'Gadd9',  frets:[3,2,0,2,0,3] },
        { chord:'Aadd9',  frets:[null,0,2,4,2,0] },
        // Power chords
        { chord:'E5',     frets:[0,2,2,null,null,null] },
        { chord:'A5',     frets:[null,0,2,2,null,null] },
        { chord:'D5',     frets:[null,null,0,2,3,null] },
        { chord:'G5',     frets:[3,5,5,null,null,null] },
        { chord:'B5',     frets:[null,2,4,4,null,null] },
        // Slash chords
        { chord:'G/B',    frets:[null,2,0,0,0,3] },
        { chord:'C/E',    frets:[0,3,2,0,1,0] },
        { chord:'D/F#',   frets:[2,null,0,2,3,2] },
        { chord:'Am/C',   frets:[null,3,2,2,1,0] },
        { chord:'Em/B',   frets:[null,2,2,0,0,0] },
    ];

    // 4현 베이스용 DB
    const BASS_DB = [
        { chord:'C',    frets:[3,2,null,null] },
        { chord:'D',    frets:[5,4,null,null] },
        { chord:'E',    frets:[null,null,2,0] },
        { chord:'F',    frets:[null,null,3,1] },
        { chord:'G',    frets:[null,null,0,3] },
        { chord:'A',    frets:[null,0,null,null] },
        { chord:'B',    frets:[null,2,null,null] },
        { chord:'Am',   frets:[null,0,2,null] },
        { chord:'Dm',   frets:[5,3,null,null] },
        { chord:'Em',   frets:[null,null,2,0] },
        { chord:'Gm',   frets:[null,null,5,3] },
    ];

    const db = (numStrings === 4) ? BASS_DB : CHORD_DB;
    const nStr = numStrings || 6;

    // 유사도 계산: 겹치는 프렛 수 / null이 아닌 총 프렛 수
    const scored = db.map(entry => {
        const ef = entry.frets.slice(0, nStr);
        const cf = currentFrets.slice(0, nStr);
        let matches = 0, total = 0;
        for (let i = 0; i < nStr; i++) {
            const e = ef[i], c = cf[i];
            if (e !== null && e !== undefined) total++;
            if (e !== null && e !== undefined && c !== null && c !== undefined) {
                if (e === c) matches += 2;
                else if (Math.abs(Number(e) - Number(c)) <= 1) matches += 1;
            }
        }
        const score = total > 0 ? matches / (total * 2) : 0;
        return { chord: entry.chord, frets: ef, score };
    });

    // 점수 순 정렬 → 상위 3개 (점수 0.3 이상만)
    return scored
        .filter(s => s.score >= 0.3)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
}

/* 프렛 배열을 사람이 읽기 쉬운 문자열로 변환 */
function _fretsToDisplay(frets) {
    if (!frets) return '';
    return frets.map(f => {
        if (f === null || f === undefined) return '—';
        if (f === 'x') return '×';
        return String(f);
    }).join(' ');
}
