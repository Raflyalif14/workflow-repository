import { createClient } from '@supabase/supabase-js';
import { ENV } from './env';

const supabaseUrl = ENV.SUPABASE_URL || 'https://placeholder.supabase.co';
const serviceRoleKey = ENV.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';
const anonKey = ENV.SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const supabaseAuth = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});