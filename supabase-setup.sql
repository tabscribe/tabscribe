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
-- 완료! 위 SQL을 모두 실행한 뒤 회원가입 테스트를 진행하세요.
-- ============================================================
