/**
 * CodeDuck — 방문자 트래킹 (tracker.js)
 * 모든 주요 페이지 하단에 포함하세요.
 *
 * 동작 방식:
 *  1. sessionStorage에 session_id 저장 (탭 단위, 닫으면 소멸)
 *  2. 같은 세션 + 같은 페이지는 30분 내 중복 기록 안 함
 *  3. Supabase page_views 테이블에 비동기 INSERT
 *  4. 광고 차단기 등으로 실패해도 오류 무시
 */
(function () {
    'use strict';

    const SB_URL = 'https://aubagaamktdmtvfabcbd.supabase.co';
    const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1YmFnYWFta3RkbXR2ZmFiY2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTc5NDksImV4cCI6MjA4Nzc3Mzk0OX0.XoKiaw8nCJc1Hq9OjiURrGi_ZA-6sU4xhqqpDGcC2IM';

    // ── 페이지 이름 추출 ──────────────────────────────
    function getPageName() {
        const path = location.pathname.split('/').pop() || 'index.html';
        const map = {
            'index.html'        : 'index',
            ''                  : 'index',
            'community.html'    : 'community',
            'rehearsal.html'    : 'rehearsal',
            'repair.html'       : 'repair',
            'instrument.html'   : 'instrument',
            'academy.html'      : 'academy',
            'venue.html'        : 'venue',
            'score.html'        : 'score',
            'analyze.html'      : 'analyze',
            'video-review.html' : 'video-review',
            'video-cover.html'  : 'video-cover',
            'video-fun.html'    : 'video-fun',
            'video-bandstage.html': 'video-bandstage',
            'portfolio.html'    : 'portfolio',
            'profile.html'      : 'profile',
            'login.html'        : 'login',
            'signup.html'       : 'signup',
        };
        // URL 파라미터로 커뮤니티 카테고리 구분
        if (path === 'community.html') {
            const cat = new URLSearchParams(location.search).get('cat');
            return cat ? `community-${cat}` : 'community';
        }
        return map[path] || path.replace('.html', '');
    }

    // ── 세션 ID (탭 단위) ────────────────────────────
    function getSessionId() {
        let sid = sessionStorage.getItem('_cdku_sid');
        if (!sid) {
            sid = 'sid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
            sessionStorage.setItem('_cdku_sid', sid);
        }
        return sid;
    }

    // ── UUID v4 생성 ─────────────────────────────────
    function uuidv4() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    // ── 중복 방지: 30분 내 같은 세션+페이지 기록 안 함 ─
    function isDuplicate(page) {
        const key = `_cdku_pv_${page}`;
        const last = parseInt(sessionStorage.getItem(key) || '0');
        const THIRTY_MIN = 30 * 60 * 1000;
        if (Date.now() - last < THIRTY_MIN) return true;
        sessionStorage.setItem(key, Date.now());
        return false;
    }

    // ── 현재 로그인 유저 ID 가져오기 (있으면) ─────────
    function getCurrentUserId() {
        try {
            // auth-header.js가 window._cdkuSession 에 저장함
            return window._cdkuSession?.user?.id || null;
        } catch { return null; }
    }

    // ── 메인 트래킹 함수 ─────────────────────────────
    async function track() {
        try {
            const page = getPageName();
            // 관리자 페이지는 트래킹 제외
            if (page === 'admin') return;

            if (isDuplicate(page)) return;

            const payload = {
                id         : uuidv4(),
                page       : page,
                session_id : getSessionId(),
                user_id    : getCurrentUserId(),
                referrer   : document.referrer ? new URL(document.referrer).hostname : 'direct',
                user_agent : navigator.userAgent.slice(0, 200),
                visited_at : Date.now(),
            };

            // 비동기 전송 (실패해도 무시)
            await fetch(`${SB_URL}/rest/v1/page_views`, {
                method  : 'POST',
                headers : {
                    'Content-Type' : 'application/json',
                    'apikey'       : SB_KEY,
                    'Authorization': `Bearer ${SB_KEY}`,
                    'Prefer'       : 'return=minimal',
                },
                body: JSON.stringify(payload),
                keepalive: true,
            });
        } catch (_) {
            // 광고 차단기 등 무시
        }
    }

    // ── DOM 준비 후 실행 ─────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // auth 로딩 대기 (300ms) 후 userId 포함해서 기록
            setTimeout(track, 300);
        });
    } else {
        setTimeout(track, 300);
    }

    // 외부에서 수동 호출 가능하도록 노출
    window._cdkuTrack = track;
})();
