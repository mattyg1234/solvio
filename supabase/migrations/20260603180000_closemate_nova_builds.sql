-- CloseMate Nova site builds (HTML stored for preview + client share links)

DO $$ BEGIN
  CREATE TYPE closemate_site_build_status AS ENUM ('building', 'ready', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.closemate_site_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.closemate_leads(id) ON DELETE CASCADE,
  slug text NOT NULL,
  html text,
  model text NOT NULL,
  status closemate_site_build_status NOT NULL DEFAULT 'building',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE INDEX IF NOT EXISTS closemate_site_builds_lead_idx
  ON public.closemate_site_builds(lead_id, created_at DESC);

ALTER TABLE public.closemate_site_builds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS closemate_site_builds_owner ON public.closemate_site_builds;
CREATE POLICY closemate_site_builds_owner ON public.closemate_site_builds
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS closemate_site_builds_public_preview ON public.closemate_site_builds;
CREATE POLICY closemate_site_builds_public_preview ON public.closemate_site_builds
  FOR SELECT USING (status = 'ready');
