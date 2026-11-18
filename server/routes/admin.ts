import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { db, PRIVATE_UPLOADS_PATH, PUBLIC_UPLOADS_PATH, writeAdminLog } from '../db';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../auth';
import {
  canTransitionCaseStatus,
  slugifyCaseTitle,
  validateCaseForPublish,
  validateUploadFile,
} from '../../src/shared/validation';
import type { CaseStatus } from '../../src/shared/types';
import { studio3dRouter } from './studio3d';

export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(requireRole(['ADMIN', 'SUPER_ADMIN']));
adminRouter.use('/3d', studio3dRouter);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, PUBLIC_UPLOADS_PATH);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const privateDocStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, PRIVATE_UPLOADS_PATH);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const uploadMedia = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadDoc = multer({ storage: privateDocStorage, limits: { fileSize: 20 * 1024 * 1024 } });
const uploadAudio = multer({ storage, limits: { fileSize: 30 * 1024 * 1024 } });

// ── A. OVERVIEW STATS ────────────────────────────────────────────────────────
adminRouter.get('/overview', (_req, res) => {
  const totalPlayers = (
    db.prepare("SELECT COUNT(*) as c FROM profiles p JOIN user_roles ur ON ur.user_id = p.id WHERE ur.role = 'PLAYER'").get() as {
      c: number;
    }
  ).c;
  const activePlayers = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM profiles p JOIN user_roles ur ON ur.user_id = p.id WHERE ur.role = 'PLAYER' AND p.status = 'ACTIVE'"
      )
      .get() as { c: number }
  ).c;
  const publishedCases = (db.prepare("SELECT COUNT(*) as c FROM cases WHERE status = 'PUBLISHED'").get() as { c: number }).c;
  const draftCases = (
    db.prepare("SELECT COUNT(*) as c FROM cases WHERE status IN ('DRAFT', 'IN_REVIEW', 'READY_TO_PUBLISH')").get() as {
      c: number;
    }
  ).c;
  const archivedCases = (db.prepare("SELECT COUNT(*) as c FROM cases WHERE status = 'ARCHIVED'").get() as { c: number }).c;
  const pendingReports = (
    db.prepare("SELECT COUNT(*) as c FROM case_reports WHERE status IN ('SUBMITTED', 'UNDER_REVIEW')").get() as {
      c: number;
    }
  ).c;
  const completedInvestigations = (
    db.prepare("SELECT COUNT(*) as c FROM case_reports WHERE status = 'APPROVED'").get() as { c: number }
  ).c;

  const recentLogs = db.prepare('SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT 12').all();

  res.json({
    stats: {
      totalPlayers,
      activePlayers,
      publishedCases,
      draftCases,
      archivedCases,
      pendingReports,
      completedInvestigations,
    },
    recentLogs,
  });
});

// ── B. CASE MANAGEMENT SYSTEM ────────────────────────────────────────────────
function getFullCaseBundle(caseId: string) {
  const c = db
    .prepare(
      `
    SELECT c.*, i.name as institution_name, i.code as institution_code, reg.name as region_name,
      m.url as scene_3d_url, m.format as scene_3d_format
    FROM cases c
    JOIN institutions i ON i.id = c.institution_id
    JOIN regions reg ON reg.id = c.region_id
    LEFT JOIN models_3d m ON m.id = c.scene_3d_model_id AND m.status = 'READY'
    WHERE c.id = ?
  `
    )
    .get(caseId) as any;

  if (!c) return null;

  const chapters = db.prepare('SELECT * FROM case_chapters WHERE case_id = ? ORDER BY chapter_number ASC').all(caseId);
  const evidence = db
    .prepare(
      `
    SELECT ce.*, m.url as model_3d_url, m.format as model_3d_format, m.status as model_3d_status
    FROM case_evidence ce
    LEFT JOIN models_3d m ON m.id = ce.model_3d_id AND m.status = 'READY'
    WHERE ce.case_id = ?
    ORDER BY ce.chapter_number ASC, ce.sort_order ASC
  `
    )
    .all(caseId)
    .map((ev: any) => ({
      ...ev,
      related_characters: JSON.parse(ev.related_characters_json || '[]'),
      related_evidence: JSON.parse(ev.related_evidence_json || '[]'),
      is_visible: Boolean(ev.is_visible),
    }));
  const characters = db
    .prepare(
      `
    SELECT ch.*, m.url as model_3d_url, m.format as model_3d_format
    FROM case_characters ch
    LEFT JOIN models_3d m ON m.id = ch.model_3d_id AND m.status = 'READY'
    WHERE ch.case_id = ?
    ORDER BY ch.rowid ASC
  `
    )
    .all(caseId)
    .map((ch: any) => ({
      ...ch,
      relationships: JSON.parse(ch.relationships_json || '[]'),
      is_public: Boolean(ch.is_public),
    }));
  const witnesses = db
    .prepare('SELECT * FROM case_witnesses WHERE case_id = ? ORDER BY chapter_number ASC, rowid ASC')
    .all(caseId);
  const questions = db
    .prepare('SELECT * FROM interrogation_questions WHERE case_id = ? ORDER BY sort_order ASC')
    .all(caseId);
  const hints = db
    .prepare('SELECT * FROM case_hints WHERE case_id = ? ORDER BY chapter_number ASC, hint_order ASC')
    .all(caseId)
    .map((h: any) => ({ ...h, is_enabled: Boolean(h.is_enabled) }));
  const solutionRow = db.prepare('SELECT * FROM case_solutions WHERE case_id = ?').get(caseId) as any;

  const parsedCase = {
    ...c,
    gallery: JSON.parse(c.gallery_json || '[]'),
    player_tasks: JSON.parse(c.player_tasks_json || '[]'),
    evaluation_criteria: JSON.parse(c.evaluation_criteria_json || '[]'),
  };

  const solution = solutionRow
    ? {
        case_id: solutionRow.case_id,
        master_solution: solutionRow.master_solution,
        actual_timeline: JSON.parse(solutionRow.actual_timeline_json || '[]'),
        responsible_character: solutionRow.responsible_character,
        evidence_explanations: JSON.parse(solutionRow.evidence_explanations_json || '[]'),
        red_herrings: JSON.parse(solutionRow.red_herrings_json || '[]'),
        critical_clues: JSON.parse(solutionRow.critical_clues_json || '[]'),
        internal_notes: solutionRow.internal_notes,
      }
    : {
        case_id: caseId,
        master_solution: '',
        actual_timeline: [],
        responsible_character: '',
        evidence_explanations: [],
        red_herrings: [],
        critical_clues: [],
        internal_notes: '',
      };

  const validation = validateCaseForPublish({
    case_code: parsedCase.case_code,
    title: parsedCase.title,
    short_description: parsedCase.short_description,
    full_story: parsedCase.full_story,
    institution_id: parsedCase.institution_id,
    region_id: parsedCase.region_id,
    difficulty: parsedCase.difficulty,
    estimated_duration: parsedCase.estimated_duration,
    player_tasks: parsedCase.player_tasks,
    evaluation_criteria: parsedCase.evaluation_criteria,
    chaptersCount: chapters.length,
    evidenceCount: evidence.length,
    hasMasterSolution: Boolean(solutionRow),
    masterSolutionText: solution.master_solution,
  });

  return {
    caseData: parsedCase,
    chapters,
    evidence,
    characters,
    witnesses,
    questions,
    hints,
    solution,
    validation,
  };
}

adminRouter.get('/cases', (_req, res) => {
  const cases = db
    .prepare(
      `
    SELECT c.*, i.name as institution_name, i.code as institution_code, reg.name as region_name,
      (SELECT COUNT(*) FROM case_chapters ch WHERE ch.case_id = c.id) as chapters_count,
      (SELECT COUNT(*) FROM case_evidence ev WHERE ev.case_id = c.id) as evidence_count
    FROM cases c
    JOIN institutions i ON i.id = c.institution_id
    JOIN regions reg ON reg.id = c.region_id
    ORDER BY c.updated_at DESC
  `
    )
    .all()
    .map((c: any) => ({
      ...c,
      gallery: JSON.parse(c.gallery_json || '[]'),
      player_tasks: JSON.parse(c.player_tasks_json || '[]'),
      evaluation_criteria: JSON.parse(c.evaluation_criteria_json || '[]'),
    }));

  res.json({ cases });
});

adminRouter.post('/cases', (req: AuthenticatedRequest, res) => {
  const title = String(req.body?.title || '').trim();
  const caseCode = String(req.body?.case_code || '').trim().toUpperCase();
  const institutionId = Number(req.body?.institution_id || 1);
  const regionId = Number(req.body?.region_id || 1);

  if (title.length < 3 || caseCode.length < 2) {
    res.status(400).json({ error: 'Case Title (min 3 chars) and Case ID/Code (min 2 chars) are required.' });
    return;
  }

  const existingCode = db.prepare('SELECT id FROM cases WHERE case_code = ?').get(caseCode);
  if (existingCode) {
    res.status(409).json({ error: `Case ID ${caseCode} already exists.` });
    return;
  }

  const id = `cas_${crypto.randomUUID()}`;
  const baseSlug = slugifyCaseTitle(title) || `case-${Date.now()}`;
  const slug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`;

  db.prepare(`
    INSERT INTO cases (
      id, case_code, title, slug, short_description, full_story,
      institution_id, region_id, difficulty, estimated_duration, status,
      cover_image_url, thumbnail_url, gallery_json, player_tasks_json, evaluation_criteria_json,
      min_rank_order, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    caseCode,
    title,
    slug,
    String(req.body?.short_description || ''),
    String(req.body?.full_story || ''),
    institutionId,
    regionId,
    String(req.body?.difficulty || 'STANDARD'),
    String(req.body?.estimated_duration || '60 mins'),
    req.body?.cover_image_url || null,
    req.body?.thumbnail_url || null,
    JSON.stringify(Array.isArray(req.body?.gallery) ? req.body.gallery : []),
    JSON.stringify(Array.isArray(req.body?.player_tasks) ? req.body.player_tasks : []),
    JSON.stringify(Array.isArray(req.body?.evaluation_criteria) ? req.body.evaluation_criteria : []),
    Number(req.body?.min_rank_order || 1),
    req.user!.id
  );

  db.prepare('INSERT INTO case_solutions (case_id) VALUES (?)').run(id);
  writeAdminLog(req.user!.id, req.user!.email, 'CASE_CREATED', 'CASE', id, `Created draft case ${caseCode}: ${title}`);

  res.status(201).json(getFullCaseBundle(id));
});

adminRouter.get('/cases/:caseId', (req, res) => {
  const bundle = getFullCaseBundle(req.params.caseId);
  if (!bundle) {
    res.status(404).json({ error: 'Case not found.' });
    return;
  }
  res.json(bundle);
});

adminRouter.put('/cases/:caseId', (req: AuthenticatedRequest, res) => {
  const existing = db.prepare('SELECT id, case_code FROM cases WHERE id = ?').get(req.params.caseId) as any;
  if (!existing) {
    res.status(404).json({ error: 'Case not found.' });
    return;
  }

  const b = req.body || {};
  db.prepare(`
    UPDATE cases SET
      case_code = ?,
      title = ?,
      short_description = ?,
      full_story = ?,
      institution_id = ?,
      region_id = ?,
      difficulty = ?,
      estimated_duration = ?,
      cover_image_url = ?,
      thumbnail_url = ?,
      gallery_json = ?,
      player_tasks_json = ?,
      evaluation_criteria_json = ?,
      min_rank_order = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    String(b.case_code || existing.case_code).trim().toUpperCase(),
    String(b.title || '').trim(),
    String(b.short_description || ''),
    String(b.full_story || ''),
    Number(b.institution_id || 1),
    Number(b.region_id || 1),
    String(b.difficulty || 'STANDARD'),
    String(b.estimated_duration || '60 mins'),
    b.cover_image_url || null,
    b.thumbnail_url || null,
    JSON.stringify(Array.isArray(b.gallery) ? b.gallery : []),
    JSON.stringify(Array.isArray(b.player_tasks) ? b.player_tasks : []),
    JSON.stringify(Array.isArray(b.evaluation_criteria) ? b.evaluation_criteria : []),
    Number(b.min_rank_order || 1),
    req.params.caseId
  );

  writeAdminLog(req.user!.id, req.user!.email, 'CASE_UPDATED', 'CASE', req.params.caseId, `Updated metadata for case ${existing.case_code}`);
  res.json(getFullCaseBundle(req.params.caseId));
});

adminRouter.post('/cases/:caseId/status', (req: AuthenticatedRequest, res) => {
  const targetStatus = String(req.body?.status || '') as CaseStatus;
  const bundle = getFullCaseBundle(req.params.caseId);
  if (!bundle) {
    res.status(404).json({ error: 'Case not found.' });
    return;
  }

  if (!canTransitionCaseStatus(bundle.caseData.status, targetStatus)) {
    res.status(400).json({
      error: `Cannot transition directly from ${bundle.caseData.status} to ${targetStatus}. Restore to DRAFT first.`,
    });
    return;
  }

  if (targetStatus === 'PUBLISHED' && !bundle.validation.valid) {
    res.status(400).json({
      error: 'Case failed publication validation.',
      validationErrors: bundle.validation.errors,
    });
    return;
  }

  const publishedAt =
    targetStatus === 'PUBLISHED' ? new Date().toISOString() : targetStatus === 'DRAFT' ? null : bundle.caseData.published_at;

  db.prepare('UPDATE cases SET status = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    targetStatus,
    publishedAt,
    req.params.caseId
  );

  const actionName =
    targetStatus === 'PUBLISHED'
      ? 'CASE_PUBLISHED'
      : targetStatus === 'ARCHIVED'
      ? 'CASE_ARCHIVED'
      : 'CASE_STATUS_CHANGED';

  writeAdminLog(
    req.user!.id,
    req.user!.email,
    actionName,
    'CASE',
    req.params.caseId,
    `Changed case ${bundle.caseData.case_code} status to ${targetStatus}`
  );

  res.json(getFullCaseBundle(req.params.caseId));
});

adminRouter.delete('/cases/:caseId', (req: AuthenticatedRequest, res) => {
  const existing = db.prepare('SELECT id, case_code, title FROM cases WHERE id = ?').get(req.params.caseId) as any;
  if (!existing) {
    res.status(404).json({ error: 'Case not found.' });
    return;
  }
  db.prepare('DELETE FROM cases WHERE id = ?').run(req.params.caseId);
  writeAdminLog(req.user!.id, req.user!.email, 'CASE_DELETED', 'CASE', req.params.caseId, `Deleted case ${existing.case_code}: ${existing.title}`);
  res.json({ success: true });
});

// Chapters CRUD
adminRouter.post('/cases/:caseId/chapters', (req: AuthenticatedRequest, res) => {
  const { chapter_number, title, briefing_text, unlock_condition } = req.body || {};
  if (!title || !briefing_text) {
    res.status(400).json({ error: 'Chapter title and briefing text are required.' });
    return;
  }
  const id = `chp_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO case_chapters (id, case_id, chapter_number, title, briefing_text, unlock_condition)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.params.caseId, Number(chapter_number || 1), String(title), String(briefing_text), String(unlock_condition || 'IMMEDIATE'));
  writeAdminLog(req.user!.id, req.user!.email, 'CHAPTER_ADDED', 'CASE', req.params.caseId, `Added chapter: ${title}`);
  res.json(getFullCaseBundle(req.params.caseId));
});

adminRouter.delete('/cases/:caseId/chapters/:chapterId', (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM case_chapters WHERE id = ? AND case_id = ?').run(req.params.chapterId, req.params.caseId);
  res.json(getFullCaseBundle(req.params.caseId));
});

// Evidence CRUD
adminRouter.post('/cases/:caseId/evidence', (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  if (!b.evidence_code || !b.title) {
    res.status(400).json({ error: 'Evidence code and title are required.' });
    return;
  }
  const id = `evd_${crypto.randomUUID()}`;
  const model3dId = b.model_3d_id ? String(b.model_3d_id) : null;
  const preferredView = model3dId && b.preferred_view === '3D' ? '3D' : 'STANDARD';
  db.prepare(`
    INSERT INTO case_evidence (
      id, case_id, evidence_code, title, evidence_type, description,
      image_url, document_id, audio_id, model_3d_id, preferred_view, chapter_number, access_condition,
      related_characters_json, related_evidence_json, private_explanation, sort_order, is_visible
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.params.caseId,
    String(b.evidence_code).trim().toUpperCase(),
    String(b.title).trim(),
    String(b.evidence_type || 'DOCUMENT'),
    String(b.description || ''),
    b.image_url || null,
    b.document_id || null,
    b.audio_id || null,
    model3dId,
    preferredView,
    Number(b.chapter_number || 1),
    String(b.access_condition || 'IMMEDIATE'),
    JSON.stringify(Array.isArray(b.related_characters) ? b.related_characters : []),
    JSON.stringify(Array.isArray(b.related_evidence) ? b.related_evidence : []),
    String(b.private_explanation || ''),
    Number(b.sort_order || 1),
    b.is_visible === false ? 0 : 1
  );
  if (model3dId) {
    db.prepare('UPDATE models_3d SET linked_entity_type = ?, linked_entity_id = ? WHERE id = ?').run(
      'EVIDENCE',
      id,
      model3dId
    );
  }
  writeAdminLog(req.user!.id, req.user!.email, 'EVIDENCE_ADDED', 'CASE', req.params.caseId, `Added evidence ${b.evidence_code}`);
  res.json(getFullCaseBundle(req.params.caseId));
});

adminRouter.delete('/cases/:caseId/evidence/:evidenceId', (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM case_evidence WHERE id = ? AND case_id = ?').run(req.params.evidenceId, req.params.caseId);
  res.json(getFullCaseBundle(req.params.caseId));
});

// Characters CRUD
adminRouter.post('/cases/:caseId/characters', (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  if (!b.name || !b.role) {
    res.status(400).json({ error: 'Character name and role are required.' });
    return;
  }
  const id = `chr_${crypto.randomUUID()}`;
  const model3dId = b.model_3d_id ? String(b.model_3d_id) : null;
  const preferredView = model3dId && b.preferred_view === '3D' ? '3D' : 'STANDARD';
  db.prepare(`
    INSERT INTO case_characters (id, case_id, name, role, portrait_url, description, background, relationships_json, private_info, model_3d_id, preferred_view, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.params.caseId,
    String(b.name).trim(),
    String(b.role).trim(),
    b.portrait_url || null,
    String(b.description || ''),
    String(b.background || ''),
    JSON.stringify(Array.isArray(b.relationships) ? b.relationships : []),
    String(b.private_info || ''),
    model3dId,
    preferredView,
    b.is_public === false ? 0 : 1
  );
  if (model3dId) {
    db.prepare('UPDATE models_3d SET linked_entity_type = ?, linked_entity_id = ? WHERE id = ?').run(
      'CHARACTER',
      id,
      model3dId
    );
  }
  res.json(getFullCaseBundle(req.params.caseId));
});

adminRouter.delete('/cases/:caseId/characters/:charId', (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM case_characters WHERE id = ? AND case_id = ?').run(req.params.charId, req.params.caseId);
  res.json(getFullCaseBundle(req.params.caseId));
});

// Witnesses & Interrogations CRUD
adminRouter.post('/cases/:caseId/witnesses', (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  if (!b.name || !b.statement_text) {
    res.status(400).json({ error: 'Witness name and initial statement are required.' });
    return;
  }
  const id = `wit_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO case_witnesses (id, case_id, name, role, portrait_url, statement_text, chapter_number)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.caseId, String(b.name).trim(), String(b.role || 'Witness'), b.portrait_url || null, String(b.statement_text), Number(b.chapter_number || 1));
  res.json(getFullCaseBundle(req.params.caseId));
});

adminRouter.delete('/cases/:caseId/witnesses/:witnessId', (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM case_witnesses WHERE id = ? AND case_id = ?').run(req.params.witnessId, req.params.caseId);
  res.json(getFullCaseBundle(req.params.caseId));
});

adminRouter.post('/cases/:caseId/interrogations', (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  if (!b.witness_id || !b.question_text || !b.response_text) {
    res.status(400).json({ error: 'Witness, question, and response are required.' });
    return;
  }
  const id = `inq_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO interrogation_questions (id, case_id, witness_id, question_text, response_text, follow_up_hint, hidden_evaluation_rule, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.params.caseId,
    String(b.witness_id),
    String(b.question_text),
    String(b.response_text),
    String(b.follow_up_hint || ''),
    String(b.hidden_evaluation_rule || ''),
    Number(b.sort_order || 1)
  );
  res.json(getFullCaseBundle(req.params.caseId));
});

adminRouter.delete('/cases/:caseId/interrogations/:questionId', (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM interrogation_questions WHERE id = ? AND case_id = ?').run(req.params.questionId, req.params.caseId);
  res.json(getFullCaseBundle(req.params.caseId));
});

// Hints CRUD
adminRouter.post('/cases/:caseId/hints', (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  if (!b.hint_text) {
    res.status(400).json({ error: 'Hint text is required.' });
    return;
  }
  const id = `hnt_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO case_hints (id, case_id, chapter_number, hint_order, hint_text, unlock_condition, is_enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.params.caseId,
    Number(b.chapter_number || 1),
    Number(b.hint_order || 1),
    String(b.hint_text),
    String(b.unlock_condition || 'ON_REQUEST'),
    b.is_enabled === false ? 0 : 1
  );
  res.json(getFullCaseBundle(req.params.caseId));
});

adminRouter.delete('/cases/:caseId/hints/:hintId', (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM case_hints WHERE id = ? AND case_id = ?').run(req.params.hintId, req.params.caseId);
  res.json(getFullCaseBundle(req.params.caseId));
});

// Private Master Solution
adminRouter.put('/cases/:caseId/solution', (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  db.prepare(`
    INSERT INTO case_solutions (
      case_id, master_solution, actual_timeline_json, responsible_character,
      evidence_explanations_json, red_herrings_json, critical_clues_json, internal_notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(case_id) DO UPDATE SET
      master_solution = excluded.master_solution,
      actual_timeline_json = excluded.actual_timeline_json,
      responsible_character = excluded.responsible_character,
      evidence_explanations_json = excluded.evidence_explanations_json,
      red_herrings_json = excluded.red_herrings_json,
      critical_clues_json = excluded.critical_clues_json,
      internal_notes = excluded.internal_notes,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    req.params.caseId,
    String(b.master_solution || ''),
    JSON.stringify(Array.isArray(b.actual_timeline) ? b.actual_timeline : []),
    String(b.responsible_character || ''),
    JSON.stringify(Array.isArray(b.evidence_explanations) ? b.evidence_explanations : []),
    JSON.stringify(Array.isArray(b.red_herrings) ? b.red_herrings : []),
    JSON.stringify(Array.isArray(b.critical_clues) ? b.critical_clues : []),
    String(b.internal_notes || '')
  );

  writeAdminLog(req.user!.id, req.user!.email, 'SOLUTION_UPDATED', 'CASE', req.params.caseId, 'Updated confidential master solution.');
  res.json(getFullCaseBundle(req.params.caseId));
});

// ── C. MEDIA & GALLERY MANAGER ───────────────────────────────────────────────
adminRouter.get('/media', (req, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const folder = String(req.query.folder || '').trim();
  let query = `
    SELECT ma.*, m.url as model_3d_url, m.format as model_3d_format
    FROM media_assets ma
    LEFT JOIN models_3d m ON m.id = ma.model_3d_id AND m.status = 'READY'
    WHERE 1=1
  `;
  const params: any[] = [];
  if (search) {
    query += ' AND (lower(ma.title) LIKE ? OR lower(ma.file_name) LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (folder && folder !== 'all') {
    query += ' AND ma.folder = ?';
    params.push(folder);
  }
  query += ' ORDER BY ma.created_at DESC';
  const assets = db.prepare(query).all(...params);
  res.json({ assets });
});

adminRouter.post('/media', uploadMedia.array('files', 20), (req: AuthenticatedRequest, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    res.status(400).json({ error: 'No image files were provided.' });
    return;
  }

  const folder = String(req.body?.folder || 'general').trim() || 'general';
  const created: any[] = [];

  for (const file of files) {
    const check = validateUploadFile('image', file.mimetype, file.size, file.originalname);
    if (!check.valid) {
      fs.unlinkSync(file.path);
      res.status(400).json({ error: `${file.originalname}: ${check.errors[0]}` });
      return;
    }

    const id = `med_${crypto.randomUUID()}`;
    const url = `/uploads/public/${file.filename}`;
    const title = String(req.body?.title || file.originalname.replace(/\.[^/.]+$/, ''));

    db.prepare(`
      INSERT INTO media_assets (id, title, file_name, folder, mime_type, size_bytes, url, source_type, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'upload', ?)
    `).run(id, title, file.originalname, folder, file.mimetype, file.size, url, req.user!.id);

    created.push(db.prepare('SELECT * FROM media_assets WHERE id = ?').get(id));
  }

  writeAdminLog(
    req.user!.id,
    req.user!.email,
    'MEDIA_UPLOADED',
    'MEDIA',
    created[0]?.id || 'batch',
    `Uploaded ${created.length} image(s) to folder "${folder}".`
  );

  res.status(201).json({ assets: created });
});

adminRouter.patch('/media/:id', (req: AuthenticatedRequest, res) => {
  const title = String(req.body?.title || '').trim();
  const folder = String(req.body?.folder || 'general').trim();
  if (!title) {
    res.status(400).json({ error: 'Title is required.' });
    return;
  }
  db.prepare('UPDATE media_assets SET title = ?, folder = ? WHERE id = ?').run(title, folder, req.params.id);
  writeAdminLog(req.user!.id, req.user!.email, 'MEDIA_RENAMED', 'MEDIA', req.params.id, `Renamed media asset to "${title}".`);
  res.json({ asset: db.prepare('SELECT * FROM media_assets WHERE id = ?').get(req.params.id) });
});

adminRouter.post('/media/:id/replace', uploadMedia.single('file'), (req: AuthenticatedRequest, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'Replacement image file is required.' });
    return;
  }
  const check = validateUploadFile('image', file.mimetype, file.size, file.originalname);
  if (!check.valid) {
    fs.unlinkSync(file.path);
    res.status(400).json({ error: check.errors[0] });
    return;
  }

  const existing = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    fs.unlinkSync(file.path);
    res.status(404).json({ error: 'Media asset not found.' });
    return;
  }

  if (existing.url?.startsWith('/uploads/public/')) {
    const oldPath = path.join(PUBLIC_UPLOADS_PATH, path.basename(existing.url));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const newUrl = `/uploads/public/${file.filename}`;
  db.prepare('UPDATE media_assets SET file_name = ?, mime_type = ?, size_bytes = ?, url = ? WHERE id = ?').run(
    file.originalname,
    file.mimetype,
    file.size,
    newUrl,
    req.params.id
  );
  writeAdminLog(req.user!.id, req.user!.email, 'MEDIA_REPLACED', 'MEDIA', req.params.id, `Replaced image ${existing.title}`);
  res.json({ asset: db.prepare('SELECT * FROM media_assets WHERE id = ?').get(req.params.id) });
});

adminRouter.delete('/media/:id', (req: AuthenticatedRequest, res) => {
  const existing = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Media asset not found.' });
    return;
  }
  if (existing.url?.startsWith('/uploads/public/')) {
    const oldPath = path.join(PUBLIC_UPLOADS_PATH, path.basename(existing.url));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  db.prepare('DELETE FROM media_assets WHERE id = ?').run(req.params.id);
  writeAdminLog(req.user!.id, req.user!.email, 'MEDIA_DELETED', 'MEDIA', req.params.id, `Deleted media ${existing.title}`);
  res.json({ success: true });
});

// ── D. DOCUMENT MANAGER ──────────────────────────────────────────────────────
adminRouter.get('/documents', (_req, res) => {
  const documents = db
    .prepare(
      `
    SELECT d.id, d.title, d.file_name, d.mime_type, d.size_bytes, d.is_confidential, d.case_id,
      d.model_3d_id, d.preferred_view, d.uploaded_by, d.created_at,
      m.url as model_3d_url, m.format as model_3d_format
    FROM documents d
    LEFT JOIN models_3d m ON m.id = d.model_3d_id AND m.status = 'READY'
    ORDER BY d.created_at DESC
  `
    )
    .all()
    .map((d: any) => ({ ...d, is_confidential: Boolean(d.is_confidential) }));
  res.json({ documents });
});

adminRouter.post('/documents', uploadDoc.single('file'), (req: AuthenticatedRequest, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'Document file is required.' });
    return;
  }
  const check = validateUploadFile('document', file.mimetype, file.size, file.originalname);
  if (!check.valid) {
    fs.unlinkSync(file.path);
    res.status(400).json({ error: check.errors[0] });
    return;
  }

  const id = `doc_${crypto.randomUUID()}`;
  const title = String(req.body?.title || file.originalname).trim();
  const isConfidential = req.body?.is_confidential === 'false' ? 0 : 1;
  const caseId = req.body?.case_id ? String(req.body.case_id) : null;

  db.prepare(`
    INSERT INTO documents (id, title, file_name, mime_type, size_bytes, storage_path, is_confidential, case_id, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, file.originalname, file.mimetype, file.size, file.path, isConfidential, caseId, req.user!.id);

  writeAdminLog(req.user!.id, req.user!.email, 'DOCUMENT_UPLOADED', 'DOCUMENT', id, `Uploaded document "${title}"`);
  const doc = db
    .prepare('SELECT id, title, file_name, mime_type, size_bytes, is_confidential, case_id, uploaded_by, created_at FROM documents WHERE id = ?')
    .get(id) as any;
  res.status(201).json({ document: { ...doc, is_confidential: Boolean(doc.is_confidential) } });
});

adminRouter.get('/documents/:id/preview', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id) as any;
  if (!doc || !fs.existsSync(doc.storage_path)) {
    res.status(404).json({ error: 'Document not found.' });
    return;
  }
  res.setHeader('Content-Type', doc.mime_type);
  res.sendFile(path.resolve(doc.storage_path));
});

adminRouter.delete('/documents/:id', (req: AuthenticatedRequest, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id) as any;
  if (!doc) {
    res.status(404).json({ error: 'Document not found.' });
    return;
  }
  if (fs.existsSync(doc.storage_path)) fs.unlinkSync(doc.storage_path);
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  writeAdminLog(req.user!.id, req.user!.email, 'DOCUMENT_DELETED', 'DOCUMENT', req.params.id, `Deleted document "${doc.title}"`);
  res.json({ success: true });
});

// ── E. AUDIO MANAGER ─────────────────────────────────────────────────────────
adminRouter.get('/audio', (_req, res) => {
  const audio = db.prepare('SELECT * FROM audio_assets ORDER BY created_at DESC').all();
  res.json({ audio });
});

adminRouter.post('/audio', uploadAudio.single('file'), (req: AuthenticatedRequest, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'Audio file is required.' });
    return;
  }
  const check = validateUploadFile('audio', file.mimetype, file.size, file.originalname);
  if (!check.valid) {
    fs.unlinkSync(file.path);
    res.status(400).json({ error: check.errors[0] });
    return;
  }

  const id = `aud_${crypto.randomUUID()}`;
  const title = String(req.body?.title || file.originalname).trim();
  const description = String(req.body?.description || '').trim();
  const transcript = String(req.body?.transcript || '').trim();
  const caseId = req.body?.case_id ? String(req.body.case_id) : null;
  const chapterNumber = Number(req.body?.chapter_number || 1);
  const url = `/uploads/public/${file.filename}`;

  db.prepare(`
    INSERT INTO audio_assets (id, title, description, transcript, file_name, mime_type, size_bytes, url, case_id, chapter_number, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, description, transcript, file.originalname, file.mimetype, file.size, url, caseId, chapterNumber, req.user!.id);

  writeAdminLog(req.user!.id, req.user!.email, 'AUDIO_UPLOADED', 'AUDIO', id, `Uploaded audio "${title}"`);
  res.status(201).json({ asset: db.prepare('SELECT * FROM audio_assets WHERE id = ?').get(id) });
});

adminRouter.patch('/audio/:id', (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  db.prepare('UPDATE audio_assets SET title = ?, description = ?, transcript = ?, case_id = ?, chapter_number = ? WHERE id = ?').run(
    String(b.title || ''),
    String(b.description || ''),
    String(b.transcript || ''),
    b.case_id || null,
    Number(b.chapter_number || 1),
    req.params.id
  );
  res.json({ asset: db.prepare('SELECT * FROM audio_assets WHERE id = ?').get(req.params.id) });
});

adminRouter.delete('/audio/:id', (req: AuthenticatedRequest, res) => {
  const existing = db.prepare('SELECT * FROM audio_assets WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Audio asset not found.' });
    return;
  }
  if (existing.url?.startsWith('/uploads/public/')) {
    const oldPath = path.join(PUBLIC_UPLOADS_PATH, path.basename(existing.url));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  db.prepare('DELETE FROM audio_assets WHERE id = ?').run(req.params.id);
  writeAdminLog(req.user!.id, req.user!.email, 'AUDIO_DELETED', 'AUDIO', req.params.id, `Deleted audio "${existing.title}"`);
  res.json({ success: true });
});

// ── K. PLAYER MANAGEMENT ─────────────────────────────────────────────────────
adminRouter.get('/players', (req, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  let query = `
    SELECT
      p.id, p.email, p.full_name, p.player_code, p.status, p.email_verified, p.created_at,
      p.institution_id, i.name as institution_name, i.code as institution_code,
      p.rank_id, r.title as rank_title, r.level_order as rank_order,
      ur.role,
      (SELECT COUNT(*) FROM case_reports cr WHERE cr.user_id = p.id) as total_reports,
      (SELECT COUNT(*) FROM case_reports cr WHERE cr.user_id = p.id AND cr.status = 'APPROVED') as approved_reports
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id
    JOIN institutions i ON i.id = p.institution_id
    JOIN ranks r ON r.id = p.rank_id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (search) {
    query += ' AND (lower(p.email) LIKE ? OR lower(p.full_name) LIKE ? OR lower(p.player_code) LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY p.created_at DESC';
  const players = db
    .prepare(query)
    .all(...params)
    .map((p: any) => ({ ...p, email_verified: Boolean(p.email_verified) }));
  res.json({ players });
});

adminRouter.patch('/players/:userId/status', (req: AuthenticatedRequest, res) => {
  const newStatus = req.body?.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
  const targetRole = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').get(req.params.userId) as
    | { role: string }
    | undefined;
  if (targetRole?.role === 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Super Admin accounts cannot be suspended.' });
    return;
  }
  db.prepare('UPDATE profiles SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, req.params.userId);
  writeAdminLog(
    req.user!.id,
    req.user!.email,
    newStatus === 'SUSPENDED' ? 'PLAYER_SUSPENDED' : 'PLAYER_RESTORED',
    'USER',
    req.params.userId,
    `Changed account status to ${newStatus}`
  );
  res.json({ success: true });
});

adminRouter.patch('/players/:userId/career', (req: AuthenticatedRequest, res) => {
  const institutionId = Number(req.body?.institution_id);
  const rankId = Number(req.body?.rank_id);
  const reason = String(req.body?.reason || 'Directorate career assignment').trim();

  const current = db.prepare('SELECT institution_id, rank_id FROM profiles WHERE id = ?').get(req.params.userId) as any;
  if (!current) {
    res.status(404).json({ error: 'Player not found.' });
    return;
  }

  db.prepare('UPDATE profiles SET institution_id = ?, rank_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    institutionId,
    rankId,
    req.params.userId
  );

  db.prepare(`
    INSERT INTO career_history (id, user_id, from_institution_id, to_institution_id, from_rank_id, to_rank_id, reason, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(`car_${crypto.randomUUID()}`, req.params.userId, current.institution_id, institutionId, current.rank_id, rankId, reason, req.user!.id);

  db.prepare(`
    INSERT INTO notifications (id, user_id, title, message)
    VALUES (?, ?, ?, ?)
  `).run(`ntf_${crypto.randomUUID()}`, req.params.userId, 'Career Status Updated', `Your institutional assignment or rank has been updated: ${reason}`);

  writeAdminLog(req.user!.id, req.user!.email, 'PLAYER_CAREER_UPDATED', 'USER', req.params.userId, reason);
  res.json({ success: true });
});

// ── L. REPORT EVALUATION ─────────────────────────────────────────────────────
adminRouter.get('/reports', (_req, res) => {
  const reports = db
    .prepare(
      `
    SELECT
      cr.*, p.full_name as player_name, p.email as player_email, p.player_code,
      c.title as case_title, c.case_code,
      cs.master_solution, cs.responsible_character,
      re.score, re.decision, re.feedback, re.career_action, re.evaluated_at
    FROM case_reports cr
    JOIN profiles p ON p.id = cr.user_id
    JOIN cases c ON c.id = cr.case_id
    LEFT JOIN case_solutions cs ON cs.case_id = cr.case_id
    LEFT JOIN report_evaluations re ON re.report_id = cr.id
    ORDER BY cr.submitted_at DESC
  `
    )
    .all()
    .map((r: any) => ({
      ...r,
      evidence_references: JSON.parse(r.evidence_references_json || '[]'),
    }));

  res.json({ reports });
});

adminRouter.post('/reports/:reportId/evaluate', (req: AuthenticatedRequest, res) => {
  const report = db.prepare('SELECT * FROM case_reports WHERE id = ?').get(req.params.reportId) as any;
  if (!report) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }

  const score = Math.max(0, Math.min(100, Number(req.body?.score || 0)));
  const decision = req.body?.decision === 'REJECTED' ? 'REJECTED' : 'APPROVED';
  const feedback = String(req.body?.feedback || '').trim();
  const careerAction = String(req.body?.career_action || '').trim();

  db.prepare(`
    INSERT INTO report_evaluations (id, report_id, evaluated_by, score, decision, feedback, career_action)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(report_id) DO UPDATE SET
      evaluated_by = excluded.evaluated_by,
      score = excluded.score,
      decision = excluded.decision,
      feedback = excluded.feedback,
      career_action = excluded.career_action,
      evaluated_at = CURRENT_TIMESTAMP
  `).run(`evl_${crypto.randomUUID()}`, report.id, req.user!.id, score, decision, feedback, careerAction);

  db.prepare('UPDATE case_reports SET status = ? WHERE id = ?').run(decision, report.id);

  if (decision === 'APPROVED') {
    db.prepare("UPDATE case_progress SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND case_id = ?").run(
      report.user_id,
      report.case_id
    );
  } else {
    db.prepare("UPDATE case_progress SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND case_id = ?").run(
      report.user_id,
      report.case_id
    );
  }

  db.prepare(`
    INSERT INTO notifications (id, user_id, title, message)
    VALUES (?, ?, ?, ?)
  `).run(
    `ntf_${crypto.randomUUID()}`,
    report.user_id,
    `Report Evaluation: ${decision}`,
    `Your investigation report received a score of ${score}/100 (${decision}). ${feedback}`
  );

  writeAdminLog(
    req.user!.id,
    req.user!.email,
    'REPORT_EVALUATED',
    'REPORT',
    report.id,
    `Evaluated report (${decision}, score ${score}/100)`
  );

  res.json({ success: true });
});

// ── M. WEBSITE CONTENT, INSTITUTIONS, RANKS, REGIONS & SETTINGS ──────────────
adminRouter.put('/institutions/:id', (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  db.prepare(`
    UPDATE institutions SET
      name = ?, short_name = ?, tagline = ?, description = ?,
      responsibilities_json = ?, progression_notes = ?, logo_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    String(b.name || ''),
    String(b.short_name || ''),
    String(b.tagline || ''),
    String(b.description || ''),
    JSON.stringify(Array.isArray(b.responsibilities) ? b.responsibilities : []),
    String(b.progression_notes || ''),
    b.logo_url === '' ? null : b.logo_url ?? null,
    Number(req.params.id)
  );
  writeAdminLog(req.user!.id, req.user!.email, 'INSTITUTION_UPDATED', 'INSTITUTION', req.params.id, `Updated institution ${b.name}`);
  res.json({ success: true });
});

adminRouter.put('/ranks/:id', (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  db.prepare(`
    UPDATE ranks SET title = ?, min_cases_required = ?, min_score_required = ?, description = ?
    WHERE id = ?
  `).run(
    String(b.title || ''),
    Number(b.min_cases_required || 0),
    Number(b.min_score_required || 0),
    String(b.description || ''),
    Number(req.params.id)
  );
  writeAdminLog(req.user!.id, req.user!.email, 'RANK_UPDATED', 'RANK', req.params.id, `Updated rank ${b.title}`);
  res.json({ success: true });
});

adminRouter.put('/regions/:id', (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  db.prepare(`
    UPDATE regions SET headquarters_label = ?, description = ?, terrain_notes = ?, illustration_url = ?
    WHERE id = ?
  `).run(
    String(b.headquarters_label || ''),
    String(b.description || ''),
    String(b.terrain_notes || ''),
    b.illustration_url || null,
    Number(req.params.id)
  );
  writeAdminLog(req.user!.id, req.user!.email, 'REGION_UPDATED', 'REGION', req.params.id, `Updated region #${req.params.id}`);
  res.json({ success: true });
});

adminRouter.put('/content/:key', (req: AuthenticatedRequest, res) => {
  const b = req.body || {};
  db.prepare(`
    UPDATE site_content SET title = ?, body = ?, media_url = ?, is_visible = ?, extra_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE key = ?
  `).run(
    String(b.title || ''),
    String(b.body || ''),
    b.media_url === '' ? null : b.media_url ?? null,
    b.is_visible === false ? 0 : 1,
    b.extra_json || null,
    req.params.key
  );
  writeAdminLog(req.user!.id, req.user!.email, 'CONTENT_UPDATED', 'CONTENT', req.params.key, `Updated website section "${req.params.key}"`);
  res.json({ success: true });
});

adminRouter.put('/settings', (req: AuthenticatedRequest, res) => {
  const entries = Object.entries(req.body || {});
  const stmt = db.prepare(`
    INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  for (const [k, v] of entries) {
    stmt.run(k, String(v ?? ''));
  }
  writeAdminLog(req.user!.id, req.user!.email, 'SETTINGS_UPDATED', 'SETTINGS', 'global', 'Updated global site settings.');
  res.json({ success: true });
});

// ── O. AUDIT LOGS ────────────────────────────────────────────────────────────
adminRouter.get('/logs', (_req, res) => {
  const logs = db.prepare('SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT 200').all();
  res.json({ logs });
});
