import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { assert } from './domain.mjs';
const scrypt = promisify(scryptCallback);
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export const randomToken = () => randomBytes(32).toString('hex');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
export async function checkPassword(password, hash) {
  const [salt, saved] = hash.split(':');
  const key = await scrypt(password, salt, 64);
  return timingSafeEqual(key, Buffer.from(saved, 'hex'));
}
export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, customer_id: user.customer_id };
}
export function setSession(db, res, user) {
  const token = randomToken();
  db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash(token), user.id, Date.now() + 7 * 86400000);
  res.cookie('brightloop_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 7 * 86400000 });
}
export function sessionMiddleware(db) {
  return (req, _res, next) => {
    const token = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('brightloop_session='))?.split('=')[1];
    if (token) {
      req.sessionHash = tokenHash(token);
      req.user = db.prepare('SELECT u.id,u.name,u.email,u.role,u.customer_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(req.sessionHash, Date.now());
    }
    next();
  };
}
export const requireUser = (req, _res, next) => { assert(req.user, 'Please sign in to continue', 401); next(); };
export const roles = (...allowed) => (req, _res, next) => { assert(req.user && allowed.includes(req.user.role), 'You do not have permission for this action', 403); next(); };
export function ownRecord(req, row) {
  assert(row, 'Record not found', 404);
  assert(req.user.role !== 'customer' || row.customer_id === req.user.customer_id, 'Record not found', 404);
  return row;
}
