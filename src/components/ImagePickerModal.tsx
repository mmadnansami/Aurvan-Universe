import { useEffect, useState } from 'react';
import { Box, Image as ImageIcon, Search, Upload, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Evidence3DStudioModal, type StudioTargetAsset } from './Evidence3DStudioModal';
import type { MediaAsset } from '../shared/types';

interface ImagePickerModalProps {
  open: boolean;
  title?: string;
  defaultFolder?: string;
  onSelect: (url: string, asset?: MediaAsset) => void;
  onClose: () => void;
}

export function ImagePickerModal({
  open,
  title = 'Select or Upload Image',
  defaultFolder = 'general',
  onSelect,
  onClose,
}: ImagePickerModalProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('all');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [studioTarget, setStudioTarget] = useState<StudioTargetAsset | null>(null);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ assets: MediaAsset[] }>(
        `/api/admin/media?search=${encodeURIComponent(search)}&folder=${encodeURIComponent(folder)}`
      );
      setAssets(data.assets);
    } catch (err: any) {
      setError(err.message || 'Failed to load media library.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadAssets();
    }
  }, [open, folder]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('folder', defaultFolder);
      Array.from(files).forEach((f) => formData.append('files', f));
      const res = await apiFetch<{ assets: MediaAsset[] }>('/api/admin/media', {
        method: 'POST',
        body: formData,
      });
      await loadAssets();
      if (res.assets[0]) {
        onSelect(res.assets[0].url, res.assets[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Image upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-lg border border-slate-700 bg-[#0D1422] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h3 className="font-display text-2xl font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close media picker"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-3">
          <div className="flex flex-1 items-center gap-2 min-w-[200px]">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadAssets()}
                placeholder="Search media assets..."
                className="w-full rounded-md border border-slate-700 bg-[#070B13] py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-[#C9A45C] focus:outline-none"
              />
            </div>
            <select
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              aria-label="Filter media folder"
              className="rounded-md border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-slate-200 focus:border-[#C9A45C] focus:outline-none"
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
              className="rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Search
            </button>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774] whitespace-nowrap">
            <Upload className="h-4 w-4" />
            <span>{uploading ? 'Uploading...' : 'Upload From Device'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleUpload}
              className="hidden"
            />
          </label>
        </div>

        {error && (
          <div className="mx-6 mt-3 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-sm text-slate-400">Loading media library...</p>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 py-12 text-center">
              <ImageIcon className="h-8 w-8 text-slate-600 mb-2" />
              <p className="text-sm text-slate-400">No images found in this folder.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="group flex flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#070B13] hover:border-[#C9A45C] transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onSelect(asset.url, asset)}
                    className="text-left flex-1 flex flex-col"
                  >
                    <div className="relative aspect-video w-full bg-slate-900 overflow-hidden">
                      <img
                        src={asset.url}
                        alt={asset.title}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-contain p-1 group-hover:scale-105 transition-transform"
                      />
                      {asset.model_3d_url && (
                        <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded border border-[#C9A45C]/60 bg-[#070B13]/90 px-1.5 py-0.5 font-mono-tabular text-[9px] text-[#C9A45C]">
                          <Box className="h-2.5 w-2.5" />
                          <span>3D</span>
                        </span>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="truncate text-xs font-medium text-slate-200">{asset.title}</p>
                      <p className="truncate text-[11px] text-slate-500">{asset.folder}</p>
                    </div>
                  </button>
                  <div className="border-t border-slate-800/80 px-2.5 py-1.5 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onSelect(asset.url, asset)}
                      className="text-[11px] font-medium text-slate-300 hover:text-white"
                    >
                      Use Image
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setStudioTarget({
                          entityType: 'MEDIA',
                          entityId: asset.id,
                          title: asset.title,
                          subtitle: `Media Folder: ${asset.folder}`,
                          standardImageUrl: asset.url,
                          currentModelId: asset.model_3d_id,
                          currentModelUrl: asset.model_3d_url,
                          currentModelFormat: asset.model_3d_format,
                          currentPreferredView: asset.preferred_view,
                        })
                      }
                      className="inline-flex items-center gap-1 text-[11px] text-[#C9A45C] hover:underline"
                    >
                      <Box className="h-3 w-3" />
                      <span>3D Studio</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Evidence3DStudioModal
        open={Boolean(studioTarget)}
        target={studioTarget}
        onClose={() => setStudioTarget(null)}
        onSaved={() => {
          loadAssets();
        }}
      />
    </div>
  );
}
