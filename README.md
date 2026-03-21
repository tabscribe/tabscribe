# 코드덕쿠 (Codeducku) — 기타·뮤지션 커뮤니티

> 기타 초보자를 위한 코드 악보 생성기 & 음악인 정보/커뮤니티 사이트

---

## 📋 완료된 기능

### 🗂️ 헤더 네비게이션 (4개 챕터 구조)

헤더가 **2행 레이아웃 × 4개 챕터**로 구성됩니다.

| 행 | 그룹 | 색상 | 항목 |
|---|---|---|---|
| 1행 | 📍 정보 | 초록(teal) | 합주실, 리페어샵, 악기샵, 음악학원, 공연장 |
| 1행 | 🎵 코덕서비스 | 보라(violet) | 악보공유, 음원분석 |
| 2행 | 💬 커뮤니티 | 주황(orange) | 자유게시판, 장비리뷰, 밴드구인구직, 개인레슨, 중고장터 |
| 2행 | 🎬 영상 | 빨강(red) | 리뷰영상, 카피영상, 재미있는영상, 밴드라이브 |

### 페이지 목록

| 페이지 | URL | 설명 |
|---|---|---|
| `index.html` | `/` | 메인 홈 — MP3 업로드 → 타브 악보 자동 생성 |
| `rehearsal.html` | `/rehearsal.html` | 서울 합주실 찾기 + 쿠슐랭 가이드 |
| `repair.html` | `/repair.html` | 서울 기타·베이스 리페어샵 + 쿠슐랭 가이드 |
| `instrument.html` | `/instrument.html` | 서울 악기샵 + 쿠슐랭 가이드 |
| `academy.html` | `/academy.html` | 서울 음악학원 찾기 + 쿠슐랭 가이드 |
| `venue.html` | `/venue.html` | 서울 공연장 찾기 + 쿠슐랭 가이드 |
| `community.html` | `/community.html` | 뮤지션 커뮤니티 (자유/장비/밴드/레슨/중고) |
| `score.html` | `/score.html` | 악보 공유 |
| `video-review.html` | `/video-review.html` | 리뷰 영상 + 쿠슐랭 가이드 HOF |
| `video-cover.html` | `/video-cover.html` | 카피 영상 + 쿠슐랭 가이드 HOF |
| `video-fun.html` | `/video-fun.html` | 재미있는 영상 + 쿠슐랭 가이드 HOF |
| `video-bandstage.html` | `/video-bandstage.html` | 밴드라이브 영상 + 쿠슐랭 가이드 HOF |
| `auth.html` | `/auth.html` | 로그인/회원가입 통합 |
| `login.html` | `/login.html` | 로그인 |
| `signup.html` | `/signup.html` | 회원가입 |
| `profile.html` | `/profile.html` | 프로필 |
| `reset-password.html` | `/reset-password.html` | 비밀번호 재설정 |

---

## ✅ 최근 완료된 주요 작업 (2026-03-01)

### 1. 🖼️ 사이드 배너 이미지 완전 제거
- 모든 페이지(index, rehearsal, repair, instrument, academy, venue, community, score)에서 `gw-ad-col`, `mountAds` 관련 광고 코드 완전 제거
- 단일 컬럼 레이아웃으로 전환 (`.page-layout` → 1fr 단일 컬럼)

### 2. 🍋 쿠슐랭 가이드 — 정보 페이지
- rehearsal, repair, instrument, academy, venue 페이지에 **쿠슐랭 가이드 명예의 전당(HOF)** 섹션 적용
- Supabase `ratings` 테이블 기반 실시간 집계
- HOF 순위 카드 클릭 시 해당 업체 카드로 **스크롤 이동 + 하이라이트** 효과 (`scrollToCard` 함수)

### 3. 🎬 쿠슐랭 가이드 — 영상 페이지 (신규)
- video-review, video-cover, video-fun, video-bandstage 4개 페이지에 **좋아요 기반 HOF 랭킹** 추가
- `localStorage`에 좋아요 정보 저장 (키: `codeducku_likes_{page}`)
- 영상 카드에 ❤️ 추천 버튼 추가 — 토글 방식, 추천 수 실시간 반영
- HOF 순위 클릭 시 해당 영상 카드로 스크롤 이동 + 빨간 하이라이트

### 4. 🔐 평가 버튼 로그인 상태 이슈 수정
- **모바일 환경** 및 페이지 초기 로드 시 `window.currentUser`가 늦게 설정되는 타이밍 이슈 해결

### 5. 🎥 영상 재생 오류 수정
- 이전 `?autoplay=1` 파라미터 → `?enablejsapi=1&rel=0&modestbranding=1` 으로 변경

---

## ✅ SEO 최적화 작업 (2026-03-16)

### 6. 🔍 검색엔진 최적화 전면 강화

#### sitemap.xml 업데이트
- `analyze.html`, `portfolio.html` 등 **누락 페이지 2개 추가** (총 19개 URL)
- 모든 `lastmod` 날짜를 `2026-03-16`으로 갱신
- 커뮤니티 카테고리 우선순위를 `0.7 → 0.8`로 상향

#### og:url 태그 전면 추가
- 기존 HTML 파일 11개에 `og:url` 태그 누락 확인 → 전부 추가 완료
- video-*.html 4개 파일에는 SEO 태그 자체가 없었음 → `title`, `description`, `canonical`, `og:*`, `twitter:*`, `google-site-verification`, `naver-site-verification` 모두 신규 추가

#### JSON-LD 구조화 데이터 추가 (Google Rich Results)
| 페이지 | Schema 타입 |
|---|---|
| `index.html` | `WebSite` + `SearchAction` + `Organization` |
| `rehearsal.html` | `WebPage` (isPartOf WebSite) |
| `repair.html` | `WebPage` |
| `instrument.html` | `WebPage` |
| `venue.html` | `WebPage` |
| `academy.html` | `WebPage` |
| `community.html` | `WebPage` |
| `score.html` | `WebPage` |
| `analyze.html` | `WebApplication` (MusicApplication) |

#### SEO 현황 요약
| 항목 | 상태 |
|---|---|
| robots.txt | ✅ 정상 (크롤링 허용, 인증 페이지 차단) |
| sitemap.xml | ✅ 19개 URL, 최신 날짜 |
| canonical 태그 | ✅ 전 페이지 완비 |
| og:url 태그 | ✅ 전 페이지 완비 |
| JSON-LD 구조화 데이터 | ✅ 9개 주요 페이지 |
| Google Search Console 인증 | ✅ 메타태그 삽입 완료 |
| Naver Search Advisor 인증 | ✅ 메타태그 삽입 완료 |

### ⚠️ 직접 해야 할 추가 작업
1. **Google Search Console** (https://search.google.com/search-console)
   - 속성 추가: `https://codeducku.vercel.app/`
   - 사이트맵 제출: `https://codeducku.vercel.app/sitemap.xml`
2. **Naver Search Advisor** (https://searchadvisor.naver.com)
   - 사이트 등록 후 사이트맵 제출: `https://codeducku.vercel.app/sitemap.xml`
3. 배포 후 **1~2주 대기** (구글: 3일~2주, 네이버: 1~4주)

## ✅ 버그 수정 작업 (2026-03-21)

### 7. 🐛 전체 버그 수정 — 로그인/레이아웃/쿠슐랭 가이드

#### community.html — `currentUser` 변수 충돌 수정 (핵심 버그)
- **문제**: community.html 인라인 스크립트에 `let currentUser = null` 지역 변수 선언 → `auth-header.js`의 `window.currentUser`와 **완전히 별개**로 작동해, 로그인 후에도 커뮤니티에서 "로그인 필요" 오류 발생
- **수정**: 지역 `currentUser` 변수 제거, 모든 참조를 `window.currentUser`로 통일
- `doLogout()` → `authLogout()`으로 통일 (auth-header.js에 정의된 함수 사용)
- 모바일 로그아웃 버튼 `onclick`도 `authLogout()`으로 변경
- `mobileAdminBtn` 추가 (관리자 모바일 메뉴 버튼 누락 수정)

#### CSS — 로그인 후 헤더 레이아웃 깨짐 수정
- **문제**: `.header-top-row`에 `overflow: hidden` → 로그인 시 프로필 버튼 + 로그아웃 버튼 + 관리자 버튼으로 늘어날 때 버튼이 **잘려 보임**
- **수정**: `overflow: hidden` 제거, `flex-wrap: wrap` 적용
- `.header-auth-btns`에도 `flex-wrap: wrap` 추가
- `.header-login-box`에 `flex-shrink: 0` 추가

#### 쿠슐랭 가이드 (loadHallOfFame) — 오류 시 폴백 수정
- **문제**: Supabase 네트워크 오류 시 `catch` 블록에서 아무 처리 없이 종료 → `hofContainer`가 "불러오는 중..." 상태에서 **영구 멈춤**
- **수정**: 오류 발생 시에도 빈 배열로 `buildHallOfFame()` 호출 → "선정 중" 빈 슬롯 표시
- 적용 파일: `rehearsal.html`, `repair.html`, `instrument.html`, `academy.html`, `venue.html`

#### score.html — JS 로드 순서 수정 + 중복 `</body></html>` 제거
- **문제 1**: `js/supabase.js`가 Supabase CDN보다 먼저 위치해 의존성 순서 불안정
- **수정 1**: 로드 순서를 `supabase CDN → auth.js → supabase.js → auth-header.js`로 재정렬
- **문제 2**: `</body></html>`이 파일 끝에 **2번** 반복
- **수정 2**: 중복 태그 제거

#### video-fun.html, video-bandstage.html — mobileAdminBtn 누락 수정
- 두 파일에 `id="mobileAdminBtn"` 모바일 관리자 버튼이 없어 관리자 로그인 시 모바일 메뉴에 관리자 항목 미표시
- 두 파일에 `mobileAdminBtn` 추가

#### community.html — CSS 완전 누락 수정 (2026-03-21 추가)
- **문제**: `community.html`이 `css/style.css`를 로드하지 않으며, 인라인 `<style>`에 `:root` CSS 변수(`--bg`, `--text`, `--border`, `--orange`, `--muted`, `--sub`, `--border-light`, `--text-muted` 등)와 헤더 공통 클래스가 전혀 없어 **헤더·본문 레이아웃이 텍스트 나열 상태로 완전 파괴**
- **수정**: 인라인 `<style>` 상단에 `:root` 변수 전체 및 공통 헤더/레이아웃 CSS 추가
- 누락됐던 `--text-muted` 변수도 추가

#### 광고 배너(page-promo-banner) CSS 누락 수정 (2026-03-21 추가)
- **문제**: `community.html`에 `.page-promo-banner` CSS가 없어 이미지가 **화면 전체를 덮는 크기**로 표시됨
- **수정**: community.html 인라인 `<style>`에 `.page-promo-banner` 전체 CSS 추가 (height: 100px, object-fit: contain 등 포함)
- 전체 확인: `rehearsal.html`, `repair.html`, `instrument.html`, `venue.html` — 인라인 CSS로 배너 스타일 정상 포함, `academy.html`, `video-*.html`, `index.html` — `css/style.css`를 통해 배너 스타일 정상 제공

---

### Supabase `ratings` 테이블
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | UUID | 평가 고유 ID |
| `page` | text | 페이지 구분 (rehearsal/repair/instrument/academy/venue) |
| `place_id` | text | 업체 고유 ID (`{page}_{name}`) |
| `place_name` | text | 업체명 |
| `user_id` | text | 유저 ID (Supabase auth UUID) |
| `score1` | integer | 첫 번째 평가 항목 (1~5) |
| `score2` | integer | 두 번째 평가 항목 (1~5) |
| `created_at` | timestamp | 생성 시각 |

### localStorage (영상 좋아요)
| 키 | 내용 |
|---|---|
| `codeducku_likes_{page}` | `{videoId: count}` 객체 |
| `codeducku_my_likes_{page}` | `{videoId: 1}` 내 좋아요 기록 |
| `codeducku_videos_{page}` | 영상 목록 배열 |

---

## 🔑 주요 기능 경로 요약

| 기능 | 경로/파라미터 |
|---|---|
| 합주실 | `/rehearsal.html` |
| 커뮤니티 장비리뷰 | `/community.html?cat=gear` |
| 커뮤니티 밴드구인 | `/community.html?cat=band` |
| 커뮤니티 개인레슨 | `/community.html?cat=lesson` |
| 커뮤니티 중고장터 | `/community.html?cat=market` |

---

## 🚧 미구현 / 개선 예정

- [ ] 영상 좋아요 서버 동기화 (현재 localStorage만 사용 → 브라우저 초기화 시 초기화됨)
- [ ] community.html 게시글 이미지 업로드
- [ ] score.html 악보 PDF 다운로드
- [ ] 사용자별 즐겨찾기 업체 저장
- [ ] 전국 지역 확장 (현재 서울만)
- [ ] AI 기반 음원 분석 정확도 개선

---

## 🔧 외부 서비스

- **Supabase**: `https://aubagaamktdmtvfabcbd.supabase.co` — 인증, 평가 데이터 저장
- **Font Awesome 6.4.0**: 아이콘
- **Google Fonts (Inter, Noto Sans KR)**: 폰트
- **YouTube Embed API**: 영상 재생

---

## 📁 주요 JS 파일

| 파일 | 역할 |
|---|---|
| `js/auth.js` | Supabase 클라이언트, 로그인/회원가입/세션 관리 |
| `js/auth-header.js` | 헤더 로그인 버튼 UI 관리, 로그인 상태 변경 감지 |
| `js/rating.js` | 쿠슐랭 평가 시스템 (HOF 빌드, 별점 UI, Supabase CRUD) |
| `js/ads.js` | (레거시) 광고 마운트 — 현재 미사용 |
