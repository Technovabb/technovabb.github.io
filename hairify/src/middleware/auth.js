/** Staff sign-in, shared by the POS and the back office. */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { hasRole, userForSession } from '../lib/auth.js';

export const SESSION_COOKIE = 'hairify_staff';
const CSRF_COOKIE = 'hairify_csrf';

export function sessionCookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: 14 * 24 * 60 * 60 * 1000,
  };
}

function sign(value) {
  return createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

/**
 * Double-submit CSRF protection: the token lives in a cookie and must be echoed
 * in the form. Both halves are signed with the session secret.
 */
export function csrfToken(req, res) {
  let token = req.cookies[CSRF_COOKIE];
  if (!token || !token.includes('.')) {
    const value = randomBytes(18).toString('base64url');
    token = `${value}.${sign(value)}`;
    res.cookie(CSRF_COOKIE, token, { httpOnly: false, sameSite: 'lax', secure: config.isProduction, path: '/' });
  }
  req.csrf = token;
  return token;
}

export function verifyCsrf(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  const cookieToken = req.cookies[CSRF_COOKIE] || '';
  const supplied = req.body?._csrf || req.get('x-csrf-token') || '';
  const [value, signature] = cookieToken.split('.');

  const valid =
    value &&
    signature &&
    signature === sign(value) &&
    supplied.length === cookieToken.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(cookieToken));

  if (!valid) {
    return res.status(403).type('html').send(
      '<p>Your session expired while that page was open. Please go back, reload and try again.</p>',
    );
  }
  next();
}

/** Loads the signed-in staff member, if any, onto `req.user`. */
export function loadUser(req, res, next) {
  req.db = getDb();
  req.user = userForSession(req.db, req.cookies[SESSION_COOKIE]);
  csrfToken(req, res);
  next();
}

/** Requires a signed-in staff member of at least `role`. */
export function requireRole(role, loginPath) {
  return (req, res, next) => {
    if (!req.user) {
      const next_ = encodeURIComponent(req.originalUrl);
      return res.redirect(`${loginPath}?next=${next_}`);
    }
    if (!hasRole(req.user, role)) {
      return res.status(403).type('html').send(
        `<p>${req.user.name}, your account does not have access to this part of the system. ` +
          'Ask a manager if you need it.</p>',
      );
    }
    next();
  };
}

/** Keeps an open redirect out of the `?next=` parameter. */
export function safeNext(value, fallback) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}
