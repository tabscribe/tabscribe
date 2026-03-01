/**
 * CodeDuck - Supabase Auth 헬퍼 (auth.js)
 * Supabase JS v2 CDN 버전 사용
 */

if (typeof SUPABASE_URL === 'undefined') var SUPABASE_URL  = 'https://aubagaamktdmtvfabcbd.supabase.co';
if (typeof SUPABASE_ANON === 'undefined') var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1YmFnYWFta3RkbXR2ZmFiY2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTc5NDksImV4cCI6MjA4Nzc3Mzk0OX0.XoKiaw8nCJc1Hq9OjiURrGi_ZA-6sU4xhqqpDGcC2IM';

// Supabase 클라이언트 초기화 (supabase-js v2 CDN 로드 후 사용)
let _supabase = null;
function getClient() {
  if (!_supabase) {
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      console.error('[Auth] supabase-js CDN이 로드되지 않았습니다.');
      return null;
    }
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  }
  return _supabase;
}

// ───────────────────────────────────────────────
// 회원가입
// ───────────────────────────────────────────────
async function signUp({ email, password, nickname, gender, parts, career }) {
  const sb = getClient();
  if (!sb) return { error: { message: 'Supabase 초기화 실패' } };

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { nickname, gender, parts, career: career || null },
      // 이메일 인증 후 돌아올 URL (배포 후 실제 도메인으로 변경)
      emailRedirectTo: `${location.origin}/login.html?verified=1`
    }
  });
  return { data, error };
}

// ───────────────────────────────────────────────
// 로그인
// ───────────────────────────────────────────────
async function signIn({ email, password }) {
  const sb = getClient();
  if (!sb) return { error: { message: 'Supabase 초기화 실패' } };

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  return { data, error };
}

// ───────────────────────────────────────────────
// 로그아웃
// ───────────────────────────────────────────────
async function signOut() {
  const sb = getClient();
  if (!sb) return;
  await sb.auth.signOut();
}

// ───────────────────────────────────────────────
// 현재 세션/유저 가져오기
// ───────────────────────────────────────────────
async function getSession() {
  const sb = getClient();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data?.session ?? null;
}

async function getCurrentUser() {
  const sb = getClient();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data?.user ?? null;
}

// ───────────────────────────────────────────────
// profiles 테이블에서 프로필 조회
// ───────────────────────────────────────────────
async function getProfile(userId) {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) { console.warn('[Auth] getProfile error:', error.message); return null; }
  return data;
}

// ───────────────────────────────────────────────
// 인증 상태 변경 리스너
// ───────────────────────────────────────────────
function onAuthChange(callback) {
  const sb = getClient();
  if (!sb) return;
  sb.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

// ───────────────────────────────────────────────
// 헤더 UI 업데이트 (모든 페이지 공통)
// ───────────────────────────────────────────────
async function updateHeaderAuth() {
  const session = await getSession();
  const loginBtn   = document.getElementById('headerLoginBtn');
  const profileBtn = document.getElementById('headerProfileBtn');
  const logoutBtn  = document.getElementById('headerLogoutBtn');
  const nickSpan   = document.getElementById('headerNickname');

  if (session) {
    const profile = await getProfile(session.user.id);
    const nick = profile?.nickname || session.user.email.split('@')[0];
    if (loginBtn)   loginBtn.style.display   = 'none';
    if (profileBtn) profileBtn.style.display = 'inline-flex';
    if (logoutBtn)  logoutBtn.style.display  = 'inline-flex';
    if (nickSpan)   nickSpan.textContent      = nick;
  } else {
    if (loginBtn)   loginBtn.style.display   = 'inline-flex';
    if (profileBtn) profileBtn.style.display = 'none';
    if (logoutBtn)  logoutBtn.style.display  = 'none';
  }
}

// 파트 한글 변환 맵
const PART_LABELS = {
  vocal:      '보컬',
  guitar:     '기타',
  bass:       '베이스',
  keyboard:   '키보드',
  drums:      '드럼',
  dj:         'DJ',
  violin:     '바이올린',
  cello:      '첼로',
  flute:      '플루트',
  other:      '기타(기타)',
};

// 경력 한글 변환 맵
const CAREER_LABELS = {
  beginner:     '입문 (1년 미만)',
  junior:       '초급 (1~3년)',
  intermediate: '중급 (3~5년)',
  senior:       '고급 (5~10년)',
  expert:       '전문가 (10년 이상)',
};
