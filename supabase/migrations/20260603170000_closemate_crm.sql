/*
 * CloseMate AI sales CRM — lives in Solvio Supabase (shared auth, merge path).
 * Prefixed tables; reuses public.profiles (Solvio merchants + Matty CRM).
 * Does NOT add a second auth.users trigger (Solvio owns handle_new_user).
 */

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$ BEGIN
  CREATE TYPE closemate_lead_type AS ENUM ('website_prospect', 'tipsi_prospect');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE closemate_lead_status AS ENUM (
    'new', 'called', 'interested', 'follow_up',
    'quote_sent', 'demo_booked', 'won', 'lost'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE closemate_task_type AS ENUM ('call_back', 'send_quote', 'send_demo', 'follow_up');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE closemate_task_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE closemate_call_direction AS ENUM ('outbound', 'inbound');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE closemate_call_outcome AS ENUM (
    'connected', 'no_answer', 'voicemail', 'busy', 'failed', 'completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE closemate_followup_channel AS ENUM ('sms', 'whatsapp', 'email');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE closemate_followup_tone AS ENUM ('professional', 'friendly', 'short');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE closemate_ai_analysis_mode AS ENUM ('general', 'website_sales', 'tipsi_sales');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Extend Solvio profiles for CloseMate (optional CRM fields)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS crm_business_name text;

CREATE TABLE IF NOT EXISTS public.closemate_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  twilio_account_sid text,
  twilio_auth_token_encrypted text,
  twilio_phone_number text,
  twilio_api_key_sid text,
  twilio_api_key_secret_encrypted text,
  twilio_twiml_app_sid text,
  ai_provider text NOT NULL DEFAULT 'openai',
  ai_model text NOT NULL DEFAULT 'gpt-4o-mini',
  openai_api_key_encrypted text,
  anthropic_api_key_encrypted text,
  default_lead_type closemate_lead_type DEFAULT 'website_prospect',
  timezone text NOT NULL DEFAULT 'Europe/London',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.closemate_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  industry text,
  website_url text,
  google_reviews_count integer,
  notes text,
  lead_type closemate_lead_type NOT NULL DEFAULT 'website_prospect',
  status closemate_lead_status NOT NULL DEFAULT 'new',
  tags text[] NOT NULL DEFAULT '{}',
  deal_value numeric(12, 2),
  lost_reason text,
  won_reason text,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  lead_score integer CHECK (lead_score IS NULL OR lead_score BETWEEN 0 AND 100),
  import_source text DEFAULT 'manual',
  address_line text,
  city text,
  postcode text,
  google_rating numeric(3, 2),
  website_defect text,
  defect_severity text,
  extractor_metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS closemate_leads_user_id_idx ON public.closemate_leads(user_id);
CREATE INDEX IF NOT EXISTS closemate_leads_score_idx ON public.closemate_leads(user_id, lead_score DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.closemate_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.closemate_leads(id) ON DELETE SET NULL,
  twilio_call_sid text UNIQUE,
  direction closemate_call_direction NOT NULL DEFAULT 'outbound',
  outcome closemate_call_outcome,
  duration_seconds integer DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  notes text,
  from_number text,
  to_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.closemate_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES public.closemate_calls(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.closemate_leads(id) ON DELETE SET NULL,
  twilio_recording_sid text UNIQUE,
  storage_path text,
  recording_url text NOT NULL,
  duration_seconds integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.closemate_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES public.closemate_calls(id) ON DELETE CASCADE,
  recording_id uuid REFERENCES public.closemate_recordings(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.closemate_leads(id) ON DELETE SET NULL,
  full_text text NOT NULL,
  segments jsonb NOT NULL DEFAULT '[]',
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', full_text)) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.closemate_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.closemate_leads(id) ON DELETE CASCADE,
  call_id uuid REFERENCES public.closemate_calls(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.closemate_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.closemate_leads(id) ON DELETE CASCADE,
  call_id uuid REFERENCES public.closemate_calls(id) ON DELETE SET NULL,
  title text NOT NULL,
  task_type closemate_task_type NOT NULL DEFAULT 'follow_up',
  status closemate_task_status NOT NULL DEFAULT 'pending',
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.closemate_ai_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  call_id uuid NOT NULL UNIQUE REFERENCES public.closemate_calls(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.closemate_leads(id) ON DELETE SET NULL,
  mode closemate_ai_analysis_mode NOT NULL DEFAULT 'general',
  call_summary text NOT NULL,
  interest_score integer NOT NULL CHECK (interest_score BETWEEN 0 AND 100),
  close_probability numeric(5, 2) NOT NULL CHECK (close_probability BETWEEN 0 AND 100),
  buying_signals jsonb NOT NULL DEFAULT '[]',
  objections jsonb NOT NULL DEFAULT '[]',
  missed_opportunities jsonb NOT NULL DEFAULT '[]',
  coaching jsonb NOT NULL DEFAULT '{}',
  mode_specific jsonb NOT NULL DEFAULT '{}',
  overall_call_score integer NOT NULL CHECK (overall_call_score BETWEEN 0 AND 100),
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.closemate_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES public.closemate_calls(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.closemate_leads(id) ON DELETE SET NULL,
  channel closemate_followup_channel NOT NULL,
  tone closemate_followup_tone NOT NULL,
  body text NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.closemate_lead_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.closemate_leads(id) ON DELETE CASCADE,
  website_url text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.closemate_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closemate_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closemate_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closemate_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closemate_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closemate_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closemate_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closemate_ai_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closemate_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closemate_lead_research ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS closemate_settings_all ON public.closemate_settings;
CREATE POLICY closemate_settings_all ON public.closemate_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS closemate_leads_all ON public.closemate_leads;
CREATE POLICY closemate_leads_all ON public.closemate_leads
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS closemate_calls_all ON public.closemate_calls;
CREATE POLICY closemate_calls_all ON public.closemate_calls
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS closemate_recordings_all ON public.closemate_recordings;
CREATE POLICY closemate_recordings_all ON public.closemate_recordings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS closemate_transcripts_all ON public.closemate_transcripts;
CREATE POLICY closemate_transcripts_all ON public.closemate_transcripts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS closemate_notes_all ON public.closemate_notes;
CREATE POLICY closemate_notes_all ON public.closemate_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS closemate_tasks_all ON public.closemate_tasks;
CREATE POLICY closemate_tasks_all ON public.closemate_tasks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS closemate_ai_analysis_all ON public.closemate_ai_analysis;
CREATE POLICY closemate_ai_analysis_all ON public.closemate_ai_analysis
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS closemate_followups_all ON public.closemate_followups;
CREATE POLICY closemate_followups_all ON public.closemate_followups
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS closemate_lead_research_all ON public.closemate_lead_research;
CREATE POLICY closemate_lead_research_all ON public.closemate_lead_research
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
