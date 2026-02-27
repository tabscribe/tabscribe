/**
 * TabScribe — 광고 중앙 관리  js/ads.js  v4.0
 * ─────────────────────────────────────────────
 * • 각 페이지 좌·우 사이드 4개씩 광고 카드 렌더링
 * • 헤리티지 우디오일은 각 페이지 우측 마지막(R4) 슬롯에 1개
 * • mountAds(id, [슬롯키…]) 한 번 호출로 완성
 * • 어느 컨테이너 구조든 카드가 보이도록 self-contained CSS
 */

/* ──────────────────────────────────────────────
   제품 이미지 경로
────────────────────────────────────────────── */
const _IMG = {
  G200   : 'images/gw-g200.jpg',
  G200_2 : 'images/gw-g200-2.jpg',
  K940   : 'images/gw-k940.jpg',
  K930   : 'images/gw-k930.jpg',
  G330C  : 'images/gw-g330c.jpg',
  I100   : 'images/gw-i100.jpg',
  I110   : 'images/gw-i110.jpg',
  I232RC : 'images/gw-i232rc.jpg',
};

/* ──────────────────────────────────────────────
   헤리티지 우디오일 — 페이지별 전용 이미지
────────────────────────────────────────────── */
const _OIL = {
  HOME_D  : 'images/oil-ad-dark.jpg',    // 메인 기본화면
  HOME_A  : 'images/oil-ad-bright.jpg',  // 메인 분석화면
  REHEAR  : 'images/oil-ad-craft.jpg',   // 합주실
  REPAIR  : 'images/oil-ad-retail.jpg',  // 리페어샵
  INSTR   : 'images/oil-ad-dark.jpg',    // 악기샵
  PREVIEW : 'images/oil-ad-bright.jpg',  // 미리보기
  COMM    : 'images/oil-ad-retail.jpg',  // 커뮤니티(기본)
  COMM_B  : 'images/oil-ad-craft.jpg',   // 커뮤니티 밴드구인
  COMM_L  : 'images/oil-ad-bright.jpg',  // 커뮤니티 레슨
  COMM_U  : 'images/oil-ad-retail.jpg',  // 커뮤니티 중고장터
  COMM_F  : 'images/oil-ad-dark.jpg',    // 커뮤니티 자유게시판
  COMM_I  : 'images/oil-ad-craft.jpg',   // 커뮤니티 장비리뷰
};

const OIL_LINK = 'https://m.gopherwood.co.kr/product/list.html?cate_no=255';

/* ──────────────────────────────────────────────
   광고 슬롯 데이터
   label  : 카드 제품명 (한글)
   desc   : 한 줄 설명 (한글)
   badge  : 하단 뱃지 텍스트 (선택)
────────────────────────────────────────────── */
const ADS = {

  /* ===== 메인 기본화면 ===== */
  HOME_DEFAULT_L1:{ image:_IMG.G200,   link:'https://m.gopherwood.co.kr/product/gopherwood-g200/21/category/52/display/1/',           alt:'G200 어쿠스틱',       label:'G200 어쿠스틱',       desc:'탑솔리드 입문~중급', badge:'GW G200' },
  HOME_DEFAULT_L2:{ image:_IMG.K940,   link:'https://m.gopherwood.co.kr/product/gopherwood-k940rce-rhomb/375/category/128/display/1/', alt:'K940RCE RHOMB',       label:'K940RCE RHOMB',       desc:'올솔리드 프리미엄',  badge:'GW K940' },
  HOME_DEFAULT_L3:{ image:_IMG.G330C,  link:'https://m.gopherwood.co.kr/product/gopherwood-g330c/98/category/130/display/1/',          alt:'G330C 어쿠스틱',      label:'G330C 어쿠스틱',      desc:'따뜻한 감성 기타',   badge:'GW G330C' },
  HOME_DEFAULT_L4:{ image:_IMG.K930,   link:'https://m.gopherwood.co.kr/product/gopherwood-k930rce/115/category/128/display/1/',       alt:'K930RCE 어쿠스틱',    label:'K930RCE 어쿠스틱',   desc:'프리미엄 컷어웨이',  badge:'GW K930' },
  HOME_DEFAULT_R1:{ image:_IMG.I232RC, link:'https://m.gopherwood.co.kr/product/gopherwood-i232rc-silver-haze/500/category/104/display/1/', alt:'i232RC Silver Haze', label:'i232RC Silver Haze', desc:'시그니처 일렉기타',  badge:'GW i232RC' },
  HOME_DEFAULT_R2:{ image:_IMG.I110,   link:'https://m.gopherwood.co.kr/product/gopherwood-i110/51/',                                 alt:'i110 일렉기타',       label:'i110 일렉기타',       desc:'입문 일렉기타 추천', badge:'GW i110' },
  HOME_DEFAULT_R3:{ image:_IMG.I100,   link:'https://m.gopherwood.co.kr/product/gopherwood-i100/89/category/107/display/1/',           alt:'i100 일렉기타',       label:'i100 일렉기타',       desc:'입문의 기준',        badge:'GW i100' },
  HOME_DEFAULT_R4:{ image:_OIL.HOME_D, link:OIL_LINK, alt:'헤리티지 우디오일', label:'헤리티지 우디오일', desc:'기타 지판 전용 프리미엄 오일 — 알코올 프리, 국내 제조', badge:'오일 케어', oil:true },

  /* ===== 메인 분석화면 ===== */
  HOME_ANALYZE_L1:{ image:_IMG.G200_2, link:'https://m.gopherwood.co.kr/product/gopherwood-g200/21/category/52/display/1/',           alt:'G200 어쿠스틱',       label:'G200 어쿠스틱',       desc:'탑솔리드 어쿠스틱',  badge:'GW G200' },
  HOME_ANALYZE_L2:{ image:_IMG.K930,   link:'https://m.gopherwood.co.kr/product/gopherwood-k930rce/115/category/128/display/1/',       alt:'K930RCE 어쿠스틱',    label:'K930RCE 어쿠스틱',   desc:'프리미엄 컷어웨이',  badge:'GW K930' },
  HOME_ANALYZE_L3:{ image:_IMG.G330C,  link:'https://m.gopherwood.co.kr/product/gopherwood-g330c/98/category/130/display/1/',          alt:'G330C 어쿠스틱',      label:'G330C 어쿠스틱',      desc:'감성 연주를 위해',   badge:'GW G330C' },
  HOME_ANALYZE_L4:{ image:_IMG.K940,   link:'https://m.gopherwood.co.kr/product/gopherwood-k940rce-rhomb/375/category/128/display/1/', alt:'K940RCE RHOMB',       label:'K940RCE RHOMB',       desc:'올솔리드 프리미엄',  badge:'GW K940' },
  HOME_ANALYZE_R1:{ image:_IMG.I232RC, link:'https://m.gopherwood.co.kr/product/gopherwood-i232rc-silver-haze/500/category/104/display/1/', alt:'i232RC Silver Haze', label:'i232RC Silver Haze', desc:'무대를 위한 일렉',   badge:'GW i232RC' },
  HOME_ANALYZE_R2:{ image:_IMG.I110,   link:'https://m.gopherwood.co.kr/product/gopherwood-i110/51/',                                 alt:'i110 일렉기타',       label:'i110 일렉기타',       desc:'입문 일렉기타',      badge:'GW i110' },
  HOME_ANALYZE_R3:{ image:_IMG.I100,   link:'https://m.gopherwood.co.kr/product/gopherwood-i100/89/category/107/display/1/',           alt:'i100 일렉기타',       label:'i100 일렉기타',       desc:'입문의 기준',        badge:'GW i100' },
  HOME_ANALYZE_R4:{ image:_OIL.HOME_A, link:OIL_LINK, alt:'헤리티지 우디오일', label:'헤리티지 우디오일', desc:'연주 후 지판 케어 — 알코올 프리 프리미엄 오일', badge:'오일 케어', oil:true },

  /* ===== 합주실 ===== */
  REHEARSAL_L1:{ image:_IMG.I110,   link:'https://m.gopherwood.co.kr/product/gopherwood-i110/51/',                                 alt:'i110 일렉기타',       label:'i110 일렉기타',       desc:'밴드 합주용 일렉',   badge:'GW i110' },
  REHEARSAL_L2:{ image:_IMG.I232RC, link:'https://m.gopherwood.co.kr/product/gopherwood-i232rc-silver-haze/500/category/104/display/1/', alt:'i232RC Silver Haze', label:'i232RC Silver Haze', desc:'합주 퍼포먼스용',    badge:'GW i232RC' },
  REHEARSAL_L3:{ image:_IMG.K940,   link:'https://m.gopherwood.co.kr/product/gopherwood-k940rce-rhomb/375/category/128/display/1/', alt:'K940RCE RHOMB',       label:'K940RCE RHOMB',       desc:'올솔리드 어쿠스틱',  badge:'GW K940' },
  REHEARSAL_L4:{ image:_IMG.I100,   link:'https://m.gopherwood.co.kr/product/gopherwood-i100/89/category/107/display/1/',           alt:'i100 일렉기타',       label:'i100 일렉기타',       desc:'입문 일렉기타',      badge:'GW i100' },
  REHEARSAL_R1:{ image:_IMG.G200,   link:'https://m.gopherwood.co.kr/product/gopherwood-g200/21/category/52/display/1/',           alt:'G200 어쿠스틱',       label:'G200 어쿠스틱',       desc:'탑솔리드 어쿠스틱',  badge:'GW G200' },
  REHEARSAL_R2:{ image:_IMG.G330C,  link:'https://m.gopherwood.co.kr/product/gopherwood-g330c/98/category/130/display/1/',          alt:'G330C 어쿠스틱',      label:'G330C 어쿠스틱',      desc:'감성 어쿠스틱',      badge:'GW G330C' },
  REHEARSAL_R3:{ image:_IMG.K930,   link:'https://m.gopherwood.co.kr/product/gopherwood-k930rce/115/category/128/display/1/',       alt:'K930RCE 어쿠스틱',    label:'K930RCE 어쿠스틱',   desc:'프리미엄 컷어웨이',  badge:'GW K930' },
  REHEARSAL_R4:{ image:_OIL.REHEAR, link:OIL_LINK, alt:'헤리티지 우디오일', label:'헤리티지 우디오일', desc:'합주 후 지판 케어 — 악기를 오래 건강하게', badge:'오일 케어', oil:true },

  /* ===== 리페어샵 ===== */
  REPAIR_L1:{ image:_IMG.K940,   link:'https://m.gopherwood.co.kr/product/gopherwood-k940rce-rhomb/375/category/128/display/1/', alt:'K940RCE RHOMB',  label:'K940RCE RHOMB',  desc:'올솔리드 프리미엄', badge:'GW K940' },
  REPAIR_L2:{ image:_IMG.G330C,  link:'https://m.gopherwood.co.kr/product/gopherwood-g330c/98/category/130/display/1/',          alt:'G330C 어쿠스틱', label:'G330C 어쿠스틱', desc:'수리 후 새 시작',   badge:'GW G330C' },
  REPAIR_L3:{ image:_IMG.G200,   link:'https://m.gopherwood.co.kr/product/gopherwood-g200/21/category/52/display/1/',           alt:'G200 어쿠스틱',  label:'G200 어쿠스틱',  desc:'탑솔리드 어쿠스틱', badge:'GW G200' },
  REPAIR_L4:{ image:_IMG.K930,   link:'https://m.gopherwood.co.kr/product/gopherwood-k930rce/115/category/128/display/1/',       alt:'K930RCE 어쿠스틱', label:'K930RCE 어쿠스틱', desc:'프리미엄 컷어웨이', badge:'GW K930' },
  REPAIR_R1:{ image:_IMG.I232RC, link:'https://m.gopherwood.co.kr/product/gopherwood-i232rc-silver-haze/500/category/104/display/1/', alt:'i232RC Silver Haze', label:'i232RC Silver Haze', desc:'시그니처 일렉기타', badge:'GW i232RC' },
  REPAIR_R2:{ image:_IMG.I110,   link:'https://m.gopherwood.co.kr/product/gopherwood-i110/51/',                                 alt:'i110 일렉기타',  label:'i110 일렉기타',  desc:'수리 후 업그레이드', badge:'GW i110' },
  REPAIR_R3:{ image:_IMG.I100,   link:'https://m.gopherwood.co.kr/product/gopherwood-i100/89/category/107/display/1/',           alt:'i100 일렉기타',  label:'i100 일렉기타',  desc:'입문 일렉기타',     badge:'GW i100' },
  REPAIR_R4:{ image:_OIL.REPAIR, link:OIL_LINK, alt:'헤리티지 우디오일', label:'헤리티지 우디오일', desc:'리페어 후 오일로 마무리 — 지판을 건강하게', badge:'오일 케어', oil:true },

  /* ===== 악기샵 ===== */
  INSTRUMENT_L1:{ image:_IMG.I100,   link:'https://m.gopherwood.co.kr/product/gopherwood-i100/89/category/107/display/1/',           alt:'i100 일렉기타',       label:'i100 일렉기타',       desc:'입문 일렉기타 추천', badge:'GW i100' },
  INSTRUMENT_L2:{ image:_IMG.I232RC, link:'https://m.gopherwood.co.kr/product/gopherwood-i232rc-silver-haze/500/category/104/display/1/', alt:'i232RC Silver Haze', label:'i232RC Silver Haze', desc:'시그니처 일렉기타',  badge:'GW i232RC' },
  INSTRUMENT_L3:{ image:_IMG.G200,   link:'https://m.gopherwood.co.kr/product/gopherwood-g200/21/category/52/display/1/',           alt:'G200 어쿠스틱',       label:'G200 어쿠스틱',       desc:'탑솔리드 어쿠스틱',  badge:'GW G200' },
  INSTRUMENT_L4:{ image:_IMG.I110,   link:'https://m.gopherwood.co.kr/product/gopherwood-i110/51/',                                 alt:'i110 일렉기타',       label:'i110 일렉기타',       desc:'입문 일렉기타',      badge:'GW i110' },
  INSTRUMENT_R1:{ image:_IMG.K940,   link:'https://m.gopherwood.co.kr/product/gopherwood-k940rce-rhomb/375/category/128/display/1/', alt:'K940RCE RHOMB',       label:'K940RCE RHOMB',       desc:'올솔리드 프리미엄',  badge:'GW K940' },
  INSTRUMENT_R2:{ image:_IMG.G330C,  link:'https://m.gopherwood.co.kr/product/gopherwood-g330c/98/category/130/display/1/',          alt:'G330C 어쿠스틱',      label:'G330C 어쿠스틱',      desc:'감성 어쿠스틱',      badge:'GW G330C' },
  INSTRUMENT_R3:{ image:_IMG.K930,   link:'https://m.gopherwood.co.kr/product/gopherwood-k930rce/115/category/128/display/1/',       alt:'K930RCE 어쿠스틱',    label:'K930RCE 어쿠스틱',   desc:'프리미엄 컷어웨이',  badge:'GW K930' },
  INSTRUMENT_R4:{ image:_OIL.INSTR,  link:OIL_LINK, alt:'헤리티지 우디오일', label:'헤리티지 우디오일', desc:'새 악기와 함께 오일 케어 — 지판을 건강하게', badge:'오일 케어', oil:true },

  /* ===== 악보 미리보기 ===== */
  PREVIEW_L1:{ image:_IMG.G330C,  link:'https://m.gopherwood.co.kr/product/gopherwood-g330c/98/category/130/display/1/',          alt:'G330C 어쿠스틱',      label:'G330C 어쿠스틱',      desc:'감성 연주를 위해',   badge:'GW G330C' },
  PREVIEW_L2:{ image:_IMG.G200,   link:'https://m.gopherwood.co.kr/product/gopherwood-g200/21/category/52/display/1/',           alt:'G200 어쿠스틱',       label:'G200 어쿠스틱',       desc:'탑솔리드 어쿠스틱',  badge:'GW G200' },
  PREVIEW_L3:{ image:_IMG.K940,   link:'https://m.gopherwood.co.kr/product/gopherwood-k940rce-rhomb/375/category/128/display/1/', alt:'K940RCE RHOMB',       label:'K940RCE RHOMB',       desc:'올솔리드 프리미엄',  badge:'GW K940' },
  PREVIEW_L4:{ image:_IMG.G200_2, link:'https://m.gopherwood.co.kr/product/gopherwood-g200/21/category/52/display/1/',           alt:'G200 라이프스타일',   label:'G200 라이프스타일',   desc:'함께하는 음악 생활',  badge:'GW G200' },
  PREVIEW_R1:{ image:_IMG.I232RC, link:'https://m.gopherwood.co.kr/product/gopherwood-i232rc-silver-haze/500/category/104/display/1/', alt:'i232RC Silver Haze', label:'i232RC Silver Haze', desc:'시그니처 일렉기타',  badge:'GW i232RC' },
  PREVIEW_R2:{ image:_IMG.I110,   link:'https://m.gopherwood.co.kr/product/gopherwood-i110/51/',                                 alt:'i110 일렉기타',       label:'i110 일렉기타',       desc:'입문 일렉기타',      badge:'GW i110' },
  PREVIEW_R3:{ image:_IMG.K930,   link:'https://m.gopherwood.co.kr/product/gopherwood-k930rce/115/category/128/display/1/',       alt:'K930RCE 어쿠스틱',    label:'K930RCE 어쿠스틱',   desc:'프리미엄 컷어웨이',  badge:'GW K930' },
  PREVIEW_R4:{ image:_OIL.PREVIEW,link:OIL_LINK, alt:'헤리티지 우디오일', label:'헤리티지 우디오일', desc:'연습 후 지판 케어 — 건강한 기타 생활', badge:'오일 케어', oil:true },

  /* ===== 커뮤니티 — 전체 ===== */
  COMM_ALL_L1:{ image:_IMG.K940,   link:'https://m.gopherwood.co.kr/product/gopherwood-k940rce-rhomb/375/category/128/display/1/', alt:'K940RCE RHOMB',  label:'K940RCE RHOMB',  desc:'올솔리드 프리미엄', badge:'GW K940' },
  COMM_ALL_L2:{ image:_IMG.G200,   link:'https://m.gopherwood.co.kr/product/gopherwood-g200/21/category/52/display/1/',           alt:'G200 어쿠스틱',  label:'G200 어쿠스틱',  desc:'탑솔리드 어쿠스틱', badge:'GW G200' },
  COMM_ALL_L3:{ image:_IMG.I110,   link:'https://m.gopherwood.co.kr/product/gopherwood-i110/51/',                                 alt:'i110 일렉기타',  label:'i110 일렉기타',  desc:'밴드를 위한 일렉',  badge:'GW i110' },
  COMM_ALL_L4:{ image:_IMG.G330C,  link:'https://m.gopherwood.co.kr/product/gopherwood-g330c/98/category/130/display/1/',          alt:'G330C 어쿠스틱', label:'G330C 어쿠스틱', desc:'따뜻한 감성 기타',  badge:'GW G330C' },
  COMM_ALL_R1:{ image:_IMG.I232RC, link:'https://m.gopherwood.co.kr/product/gopherwood-i232rc-silver-haze/500/category/104/display/1/', alt:'i232RC Silver Haze', label:'i232RC Silver Haze', desc:'시그니처 일렉기타', badge:'GW i232RC' },
  COMM_ALL_R2:{ image:_IMG.K930,   link:'https://m.gopherwood.co.kr/product/gopherwood-k930rce/115/category/128/display/1/',       alt:'K930RCE 어쿠스틱', label:'K930RCE 어쿠스틱', desc:'프리미엄 컷어웨이', badge:'GW K930' },
  COMM_ALL_R3:{ image:_IMG.I100,   link:'https://m.gopherwood.co.kr/product/gopherwood-i100/89/category/107/display/1/',           alt:'i100 일렉기타',  label:'i100 일렉기타',  desc:'입문 일렉기타',     badge:'GW i100' },
  COMM_ALL_R4:{ image:_OIL.COMM,   link:OIL_LINK, alt:'헤리티지 우디오일', label:'헤리티지 우디오일', desc:'기타 지판 전용 오일 — 알코올 프리, 국내 제조', badge:'오일 케어', oil:true },

  /* ===== 커뮤니티 — 밴드구인 ===== */
  COMM_BAND_L1:{ image:_IMG.I232RC, link:'https://m.gopherwood.co.kr/product/gopherwood-i232rc-silver-haze/500/category/104/display/1/', alt:'i232RC Silver Haze', label:'i232RC Silver Haze', desc:'밴드 퍼포먼스용', badge:'GW i232RC' },
  COMM_BAND_L2:{ image:_IMG.I110,   link:'https://m.gopherwood.co.kr/product/gopherwood-i110/51/',                                 alt:'i110 일렉기타',   label:'i110 일렉기타',   desc:'밴드를 위한 일렉', badge:'GW i110' },
  COMM_BAND_L3:{ image:_IMG.I100,   link:'https://m.gopherwood.co.kr/product/gopherwood-i100/89/category/107/display/1/',           alt:'i100 일렉기타',   label:'i100 일렉기타',   desc:'입문 일렉기타',    badge:'GW i100' },
  COMM_BAND_L4:{ image:_IMG.G200,   link:'https://m.gopherwood.co.kr/product/gopherwood-g200/21/category/52/display/1/',           alt:'G200 어쿠스틱',   label:'G200 어쿠스틱',   desc:'탑솔리드 어쿠스틱', badge:'GW G200' },
  COMM_BAND_R1:{ image:_IMG.K940,   link:'https://m.gopherwood.co.kr/product/gopherwood-k940rce-rhomb/375/category/128/display/1/', alt:'K940RCE RHOMB',   label:'K940RCE RHOMB',   desc:'올솔리드 프리미엄', badge:'GW K940' },
  COMM_BAND_R2:{ image:_IMG.K930,   link:'https://m.gopherwood.co.kr/product/gopherwood-k930rce/115/category/128/display/1/',       alt:'K930RCE 어쿠스틱', label:'K930RCE 어쿠스틱', desc:'프리미엄 컷어웨이', badge:'GW K930' },
  COMM_BAND_R3:{ image:_IMG.G330C,  link:'https://m.gopherwood.co.kr/product/gopherwood-g330c/98/category/130/display/1/',          alt:'G330C 어쿠스틱',  label:'G330C 어쿠스틱',  desc:'감성 어쿠스틱',    badge:'GW G330C' },
  COMM_BAND_R4:{ image:_OIL.COMM_B, link:OIL_LINK, alt:'헤리티지 우디오일', label:'헤리티지 우디오일', desc:'공연 전 지판 관리 — 프로 뮤지션의 선택', badge:'오일 케어', oil:true },

  /* ===== 커뮤니티 — 레슨 ===== */
  COMM_LESSON_L1:{ image:_IMG.G200,   link:'https://m.gopherwood.co.kr/product/gopherwood-g200/21/category/52/display/1/',           alt:'G200 어쿠스틱',  label:'G200 어쿠스틱',  desc:'레슨 시작을 위한 기타', badge:'GW G200' },
  COMM_LESSON_L2:{ image:_IMG.I100,   link:'https://m.gopherwood.co.kr/product/gopherwood-i100/89/category/107/display/1/',           alt:'i100 일렉기타',  label:'i100 일렉기타',  desc:'입문 일렉기타 추천',   badge:'GW i100' },
  COMM_LESSON_L3:{ image:_IMG.G330C,  link:'https://m.gopherwood.co.kr/product/gopherwood-g330c/98/category/130/display/1/',          alt:'G330C 어쿠스틱', label:'G330C 어쿠스틱', desc:'레슨용 어쿠스틱',      badge:'GW G330C' },
  COMM_LESSON_L4:{ image:_IMG.I110,   link:'https://m.gopherwood.co.kr/product/gopherwood-i110/51/',                                 alt:'i110 일렉기타',  label:'i110 일렉기타',  desc:'레슨용 일렉기타',      badge:'GW i110' },
  COMM_LESSON_R1:{ image:_IMG.K940,   link:'https://m.gopherwood.co.kr/product/gopherwood-k940rce-rhomb/375/category/128/display/1/', alt:'K940RCE RHOMB',  label:'K940RCE RHOMB',  desc:'올솔리드 프리미엄',    badge:'GW K940' },
  COMM_LESSON_R2:{ image:_IMG.K930,   link:'https://m.gopherwood.co.kr/product/gopherwood-k930rce/115/category/128/display/1/',       alt:'K930RCE 어쿠스틱', label:'K930RCE 어쿠스틱', desc:'중급자 추천',       badge:'GW K930' },
  COMM_LESSON_R3:{ image:_IMG.I232RC, link:'https://m.gopherwood.co.kr/product/gopherwood-i232rc-silver-haze/500/category/104/display/1/', alt:'i232RC Silver Haze', label:'i232RC Silver Haze', desc:'시그니처 일렉기타', badge:'GW i232RC' },
  COMM_LESSON_R4:{ image:_OIL.COMM_L, link:OIL_LINK, alt:'헤리티지 우디오일', label:'헤리티지 우디오일', desc:'레슨 전 지판 케어 — 손끝을 편안하게', badge:'오일 케어', oil:true },

  /* ===== 커뮤니티 — 중고장터 ===== */
  COMM_USED_L1:{ image:_IMG.K930,   link:'https://m.gopherwood.co.kr/product/gopherwood-k930rce/115/category/128/display/1/',       alt:'K930RCE 어쿠스틱', label:'K930RCE 어쿠스틱', desc:'중고 대신 새 기타',  badge:'GW K930' },
  COMM_USED_L2:{ image:_IMG.G200,   link:'https://m.gopherwood.co.kr/product/gopherwood-g200/21/category/52/display/1/',           alt:'G200 어쿠스틱',   label:'G200 어쿠스틱',   desc:'탑솔리드 어쿠스틱', badge:'GW G200' },
  COMM_USED_L3:{ image:_IMG.I100,   link:'https://m.gopherwood.co.kr/product/gopherwood-i100/89/category/107/display/1/',           alt:'i100 일렉기타',   label:'i100 일렉기타',   desc:'입문 신품 추천',    badge:'GW i100' },
  COMM_USED_L4:{ image:_IMG.G330C,  link:'https://m.gopherwood.co.kr/product/gopherwood-g330c/98/category/130/display/1/',          alt:'G330C 어쿠스틱',  label:'G330C 어쿠스틱',  desc:'따뜻한 감성 기타',  badge:'GW G330C' },
  COMM_USED_R1:{ image:_IMG.K940,   link:'https://m.gopherwood.co.kr/product/gopherwood-k940rce-rhomb/375/category/128/display/1/', alt:'K940RCE RHOMB',   label:'K940RCE RHOMB',   desc:'올솔리드 프리미엄', badge:'GW K940' },
  COMM_USED_R2:{ image:_IMG.I232RC, link:'https://m.gopherwood.co.kr/product/gopherwood-i232rc-silver-haze/500/category/104/display/1/', alt:'i232RC Silver Haze', label:'i232RC Silver Haze', desc:'시그니처 일렉기타', badge:'GW i232RC' },
  COMM_USED_R3:{ image:_IMG.I110,   link:'https://m.gopherwood.co.kr/product/gopherwood-i110/51/',                                 alt:'i110 일렉기타',   label:'i110 일렉기타',   desc:'입문 일렉기타',     badge:'GW i110' },
  COMM_USED_R4:{ image:_OIL.COMM_U, link:OIL_LINK, alt:'헤리티지 우디오일', label:'헤리티지 우디오일', desc:'중고 악기 오일로 새것처럼 — 지판을 되살려라', badge:'오일 케어', oil:true },

  /* ===== 커뮤니티 — 자유게시판 ===== */
  COMM_FREE_L1:{ image:_IMG.I110,   link:'https://m.gopherwood.co.kr/product/gopherwood-i110/51/',                                 alt:'i110 일렉기타',  label:'i110 일렉기타',  desc:'나만의 일렉기타',   badge:'GW i110' },
  COMM_FREE_L2:{ image:_IMG.G200,   link:'https://m.gopherwood.co.kr/product/gopherwood-g200/21/category/52/display/1/',           alt:'G200 어쿠스틱',  label:'G200 어쿠스틱',  desc:'탑솔리드 어쿠스틱', badge:'GW G200' },
  COMM_FREE_L3:{ image:_IMG.I232RC, link:'https://m.gopherwood.co.kr/product/gopherwood-i232rc-silver-haze/500/category/104/display/1/', alt:'i232RC Silver Haze', label:'i232RC Silver Haze', desc:'시그니처 일렉기타', badge:'GW i232RC' },
  COMM_FREE_L4:{ image:_IMG.K930,   link:'https://m.gopherwood.co.kr/product/gopherwood-k930rce/115/category/128/display/1/',       alt:'K930RCE 어쿠스틱', label:'K930RCE 어쿠스틱', desc:'프리미엄 컷어웨이', badge:'GW K930' },
  COMM_FREE_R1:{ image:_IMG.K940,   link:'https://m.gopherwood.co.kr/product/gopherwood-k940rce-rhomb/375/category/128/display/1/', alt:'K940RCE RHOMB',  label:'K940RCE RHOMB',  desc:'올솔리드 프리미엄', badge:'GW K940' },
  COMM_FREE_R2:{ image:_IMG.G330C,  link:'https://m.gopherwood.co.kr/product/gopherwood-g330c/98/category/130/display/1/',          alt:'G330C 어쿠스틱', label:'G330C 어쿠스틱', desc:'감성 어쿠스틱',    badge:'GW G330C' },
  COMM_FREE_R3:{ image:_IMG.I100,   link:'https://m.gopherwood.co.kr/product/gopherwood-i100/89/category/107/display/1/',           alt:'i100 일렉기타',  label:'i100 일렉기타',  desc:'입문 일렉기타',    badge:'GW i100' },
  COMM_FREE_R4:{ image:_OIL.COMM_F, link:OIL_LINK, alt:'헤리티지 우디오일', label:'헤리티지 우디오일', desc:'지판을 건강하게 — 매일 쓰는 기타 케어', badge:'오일 케어', oil:true },

  /* ===== 커뮤니티 — 장비리뷰 ===== */
  COMM_INFO_L1:{ image:_IMG.G330C,  link:'https://m.gopherwood.co.kr/product/gopherwood-g330c/98/category/130/display/1/',          alt:'G330C 어쿠스틱',  label:'G330C 어쿠스틱',  desc:'리뷰어 선택 어쿠스틱', badge:'GW G330C' },
  COMM_INFO_L2:{ image:_IMG.K940,   link:'https://m.gopherwood.co.kr/product/gopherwood-k940rce-rhomb/375/category/128/display/1/', alt:'K940RCE RHOMB',   label:'K940RCE RHOMB',   desc:'올솔리드 프리미엄',   badge:'GW K940' },
  COMM_INFO_L3:{ image:_IMG.I232RC, link:'https://m.gopherwood.co.kr/product/gopherwood-i232rc-silver-haze/500/category/104/display/1/', alt:'i232RC Silver Haze', label:'i232RC Silver Haze', desc:'리뷰어 선택 일렉기타', badge:'GW i232RC' },
  COMM_INFO_L4:{ image:_IMG.G200,   link:'https://m.gopherwood.co.kr/product/gopherwood-g200/21/category/52/display/1/',           alt:'G200 어쿠스틱',   label:'G200 어쿠스틱',   desc:'탑솔리드 어쿠스틱',   badge:'GW G200' },
  COMM_INFO_R1:{ image:_IMG.I110,   link:'https://m.gopherwood.co.kr/product/gopherwood-i110/51/',                                 alt:'i110 일렉기타',   label:'i110 일렉기타',   desc:'입문 일렉기타',        badge:'GW i110' },
  COMM_INFO_R2:{ image:_IMG.K930,   link:'https://m.gopherwood.co.kr/product/gopherwood-k930rce/115/category/128/display/1/',       alt:'K930RCE 어쿠스틱', label:'K930RCE 어쿠스틱', desc:'프리미엄 컷어웨이',   badge:'GW K930' },
  COMM_INFO_R3:{ image:_IMG.I100,   link:'https://m.gopherwood.co.kr/product/gopherwood-i100/89/category/107/display/1/',           alt:'i100 일렉기타',   label:'i100 일렉기타',   desc:'장비 구매 입문',       badge:'GW i100' },
  COMM_INFO_R4:{ image:_OIL.COMM_I, link:OIL_LINK, alt:'헤리티지 우디오일', label:'헤리티지 우디오일', desc:'장비 케어의 기본 — 지판 오일로 시작하세요', badge:'오일 케어', oil:true },

  /* ===== 악보 공유 ===== */
  SCORE_L1:{ image:_IMG.G200,   link:'https://m.gopherwood.co.kr/product/gopherwood-g200/21/category/52/display/1/',           alt:'G200 어쿠스틱',       label:'G200 어쿠스틱',       desc:'악보를 연주하기 위한 기타',  badge:'GW G200' },
  SCORE_L2:{ image:_IMG.G330C,  link:'https://m.gopherwood.co.kr/product/gopherwood-g330c/98/category/130/display/1/',          alt:'G330C 어쿠스틱',      label:'G330C 어쿠스틱',      desc:'감성 연주를 위해',           badge:'GW G330C' },
  SCORE_L3:{ image:_IMG.K940,   link:'https://m.gopherwood.co.kr/product/gopherwood-k940rce-rhomb/375/category/128/display/1/', alt:'K940RCE RHOMB',       label:'K940RCE RHOMB',       desc:'올솔리드 프리미엄',          badge:'GW K940' },
  SCORE_L4:{ image:_IMG.G200_2, link:'https://m.gopherwood.co.kr/product/gopherwood-g200/21/category/52/display/1/',           alt:'G200 라이프스타일',   label:'G200 라이프스타일',   desc:'함께하는 음악 생활',          badge:'GW G200' },
  SCORE_R1:{ image:_IMG.I232RC, link:'https://m.gopherwood.co.kr/product/gopherwood-i232rc-silver-haze/500/category/104/display/1/', alt:'i232RC Silver Haze', label:'i232RC Silver Haze', desc:'시그니처 일렉기타',  badge:'GW i232RC' },
  SCORE_R2:{ image:_IMG.I110,   link:'https://m.gopherwood.co.kr/product/gopherwood-i110/51/',                                 alt:'i110 일렉기타',       label:'i110 일렉기타',       desc:'입문 일렉기타',              badge:'GW i110' },
  SCORE_R3:{ image:_IMG.K930,   link:'https://map.naver.com/p/search/%EA%B3%A0%ED%8D%BC%EC%9A%B0%EB%93%9C',                   alt:'K930RCE 어쿠스틱',    label:'K930RCE 어쿠스틱',   desc:'프리미엄 컷어웨이',          badge:'GW K930' },
  SCORE_R4:{ image:_OIL.PREVIEW,link:OIL_LINK, alt:'헤리티지 우디오일', label:'헤리티지 우디오일', desc:'악보 연습 후 지판 케어 — 건강한 기타 생활', badge:'오일 케어', oil:true },
};

/* ──────────────────────────────────────────────
   카드 렌더링
────────────────────────────────────────────── */
function renderAdCard(key) {
  const ad = ADS[key];
  if (!ad) return '';
  if (ad.oil) {
    /* 헤리티지 오일 전용 카드 */
    return `
<a class="gw-ad-card gw-ad-oil" href="${ad.link}" target="_blank" rel="noopener noreferrer">
  <div class="gw-ad-img">
    <img src="${ad.image}" alt="${ad.alt}" loading="lazy">
    <div class="gw-ad-oil-badge">🌿 오일 케어</div>
  </div>
  <div class="gw-ad-body">
    <div class="gw-ad-brand">GOPHERWOOD</div>
    <div class="gw-ad-name">${ad.label}</div>
    <div class="gw-ad-desc">${ad.desc}</div>
    <div class="gw-ad-tags">
      <span class="gw-tag gw-tag-green">알코올 프리</span>
      <span class="gw-tag gw-tag-blue">국내 제조</span>
    </div>
    <div class="gw-ad-cta">지금 구매하기 →</div>
  </div>
</a>`;
  }
  /* 일반 제품 카드 — 이미지만 표시 */
  return `
<a class="gw-ad-card gw-ad-img-only" href="${ad.link}" target="_blank" rel="noopener noreferrer">
  <div class="gw-ad-img">
    <img src="${ad.image}" alt="${ad.alt}" loading="lazy">
  </div>
</a>`;
}

/* ──────────────────────────────────────────────
   마운트 함수 — 컨테이너 id + 슬롯 키 배열
────────────────────────────────────────────── */
function mountAds(containerId, slotKeys) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = slotKeys.map(renderAdCard).join('');
}
/* 하위 호환 단수 버전 */
function mountAd(containerId, slotKey) {
  mountAds(containerId, [slotKey]);
}

/* ──────────────────────────────────────────────
   CSS 주입 — 페이지 어느 구조에서도 동작
────────────────────────────────────────────── */
(function injectAdCSS() {
  if (document.getElementById('gw-ad-css')) return;
  const s = document.createElement('style');
  s.id = 'gw-ad-css';
  s.textContent = `

/* ════ 광고 사이드바 컬럼 ════ */
.gw-ad-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 172px;
  min-width: 172px;
  position: sticky;
  top: 76px;
  align-self: flex-start;
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  scrollbar-width: none;
  flex-shrink: 0;
}
.gw-ad-col::-webkit-scrollbar { display: none; }

/* 그리드/플렉스 직접 자식일 때 너비 100% */
.page-layout > .gw-ad-col,
.comm-main-layout > .gw-ad-col,
.upload-layout > .upload-side > .gw-ad-col,
.player-layout > .promo-side > .gw-ad-col,
.intro-layout > .intro-side > .gw-ad-col {
  width: 100%;
  min-width: 0;
  position: sticky;
  top: 80px;
  align-self: flex-start;
}

/* ════ 광고 카드 공통 ════ */
.gw-ad-card {
  display: block;
  text-decoration: none;
  border-radius: 14px;
  overflow: hidden;
  background: #ffffff;
  border: 1.5px solid #e8e8e8;
  box-shadow: 0 2px 8px rgba(0,0,0,0.07);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  cursor: pointer;
}
.gw-ad-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 28px rgba(0,0,0,0.14);
  border-color: #d45d00;
}

/* 이미지 */
.gw-ad-img {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  background: #f4f4f4;
}
.gw-ad-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.35s ease;
}
.gw-ad-card:hover .gw-ad-img img {
  transform: scale(1.07);
}

/* 뱃지 */
.gw-ad-badge {
  position: absolute;
  top: 7px;
  left: 7px;
  background: rgba(212,93,0,0.88);
  color: #fff;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  padding: 2px 7px;
  border-radius: 20px;
}

/* 오일 뱃지 */
.gw-ad-oil-badge {
  position: absolute;
  top: 7px;
  left: 7px;
  background: rgba(101,65,10,0.85);
  color: #fde68a;
  font-size: 0.58rem;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 20px;
}

/* 텍스트 영역 */
.gw-ad-body {
  padding: 9px 11px 12px;
}
.gw-ad-brand {
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: #bbb;
  margin-bottom: 3px;
}
.gw-ad-name {
  font-size: 0.80rem;
  font-weight: 800;
  color: #111;
  line-height: 1.3;
  margin-bottom: 3px;
  letter-spacing: -0.01em;
}
.gw-ad-desc {
  font-size: 0.68rem;
  color: #888;
  line-height: 1.45;
  margin-bottom: 7px;
}
.gw-ad-cta {
  font-size: 0.68rem;
  font-weight: 800;
  color: #d45d00;
}

/* 오일 태그 */
.gw-ad-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-bottom: 6px;
}
.gw-tag {
  font-size: 0.58rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 10px;
}
.gw-tag-green { background: #dcfce7; color: #16a34a; }
.gw-tag-blue  { background: #dbeafe; color: #1d4ed8; }

/* ════ 이미지 전용 카드 (텍스트 없음) ════ */
.gw-ad-img-only .gw-ad-img {
  aspect-ratio: 3 / 4;
  border-radius: 14px;
}
.gw-ad-img-only .gw-ad-img img {
  border-radius: 14px;
}

/* ════ intro-side 전용: 두 카드 합친 높이 ════ */
.intro-side .gw-ad-card {
  display: flex;
  flex-direction: column;
}
.intro-side .gw-ad-img {
  aspect-ratio: unset;
  height: 260px;
}
.intro-side .gw-ad-img-only .gw-ad-img {
  aspect-ratio: unset;
  height: 260px;
  border-radius: 14px;
}
.intro-side .gw-ad-oil .gw-ad-img {
  height: 220px;
}

/* ════ 헤리티지 오일 카드 전용 스타일 ════ */
.gw-ad-oil {
  border-color: #e2c98a;
  background: linear-gradient(170deg, #fffef8 0%, #fffbef 100%);
}
.gw-ad-oil:hover {
  border-color: #b8892a;
  box-shadow: 0 10px 30px rgba(140,90,10,0.18);
}
.gw-ad-oil .gw-ad-brand { color: #a07030; }
.gw-ad-oil .gw-ad-name  { color: #3a2000; }
.gw-ad-oil .gw-ad-cta   { color: #8a5010; font-weight: 800; }

/* ════ 홈 FAB 버튼 ════ */
.gw-home-fab {
  position: fixed;
  bottom: 26px;
  left: 26px;
  width: 46px;
  height: 46px;
  background: #d45d00;
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
  text-decoration: none;
  box-shadow: 0 4px 16px rgba(212,93,0,0.38);
  transition: background 0.18s, transform 0.18s;
  z-index: 800;
}
.gw-home-fab:hover {
  background: #b84e00;
  transform: scale(1.12);
}
.gw-home-fab-tip {
  position: absolute;
  left: 54px;
  top: 50%;
  transform: translateY(-50%);
  background: #1e2433;
  color: #fff;
  font-size: 0.74rem;
  font-weight: 700;
  padding: 4px 11px;
  border-radius: 8px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s;
}
.gw-home-fab:hover .gw-home-fab-tip { opacity: 1; }

/* ════ 반응형 ════ */
@media (max-width: 1280px) {
  .gw-ad-col.gw-ad-right { display: none; }
  .intro-side--right { display: none; }
}
@media (max-width: 1160px) {
  .intro-side { display: none; }
}
@media (max-width: 900px) {
  .gw-ad-col { display: none; }
}
  `;
  document.head.appendChild(s);
})();

/* ──────────────────────────────────────────────
   홈 FAB 버튼 자동 삽입
   — index.html 은 삽입 안 함
────────────────────────────────────────────── */
(function insertHomeFab() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _insertFab);
  } else {
    _insertFab();
  }
  function _insertFab() {
    /* index.html 이면 홈 버튼 불필요 */
    const path = location.pathname;
    if (path === '/' || path.endsWith('index.html') || path === '') return;
    if (document.getElementById('gw-home-fab')) return;
    const fab = document.createElement('a');
    fab.id   = 'gw-home-fab';
    fab.href = 'index.html';
    fab.className = 'gw-home-fab';
    fab.innerHTML = '<i class="fas fa-home"></i><span class="gw-home-fab-tip">홈으로</span>';
    document.body.appendChild(fab);
  }
})();
