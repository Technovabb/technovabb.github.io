import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { html, jsonScript, raw, toString } from '../src/lib/html.js';
import { createUser, hasRole, userForSession, createSession, destroySession, verifyLogin, verifyPin } from '../src/lib/auth.js';
import { freshDb } from './helpers.js';

const db = freshDb();
after(() => db.close());

describe('page rendering', () => {
  it('escapes anything interpolated into a page', () => {
    const name = '<script>alert(1)</script>';
    assert.equal(
      toString(html`<h1>${name}</h1>`),
      '<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>',
    );
  });

  it('escapes quotes inside attributes', () => {
    const value = '" onmouseover="alert(1)';
    const out = toString(html`<img alt="${value}" />`);
    assert.ok(!out.includes('onmouseover="alert'), out);
    assert.ok(out.includes('&quot;'));
  });

  it('leaves markup produced by html alone', () => {
    const inner = html`<em>hair</em>`;
    assert.equal(toString(html`<p>${inner}</p>`), '<p><em>hair</em></p>');
  });

  it('renders nothing for null, undefined and false', () => {
    assert.equal(toString(html`<p>${null}${undefined}${false}</p>`), '<p></p>');
  });

  it('joins arrays', () => {
    assert.equal(toString(html`${[1, 2, 3].map((n) => html`<b>${n}</b>`)}`), '<b>1</b><b>2</b><b>3</b>');
  });

  it('lets raw through deliberately, for trusted markup only', () => {
    assert.equal(toString(html`${raw('<br>')}`), '<br>');
  });

  it('stops embedded JSON from closing the script tag', () => {
    const payload = toString(jsonScript([{ name: '</script><script>alert(1)</script>' }]));
    assert.ok(!payload.includes('</script>'), payload);
    assert.ok(payload.includes('\\u003c'));
  });
});

describe('staff accounts', () => {
  it('signs a staff member in with the right password only', () => {
    createUser(db, {
      email: 'cashier@hairifybb.com',
      name: 'Shanice',
      password: 'a-good-long-password',
      role: 'cashier',
      pin: '4821',
    });

    assert.ok(verifyLogin(db, 'cashier@hairifybb.com', 'a-good-long-password'));
    assert.equal(verifyLogin(db, 'cashier@hairifybb.com', 'wrong'), null);
    assert.equal(verifyLogin(db, 'nobody@hairifybb.com', 'a-good-long-password'), null);
  });

  it('never stores the password itself', () => {
    const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('cashier@hairifybb.com');
    assert.ok(!row.password_hash.includes('a-good-long-password'));
    assert.match(row.password_hash, /^\$2[aby]\$/);
  });

  it('signs a cashier in by till PIN', () => {
    const user = verifyPin(db, '4821');
    assert.equal(user.email, 'cashier@hairifybb.com');
    assert.equal(verifyPin(db, '0000'), null);
  });

  it('will not sign in a disabled account', () => {
    db.prepare("UPDATE users SET active = 0 WHERE email = 'cashier@hairifybb.com'").run();
    assert.equal(verifyLogin(db, 'cashier@hairifybb.com', 'a-good-long-password'), null);
    db.prepare("UPDATE users SET active = 1 WHERE email = 'cashier@hairifybb.com'").run();
  });

  it('keeps a session until it is destroyed', () => {
    const user = verifyLogin(db, 'cashier@hairifybb.com', 'a-good-long-password');
    const sessionId = createSession(db, user.id);

    assert.equal(userForSession(db, sessionId).id, user.id);
    destroySession(db, sessionId);
    assert.equal(userForSession(db, sessionId), null);
  });

  it('ignores an expired session', () => {
    const user = verifyLogin(db, 'cashier@hairifybb.com', 'a-good-long-password');
    const sessionId = createSession(db, user.id);
    db.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 day') WHERE id = ?").run(sessionId);

    assert.equal(userForSession(db, sessionId), null);
  });

  it('ranks roles so a cashier cannot reach the back office', () => {
    assert.equal(hasRole({ role: 'cashier' }, 'cashier'), true);
    assert.equal(hasRole({ role: 'cashier' }, 'manager'), false);
    assert.equal(hasRole({ role: 'manager' }, 'manager'), true);
    assert.equal(hasRole({ role: 'admin' }, 'manager'), true);
    assert.equal(hasRole(null, 'cashier'), false);
  });
});
