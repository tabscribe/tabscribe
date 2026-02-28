/**
 * CodeDuck - 공통 헤더 Auth 버튼 관리 (auth-header.js)
 * 모든 페이지에서 Supabase JS + auth.js 로드 후 이 파일을 include하세요.
 *
 * 헤더 HTML에 반드시 아래 요소가 있어야 합니다:
 *   id="headerLoginBtn"   — 비로그인 시 표시
 *   id="headerProfileBtn" — 로그인 시 표시 (프로필 링크)
 *   id="headerNickname"   — 닉네임 표시 span
 *   id="headerLogoutBtn"  — 로그아웃 버튼
 *   id="mobileLoginBtn"   — 모바일 메뉴 로그인 링크
 *   id="mobileLogoutBtn"  — 모바일 메뉴 로그아웃 버튼
 */

(async function initHeaderAuth() {
  // Supabase 준비 대기 (CDN 로딩 타이밍)
  let tries = 0;
  while (typeof supabase === 'undefined' && tries++ < 20) {
    await new Promise(r => setTimeout(r, 100));
  }

  const session = await getSession();
  let profile = null;
  if (session) {
    profile = await getProfile(session.user.id);
  }

  renderHeaderAuth(session, profile);
})();

function renderHeaderAuth(session, profile) {
  const loginBtn    = document.getElementById('headerLoginBtn');
  const profileBtn  = document.getElementById('headerProfileBtn');
  const logoutBtn   = document.getElementById('headerLogoutBtn');
  const nickSpan    = document.getElementById('headerNickname');
  const mobileLogin = document.getElementById('mobileLoginBtn');
  const mobileLogout= document.getElementById('mobileLogoutBtn');

  if (session) {
    const nick = profile?.nickname || session.user.email.split('@')[0];
    if (loginBtn)    { loginBtn.style.display    = 'none'; }
    if (profileBtn)  { profileBtn.style.display  = 'inline-flex'; }
    if (logoutBtn)   { logoutBtn.style.display   = 'inline-flex'; }
    if (nickSpan)    { nickSpan.textContent       = nick; }
    if (mobileLogin) { mobileLogin.style.display  = 'none'; }
    if (mobileLogout){ mobileLogout.style.display = 'block'; }
  } else {
    if (loginBtn)    { loginBtn.style.display    = 'inline-flex'; }
    if (profileBtn)  { profileBtn.style.display  = 'none'; }
    if (logoutBtn)   { logoutBtn.style.display   = 'none'; }
    if (mobileLogin) { mobileLogin.style.display  = 'block'; }
    if (mobileLogout){ mobileLogout.style.display = 'none'; }
  }
}

/** 로그아웃 — 모든 페이지에서 headerLogoutBtn onclick="authLogout()" */
async function authLogout() {
  await signOut();
  location.href = 'index.html';
}

/**
 * 로그인 가드 — 비로그인 시 오버레이를 표시하고 true 반환
 * 페이지 기능 버튼에 걸어두세요.
 * 사용법: if (await requireLogin()) return;
 */
async function requireLogin(redirectPage) {
  const session = await getSession();
  if (session) return false; // 로그인됨 → 통과

  // 비로그인 → 오버레이 표시
  showLoginOverlay(redirectPage || location.pathname.split('/').pop() || 'index.html');
  return true;
}

/** 로그인 유도 오버레이 (페이지 위에 띄움) */
function showLoginOverlay(redirectPage) {
  if (document.getElementById('_authOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = '_authOverlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9000;
    background: rgba(15,15,25,.72);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
    backdrop-filter: blur(4px);
    animation: _fadeIn .25s ease;
  `;

  overlay.innerHTML = `
    <style>
      @keyframes _fadeIn { from { opacity:0 } to { opacity:1 } }
      @keyframes _slideUp { from { transform:translateY(30px);opacity:0 } to { transform:translateY(0);opacity:1 } }
      #_authCard {
        background: #fff; border-radius: 18px;
        padding: 36px 32px; max-width: 360px; width: 100%;
        text-align: center;
        box-shadow: 0 16px 48px rgba(0,0,0,.28);
        animation: _slideUp .3s ease;
      }
      #_authCard .ov-icon  { font-size: 3rem; margin-bottom: 14px; }
      #_authCard .ov-title { font-size: 1.25rem; font-weight: 900; margin-bottom: 8px; color:#1a1a2e; letter-spacing:-.5px; }
      #_authCard .ov-desc  { font-size: .88rem; color: #6b7280; line-height: 1.7; margin-bottom: 24px; }
      #_authCard .ov-desc strong { color: #e85d04; }
      #_authCard .ov-btn-login {
        display: block; width: 100%; padding: 13px;
        background: #e85d04; color: #fff;
        border: none; border-radius: 11px;
        font-size: .97rem; font-weight: 700; font-family: inherit;
        cursor: pointer; text-decoration: none;
        margin-bottom: 10px; transition: background .18s;
      }
      #_authCard .ov-btn-login:hover { background: #c24e03; }
      #_authCard .ov-btn-signup {
        display: block; width: 100%; padding: 12px;
        background: #fff7f0; color: #e85d04;
        border: 1.5px solid #fdba74; border-radius: 11px;
        font-size: .9rem; font-weight: 700; font-family: inherit;
        cursor: pointer; text-decoration: none;
        margin-bottom: 10px; transition: background .18s;
      }
      #_authCard .ov-btn-signup:hover { background: #fff0e0; }
      #_authCard .ov-btn-close {
        background: none; border: none; font-size: .83rem;
        color: #9ca3af; cursor: pointer; margin-top: 4px;
        font-family: inherit; text-decoration: underline;
      }
      #_authCard .ov-btn-close:hover { color: #6b7280; }
    </style>
    <div id="_authCard">
      <div class="ov-icon">🔒</div>
      <div class="ov-title">로그인이 필요해요</div>
      <p class="ov-desc">
        이 기능은 <strong>코드덕쿠 회원</strong>만<br>
        사용할 수 있어요.<br>
        로그인하고 모든 기능을 이용해보세요!
      </p>
      <a href="login.html?redirect=${encodeURIComponent(redirectPage)}" class="ov-btn-login">
        🦆 로그인하기
      </a>
      <a href="signup.html" class="ov-btn-signup">
        ✍️ 무료 회원가입
      </a>
      <button class="ov-btn-close" onclick="document.getElementById('_authOverlay').remove()">
        괜찮아요, 나중에 할게요
      </button>
    </div>
  `;

  document.body.appendChild(overlay);
  // 오버레이 바깥 클릭 시 닫기
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}
