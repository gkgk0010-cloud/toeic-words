-- Phase 2 작업 8: 선생님 족보 설정 컬럼
-- Supabase SQL Editor에서 실행

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS default_jogbo_question_count integer,
  ADD COLUMN IF NOT EXISTS jogbo_daily_complete_min_questions integer;

COMMENT ON COLUMN public.teachers.default_jogbo_question_count IS
  '족보 세션 기본 출제 문항 수. NULL=학생 선택, 0=전체, 20/50/100=고정';
COMMENT ON COLUMN public.teachers.jogbo_daily_complete_min_questions IS
  '족보 일일 학습 인증(오늘 ✅) 최소 question_count. NULL=기본 20';

ALTER TABLE public.jogbo_session_completions
  ADD COLUMN IF NOT EXISTS created_at_kst text;
