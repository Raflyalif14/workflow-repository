import { createSupabaseAuthClient, supabaseAdmin } from '../config/supabase';
import { AuthRequestError, authUnavailable, isInvalidProviderSession } from '../utils/auth-error';

export async function refreshAuthSession(refreshToken: string) {
  // A new, non-persistent SDK client isolates this refresh from every other user.
  const { data, error } = await createSupabaseAuthClient().auth.refreshSession({ refresh_token: refreshToken });
  if (error) {
    if (isInvalidProviderSession(error)) throw new AuthRequestError(401, 'AUTH_REFRESH_INVALID', 'Your session has expired. Please sign in again.');
    if (error.status === 429) throw new AuthRequestError(429, 'AUTH_REFRESH_BUSY', 'Too many requests. Please try again later.');
    throw authUnavailable();
  }
  if (!data.session || !data.user) throw authUnavailable();
  const { data: profile, error: profileError } = await supabaseAdmin.from('users')
    .select('id,is_active').eq('id', data.user.id).single();
  if (profileError && profileError.code !== 'PGRST116') throw authUnavailable();
  if (!profile || !profile.is_active) throw new AuthRequestError(401, 'AUTH_ACCOUNT_INACTIVE', 'User account is inactive or profile is missing');
  return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token || refreshToken };
}
