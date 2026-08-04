require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let supabase;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  const missing = [
    ...(SUPABASE_URL ? [] : ['SUPABASE_URL']),
    ...(SUPABASE_SERVICE_ROLE_KEY ? [] : ['SUPABASE_SERVICE_ROLE_KEY'])
  ];
  console.warn(`Supabase env vars missing (${missing.join(', ')}) — shih .env.example.`);
  // Nuk hedhim gabim në ngarkim: aplikacioni niset, por çdo përdorim i DB kthen mesazh të qartë.
  supabase = new Proxy({}, {
    get() {
      throw new Error(`Supabase nuk është konfiguruar — vendos ${missing.join(' dhe ')} në .env ose te Vercel (Project Settings → Environment Variables).`);
    }
  });
} else {
  // Client me service-role key: anashkalon RLS, përdoret vetëm nga serveri.
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
}

module.exports = { supabase, SUPABASE_URL };
