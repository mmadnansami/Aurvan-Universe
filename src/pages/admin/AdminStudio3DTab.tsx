import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { validateUploadFile } from '../../shared/validation';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Model3DViewer } from '../../components/Model3DViewer';
import type { MediaAsset, Model3DAsset, Studio3DProviderStatus } from '../../shared/types';

export function AdminStudio3DTab() {
  const [models, setModels] = useState<Model3DAsset[]>([]);
  const [providerStatus, setProviderStatus] = useState<Studio3DProviderStatus | null>(null);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [uploadTitle, setUploadTitle] = useState('');
  const [selectedMediaId, setSelectedMediaId] = useState('');
  const [aiTitle, setAiTitle] = useState('');
  const [previewModel, setPreviewModel] = useState<Model3DAsset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Model3DAsset | null>(null);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [studioRes, mediaRes] = await Promise.all([
        apiFetch<{ models: Model3DAsset[]; providerStatus: Studio3DProviderStatus }>('/api/admin/3d'),
        apiFetch<{ assets: MediaAsset[] }>('/api/admin/media'),
      ]);
      setModels(studioRes.models);
      setProviderStatus(studioRes.providerStatus);
      setMediaAssets(mediaRes.assets);
      setPreviewModel((prev) => {
        if (prev) {
          const updated = studioRes.models.find((m) => m.id === prev.id);
          if (updated && updated.status === 'READY') return updated;
        }
        return studioRes.models.find((m) => m.status === 'READY') || null;
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load 3D Evidence Studio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleUpload3D = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const check = validateUploadFile('model3d', file.type, file.size, file.name);
    if (!check.valid) {
      setError(check.errors[0]);
      return;
    }

    setUploading(true);
    setError('');
    setNotice('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', uploadTitle.trim() || file.name.replace(/\.[^/.]+$/, ''));

      const res = await apiFetch<{ model: Model3DAsset }>('/api/admin/3d/upload', {
        method: 'POST',
        body: fd,
      });
      setUploadTitle('');
      setNotice(`Uploaded and validated "${res.model.title}" (${res.model.format}).`);
      setPreviewModel(res.model);
      await loadAll();
    } catch (err: any) {
      setError(err.message || '3D model upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateFromMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!providerStatus?.configured) {
      setError(
        providerStatus?.message ||
          'AI image-to-3D conversion is unavailable because no 3D generation API key is configured.'
      );
      return;
    }

    const picked = mediaAssets.find((a) => a.id === selectedMediaId);
    if (!picked) {
      setError('Select a source image from the Media Library first.');
      return;
    }

    setGenerating(true);
    try {
      const res = await apiFetch<{ model: Model3DAsset }>('/api/admin/3d/generate', {
        method: 'POST',
        body: JSON.stringify({
          source_image_url: picked.url,
          title: aiTitle.trim() || `${picked.title} (AI 3D)`,
          linked_entity_type: 'MEDIA',
          linked_entity_id: picked.id,
        }),
      });
      setAiTitle('');
      setNotice(
        res.model.status === 'READY'
          ? `Converted "${picked.title}" to 3D.`
          : `Queued AI conversion job (${res.model.status}). Refresh to inspect progress.`
      );
      await loadAll();
    } catch (err: any) {
      setError(err.message || 'Image-to-3D conversion request failed.');
    } finally {
      setGenerating(false);
    }
  };

  const handleRefreshModelStatus = async (id: string) => {
    setError('');
    try {
      const res = await apiFetch<{ model: Model3DAsset }>(`/api/admin/3d/${id}`);
      setModels((prev) => prev.map((m) => (m.id === id ? res.model : m)));
      if (res.model.status === 'READY') {
        setPreviewModel(res.model);
      }
    } catch (err: any) {
      setError(err.message || 'Could not refresh job status.');
    }
  };

  const handleDeleteModel = async () => {
    if (!deleteTarget) return;
    await apiFetch(`/api/admin/3d/${deleteTarget.id}`, { method: 'DELETE' });
    if (previewModel?.id === deleteTarget.id) {
      setPreviewModel(null);
    }
    setDeleteTarget(null);
    await loadAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold text-white">3D Evidence Studio</h2>
          <p className="text-sm text-slate-400">
            Optional 3D artifact workbench for .GLB / .GLTF models and genuine backend AI image-to-3D conversion. Original files stay unchanged.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAll}
          className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3.5 py-2 text-xs text-slate-200 hover:bg-slate-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh Studio</span>
        </button>
      </div>

      {/* Honest AI Provider Status Banner */}
      {providerStatus && (
        <div
          className={`rounded-lg border p-4 flex flex-wrap items-start justify-between gap-4 ${
            providerStatus.configured
              ? 'border-emerald-800/70 bg-emerald-950/20'
              : 'border-amber-800/60 bg-amber-950/20'
          }`}
        >
          <div className="flex items-start gap-3">
            {providerStatus.configured ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">
                AI Image-to-3D Service: {providerStatus.configured ? providerStatus.providerLabel : 'Not Configured (Unavailable)'}
              </p>
              <p className="text-xs text-slate-300">{providerStatus.message}</p>
              {!providerStatus.configured && (
                <p className="text-[11px] text-slate-400">
                  Direct .GLB and .GLTF 3D model uploads, interactive 360° previewing, and linking across Media, Evidence, Documents, Characters, and Crime Scenes remain fully operational.
                </p>
              )}
            </div>
          </div>
          <span
            className={`rounded px-2.5 py-1 font-mono-tabular text-[11px] ${
              providerStatus.configured
                ? 'bg-emerald-900/50 text-emerald-200'
                : 'bg-amber-900/40 text-amber-200'
            }`}
          >
            {providerStatus.configured ? 'API CONNECTED' : 'NO API KEY CONFIGURED'}
          </span>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-md border border-red-800 bg-red-950/50 px-4 py-3 text-xs text-red-200">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-md border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-xs text-emerald-200">
          {notice}
        </div>
      )}

      {/* Upload + Optional AI Conversion Panels */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-2xl font-semibold text-white">Upload 3D Model (.GLB / .GLTF)</h3>
            <span className="font-mono-tabular text-[11px] text-slate-400 whitespace-nowrap shrink-0">MAX 50 MB</span>
          </div>
          <p className="text-xs text-slate-400">
            Files are verified for valid glTF headers before storage in the 3D Evidence Studio library.
          </p>
          <div>
            <label className="block text-xs text-slate-300 mb-1">3D Asset Title (Optional)</label>
            <input
              type="text"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="e.g. Harbor Padlock Forensic Scan"
              className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
            />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[#C9A45C] px-4 py-2.5 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]">
            <Upload className="h-4 w-4" />
            <span>{uploading ? 'Validating & Uploading...' : 'Select .GLB or .GLTF File'}</span>
            <input
              type="file"
              accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
              disabled={uploading}
              onChange={handleUpload3D}
              className="hidden"
            />
          </label>
        </div>

        <form onSubmit={handleGenerateFromMedia} className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-2xl font-semibold text-white">Generate 3D from Image</h3>
            <Sparkles className="h-4 w-4 text-[#C9A45C]" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Source Media Image</label>
              <select
                value={selectedMediaId}
                onChange={(e) => setSelectedMediaId(e.target.value)}
                className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
              >
                <option value="">-- Choose Uploaded Image --</option>
                {mediaAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} ({a.folder})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Generated Model Name</label>
              <input
                type="text"
                value={aiTitle}
                onChange={(e) => setAiTitle(e.target.value)}
                placeholder="Optional model title"
                className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!providerStatus?.configured || generating || !selectedMediaId}
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-[#070B13] px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Starting AI Conversion...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-[#C9A45C]" />
                <span>
                  {providerStatus?.configured
                    ? 'Convert Selected Image to 3D (.GLB)'
                    : 'AI Conversion Unavailable (API Key Required)'}
                </span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Live 3D Inspector Workbench */}
      {previewModel && previewModel.status === 'READY' && previewModel.url && (
        <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono-tabular text-[11px] text-[#C9A45C]">INTERACTIVE 3D PREVIEW</p>
              <h3 className="font-display text-2xl font-semibold text-white">{previewModel.title}</h3>
            </div>
            <button
              type="button"
              onClick={() => setPreviewModel(null)}
              className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              Close Preview
            </button>
          </div>
          <Model3DViewer
            modelUrl={previewModel.url}
            title={previewModel.title}
            format={previewModel.format}
            heightClass="h-[400px] sm:h-[460px]"
          />
        </div>
      )}

      {/* Stored 3D Models Table */}
      <div className="rounded-lg border border-slate-800 bg-[#0B111E] overflow-hidden">
        <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
          <h3 className="font-display text-2xl font-semibold text-white">Stored 3D Assets ({models.length})</h3>
          <span className="font-mono-tabular text-xs text-slate-400">GLB / GLTF REPOSITORY</span>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-slate-400">Loading 3D studio assets...</p>
        ) : models.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Box className="mx-auto h-8 w-8 text-slate-600" />
            <p className="text-sm text-slate-400">
              No 3D models uploaded yet. Upload a .GLB or .GLTF file above or open 3D Studio on any image or document.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {models.map((m) => (
              <div key={m.id} className="px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Box className="h-4 w-4 text-[#C9A45C] shrink-0" />
                    <span className="text-sm font-medium text-white truncate">{m.title}</span>
                    <span className="rounded border border-slate-700 bg-[#070B13] px-2 py-0.5 font-mono-tabular text-[10px] text-slate-300">
                      {m.format}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 font-mono-tabular text-[10px] ${
                        m.status === 'READY'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : m.status === 'FAILED'
                          ? 'bg-red-950 text-red-300 border border-red-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}
                    >
                      {m.status}
                      {m.status === 'PROCESSING' ? ` ${m.progress}%` : ''}
                    </span>
                  </div>
                  <p className="font-mono-tabular text-xs text-slate-400">
                    {m.file_name} · {Math.max(1, Math.round(m.size_bytes / 1024))} KB · Source: {m.source_type}
                    {m.linked_entity_type ? ` · Linked: ${m.linked_entity_type}` : ''}
                  </p>
                  {m.error_message && <p className="text-xs text-red-300">{m.error_message}</p>}
                </div>

                <div className="flex items-center gap-2">
                  {(m.status === 'QUEUED' || m.status === 'PROCESSING') && (
                    <button
                      type="button"
                      onClick={() => handleRefreshModelStatus(m.id)}
                      className="inline-flex items-center gap-1 rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Check Status</span>
                    </button>
                  )}
                  {m.status === 'READY' && m.url && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPreviewModel(m)}
                        className="inline-flex items-center gap-1 rounded border border-[#C9A45C]/60 px-3 py-1.5 text-xs text-[#C9A45C] hover:bg-[#C9A45C]/10"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Inspect 3D</span>
                      </button>
                      <a
                        href={m.url}
                        download={m.file_name}
                        className="inline-flex items-center gap-1 rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Export</span>
                      </a>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(m)}
                    aria-label={`Delete ${m.title}`}
                    className="rounded p-1.5 text-slate-500 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete 3D Model Asset"
        description={`Permanently delete "${deleteTarget?.title}"? Any linked images, evidence, documents, or characters will safely revert to Standard View.`}
        confirmLabel="Delete 3D Model"
        destructive
        onConfirm={handleDeleteModel}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
