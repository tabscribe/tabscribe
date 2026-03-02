-- ============================================================
-- CodeDuck - Supabase Auth 설정 SQL
-- Supabase Dashboard > SQL Editor 에서 실행하세요
-- ============================================================

-- 1. profiles 테이블 생성 (회원 추가 정보 저장)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname    TEXT NOT NULL,
  gender      TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  parts       TEXT[] NOT NULL DEFAULT '{}',   -- 파트 배열 ['guitar', 'vocal', ...]
  career      TEXT,                            -- 음악 경력 (선택)
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS(행 수준 보안) 활성화
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. RLS 정책: 본인 프로필만 수정 가능, 읽기는 모두 허용
CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- 4. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. 신규 가입 시 profiles 행 자동 생성 트리거 (닉네임은 이메일 앞부분으로 임시 설정)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nickname, gender, parts, career)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nickname', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'gender', 'other'),
    ARRAY(SELECT jsonb_array_elements_text(
      COALESCE(NEW.raw_user_meta_data->'parts', '[]'::jsonb)
    )),
    NEW.raw_user_meta_data->>'career'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 6. ratings 테이블 생성 (쿠슐랭 가이드 평가)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ratings (
  id          TEXT        PRIMARY KEY,
  page        TEXT        NOT NULL,   -- 'rehearsal' | 'repair' | 'instrument' | 'academy' | 'venue'
  place_id    TEXT        NOT NULL,   -- 'rehearsal_사운드시티_합주실_홍대역점' 형태
  place_name  TEXT        NOT NULL,
  user_id     TEXT        NOT NULL,   -- Supabase auth.users.id (UUID)
  score1      INTEGER     NOT NULL CHECK (score1 BETWEEN 1 AND 5),
  score2      INTEGER     NOT NULL CHECK (score2 BETWEEN 1 AND 5),
  label1      TEXT,
  label2      TEXT,
  created_at  BIGINT      DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  updated_at  BIGINT      DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- 같은 유저가 같은 장소에 중복 평가 불가
CREATE UNIQUE INDEX IF NOT EXISTS ratings_user_place_unique
  ON public.ratings (place_id, user_id);

-- RLS 활성화
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

-- 누구나 읽기 가능
CREATE POLICY "ratings_select_all"
  ON public.ratings FOR SELECT
  USING (true);

-- 로그인한 유저만 자기 평가 등록
CREATE POLICY "ratings_insert_auth"
  ON public.ratings FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- 본인 평가만 삭제 가능
CREATE POLICY "ratings_delete_own"
  ON public.ratings FOR DELETE
  USING (auth.uid()::text = user_id);

-- ============================================================
-- 7. 영상 게시물 테이블 (review / cover / fun / bandstage)
--    공통 구조: 누구나 읽기, anon 포함 누구나 등록/삭제 가능
-- ============================================================

-- 7-1. 리뷰 영상
CREATE TABLE IF NOT EXISTS public.review_videos (
  id          TEXT        PRIMARY KEY,
  title       TEXT        NOT NULL,
  url         TEXT,
  embed_url   TEXT,
  description TEXT,
  like_count  INTEGER     DEFAULT 0,
  date_label  TEXT,
  created_at  BIGINT      DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  updated_at  BIGINT      DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

ALTER TABLE public.review_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_videos_select_all"
  ON public.review_videos FOR SELECT USING (true);

CREATE POLICY "review_videos_insert_all"
  ON public.review_videos FOR INSERT WITH CHECK (true);

CREATE POLICY "review_videos_update_all"
  ON public.review_videos FOR UPDATE USING (true);

CREATE POLICY "review_videos_delete_all"
  ON public.review_videos FOR DELETE USING (true);

-- 7-2. 카피 영상
CREATE TABLE IF NOT EXISTS public.cover_videos (
  id          TEXT        PRIMARY KEY,
  title       TEXT        NOT NULL,
  url         TEXT,
  embed_url   TEXT,
  description TEXT,
  like_count  INTEGER     DEFAULT 0,
  date_label  TEXT,
  created_at  BIGINT      DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  updated_at  BIGINT      DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

ALTER TABLE public.cover_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cover_videos_select_all"
  ON public.cover_videos FOR SELECT USING (true);

CREATE POLICY "cover_videos_insert_all"
  ON public.cover_videos FOR INSERT WITH CHECK (true);

CREATE POLICY "cover_videos_update_all"
  ON public.cover_videos FOR UPDATE USING (true);

CREATE POLICY "cover_videos_delete_all"
  ON public.cover_videos FOR DELETE USING (true);

-- 7-3. 펀 영상
CREATE TABLE IF NOT EXISTS public.fun_videos (
  id          TEXT        PRIMARY KEY,
  title       TEXT        NOT NULL,
  url         TEXT,
  embed_url   TEXT,
  description TEXT,
  like_count  INTEGER     DEFAULT 0,
  date_label  TEXT,
  created_at  BIGINT      DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  updated_at  BIGINT      DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

ALTER TABLE public.fun_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fun_videos_select_all"
  ON public.fun_videos FOR SELECT USING (true);

CREATE POLICY "fun_videos_insert_all"
  ON public.fun_videos FOR INSERT WITH CHECK (true);

CREATE POLICY "fun_videos_update_all"
  ON public.fun_videos FOR UPDATE USING (true);

CREATE POLICY "fun_videos_delete_all"
  ON public.fun_videos FOR DELETE USING (true);

-- 7-4. 밴드스테이지 영상
CREATE TABLE IF NOT EXISTS public.bandstage_videos (
  id          TEXT        PRIMARY KEY,
  title       TEXT        NOT NULL,
  url         TEXT,
  embed_url   TEXT,
  description TEXT,
  like_count  INTEGER     DEFAULT 0,
  date_label  TEXT,
  created_at  BIGINT      DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  updated_at  BIGINT      DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

ALTER TABLE public.bandstage_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bandstage_videos_select_all"
  ON public.bandstage_videos FOR SELECT USING (true);

CREATE POLICY "bandstage_videos_insert_all"
  ON public.bandstage_videos FOR INSERT WITH CHECK (true);

CREATE POLICY "bandstage_videos_update_all"
  ON public.bandstage_videos FOR UPDATE USING (true);

CREATE POLICY "bandstage_videos_delete_all"
  ON public.bandstage_videos FOR DELETE USING (true);

-- ============================================================
-- 완료! 위 SQL을 모두 실행한 뒤 회원가입·평가·영상 등록 테스트를 진행하세요.
-- ============================================================

-- ============================================================
-- [community_posts] 커뮤니티 게시물 테이블 생성 + RLS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.community_posts (
  id          TEXT PRIMARY KEY,
  category    TEXT NOT NULL,
  subcategory TEXT DEFAULT '',
  title       TEXT NOT NULL,
  author      TEXT NOT NULL,
  content     TEXT,
  location    TEXT DEFAULT '',
  price       INTEGER,
  contact     TEXT,
  image_url   TEXT,
  image_urls  TEXT[],
  tags        TEXT[],
  views       INTEGER DEFAULT 0,
  likes       INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'active',
  created_at  BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  updated_at  BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cp_select_all" ON public.community_posts;
DROP POLICY IF EXISTS "cp_insert_all" ON public.community_posts;
DROP POLICY IF EXISTS "cp_update_all" ON public.community_posts;
DROP POLICY IF EXISTS "cp_delete_all" ON public.community_posts;

CREATE POLICY "cp_select_all" ON public.community_posts FOR SELECT USING (true);
CREATE POLICY "cp_insert_all" ON public.community_posts FOR INSERT WITH CHECK (true);
CREATE POLICY "cp_update_all" ON public.community_posts FOR UPDATE USING (true);
CREATE POLICY "cp_delete_all" ON public.community_posts FOR DELETE USING (true);

-- ============================================================
-- [community_comments] 댓글 테이블 생성 + RLS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.community_comments (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL,
  parent_id   TEXT DEFAULT NULL,
  author      TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  updated_at  BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cc_select_all" ON public.community_comments;
DROP POLICY IF EXISTS "cc_insert_all" ON public.community_comments;
DROP POLICY IF EXISTS "cc_update_all" ON public.community_comments;
DROP POLICY IF EXISTS "cc_delete_all" ON public.community_comments;

CREATE POLICY "cc_select_all" ON public.community_comments FOR SELECT USING (true);
CREATE POLICY "cc_insert_all" ON public.community_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "cc_update_all" ON public.community_comments FOR UPDATE USING (true);
CREATE POLICY "cc_delete_all" ON public.community_comments FOR DELETE USING (true);

ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS image_url   TEXT;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS image_urls  TEXT[];

-- ============================================================
-- [데이터 수정] 기존에 subcategory가 NULL 또는 빈 문자열로
-- 저장된 중고장터 게시물을 확인하는 쿼리
-- (아래 SELECT를 먼저 실행해서 subcategory 값을 확인하세요)
-- ============================================================
-- SELECT id, title, category, subcategory FROM public.community_posts
-- WHERE category = 'used_gear'
-- ORDER BY created_at DESC;

-- subcategory가 비어있는 중고장터 게시물을 직접 수정하려면:
-- UPDATE public.community_posts
-- SET subcategory = 'electric'  -- 원하는 값으로 변경
-- WHERE id = '여기에_게시물_ID_입력';

-- ============================================================
-- [관리자 설정] Admin 권한 관련 SQL
-- Supabase Dashboard > SQL Editor 에서 실행하세요
-- ============================================================

-- 1. profiles 테이블에 is_admin 컬럼 추가
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- 2. page_views 테이블 생성 (방문자 트래킹)
-- ⚠️ 이미 실행했다면 아래 CREATE는 건너뛰고 ALTER만 실행하세요
CREATE TABLE IF NOT EXISTS public.page_views (
  id          TEXT        PRIMARY KEY,
  page        TEXT        NOT NULL,       -- 'index', 'community', 'rehearsal' 등
  user_id     TEXT,                       -- NULL = 비로그인 방문자
  session_id  TEXT        NOT NULL,       -- 세션 ID (중복 방지)
  referrer    TEXT,                       -- 유입 경로
  user_agent  TEXT,                       -- 기기/브라우저 구분용
  visited_at  BIGINT      DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- 인덱스 (조회 성능)
CREATE INDEX IF NOT EXISTS pv_visited_at_idx ON public.page_views (visited_at DESC);
CREATE INDEX IF NOT EXISTS pv_session_idx    ON public.page_views (session_id);
CREATE INDEX IF NOT EXISTS pv_page_idx       ON public.page_views (page);

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pv_select_admin" ON public.page_views;
DROP POLICY IF EXISTS "pv_insert_all"   ON public.page_views;

CREATE POLICY "pv_select_admin" ON public.page_views FOR SELECT USING (true);
CREATE POLICY "pv_insert_all"   ON public.page_views FOR INSERT WITH CHECK (true);

-- 3. community_posts 삭제 권한: 관리자는 모든 게시물 삭제 가능
--    (기존 cp_delete_all 정책이 이미 true이므로 추가 RLS 불필요)
--    단, 클라이언트에서 is_admin 확인 후 삭제 버튼 표시

-- 4. 관리자 계정 지정: jihwan8012@naver.com
--    ⚠️ 아래 SQL은 반드시 회원가입 완료 후 실행하세요!
-- ============================================================
UPDATE public.profiles
SET is_admin = true
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'jihwan8012@naver.com' LIMIT 1
);

-- 실행 후 확인:
-- SELECT p.id, u.email, p.nickname, p.is_admin
-- FROM public.profiles p
-- JOIN auth.users u ON u.id = p.id
-- WHERE u.email = 'jihwan8012@naver.com';

-- 5. 관리자 전용 stats 뷰 (선택 실행)
CREATE OR REPLACE VIEW public.admin_stats AS
SELECT
  (SELECT COUNT(*) FROM auth.users)                              AS total_users,
  (SELECT COUNT(*) FROM public.community_posts WHERE status='active') AS total_posts,
  (SELECT COUNT(*) FROM public.community_comments)               AS total_comments,
  (SELECT COUNT(*) FROM public.community_posts
   WHERE created_at > EXTRACT(EPOCH FROM NOW() - INTERVAL '7 days') * 1000) AS posts_last_7d,
  (SELECT COUNT(*) FROM auth.users
   WHERE created_at > NOW() - INTERVAL '7 days')                AS new_users_7d;

