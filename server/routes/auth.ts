import crypto from 'node:crypto';
import { Router } from 'express';
import { db, hashPassword, verifyPassword, writeAdminLog } from '../db';
import {
  clearSessionCookie,
  createSession,
  getPublicUserById,
  revokeSession,
  setSessionCookie,
  type AuthenticatedRequest,
} from '../auth';
import { validateEmailAndPassword } from '../../src/shared/validation';

export const authRouter = Router();

authRouter.get('/me', (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.json({ authenticated: false, user: null });
    return;
  }
  res.json({ authenticated: true, user: req.user });
});

authRouter.post('/register', (req, res) => {
  const regSetting = db
    .prepare("SELECT value FROM site_settings WHERE key = 'registration_enabled'")
    .get() as { value: string } | undefined;
  if (regSetting?.value === 'false') {
    res.status(403).json({ error: 'New investigator registrations are currently closed by the Directorate.' });
    return;
  }

  const email = String(req.body?.email || '').toLowerCase().trim();
  const password = String(req.body?.password || '');
  const fullName = String(req.body?.full_name || '').trim();

  if (fullName.length < 2) {
    res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    return;
  }

  const validation = validateEmailAndPassword(email, password);
  if (!validation.valid) {
    res.status(400).json({ error: validation.errors[0] });
    return;
  }

  const existing = db.prepare('SELECT id FROM profiles WHERE lower(email) = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const entryInst = db.prepare("SELECT id FROM institutions WHERE code = 'AURVAN_POLICE'").get() as { id: number };
  const entryRank = db
    .prepare('SELECT id FROM ranks WHERE institution_id = ? ORDER BY level_order ASC LIMIT 1')
    .get(entryInst.id) as { id: number };

  const userId = `usr_${crypto.randomUUID()}`;
  const playerCode = `AUR-${Math.floor(100000 + Math.random() * 900000)}`;
  const verificationToken = crypto.randomBytes(20).toString('hex');
  const { salt, hash } = hashPassword(password);

  db.prepare(`
    INSERT INTO profiles (
      id, email, full_name, password_hash, password_salt, player_code,
      institution_id, rank_id, status, email_verified, verification_token, bio
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0, ?, '')
  `).run(userId, email, fullName, hash, salt, playerCode, entryInst.id, entryRank.id, verificationToken);

  // Strictly enforce PLAYER role — never allow user-supplied role selection
  db.prepare("INSERT INTO user_roles (user_id, role, granted_by) VALUES (?, 'PLAYER', 'SELF_REGISTER')").run(userId);

  db.prepare(`
    INSERT INTO notifications (id, user_id, title, message)
    VALUES (?, ?, ?, ?)
  `).run(
    `ntf_${crypto.randomUUID()}`,
    userId,
    'Induction Confirmed — AURVAN POLICE',
    'Welcome to AURVAN UNIVERSE. Verify your email address in Account Settings and await official case publications from the Directorate.'
  );

  const { rawToken } = createSession(userId);
  setSessionCookie(res, rawToken);
  const user = getPublicUserById(userId);

  res.status(201).json({
    user,
    token: rawToken,
    verificationToken,
  });
});

authRouter.post('/login', (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const row = db
    .prepare(
      `
    SELECT p.id, p.password_hash, p.password_salt, p.status, ur.role
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id
    WHERE lower(p.email) = ?
  `
    )
    .get(email) as
    | { id: string; password_hash: string; password_salt: string; status: string; role: string }
    | undefined;

  if (!row || !verifyPassword(password, row.password_salt, row.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (row.status === 'SUSPENDED') {
    res.status(403).json({ error: 'This account has been suspended by the Directorate.' });
    return;
  }

  const { rawToken } = createSession(row.id);
  setSessionCookie(res, rawToken);
  const user = getPublicUserById(row.id);

  if (row.role === 'ADMIN' || row.role === 'SUPER_ADMIN') {
    writeAdminLog(row.id, email, 'ADMIN_LOGIN', 'SESSION', row.id, 'Authenticated admin portal session.');
  }

  res.json({
    user,
    token: rawToken,
  });
});

authRouter.post('/logout', (req: AuthenticatedRequest, res) => {
  if (req.sessionToken) {
    revokeSession(req.sessionToken);
  }
  clearSessionCookie(res);
  res.json({ success: true });
});

authRouter.post('/verify-email', (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) {
    res.status(400).json({ error: 'Verification token is required.' });
    return;
  }
  const profile = db
    .prepare('SELECT id FROM profiles WHERE verification_token = ?')
    .get(token) as { id: string } | undefined;

  if (!profile) {
    res.status(400).json({ error: 'Invalid or expired verification token.' });
    return;
  }

  db.prepare(
    'UPDATE profiles SET email_verified = 1, verification_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(profile.id);

  res.json({ success: true, message: 'Email verified successfully.' });
});

authRouter.post('/forgot-password', (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!email) {
    res.status(400).json({ error: 'Email address is required.' });
    return;
  }

  const profile = db
    .prepare('SELECT id FROM profiles WHERE lower(email) = ?')
    .get(email) as { id: string } | undefined;

  // Never leak whether an account exists, and never return a reset token for privileged admin accounts in response
  if (!profile) {
    res.json({
      success: true,
      message: 'If an account matches that email, password reset instructions have been issued.',
    });
    return;
  }

  const roleRow = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').get(profile.id) as { role: string };
  if (roleRow.role === 'SUPER_ADMIN' || roleRow.role === 'ADMIN') {
    res.json({
      success: true,
      message: 'Administrative accounts must rotate credentials through server environment configuration or Directorate Console.',
    });
    return;
  }

  const resetToken = crypto.randomBytes(20).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  db.prepare('UPDATE profiles SET reset_token = ?, reset_expires_at = ? WHERE id = ?').run(
    resetToken,
    expiresAt,
    profile.id
  );

  res.json({
    success: true,
    message: 'Password reset token generated. Enter the token below to set a new password.',
    resetTokenPreview: resetToken,
  });
});

authRouter.post('/reset-password', (req, res) => {
  const token = String(req.body?.token || '').trim();
  const newPassword = String(req.body?.newPassword || '');

  if (!token || newPassword.length < 8) {
    res.status(400).json({ error: 'Valid reset token and a new password (min 8 chars) are required.' });
    return;
  }

  const profile = db
    .prepare('SELECT id, reset_expires_at FROM profiles WHERE reset_token = ?')
    .get(token) as { id: string; reset_expires_at: string | null } | undefined;

  if (!profile || !profile.reset_expires_at || new Date(profile.reset_expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: 'Invalid or expired reset token.' });
    return;
  }

  const { salt, hash } = hashPassword(newPassword);
  db.prepare(
    'UPDATE profiles SET password_hash = ?, password_salt = ?, reset_token = NULL, reset_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(hash, salt, profile.id);

  res.json({ success: true, message: 'Password updated. You may now sign in.' });
});
