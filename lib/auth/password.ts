import bcrypt from 'bcryptjs';

// 12 rounds: same order of magnitude as Supabase GoTrue's default, safe for
// interactive login latency.
const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
