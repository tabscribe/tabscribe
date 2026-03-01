/**
 * supabase.js — Supabase REST API 헬퍼
 * TabScribe 전용 (community.html, score.html)
 *
 * Genspark Table API → Supabase REST API 교체
 * 모든 fetch 호출을 이 헬퍼로 통일
 */

// 중복 선언 방지: auth.js가 먼저 로드된 경우 재사용
if (typeof SUPABASE_URL === 'undefined') var SUPABASE_URL  = 'https://aubagaamktdmtvfabcbd.supabase.co';
if (typeof SUPABASE_KEY === 'undefined') {
    // auth.js가 SUPABASE_ANON으로 선언한 경우 그것을 사용
    var SUPABASE_KEY = (typeof SUPABASE_ANON !== 'undefined')
        ? SUPABASE_ANON
        : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1YmFnYWFta3RkbXR2ZmFiY2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTc5NDksImV4cCI6MjA4Nzc3Mzk0OX0.XoKiaw8nCJc1Hq9OjiURrGi_ZA-6sU4xhqqpDGcC2IM';
}

// SB_HEADERS는 항상 최신 SUPABASE_KEY로 생성
var SB_HEADERS = {
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

/* ─────────────────────────────────────────
   Supabase Storage 이미지 업로드 헬퍼
   버킷: community-images (public)
   anon key로 업로드 허용 필요 (Storage Policy)
───────────────────────────────────────── */
const STORAGE_BUCKET = 'community-images';

async function uploadImageToSupabase(file) {
    // 파일 크기 제한: 5MB
    if (file.size > 5 * 1024 * 1024) {
        throw new Error('파일 크기는 5MB 이하만 가능합니다.');
    }
    // 허용 형식
    const allowed = ['image/jpeg','image/jpg','image/png','image/gif','image/webp'];
    if (!allowed.includes(file.type)) {
        throw new Error('JPG, PNG, GIF, WebP 이미지만 업로드 가능합니다.');
    }

    // 고유 파일명 생성
    const ext  = file.name.split('.').pop().toLowerCase();
    const name = `${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
    const path = `posts/${name}`;

    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`;
    const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'apikey':        SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type':  file.type,
            'x-upsert':      'true',
        },
        body: file,
    });

    if (!res.ok) {
        // Storage 버킷이 없거나 정책 미설정 시 → Base64 fallback
        const errText = await res.text().catch(() => '');
        console.warn('[Storage] 업로드 실패, Base64 fallback:', res.status, errText);
        return await fileToBase64DataUrl(file);
    }

    // Public URL 반환
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
    return publicUrl;
}

/* Base64 DataURL fallback (Storage 미설정 환경용) */
function fileToBase64DataUrl(file) {
    return new Promise((resolve, reject) => {
        // Base64 시 DB 저장 용량 고려해 1.5MB 이하만 허용
        if (file.size > 1.5 * 1024 * 1024) {
            reject(new Error('스토리지 연결 전까지 이미지는 1.5MB 이하만 가능합니다.'));
            return;
        }
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('파일 읽기 실패'));
        reader.readAsDataURL(file);
    });
}

window.uploadImageToSupabase = uploadImageToSupabase;
