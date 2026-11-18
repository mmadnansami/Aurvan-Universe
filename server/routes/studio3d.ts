import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { db, MODELS_UPLOADS_PATH, writeAdminLog } from '../db';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../auth';
import { validateModel3DPayload, validateUploadFile } from '../../src/shared/validation';
import {
  get3DProviderStatus,
  pollImageTo3DConversion,
  startImageTo3DConversion,
} from '../services/imageTo3d';
import type { Entity3DLinkType, PreferredViewMode } from '../../src/shared/types';

export const studio3dRouter = Router();

studio3dRouter.use(requireAuth);
studio3dRouter.use(requireRole(['ADMIN', 'SUPER_ADMIN']));

const modelStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, MODELS_UPLOADS_PATH);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload3dModel = multer({
  storage: modelStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

function applyEntityLink(
  entityType: Entity3DLinkType,
  entityId: string,
  modelId: string | null,
  preferredView: PreferredViewMode
): boolean {
  const safeView: PreferredViewMode = modelId && preferredView === '3D' ? '3D' : 'STANDARD';

  if (entityType === 'MEDIA') {
    const info = db
      .prepare('UPDATE media_assets SET model_3d_id = ?, preferred_view = ? WHERE id = ?')
      .run(modelId, safeView, entityId);
    return info.changes > 0;
  }
  if (entityType === 'DOCUMENT') {
    const info = db
      .prepare('UPDATE documents SET model_3d_id = ?, preferred_view = ? WHERE id = ?')
      .run(modelId, safeView, entityId);
    return info.changes > 0;
  }
  if (entityType === 'EVIDENCE') {
    const info = db
      .prepare('UPDATE case_evidence SET model_3d_id = ?, preferred_view = ? WHERE id = ?')
      .run(modelId, safeView, entityId);
    return info.changes > 0;
  }
  if (entityType === 'CHARACTER') {
    const info = db
      .prepare('UPDATE case_characters SET model_3d_id = ?, preferred_view = ? WHERE id = ?')
      .run(modelId, safeView, entityId);
    return info.changes > 0;
  }
  if (entityType === 'CASE_SCENE') {
    const info = db
      .prepare('UPDATE cases SET scene_3d_model_id = ?, scene_preferred_view = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(modelId, safeView, entityId);
    return info.changes > 0;
  }
  return false;
}

studio3dRouter.get('/provider-status', (_req, res) => {
  res.json({ providerStatus: get3DProviderStatus() });
});

studio3dRouter.get('/', (_req, res) => {
  const models = db.prepare('SELECT * FROM models_3d ORDER BY updated_at DESC').all();
  res.json({ models, providerStatus: get3DProviderStatus() });
});

studio3dRouter.post('/upload', upload3dModel.single('file'), (req: AuthenticatedRequest, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'A .GLB or .GLTF 3D model file is required.' });
    return;
  }

  const check = validateUploadFile('model3d', file.mimetype, file.size, file.originalname);
  if (!check.valid) {
    fs.unlinkSync(file.path);
    res.status(400).json({ error: check.errors[0] });
    return;
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const format: 'GLB' | 'GLTF' = ext === '.gltf' ? 'GLTF' : 'GLB';

  const bytes = new Uint8Array(fs.readFileSync(file.path));
  const payloadCheck = validateModel3DPayload(bytes, format);
  if (!payloadCheck.valid) {
    fs.unlinkSync(file.path);
    res.status(400).json({ error: payloadCheck.errors[0] });
    return;
  }

  const id = `m3d_${crypto.randomUUID()}`;
  const title = String(req.body?.title || file.originalname.replace(/\.[^/.]+$/, '')).trim();
  const sourceImageUrl = req.body?.source_image_url ? String(req.body.source_image_url) : null;
  const linkedEntityType = req.body?.linked_entity_type
    ? (String(req.body.linked_entity_type) as Entity3DLinkType)
    : null;
  const linkedEntityId = req.body?.linked_entity_id ? String(req.body.linked_entity_id) : null;
  const autoLink = req.body?.auto_link === 'true';
  const preferredView = (req.body?.preferred_view === '3D' ? '3D' : 'STANDARD') as PreferredViewMode;

  const url = `/uploads/public/models/${file.filename}`;
  const mimeType = format === 'GLTF' ? 'model/gltf+json' : 'model/gltf-binary';

  db.prepare(`
    INSERT INTO models_3d (
      id, title, file_name, format, mime_type, size_bytes, url, storage_path,
      source_type, source_image_url, linked_entity_type, linked_entity_id,
      provider, progress, status, error_message, uploaded_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UPLOAD', ?, ?, ?, 'manual', 100, 'READY', '', ?)
  `).run(
    id,
    title || 'Uploaded 3D Evidence',
    file.originalname,
    format,
    mimeType,
    file.size,
    url,
    file.path,
    sourceImageUrl,
    linkedEntityType,
    linkedEntityId,
    req.user!.id
  );

  if (autoLink && linkedEntityType && linkedEntityId) {
    applyEntityLink(linkedEntityType, linkedEntityId, id, preferredView);
  }

  writeAdminLog(
    req.user!.id,
    req.user!.email,
    'MODEL_3D_UPLOADED',
    'MODEL_3D',
    id,
    `Uploaded ${format} 3D model "${title}"`
  );

  res.status(201).json({
    model: db.prepare('SELECT * FROM models_3d WHERE id = ?').get(id),
  });
});

studio3dRouter.post('/generate', async (req: AuthenticatedRequest, res) => {
  const providerStatus = get3DProviderStatus();
  if (!providerStatus.configured) {
    res.status(503).json({
      configured: false,
      providerStatus,
      error: providerStatus.message,
    });
    return;
  }

  const sourceImageUrl = String(req.body?.source_image_url || '').trim();
  const title = String(req.body?.title || 'AI Converted 3D Asset').trim();
  const linkedEntityType = req.body?.linked_entity_type
    ? (String(req.body.linked_entity_type) as Entity3DLinkType)
    : null;
  const linkedEntityId = req.body?.linked_entity_id ? String(req.body.linked_entity_id) : null;

  if (!sourceImageUrl) {
    res.status(400).json({ error: 'A source image URL is required for 3D conversion.' });
    return;
  }

  const id = `m3d_${crypto.randomUUID()}`;
  try {
    const task = await startImageTo3DConversion(sourceImageUrl);
    const immediate = task.immediateModel;

    db.prepare(`
      INSERT INTO models_3d (
        id, title, file_name, format, mime_type, size_bytes, url, storage_path,
        source_type, source_image_url, linked_entity_type, linked_entity_id,
        provider, external_task_id, progress, status, error_message, uploaded_by
      ) VALUES (?, ?, ?, 'GLB', 'model/gltf-binary', ?, ?, ?, 'AI_CONVERSION', ?, ?, ?, ?, ?, ?, ?, '', ?)
    `).run(
      id,
      title,
      immediate?.fileName || `${id}.glb`,
      immediate?.sizeBytes || 0,
      immediate?.url || '',
      immediate?.storagePath || '',
      sourceImageUrl,
      linkedEntityType,
      linkedEntityId,
      task.provider,
      task.externalTaskId,
      task.initialStatus === 'READY' ? 100 : 10,
      task.initialStatus,
      req.user!.id
    );

    writeAdminLog(
      req.user!.id,
      req.user!.email,
      'MODEL_3D_GENERATION_STARTED',
      'MODEL_3D',
      id,
      `Started ${task.provider} image-to-3D conversion for "${title}"`
    );

    res.status(201).json({
      model: db.prepare('SELECT * FROM models_3d WHERE id = ?').get(id),
      providerStatus,
    });
  } catch (err: any) {
    const msg = err?.message || '3D conversion request failed.';
    db.prepare(`
      INSERT INTO models_3d (
        id, title, file_name, format, mime_type, size_bytes, url, storage_path,
        source_type, source_image_url, linked_entity_type, linked_entity_id,
        provider, progress, status, error_message, uploaded_by
      ) VALUES (?, ?, ?, 'GLB', 'model/gltf-binary', 0, '', '', 'AI_CONVERSION', ?, ?, ?, ?, 0, 'FAILED', ?, ?)
    `).run(
      id,
      title,
      `${id}.glb`,
      sourceImageUrl,
      linkedEntityType,
      linkedEntityId,
      providerStatus.provider || 'unconfigured',
      msg,
      req.user!.id
    );

    res.status(502).json({
      error: msg,
      model: db.prepare('SELECT * FROM models_3d WHERE id = ?').get(id),
      providerStatus,
    });
  }
});

studio3dRouter.get('/:id', async (req, res) => {
  const existing = db.prepare('SELECT * FROM models_3d WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ error: '3D model asset not found.' });
    return;
  }

  if (
    (existing.status === 'QUEUED' || existing.status === 'PROCESSING') &&
    existing.external_task_id
  ) {
    try {
      const polled = await pollImageTo3DConversion(existing.provider, existing.external_task_id);
      if (polled.status === 'READY' && polled.url && polled.storagePath) {
        db.prepare(`
          UPDATE models_3d
          SET status = 'READY', progress = 100, file_name = ?, storage_path = ?, url = ?, size_bytes = ?, error_message = '', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(polled.fileName, polled.storagePath, polled.url, polled.sizeBytes || 0, existing.id);
      } else if (polled.status === 'FAILED') {
        db.prepare(`
          UPDATE models_3d
          SET status = 'FAILED', progress = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(polled.progress, polled.errorMessage || 'Conversion failed.', existing.id);
      } else {
        db.prepare(`
          UPDATE models_3d
          SET status = ?, progress = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(polled.status, polled.progress, existing.id);
      }
    } catch (err: any) {
      db.prepare(`
        UPDATE models_3d
        SET status = 'FAILED', error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(err?.message || 'Status polling error.', existing.id);
    }
  }

  res.json({ model: db.prepare('SELECT * FROM models_3d WHERE id = ?').get(req.params.id) });
});

studio3dRouter.post('/link', (req: AuthenticatedRequest, res) => {
  const entityType = String(req.body?.entity_type || '') as Entity3DLinkType;
  const entityId = String(req.body?.entity_id || '').trim();
  const modelId = req.body?.model_3d_id ? String(req.body.model_3d_id).trim() : null;
  const preferredView = (req.body?.preferred_view === '3D' ? '3D' : 'STANDARD') as PreferredViewMode;

  if (!entityType || !entityId) {
    res.status(400).json({ error: 'Target entity_type and entity_id are required.' });
    return;
  }

  if (modelId) {
    const model = db.prepare('SELECT * FROM models_3d WHERE id = ?').get(modelId) as any;
    if (!model) {
      res.status(404).json({ error: 'Selected 3D model does not exist.' });
      return;
    }
    if (model.status !== 'READY' || !model.url) {
      res.status(400).json({ error: 'Cannot link an incomplete or failed 3D conversion. Fallback to Standard View.' });
      return;
    }
    db.prepare(
      'UPDATE models_3d SET linked_entity_type = ?, linked_entity_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(entityType, entityId, modelId);
  }

  const updated = applyEntityLink(entityType, entityId, modelId, preferredView);
  if (!updated) {
    res.status(404).json({ error: 'Target entity record not found.' });
    return;
  }

  writeAdminLog(
    req.user!.id,
    req.user!.email,
    modelId ? 'MODEL_3D_LINKED' : 'MODEL_3D_UNLINKED',
    entityType,
    entityId,
    modelId
      ? `Linked 3D model ${modelId} (default view: ${preferredView})`
      : 'Reverted to Standard View and unlinked 3D model'
  );

  res.json({ success: true, model_3d_id: modelId, preferred_view: modelId ? preferredView : 'STANDARD' });
});

studio3dRouter.delete('/:id', (req: AuthenticatedRequest, res) => {
  const existing = db.prepare('SELECT * FROM models_3d WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ error: '3D model not found.' });
    return;
  }

  if (existing.storage_path && fs.existsSync(existing.storage_path)) {
    fs.unlinkSync(existing.storage_path);
  }

  db.prepare("UPDATE media_assets SET model_3d_id = NULL, preferred_view = 'STANDARD' WHERE model_3d_id = ?").run(req.params.id);
  db.prepare("UPDATE documents SET model_3d_id = NULL, preferred_view = 'STANDARD' WHERE model_3d_id = ?").run(req.params.id);
  db.prepare("UPDATE case_evidence SET model_3d_id = NULL, preferred_view = 'STANDARD' WHERE model_3d_id = ?").run(req.params.id);
  db.prepare("UPDATE case_characters SET model_3d_id = NULL, preferred_view = 'STANDARD' WHERE model_3d_id = ?").run(req.params.id);
  db.prepare("UPDATE cases SET scene_3d_model_id = NULL, scene_preferred_view = 'STANDARD' WHERE scene_3d_model_id = ?").run(req.params.id);

  db.prepare('DELETE FROM models_3d WHERE id = ?').run(req.params.id);
  writeAdminLog(req.user!.id, req.user!.email, 'MODEL_3D_DELETED', 'MODEL_3D', req.params.id, `Deleted 3D model "${existing.title}"`);
  res.json({ success: true });
});
