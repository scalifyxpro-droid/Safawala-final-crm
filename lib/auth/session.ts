import { cookies } from 'next/headers';
import { signSessionToken, verifySessionToken, SESSION_DURATION_MS, type SessionClaims } from './jwt';

const COOKIE_NAME = 'crm_session';

/**
 * Replacement for Supabase Auth's cookie-based session, used by both the
 * admin app and the staff portal (both authenticate through this one
 * system — there is no separate staff auth mechanism, matching how
 * lib/staff-portal/credentials.ts already worked against Supabase Auth).
 */
export async function createSession(claims: SessionClaims) {
  const token = await signSessionToken(claims);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Reads and verifies the session cookie. Returns null for anonymous, expired,
 * or tampered sessions — callers treat this exactly like the old
 * `supabase.auth.getClaims()` returning no user.
 */
export async function getSessionClaims(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Convenience helper for server components / server actions that previously
 * did `const { data } = await supabase.auth.getUser(); if (!data.user) ...`.
 * Throws instead of redirecting — callers in Server Actions want a thrown
 * error (shown as a form error), while page components should redirect
 * explicitly on a null result the way they already do.
 */
export async function requireUser(): Promise<{ id: string; email: string; role: SessionClaims['role'] }> {
  const claims = await getSessionClaims();
  if (!claims) throw new Error('Session required.');
  return { id: claims.sub, email: claims.email, role: claims.role };
}

export async function getCurrentUser(): Promise<{ id: string; email: string; role: SessionClaims['role'] } | null> {
  const claims = await getSessionClaims();
  if (!claims) return null;
  return { id: claims.sub, email: claims.email, role: claims.role };
}
