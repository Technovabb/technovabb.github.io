/** Staff accounts and sessions for the POS and the back office. */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

const SESSION_DAYS = 14;

export function hashPassword(password) {
  return bcrypt.hashSync(password, 12);
}

export function createUser(db, { email, name, password, role, pin = null }) {
  const result = db
    .prepare(
      'INSERT INTO users (email, name, password_hash, role, pin) VALUES (?, ?, ?, ?, ?)',
    )
    .run(email, name, hashPassword(password), role, pin);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

export function verifyLogin(db, email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);
  // Hash even when the account is missing, so a wrong address and a wrong
  // password take the same amount of time to answer.
  const hash = user?.password_hash || '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
  const ok = bcrypt.compareSync(password, hash);
  return ok && user ? user : null;
}

/** PIN sign-in, for cashiers switching at a shared till. */
export function verifyPin(db, pin) {
  const candidates = db
    .prepare("SELECT * FROM users WHERE active = 1 AND pin IS NOT NULL AND pin <> ''")
    .all();
  const supplied = Buffer.from(String(pin));
  for (const user of candidates) {
    const stored = Buffer.from(String(user.pin));
    if (stored.length === supplied.length && timingSafeEqual(stored, supplied)) return user;
  }
  return null;
}

export function createSession(db, userId) {
  const id = randomBytes(24).toString('base64url');
  db.prepare(
    `INSERT INTO sessions (id, user_id, expires_at)
     VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`,
  ).run(id, userId);
  return id;
}

export function userForSession(db, sessionId) {
  if (!sessionId) return null;
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > datetime('now') AND u.active = 1`,
    )
    .get(sessionId);
  return row || null;
}

export function destroySession(db, sessionId) {
  if (sessionId) db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function purgeExpiredSessions(db) {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

export const ROLE_RANK = { cashier: 1, manager: 2, admin: 3 };

export function hasRole(user, minimum) {
  return Boolean(user) && ROLE_RANK[user.role] >= ROLE_RANK[minimum];
}
