import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db';
import type { PublicUser, UserRole } from '../src/shared/types';

export interface AuthenticatedRequest extends Request {
  user?: PublicUser;
  sessionToken?: string;
}

const SESSION_COOKIE_NAME = 'aurvan_session';
const SESSION_TTL_DAYS = 30;

function hashToken(rawToken: string): string {
  const secret = process.env.SESSION_SECRET || 'aurvan-universe-persistent-session-key';
  return crypto.createHmac('sha256', secret).update(rawToken).digest('hex');
}

export function createSession(userId: string): { rawToken: string; expiresAt: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresDate = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const expiresAt = expiresDate.toISOString();

  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(tokenHash, userId, expiresAt);

  return { rawToken, expiresAt };
}

export function revokeSession(rawToken: string): void {
  const tokenHash = hashToken(rawToken);
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

export function setSessionCookie(res: Response, rawToken: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

export function extractTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim().length > 0) {
    return cookieToken.trim();
  }
  return null;
}

export function getPublicUserById(userId: string): PublicUser | null {
  const row = db
    .prepare(
      `
    SELECT
      p.id,
      p.email,
      p.full_name,
      p.player_code,
      ur.role,
      p.institution_id,
      i.code as institution_code,
      i.name as institution_name,
      p.rank_id,
      r.title as rank_title,
      r.level_order as rank_order,
      p.status,
      p.email_verified,
      p.bio,
      p.created_at
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id
    JOIN institutions i ON i.id = p.institution_id
    JOIN ranks r ON r.id = p.rank_id
    WHERE p.id = ?
  `
    )
    .get(userId) as (Omit<PublicUser, 'email_verified'> & { email_verified: number }) | undefined;

  if (!row) return null;
  return {
    ...row,
    email_verified: Boolean(row.email_verified),
  };
}

export function attachSession(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const rawToken = extractTokenFromRequest(req);
  if (!rawToken) {
    next();
    return;
  }

  const tokenHash = hashToken(rawToken);
  const session = db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
    .get(tokenHash) as { user_id: string; expires_at: string } | undefined;

  if (!session) {
    next();
    return;
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    next();
    return;
  }

  const user = getPublicUserById(session.user_id);
  if (user && user.status === 'ACTIVE') {
    req.user = user;
    req.sessionToken = rawToken;
  }
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  if (req.user.status === 'SUSPENDED') {
    res.status(403).json({ error: 'Your account is currently suspended. Contact the Directorate.' });
    return;
  }
  next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient clearance for this restricted resource.' });
      return;
    }
    next();
  };
}
