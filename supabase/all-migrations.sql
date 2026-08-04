-- ============================================================
-- House of Ruby — Supabase schema (free plan)
-- Hape: Supabase Dashboard → SQL Editor → ngjit → Run
-- ============================================================

-- ─── Barazimet (entries) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.entries (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  shift      TEXT NOT NULL DEFAULT 'dita',
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS entries_date_shift_idx ON public.entries(date, shift);
CREATE INDEX IF NOT EXISTS entries_date_idx ON public.entries(date);

-- ─── Përdoruesit (auth e aplikacionit, scrypt) ─────────────
CREATE TABLE IF NOT EXISTS public.users (
  username TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  role     TEXT NOT NULL DEFAULT 'user',
  salt     TEXT NOT NULL,
  hash     TEXT NOT NULL
);

-- ─── Sesionet ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sessions (
  token      TEXT PRIMARY KEY,
  username   TEXT NOT NULL REFERENCES public.users(username) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_username_idx ON public.sessions(username);

-- ─── Regjistri i veprimeve (audit) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id        BIGSERIAL PRIMARY KEY,
  at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_name TEXT,
  action    TEXT,
  details   JSONB
);

-- RLS: vetëm service_role (serveri) punon me tabelat.
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.entries TO service_role;
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.sessions TO service_role;
GRANT ALL ON public.audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO service_role;

-- ─── Storage bucket për fotot ───────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'photos');

-- ─── Seed: 4 përdoruesit fillestarë (fjalëkalim: 1234) ─────
INSERT INTO public.users (username, name, role, salt, hash) VALUES
  ('blini',   'Blini',   'admin', '40f6782d8b8c8fb9262ba9e879198b92', '9056805acdc0806cc6c0946008a2bd5643c20e75032976f6a79bcee5539f48c3cbb6c685eabd393adaf51eabbd7a131c33de583318325672d07cdad454dd667f'),
  ('dardani', 'Dardani', 'user',  'fcae077bc8d777f9b13cb16086151476', '305be2205efd524f036861b4cd6fca5379b3e1691ed5d0058062ee9baa34af90defc513c00fa7df5cc5a98c319c6d4ab488a2edbe79d48876d94211fe1355edd'),
  ('edoni',   'Edoni',   'user',  '07c2103f561998b02d9388f3bed6e286',  'e01a47d2fc3742f8d9583a4b1f242b317e4dffd9d180795c99f46fcbbadca67b7a34ef1589cdd7bce46d64b268d04366d66aa0757dc18693b361031add5bd886'),
  ('arti',    'Arti',    'user',  'd589dcd45a7e2cde59bcbd2d2dbd06e6',  '9217c099116a6601e49f865a82e23390dfb38d5571733a294243c0a060b24e9d73790e40f7f61e255c1c8f689a0846dd7067be4ffb025f213571e1db3c48ed1a')
ON CONFLICT (username) DO NOTHING;

SELECT '✅ House of Ruby schema ready' AS result;
