import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Columns2,
  Eye,
  FileText,
  Image as ImageIcon,
  Layers,
  Loader2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { validateUploadFile } from '../shared/validation';
import type {
  Entity3DLinkType,
  Model3DAsset,
  PreferredViewMode,
  Studio3DProviderStatus,
} from '../shared/types';
import { Model3DViewer } from './Model3DViewer';

export interface StudioTargetAsset {
  entityType: Entity3DLinkType;
  entityId: string;
  title: string;
  subtitle?: string;
  standardImageUrl?: string | null;
  standardDocMeta?: { fileName: string; mimeType: string; isConfidential?: boolean } | null;
  currentModelId?: string | null;
  currentModelUrl?: string | null;
  currentModelFormat?: 'GLB' | 'GLTF' | null;
  currentPreferredView?: PreferredViewMode;
}

interface Evidence3DStudioModalProps {
  open: boolean;
  target: StudioTargetAsset | null;
  onClose: () => void;
  onSaved: (result: {
    model_3d_id: string | null;
    model_3d_url: string | null;
    model_3d_format: 'GLB' | 'GLTF' | null;
    preferred_view: PreferredViewMode;
  }) => void;
}

type StudioViewTab = 'standard' | '3d' | 'compare';

export function Evidence3DStudioModal({
  open,
  target,
  onClose,
  onSaved,
}: Evidence3DStudioModalProps) {
  const [viewTab, setViewTab] = useState<StudioViewTab>('standard');
  const [providerStatus, setProviderStatus] = useState<Studio3DProviderStatus | null>(null);
  const [existingModels, setExistingModels] = useState<Model3DAsset[]>([]);
  const [stagedModel, setStagedModel] = useState<{
    id: string;
    title: string;
    url: string;
    format: 'GLB' | 'GLTF';
    status: Model3DAsset['status'];
    progress: number;
    error_message?: string;
  } | null>(null);
  const [preferredView, setPreferredView] = useState<PreferredViewMode>('STANDARD');
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [statusNotice, setStatusNotice] = useState('');
  const pollTimerRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!open || !target) {
      stopPolling();
      return;
    }

    setError('');
    setStatusNotice('');
    setUploading(false);
    setGenerating(false);
    setSaving(false);

    if (target.currentModelId && target.currentModelUrl) {
      setStagedModel({
        id: target.currentModelId,
        title: target.title,
        url: target.currentModelUrl,
        format: target.currentModelFormat || 'GLB',
        status: 'READY',
        progress: 100,
      });
      setPreferredView(target.currentPreferredView || '3D');
      setViewTab(target.currentPreferredView === '3D' ? '3d' : 'compare');
    } else {
      setStagedModel(null);
      setPreferredView('STANDARD');
      setViewTab('standard');
    }

    let cancelled = false;
    apiFetch<{ models: Model3DAsset[]; providerStatus: Studio3DProviderStatus }>('/api/admin/3d')
      .then((res) => {
        if (cancelled) return;
        setProviderStatus(res.providerStatus);
        setExistingModels(res.models.filter((m) => m.status === 'READY'));
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err.message || 'Unable to inspect 3D Evidence Studio configuration.');
        }
      });

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [open, target]);

  const pollConversion = async (modelId: string) => {
    try {
      const res = await apiFetch<{ model: Model3DAsset }>(`/api/admin/3d/${modelId}`);
      const m = res.model;
      setStagedModel({
        id: m.id,
        title: m.title,
        url: m.url,
        format: m.format,
        status: m.status,
        progress: m.progress,
        error_message: m.error_message,
      });

      if (m.status === 'READY' && m.url) {
        setGenerating(false);
        setStatusNotice('3D conversion completed. Inspect the model below before saving.');
        setViewTab('compare');
        setPreferredView('3D');
        return;
      }
      if (m.status === 'FAILED') {
        setGenerating(false);
        setError(m.error_message || 'Image-to-3D conversion failed. Remaining in Standard View.');
        setPreferredView('STANDARD');
        setViewTab('standard');
        return;
      }

      pollTimerRef.current = window.setTimeout(() => pollConversion(modelId), 2500);
    } catch (err: any) {
      setGenerating(false);
      setError(err.message || 'Error checking 3D conversion status.');
    }
  };

  const handleUpload3DModel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !target) return;
    e.target.value = '';

    const clientCheck = validateUploadFile('model3d', file.type, file.size, file.name);
    if (!clientCheck.valid) {
      setError(clientCheck.errors[0]);
      return;
    }

    setUploading(true);
    setError('');
    setStatusNotice('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', `${target.title} (3D)`);
      if (target.standardImageUrl) fd.append('source_image_url', target.standardImageUrl);
      fd.append('linked_entity_type', target.entityType);
      fd.append('linked_entity_id', target.entityId);
      fd.append('auto_link', 'false');

      const res = await apiFetch<{ model: Model3DAsset }>('/api/admin/3d/upload', {
        method: 'POST',
        body: fd,
      });

      setStagedModel({
        id: res.model.id,
        title: res.model.title,
        url: res.model.url,
        format: res.model.format,
        status: res.model.status,
        progress: res.model.progress,
      });
      setExistingModels((prev) => [res.model, ...prev]);
      setPreferredView('3D');
      setViewTab('compare');
      setStatusNotice('3D model uploaded and validated. Compare with original and click Save & Apply.');
    } catch (err: any) {
      setError(err.message || 'Failed to upload 3D model.');
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateAI3D = async () => {
    if (!target || !target.standardImageUrl) return;
    if (!providerStatus?.configured) {
      setError(
        providerStatus?.message ||
          'AI 3D conversion is unavailable because no 3D generation API key is configured on the server.'
      );
      return;
    }

    stopPolling();
    setGenerating(true);
    setError('');
    setStatusNotice('Submitting image to configured AI 3D conversion service...');
    try {
      const res = await apiFetch<{ model: Model3DAsset }>('/api/admin/3d/generate', {
        method: 'POST',
        body: JSON.stringify({
          source_image_url: target.standardImageUrl,
          title: `${target.title} (AI 3D)`,
          linked_entity_type: target.entityType,
          linked_entity_id: target.entityId,
        }),
      });
      const m = res.model;
      setStagedModel({
        id: m.id,
        title: m.title,
        url: m.url,
        format: m.format,
        status: m.status,
        progress: m.progress,
        error_message: m.error_message,
      });

      if (m.status === 'READY' && m.url) {
        setGenerating(false);
        setPreferredView('3D');
        setViewTab('compare');
        setStatusNotice('3D conversion ready for inspection.');
      } else if (m.status === 'FAILED') {
        setGenerating(false);
        setError(m.error_message || 'Conversion failed.');
      } else {
        pollTimerRef.current = window.setTimeout(() => pollConversion(m.id), 2500);
      }
    } catch (err: any) {
      setGenerating(false);
      setError(err.message || 'AI 3D generation request failed.');
    }
  };

  const handleSaveLink = async () => {
    if (!target) return;
    setSaving(true);
    setError('');
    try {
      const canUse3D = stagedModel && stagedModel.status === 'READY' && Boolean(stagedModel.url);
      const modelIdToLink = canUse3D ? stagedModel.id : null;
      const safePreferredView: PreferredViewMode =
        modelIdToLink && preferredView === '3D' ? '3D' : 'STANDARD';

      await apiFetch('/api/admin/3d/link', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: target.entityType,
          entity_id: target.entityId,
          model_3d_id: modelIdToLink,
          preferred_view: safePreferredView,
        }),
      });

      onSaved({
        model_3d_id: modelIdToLink,
        model_3d_url: canUse3D ? stagedModel.url : null,
        model_3d_format: canUse3D ? stagedModel.format : null,
        preferred_view: safePreferredView,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not save 3D studio configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkStandard = async () => {
    if (!target) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/admin/3d/link', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: target.entityType,
          entity_id: target.entityId,
          model_3d_id: null,
          preferred_view: 'STANDARD',
        }),
      });
      setStagedModel(null);
      setPreferredView('STANDARD');
      setViewTab('standard');
      onSaved({
        model_3d_id: null,
        model_3d_url: null,
        model_3d_format: null,
        preferred_view: 'STANDARD',
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not revert to Standard View.');
    } finally {
      setSaving(false);
    }
  };

  const hasReadyModel = Boolean(stagedModel && stagedModel.status === 'READY' && stagedModel.url);

  const entityBadge = useMemo(() => {
    if (!target) return '';
    switch (target.entityType) {
      case 'MEDIA':
        return 'Media Library Asset';
      case 'EVIDENCE':
        return 'Case Evidence Item';
      case 'DOCUMENT':
        return 'Case Document';
      case 'CHARACTER':
        return 'Character Asset';
      case 'CASE_SCENE':
        return 'Crime Scene / Cover';
    }
  }, [target]);

  if (!open || !target) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="3D Evidence Studio"
    >
      <div className="my-auto flex max-h-[94vh] w-full max-w-6xl flex-col rounded-lg border border-slate-700 bg-[#0B111E] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#070B13] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-mono-tabular text-[#C9A45C]">
              <Box className="h-3.5 w-3.5" />
              <span>3D EVIDENCE STUDIO · {entityBadge.toUpperCase()}</span>
            </div>
            <h3 className="font-display text-2xl font-semibold text-white truncate">
              {target.title}
            </h3>
            {target.subtitle && <p className="text-xs text-slate-400 truncate">{target.subtitle}</p>}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close 3D Evidence Studio"
            className="rounded-md border border-slate-700 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-md border border-red-800 bg-red-950/60 px-4 py-3 text-xs text-red-200"
            >
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">3D Studio Notice</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {statusNotice && !error && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-800 bg-emerald-950/40 px-4 py-2.5 text-xs text-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{statusNotice}</span>
            </div>
          )}

          {/* Action Bar: View Switcher + Upload 3D + Optional AI Conversion */}
          <div className="grid gap-4 lg:grid-cols-12">
            {/* Left: Preview Mode Switcher & Inspector */}
            <div className="lg:col-span-8 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-md border border-slate-800 bg-[#070B13] p-1">
                  <button
                    type="button"
                    onClick={() => setViewTab('standard')}
                    className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium ${
                      viewTab === 'standard'
                        ? 'bg-[#C9A45C] text-[#070B13] font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span>Standard View</span>
                  </button>
                  <button
                    type="button"
                    disabled={!hasReadyModel}
                    onClick={() => setViewTab('3d')}
                    className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
                      viewTab === '3d'
                        ? 'bg-[#C9A45C] text-[#070B13] font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Box className="h-3.5 w-3.5" />
                    <span>3D View</span>
                  </button>
                  <button
                    type="button"
                    disabled={!hasReadyModel}
                    onClick={() => setViewTab('compare')}
                    className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
                      viewTab === 'compare'
                        ? 'bg-[#C9A45C] text-[#070B13] font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Columns2 className="h-3.5 w-3.5" />
                    <span>Compare Original vs 3D</span>
                  </button>
                </div>

                {stagedModel && (stagedModel.status === 'QUEUED' || stagedModel.status === 'PROCESSING') && (
                  <div className="inline-flex items-center gap-2 rounded border border-amber-700/70 bg-amber-950/30 px-3 py-1 text-xs text-amber-200">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>
                      {stagedModel.status} ({stagedModel.progress}%)
                    </span>
                  </div>
                )}
              </div>

              {/* Preview Viewport */}
              {viewTab === 'standard' && (
                <div className="rounded-lg border border-slate-800 bg-[#070B13] p-4 min-h-[340px] flex flex-col items-center justify-center">
                  {target.standardImageUrl ? (
                    <div className="w-full space-y-2 text-center">
                      <img
                        src={target.standardImageUrl}
                        alt={target.title}
                        referrerPolicy="no-referrer"
                        className="mx-auto max-h-[340px] w-full object-contain rounded"
                      />
                      <p className="text-[11px] text-slate-400">
                        Original file preserved untouched in storage.
                      </p>
                    </div>
                  ) : target.standardDocMeta ? (
                    <div className="text-center space-y-2 max-w-md py-10">
                      <FileText className="mx-auto h-10 w-10 text-[#C9A45C]" />
                      <p className="text-sm font-semibold text-white">{target.standardDocMeta.fileName}</p>
                      <p className="font-mono-tabular text-xs text-slate-400">
                        {target.standardDocMeta.mimeType} ·{' '}
                        {target.standardDocMeta.isConfidential ? 'Confidential Private Storage' : 'Standard Document'}
                      </p>
                      <p className="text-xs text-slate-400">
                        Link an optional .GLB or .GLTF 3D exhibit model alongside this document without modifying the original file.
                      </p>
                    </div>
                  ) : (
                    <div className="text-center space-y-2 py-10">
                      <ImageIcon className="mx-auto h-9 w-9 text-slate-600" />
                      <p className="text-xs text-slate-400">No 2D image attached to this record yet.</p>
                    </div>
                  )}
                </div>
              )}

              {viewTab === '3d' && hasReadyModel && stagedModel && (
                <Model3DViewer
                  modelUrl={stagedModel.url}
                  title={stagedModel.title}
                  format={stagedModel.format}
                  heightClass="h-[380px] sm:h-[420px]"
                  onFallbackToStandard={() => setViewTab('standard')}
                />
              )}

              {viewTab === 'compare' && hasReadyModel && stagedModel && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 bg-[#070B13] p-3 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-[11px] font-mono-tabular text-slate-400 mb-2">
                      <span>ORIGINAL ASSET (UNCHANGED)</span>
                      <Eye className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 flex items-center justify-center min-h-[290px] bg-slate-950/60 rounded p-2">
                      {target.standardImageUrl ? (
                        <img
                          src={target.standardImageUrl}
                          alt={target.title}
                          referrerPolicy="no-referrer"
                          className="max-h-[290px] w-full object-contain"
                        />
                      ) : (
                        <div className="text-center space-y-2 px-4">
                          <FileText className="mx-auto h-8 w-8 text-[#C9A45C]" />
                          <p className="text-xs text-slate-300">
                            {target.standardDocMeta?.fileName || target.title}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <Model3DViewer
                      modelUrl={stagedModel.url}
                      title={stagedModel.title}
                      format={stagedModel.format}
                      heightClass="h-[340px]"
                      onFallbackToStandard={() => {
                        setPreferredView('STANDARD');
                        setViewTab('standard');
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Right: Upload / Generate / Select / Save Controls */}
            <div className="lg:col-span-4 space-y-4">
              {/* 1. Upload 3D Model (.GLB / .GLTF) */}
              <div className="rounded-lg border border-slate-800 bg-[#070B13] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-white">
                    Upload 3D Model
                  </h4>
                  <span className="font-mono-tabular text-[10px] text-slate-400">GLB / GLTF · 50MB</span>
                </div>
                <p className="text-xs text-slate-400">
                  Attach a genuine binary .GLB or .GLTF 3D model and inspect it before saving.
                </p>
                <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-[#C9A45C]/60 bg-[#C9A45C]/10 px-3 py-2 text-xs font-semibold text-[#C9A45C] hover:bg-[#C9A45C]/20">
                  <Upload className="h-4 w-4" />
                  <span>{uploading ? 'Validating & Uploading...' : 'Upload .GLB / .GLTF File'}</span>
                  <input
                    type="file"
                    accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                    disabled={uploading}
                    onChange={handleUpload3DModel}
                    className="hidden"
                  />
                </label>
              </div>

              {/* 2. Optional AI Image-to-3D Conversion */}
              <div className="rounded-lg border border-slate-800 bg-[#070B13] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-white">
                    AI Image-to-3D Conversion
                  </h4>
                  <span
                    className={`rounded px-2 py-0.5 font-mono-tabular text-[10px] ${
                      providerStatus?.configured
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-slate-900 text-amber-300 border border-amber-800/60'
                    }`}
                  >
                    {providerStatus?.configured ? providerStatus.providerLabel : 'Unavailable'}
                  </span>
                </div>

                {providerStatus && !providerStatus.configured ? (
                  <div className="rounded border border-amber-900/60 bg-amber-950/20 p-3 text-[11px] leading-relaxed text-amber-200 space-y-1.5">
                    <p className="font-semibold">AI 3D Conversion Not Configured</p>
                    <p>{providerStatus.message}</p>
                    <p className="text-slate-300">
                      Set <code className="text-[#C9A45C]">MESHY_API_KEY</code>,{' '}
                      <code className="text-[#C9A45C]">TRIPO_API_KEY</code>, or{' '}
                      <code className="text-[#C9A45C]">IMAGE_TO_3D_API_URL</code> in server environment variables, or upload a .GLB/.GLTF file above.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    Convert the original 2D image into a textured .GLB mesh via {providerStatus?.providerLabel || 'configured API'}.
                  </p>
                )}

                <button
                  type="button"
                  disabled={
                    generating ||
                    !target.standardImageUrl ||
                    !providerStatus?.configured
                  }
                  onClick={handleGenerateAI3D}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Converting Image to 3D...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 text-[#C9A45C]" />
                      <span>
                        {providerStatus?.configured
                          ? 'Generate Realistic 3D (.GLB)'
                          : 'AI Conversion Unavailable'}
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* 3. Reuse Existing 3D Model from Studio */}
              {existingModels.length > 0 && (
                <div className="rounded-lg border border-slate-800 bg-[#070B13] p-4 space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Or Link Existing 3D Asset
                  </label>
                  <select
                    value={stagedModel?.id || ''}
                    onChange={(e) => {
                      const picked = existingModels.find((m) => m.id === e.target.value);
                      if (!picked) {
                        setStagedModel(null);
                        setPreferredView('STANDARD');
                        setViewTab('standard');
                      } else {
                        setStagedModel({
                          id: picked.id,
                          title: picked.title,
                          url: picked.url,
                          format: picked.format,
                          status: picked.status,
                          progress: picked.progress,
                        });
                        setPreferredView('3D');
                        setViewTab('compare');
                      }
                    }}
                    className="w-full rounded border border-slate-700 bg-[#0B111E] px-2.5 py-2 text-xs text-white"
                  >
                    <option value="">-- Select from 3D Studio --</option>
                    {existingModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} ({m.format})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 4. Choose Default Presentation & Save */}
              <div className="rounded-lg border border-slate-800 bg-[#070B13] p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white">
                  <Layers className="h-3.5 w-3.5 text-[#C9A45C]" />
                  <span>Choose Version to Display</span>
                </div>

                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 rounded border border-slate-800 bg-[#0B111E] p-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="preferredViewMode"
                      checked={preferredView === 'STANDARD'}
                      onChange={() => setPreferredView('STANDARD')}
                      className="mt-0.5"
                    />
                    <div className="text-xs">
                      <p className="font-medium text-white">Original / Standard View</p>
                      <p className="text-[11px] text-slate-400">Display original 2D image or document by default</p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 rounded border border-slate-800 bg-[#0B111E] p-2.5 ${
                      hasReadyModel ? 'cursor-pointer' : 'opacity-45 cursor-not-allowed'
                    }`}
                  >
                    <input
                      type="radio"
                      name="preferredViewMode"
                      disabled={!hasReadyModel}
                      checked={preferredView === '3D'}
                      onChange={() => setPreferredView('3D')}
                      className="mt-0.5"
                    />
                    <div className="text-xs">
                      <p className="font-medium text-white">Realistic 3D View</p>
                      <p className="text-[11px] text-slate-400">
                        Open interactive 360° 3D model by default (with Standard fallback)
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Modal Footer (Always Visible Without Scrolling) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-[#070B13] px-5 py-3.5">
          <div className="text-xs text-slate-300">
            <span>Default Display: </span>
            <span className="font-semibold text-[#C9A45C]">
              {hasReadyModel && preferredView === '3D' ? 'Realistic 3D View' : 'Original / Standard View'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 px-3.5 py-2 text-xs text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            {target.currentModelId && (
              <button
                type="button"
                disabled={saving}
                onClick={handleUnlinkStandard}
                className="rounded-md border border-slate-700 px-3.5 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                Unlink 3D
              </button>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveLink}
              className="rounded-md bg-[#C9A45C] px-5 py-2 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774] disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save & Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
