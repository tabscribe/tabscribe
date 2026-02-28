/**
 * rating.js — 쿠슐랭 가이드 v4 (Optimized)
 * 코드덕쿠 공식 음악 업체 평가 시스템
 * 최적화: 중복 렌더링 방지, debounce, DOM 최소 조작
 */

/* ── 페이지별 평가 항목 설정 ── */
const RATING_CONFIG = {
  rehearsal: {
    emoji: '🥁',
    title: '합주실',
    label1: '사운드 퀄리티',
    label2: '시설 청결도',
    icon1: 'fas fa-volume-up',
    icon2: 'fas fa-broom',
    color: '#0369a1',
    colorLt: '#eff6ff',
    colorBd: '#bfdbfe',
    tip1: '방음, 음향장비, 모니터 사운드 느낌은?',
    tip2: '청결함, 냄새, 악기 관리 상태는?',
  },
  repair: {
    emoji: '🔧',
    title: '리페어샵',
    label1: '수리 실력',
    label2: '가성비',
    icon1: 'fas fa-tools',
    icon2: 'fas fa-coins',
    color: '#7c3aed',
    colorLt: '#f5f3ff',
    colorBd: '#ddd6fe',
    tip1: '수리 결과물, 기술 숙련도는 어땠나요?',
    tip2: '수리비 대비 만족도, 가격 합리성은?',
  },
  instrument: {
    emoji: '🎸',
    title: '악기샵',
    label1: '상품 다양성',
    label2: '직원 친절도',
    icon1: 'fas fa-guitar',
    icon2: 'fas fa-smile',
    color: '#0f766e',
    colorLt: '#f0fdfa',
    colorBd: '#99f6e4',
    tip1: '취급 악기·장비 종류가 다양한가요?',
    tip2: '직원의 전문 지식, 응대 서비스는?',
  },
  academy: {
    emoji: '🎓',
    title: '음악학원',
    label1: '강사 실력',
    label2: '커리큘럼',
    icon1: 'fas fa-user-tie',
    icon2: 'fas fa-graduation-cap',
    color: '#7c3aed',
    colorLt: '#f5f3ff',
    colorBd: '#ddd6fe',
    tip1: '강사의 실력, 설명력, 친절함은?',
    tip2: '수업 내용, 진도, 교재 구성은?',
  },
  venue: {
    emoji: '🎭',
    title: '공연장',
    label1: '공연장 분위기',
    label2: '음향·조명',
    icon1: 'fas fa-theater-masks',
    icon2: 'fas fa-lightbulb',
    color: '#b45309',
    colorLt: '#fffbeb',
    colorBd: '#fde68a',
    tip1: '공간 분위기, 인테리어, 관람 환경은?',
    tip2: '음향 시스템, 조명 연출 수준은?',
  },
};

const STAR_LABELS = ['', '😢 별로예요', '😕 그저 그래요', '😐 보통이에요', '😊 좋아요!', '🤩 완전 최고!'];

/* ── 현재 로그인 유저 정보 가져오기 ──
   auth-header.js가 비동기로 세션 확인 후 window.currentUser에 저장합니다 */
function getCurrentUser() {
  return window.currentUser || null;
}

function isLoggedIn() {
  return !!getCurrentUser();
}

function getCurrentUserId() {
  const u = getCurrentUser();
  return u ? (u.id || u.email) : null;
}

function getAnonId() {
  let id = localStorage.getItem('cdku_anon_id');
  if (!id) { id = 'anon_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('cdku_anon_id', id); }
  return id;
}

function makePlaceId(page, name) {
  return page + '_' + name.replace(/\s+/g, '_').slice(0, 30);
}

/* ── 데바운스: 연속 호출 모으기 ── */
function debounce(fn, ms) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

/* ── Supabase 접속 정보 (auth.js와 동일) ── */
const _SB_URL = 'https://aubagaamktdmtvfabcbd.supabase.co';
const _SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1YmFnYWFta3RkbXR2ZmFiY2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTc5NDksImV4cCI6MjA4Nzc3Mzk0OX0.XoKiaw8nCJc1Hq9OjiURrGi_ZA-6sU4xhqqpDGcC2IM';
const _SB_HDR = {
  'Content-Type':  'application/json',
  'apikey':        _SB_KEY,
  'Authorization': 'Bearer ' + _SB_KEY,
  'Prefer':        'return=representation',
};

async function fetchRatings(page) {
  try {
    const url = `${_SB_URL}/rest/v1/ratings?page=eq.${encodeURIComponent(page)}&limit=1000&order=created_at.asc`;
    const res = await fetch(url, { headers: _SB_HDR });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function submitRating(payload) {
  /* id·타임스탬프 자동 생성 */
  const body = {
    ...payload,
    id: crypto.randomUUID ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        }),
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  const res = await fetch(`${_SB_URL}/rest/v1/ratings`, {
    method:  'POST',
    headers: _SB_HDR,
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => String(res.status));
    let msg = '평가 저장 실패 (' + res.status + ')';
    try {
      const errJson = JSON.parse(errText);
      if (errJson.code === '23505') msg = '이미 이 장소에 평가하셨어요. 기존 평가를 삭제 후 다시 평가해주세요.';
      else if (errJson.message) msg = errJson.message;
    } catch(_) { msg += ': ' + errText; }
    throw new Error(msg);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function deleteRating(id) {
  const res = await fetch(`${_SB_URL}/rest/v1/ratings?id=eq.${id}`, {
    method:  'DELETE',
    headers: _SB_HDR,
  });
  if (!res.ok) {
    throw new Error('deleteRating failed: ' + res.status);
  }
  return true;
}

/* 현재 유저가 해당 place에 남긴 평가 찾기 */
function findMyRating(page, placeId) {
  const uid = getCurrentUserId();
  if (!uid || !window._allRatings) return null;
  return window._allRatings.find(r => r.page === page && r.place_id === placeId && r.user_id === uid) || null;
}

function aggregateRatings(ratings) {
  const map = {};
  for (const r of ratings) {
    if (!map[r.place_id]) map[r.place_id] = { place_id: r.place_id, place_name: r.place_name, sum1: 0, sum2: 0, cnt: 0 };
    map[r.place_id].sum1 += Number(r.score1) || 0;
    map[r.place_id].sum2 += Number(r.score2) || 0;
    map[r.place_id].cnt++;
  }
  return Object.values(map).map(v => ({
    ...v,
    avg1: v.sum1 / v.cnt,
    avg2: v.sum2 / v.cnt,
    avgTotal: (v.sum1 + v.sum2) / (v.cnt * 2),
  }));
}

/* renderStars: 간단 캐시 (val×size 조합별) */
const _starCache = new Map();
function renderStars(val, size) {
  const sz = size || '1rem';
  const rounded = Math.round(val);
  const key = rounded + '|' + sz;
  if (_starCache.has(key)) return _starCache.get(key);
  const on  = `<span style="color:#f59e0b;font-size:${sz};line-height:1;">★</span>`;
  const off = `<span style="color:#d1d5db;font-size:${sz};line-height:1;">★</span>`;
  let s = '';
  for (let i = 1; i <= 5; i++) s += i <= rounded ? on : off;
  _starCache.set(key, s);
  return s;
}

function fmtScore(v) {
  if (v === null || v === undefined || isNaN(v)) return '0.0';
  return Number(v).toFixed(1);
}

/* ══════════════════════════════════════════════
   카드 평가 섹션 — 평가 없어도 0점으로 표시
══════════════════════════════════════════════ */
function buildCardRatingSection(cfg, aggData, page, placeName) {
  /* 평가 없으면 0점으로 표시 */
  const avg1     = aggData ? aggData.avg1     : 0;
  const avg2     = aggData ? aggData.avg2     : 0;
  const avgTotal = aggData ? aggData.avgTotal : 0;
  const cnt      = aggData ? aggData.cnt      : 0;
  const isEmpty  = !aggData;

  /* 총점 색상 (0점이면 회색) */
  const totalColor = isEmpty ? '#94a3b8'
    : avgTotal >= 4.5 ? '#d97706'
    : avgTotal >= 3.5 ? '#059669'
    : avgTotal >= 2.5 ? '#0369a1'
    : '#64748b';
  const totalBg = isEmpty ? '#f8fafc'
    : avgTotal >= 4.5 ? '#fef9ec'
    : avgTotal >= 3.5 ? '#f0fdf4'
    : avgTotal >= 2.5 ? '#eff6ff'
    : '#f8fafc';

  /* 0점일 때 아이콘을 회색으로 처리 */
  const scoreColor = isEmpty ? '#94a3b8' : cfg.color;
  const barColor   = isEmpty ? '#e2e8f0' : cfg.color;

  /* 평가 버튼: 로그인 여부 + 내 평가 여부 */
  let rateBtn = '';
  if (page && placeName) {
    const loggedIn = isLoggedIn();
    const placeId  = makePlaceId(page, placeName);
    const myRating = loggedIn ? findMyRating(page, placeId) : null;
    const safeName = placeName.replace(/'/g, "\\'");

    if (!loggedIn) {
      rateBtn = `<button class="rate-btn" disabled data-need-login
        style="background:#f8fafc;border-color:#e2e8f0;color:#94a3b8;"
        onclick="alert('로그인 후 평가할 수 있어요! 상단 로그인 버튼을 눌러주세요 🔐')"
        title="로그인 후 평가 가능">
        🔒 로그인 후 평가 가능
      </button>`;
    } else if (myRating) {
      rateBtn = `<button class="rate-btn rate-btn--mine"
        onclick="openRatingDeleteModal('${page}','${safeName}','${myRating.id}',${myRating.score1},${myRating.score2})"
        title="내 평가 확인 및 삭제">
        🗑️ 내 평가 삭제하기
      </button>`;
    } else {
      rateBtn = `<button class="rate-btn"
        style="background:${cfg.colorLt};border-color:${cfg.colorBd};color:${cfg.color};"
        onclick="openRatingModal('${page}','${safeName}')">
        ⭐ 쿠슐랭 평가하기
      </button>`;
    }
  }

  return `
<div class="cdku-card-rating${isEmpty ? ' cdku-card-rating--empty' : ''}">
  <!-- 쿠슐랭 뱃지 -->
  <div class="cdku-cr-brand">
    <span class="cdku-cr-brand-logo">🍋 쿠슐랭</span>
    ${isEmpty
      ? `<span class="cdku-cr-brand-sub" style="color:#94a3b8;">0명 평가 · 첫 번째 평가자가 되어보세요!</span>`
      : `<span class="cdku-cr-brand-sub">${cnt}명이 참여한 평가</span>`
    }
  </div>
  <!-- 총점 헤더 -->
  <div class="cdku-cr-header" style="background:${totalBg};">
    <div class="cdku-cr-total-stars">${renderStars(avgTotal, '.85rem')}</div>
    <div class="cdku-cr-total-score" style="color:${totalColor};">${fmtScore(avgTotal)}</div>
    <div class="cdku-cr-total-label">/ 5.0</div>
    <div class="cdku-cr-count-pill" style="background:${isEmpty ? '#f1f5f9' : cfg.color+'15'};color:${scoreColor};">
      <i class="fas fa-user" style="font-size:.55rem;"></i>&nbsp;${cnt}명
    </div>
  </div>
  <!-- 항목별 점수 바 -->
  <div class="cdku-cr-rows">
    <div class="cdku-cr-row">
      <div class="cdku-cr-row-label">
        <i class="${cfg.icon1}" style="color:${scoreColor};width:12px;text-align:center;flex-shrink:0;"></i>
        <span>${cfg.label1}</span>
      </div>
      <div class="cdku-cr-bar-wrap">
        <div class="cdku-cr-bar" style="width:${(avg1/5)*100}%;background:${barColor};${isEmpty ? 'opacity:.3;' : ''}"></div>
      </div>
      <div class="cdku-cr-row-score" style="color:${scoreColor};">${fmtScore(avg1)}</div>
    </div>
    <div class="cdku-cr-row">
      <div class="cdku-cr-row-label">
        <i class="${cfg.icon2}" style="color:${scoreColor};width:12px;text-align:center;flex-shrink:0;"></i>
        <span>${cfg.label2}</span>
      </div>
      <div class="cdku-cr-bar-wrap">
        <div class="cdku-cr-bar" style="width:${(avg2/5)*100}%;background:${barColor};${isEmpty ? 'opacity:.3;' : ''}"></div>
      </div>
      <div class="cdku-cr-row-score" style="color:${scoreColor};">${fmtScore(avg2)}</div>
    </div>
  </div>
  ${rateBtn ? `<div style="padding:5px 10px 8px;">${rateBtn}</div>` : ''}
</div>`;
}

function injectRatingSection(cfg, aggData, cardEl, page) {
  const area = cardEl.querySelector('.card-rating-area');
  if (!area) return;
  const nameEl = cardEl.querySelector('.card-name');
  const placeName = nameEl ? nameEl.textContent.trim() : '';
  area.innerHTML = buildCardRatingSection(cfg, aggData || null, page, placeName);
}

function refreshAllCardRatings(page, aggMap) {
  const cfg = RATING_CONFIG[page];
  if (!cfg) return;
  /* requestAnimationFrame으로 DOM 업데이트를 다음 프레임으로 미룸기 */
  requestAnimationFrame(() => {
    document.querySelectorAll('.card').forEach(card => {
      const nameEl = card.querySelector('.card-name');
      if (!nameEl) return;
      const name = nameEl.textContent.trim();
      const placeId = makePlaceId(page, name);
      const agg = aggMap[placeId] || null;
      const area = card.querySelector('.card-rating-area');
      if (!area) return;
      /* 데이터가 바뀌지 않으면 DOM 터치 안
         (평가 수 + 평군 비교로 변경 시만 업데이트) */
      const newScore = agg ? agg.cnt + '_' + agg.avgTotal.toFixed(1) : 'empty';
      if (area.dataset.ratingKey === newScore) return;
      area.dataset.ratingKey = newScore;
      area.innerHTML = buildCardRatingSection(cfg, agg, page, name);
    });
  });
}

function injectRatingBadge(cfg, aggData, cardEl) {
  injectRatingSection(cfg, aggData, cardEl);
}

/* ══════════════════════════════════════════════
   쿠슐랭 가이드 — 명예의 전당
   평가가 없어도 "선정 중" 슬롯으로 항상 표시
══════════════════════════════════════════════ */
function buildHallOfFame(page, agg) {
  const cfg = RATING_CONFIG[page];
  if (!cfg) return '';

  const top1 = [...agg].sort((a, b) => b.avg1 - a.avg1).slice(0, 3);
  const top2 = [...agg].sort((a, b) => b.avg2 - a.avg2).slice(0, 3);

  const rankMedal  = ['🥇', '🥈', '🥉'];
  const rankLabel  = ['1위', '2위', '3위'];
  const rankBg = [
    'background:linear-gradient(135deg,#fef9ec,#fde68a);border:2px solid #f59e0b;',
    'background:linear-gradient(135deg,#f1f5f9,#e2e8f0);border:2px solid #94a3b8;',
    'background:linear-gradient(135deg,#fff7ed,#fed7aa);border:2px solid #f97316;',
  ];
  /* 1등 자리 빈칸용 스타일 */
  const emptyFirstBg = 'background:linear-gradient(135deg,#1e293b,#334155);border:2px dashed #475569;';
  const emptyOtherBg = 'background:rgba(255,255,255,.04);border:1.5px dashed rgba(255,255,255,.15);';

  /* 1등 채워진 슬롯 */
  function firstSlot(r, scoreKey) {
    return `
<div style="${rankBg[0]} border-radius:12px;padding:12px;margin-bottom:6px;position:relative;overflow:hidden;">
  <div style="position:absolute;top:-6px;right:-4px;font-size:2.8rem;opacity:.1;pointer-events:none;line-height:1;">🏆</div>
  <div style="font-size:1.5rem;line-height:1;margin-bottom:5px;">${rankMedal[0]}</div>
  <div style="font-size:.95rem;font-weight:900;color:#1e293b;margin-bottom:5px;word-break:keep-all;line-height:1.25;">${r.place_name}</div>
  <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">
    ${renderStars(r[scoreKey], '1rem')}
    <span style="font-size:.95rem;font-weight:800;color:#d97706;margin-left:5px;">${fmtScore(r[scoreKey])}</span>
  </div>
  <div style="font-size:.65rem;color:#78716c;display:flex;align-items:center;gap:3px;">
    <i class="fas fa-user" style="font-size:.55rem;"></i> ${r.cnt}명이 선택했어요
  </div>
</div>`;
  }

  /* 1등 빈 슬롯 */
  function firstEmpty() {
    return `
<div style="${emptyFirstBg} border-radius:12px;padding:14px 12px;margin-bottom:6px;text-align:center;">
  <div style="font-size:1.9rem;margin-bottom:6px;opacity:.5;">👑</div>
  <div style="font-size:.82rem;font-weight:800;color:#94a3b8;margin-bottom:4px;">선정 중</div>
  <div style="font-size:.65rem;color:#64748b;line-height:1.6;">
    아직 이 자리의 주인공이<br>정해지지 않았어요.<br>
    <span style="color:#6366f1;font-weight:600;">당신의 평가가 1등을 만듭니다!</span>
  </div>
</div>`;
  }

  /* 2·3등 채워진 슬롯 */
  function otherSlot(r, i, scoreKey) {
    return `
<div style="${rankBg[i]} border-radius:8px;padding:7px 10px;margin-bottom:5px;display:flex;align-items:center;gap:8px;">
  <span style="font-size:1.15rem;flex-shrink:0;">${rankMedal[i]}</span>
  <div style="flex:1;min-width:0;">
    <div style="font-size:.8rem;font-weight:700;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.place_name}</div>
    <div style="font-size:.63rem;color:#78716c;margin-top:1px;display:flex;align-items:center;gap:3px;">
      ${renderStars(r[scoreKey], '.7rem')}
      <span style="font-weight:700;">${fmtScore(r[scoreKey])}점</span>·
      <i class="fas fa-user" style="font-size:.55rem;"></i>${r.cnt}명
    </div>
  </div>
</div>`;
  }

  /* 2·3등 빈 슬롯 */
  function otherEmpty(i) {
    const emptyMsg = i === 1 ? '더 많은 평가가 필요해요' : '자리를 기다리는 중...';
    return `
<div style="${emptyOtherBg} border-radius:8px;padding:7px 10px;margin-bottom:5px;display:flex;align-items:center;gap:8px;">
  <span style="font-size:1.1rem;opacity:.32;flex-shrink:0;">${rankMedal[i]}</span>
  <div>
    <div style="font-size:.72rem;font-weight:600;color:rgba(255,255,255,.28);">${rankLabel[i]} 선정 중</div>
    <div style="font-size:.62rem;color:rgba(255,255,255,.18);margin-top:1px;">${emptyMsg}</div>
  </div>
</div>`;
  }

  function award(list, label, icon, scoreKey) {
    const slots = [0, 1, 2].map(i => {
      if (i === 0) return list[0] ? firstSlot(list[0], scoreKey) : firstEmpty();
      return list[i] ? otherSlot(list[i], i, scoreKey) : otherEmpty(i);
    }).join('');

    return `
<div style="flex:1;min-width:190px;">
  <div style="
    display:flex;align-items:center;gap:5px;
    font-size:.67rem;font-weight:900;
    color:#fbbf24;letter-spacing:.04em;
    margin-bottom:8px;
  ">
    <span style="
      background:rgba(251,191,36,.13);border:1px solid rgba(251,191,36,.28);
      border-radius:7px;padding:3px 9px;
      display:flex;align-items:center;gap:4px;
    "><i class="${icon}" style="font-size:.68rem;"></i> ${label} 어워드</span>
  </div>
  ${slots}
</div>`;
  }

  return `
<section id="hallOfFame" style="
  background:linear-gradient(160deg,#0f0c29 0%,#1a1a4e 40%,#24243e 100%);
  border-radius:18px;padding:18px 16px 15px;margin-bottom:20px;
  box-shadow:0 8px 30px rgba(0,0,0,.45);
  position:relative;overflow:hidden;
  border:1px solid rgba(255,255,255,.06);
">

  <div style="position:relative;">
    <!-- 헤더 -->
    <div style="text-align:center;margin-bottom:14px;">
      <div style="
        display:inline-flex;align-items:center;gap:5px;
        background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.25);
        border-radius:20px;padding:3px 11px;margin-bottom:7px;
        font-size:.58rem;font-weight:800;color:#fbbf24;letter-spacing:.1em;text-transform:uppercase;
      ">🍋 COODUCK MICHELIN</div>
      <h2 style="font-size:1.2rem;font-weight:900;color:#fff;margin-bottom:5px;letter-spacing:-.5px;line-height:1.2;">
        쿠슐랭 가이드 ${cfg.emoji}
      </h2>
      <p style="font-size:.74rem;color:#a5b4fc;line-height:1.6;max-width:340px;margin:0 auto;">
        미식가에겐 미슐랭, <strong style="color:#fbbf24;">음악인에겐 쿠슐랭</strong>.
        직접 다녀온 ${cfg.title}만 압니다.
        <span style="color:#818cf8;font-size:.68rem;">— 별 하나의 무게를 아는 사람들의 어워드</span>
      </p>
    </div>

    <!-- 어워드 2개 -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      ${award(top1, cfg.label1, cfg.icon1, 'avg1')}
      ${award(top2, cfg.label2, cfg.icon2, 'avg2')}
    </div>

    <!-- 하단 안내 -->
    <div style="
      margin-top:12px;padding-top:10px;
      border-top:1px solid rgba(255,255,255,.08);
      display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;
    ">
      <span style="font-size:.6rem;color:rgba(255,255,255,.35);">
        🍋 총 <strong style="color:#fbbf24;">${agg.reduce((s,a)=>s+a.cnt,0)}</strong>건 반영 중
      </span>
      <span style="font-size:.6rem;color:rgba(255,255,255,.15);">·</span>
      <span style="font-size:.6rem;color:rgba(255,255,255,.25);">실시간 집계 · ${agg.length}개 업체</span>
    </div>
  </div>
</section>`;
}

/* ══════════════════════════════════════════════
   buildHallOfFame을 평가 0건일 때도 표시
   (빈 어워드 슬롯만 있는 상태로)
══════════════════════════════════════════════ */
function buildHallOfFameAlways(page) {
  return buildHallOfFame(page, []);
}

/* ══════════════════════════════════════════════
   평가 모달
══════════════════════════════════════════════ */
/* ── 신규 평가 모달 (별점 입력) ── */
function buildRatingModal(cfg, placeName) {
  return `
<div id="ratingModal" style="
  position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.65);backdrop-filter:blur(6px);padding:20px;
" onclick="if(event.target===this)closeRatingModal()">
  <div style="
    background:#fff;border-radius:22px;padding:22px 20px 18px;max-width:380px;width:100%;
    box-shadow:0 24px 64px rgba(0,0,0,.3);position:relative;
    animation:ratingModalIn .22s cubic-bezier(.34,1.56,.64,1);
  ">
    <button onclick="closeRatingModal()" style="
      position:absolute;top:12px;right:12px;background:#f1f5f9;border:none;
      width:28px;height:28px;border-radius:50%;font-size:.95rem;cursor:pointer;
      color:#64748b;display:flex;align-items:center;justify-content:center;
    " onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">✕</button>

    <div style="text-align:center;margin-bottom:16px;">
      <div style="
        display:inline-flex;align-items:center;gap:5px;
        background:#fffbeb;border:1px solid #fde68a;
        border-radius:20px;padding:3px 12px;margin-bottom:8px;
        font-size:.6rem;font-weight:800;color:#d97706;letter-spacing:.08em;
      ">🍋 COODUCK GUIDE</div>
      <div style="font-size:1.9rem;line-height:1;margin-bottom:5px;">${cfg.emoji}</div>
      <div style="font-size:.98rem;font-weight:900;color:#1e293b;margin-bottom:3px;">${placeName}</div>
      <div style="font-size:.73rem;color:#64748b;line-height:1.4;">솔직한 한 표가 음악인들에게 큰 나침반이 돼요</div>
    </div>

    <div style="margin-bottom:12px;">
      <div style="
        display:inline-flex;align-items:center;gap:5px;
        background:${cfg.colorLt};border:1.5px solid ${cfg.colorBd};
        color:${cfg.color};border-radius:8px;padding:3px 9px;
        font-size:.7rem;font-weight:800;margin-bottom:7px;
      "><i class="${cfg.icon1}"></i> ${cfg.label1}
        <span style="margin-left:4px;font-size:.62rem;color:#94a3b8;font-weight:500;">${cfg.tip1}</span>
      </div>
      <div style="display:flex;gap:4px;justify-content:center;" id="stars1">
        ${[1,2,3,4,5].map(i => `
          <button onclick="setRatingStar(1,${i})" data-star="${i}" style="
            background:#f8fafc;border:2px solid #e2e8f0;
            border-radius:9px;width:46px;height:46px;font-size:1.55rem;cursor:pointer;
            transition:all .15s;line-height:1;display:flex;align-items:center;justify-content:center;
          ">☆</button>`).join('')}
      </div>
      <div style="text-align:center;font-size:.72rem;color:#64748b;margin-top:5px;height:17px;font-weight:600;" id="starLabel1">별을 눌러 평가하세요</div>
    </div>

    <div style="margin-bottom:18px;">
      <div style="
        display:inline-flex;align-items:center;gap:5px;
        background:${cfg.colorLt};border:1.5px solid ${cfg.colorBd};
        color:${cfg.color};border-radius:8px;padding:3px 9px;
        font-size:.7rem;font-weight:800;margin-bottom:7px;
      "><i class="${cfg.icon2}"></i> ${cfg.label2}
        <span style="margin-left:4px;font-size:.62rem;color:#94a3b8;font-weight:500;">${cfg.tip2}</span>
      </div>
      <div style="display:flex;gap:4px;justify-content:center;" id="stars2">
        ${[1,2,3,4,5].map(i => `
          <button onclick="setRatingStar(2,${i})" data-star="${i}" style="
            background:#f8fafc;border:2px solid #e2e8f0;
            border-radius:9px;width:46px;height:46px;font-size:1.55rem;cursor:pointer;
            transition:all .15s;line-height:1;display:flex;align-items:center;justify-content:center;
          ">☆</button>`).join('')}
      </div>
      <div style="text-align:center;font-size:.72rem;color:#64748b;margin-top:5px;height:17px;font-weight:600;" id="starLabel2">별을 눌러 평가하세요</div>
    </div>

    <button id="submitRatingBtn" onclick="submitRatingNow()" style="
      width:100%;padding:12px;
      background:linear-gradient(135deg,${cfg.color},${cfg.color}dd);
      color:#fff;border:none;border-radius:11px;font-size:.9rem;font-weight:800;
      cursor:pointer;transition:all .18s;font-family:inherit;
      box-shadow:0 4px 14px ${cfg.color}44;letter-spacing:.02em;
    ">⭐ 쿠슐랭 평가 제출하기</button>
    <div id="ratingMsg" style="text-align:center;font-size:.78rem;margin-top:8px;min-height:18px;font-weight:600;"></div>
  </div>
</div>`;
}

/* ── 내 평가 삭제 확인 다이얼로그 (초경량) ── */
function buildDeleteConfirmDialog(cfg, placeName, score1, score2) {
  const s1 = '★'.repeat(score1) + '☆'.repeat(5 - score1);
  const s2 = '★'.repeat(score2) + '☆'.repeat(5 - score2);
  return `
<div id="ratingModal" style="
  position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.6);backdrop-filter:blur(4px);padding:20px;
" onclick="if(event.target===this)closeRatingModal()">
  <div style="
    background:#fff;border-radius:20px;padding:24px 22px 20px;max-width:320px;width:100%;
    box-shadow:0 20px 50px rgba(0,0,0,.28);position:relative;
    animation:ratingModalIn .2s cubic-bezier(.34,1.56,.64,1);
  ">
    <button onclick="closeRatingModal()" style="
      position:absolute;top:11px;right:11px;background:#f1f5f9;border:none;
      width:26px;height:26px;border-radius:50%;font-size:.9rem;cursor:pointer;color:#64748b;
      display:flex;align-items:center;justify-content:center;
    " onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">✕</button>

    <!-- 헤더 -->
    <div style="text-align:center;margin-bottom:14px;">
      <div style="font-size:2rem;line-height:1;margin-bottom:6px;">${cfg.emoji}</div>
      <div style="font-size:.92rem;font-weight:900;color:#1e293b;margin-bottom:2px;">${placeName}</div>
      <div style="font-size:.68rem;color:#94a3b8;">내가 남긴 쿠슐랭 평가</div>
    </div>

    <!-- 내 별점 요약 -->
    <div style="
      background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;
      padding:12px 14px;margin-bottom:16px;
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
        <span style="font-size:.72rem;font-weight:700;color:#475569;">
          <i class="${cfg.icon1}" style="color:${cfg.color};margin-right:4px;"></i>${cfg.label1}
        </span>
        <span style="font-size:.85rem;color:#f59e0b;letter-spacing:1px;">${s1}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:.72rem;font-weight:700;color:#475569;">
          <i class="${cfg.icon2}" style="color:${cfg.color};margin-right:4px;"></i>${cfg.label2}
        </span>
        <span style="font-size:.85rem;color:#f59e0b;letter-spacing:1px;">${s2}</span>
      </div>
    </div>

    <!-- 안내 문구 -->
    <p style="font-size:.73rem;color:#64748b;text-align:center;margin-bottom:16px;line-height:1.6;">
      평가를 삭제하면 다시 새롭게 평가할 수 있어요.
    </p>

    <!-- 버튼 -->
    <button onclick="deleteRatingNow()" style="
      width:100%;padding:11px;
      background:#fff5f5;border:1.5px solid #fecaca;
      color:#ef4444;border-radius:11px;font-size:.88rem;font-weight:800;
      cursor:pointer;transition:all .15s;font-family:inherit;margin-bottom:8px;
    " onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fff5f5'">
      🗑️ 평가 삭제하기
    </button>
    <button onclick="closeRatingModal()" style="
      width:100%;padding:9px;
      background:#f1f5f9;border:1.5px solid #e2e8f0;
      color:#475569;border-radius:11px;font-size:.84rem;font-weight:700;
      cursor:pointer;font-family:inherit;
    " onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">
      닫기
    </button>
    <div id="ratingMsg" style="text-align:center;font-size:.75rem;margin-top:8px;min-height:16px;font-weight:600;"></div>
  </div>
</div>`;
}

/* ── 전역 모달 상태 ── */
let _ratingState = { page: '', cfg: null, placeName: '', placeId: '', star1: 0, star2: 0, deleteId: null };

window.setRatingStar = function(which, val) {
  const id = which === 1 ? 'stars1' : 'stars2';
  const labelId = which === 1 ? 'starLabel1' : 'starLabel2';
  if (which === 1) _ratingState.star1 = val;
  else _ratingState.star2 = val;
  document.querySelectorAll(`#${id} button`).forEach((b, i) => {
    const on = i < val;
    b.style.background  = on ? '#fef3c7' : '#f8fafc';
    b.style.borderColor = on ? '#f59e0b' : '#e2e8f0';
    b.textContent       = on ? '★' : '☆';
    b.style.transform   = on ? 'scale(1.08)' : 'scale(1)';
  });
  document.getElementById(labelId).textContent = STAR_LABELS[val] || '';
};

window.closeRatingModal = function() {
  ['ratingModal', 'ratingEditModal'].forEach(id => {
    const m = document.getElementById(id);
    if (m) m.remove();
  });
};

/* ── 새 평가 모달 열기 (로그인 필수) ── */
window.openRatingModal = function(page, placeName) {
  if (!isLoggedIn()) {
    alert('로그인 후 평가할 수 있어요! 상단 로그인 버튼을 눌러주세요 🔐');
    return;
  }
  const cfg = RATING_CONFIG[page];
  if (!cfg) return;
  _ratingState = { page, cfg, placeName, placeId: makePlaceId(page, placeName), star1: 0, star2: 0, deleteId: null };
  closeRatingModal();
  const div = document.createElement('div');
  div.innerHTML = buildRatingModal(cfg, placeName);
  document.body.appendChild(div.firstElementChild);
};

/* ── 내 평가 삭제 확인 다이얼로그 열기 ── */
window.openRatingDeleteModal = function(page, placeName, ratingId, score1, score2) {
  if (!isLoggedIn()) return;
  const cfg = RATING_CONFIG[page];
  if (!cfg) return;
  _ratingState = { page, cfg, placeName, placeId: makePlaceId(page, placeName), star1: score1, star2: score2, deleteId: ratingId };
  closeRatingModal();
  const div = document.createElement('div');
  div.innerHTML = buildDeleteConfirmDialog(cfg, placeName, score1, score2);
  document.body.appendChild(div.firstElementChild);
};

window.submitRatingNow = async function() {
  const { page, cfg, placeName, placeId, star1, star2 } = _ratingState;
  if (!star1 || !star2) {
    const msg = document.getElementById('ratingMsg');
    msg.textContent = '⚠️ 두 항목 모두 별점을 선택해주세요!';
    msg.style.color = '#ef4444';
    return;
  }
  const btn = document.getElementById('submitRatingBtn');
  btn.disabled = true; btn.style.opacity = '.7'; btn.textContent = '제출 중...';
  try {
    /* user_id: window.currentUser 우선, 없으면 Supabase 세션 직접 확인 */
    let uid = getCurrentUserId();
    if (!uid) {
      try {
        const sb = (typeof getClient === 'function') ? getClient() : null;
        if (sb) {
          const { data } = await sb.auth.getSession();
          if (data?.session?.user) {
            uid = data.session.user.id;
            window.currentUser = { id: uid, email: data.session.user.email };
          }
        }
      } catch(_) {}
    }
    if (!uid) throw new Error('로그인 정보를 찾을 수 없어요. 페이지를 새로고침 후 다시 시도해주세요.');
    await submitRating({ page, place_id: placeId, place_name: placeName, user_id: uid, score1: star1, score2: star2, label1: cfg.label1, label2: cfg.label2 });
    const msg = document.getElementById('ratingMsg');
    msg.textContent = '🎉 쿠슐랭 평가가 등록됐어요! 감사합니다!';
    msg.style.color = '#059669';
    btn.textContent = '✅ 완료';
    setTimeout(async () => {
      closeRatingModal();
      /* _hofLoading 플래그 강제 해제 후 갱신 */
      window._hofLoading = false;
      if (typeof loadHallOfFame === 'function') await loadHallOfFame();
    }, 1000);
  } catch(e) {
    const msg = document.getElementById('ratingMsg');
    msg.textContent = '❌ ' + (e.message || '오류가 발생했어요. 잠시 후 다시 시도해주세요.');
    msg.style.color = '#ef4444';
    btn.disabled = false; btn.style.opacity = '1';
    btn.textContent = '⭐ 쿠슐랭 평가 제출하기';
  }
};

/* ── 평가 삭제 ── */
window.deleteRatingNow = async function() {
  const { deleteId } = _ratingState;
  if (!deleteId) return;
  const btn = document.querySelector('#ratingModal button[onclick="deleteRatingNow()"]');
  if (btn) { btn.disabled = true; btn.textContent = '삭제 중...'; }
  try {
    /* 삭제 전 세션 재확인 */
    let uid = getCurrentUserId();
    if (!uid) {
      try {
        const sb = (typeof getClient === 'function') ? getClient() : null;
        if (sb) {
          const { data } = await sb.auth.getSession();
          if (data?.session?.user) {
            uid = data.session.user.id;
            window.currentUser = { id: uid, email: data.session.user.email };
          }
        }
      } catch(_) {}
    }
    if (!uid) throw new Error('로그인 정보를 찾을 수 없어요. 페이지를 새로고침 후 다시 시도해주세요.');
    await deleteRating(deleteId);
    const msg = document.getElementById('ratingMsg');
    if (msg) { msg.textContent = '✅ 평가가 삭제됐어요.'; msg.style.color = '#059669'; }
    setTimeout(async () => {
      closeRatingModal();
      /* _hofLoading 플래그 강제 해제 후 갱신 */
      window._hofLoading = false;
      if (typeof loadHallOfFame === 'function') await loadHallOfFame();
    }, 700);
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = '🗑️ 평가 삭제하기'; }
    const msg = document.getElementById('ratingMsg');
    if (msg) { msg.textContent = '❌ ' + (e.message || '삭제 중 오류가 발생했어요.'); msg.style.color = '#ef4444'; }
  }
};

/* ══════════════════════════════════════════════
   CSS 주입
══════════════════════════════════════════════ */
(function injectRatingCSS() {
  const style = document.createElement('style');
  style.textContent = `
@keyframes ratingModalIn {
  from { opacity:0; transform:scale(.86) translateY(24px); }
  to   { opacity:1; transform:scale(1)   translateY(0); }
}

/* 카드 평가 섹션 — 높이 70% 압축 */
.cdku-card-rating {
  margin-top: 8px;
  border-radius: 10px;
  overflow: hidden;
  border: 1.5px solid #e2e8f0;
  background: #fff;
}
.cdku-card-rating--empty {
  opacity: .78;
}

/* 쿠슐랭 브랜드 라인 */
.cdku-cr-brand {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 3px;
  background: linear-gradient(90deg,#fffbeb,#fff);
  border-bottom: 1px solid #fef3c7;
}
.cdku-cr-brand-logo {
  font-size: .6rem;
  font-weight: 900;
  color: #d97706;
  letter-spacing: .04em;
  white-space: nowrap;
}
.cdku-cr-brand-sub {
  font-size: .59rem;
  color: #94a3b8;
  font-weight: 500;
}

/* 총점 헤더 */
.cdku-cr-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-bottom: 1px solid #f1f5f9;
}
.cdku-cr-total-stars { display:flex;align-items:center;gap:1px; }
.cdku-cr-total-score { font-size:.88rem;font-weight:900;line-height:1; }
.cdku-cr-total-label { font-size:.63rem;font-weight:600;color:#94a3b8; }
.cdku-cr-count-pill  {
  margin-left: auto;
  font-size: .6rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

/* 항목 점수 바 */
.cdku-cr-rows {
  padding: 5px 10px 7px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #fff;
}
.cdku-cr-row { display:flex;align-items:center;gap:6px; }
.cdku-cr-row-label {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: .63rem;
  font-weight: 600;
  color: #475569;
  width: 76px;
  flex-shrink: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cdku-cr-bar-wrap {
  flex: 1;
  background: #f1f5f9;
  border-radius: 20px;
  height: 5px;
  overflow: hidden;
}
.cdku-cr-bar {
  height: 100%;
  border-radius: 20px;
  transition: width .6s cubic-bezier(.34,1.2,.64,1);
  min-width: 0;
}
.cdku-cr-row-score {
  font-size: .72rem;
  font-weight: 800;
  width: 24px;
  text-align: right;
  flex-shrink: 0;
}

/* 평가하기 버튼 */
.rate-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 11px;
  border-radius: 20px;
  font-size: .7rem;
  font-weight: 800;
  border: 1.5px solid;
  cursor: pointer;
  transition: all .18s;
  font-family: inherit;
  white-space: nowrap;
}
.rate-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(0,0,0,.12);
}
.rate-btn:disabled {
  opacity: .45;
  cursor: not-allowed;
  filter: grayscale(.4);
}
/* 내가 평가한 버튼 — 삭제 유도 버튼 */
.rate-btn--mine {
  background: #fff5f5 !important;
  border-color: #fca5a5 !important;
  color: #dc2626 !important;
}
.rate-btn--mine:hover:not(:disabled) {
  background: #fee2e2 !important;
}
/* 로그인 필요 툴팁 */
.rate-btn[data-need-login]:hover::after {
  content: '로그인 후 평가 가능';
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: #1e293b;
  color: #fff;
  font-size: .62rem;
  padding: 3px 8px;
  border-radius: 6px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 100;
}
.card-rating-area { position: relative; }
  `;
  document.head.appendChild(style);
})();

