# Vendosja online — House of Ruby (Vercel + Supabase)

Aplikacioni tani ruan gjithçka në **Supabase** (postgres + storage), ndaj funksionon
edhe në serverless (Vercel) pa humbur të dhënat.

## 1. Krijo Supabase (free plan) — një herë

1. Shko te https://supabase.com → **New Project** (falas). Emër: `house-of-ruby`.
2. Hap **SQL Editor** → ngjit përmbajtjen e `supabase/all-migrations.sql` → **Run**.
   Kjo krijon tabelat (`entries`, `users`, `sessions`, `audit_log`), bucket-in e fotove
   `photos` dhe 4 përdoruesit fillestarë (Blini/Dardani/Edoni/Arti, fjalëkalim `1234`).
3. Hap **Project Settings → API** dhe kopjo:
   - **Project URL** → `SUPABASE_URL`
   - **service_role secret** → `SUPABASE_SERVICE_ROLE_KEY`
   (service_role ka akses të plotë — mos e publikoni kurrë në frontend.)

## 2. Lokale (provë)

1. Krijo një skedar `.env` nga `.env.example` me dy vlerat e Supabase.
2. `npm install`
3. `npm start` → hap http://localhost:3000 (hyr: `Blini` / `1234`)

## 3. Vercel

1. te vercel.com → **Add New Project** → importo `ShpatV/houseOfRuby`.
2. Në **Settings → Environment Variables** shto:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. **Deploy**. Pas çdo redeploy, të dhënat mbeten në Supabase.

## Shënime sigurie

- Ndrysho menjëherë fjalëkalimin e `Blini` dhe të të gjithëve (parazgjedhja `1234`).
- `service_role` anashkalon RLS — vetëm serveri (Vercel) e përdor atë.
