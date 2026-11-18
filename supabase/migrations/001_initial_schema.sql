-- AURVAN UNIVERSE — PostgreSQL & Supabase Row-Level Security Migration
-- Run in Supabase SQL Editor or via `supabase db push`

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Institutions
CREATE TABLE IF NOT EXISTS public.institutions (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL CHECK (code IN ('AURVAN_POLICE', 'SAB', 'SIA')),
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  responsibilities_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  progression_notes TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  sort_order INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Ranks
CREATE TABLE IF NOT EXISTS public.ranks (
  id SERIAL PRIMARY KEY,
  institution_id INT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  level_order INT NOT NULL,
  min_cases_required INT NOT NULL DEFAULT 0,
  min_score_required INT NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT ''
);

-- 3. Regions (All 8 Divisions of Bangladesh)
CREATE TABLE IF NOT EXISTS public.regions (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  division_bn TEXT NOT NULL,
  headquarters_label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  terrain_notes TEXT NOT NULL DEFAULT '',
  map_x NUMERIC NOT NULL,
  map_y NUMERIC NOT NULL,
  illustration_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 4. Profiles & User Roles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  player_code TEXT UNIQUE NOT NULL,
  institution_id INT NOT NULL REFERENCES public.institutions(id),
  rank_id INT NOT NULL REFERENCES public.ranks(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  bio TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'PLAYER' CHECK (role IN ('PLAYER', 'ADMIN', 'SUPER_ADMIN')),
  granted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Cases & Sub-entities
CREATE TABLE IF NOT EXISTS public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  short_description TEXT NOT NULL DEFAULT '',
  full_story TEXT NOT NULL DEFAULT '',
  institution_id INT NOT NULL REFERENCES public.institutions(id),
  region_id INT NOT NULL REFERENCES public.regions(id),
  difficulty TEXT NOT NULL DEFAULT 'STANDARD' CHECK (difficulty IN ('STANDARD', 'INTERMEDIATE', 'ADVANCED', 'CLASSIFIED')),
  estimated_duration TEXT NOT NULL DEFAULT '60 mins',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_REVIEW', 'READY_TO_PUBLISH', 'PUBLISHED', 'ARCHIVED')),
  cover_image_url TEXT,
  thumbnail_url TEXT,
  gallery_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  player_tasks_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  evaluation_criteria_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  min_rank_order INT NOT NULL DEFAULT 1,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  folder TEXT NOT NULL DEFAULT 'general',
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  url TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'upload',
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  is_confidential BOOLEAN NOT NULL DEFAULT TRUE,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audio_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  transcript TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  url TEXT NOT NULL,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  chapter_number INT NOT NULL DEFAULT 1,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.case_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  chapter_number INT NOT NULL,
  title TEXT NOT NULL,
  briefing_text TEXT NOT NULL,
  unlock_condition TEXT NOT NULL DEFAULT 'IMMEDIATE'
);

CREATE TABLE IF NOT EXISTS public.case_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  evidence_code TEXT NOT NULL,
  title TEXT NOT NULL,
  evidence_type TEXT NOT NULL DEFAULT 'DOCUMENT',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  audio_id UUID REFERENCES public.audio_assets(id) ON DELETE SET NULL,
  chapter_number INT NOT NULL DEFAULT 1,
  access_condition TEXT NOT NULL DEFAULT 'IMMEDIATE',
  related_characters_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  private_explanation TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 1,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.case_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  portrait_url TEXT,
  description TEXT NOT NULL DEFAULT '',
  background TEXT NOT NULL DEFAULT '',
  relationships_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  private_info TEXT NOT NULL DEFAULT '',
  is_public BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.case_witnesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  portrait_url TEXT,
  statement_text TEXT NOT NULL DEFAULT '',
  chapter_number INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.interrogation_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  witness_id UUID NOT NULL REFERENCES public.case_witnesses(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  response_text TEXT NOT NULL,
  follow_up_hint TEXT NOT NULL DEFAULT '',
  hidden_evaluation_rule TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.case_hints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  chapter_number INT NOT NULL DEFAULT 1,
  hint_order INT NOT NULL DEFAULT 1,
  hint_text TEXT NOT NULL,
  unlock_condition TEXT NOT NULL DEFAULT 'ON_REQUEST',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE
);

-- STRICTLY PRIVATE: Master Solution Table
CREATE TABLE IF NOT EXISTS public.case_solutions (
  case_id UUID PRIMARY KEY REFERENCES public.cases(id) ON DELETE CASCADE,
  master_solution TEXT NOT NULL DEFAULT '',
  actual_timeline_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  responsible_character TEXT NOT NULL DEFAULT '',
  evidence_explanations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  red_herrings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  critical_clues_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  internal_notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Player Workspace & Reports
CREATE TABLE IF NOT EXISTS public.case_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  current_chapter INT NOT NULL DEFAULT 1,
  unlocked_hints_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  asked_questions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, case_id)
);

CREATE TABLE IF NOT EXISTS public.player_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, case_id)
);

CREATE TABLE IF NOT EXISTS public.investigation_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  event_time TEXT NOT NULL,
  event_title TEXT NOT NULL,
  event_notes TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.evidence_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  source_evidence_id UUID NOT NULL REFERENCES public.case_evidence(id) ON DELETE CASCADE,
  target_evidence_id UUID NOT NULL REFERENCES public.case_evidence(id) ON DELETE CASCADE,
  connection_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.case_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  suspect_identified TEXT NOT NULL,
  reasoning_text TEXT NOT NULL,
  evidence_references_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  timeline_summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.report_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID UNIQUE NOT NULL REFERENCES public.case_reports(id) ON DELETE CASCADE,
  evaluated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  score INT NOT NULL DEFAULT 0,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
  feedback TEXT NOT NULL DEFAULT '',
  career_action TEXT NOT NULL DEFAULT '',
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.career_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_institution_id INT REFERENCES public.institutions(id),
  to_institution_id INT REFERENCES public.institutions(id),
  from_rank_id INT REFERENCES public.ranks(id),
  to_rank_id INT REFERENCES public.ranks(id),
  reason TEXT NOT NULL,
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.site_content (
  key TEXT PRIMARY KEY,
  section_group TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  media_url TEXT,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  extra_json JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row-Level Security on all sensitive tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigation_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

-- Helper function for RLS role checks
CREATE OR REPLACE FUNCTION public.is_admin(uid UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = uid AND role IN ('ADMIN', 'SUPER_ADMIN')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Public cases policy: only PUBLISHED cases visible to non-admins
CREATE POLICY "Public can view published cases" ON public.cases
  FOR SELECT USING (status = 'PUBLISHED' OR public.is_admin(auth.uid()));

-- Strictly deny non-admin access to master solutions
CREATE POLICY "Only admins read master solutions" ON public.case_solutions
  FOR ALL USING (public.is_admin(auth.uid()));

-- Player workspace isolation policies
CREATE POLICY "Players own their notes" ON public.player_notes
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Players own their progress" ON public.case_progress
  FOR ALL USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Players own their timeline" ON public.investigation_timeline
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Players own their evidence connections" ON public.evidence_connections
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Players read own reports, admins manage all" ON public.case_reports
  FOR ALL USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Only admins read audit logs" ON public.admin_logs
  FOR SELECT USING (public.is_admin(auth.uid()));
