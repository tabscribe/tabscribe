/**
 * supabase.js — Supabase REST API 헬퍼
 * TabScribe 전용 (community.html, score.html)
 *
 * Genspark Table API → Supabase REST API 교체
 * 모든 fetch 호출을 이 헬퍼로 통일
 */

const SUPABASE_URL  = 'https://aubagaamktdmtvfabcbd.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1YmFnYWFta3RkbXR2ZmFiY2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTc5NDksImV4cCI6MjA4Nzc3Mzk0OX0.XoKiaw8nCJc1Hq9OjiURrGi_ZA-6sU4xhqqpDGcC2IM';

const SB_HEADERS = {
    'Content-Type':  'application/json',
    'apikey':        SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Prefer':        'return=representation',
};

/* ─────────────────────────────────────────
   Supabase DB 헬퍼 클래스
   Genspark Table API와 동일한 인터페이스로 설계
───────────────────────────────────────── */
class SupabaseDB {

    /* ── 목록 조회 ──
       options: { limit, page, search, searchFields, filters, sort, order }
    */
    static async list(table, options = {}) {
        const {
            limit  = 100,
            page   = 1,
            search = '',
            searchFields = [],
            filters = {},   // { field: value } 정확히 일치
            sort   = 'created_at',
            order  = 'desc',
        } = options;

        const offset = (page - 1) * limit;
        let url = `${SUPABASE_URL}/rest/v1/${table}?`;

        // 정렬
        url += `order=${sort}.${order}`;

        // 페이지네이션
        url += `&limit=${limit}&offset=${offset}`;

        // 정확 일치 필터
        for (const [key, val] of Object.entries(filters)) {
            if (val !== undefined && val !== null && val !== '') {
                url += `&${key}=eq.${encodeURIComponent(val)}`;
            }
        }

        // 텍스트 검색 (ilike — 대소문자 무시)
        if (search && searchFields.length > 0) {
            const conditions = searchFields
                .map(f => `${f}.ilike.*${encodeURIComponent(search)}*`)
                .join(',');
            url += `&or=(${conditions})`;
        }

        // 전체 개수 포함 헤더
        const headers = { ...SB_HEADERS, 'Prefer': 'count=exact' };

        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`Supabase list 오류: ${res.status}`);

        const data  = await res.json();
        const total = parseInt(res.headers.get('content-range')?.split('/')[1] || '0', 10);

        return { data, total, page, limit };
    }

    /* ── 단건 조회 ── */
    static async get(table, id) {
        const url = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}&limit=1`;
        const res = await fetch(url, { headers: SB_HEADERS });
        if (!res.ok) throw new Error(`Supabase get 오류: ${res.status}`);
        const rows = await res.json();
        if (!rows || rows.length === 0) throw new Error('레코드를 찾을 수 없습니다.');
        return rows[0];
    }

    /* ── 생성 (POST) ── */
    static async create(table, data) {
        // id 없으면 UUID 자동 생성
        if (!data.id) {
            data.id = crypto.randomUUID
                ? crypto.randomUUID()
                : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                    const r = Math.random() * 16 | 0;
                    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                });
        }
        const now = Date.now();
        data.created_at = data.created_at || now;
        data.updated_at = now;

        const url = `${SUPABASE_URL}/rest/v1/${table}`;
        const res = await fetch(url, {
            method:  'POST',
            headers: SB_HEADERS,
            body:    JSON.stringify(data),
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Supabase create 오류: ${res.status} — ${err}`);
        }
        const rows = await res.json();
        return Array.isArray(rows) ? rows[0] : rows;
    }

    /* ── 수정 (PATCH) ── */
    static async update(table, id, data) {
        data.updated_at = Date.now();
        const url = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
        const res = await fetch(url, {
            method:  'PATCH',
            headers: SB_HEADERS,
            body:    JSON.stringify(data),
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Supabase update 오류: ${res.status} — ${err}`);
        }
        const rows = await res.json();
        return Array.isArray(rows) ? rows[0] : rows;
    }

    /* ── 삭제 (DELETE) ── */
    static async delete(table, id) {
        const url = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
        const res = await fetch(url, {
            method:  'DELETE',
            headers: SB_HEADERS,
        });
        if (!res.ok) throw new Error(`Supabase delete 오류: ${res.status}`);
        return true;
    }

    /* ── 숫자 필드 증가 (조회수, 좋아요 등) ── */
    static async increment(table, id, field, amount = 1) {
        // 현재 값 조회 후 +1
        try {
            const row = await this.get(table, id);
            const current = Number(row[field]) || 0;
            return await this.update(table, id, { [field]: current + amount });
        } catch(e) {
            console.warn(`increment 실패 (${table}.${field}):`, e);
        }
    }
}

window.SupabaseDB = SupabaseDB;
