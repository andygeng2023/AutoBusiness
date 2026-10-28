import { createClient } from "@supabase/supabase-js";

// These are public client credentials only. Never put a service-role key in the browser.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://wctlalaitdrzihvthvze.supabase.co";
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_tmZZukEnXSWxr6P1m_6IVA_OcIGNNsN";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
