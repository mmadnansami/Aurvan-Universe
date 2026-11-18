import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { db } from '../db';
import { requireAuth, type AuthenticatedRequest } from '../auth';
import { isPlayerEligibleForCase } from '../../src/shared/validation';

export const playerRouter = Router();

playerRouter.use(requireAuth);

function loadCaseForPlayer(caseId: string, user: NonNullable<AuthenticatedRequest['user']>) {
  const caseRow = db
    .prepare(
      `
    SELECT
      c.*, i.code as institution_code, i.name as institution_name,
      reg.name as region_name, reg.headquarters_label,
      sm.url as scene_3d_url, sm.format as scene_3d_format
    FROM cases c
    JOIN institutions i ON i.id = c.institution_id
    JOIN regions reg ON reg.id = c.region_id
    LEFT JOIN models_3d sm ON sm.id = c.scene_3d_model_id AND sm.status = 'READY'
    WHERE c.id = ?
  `
    )
    .get(caseId) as any;

  if (!caseRow) {
    return { error: 'Investigation dossier not found.', status: 404 as const };
  }

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  if (!isAdmin && caseRow.status !== 'PUBLISHED') {
    return { error: 'This dossier is not published.', status: 403 as const };
  }

  if (!isAdmin) {
    const eligibility = isPlayerEligibleForCase(
      user.institution_code,
      user.rank_order,
      caseRow.institution_code,
      caseRow.min_rank_order
    );
    if (!eligibility.eligible) {
      return { error: eligibility.reason || 'Insufficient institutional clearance.', status: 403 as const };
    }
  }

  return { caseRow, status: 200 as const };
}

playerRouter.get('/dashboard', (req: AuthenticatedRequest, res) => {
  const user = req.user!;

  const publishedCases = db
    .prepare(
      `
    SELECT
      c.id, c.case_code, c.title, c.slug, c.short_description,
      c.institution_id, i.code as institution_code, i.name as institution_name,
      c.region_id, reg.name as region_name,
      c.difficulty, c.estimated_duration, c.status,
      c.cover_image_url, c.thumbnail_url, c.min_rank_order, c.published_at
    FROM cases c
    JOIN institutions i ON i.id = c.institution_id
    JOIN regions reg ON reg.id = c.region_id
    WHERE c.status = 'PUBLISHED'
    ORDER BY c.published_at DESC
  `
    )
    .all()
    .map((c: any) => {
      const eligibility = isPlayerEligibleForCase(
        user.institution_code,
        user.rank_order,
        c.institution_code,
        c.min_rank_order
      );
      return {
        ...c,
        eligible: user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? true : eligibility.eligible,
        eligibility_reason: eligibility.reason || null,
      };
    });

  const activeProgress = db
    .prepare(
      `
    SELECT cp.*, c.title, c.case_code, c.difficulty, i.name as institution_name, reg.name as region_name
    FROM case_progress cp
    JOIN cases c ON c.id = cp.case_id
    JOIN institutions i ON i.id = c.institution_id
    JOIN regions reg ON reg.id = c.region_id
    WHERE cp.user_id = ? AND c.status = 'PUBLISHED'
    ORDER BY cp.updated_at DESC
  `
    )
    .all(user.id);

  const reports = db
    .prepare(
      `
    SELECT
      cr.*, c.title as case_title, c.case_code,
      re.score, re.decision, re.feedback, re.career_action, re.evaluated_at
    FROM case_reports cr
    JOIN cases c ON c.id = cr.case_id
    LEFT JOIN report_evaluations re ON re.report_id = cr.id
    WHERE cr.user_id = ?
    ORDER BY cr.submitted_at DESC
  `
    )
    .all(user.id);

  const notifications = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(user.id)
    .map((n: any) => ({ ...n, is_read: Boolean(n.is_read) }));

  const careerHistory = db
    .prepare(
      `
    SELECT
      ch.*,
      fi.name as from_institution_name, ti.name as to_institution_name,
      fr.title as from_rank_title, tr.title as to_rank_title
    FROM career_history ch
    LEFT JOIN institutions fi ON fi.id = ch.from_institution_id
    LEFT JOIN institutions ti ON ti.id = ch.to_institution_id
    LEFT JOIN ranks fr ON fr.id = ch.from_rank_id
    LEFT JOIN ranks tr ON tr.id = ch.to_rank_id
    WHERE ch.user_id = ?
    ORDER BY ch.created_at DESC
  `
    )
    .all(user.id);

  const institutionRanks = db
    .prepare('SELECT * FROM ranks WHERE institution_id = ? ORDER BY level_order ASC')
    .all(user.institution_id);

  const approvedCount = reports.filter((r: any) => r.decision === 'APPROVED').length;
  const scores = reports.filter((r: any) => typeof r.score === 'number').map((r: any) => r.score as number);
  const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  res.json({
    availableCases: publishedCases,
    activeProgress,
    reports,
    notifications,
    careerHistory,
    institutionRanks,
    stats: {
      activeCount: activeProgress.filter((p: any) => p.status === 'IN_PROGRESS').length,
      submittedReportsCount: reports.length,
      approvedCount,
      averageScore,
    },
  });
});

playerRouter.patch('/profile', (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const fullName = String(req.body?.full_name || '').trim();
  const bio = String(req.body?.bio || '').trim();

  if (fullName.length < 2) {
    res.status(400).json({ error: 'Display name must be at least 2 characters.' });
    return;
  }

  db.prepare('UPDATE profiles SET full_name = ?, bio = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    fullName,
    bio.slice(0, 600),
    user.id
  );

  res.json({ success: true });
});

playerRouter.post('/notifications/read', (req: AuthenticatedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ success: true });
});

playerRouter.post('/cases/:caseId/start', (req: AuthenticatedRequest, res) => {
  const check = loadCaseForPlayer(req.params.caseId, req.user!);
  if ('error' in check) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const existing = db
    .prepare('SELECT id FROM case_progress WHERE user_id = ? AND case_id = ?')
    .get(req.user!.id, req.params.caseId);

  if (!existing) {
    db.prepare(`
      INSERT INTO case_progress (id, user_id, case_id, status, current_chapter, unlocked_hints_json, asked_questions_json)
      VALUES (?, ?, ?, 'IN_PROGRESS', 1, '[]', '[]')
    `).run(`prg_${crypto.randomUUID()}`, req.user!.id, req.params.caseId);
  }

  res.json({ success: true });
});

playerRouter.get('/cases/:caseId/room', (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const check = loadCaseForPlayer(req.params.caseId, user);
  if ('error' in check) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const { caseRow } = check;
  const caseId = req.params.caseId;

  // Ensure progress record exists
  let progress = db
    .prepare('SELECT * FROM case_progress WHERE user_id = ? AND case_id = ?')
    .get(user.id, caseId) as any;

  if (!progress) {
    const progressId = `prg_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO case_progress (id, user_id, case_id, status, current_chapter, unlocked_hints_json, asked_questions_json)
      VALUES (?, ?, ?, 'IN_PROGRESS', 1, '[]', '[]')
    `).run(progressId, user.id, caseId);
    progress = db.prepare('SELECT * FROM case_progress WHERE id = ?').get(progressId);
  }

  const unlockedHintIds: string[] = JSON.parse(progress.unlocked_hints_json || '[]');
  const askedQuestionIds: string[] = JSON.parse(progress.asked_questions_json || '[]');

  const chapters = db
    .prepare('SELECT id, case_id, chapter_number, title, briefing_text, unlock_condition FROM case_chapters WHERE case_id = ? ORDER BY chapter_number ASC')
    .all(caseId);

  // Strictly omit private_explanation from player-facing evidence payload!
  const evidence = db
    .prepare(
      `
    SELECT
      ce.id, ce.case_id, ce.evidence_code, ce.title, ce.evidence_type, ce.description,
      ce.image_url, ce.document_id, ce.audio_id, ce.model_3d_id, ce.preferred_view,
      ce.chapter_number, ce.access_condition,
      ce.related_characters_json, ce.related_evidence_json, ce.sort_order, ce.is_visible,
      d.title as document_title, d.mime_type as document_mime, d.file_name as document_file_name,
      d.is_confidential as document_confidential, d.preferred_view as doc_preferred_view,
      dm.url as doc_model_3d_url, dm.format as doc_model_3d_format,
      a.title as audio_title, a.url as audio_url, a.transcript as audio_transcript, a.description as audio_description,
      em.url as model_3d_url, em.format as model_3d_format
    FROM case_evidence ce
    LEFT JOIN documents d ON d.id = ce.document_id
    LEFT JOIN models_3d dm ON dm.id = d.model_3d_id AND dm.status = 'READY'
    LEFT JOIN audio_assets a ON a.id = ce.audio_id
    LEFT JOIN models_3d em ON em.id = ce.model_3d_id AND em.status = 'READY'
    WHERE ce.case_id = ? AND ce.is_visible = 1
    ORDER BY ce.chapter_number ASC, ce.sort_order ASC
  `
    )
    .all(caseId)
    .map((ev: any) => ({
      id: ev.id,
      case_id: ev.case_id,
      evidence_code: ev.evidence_code,
      title: ev.title,
      evidence_type: ev.evidence_type,
      description: ev.description,
      image_url: ev.image_url,
      document_id: ev.document_confidential ? null : ev.document_id,
      document_title: ev.document_confidential ? null : ev.document_title,
      document_mime: ev.document_confidential ? null : ev.document_mime,
      doc_model_3d_url: ev.document_confidential ? null : ev.doc_model_3d_url || null,
      doc_model_3d_format: ev.document_confidential ? null : ev.doc_model_3d_format || null,
      doc_preferred_view: ev.document_confidential ? 'STANDARD' : ev.doc_preferred_view || 'STANDARD',
      audio_id: ev.audio_id,
      audio_title: ev.audio_title,
      audio_url: ev.audio_url,
      audio_transcript: ev.audio_transcript,
      model_3d_id: ev.model_3d_id || null,
      model_3d_url: ev.model_3d_url || null,
      model_3d_format: ev.model_3d_format || null,
      preferred_view: ev.model_3d_url && ev.preferred_view === '3D' ? '3D' : 'STANDARD',
      chapter_number: ev.chapter_number,
      access_condition: ev.access_condition,
      related_characters: JSON.parse(ev.related_characters_json || '[]'),
      related_evidence: JSON.parse(ev.related_evidence_json || '[]'),
      sort_order: ev.sort_order,
    }));

  // Strictly omit private_info and non-public characters!
  const characters = db
    .prepare(
      `
    SELECT ch.id, ch.case_id, ch.name, ch.role, ch.portrait_url, ch.description, ch.background,
      ch.relationships_json, ch.model_3d_id, ch.preferred_view,
      cm.url as model_3d_url, cm.format as model_3d_format
    FROM case_characters ch
    LEFT JOIN models_3d cm ON cm.id = ch.model_3d_id AND cm.status = 'READY'
    WHERE ch.case_id = ? AND ch.is_public = 1
    ORDER BY ch.rowid ASC
  `
    )
    .all(caseId)
    .map((ch: any) => ({
      ...ch,
      model_3d_url: ch.model_3d_url || null,
      model_3d_format: ch.model_3d_format || null,
      preferred_view: ch.model_3d_url && ch.preferred_view === '3D' ? '3D' : 'STANDARD',
      relationships: JSON.parse(ch.relationships_json || '[]'),
    }));

  const witnesses = db
    .prepare('SELECT id, case_id, name, role, portrait_url, statement_text, chapter_number FROM case_witnesses WHERE case_id = ? ORDER BY chapter_number ASC, rowid ASC')
    .all(caseId);

  // Only send question text and revealed responses for already-asked questions; never send hidden_evaluation_rule!
  const questions = db
    .prepare(
      `
    SELECT id, case_id, witness_id, question_text, response_text, follow_up_hint, sort_order
    FROM interrogation_questions
    WHERE case_id = ?
    ORDER BY sort_order ASC
  `
    )
    .all(caseId)
    .map((q: any) => {
      const asked = askedQuestionIds.includes(q.id);
      return {
        id: q.id,
        case_id: q.case_id,
        witness_id: q.witness_id,
        question_text: q.question_text,
        asked,
        response_text: asked ? q.response_text : null,
        follow_up_hint: asked ? q.follow_up_hint : null,
        sort_order: q.sort_order,
      };
    });

  // Hints: only reveal hint_text if unlocked by this player
  const hints = db
    .prepare(
      `
    SELECT id, case_id, chapter_number, hint_order, hint_text, unlock_condition
    FROM case_hints
    WHERE case_id = ? AND is_enabled = 1
    ORDER BY chapter_number ASC, hint_order ASC
  `
    )
    .all(caseId)
    .map((h: any) => {
      const unlocked = unlockedHintIds.includes(h.id);
      return {
        id: h.id,
        case_id: h.case_id,
        chapter_number: h.chapter_number,
        hint_order: h.hint_order,
        unlock_condition: h.unlock_condition,
        unlocked,
        hint_text: unlocked ? h.hint_text : null,
      };
    });

  const noteRow = db
    .prepare('SELECT content, updated_at FROM player_notes WHERE user_id = ? AND case_id = ?')
    .get(user.id, caseId) as { content: string; updated_at: string } | undefined;

  const timeline = db
    .prepare('SELECT * FROM investigation_timeline WHERE user_id = ? AND case_id = ? ORDER BY sort_order ASC, rowid ASC')
    .all(user.id, caseId);

  const connections = db
    .prepare('SELECT * FROM evidence_connections WHERE user_id = ? AND case_id = ? ORDER BY created_at ASC')
    .all(user.id, caseId);

  const reports = db
    .prepare(
      `
    SELECT cr.*, re.score, re.decision, re.feedback, re.career_action, re.evaluated_at
    FROM case_reports cr
    LEFT JOIN report_evaluations re ON re.report_id = cr.id
    WHERE cr.user_id = ? AND cr.case_id = ?
    ORDER BY cr.submitted_at DESC
  `
    )
    .all(user.id, caseId)
    .map((r: any) => ({
      ...r,
      evidence_references: JSON.parse(r.evidence_references_json || '[]'),
    }));

  // Notice: case_solutions is NEVER queried or attached here!
  res.json({
    dossier: {
      id: caseRow.id,
      case_code: caseRow.case_code,
      title: caseRow.title,
      short_description: caseRow.short_description,
      full_story: caseRow.full_story,
      institution_name: caseRow.institution_name,
      institution_code: caseRow.institution_code,
      region_name: caseRow.region_name,
      headquarters_label: caseRow.headquarters_label,
      difficulty: caseRow.difficulty,
      estimated_duration: caseRow.estimated_duration,
      cover_image_url: caseRow.cover_image_url,
      scene_3d_model_id: caseRow.scene_3d_model_id || null,
      scene_3d_url: caseRow.scene_3d_url || null,
      scene_3d_format: caseRow.scene_3d_format || null,
      scene_preferred_view: caseRow.scene_3d_url && caseRow.scene_preferred_view === '3D' ? '3D' : 'STANDARD',
      gallery: JSON.parse(caseRow.gallery_json || '[]'),
      player_tasks: JSON.parse(caseRow.player_tasks_json || '[]'),
      evaluation_criteria: JSON.parse(caseRow.evaluation_criteria_json || '[]'),
      status: caseRow.status,
    },
    progress: {
      status: progress.status,
      current_chapter: progress.current_chapter,
    },
    chapters,
    evidence,
    characters,
    witnesses,
    questions,
    hints,
    note: noteRow?.content || '',
    noteUpdatedAt: noteRow?.updated_at || null,
    timeline,
    connections,
    reports,
  });
});

playerRouter.put('/cases/:caseId/notes', (req: AuthenticatedRequest, res) => {
  const check = loadCaseForPlayer(req.params.caseId, req.user!);
  if ('error' in check) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const content = String(req.body?.content || '');
  const existing = db
    .prepare('SELECT id FROM player_notes WHERE user_id = ? AND case_id = ?')
    .get(req.user!.id, req.params.caseId) as { id: string } | undefined;

  if (existing) {
    db.prepare('UPDATE player_notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      content,
      existing.id
    );
  } else {
    db.prepare('INSERT INTO player_notes (id, user_id, case_id, content) VALUES (?, ?, ?, ?)').run(
      `nte_${crypto.randomUUID()}`,
      req.user!.id,
      req.params.caseId,
      content
    );
  }

  res.json({ success: true, updated_at: new Date().toISOString() });
});

playerRouter.post('/cases/:caseId/timeline', (req: AuthenticatedRequest, res) => {
  const check = loadCaseForPlayer(req.params.caseId, req.user!);
  if ('error' in check) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const eventTime = String(req.body?.event_time || '').trim();
  const eventTitle = String(req.body?.event_title || '').trim();
  const eventNotes = String(req.body?.event_notes || '').trim();

  if (!eventTime || !eventTitle) {
    res.status(400).json({ error: 'Time marker and event title are required.' });
    return;
  }

  const maxSort = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM investigation_timeline WHERE user_id = ? AND case_id = ?')
    .get(req.user!.id, req.params.caseId) as { m: number };

  const id = `tml_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO investigation_timeline (id, user_id, case_id, event_time, event_title, event_notes, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user!.id, req.params.caseId, eventTime, eventTitle, eventNotes, maxSort.m + 1);

  const item = db.prepare('SELECT * FROM investigation_timeline WHERE id = ?').get(id);
  res.status(201).json({ item });
});

playerRouter.delete('/cases/:caseId/timeline/:itemId', (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM investigation_timeline WHERE id = ? AND user_id = ? AND case_id = ?').run(
    req.params.itemId,
    req.user!.id,
    req.params.caseId
  );
  res.json({ success: true });
});

playerRouter.post('/cases/:caseId/connections', (req: AuthenticatedRequest, res) => {
  const check = loadCaseForPlayer(req.params.caseId, req.user!);
  if ('error' in check) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const sourceId = String(req.body?.source_evidence_id || '');
  const targetId = String(req.body?.target_evidence_id || '');
  const note = String(req.body?.connection_note || '').trim();

  if (!sourceId || !targetId || sourceId === targetId) {
    res.status(400).json({ error: 'Select two distinct evidence items to connect.' });
    return;
  }

  const id = `con_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO evidence_connections (id, user_id, case_id, source_evidence_id, target_evidence_id, connection_note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.user!.id, req.params.caseId, sourceId, targetId, note);

  const connection = db.prepare('SELECT * FROM evidence_connections WHERE id = ?').get(id);
  res.status(201).json({ connection });
});

playerRouter.delete('/cases/:caseId/connections/:connId', (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM evidence_connections WHERE id = ? AND user_id = ? AND case_id = ?').run(
    req.params.connId,
    req.user!.id,
    req.params.caseId
  );
  res.json({ success: true });
});

playerRouter.post('/cases/:caseId/hints/:hintId/unlock', (req: AuthenticatedRequest, res) => {
  const check = loadCaseForPlayer(req.params.caseId, req.user!);
  if ('error' in check) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const hint = db
    .prepare('SELECT id, hint_text FROM case_hints WHERE id = ? AND case_id = ? AND is_enabled = 1')
    .get(req.params.hintId, req.params.caseId) as { id: string; hint_text: string } | undefined;

  if (!hint) {
    res.status(404).json({ error: 'Hint not found.' });
    return;
  }

  const prog = db
    .prepare('SELECT id, unlocked_hints_json FROM case_progress WHERE user_id = ? AND case_id = ?')
    .get(req.user!.id, req.params.caseId) as { id: string; unlocked_hints_json: string } | undefined;

  if (prog) {
    const arr: string[] = JSON.parse(prog.unlocked_hints_json || '[]');
    if (!arr.includes(hint.id)) {
      arr.push(hint.id);
      db.prepare('UPDATE case_progress SET unlocked_hints_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        JSON.stringify(arr),
        prog.id
      );
    }
  }

  res.json({ hint_text: hint.hint_text });
});

playerRouter.post('/cases/:caseId/interrogations/:questionId/ask', (req: AuthenticatedRequest, res) => {
  const check = loadCaseForPlayer(req.params.caseId, req.user!);
  if ('error' in check) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const q = db
    .prepare('SELECT id, response_text, follow_up_hint FROM interrogation_questions WHERE id = ? AND case_id = ?')
    .get(req.params.questionId, req.params.caseId) as
    | { id: string; response_text: string; follow_up_hint: string }
    | undefined;

  if (!q) {
    res.status(404).json({ error: 'Interrogation question not found.' });
    return;
  }

  const prog = db
    .prepare('SELECT id, asked_questions_json FROM case_progress WHERE user_id = ? AND case_id = ?')
    .get(req.user!.id, req.params.caseId) as { id: string; asked_questions_json: string } | undefined;

  if (prog) {
    const arr: string[] = JSON.parse(prog.asked_questions_json || '[]');
    if (!arr.includes(q.id)) {
      arr.push(q.id);
      db.prepare('UPDATE case_progress SET asked_questions_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        JSON.stringify(arr),
        prog.id
      );
    }
  }

  res.json({
    id: q.id,
    response_text: q.response_text,
    follow_up_hint: q.follow_up_hint,
  });
});

playerRouter.post('/cases/:caseId/report', (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const check = loadCaseForPlayer(req.params.caseId, user);
  if ('error' in check) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const suspectIdentified = String(req.body?.suspect_identified || '').trim();
  const reasoningText = String(req.body?.reasoning_text || '').trim();
  const evidenceRefs = Array.isArray(req.body?.evidence_references) ? req.body.evidence_references : [];
  const timelineSummary = String(req.body?.timeline_summary || '').trim();

  if (suspectIdentified.length < 2 || reasoningText.length < 20) {
    res.status(400).json({ error: 'Provide the identified subject and thorough analytical reasoning (minimum 20 characters).' });
    return;
  }

  const reportId = `rep_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO case_reports (id, user_id, case_id, suspect_identified, reasoning_text, evidence_references_json, timeline_summary, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'SUBMITTED')
  `).run(reportId, user.id, req.params.caseId, suspectIdentified, reasoningText, JSON.stringify(evidenceRefs), timelineSummary);

  db.prepare("UPDATE case_progress SET status = 'SUBMITTED', updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND case_id = ?").run(
    user.id,
    req.params.caseId
  );

  db.prepare(`
    INSERT INTO notifications (id, user_id, title, message)
    VALUES (?, ?, ?, ?)
  `).run(
    `ntf_${crypto.randomUUID()}`,
    user.id,
    'Investigation Report Filed',
    `Your final report for ${check.caseRow.case_code} (${check.caseRow.title}) has been submitted for Directorate evaluation.`
  );

  const report = db.prepare('SELECT * FROM case_reports WHERE id = ?').get(reportId);
  res.status(201).json({ report });
});

playerRouter.get('/documents/:docId/file', (req: AuthenticatedRequest, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.docId) as any;
  if (!doc) {
    res.status(404).json({ error: 'Document not found.' });
    return;
  }

  const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPER_ADMIN';
  if (doc.is_confidential && !isAdmin) {
    res.status(403).json({ error: 'Confidential Directorate documents cannot be accessed by players.' });
    return;
  }

  if (doc.case_id && !isAdmin) {
    const check = loadCaseForPlayer(doc.case_id, req.user!);
    if ('error' in check) {
      res.status(check.status).json({ error: check.error });
      return;
    }
  }

  const absPath = path.resolve(doc.storage_path);
  if (!fs.existsSync(absPath)) {
    res.status(404).json({ error: 'Document file missing on server.' });
    return;
  }

  if (doc.mime_type === 'text/plain') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  } else {
    res.setHeader('Content-Type', doc.mime_type);
  }
  res.sendFile(absPath);
});
