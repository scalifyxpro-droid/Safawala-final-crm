import { SignJWT, jwtVerify } from 'jose';

function getSecretKey() {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error(
      'SESSION_SECRET is not set (or too short). Generate one with `openssl rand -base64 48` and set it on Railway.',
    );
  }
  return new TextEncoder().encode(sessionSecret);
}
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days, matches previous Supabase session length

export type SessionClaims = {
  sub: string; // auth.users.id (uuid) — mirrors the Supabase JWT `sub` claim
  role: 'admin' | 'staff';
  email: string;
};

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role, email: claims.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (!payload.sub || (payload.role !== 'admin' && payload.role !== 'staff') || typeof payload.email !== 'string') {
      return null;
    }
    return { sub: payload.sub, role: payload.role, email: payload.email };
  } catch {
    // expired, tampered, or malformed — treat exactly like "not signed in"
    return null;
  }
}

export const SESSION_DURATION_MS = SESSION_DURATION_SECONDS * 1000;
