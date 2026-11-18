import { Router } from 'express';
import { db } from '../db';

export const publicRouter = Router();

publicRouter.get('/bootstrap', (_req, res) => {
  const settingsRows = db.prepare('SELECT key, value FROM site_settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));

  const contentRows = db
    .prepare('SELECT key, section_group, title, body, media_url, is_visible, extra_json FROM site_content')
    .all() as Array<{
    key: string;
    section_group: string;
    title: string;
    body: string;
    media_url: string | null;
    is_visible: number;
    extra_json: string | null;
  }>;

  const content = Object.fromEntries(
    contentRows.map((r) => [
      r.key,
      {
        ...r,
        is_visible: Boolean(r.is_visible),
      },
    ])
  );

  const institutions = (
    db
      .prepare('SELECT * FROM institutions ORDER BY sort_order ASC')
      .all() as Array<{
      id: number;
      code: string;
      name: string;
      short_name: string;
      tagline: string;
      description: string;
      responsibilities_json: string;
      progression_notes: string;
      logo_url: string | null;
      sort_order: number;
    }>
  ).map((inst) => ({
    id: inst.id,
    code: inst.code,
    name: inst.name,
    short_name: inst.short_name,
    tagline: inst.tagline,
    description: inst.description,
    responsibilities: JSON.parse(inst.responsibilities_json || '[]'),
    progression_notes: inst.progression_notes,
    logo_url: inst.logo_url,
    sort_order: inst.sort_order,
  }));

  const ranks = db
    .prepare(
      `
    SELECT r.*, i.code as institution_code, i.name as institution_name
    FROM ranks r
    JOIN institutions i ON i.id = r.institution_id
    ORDER BY i.sort_order ASC, r.level_order ASC
  `
    )
    .all();

  const regions = db
    .prepare(
      `
    SELECT reg.*,
      (SELECT COUNT(*) FROM cases c WHERE c.region_id = reg.id AND c.status = 'PUBLISHED') as published_case_count
    FROM regions reg
    ORDER BY reg.id ASC
  `
    )
    .all()
    .map((r: any) => ({ ...r, is_active: Boolean(r.is_active) }));

  res.json({
    settings,
    content,
    institutions,
    ranks,
    regions,
  });
});

publicRouter.get('/cases', (req, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const regionId = req.query.regionId ? Number(req.query.regionId) : null;
  const institutionId = req.query.institutionId ? Number(req.query.institutionId) : null;
  const difficulty = String(req.query.difficulty || '').trim();

  let query = `
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
  `;
  const params: any[] = [];

  if (search) {
    query += ' AND (lower(c.title) LIKE ? OR lower(c.case_code) LIKE ? OR lower(c.short_description) LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (regionId) {
    query += ' AND c.region_id = ?';
    params.push(regionId);
  }
  if (institutionId) {
    query += ' AND c.institution_id = ?';
    params.push(institutionId);
  }
  if (difficulty) {
    query += ' AND c.difficulty = ?';
    params.push(difficulty);
  }

  query += ' ORDER BY c.published_at DESC, c.created_at DESC';

  const cases = db.prepare(query).all(...params);
  res.json({ cases });
});

publicRouter.get('/hall-of-fame', (_req, res) => {
  // Strictly genuine database records only — zero fake leaderboard rows
  const entries = db
    .prepare(
      `
    SELECT
      p.id as user_id,
      p.full_name,
      p.player_code,
      i.name as institution_name,
      r.title as rank_title,
      COUNT(re.id) as approved_cases,
      ROUND(AVG(re.score), 1) as average_score,
      MAX(re.evaluated_at) as latest_commendation_at
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id
    JOIN institutions i ON i.id = p.institution_id
    JOIN ranks r ON r.id = p.rank_id
    JOIN case_reports cr ON cr.user_id = p.id AND cr.status = 'APPROVED'
    JOIN report_evaluations re ON re.report_id = cr.id AND re.decision = 'APPROVED'
    WHERE p.status = 'ACTIVE' AND ur.role = 'PLAYER'
    GROUP BY p.id
    ORDER BY approved_cases DESC, average_score DESC
    LIMIT 50
  `
    )
    .all();

  res.json({ entries });
});
