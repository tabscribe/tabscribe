/* ══════════════════════════════════════════
   코드덕쿠 문의하기 팝업 (EmailJS 연동)
   ══════════════════════════════════════════ */

(function () {
    /* ── EmailJS 설정 ── */
    const EMAILJS_SERVICE_ID  = 'service_habo0yr';
    const EMAILJS_TEMPLATE_ID = 'template_rqmdcr8';
    const EMAILJS_PUBLIC_KEY  = 'Kfl4o2etwOXsD3hNS';

    /* ── 문의 유형 정의 ── */
    const INQUIRY_TYPES = [
        { key: 'ad',  label: '광고문의',    icon: '📢', prefix: '[광고문의]' },
        { key: 'reg', label: '업체등록',    icon: '🏪', prefix: '[업체등록]' },
        { key: 'bug', label: '버그신고',    icon: '🐛', prefix: '[버그신고]' },
    ];

    /* ── 팝업 HTML 삽입 ── */
    function insertPopupHTML() {
        const html = `
        <!-- 문의 팝업 오버레이 -->
        <div class="inquiry-overlay" id="inquiryOverlay">
            <div class="inquiry-popup" id="inquiryPopup" role="dialog" aria-modal="true" aria-labelledby="inquiryTitle">

                <!-- 헤더 -->
                <div class="inquiry-popup-head">
                    <div class="inquiry-popup-title" id="inquiryTitle">
                        <span>✉️ 문의하기</span>
                        <span class="inquiry-type-badge" id="inquiryTypeBadge">유형 선택</span>
                    </div>
                    <button class="inquiry-close-btn" id="inquiryCloseBtn" aria-label="닫기">✕</button>
                </div>

                <!-- 전송 폼 -->
                <div id="inquiryFormArea">
                    <div class="inquiry-popup-body">

                        <!-- 문의 유형 탭 -->
                        <div>
                            <div class="inquiry-label" style="margin-bottom:8px;">
                                문의 유형 선택 <span class="required-mark">*</span>
                            </div>
                            <div class="inquiry-type-tabs" id="inquiryTypeTabs">
                                ${INQUIRY_TYPES.map(t => `
                                <button type="button"
                                    class="inquiry-type-tab"
                                    data-key="${t.key}"
                                    data-label="${t.label}"
                                    data-prefix="${t.prefix}">
                                    <span class="tab-icon">${t.icon}</span>
                                    <span>${t.label}</span>
                                </button>`).join('')}
                            </div>
                        </div>

                        <!-- 제목 -->
                        <div class="inquiry-field">
                            <label class="inquiry-label" for="inquirySubject">
                                제목 <span class="required-mark">*</span>
                            </label>
                            <input type="text" id="inquirySubject" class="inquiry-input"
                                placeholder="문의 제목을 입력해주세요" maxlength="80" required>
                        </div>

                        <!-- 내용 -->
                        <div class="inquiry-field">
                            <label class="inquiry-label" for="inquiryMessage">
                                내용 <span class="required-mark">*</span>
                            </label>
                            <textarea id="inquiryMessage" class="inquiry-textarea"
                                placeholder="문의 내용을 자세히 작성해주세요" required></textarea>
                        </div>

                        <!-- 이메일 (필수) -->
                        <div class="inquiry-field">
                            <label class="inquiry-label" for="inquiryEmail">
                                이메일 <span class="required-mark">*</span>
                                <span style="color:#9ca3af;font-size:.68rem;font-weight:500;">(답변 수신용 · 필수)</span>
                            </label>
                            <input type="email" id="inquiryEmail" class="inquiry-input"
                                placeholder="example@email.com" required>
                        </div>

                        <!-- 전화번호 (선택) -->
                        <div class="inquiry-field">
                            <label class="inquiry-label" for="inquiryPhone">
                                전화번호 <span class="optional-mark">(선택)</span>
                            </label>
                            <input type="tel" id="inquiryPhone" class="inquiry-input"
                                placeholder="010-0000-0000">
                        </div>

                    </div>

                    <!-- 푸터 -->
                    <div class="inquiry-popup-foot">
                        <button type="button" class="inquiry-cancel-btn" id="inquiryCancelBtn">취소</button>
                        <button type="button" class="inquiry-submit-btn" id="inquirySubmitBtn">
                            <i class="fas fa-paper-plane"></i> 보내기
                        </button>
                    </div>
                </div>

                <!-- 전송 완료 -->
                <div class="inquiry-success" id="inquirySuccess">
                    <div class="inquiry-success-icon">✅</div>
                    <div class="inquiry-success-title">문의가 전송됐습니다!</div>
                    <div class="inquiry-success-desc">
                        빠른 시간 안에 입력하신 이메일로 답변 드리겠습니다.<br>
                        코드덕쿠를 이용해주셔서 감사합니다 🎸
                    </div>
                    <button type="button" class="inquiry-submit-btn" id="inquiryDoneBtn"
                        style="width:100%;max-width:200px;margin-top:8px;">
                        확인
                    </button>
                </div>

            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
    }

    /* ── 헤더 버튼 그룹 삽입 (PC 상단 바) ── */
    function insertHeaderButtons() {
        const topRow = document.querySelector('.header-top-row');
        if (!topRow) return;

        // 이미 삽입된 경우 중복 방지
        if (document.getElementById('navInquiryGroup')) return;

        // 로그인 박스와 햄버거 사이에 삽입
        const loginBox = topRow.querySelector('.header-login-box');
        if (!loginBox) return;

        const groupHTML = `
        <div class="nav-inquiry-group" id="navInquiryGroup">
            ${INQUIRY_TYPES.map(t => `
            <button type="button"
                class="nav-inquiry-btn"
                data-key="${t.key}"
                data-label="${t.label}"
                data-prefix="${t.prefix}">
                ${t.icon} ${t.label}
            </button>`).join('')}
        </div>`;

        loginBox.insertAdjacentHTML('beforebegin', groupHTML);
    }

    /* ── 모바일 메뉴에 문의 버튼 삽입 ── */
    function insertMobileInquiryButtons() {
        const mobileMenu = document.getElementById('mobileMenu');
        if (!mobileMenu) return;

        // 이미 삽입된 경우 중복 방지
        if (document.getElementById('mobileInquirySection')) return;

        const mobileHTML = `
        <div id="mobileInquirySection" style="border-top:1px solid #e5e7eb;margin:4px 0 0;">
            <div style="padding:5px 12px 3px;font-size:.68rem;font-weight:800;color:#a21caf;letter-spacing:.04em;">📬 문의하기</div>
            ${INQUIRY_TYPES.map(t => `
            <button type="button"
                class="mobile-menu-item mobile-inquiry-btn"
                data-key="${t.key}"
                data-label="${t.label}"
                data-prefix="${t.prefix}"
                style="background:none;border:none;width:100%;text-align:left;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:10px;padding:9px 16px;font-size:.88rem;font-weight:600;color:#374151;transition:background .12s;"
                onmouseover="this.style.background='#fdf4ff'"
                onmouseout="this.style.background='none'">
                <span style="font-size:1.1rem;width:20px;text-align:center;">${t.icon}</span>
                ${t.label}
            </button>`).join('')}
        </div>`;

        // 로그인 버튼 섹션 바로 앞에 삽입
        const loginSection = mobileMenu.querySelector('div[style*="border-top"]');
        if (loginSection) {
            loginSection.insertAdjacentHTML('beforebegin', mobileHTML);
        } else {
            mobileMenu.insertAdjacentHTML('beforeend', mobileHTML);
        }
    }

    /* ── 상태 ── */
    let selectedType = null;

    /* ── 팝업 열기 ── */
    function openInquiry(key) {
        const overlay = document.getElementById('inquiryOverlay');
        if (!overlay) return;

        // 폼 초기화
        resetForm();

        // 유형 미리 선택 (버튼에서 호출 시)
        if (key) selectType(key);

        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';

        // 첫 입력 포커스
        setTimeout(() => {
            const first = overlay.querySelector('.inquiry-type-tab');
            if (first) first.focus();
        }, 100);
    }

    /* ── 팝업 닫기 ── */
    function closeInquiry() {
        const overlay = document.getElementById('inquiryOverlay');
        if (!overlay) return;
        overlay.classList.remove('open');
        document.body.style.overflow = '';
        resetForm();
    }

    /* ── 폼 초기화 ── */
    function resetForm() {
        selectedType = null;
        document.getElementById('inquiryTypeBadge').textContent = '유형 선택';
        document.querySelectorAll('.inquiry-type-tab').forEach(b => b.classList.remove('active'));
        document.getElementById('inquirySubject').value = '';
        document.getElementById('inquiryMessage').value = '';
        document.getElementById('inquiryEmail').value = '';
        document.getElementById('inquiryPhone').value = '';
        document.getElementById('inquiryFormArea').style.display = '';
        document.getElementById('inquirySuccess').classList.remove('show');
    }

    /* ── 유형 선택 ── */
    function selectType(key) {
        const type = INQUIRY_TYPES.find(t => t.key === key);
        if (!type) return;
        selectedType = type;

        // 탭 활성화
        document.querySelectorAll('.inquiry-type-tab').forEach(b => {
            b.classList.toggle('active', b.dataset.key === key);
        });

        // 배지 업데이트
        const badge = document.getElementById('inquiryTypeBadge');
        badge.textContent = type.icon + ' ' + type.label;
        badge.style.background = '#a21caf';
    }

    /* ── 유효성 검사 ── */
    function validate() {
        if (!selectedType) {
            showToast('문의 유형을 선택해주세요.', 'warn');
            return false;
        }
        const subject = document.getElementById('inquirySubject').value.trim();
        if (!subject) {
            document.getElementById('inquirySubject').focus();
            showToast('제목을 입력해주세요.', 'warn');
            return false;
        }
        const message = document.getElementById('inquiryMessage').value.trim();
        if (!message) {
            document.getElementById('inquiryMessage').focus();
            showToast('내용을 입력해주세요.', 'warn');
            return false;
        }
        const email = document.getElementById('inquiryEmail').value.trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            document.getElementById('inquiryEmail').focus();
            showToast('올바른 이메일 주소를 입력해주세요.', 'warn');
            return false;
        }
        return true;
    }

    /* ── 전송 ── */
    async function submitInquiry() {
        if (!validate()) return;

        const btn = document.getElementById('inquirySubmitBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 전송 중...';

        const subject = document.getElementById('inquirySubject').value.trim();
        const message = document.getElementById('inquiryMessage').value.trim();
        const email   = document.getElementById('inquiryEmail').value.trim();
        const phone   = document.getElementById('inquiryPhone').value.trim();

        // 메일 제목: [업체등록] 사용자가 입력한 제목
        const mailSubject = `${selectedType.prefix} ${subject}`;

        const templateParams = {
            subject:      mailSubject,
            from_name:    email,         // 발신자 표시
            from_email:   email,
            phone:        phone || '미입력',
            message:      message,
            inquiry_type: selectedType.label,
        };

        try {
            if (typeof emailjs === 'undefined') {
                throw new Error('EmailJS 로드 실패');
            }
            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);

            // 성공
            document.getElementById('inquiryFormArea').style.display = 'none';
            document.getElementById('inquirySuccess').classList.add('show');

        } catch (err) {
            console.error('문의 전송 실패:', err);
            showToast('전송에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> 보내기';
        }
    }

    /* ── 토스트 메시지 ── */
    function showToast(msg, type = 'info') {
        const colors = {
            warn:  { bg:'#fef3c7', border:'#fde68a', text:'#92400e' },
            error: { bg:'#fee2e2', border:'#fca5a5', text:'#991b1b' },
            info:  { bg:'#ede9fe', border:'#c4b5fd', text:'#5b21b6' },
        };
        const c = colors[type] || colors.info;
        const el = document.createElement('div');
        el.style.cssText = `
            position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
            background:${c.bg}; border:1.5px solid ${c.border}; color:${c.text};
            padding:10px 20px; border-radius:10px; font-size:.84rem; font-weight:700;
            z-index:9999; box-shadow:0 4px 16px rgba(0,0,0,.12);
            animation: inquirySlideUp .2s ease;
            white-space: nowrap;
        `;
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2800);
    }

    /* ── 이벤트 바인딩 ── */
    function bindEvents() {
        // 헤더 버튼 클릭 → 팝업 열기 + 유형 선택
        document.addEventListener('click', function(e) {
            const btn = e.target.closest('.nav-inquiry-btn');
            if (btn) {
                openInquiry(btn.dataset.key);
                return;
            }

            // 모바일 문의 버튼 클릭
            const mobileBtn = e.target.closest('.mobile-inquiry-btn');
            if (mobileBtn) {
                // 모바일 메뉴 닫기
                const mobileMenu = document.getElementById('mobileMenu');
                if (mobileMenu) mobileMenu.classList.remove('open');
                const hamburger = document.getElementById('hamburgerBtn');
                if (hamburger) hamburger.classList.remove('open');
                document.body.style.overflow = '';

                openInquiry(mobileBtn.dataset.key);
                return;
            }

            // 유형 탭 선택
            const tab = e.target.closest('.inquiry-type-tab');
            if (tab) {
                selectType(tab.dataset.key);
                return;
            }

            // 닫기 버튼
            if (e.target.closest('#inquiryCloseBtn') || e.target.closest('#inquiryCancelBtn')) {
                closeInquiry();
                return;
            }

            // 오버레이 외부 클릭
            const overlay = document.getElementById('inquiryOverlay');
            if (overlay && e.target === overlay) {
                closeInquiry();
                return;
            }

            // 전송 버튼
            if (e.target.closest('#inquirySubmitBtn')) {
                submitInquiry();
                return;
            }

            // 완료 확인 버튼
            if (e.target.closest('#inquiryDoneBtn')) {
                closeInquiry();
                return;
            }
        });

        // ESC 키로 닫기
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeInquiry();
        });
    }

    /* ── 초기화 ── */
    function init() {
        // EmailJS 초기화
        if (typeof emailjs !== 'undefined') {
            emailjs.init(EMAILJS_PUBLIC_KEY);
        } else {
            // SDK 로드 후 초기화
            window.addEventListener('load', function() {
                if (typeof emailjs !== 'undefined') {
                    emailjs.init(EMAILJS_PUBLIC_KEY);
                }
            });
        }

        insertPopupHTML();
        insertHeaderButtons();
        insertMobileInquiryButtons();
        bindEvents();
    }

    // DOM 준비 후 실행
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
