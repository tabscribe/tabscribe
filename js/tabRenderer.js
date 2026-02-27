/**
 * TabRenderer v4.1 — SVG 기반 락밴드 스타일 타브악보 렌더러
 *
 * v4.1 변경 (Rock Band Style):
 *  - 현 간격 확대 (28→32), 프렛 폰트 확대 (12→14), 박스 확대
 *  - 코드명 크게/굵게, 마디선 더 진하게
 *  - 배경색 흰색에 가깝게, 줄 색은 진한 갈색으로 명확하게
 *  - 마디 번호 표시 개선
 */
class TabRenderer {
    constructor(canvas) {
        this.canvas     = canvas;   // <canvas> 또는 컨테이너 DIV 어디에도 동작
        this.ctx        = canvas.getContext ? canvas.getContext('2d') : null;

        // 데이터
        this.tabData    = [];
        this.bars       = [];
        this.currentTime= 0;
        this.instrument = 'acoustic';
        this.numStrings = 6;
        this.showChords = true;
        this.zoom       = 1.0;
        this.bpm        = 120;

        /* ── SVG 렌더 상수: 코드 악보 스타일 (읽기 쉽게 크게) ── */
        this.CFG = {
            STRING_H  : 34,       // 현 간격 (타브 표준, 더 넓게 읽기 쉬움)
            PAD_TOP   : 46,       // 코드명 + 마디번호 공간
            PAD_BOTTOM: 10,
            PAD_LEFT  : 14,
            PAD_RIGHT : 18,
            FONT_FRET : 14,       // 프렛 번호 크기 (크게)
            FONT_CHORD: 16,       // 코드명 크기
            BOX_W_1   : 20,       // (unused - 보존)
            BOX_W_2   : 28,       // (unused - 보존)
            BOX_H     : 18,       // (unused - 보존)
            BEAT_W    : 80,
            C_LINE    : '#5a4030',   // 현 — 진한 질갈색
            C_BAR     : '#2d1a0a',   // 마디선
            C_BOLD    : '#1a0e06',
            C_FRET    : '#111111',   // 프렛 숫자 (진하게)
            C_OPEN    : '#0a6a0a',   // 개방현 0
            C_CHORD   : '#1040a0',   // 코드명 파랑
            C_ACTIVE  : '#d45d00',   // 재생 중
            C_BG      : '#ffffff',   // 배경
            C_BARNUM  : '#999080',   // 마디 번호
        };

        /* 레이아웃 상수 */
        this.L = {
            marginLeft  : 60,
            marginRight : 24,
            marginTop   : 48,
            marginBottom: 28,
            lineGap     : 28,       // STRING_H 와 맞춤
            barWidth    : 200,
            chordLabelH : 22,
            barNumH     : 16,
            rowGap      : 44,
        };

        /* ── 색상 (waveform/visualizer 용) ── */
        this.C = {
            pageBg: '#ffffff', playhead: '#d45d00',
            noteTextActive: '#d45d00', chordActive: '#d45d00',
        };
    }

    /* ════ PUBLIC API ════ */
    setData(tabData, bars, instrument, bpm) {
        this.tabData    = tabData;
        this.bars       = bars;
        this.bpm        = bpm || 120;
        this.instrument = instrument;
        this.numStrings = (instrument === 'bass') ? 4 : 6;
        this.render();

        // 창 크기 변경 시 마디 수 재계산 → 자동 재렌더 (한 번만 등록)
        if (!this._resizeListenerAttached) {
            this._resizeListenerAttached = true;
            let _rt;
            window.addEventListener('resize', () => {
                clearTimeout(_rt);
                _rt = setTimeout(() => this.render(), 120);
            });
        }
    }
    setZoom(z)       { this.zoom = Math.max(0.5, Math.min(2.5, z)); this.render(); }
    setShowChords(v) { this.showChords = v; this.render(); }
    updateTime(t)    { this.currentTime = t; this.render(); }
    updatePlayheadOnly(t) { this.currentTime = t; this._highlightActiveSVG(t); }

    getStringNames() {
        return this.instrument === 'bass'
            ? ['G','D','A','E']
            : ['e','B','G','D','A','E'];
    }

    getCurrentBarIndex()           { return this.getCurrentBarIndexByTime(this.currentTime); }
    getCurrentBarIndexByTime(t) {
        if (!this.bars?.length) return -1;
        for (let i = this.bars.length - 1; i >= 0; i--) {
            if (t >= this.bars[i].startTime) return i;
        }
        return 0;
    }

    /* ════════════════════════════════════════
       행당 마디 수 계산 — zoom에 반비례
       ────────────────────────────────────────
       원리:
         컨테이너 가용 너비를 "마디 하나가 필요한 최소 픽셀"로 나눠
         실제로 한 행에 몇 마디가 들어갈 수 있는지 계산.

         BASE_BAR_PX = 170 (zoom 1.0 기준, 기존 220→170으로 줄여 4~5마디 기본)

         zoom 1.0 → 170px/마디 → 약 5마디 (900px 컨테이너)
         zoom 0.8 → 136px/마디 → 약 6마디
         zoom 1.2 → 204px/마디 → 약 4마디

       최솟값 2마디, 최댓값 12마디로 클램프.
    ════════════════════════════════════════ */
    _calcBarsPerRow(scale) {
        // ★ 1행 4마디 고정
        return 4;
    }

    /* ════════════════════════════════════════
       메인 렌더 — SVG, zoom 기반 동적 마디/행
    ════════════════════════════════════════ */
    render() {
        if (!this.bars?.length) return;

        const z       = this.zoom;
        const strings = this.getStringNames();
        const CFG     = this.CFG;
        const scale   = z;

        /* 행당 마디 수: zoom에 반비례 동적 계산 */
        const BARS_PER_ROW = this._calcBarsPerRow(scale);
        this._lastBarsPerRow = BARS_PER_ROW;  // scrollToCurrentBar에서 사용
        const rows = [];
        for (let i = 0; i < this.bars.length; i += BARS_PER_ROW) {
            rows.push(this.bars.slice(i, i + BARS_PER_ROW));
        }

        const curBarIdx = this.getCurrentBarIndex();
        let html = '';

        rows.forEach((rowBars, rowIdx) => {
            html += this._renderRow(rowBars, strings, scale, curBarIdx, rowIdx * BARS_PER_ROW, BARS_PER_ROW);
        });

        /* canvas를 컨테이너로 사용 — SVG 주입 */
        const container = this.canvas.parentElement || this.canvas;
        const target    = this.canvas;

        // canvas를 div로 교체하거나, 숨기고 옆에 div를 삽입
        let svgWrapper = document.getElementById('tabSvgWrapper');
        if (!svgWrapper) {
            svgWrapper = document.createElement('div');
            svgWrapper.id = 'tabSvgWrapper';
            svgWrapper.style.cssText = 'width:100%;overflow:hidden;box-sizing:border-box;';
            target.parentNode.insertBefore(svgWrapper, target);
            target.style.display = 'none';
        }
        svgWrapper.innerHTML = html;

        /* 활성 마디 하이라이트 */
        this._highlightActiveSVG(this.currentTime);
    }

    /* ────────────────────────────────────────
       행 SVG 렌더 (preview.html renderRow와 동일 로직)
       barsPerRow: 이 행의 "기준 마디 수" (마지막 행은 실제 마디 수가 적을 수 있음)
                   → 전체 행 너비를 항상 기준 마디 수 기준으로 균등 분배
    ──────────────────────────────────────── */
    _renderRow(rowBars, strings, scale, curBarIdx, rowOffset, barsPerRow) {
        const CFG     = this.CFG;
        const nStr    = strings.length;
        const strH    = Math.round(CFG.STRING_H * scale);
        const staffH  = nStr * strH;
        const padTop  = Math.round(CFG.PAD_TOP  * scale);
        const padBot  = Math.round(CFG.PAD_BOTTOM * scale);
        const svgH    = padTop + staffH + padBot;
        const LABEL_W = Math.round(42 * scale);

        /* 마디당 너비 — 컨테이너를 정확히 채우도록 */
        // 여러 방법으로 실제 너비 측정: tabScoreContainer > tabSvgWrapper 부모 > canvas 부모 순
        const scoreContainer = document.getElementById('tabScoreContainer');
        const wrapperEl      = document.getElementById('tabSvgWrapper');
        const parentEl       = scoreContainer || wrapperEl?.parentElement || this.canvas.parentElement;

        // clientWidth: 스크롤바/border 제외한 내부 너비 (visible 요소일 때만 정확)
        // offsetWidth: 요소가 hidden이어도 레이아웃에서 차지하는 너비
        let containerW = 0;
        if (parentEl) {
            containerW = parentEl.clientWidth
                || parentEl.offsetWidth
                || parentEl.getBoundingClientRect().width
                || 0;
        }
        // 0이면 DOM 준비 전 — 부모의 부모까지 탐색
        if (!containerW && parentEl?.parentElement) {
            containerW = parentEl.parentElement.clientWidth
                || parentEl.parentElement.offsetWidth
                || 0;
        }
        if (!containerW) containerW = 760; // 최후 fallback

        const PAD_SAFE   = 16;  // 좌우 여백·border·스크롤바 합계 여유
        const safeW      = Math.max(360, containerW - PAD_SAFE);
        const refBars    = barsPerRow || rowBars.length;
        const availW     = safeW - LABEL_W - 4;
        const barW       = Math.max(Math.round(72 * scale), Math.floor(availW / refBars));
        const totalW     = safeW;
        const out        = [];

        out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${svgH}" viewBox="0 0 ${totalW} ${svgH}" style="display:block;width:100%;overflow:hidden;margin-bottom:6px;user-select:none;background:#ffffff;">`); 

        /* TAB 세로 라벨 — 굵고 선명하게 */
        const tabFs = Math.max(12, Math.round(14 * scale));
        const midY  = padTop + staffH / 2;
        const lx    = Math.round(10 * scale);
        out.push(
            `<text x="${lx}" y="${midY - Math.round(14*scale)}" font-family="'Georgia',serif" font-weight="900" font-size="${tabFs}" fill="${CFG.C_BOLD}" text-anchor="middle">T</text>`,
            `<text x="${lx}" y="${midY}"                         font-family="'Georgia',serif" font-weight="900" font-size="${tabFs}" fill="${CFG.C_BOLD}" text-anchor="middle">A</text>`,
            `<text x="${lx}" y="${midY + Math.round(14*scale)}"  font-family="'Georgia',serif" font-weight="900" font-size="${tabFs}" fill="${CFG.C_BOLD}" text-anchor="middle">B</text>`,
        );

        /* 현 이름 — 줄 왼쪽에 선명하게 */
        const snFs = Math.max(9, Math.round(10 * scale));
        strings.forEach((s, si) => {
            const y = padTop + si * strH + Math.round(strH / 2);
            out.push(`<text x="${LABEL_W - Math.round(4*scale)}" y="${y + Math.round(5*scale)}" font-family="'JetBrains Mono',monospace" font-size="${snFs}" font-weight="700" fill="${CFG.C_BOLD}" text-anchor="end">${s}</text>`);
        });

        /* 각 마디 렌더 */
        let bx = LABEL_W;
        rowBars.forEach((bar, bi) => {
            const globalBarIdx = rowOffset + bi;
            const isActive     = (globalBarIdx === curBarIdx);

            /* ── 슬롯 구성 계산 ──
               bar.chords 배열이 있으면 멀티슬롯,
               없으면 단일 슬롯(하위호환) */
            const slots = this._resolveBarSlots(bar);

            /* 활성 마디 배경 */
            if (isActive) {
                out.push(`<rect x="${bx}" y="${padTop - Math.round(22*scale)}" width="${barW}" height="${staffH + Math.round(26*scale)}" rx="${Math.round(5*scale)}" fill="rgba(212,93,0,0.05)" stroke="rgba(212,93,0,0.28)" stroke-width="1.5"/>`);
            }

            /* 마디 번호 — 락밴드 스타일: 조금 더 크게 */
            out.push(`<text x="${bx + Math.round(4*scale)}" y="${padTop - Math.round(36*scale)}" font-family="Inter,sans-serif" font-size="${Math.max(8, Math.round(9*scale))}" font-weight="700" fill="${isActive ? CFG.C_ACTIVE : CFG.C_BARNUM}" text-anchor="start">${globalBarIdx + 1}</text>`);

            /* 왼쪽 마디선 — 락밴드 스타일: 선명하고 굵게 */
            const blW = (bi === 0 && rowOffset === 0) ? 3.0 : 1.6;
            out.push(`<line x1="${bx}" y1="${padTop}" x2="${bx}" y2="${padTop + staffH}" stroke="${CFG.C_BAR}" stroke-width="${blW}"/>`);

            /* 스태프 가로선 — 1번줄 얇게, 6번줄(E) 굵게, 선명한 색상 */
            strings.forEach((_, si) => {
                const y = padTop + si * strH + Math.round(strH / 2);
                const isThickString = (si === nStr - 1);  // 6번줄(베이스E)
                const isThinString  = (si === 0);          // 1번줄(e)
                const lineW = isThickString
                    ? Math.max(1.8, scale * 1.8)
                    : isThinString
                        ? Math.max(0.8, scale * 0.8)
                        : Math.max(1.0, scale * 1.0);
                out.push(`<line x1="${bx}" y1="${y}" x2="${bx + barW}" y2="${y}" stroke="${CFG.C_LINE}" stroke-width="${lineW}"/>`);
            });

            /* 악기 레이블 (첫 번째 행 첫 마디) */
            if (globalBarIdx === 0) {
                const instNames  = { acoustic:'🎸 기본 기타 코드 악보', electric1:'⚡ 파워코드 악보', electric2:'🔥 트라이어드 코드 악보', bass:'🎵 베이스 코드 악보' };
                const instColors = { acoustic:'#e85d04', electric1:'#be123c', electric2:'#15803d', bass:'#1d4ed8' };
                out.push(`<text x="${LABEL_W}" y="${Math.round(16*scale)}" font-family="Inter,sans-serif" font-size="${Math.max(9,Math.round(10*scale))}" font-weight="700" fill="${instColors[this.instrument]||'#666'}" text-anchor="start">${instNames[this.instrument]||''}</text>`);
            }

            /* ── 멀티슬롯 렌더링 ──
               편집 모드 여부는 외부에서 this._editMode 플래그로 전달 */
            const totalBeats = 4;   // 4/4박자 고정
            const editMode   = !!this._editMode; // 편집 모드 플래그

            /* ★ 기본 4칸 레이아웃: 슬롯이 1개면 4분의1씩 4칸 가상 칸 생성 */
            const displaySlots = (() => {
                if (slots.length === 1 && editMode) {
                    // 편집 모드: 4칸 빈 슬롯 표시 (기존 코드는 1번 칸에)
                    const base = slots[0];
                    return [
                        { beatOffset:0, beatLen:1, chord: base.chord, slotIndex:0, _virtual: false },
                        { beatOffset:1, beatLen:1, chord: { name:'' }, slotIndex:1, _virtual: true },
                        { beatOffset:2, beatLen:1, chord: { name:'' }, slotIndex:2, _virtual: true },
                        { beatOffset:3, beatLen:1, chord: { name:'' }, slotIndex:3, _virtual: true },
                    ];
                }
                return slots;
            })();

            displaySlots.forEach((slot, si) => {
                const slotFrac  = slot.beatLen / totalBeats;
                const slotX     = bx + Math.round(barW * (slot.beatOffset / totalBeats));
                const slotW     = Math.round(barW * slotFrac);
                const slotCx    = slotX + Math.round(slotW / 2);
                const isVirtual = slot._virtual === true; // 편집 모드 가상 빈 칸

                /* 슬롯 구분선 — 편집 모드에서만 표시 */
                if (si > 0 && editMode) {
                    if (slots.length === 1) {
                        // 편집 모드 4칸: 점선으로 표시
                        out.push(`<line x1="${slotX}" y1="${padTop}" x2="${slotX}" y2="${padTop + staffH}" stroke="#6366f1" stroke-width="1" stroke-dasharray="3,4" opacity="0.35"/>`);
                    } else {
                        out.push(`<line x1="${slotX}" y1="${padTop}" x2="${slotX}" y2="${padTop + staffH}" stroke="${CFG.C_BAR}" stroke-width="0.9" stroke-dasharray="4,3" opacity="0.5"/>`);
                    }
                }

                /* 편집 모드 ON일 때만: 코드 영역 파란 하이라이트 */
                if (editMode) {
                    const hlCol = isVirtual ? 'rgba(99,102,241,0.07)' : 'rgba(99,102,241,0.12)';
                    const hlBorderCol = isVirtual ? 'rgba(99,102,241,0.22)' : 'rgba(99,102,241,0.50)';
                    const chordAreaH = Math.round(CFG.PAD_TOP * scale * 0.78);
                    out.push(`<rect x="${slotX+1}" y="${padTop - chordAreaH}" width="${slotW-2}" height="${chordAreaH}" rx="4" fill="${hlCol}" stroke="${hlBorderCol}" stroke-width="1" stroke-dasharray="${isVirtual ? '4,3' : 'none'}"/>`);
                }

                /* 코드명 표시 */
                const chord    = slot.chord;
                const isManual = chord?._manual === true;
                const isSlash  = chord?.isSlash || (chord?.name && chord.name.includes('/'));

                if (this.showChords) {
                    const cname    = chord?.name || '';
                    const slashShrink = isSlash ? 0.90 : 1.0;
                    // 4칸 표시 시 폰트 조금 작게
                    const multiShrink = displaySlots.length > 2 ? 0.82 : (displaySlots.length > 1 ? 0.90 : 1.0);
                    const cfs      = Math.max(10, Math.round(CFG.FONT_CHORD * scale * multiShrink * slashShrink));
                    const ccolor   = isManual ? '#7c3aed' : (isSlash && !isActive ? '#0d9488' : (isActive ? CFG.C_ACTIVE : CFG.C_CHORD));

                    if (cname) {
                        const bgH = Math.round(cfs * 1.45);
                        const bgY = padTop - Math.round(cfs * 1.35) - Math.round(4*scale);
                        const bgW = Math.round(cfs * cname.length * 0.70 + 10);
                        if (isManual) {
                            out.push(`<rect x="${slotCx - Math.round(bgW/2)}" y="${bgY}" width="${bgW}" height="${bgH}" rx="4" fill="#ede9fe" opacity="0.9"/>`);
                        } else if (isSlash && !isActive) {
                            out.push(`<rect x="${slotCx - Math.round(bgW/2)}" y="${bgY}" width="${bgW}" height="${bgH}" rx="4" fill="#ccfbf1" opacity="0.85"/>`);
                        } else if (!isActive && editMode) {
                            // 편집 모드 ON일 때: 파란 배경
                            out.push(`<rect x="${slotCx - Math.round(bgW/2)}" y="${bgY}" width="${bgW}" height="${bgH}" rx="4" fill="#eef2ff" opacity="0.8"/>`);
                        }
                        // 편집 모드 OFF일 때: 배경 없음(흰 바탕 그대로)
                        const textY = bgY + Math.round(bgH * 0.78);
                        out.push(`<text x="${slotCx}" y="${textY}" font-family="'JetBrains Mono',monospace" font-size="${cfs}" font-weight="900" fill="${ccolor}" text-anchor="middle" data-chord="${cname}" data-bar="${globalBarIdx}" data-slot="${si}" class="chord-click" style="cursor:pointer;letter-spacing:-0.5px;">${cname}</text>`);
                    } else {
                        /* 빈 슬롯 — 편집 모드 ON일 때만 + 버튼 표시, OFF는 완전히 숨김 */
                        if (editMode) {
                            // + 버튼: 슬롯 너비에 맞게 충분히 크게
                            const btnPadX = Math.round(6 * scale);
                            const btnW2   = Math.max(28, slotW - btnPadX * 2);
                            const btnH2   = Math.round(cfs * 1.55);
                            const btnX2   = slotCx - Math.round(btnW2 / 2);
                            const btnY2   = padTop - btnH2 - Math.round(6 * scale);
                            const btnFs2  = Math.max(13, Math.round(15 * scale));
                            out.push(
                                `<rect x="${btnX2}" y="${btnY2}" width="${btnW2}" height="${btnH2}" rx="${Math.round(5*scale)}" fill="rgba(99,102,241,0.14)" stroke="#6366f1" stroke-width="1.4" stroke-dasharray="4,2"/>`,
                                `<text x="${slotCx}" y="${btnY2 + Math.round(btnH2 * 0.76)}" font-family="sans-serif" font-size="${btnFs2}" font-weight="800" fill="#4f46e5" text-anchor="middle" data-bar="${globalBarIdx}" data-slot="${si}" class="chord-click" style="cursor:pointer;">+</text>`
                            );
                        }
                        // OFF 모드: 아무것도 표시하지 않음 (흰 배경)
                    }

                    /* 슬롯이 2개 이상이면 박자 힌트 (실제 슬롯만, 가상 칸 제외) */
                    if (slots.length > 1 && !isVirtual) {
                        const beatHint = slot.beatLen === 1 ? '♩' : slot.beatLen === 2 ? '♩♩' : slot.beatLen === 3 ? '♩♩♩' : '♩♩♩♩';
                        out.push(`<text x="${slotCx}" y="${padTop - Math.round(4*scale)}" font-family="sans-serif" font-size="${Math.max(7, Math.round(8*scale))}" fill="#a0999a" text-anchor="middle" opacity="0.7">${beatHint}</text>`);
                    }
                }

                /* 노트 폼 배치 — 가상 칸(빈 슬롯)은 실제 데이터 없으면 스킵 */
                if (!isVirtual) {
                    const slotNote = this._getSlotNote(bar, slot, si);
                    if (slotNote && slotNote.strings?.some(s => s !== null && s !== undefined)) {
                        this._drawSVGNote(out, slotNote, slotCx, padTop, strH, scale, isActive, strings, isManual, isSlash);

                        if (si > 0 && displaySlots[si-1] && !displaySlots[si-1]._virtual) {
                            const prevSlot    = displaySlots[si-1];
                            const prevNote    = this._getSlotNote(bar, prevSlot, si-1);
                            if (prevNote?.strings) {
                                const prevSlotCx = bx + Math.round(barW * (prevSlot.beatOffset / totalBeats)) + Math.round(Math.round(barW * (prevSlot.beatLen / totalBeats)) / 2);
                                this._drawTechniqueArcs(out, prevNote.strings, slotNote.strings, prevSlotCx, slotCx, padTop, strH, scale, slotNote.techniques);
                            }
                        }
                    } else if (chord?.name) {
                        const restY = padTop + Math.round(staffH / 2);
                        out.push(`<text x="${slotCx}" y="${restY}" font-family="'JetBrains Mono',monospace" font-size="${Math.max(9,Math.round(10*scale))}" fill="${isManual ? '#7c3aed' : (isSlash ? '#0d9488' : CFG.C_BARNUM)}" text-anchor="middle" opacity="0.4">—</text>`);
                    }
                }
            }); // displaySlots.forEach end

            /* 오른쪽 마디선 — 락밴드 스타일: 마지막은 이중선 */
            const isLast = (bi === rowBars.length - 1);
            if (isLast) {
                // 행 끝 이중선
                out.push(`<line x1="${bx + barW - 3}" y1="${padTop}" x2="${bx + barW - 3}" y2="${padTop + staffH}" stroke="${CFG.C_BAR}" stroke-width="1.0" opacity="0.6"/>`);
                out.push(`<line x1="${bx + barW}" y1="${padTop}" x2="${bx + barW}" y2="${padTop + staffH}" stroke="${CFG.C_BAR}" stroke-width="2.5"/>`);
            } else {
                out.push(`<line x1="${bx + barW}" y1="${padTop}" x2="${bx + barW}" y2="${padTop + staffH}" stroke="${CFG.C_BAR}" stroke-width="1.6"/>`);
            }

            bx += barW;
        });

        out.push('</svg>');
        return `<div style="overflow:hidden;padding-bottom:4px;width:100%;box-sizing:border-box;" data-row="${rowOffset}">${out.join('')}</div>`;
    }

    /* ── bar에서 슬롯 배열 계산 (하위 호환 포함) ── */
    _resolveBarSlots(bar) {
        // v4.2 멀티슬롯: bar.chords 배열 사용
        if (bar.chords && bar.chords.length > 0) {
            const BEATS = 4;
            // beatLen을 기준으로 beatOffset을 누적 계산 (가장 정확한 방법)
            // bar.chords는 slotIndex 순으로 정렬되어 있음
            const sorted = [...bar.chords].sort((a,b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
            let accumulated = 0;
            return sorted.map(c => {
                const beatLen    = c.beatLen ?? (BEATS / sorted.length);
                const beatOffset = accumulated;
                accumulated += beatLen;
                return {
                    beatOffset,
                    beatLen,
                    chord    : c.chord,
                    slotIndex: c.slotIndex ?? 0,
                };
            });
        }
        // 하위호환: 단일 슬롯
        return [{ beatOffset:0, beatLen:4, chord: bar.chord, slotIndex:0 }];
    }

    /* ── 슬롯에 해당하는 노트 찾기 ── */
    _getSlotNote(bar, slot, slotIdx) {
        if (!bar.notes?.length) return null;
        const targetSlot = slot.slotIndex ?? slotIdx;
        // 1순위: slotIndex가 정확히 일치하는 노트
        const bySlot = bar.notes.find(n => (n.slotIndex ?? 0) === targetSlot);
        if (bySlot) return bySlot;
        // 2순위: 슬롯 0이면 첫 번째 non-rest 노트
        if (targetSlot === 0) return bar.notes.find(n => n.type !== 'rest') || bar.notes[0];
        // 3순위: 해당 슬롯의 chord와 같은 코드명을 가진 노트
        if (slot.chord?.name) {
            const byChord = bar.notes.find(n => n.chord?.name === slot.chord.name);
            if (byChord) return byChord;
        }
        return null;
    }

    /* ────────────────────────────────────────
       노트 SVG 그리기 — 표준 TAB 스타일
       프렛 번호: 각 줄에 배치, 기법 기호 표시
       기법 (technique) 기호:
         h  = 해머온  → 왼쪽 숫자 위로 호 + "h"
         p  = 풀오프  → 왼쪽 숫자 위로 호(점선) + "p"
         b  = 벤딩    → 숫자 위 화살표 + "b"
         /  = 슬라이드업 → 숫자 왼쪽 사선
         \  = 슬라이드다운
         ~  = 비브라토 → 숫자 오른쪽 물결선
         x  = 뮤트    → X 기호
    ──────────────────────────────────────── */
    _drawSVGNote(out, note, cx, padTop, strH, scale, isActive, strings, isManual = false, isSlash = false) {
        const CFG   = this.CFG;
        const frets = note.strings;
        const nStr  = strings.length;
        const techniques = note.techniques || {};  // {stringIdx: 'h'|'p'|'b'|'/'|'\'|'~'|'x'}

        // 색상 설정
        const color = isActive ? CFG.C_ACTIVE : (isManual ? '#5b21b6' : (isSlash ? '#0f766e' : CFG.C_FRET));
        const openC = isActive ? CFG.C_ACTIVE : (isManual ? '#7c3aed' : (isSlash ? '#0d9488' : CFG.C_OPEN));
        const bgCol = isManual ? '#f5f3ff' : (isSlash && !isActive ? '#f0fdfa' : CFG.C_BG);

        const fs    = Math.max(11, Math.round(CFG.FONT_FRET * scale));
        const bw1   = Math.round(CFG.BOX_W_1 * scale);
        const bw2   = Math.round(CFG.BOX_W_2 * scale);
        const bh    = Math.round(CFG.BOX_H   * scale);

        // 활성 마디 세로 재생 헤드 바
        if (isActive) {
            const activeFrets = frets.filter(f => f !== null && f !== undefined);
            if (activeFrets.length) {
                out.push(`<line x1="${cx}" y1="${padTop - Math.round(4*scale)}" x2="${cx}" y2="${padTop + nStr*strH + Math.round(4*scale)}" stroke="${CFG.C_ACTIVE}" stroke-width="${Math.max(2.0, scale*2.0)}" opacity="0.4"/>`);
            }
        }

        // 연속 코드 간 기법 연결선 (이전 코드와 슬라이드/해머 연결)
        const prevFrets = note.prevStrings || null;

        frets.forEach((fret, si) => {
            if (fret === null || fret === undefined) return;
            const y   = padTop + si * strH + Math.round(strH / 2);
            const tec = techniques[si] || '';   // 이 줄의 기법

            // X (뮤트/데드노트) 처리
            if (fret === 'x' || tec === 'x') {
                // 뮤트: 줄 위에 × 텍스트만 표시 (박스 없음)
                out.push(
                    `<text x="${cx}" y="${y + Math.round(5*scale)}" font-family="'JetBrains Mono',monospace" font-size="${fs}" font-weight="800" fill="${color}" text-anchor="middle">×</text>`
                );
                return;
            }

            const str = fret.toString();

            if (fret === 0) {
                // 개방현: 줄 위에 0 숫자만 표시 (박스 없음)
                out.push(
                    `<text x="${cx}" y="${y + Math.round(5*scale)}" font-family="'JetBrains Mono',monospace" font-size="${fs}" font-weight="800" fill="${openC}" text-anchor="middle">0</text>`
                );
            } else {
                // 프렛 번호: 박스 없이 숫자만 표시
                // 수동 편집/슬래시 코드는 색상으로만 구분
                out.push(
                    `<text x="${cx}" y="${y + Math.round(5*scale)}" font-family="'JetBrains Mono',monospace" font-size="${fs}" font-weight="800" fill="${color}" text-anchor="middle">${str}</text>`
                );
            }

            // ── 기법 기호 그리기 ──
            if (!tec) return;

            const techColor = isActive ? CFG.C_ACTIVE : '#555';
            const techFs    = Math.max(8, Math.round(10 * scale));
            const arcR      = Math.round(12 * scale);  // 호 반지름

            switch(tec) {
                case 'h':  // 해머온 — 숫자 왼쪽 위에 호 + "h"
                {
                    const ax = cx - bw;
                    const ay = y - Math.round(strH * 0.3);
                    out.push(
                        `<path d="M${ax},${y} Q${ax + arcR},${ay} ${cx - bw/2 - 2},${y}" fill="none" stroke="${techColor}" stroke-width="${Math.max(1.2, scale*1.2)}" stroke-linecap="round"/>`,
                        `<text x="${ax + arcR/2}" y="${ay - 2}" font-family="'JetBrains Mono',monospace" font-size="${techFs}" font-weight="700" fill="${techColor}" text-anchor="middle">h</text>`
                    );
                    break;
                }
                case 'p':  // 풀오프 — 점선 호 + "p"
                {
                    const ax = cx - bw;
                    const ay = y - Math.round(strH * 0.3);
                    out.push(
                        `<path d="M${ax},${y} Q${ax + arcR},${ay} ${cx - bw/2 - 2},${y}" fill="none" stroke="${techColor}" stroke-width="${Math.max(1.2, scale*1.2)}" stroke-dasharray="3,2" stroke-linecap="round"/>`,
                        `<text x="${ax + arcR/2}" y="${ay - 2}" font-family="'JetBrains Mono',monospace" font-size="${techFs}" font-weight="700" fill="${techColor}" text-anchor="middle">p</text>`
                    );
                    break;
                }
                case 'b':  // 벤딩 — 숫자 오른쪽 위로 화살표 + "b"
                {
                    const arrowX = cx + bw/2 + Math.round(4*scale);
                    const arrowY = y - Math.round(strH * 0.55);
                    out.push(
                        `<line x1="${arrowX}" y1="${y - bh/2}" x2="${arrowX + Math.round(6*scale)}" y2="${arrowY}" stroke="${techColor}" stroke-width="${Math.max(1.5, scale*1.5)}" stroke-linecap="round"/>`,
                        `<polygon points="${arrowX + Math.round(6*scale)},${arrowY - Math.round(5*scale)} ${arrowX + Math.round(3*scale)},${arrowY + Math.round(2*scale)} ${arrowX + Math.round(9*scale)},${arrowY + Math.round(2*scale)}" fill="${techColor}"/>`,
                        `<text x="${arrowX + Math.round(8*scale)}" y="${arrowY - Math.round(4*scale)}" font-family="'JetBrains Mono',monospace" font-size="${techFs}" font-weight="700" fill="${techColor}" text-anchor="start">b</text>`
                    );
                    break;
                }
                case '/':  // 슬라이드업 — 숫자 왼쪽 아래에서 위 사선
                {
                    const slashLen = Math.round(14 * scale);
                    out.push(
                        `<line x1="${cx - bw/2 - slashLen}" y1="${y + Math.round(strH*0.25)}" x2="${cx - bw/2 - 2}" y2="${y - Math.round(strH*0.25)}" stroke="${techColor}" stroke-width="${Math.max(1.4, scale*1.4)}" stroke-linecap="round"/>`
                    );
                    break;
                }
                case '\\': // 슬라이드다운 — 숫자 오른쪽 위에서 아래 사선
                {
                    const slashLen = Math.round(14 * scale);
                    out.push(
                        `<line x1="${cx + bw/2 + 2}" y1="${y - Math.round(strH*0.25)}" x2="${cx + bw/2 + slashLen}" y2="${y + Math.round(strH*0.25)}" stroke="${techColor}" stroke-width="${Math.max(1.4, scale*1.4)}" stroke-linecap="round"/>`
                    );
                    break;
                }
                case '~':  // 비브라토 — 숫자 오른쪽에 물결선
                {
                    const wvX  = cx + bw/2 + Math.round(3*scale);
                    const wvW  = Math.round(18 * scale);
                    const wvA  = Math.round(3  * scale);  // 진폭
                    const wvN  = 3;                        // 파형 수
                    const wvSeg= wvW / (wvN * 2);
                    let d = `M${wvX},${y}`;
                    for (let w = 0; w < wvN; w++) {
                        d += ` Q${wvX + wvSeg*(2*w+1) - wvSeg/2},${y - wvA} ${wvX + wvSeg*(2*w+1)},${y}`;
                        d += ` Q${wvX + wvSeg*(2*w+2) - wvSeg/2},${y + wvA} ${wvX + wvSeg*(2*w+2)},${y}`;
                    }
                    out.push(`<path d="${d}" fill="none" stroke="${techColor}" stroke-width="${Math.max(1.2, scale*1.2)}" stroke-linecap="round"/>`);
                    break;
                }
            }
        });
    }

    /* ────────────────────────────────────────
       슬롯 간 기법 연결호 그리기
       명시적으로 지정된 기법(h/p/slide)만 그림
       ⚠️ 자동 슬라이드 추론 제거 — 프렛 숫자 차이만으로 사선을 자동 그리지 않음
    ──────────────────────────────────────── */
    _drawTechniqueArcs(out, prevFrets, nextFrets, prevCx, nextCx, padTop, strH, scale, techniques) {
        if (!prevFrets || !nextFrets || !techniques) return;
        const bh  = Math.round(this.CFG.BOX_H * scale);

        prevFrets.forEach((pf, si) => {
            const tec = techniques?.[si] || '';
            if (!tec) return; // 명시적 기법이 없으면 아무것도 그리지 않음

            if (pf === null || pf === undefined) return;
            const nf = nextFrets[si];
            if (nf === null || nf === undefined) return;
            if (typeof pf !== 'number' || typeof nf !== 'number') return;

            const y    = padTop + si * strH + Math.round(strH / 2);
            const arcH = Math.round(strH * 0.5);
            const midX = (prevCx + nextCx) / 2;

            if (tec === 'h' || tec === 'p') {
                const dash  = tec === 'p' ? '4,3' : '';
                out.push(
                    `<path d="M${prevCx},${y} Q${midX},${y - arcH} ${nextCx},${y}" fill="none" stroke="#555" stroke-width="${Math.max(1.2, scale*1.2)}" ${dash ? `stroke-dasharray="${dash}"` : ''} stroke-linecap="round"/>`,
                    `<text x="${midX}" y="${y - arcH - 2}" font-family="'JetBrains Mono',monospace" font-size="${Math.max(8, Math.round(10*scale))}" font-weight="700" fill="#555" text-anchor="middle">${tec}</text>`
                );
            } else if (tec === '/') {
                out.push(`<line x1="${prevCx + this.CFG.BOX_W_1*scale/2}" y1="${y + bh*0.3}" x2="${nextCx - this.CFG.BOX_W_1*scale/2}" y2="${y - bh*0.3}" stroke="#444" stroke-width="${Math.max(1.4, scale*1.4)}" stroke-linecap="round"/>`);
            } else if (tec === '\\') {
                out.push(`<line x1="${prevCx + this.CFG.BOX_W_1*scale/2}" y1="${y - bh*0.3}" x2="${nextCx - this.CFG.BOX_W_1*scale/2}" y2="${y + bh*0.3}" stroke="#444" stroke-width="${Math.max(1.4, scale*1.4)}" stroke-linecap="round"/>`);
            }
        });
    }

    /* ────────────────────────────────────────
       활성 마디 SVG 하이라이트 (updatePlayheadOnly용)
    ──────────────────────────────────────── */
    _highlightActiveSVG(t) {
        const curBarIdx = this.getCurrentBarIndexByTime(t);
        const wrapper   = document.getElementById('tabSvgWrapper');
        if (!wrapper) return;

        /* 모든 마디 배경 초기화 */
        wrapper.querySelectorAll('[data-baractive]').forEach(el => {
            el.setAttribute('fill', 'transparent');
            el.setAttribute('stroke', 'transparent');
        });

        /* 코드명 색상 업데이트 */
        wrapper.querySelectorAll('text[data-chord]').forEach(el => {
            el.setAttribute('fill', this.CFG.C_CHORD);
        });
    }

    /* ════════════════════════════════════════
       파형 비주얼라이저 (기존 Canvas 방식 유지)
    ════════════════════════════════════════ */
    drawWaveform(canvas, waveformData, currentTime, duration) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const W   = canvas.offsetWidth  || 600;
        const H   = canvas.offsetHeight || 76;
        canvas.width  = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);

        ctx.fillStyle = '#f4f6fa';
        ctx.fillRect(0, 0, W, H);
        if (!waveformData?.length) return;

        const bw    = W / waveformData.length;
        const ratio = duration > 0 ? currentTime / duration : 0;
        const playX = ratio * W;

        waveformData.forEach((val, i) => {
            const bx = i * bw;
            const bh = Math.max(2, val * H * 0.88);
            const by = (H - bh) / 2;
            ctx.fillStyle = bx < playX ? '#e85d04' : '#d1d5e0';
            ctx.fillRect(bx + 0.5, by, Math.max(1, bw - 1), bh);
        });

        ctx.strokeStyle = '#e85d04';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(playX, 0);
        ctx.lineTo(playX, H);
        ctx.stroke();

        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0,    'rgba(244,246,250,0.35)');
        grad.addColorStop(0.45, 'rgba(244,246,250,0)');
        grad.addColorStop(0.55, 'rgba(244,246,250,0)');
        grad.addColorStop(1,    'rgba(244,246,250,0.35)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    /* ════════════════════════════════════════
       주파수 비주얼라이저
    ════════════════════════════════════════ */
    drawVisualizer(canvas, freqData) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const W   = canvas.offsetWidth  || 600;
        const H   = canvas.offsetHeight || 52;
        canvas.width  = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);

        ctx.fillStyle = '#f4f6fa';
        ctx.fillRect(0, 0, W, H);
        if (!freqData?.length) return;

        const count = Math.min(freqData.length, 120);
        const bw    = W / count;
        for (let i = 0; i < count; i++) {
            const val = freqData[i] / 255;
            const bh  = Math.max(2, val * H * 0.9);
            const r   = i / count;
            let red, grn, blu;
            if (r < 0.5) {
                red = Math.round(22  + (232 - 22)  * (r / 0.5));
                grn = Math.round(163 + (93  - 163) * (r / 0.5));
                blu = Math.round(74  + (4   - 74)  * (r / 0.5));
            } else {
                red = Math.round(232 + (192 - 232) * ((r - 0.5) / 0.5));
                grn = Math.round(93  + (0   - 93)  * ((r - 0.5) / 0.5));
                blu = 0;
            }
            ctx.fillStyle = `rgba(${red},${grn},${blu},0.7)`;
            ctx.fillRect(i * bw + 0.5, H - bh, Math.max(1, bw - 1), bh);
        }
    }

    /* ════════════════════════════════════════
       코드 다이어그램 (Canvas) — 세로형 표준 코드표
       기타를 정면으로 세웠을 때 보이는 방향:
         - 왼쪽 = 6번줄(E, 두꺼운)
         - 오른쪽 = 1번줄(e, 얇은)
         - 위 = 너트(1프렛)
         - 아래 = 높은 프렛
         - 개방○/뮤트× = 너트 위(상단)에 가로 배치
       strings 배열: [E(idx0,6번현), A(idx1), D(idx2), G(idx3), B(idx4), e(idx5,1번현)]
    ════════════════════════════════════════ */
    drawChordDiagram(canvas, chordData, chordName, isHighlight = false) {
        // 요청된 크기를 유지하되 내부 좌표는 스케일 적용
        const reqW = canvas.width  || 96;
        const reqH = canvas.height || 120;
        const BASE_W = 96, BASE_H = 120;
        const scale = Math.min(reqW / BASE_W, reqH / BASE_H);

        canvas.width  = reqW;
        canvas.height = reqH;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, reqW, reqH);
        ctx.fillStyle = isHighlight ? '#fff8f4' : '#fafbfd';
        ctx.fillRect(0, 0, reqW, reqH);

        // 스케일 적용해서 그리기
        ctx.save();
        const offX = (reqW - BASE_W * scale) / 2;
        const offY = (reqH - BASE_H * scale) / 2;
        ctx.translate(offX, offY);
        ctx.scale(scale, scale);

        this._drawChordDiagramCore(ctx, chordData, chordName, isHighlight, BASE_W, BASE_H);
        ctx.restore();
    }

    _drawChordDiagramCore(ctx, chordData, chordName, isHighlight, W, H) {

        if (!chordData) {
            ctx.font = 'bold 11px Inter, sans-serif';
            ctx.fillStyle = '#b0b8cc';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('—', W / 2, H / 2);
            return;
        }

        const { strings, barre, fingers } = chordData;
        const ns     = strings.length; // 6(기타) or 4(베이스)
        const nFrets = 5;

        // 레이아웃
        const padL = 10;
        const padR = 10;
        const padT = 32;  // 현이름(위) + 개방/뮤트 기호 공간
        const padB = 8;

        const gridW  = W - padL - padR;
        const gridH  = H - padT - padB;
        const strGap = gridW / (ns - 1);   // 현 간격
        const fretGap = gridH / nFrets;     // 프렛 간격

        // strings 배열: idx 0 = E(6번) → 왼쪽, idx ns-1 = e(1번) → 오른쪽
        const strNamesGuitar = ['E','A','D','G','B','e'];
        const strNamesBass   = ['E','A','D','G'];
        const strLabels = ns === 4 ? strNamesBass : strNamesGuitar;

        /* ── baseFret 계산 ── */
        let baseFret = 1;
        if (barre && barre.fret > 1) {
            baseFret = barre.fret;
        } else {
            const frettedNotes = strings.filter(f => f !== null && f > 0);
            if (frettedNotes.length) {
                const minF = Math.min(...frettedNotes);
                if (minF > 3) baseFret = minF;
            }
        }

        /* ── 현이름 레이블 (그리드 위, 개방/뮤트 기호 위) ── */
        ctx.save();
        ctx.font = `bold 7.5px "Inter", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < ns; i++) {
            const x = padL + i * strGap;
            ctx.fillStyle = i === 0 ? '#7a6040' : '#9298b0';
            ctx.fillText(strLabels[i], x, 8);
        }
        ctx.restore();

        /* ── 개방/뮤트 기호 (현이름 아래, 그리드 바로 위) ── */
        ctx.save();
        strings.forEach((fret, i) => {
            const x = padL + i * strGap;
            const oy = padT - 10;  // 너트 바로 위
            if (fret === null) {
                // × 뮤트
                ctx.strokeStyle = '#b0b8cc'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(x - 4, oy - 4); ctx.lineTo(x + 4, oy + 4); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x + 4, oy - 4); ctx.lineTo(x - 4, oy + 4); ctx.stroke();
            } else if (fret === 0) {
                // ○ 개방
                ctx.strokeStyle = isHighlight ? '#e85d04' : '#2a3a5a';
                ctx.lineWidth = 1.8;
                ctx.beginPath(); ctx.arc(x, oy, 4.5, 0, Math.PI * 2); ctx.stroke();
            }
        });
        ctx.restore();

        /* ── 너트 또는 프렛 번호 ── */
        ctx.save();
        if (baseFret === 1) {
            // 너트: 굵은 가로선
            ctx.fillStyle = isHighlight ? '#e85d04' : '#1e2a45';
            ctx.fillRect(padL - 1, padT - 3, gridW + 2, 4);
        } else {
            // 프렛 번호 표시
            ctx.font = 'bold 8px Inter, sans-serif';
            ctx.fillStyle = '#5a6070';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${baseFret}fr`, padL + gridW + 3, padT + fretGap * 0.5);
            // 얇은 너트선
            ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL + gridW, padT); ctx.stroke();
        }
        ctx.restore();

        /* ── 프렛 가로선 ── */
        ctx.save();
        ctx.strokeStyle = '#ccd0dc';
        ctx.lineWidth = 0.8;
        for (let f = 1; f <= nFrets; f++) {
            const fy = padT + f * fretGap;
            ctx.beginPath(); ctx.moveTo(padL, fy); ctx.lineTo(padL + gridW, fy); ctx.stroke();
        }
        ctx.restore();

        /* ── 현 세로선 (왼쪽=E,두꺼움 / 오른쪽=e,얇음) ── */
        ctx.save();
        for (let i = 0; i < ns; i++) {
            const x = padL + i * strGap;
            ctx.strokeStyle = '#9098b8';
            ctx.lineWidth = Math.max(0.5, 1.4 - i * (0.18));
            ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + gridH); ctx.stroke();
        }
        ctx.restore();

        /* ── 바레 바 ── */
        if (barre) {
            const relFret = barre.fret - baseFret + 1;
            if (relFret >= 1 && relFret <= nFrets) {
                const barY  = padT + (relFret - 0.5) * fretGap;
                const fromI = barre.from !== undefined ? barre.from : 0;
                const x1 = padL + fromI * strGap - 4;
                const x2 = padL + gridW + 4;
                ctx.save();
                ctx.fillStyle = isHighlight ? '#e85d04' : '#1e2a45';
                ctx.globalAlpha = 0.85;
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(x1, barY - 5.5, x2 - x1, 11, 5.5);
                else ctx.rect(x1, barY - 5.5, x2 - x1, 11);
                ctx.fill();
                ctx.globalAlpha = 1;
                // 바레 번호 (1)
                ctx.font = 'bold 6.5px Inter, sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('1', padL + fromI * strGap, barY);
                ctx.restore();
            }
        }

        /* ── 손가락 점 + 번호 ── */
        ctx.save();
        const fingerColors = isHighlight
            ? { 1:'#e85d04', 2:'#c44d00', 3:'#a03d00', 4:'#7c2e00' }
            : { 1:'#1e2a45', 2:'#243255', 3:'#1a2840', 4:'#1e3050' };

        strings.forEach((fret, i) => {
            if (fret === null || fret === 0) return;
            const relFret = fret - baseFret + 1;
            if (relFret < 1 || relFret > nFrets) return;
            const x  = padL + i * strGap;
            const fy = padT + (relFret - 0.5) * fretGap;
            const fn = fingers ? fingers[i] : null;

            // 이미 바레로 표시된 경우 점 생략 (바레와 같은 프렛/현 범위)
            const isBarred = barre &&
                (fret === barre.fret) &&
                (barre.from !== undefined ? i >= barre.from : true);
            if (isBarred) return;

            // 손가락 번호에 따른 색상
            const dotColor = (fn && fingerColors[fn]) ? fingerColors[fn] : (isHighlight ? '#e85d04' : '#1e2a45');
            ctx.fillStyle = dotColor;
            ctx.beginPath();
            ctx.arc(x, fy, 6, 0, Math.PI * 2);
            ctx.fill();

            // 손가락 번호 텍스트
            if (fn && fn >= 1 && fn <= 4) {
                ctx.font = 'bold 7px Inter, sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(fn), x, fy);
            }
        });
        ctx.restore();
    }
}

window.TabRenderer = TabRenderer;
