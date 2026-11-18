import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MODELS_UPLOADS_PATH } from '../db';
import { validateModel3DPayload } from '../../src/shared/validation';
import type { Studio3DProviderStatus } from '../../src/shared/types';

export interface Start3DTaskResult {
  provider: 'meshy' | 'tripo' | 'custom';
  externalTaskId: string;
  initialStatus: 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
  immediateModel?: {
    fileName: string;
    storagePath: string;
    url: string;
    sizeBytes: number;
  };
  errorMessage?: string;
}

export interface Poll3DTaskResult {
  status: 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
  progress: number;
  fileName?: string;
  storagePath?: string;
  url?: string;
  sizeBytes?: number;
  errorMessage?: string;
}

export function get3DProviderStatus(): Studio3DProviderStatus {
  const meshyKey = (process.env.MESHY_API_KEY || '').trim();
  const tripoKey = (process.env.TRIPO_API_KEY || '').trim();
  const customUrl = (process.env.IMAGE_TO_3D_API_URL || '').trim();
  const customKey = (process.env.IMAGE_TO_3D_API_KEY || '').trim();

  if (meshyKey) {
    return {
      configured: true,
      provider: 'meshy',
      providerLabel: 'Meshy AI Image-to-3D',
      message: 'Meshy AI Image-to-3D conversion service is configured and ready.',
    };
  }
  if (tripoKey) {
    return {
      configured: true,
      provider: 'tripo',
      providerLabel: 'Tripo3D AI Conversion',
      message: 'Tripo3D Image-to-3D conversion service is configured and ready.',
    };
  }
  if (customUrl && customKey) {
    return {
      configured: true,
      provider: 'custom',
      providerLabel: 'Configured Image-to-3D Endpoint',
      message: 'Custom Image-to-3D API endpoint is configured and ready.',
    };
  }

  return {
    configured: false,
    provider: null,
    providerLabel: 'Not Configured',
    message:
      'AI Image-to-3D conversion is unavailable because no 3D generation API key (MESHY_API_KEY, TRIPO_API_KEY, or IMAGE_TO_3D_API_URL + IMAGE_TO_3D_API_KEY) is configured on the server. Standard View and manual GLB/GLTF 3D model upload remain fully functional.',
  };
}

function resolveLocalImageDataUri(imageUrl: string): { buffer: Buffer; mimeType: string; dataUri: string } {
  const cleanUrl = imageUrl.split('?')[0];
  let diskPath = '';

  if (cleanUrl.startsWith('/uploads/public/')) {
    const rel = cleanUrl.replace(/^\/uploads\/public\//, '');
    diskPath = path.resolve(process.cwd(), 'uploads', 'public', rel);
  } else if (cleanUrl.startsWith('/assets/')) {
    const rel = cleanUrl.replace(/^\/assets\//, '');
    diskPath = path.resolve(process.cwd(), 'public', 'assets', rel);
  } else if (cleanUrl.startsWith('/src/assets/')) {
    const rel = cleanUrl.replace(/^\/src\/assets\//, '');
    diskPath = path.resolve(process.cwd(), 'src', 'assets', rel);
  }

  if (!diskPath || !fs.existsSync(diskPath)) {
    throw new Error('Source image file could not be read from local server storage for 3D conversion.');
  }

  const ext = path.extname(diskPath).toLowerCase();
  const mimeType =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const buffer = fs.readFileSync(diskPath);
  const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;
  return { buffer, mimeType, dataUri };
}

async function downloadAndValidateGlb(
  downloadUrl: string,
  headers?: Record<string, string>
): Promise<{ fileName: string; storagePath: string; url: string; sizeBytes: number }> {
  const res = await fetch(downloadUrl, { headers });
  if (!res.ok) {
    throw new Error(`Failed to download generated 3D model (HTTP ${res.status}).`);
  }
  const arrayBuf = await res.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  const validation = validateModel3DPayload(bytes, 'GLB');
  if (!validation.valid) {
    throw new Error(validation.errors[0] || 'Downloaded file is not a valid GLB 3D asset.');
  }

  const fileName = `ai3d-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.glb`;
  const storagePath = path.join(MODELS_UPLOADS_PATH, fileName);
  fs.writeFileSync(storagePath, Buffer.from(bytes));

  return {
    fileName,
    storagePath,
    url: `/uploads/public/models/${fileName}`,
    sizeBytes: bytes.byteLength,
  };
}

export async function startImageTo3DConversion(sourceImageUrl: string): Promise<Start3DTaskResult> {
  const providerStatus = get3DProviderStatus();
  if (!providerStatus.configured || !providerStatus.provider) {
    throw new Error(providerStatus.message);
  }

  const { buffer, mimeType, dataUri } = resolveLocalImageDataUri(sourceImageUrl);

  if (providerStatus.provider === 'meshy') {
    const apiKey = process.env.MESHY_API_KEY!.trim();
    const res = await fetch('https://api.meshy.ai/openapi/v1/image-to-3d', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: dataUri,
        enable_pbr: true,
        should_remesh: true,
        should_texture: true,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || !data.result) {
      throw new Error(data.message || `Meshy Image-to-3D API rejected request (HTTP ${res.status}).`);
    }

    return {
      provider: 'meshy',
      externalTaskId: String(data.result),
      initialStatus: 'QUEUED',
    };
  }

  if (providerStatus.provider === 'tripo') {
    const apiKey = process.env.TRIPO_API_KEY!.trim();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), 'source-evidence.png');

    const upRes = await fetch('https://api.tripo3d.ai/v2/openapi/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const upJson = (await upRes.json().catch(() => ({}))) as any;
    const imageToken = upJson?.data?.image_token;
    if (!upRes.ok || !imageToken) {
      throw new Error(upJson?.message || `Tripo3D upload failed (HTTP ${upRes.status}).`);
    }

    const taskRes = await fetch('https://api.tripo3d.ai/v2/openapi/task', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'image_to_model',
        file: {
          type: mimeType === 'image/png' ? 'png' : 'jpg',
          file_token: imageToken,
        },
        texture: true,
        pbr: true,
      }),
    });
    const taskJson = (await taskRes.json().catch(() => ({}))) as any;
    const taskId = taskJson?.data?.task_id;
    if (!taskRes.ok || !taskId) {
      throw new Error(taskJson?.message || `Tripo3D task creation failed (HTTP ${taskRes.status}).`);
    }

    return {
      provider: 'tripo',
      externalTaskId: String(taskId),
      initialStatus: 'QUEUED',
    };
  }

  // Custom Image-to-3D endpoint
  const customUrl = process.env.IMAGE_TO_3D_API_URL!.trim();
  const customKey = process.env.IMAGE_TO_3D_API_KEY!.trim();
  const res = await fetch(customUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${customKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_base64: buffer.toString('base64'),
      mime_type: mimeType,
      format: 'glb',
      enable_pbr: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `Custom Image-to-3D API returned HTTP ${res.status}.`);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('model/gltf-binary') || contentType.includes('application/octet-stream')) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    const check = validateModel3DPayload(bytes, 'GLB');
    if (!check.valid) {
      throw new Error(check.errors[0]);
    }
    const fileName = `ai3d-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.glb`;
    const storagePath = path.join(MODELS_UPLOADS_PATH, fileName);
    fs.writeFileSync(storagePath, Buffer.from(bytes));
    return {
      provider: 'custom',
      externalTaskId: `sync-${Date.now()}`,
      initialStatus: 'READY',
      immediateModel: {
        fileName,
        storagePath,
        url: `/uploads/public/models/${fileName}`,
        sizeBytes: bytes.byteLength,
      },
    };
  }

  const json = (await res.json().catch(() => ({}))) as any;
  if (json.glb_url) {
    const downloaded = await downloadAndValidateGlb(json.glb_url);
    return {
      provider: 'custom',
      externalTaskId: String(json.task_id || `sync-${Date.now()}`),
      initialStatus: 'READY',
      immediateModel: downloaded,
    };
  }
  if (!json.task_id) {
    throw new Error('Custom Image-to-3D endpoint did not return a task_id or glb_url.');
  }
  return {
    provider: 'custom',
    externalTaskId: String(json.task_id),
    initialStatus: 'QUEUED',
  };
}

export async function pollImageTo3DConversion(
  provider: string,
  externalTaskId: string
): Promise<Poll3DTaskResult> {
  if (provider === 'meshy') {
    const apiKey = (process.env.MESHY_API_KEY || '').trim();
    if (!apiKey) {
      return { status: 'FAILED', progress: 0, errorMessage: 'MESHY_API_KEY is no longer configured.' };
    }
    const res = await fetch(`https://api.meshy.ai/openapi/v1/image-to-3d/${encodeURIComponent(externalTaskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      return {
        status: 'FAILED',
        progress: 0,
        errorMessage: data.message || `Meshy task poll failed (HTTP ${res.status}).`,
      };
    }

    const remoteStatus = String(data.status || '').toUpperCase();
    const progress = Number(data.progress || 0);
    if (remoteStatus === 'SUCCEEDED' && data.model_urls?.glb) {
      const saved = await downloadAndValidateGlb(data.model_urls.glb);
      return { status: 'READY', progress: 100, ...saved };
    }
    if (remoteStatus === 'FAILED' || remoteStatus === 'EXPIRED' || remoteStatus === 'CANCELED') {
      return {
        status: 'FAILED',
        progress,
        errorMessage: data.task_error?.message || `Meshy generation ended with status: ${remoteStatus}.`,
      };
    }
    return {
      status: remoteStatus === 'PENDING' ? 'QUEUED' : 'PROCESSING',
      progress,
    };
  }

  if (provider === 'tripo') {
    const apiKey = (process.env.TRIPO_API_KEY || '').trim();
    if (!apiKey) {
      return { status: 'FAILED', progress: 0, errorMessage: 'TRIPO_API_KEY is no longer configured.' };
    }
    const res = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${encodeURIComponent(externalTaskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      return {
        status: 'FAILED',
        progress: 0,
        errorMessage: json.message || `Tripo3D poll failed (HTTP ${res.status}).`,
      };
    }
    const task = json.data || {};
    const remoteStatus = String(task.status || '').toLowerCase();
    const progress = Number(task.progress || 0);
    const glbUrl = task.output?.pbr_model || task.output?.model;
    if (remoteStatus === 'success' && glbUrl) {
      const saved = await downloadAndValidateGlb(glbUrl);
      return { status: 'READY', progress: 100, ...saved };
    }
    if (remoteStatus === 'failed' || remoteStatus === 'cancelled' || remoteStatus === 'unknown') {
      return { status: 'FAILED', progress, errorMessage: `Tripo3D generation failed (${remoteStatus}).` };
    }
    return { status: remoteStatus === 'queued' ? 'QUEUED' : 'PROCESSING', progress };
  }

  if (provider === 'custom') {
    const customUrl = (process.env.IMAGE_TO_3D_API_URL || '').trim();
    const customKey = (process.env.IMAGE_TO_3D_API_KEY || '').trim();
    if (!customUrl || !customKey) {
      return { status: 'FAILED', progress: 0, errorMessage: 'Custom Image-to-3D API is not configured.' };
    }
    const statusEndpoint = `${customUrl.replace(/\/$/, '')}/${encodeURIComponent(externalTaskId)}`;
    const res = await fetch(statusEndpoint, {
      headers: { Authorization: `Bearer ${customKey}` },
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      return { status: 'FAILED', progress: 0, errorMessage: json.message || `Poll failed (HTTP ${res.status}).` };
    }
    if (json.status === 'READY' || json.status === 'SUCCEEDED') {
      if (json.glb_url) {
        const saved = await downloadAndValidateGlb(json.glb_url);
        return { status: 'READY', progress: 100, ...saved };
      }
      return { status: 'FAILED', progress: 0, errorMessage: 'Provider completed without a GLB URL.' };
    }
    if (json.status === 'FAILED') {
      return { status: 'FAILED', progress: 0, errorMessage: json.error || '3D conversion failed.' };
    }
    return { status: 'PROCESSING', progress: Number(json.progress || 25) };
  }

  return { status: 'FAILED', progress: 0, errorMessage: `Unknown 3D provider: ${provider}` };
}
