import { useEffect, useState } from 'react';
import { Box, FileText, Trash2, Upload, Volume2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { downloadFirestoreDocument } from '../../lib/firebaseBackend';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Evidence3DStudioModal, type StudioTargetAsset } from '../../components/Evidence3DStudioModal';
import { parsePositiveInt, sanitizeDigitInput } from '../../shared/numericInput';
import type { AudioAsset, DocumentAsset } from '../../shared/types';

export function AdminAssetsTab({ mode }: { mode: 'documents' | 'audio' }) {
  const [docs, setDocs] = useState<DocumentAsset[]>([]);
  const [audio, setAudio] = useState<AudioAsset[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [studioTarget, setStudioTarget] = useState<StudioTargetAsset | null>(null);

  // Document form
  const [docTitle, setDocTitle] = useState('');
  const [docConfidential, setDocConfidential] = useState(false);
  const [docCaseId, setDocCaseId] = useState('');

  // Audio form
  const [audTitle, setAudTitle] = useState('');
  const [audDesc, setAudDesc] = useState('');
  const [audTranscript, setAudTranscript] = useState('');
  const [audCaseId, setAudCaseId] = useState('');
  const [audChapter, setAudChapter] = useState('1');

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadData = async () => {
    const casesRes = await apiFetch<{ cases: any[] }>('/api/admin/cases');
    setCases(casesRes.cases);
    if (mode === 'documents') {
      const res = await apiFetch<{ documents: DocumentAsset[] }>('/api/admin/documents');
      setDocs(res.documents);
    } else {
      const res = await apiFetch<{ audio: AudioAsset[] }>('/api/admin/audio');
      setAudio(res.audio);
    }
  };

  useEffect(() => {
    loadData();
  }, [mode]);

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', docTitle || file.name);
      fd.append('is_confidential', String(docConfidential));
      if (docCaseId) fd.append('case_id', docCaseId);
      await apiFetch('/api/admin/documents', { method: 'POST', body: fd });
      setDocTitle('');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Document upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleUploadAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const parsedChapter = parsePositiveInt(audChapter);
    if (!parsedChapter) {
      setError('Chapter number must be 1 or greater.');
      e.target.value = '';
      return;
    }
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', audTitle || file.name);
      fd.append('description', audDesc);
      fd.append('transcript', audTranscript);
      if (audCaseId) fd.append('case_id', audCaseId);
      fd.append('chapter_number', String(parsedChapter));
      await apiFetch('/api/admin/audio', { method: 'POST', body: fd });
      setAudTitle('');
      setAudDesc('');
      setAudTranscript('');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Audio upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handlePreviewDoc = async (doc: DocumentAsset) => {
    try {
      await downloadFirestoreDocument(doc.id);
    } catch (err: any) {
      setError(err.message || 'Unable to download document.');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteId) return;
    await apiFetch(`/api/admin/${mode}/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    await loadData();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-semibold text-white">
          {mode === 'documents' ? 'Document Manager' : 'Audio Manager'}
        </h2>
        <p className="text-sm text-slate-400">
          {mode === 'documents'
            ? 'Upload PDF, DOCX, or TXT files. Confidential files are stored outside public URLs.'
            : 'Upload MP3 or WAV recordings with transcripts and attach them to case chapters.'}
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/50 px-4 py-2.5 text-xs text-red-200">
          {error}
        </div>
      )}

      {mode === 'documents' ? (
        <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Document Title</label>
              <input
                type="text"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="e.g. Customs Manifest #44"
                className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Assign Case (Optional)</label>
              <select
                value={docCaseId}
                onChange={(e) => setDocCaseId(e.target.value)}
                className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
              >
                <option value="">Unassigned</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.case_code} — {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={docConfidential}
                  onChange={(e) => setDocConfidential(e.target.checked)}
                />
                <span>Confidential (Admin Only)</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]">
                <Upload className="h-4 w-4" />
                <span>{uploading ? 'Uploading...' : 'Upload Doc'}</span>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,application/pdf,text/plain"
                  onChange={handleUploadDoc}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="divide-y divide-slate-800 border-t border-slate-800 pt-2">
            {docs.length === 0 ? (
              <p className="py-6 text-sm text-slate-400">No documents uploaded yet.</p>
            ) : (
              docs.map((d) => (
                <div key={d.id} className="py-3 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-[#C9A45C]" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-white">{d.title}</p>
                        {d.model_3d_url && (
                          <span className="inline-flex items-center gap-1 rounded border border-[#C9A45C]/50 bg-[#070B13] px-2 py-0.5 font-mono-tabular text-[10px] text-[#C9A45C]">
                            <Box className="h-3 w-3" />
                            <span>{d.preferred_view === '3D' ? '3D DEFAULT' : '3D LINKED'}</span>
                          </span>
                        )}
                      </div>
                      <p className="font-mono-tabular text-xs text-slate-400">
                        {d.file_name} · {Math.round(d.size_bytes / 1024)} KB ·{' '}
                        {d.is_confidential ? 'Confidential Private' : 'Case Evidence'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setStudioTarget({
                          entityType: 'DOCUMENT',
                          entityId: d.id,
                          title: d.title,
                          subtitle: `${d.file_name} · ${d.is_confidential ? 'Confidential' : 'Standard Document'}`,
                          standardDocMeta: {
                            fileName: d.file_name,
                            mimeType: d.mime_type,
                            isConfidential: d.is_confidential,
                          },
                          currentModelId: d.model_3d_id,
                          currentModelUrl: d.model_3d_url,
                          currentModelFormat: d.model_3d_format,
                          currentPreferredView: d.preferred_view,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded border border-[#C9A45C]/50 px-3 py-1.5 text-xs text-[#C9A45C] hover:bg-[#C9A45C]/10"
                    >
                      <Box className="h-3.5 w-3.5" />
                      <span>3D Studio</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreviewDoc(d)}
                      className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                    >
                      Download / Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(d.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400"
                      aria-label={`Delete ${d.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Audio Title</label>
              <input
                type="text"
                value={audTitle}
                onChange={(e) => setAudTitle(e.target.value)}
                placeholder="e.g. Harbor Dispatch Recording"
                className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Assign Case (Optional)</label>
              <select
                value={audCaseId}
                onChange={(e) => setAudCaseId(e.target.value)}
                className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
              >
                <option value="">Unassigned</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.case_code} — {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="audio-chapter-number" className="block text-xs text-slate-300 mb-1">
                Chapter Number
              </label>
              <input
                id="audio-chapter-number"
                type="text"
                inputMode="numeric"
                value={audChapter}
                onChange={(e) => setAudChapter(sanitizeDigitInput(e.target.value))}
                placeholder="e.g. 1"
                className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Description</label>
              <input
                type="text"
                value={audDesc}
                onChange={(e) => setAudDesc(e.target.value)}
                className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Transcript</label>
              <input
                type="text"
                value={audTranscript}
                onChange={(e) => setAudTranscript(e.target.value)}
                className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]">
              <Upload className="h-4 w-4" />
              <span>{uploading ? 'Uploading...' : 'Upload Audio (MP3/WAV)'}</span>
              <input
                type="file"
                accept=".mp3,.wav,audio/mpeg,audio/wav"
                onChange={handleUploadAudio}
                className="hidden"
              />
            </label>
          </div>

          <div className="divide-y divide-slate-800 border-t border-slate-800 pt-2">
            {audio.length === 0 ? (
              <p className="py-6 text-sm text-slate-400">No audio assets uploaded yet.</p>
            ) : (
              audio.map((a) => (
                <div key={a.id} className="py-4 space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-4 w-4 text-[#C9A45C]" />
                      <span className="text-sm font-medium text-white">{a.title}</span>
                      <span className="font-mono-tabular text-xs text-slate-500">
                        Chapter {a.chapter_number}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteId(a.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400"
                      aria-label={`Delete ${a.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <audio controls src={a.url} className="w-full h-9" />
                  {a.transcript && <p className="text-xs text-slate-400">Transcript: {a.transcript}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Evidence3DStudioModal
        open={Boolean(studioTarget)}
        target={studioTarget}
        onClose={() => setStudioTarget(null)}
        onSaved={() => {
          loadData();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteId)}
        title={`Delete ${mode === 'documents' ? 'Document' : 'Audio Asset'}`}
        description="This will permanently delete the file from storage. Are you sure?"
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
