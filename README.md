# TabScribe — COODUCK 기타 타브 악보 생성기

> GOPHERWOOD 기타 브랜드 연계 음악 분석 웹앱

---

## 📋 완료된 기능

### 페이지 목록

| 페이지 | URL | 설명 |
|---|---|---|
| `index.html` | `/` | 메인 홈 — MP3 업로드 → 타브 악보 자동 생성 |
| `rehearsal.html` | `/rehearsal.html` | 서울 합주실 찾기 |
| `repair.html` | `/repair.html` | 서울 기타·베이스 리페어샵 |
| `instrument.html` | `/instrument.html` | 서울 악기샵 (스마트스토어 운영 업체) |
| `community.html` | `/community.html` | 뮤지션 커뮤니티 |

---

## 🎯 광고 시스템 (js/ads.js)

### 구조
- **모든 페이지** 좌우 사이드에 **각 4개씩** 광고 카드 표시
- **헤리티지 우디오일** 광고가 각 페이지 우측 마지막(R4) 슬롯에 1개 배치
- `mountAds(containerId, [슬롯키…])` 호출로 렌더링
- 중앙 관리: `js/ads.js`의 `_IMG` 또는 `_OIL` 값만 수정하면 전체 반영

### 광고 컨테이너 클래스
- `gw-ad-col gw-ad-left` — 왼쪽 광고 컬럼
- `gw-ad-col gw-ad-right` — 오른쪽 광고 컬럼
- `page-layout` 그리드의 직접 자식으로 배치 (sticky-inside-sticky 방지)

### 광고 슬롯 키 목록

| 페이지 | 왼쪽 슬롯 (L1~L4) | 오른쪽 슬롯 (R1~R4, R4=오일) |
|---|---|---|
| 메인 기본 | HOME_DEFAULT_L1~L4 | HOME_DEFAULT_R1~R4 |
| 메인 분석 | HOME_ANALYZE_L1~L4 | HOME_ANALYZE_R1~R4 |
| 합주실 | REHEARSAL_L1~L4 | REHEARSAL_R1~R4 |
| 리페어샵 | REPAIR_L1~L4 | REPAIR_R1~R4 |
| 악기샵 | INSTRUMENT_L1~L4 | INSTRUMENT_R1~R4 |
| 커뮤니티 전체 | COMM_ALL_L1~L4 | COMM_ALL_R1~R4 |
| 커뮤니티 밴드 | COMM_BAND_L1~L4 | COMM_BAND_R1~R4 |
| 커뮤니티 레슨 | COMM_LESSON_L1~L4 | COMM_LESSON_R1~R4 |
| 커뮤니티 중고 | COMM_USED_L1~L4 | COMM_USED_R1~R4 |
| 커뮤니티 자유 | COMM_FREE_L1~L4 | COMM_FREE_R1~R4 |
| 커뮤니티 리뷰 | COMM_INFO_L1~L4 | COMM_INFO_R1~R4 |

### 헤리티지 우디오일 이미지 배치

| 페이지 | 이미지 파일 |
|---|---|
| 메인 기본화면 | `images/oil-ad-dark.jpg` |
| 메인 분석화면 | `images/oil-ad-bright.jpg` |
| 합주실 | `images/oil-ad-craft.jpg` |
| 리페어샵 | `images/oil-ad-retail.jpg` |
| 악기샵 | `images/oil-ad-dark.jpg` |
| 커뮤니티 전체 | `images/oil-ad-retail.jpg` |
| 커뮤니티 밴드 | `images/oil-ad-craft.jpg` |
| 커뮤니티 레슨 | `images/oil-ad-bright.jpg` |
| 커뮤니티 중고 | `images/oil-ad-retail.jpg` |
| 커뮤니티 자유 | `images/oil-ad-dark.jpg` |
| 커뮤니티 리뷰 | `images/oil-ad-craft.jpg` |

---

## 🏠 홈 버튼

- **index.html**: 홈 페이지이므로 FAB 버튼 없음
- **기타 모든 페이지**: 좌하단 고정 홈 FAB 버튼 (`id="gw-home-fab" class="home-fab"`)
  - `ads.js`의 `insertHomeFab()` 이 `gw-home-fab` id를 확인하여 중복 삽입 방지

---

## ⚙️ 주요 기술 사항

### 광고 표시 문제 해결 이력
- **원인**: `DOMContentLoaded` 이벤트 리스너가 `</body>` 직전 스크립트에 추가될 때 이미 이벤트가 발생한 경우 광고 미표시
- **해결**: 모든 `mountAds()` 호출을 `DOMContentLoaded` 리스너 대신 **즉시 실행**으로 변경
- **추가 원인**: `ad-sidebar-col` 클래스가 `side-panel` (sticky) 안에 중첩되어 sticky-inside-sticky 충돌
- **해결**: 광고 컨테이너를 `side-panel` 밖으로 이동하여 `page-layout` 그리드의 직접 자식으로 배치
- **CSS 통일**: 기존 `ad-sidebar-col` → `gw-ad-col` 클래스로 전체 통일

### TabScribe v4.7 기능 (index.html) — 최신 업데이트
- **코드박스 프리뷰 7카드 슬라이드 전면 재설계**
  - 총 7개 카드 동시 표시: 지나간 코드 2개(왼쪽, 흐릿) + **현재 코드 1개(중앙, 강조)** + 다음 코드 4개(오른쪽, 점진 투명)
  - 현재 코드 카드: 가장 크게(148×188px), 파란 테두리 + 빛 효과로 강조
  - 재생 진행에 따라 오른쪽→왼쪽으로 카드가 슬라이드 이동 (transition 애니메이션)
  - 빈 슬롯은 점선 박스로 표시
  - 좌우 엣지 그라디언트 마스크 + 중앙 파란 세로 하이라이트 선
- **코드 다이어그램 손가락 번호 추가**
  - 검지(1)/중지(2)/약지(3)/소지(4) 번호를 운지 점 안에 흰색 숫자로 표시
  - 바레 코드는 바레 바 위에 '1' 표시
  - 다크 테마 전용 다이어그램 렌더러(`_drawChordDiagramDark`) 추가 — 파란색 계열 운지점
  - `_getFullChordDictionary`에 주요 코드(C, D, E, F, G, Am, Em, Dm 등) finger 데이터 추가
- **`drawChordDiagram` scale 지원** — 임의 크기 canvas에 비율 유지하며 렌더
- **코드 박스 (Chord Box) 추가** — 파형 박스 바로 아래 배치
  - 분석 완료 후 마디별 4칸 코드 흐름을 가로 스크롤 트랙으로 표시
  - 각 칸(슬롯)은 마디 번호 + 박자(1~4) + 코드명을 표시
  - 음원 재생 시 현재 마디/박자에 맞춰 파란색 강조 + 자동 스크롤
  - 코드박스 아래 "현재 코드" 다이어그램 + "NEXT 1~3" 다음 코드 3개 미리보기
  - 슬롯 클릭 → 팝업 코드 수정 → 타브 악보 코드명 즉시 동기화
  - 전조 시 코드박스 코드명도 함께 자동 갱신
  - 편집기(tabEditor) 코드 수정 시 코드박스도 자동 반영
- **악보 수동 수정 안내 배너 삭제** — `_showEditNoticeBanner()` 제거
- **사이트 컨셉 변경**: "타브 악보 자동 생성" → **"코드 악보 자동 생성"**
  - index.html, community.html, score.html, portfolio.html 전체 텍스트 일괄 변경
  - 메타태그, 헤더, 버튼, 설명문 등 모든 노출 텍스트 반영
- **악보 가독성 대폭 향상** (tabRenderer.js)
  - 프렛 숫자 네모 박스 완전 제거 — 줄 위에 숫자만 깔끔하게 표시
  - 개방현(0): 숫자 0으로 표시 (기존 원형 기호 제거)
  - 뮤트(×): 기호만 텍스트로 표시
  - 줄 간격 28→34px, 프렛 폰트 13→14px, 코드명 폰트 15→16px
  - 줄 굵기 강화 (6번줄 1.4→1.8, 기타 줄 1.0px으로 통일)
  - PAD_TOP 54→46px (코드명 영역 최소화, 악보 비율 개선)
  - TAB 레이블 및 현 이름 폰트 확대
- **악보 너비 100% 표시** (tabRenderer.js)
  - PAD_SAFE=12px 적용으로 악보가 컨테이너 가로를 꽉 채움
  - applyTabScrollHeight 최솟값 440px, 최댓값 1000px으로 확대
- **악기 레이블 텍스트** "기본 기타코드폼" → "기본 기타 코드 악보" 등 변경

---

## 📂 파일 구조

```
index.html          메인 홈 (타브 생성기)
rehearsal.html      합주실 찾기
repair.html         리페어샵
instrument.html     악기샵
community.html      뮤지션 커뮤니티
css/
  style.css         메인 스타일
js/
  ads.js            광고 중앙 관리
  audioEngine.js    오디오 엔진
  pitchDetector.js  피치 감지
  tabConverter.js   타브 변환
  tabRenderer.js    타브 렌더링 (SVG, 편집모드 지원)
  tabEditor.js      TAB 에디터 UI (코드/프렛 편집, 코드폼 추천)
  main.js           메인 로직
images/
  oil-ad-*.jpg      헤리티지 우디오일 광고 이미지
  gw-*.jpg          GOPHERWOOD 제품 이미지
  product*.jpg      제품 이미지
```

---

## 🔜 미구현 / 다음 개발 권장사항

1. **멀티트랙 분리** (보컬+드럼 분리) — 서버사이드 처리 필요
2. **PDF/MusicXML 내보내기**
3. **커뮤니티 게시물 이미지 첨부**
4. **사용자 좋아요 기능 (중복 방지)**
5. **광고 이미지 고해상도 교체** — `_IMG` 상수의 경로만 변경
6. **모바일 커뮤니티 사이드바** — 오버레이 드로어
7. **합주실/리페어샵/악기샵 데이터 검증** — 현장/전화 확인 권장
