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

