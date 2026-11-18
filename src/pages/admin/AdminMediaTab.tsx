import { useEffect, useState } from 'react';
import { Box, Image as ImageIcon, Search, Trash2, Upload } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Evidence3DStudioModal, type StudioTargetAsset } from '../../components/Evidence3DStudioModal';
import type { MediaAsset } from '../../shared/types';

export function AdminMediaTab() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('all');
  const [uploadFolder, setUploadFolder] = useState('general');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editFolder, setEditFolder] = useState('general');
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
  const [studioTarget, setStudioTarget] = useState<StudioTargetAsset | null>(null);
  const [recentUploaded, setRecentUploaded] = useState<MediaAsset | null>(null);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ assets: MediaAsset[] }>(
        `/api/admin/media?search=${encodeURIComponent(search)}&folder=${encodeURIComponent(folder)}`
      );
      setAssets(res.assets);
    } catch (err: any) {
      setError(err.message || 'Failed to load media assets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssets();
  }, [folder]);

  const handleMultiUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('folder', uploadFolder);
      Array.from(files).forEach((f) => fd.append('files', f));
      const res = await apiFetch<{ assets: MediaAsset[] }>('/api/admin/media', { method: 'POST', body: fd });
      await loadAssets();
      if (res.assets?.[0]) {
        setRecentUploaded(res.assets[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleReplace = async (id: string, file: File) => {
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      await apiFetch(`/api/admin/media/${id}/replace`, { method: 'POST', body: fd });
      await loadAssets();
    } catch (err: any) {
      setError(err.message || 'Replace failed.');
    }
  };

  const handleSaveRename = async (id: string) => {
    await apiFetch(`/api/admin/media/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: editTitle, folder: editFolder }),
    });
    setEditingId(null);
    await loadAssets();
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await apiFetch(`/api/admin/media/${deleteTarget.id}`, { method: 'DELETE' });
    setDeleteTarget(null);
    await loadAssets();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold text-white">Media & Gallery Manager</h2>
          <p className="text-sm text-slate-400">
            Upload JPG, JPEG, PNG, or WEBP images from a mobile phone gallery or computer and reuse them across the platform.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={uploadFolder}
            onChange={(e) => setUploadFolder(e.target.value)}
            aria-label="Target upload folder"
            className="rounded-md border border-slate-700 bg-[#0B111E] px-3 py-2 text-xs text-slate-200"
          >
            <option value="general">Folder: General</option>
            <option value="logos">Folder: Logos</option>
            <option value="banners">Folder: Banners</option>
            <option value="cases">Folder: Cases</option>
            <option value="evidence">Folder: Evidence</option>
            <option value="characters">Folder: Characters</option>
            <option value="regions">Folder: Regions</option>
          </select>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]">
            <Upload className="h-4 w-4" />
            <span>{uploading ? 'Uploading...' : 'Upload Images'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleMultiUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/50 px-4 py-2.5 text-xs text-red-200">
          {error}
        </div>
      )}

      {recentUploaded && (
        <div className="rounded-lg border border-[#C9A45C]/50 bg-[#0B111E] p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={recentUploaded.url}
              alt={recentUploaded.title}
              className="h-12 w-16 rounded border border-slate-700 object-cover bg-slate-900 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                Uploaded "{recentUploaded.title}" — Choose Presentation Mode
              </p>
              <p className="text-[11px] text-slate-400">
                Keep Original Image as Standard View, or open 3D Evidence Studio to upload/convert a 3D model.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRecentUploaded(null)}
              className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              Keep Original Image
            </button>
            <button
              type="button"
              onClick={() => {
                const target = recentUploaded;
                setRecentUploaded(null);
                setStudioTarget({
                  entityType: 'MEDIA',
                  entityId: target.id,
                  title: target.title,
                  subtitle: `Media Folder: ${target.folder}`,
                  standardImageUrl: target.url,
                  currentModelId: target.model_3d_id,
                  currentModelUrl: target.model_3d_url,
                  currentModelFormat: target.model_3d_format,
                  currentPreferredView: target.preferred_view,
                });
              }}
              className="inline-flex items-center gap-1.5 rounded bg-[#C9A45C] px-3 py-1.5 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]"
            >
              <Box className="h-3.5 w-3.5" />
              <span>Open in 3D Studio</span>
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-[#0B111E] p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadAssets()}
            placeholder="Search uploaded files..."
            className="w-full rounded-md border border-slate-700 bg-[#070B13] py-2 pl-9 pr-3 text-sm text-white"
          />
        </div>
        <select
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          className="rounded-md border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-slate-200"
        >
          <option value="all">All Folders</option>
          <option value="logos">Logos</option>
          <option value="banners">Banners</option>
          <option value="cases">Cases</option>
          <option value="evidence">Evidence</option>
          <option value="characters">Characters</option>
          <option value="regions">Regions</option>
          <option value="general">General</option>
        </select>
        <button
          type="button"
          onClick={loadAssets}
          className="rounded-md border border-slate-700 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
        >
          Search
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading media assets...</p>
      ) : assets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 p-12 text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-slate-500 mb-2" />
          <p className="text-sm text-slate-400">No media assets found.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assets.map((asset) => (
            <div key={asset.id} className="rounded-lg border border-slate-800 bg-[#0B111E] overflow-hidden flex flex-col justify-between">
              <div className="relative aspect-video bg-slate-900 overflow-hidden">
                <img
                  src={asset.url}
                  alt={asset.title}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-contain p-1"
                />
                {asset.model_3d_url && (
                  <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded border border-[#C9A45C]/60 bg-[#070B13]/90 px-2 py-0.5 font-mono-tabular text-[10px] text-[#C9A45C]">
                    <Box className="h-3 w-3" />
                    <span>{asset.preferred_view === '3D' ? '3D DEFAULT' : '3D READY'}</span>
                  </span>
                )}
              </div>
              <div className="p-4 space-y-3">
                {editingId === asset.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full rounded border border-slate-700 bg-[#070B13] px-2.5 py-1.5 text-xs text-white"
                    />
                    <select
                      value={editFolder}
                      onChange={(e) => setEditFolder(e.target.value)}
                      className="w-full rounded border border-slate-700 bg-[#070B13] px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="general">general</option>
                      <option value="logos">logos</option>
                      <option value="banners">banners</option>
                      <option value="cases">cases</option>
                      <option value="evidence">evidence</option>
                      <option value="characters">characters</option>
                      <option value="regions">regions</option>
                    </select>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveRename(asset.id)}
                        className="rounded bg-[#C9A45C] px-3 py-1 text-xs font-semibold text-[#070B13]"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="truncate text-sm font-medium text-white">{asset.title}</p>
                      <p className="font-mono-tabular text-[11px] text-slate-400">
                        {asset.folder} · {Math.round(asset.size_bytes / 1024)} KB
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(asset.id);
                          setEditTitle(asset.title);
                          setEditFolder(asset.folder);
                        }}
                        className="rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                      >
                        Rename
                      </button>
                      <label className="cursor-pointer rounded border border-slate-700 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-slate-800">
                        Replace
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleReplace(asset.id, f);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setStudioTarget({
                            entityType: 'MEDIA',
                            entityId: asset.id,
                            title: asset.title,
                            subtitle: `Folder: ${asset.folder}`,
                            standardImageUrl: asset.url,
                            currentModelId: asset.model_3d_id,
                            currentModelUrl: asset.model_3d_url,
                            currentModelFormat: asset.model_3d_format,
                            currentPreferredView: asset.preferred_view,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded border border-[#C9A45C]/50 px-2.5 py-1 text-[11px] text-[#C9A45C] hover:bg-[#C9A45C]/10"
                      >
                        <Box className="h-3 w-3" />
                        <span>3D Studio</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(asset)}
                        aria-label={`Delete ${asset.title}`}
                        className="ml-auto rounded p-1 text-slate-500 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Evidence3DStudioModal
        open={Boolean(studioTarget)}
        target={studioTarget}
        onClose={() => setStudioTarget(null)}
        onSaved={() => {
          loadAssets();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Media Asset"
        description={`Are you sure you want to permanently remove "${deleteTarget?.title}" from the Media Library?`}
        confirmLabel="Delete Asset"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
