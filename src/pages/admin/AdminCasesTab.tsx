import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Box, CheckCircle2, Eye, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { usePlatform } from '../../context/PlatformContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Evidence3DStudioModal, type StudioTargetAsset } from '../../components/Evidence3DStudioModal';
import { ImagePickerModal } from '../../components/ImagePickerModal';
import { parsePositiveInt, sanitizeDigitInput } from '../../shared/numericInput';
import type { CaseStatus, Model3DAsset, PreferredViewMode } from '../../shared/types';

type EditorStep =
  | 'metadata'
  | 'chapters'
  | 'evidence'
  | 'characters'
  | 'witnesses'
  | 'hints'
  | 'solution'
  | 'publish';

export function AdminCasesTab() {
  const { bootstrap, refreshBootstrap } = usePlatform();
  const [cases, setCases] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<any>(null);
  const [step, setStep] = useState<EditorStep>('metadata');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create new draft modal/form
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');

  // Picker & confirmation dialogs
  const [pickerTarget, setPickerTarget] = useState<null | 'cover' | 'thumb' | 'evidence' | 'character'>(null);
  const [studioTarget, setStudioTarget] = useState<StudioTargetAsset | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | { type: 'publish' | 'delete'; caseId: string; title: string }>(null);

  // Documents, Audio & 3D Studio lists for attaching to evidence
  const [docs, setDocs] = useState<any[]>([]);
  const [audioList, setAudioList] = useState<any[]>([]);
  const [models3d, setModels3d] = useState<Model3DAsset[]>([]);

  // Sub-entity forms
  const [chapNum, setChapNum] = useState('1');
  const [chapTitle, setChapTitle] = useState('');
  const [chapText, setChapText] = useState('');

  const [evCode, setEvCode] = useState('EV-01');
  const [evTitle, setEvTitle] = useState('');
  const [evType, setEvType] = useState('DOCUMENT');
  const [evDesc, setEvDesc] = useState('');
  const [evImg, setEvImg] = useState('');
  const [evDocId, setEvDocId] = useState('');
  const [evAudioId, setEvAudioId] = useState('');
  const [evModel3dId, setEvModel3dId] = useState('');
  const [evPreferredView, setEvPreferredView] = useState<PreferredViewMode>('STANDARD');
  const [evChapter, setEvChapter] = useState('1');
  const [evPrivateExp, setEvPrivateExp] = useState('');

  const [charName, setCharName] = useState('');
  const [charRole, setCharRole] = useState('');
  const [charPortrait, setCharPortrait] = useState('');
  const [charDesc, setCharDesc] = useState('');
  const [charBg, setCharBg] = useState('');
  const [charPrivate, setCharPrivate] = useState('');
  const [charPublic, setCharPublic] = useState(true);
  const [charModel3dId, setCharModel3dId] = useState('');
  const [charPreferredView, setCharPreferredView] = useState<PreferredViewMode>('STANDARD');

  const [witName, setWitName] = useState('');
  const [witRole, setWitRole] = useState('');
  const [witStatement, setWitStatement] = useState('');
  const [witChapter, setWitChapter] = useState('1');

  const [inqWitnessId, setInqWitnessId] = useState('');
  const [inqQuestion, setInqQuestion] = useState('');
  const [inqResponse, setInqResponse] = useState('');
  const [inqHint, setInqHint] = useState('');
  const [inqHiddenRule, setInqHiddenRule] = useState('');

  const [hintChapter, setHintChapter] = useState('1');
  const [hintOrder, setHintOrder] = useState('1');
  const [hintText, setHintText] = useState('');

  // Editable metadata & solution fields
  const [metaForm, setMetaForm] = useState<any>(null);
  const [minRankInput, setMinRankInput] = useState('1');
  const [tasksText, setTasksText] = useState('');
  const [criteriaText, setCriteriaText] = useState('');
  const [solForm, setSolForm] = useState<any>(null);

  const loadCases = async () => {
    try {
      const [cRes, dRes, aRes, mRes] = await Promise.all([
        apiFetch<{ cases: any[] }>('/api/admin/cases'),
        apiFetch<{ documents: any[] }>('/api/admin/documents'),
        apiFetch<{ audio: any[] }>('/api/admin/audio'),
        apiFetch<{ models: Model3DAsset[] }>('/api/admin/3d'),
      ]);
      setCases(cRes.cases);
      setDocs(dRes.documents);
      setAudioList(aRes.audio);
      setModels3d(mRes.models.filter((m) => m.status === 'READY'));
    } catch (err: any) {
      setError(err.message || 'Failed to load case management data.');
    }
  };

  const loadBundle = async (id: string) => {
    try {
      const res = await apiFetch<any>(`/api/admin/cases/${id}`);
      setBundle(res);
      setMetaForm({ ...res.caseData });
      setMinRankInput(String(res.caseData.min_rank_order ?? 1));
      setTasksText((res.caseData.player_tasks || []).join('\n'));
      setCriteriaText((res.caseData.evaluation_criteria || []).join('\n'));
      setSolForm({
        master_solution: res.solution?.master_solution || '',
        responsible_character: res.solution?.responsible_character || '',
        critical_clues_text: (res.solution?.critical_clues || []).join('\n'),
        red_herrings_text: (res.solution?.red_herrings || []).join('\n'),
        internal_notes: res.solution?.internal_notes || '',
      });
      if (res.witnesses?.length && !inqWitnessId) {
        setInqWitnessId(res.witnesses[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load case dossier.');
    }
  };

  useEffect(() => {
    loadCases();
  }, []);

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch<any>('/api/admin/cases', {
        method: 'POST',
        body: JSON.stringify({
          case_code: newCode,
          title: newTitle,
          institution_id: bootstrap?.institutions?.[0]?.id || 1,
          region_id: bootstrap?.regions?.[0]?.id || 1,
        }),
      });
      setNewCode('');
      setNewTitle('');
      setCreating(false);
      await loadCases();
      setSelectedId(res.caseData.id);
      await loadBundle(res.caseData.id);
      setStep('metadata');
    } catch (err: any) {
      setError(err.message || 'Could not create draft case.');
    }
  };

  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !metaForm) return;
    setError('');
    setSuccess('');
    const parsedMinRank = parsePositiveInt(minRankInput);
    if (!parsedMinRank) {
      setError('Min Rank Order must be a number of 1 or greater.');
      return;
    }
    try {
      const updated = await apiFetch<any>(`/api/admin/cases/${selectedId}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...metaForm,
          min_rank_order: parsedMinRank,
          player_tasks: tasksText.split('\n').map((s) => s.trim()).filter(Boolean),
          evaluation_criteria: criteriaText.split('\n').map((s) => s.trim()).filter(Boolean),
        }),
      });
      setBundle(updated);
      setMetaForm({ ...updated.caseData });
      setMinRankInput(String(updated.caseData.min_rank_order ?? parsedMinRank));
      await loadCases();
      setSuccess('Draft metadata saved.');
    } catch (err: any) {
      setError(err.message || 'Save failed.');
    }
  };

  const handleSaveSolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !solForm) return;
    setError('');
    setSuccess('');
    try {
      const updated = await apiFetch<any>(`/api/admin/cases/${selectedId}/solution`, {
        method: 'PUT',
        body: JSON.stringify({
          master_solution: solForm.master_solution,
          responsible_character: solForm.responsible_character,
          critical_clues: solForm.critical_clues_text.split('\n').map((s: string) => s.trim()).filter(Boolean),
          red_herrings: solForm.red_herrings_text.split('\n').map((s: string) => s.trim()).filter(Boolean),
          internal_notes: solForm.internal_notes,
          actual_timeline: [],
          evidence_explanations: [],
        }),
      });
      setBundle(updated);
      setSuccess('Confidential Master Solution saved.');
    } catch (err: any) {
      setError(err.message || 'Could not save master solution.');
    }
  };

  const handleStatusChange = async (caseId: string, status: CaseStatus) => {
    setError('');
    setSuccess('');
    try {
      const updated = await apiFetch<any>(`/api/admin/cases/${caseId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      setBundle(updated);
      await loadCases();
      await refreshBootstrap();
      setSuccess(`Case status updated to ${status}.`);
    } catch (err: any) {
      const details = err.details?.validationErrors?.join(' ') || '';
      setError(`${err.message} ${details}`);
    }
  };

  const handleDeleteCase = async (caseId: string) => {
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/api/admin/cases/${caseId}`, { method: 'DELETE' });
      setSelectedId(null);
      setBundle(null);
      await loadCases();
      await refreshBootstrap();
    } catch (err: any) {
      setError(err.message || 'Could not delete case.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold text-white">Case Management System</h2>
          <p className="text-sm text-slate-400">
            Create drafts, author chapters, attach evidence, define private solutions, validate, and publish.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]"
        >
          <Plus className="h-4 w-4" />
          <span>Create Draft Case</span>
        </button>
      </div>

      {!bundle && error && (
        <div role="alert" className="rounded-md border border-red-800 bg-red-950/50 px-4 py-3 text-xs text-red-200">
          {error}
        </div>
      )}
      {!bundle && success && (
        <div className="rounded-md border border-emerald-800 bg-emerald-950/50 px-4 py-3 text-xs text-emerald-200">
          {success}
        </div>
      )}

      {creating && (
        <form
          onSubmit={handleCreateDraft}
          className="rounded-lg border border-slate-700 bg-[#0B111E] p-6 grid gap-4 sm:grid-cols-3 items-end"
        >
          <div>
            <label className="block text-xs text-slate-300 mb-1">Case ID / Code</label>
            <input
              type="text"
              required
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="e.g. AP-DHK-001"
              className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white uppercase"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Case Title</label>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Enter case title..."
              className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]"
            >
              Create Draft
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-md border border-slate-700 px-4 py-2 text-xs text-slate-300"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Cases Table */}
      <div className="rounded-lg border border-slate-800 bg-[#0B111E] overflow-hidden">
        {cases.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            No cases created yet. Every new case defaults to DRAFT and remains hidden from players until published.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-[#070B13] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Case ID</th>
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Institution / Region</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {cases.map((c) => (
                  <tr key={c.id} className={selectedId === c.id ? 'bg-slate-900/60' : ''}>
                    <td className="px-5 py-3.5 font-mono-tabular text-[#C9A45C]">{c.case_code}</td>
                    <td className="px-5 py-3.5 font-medium text-white">{c.title}</td>
                    <td className="px-5 py-3.5 text-slate-300">
                      {c.institution_name} · {c.region_name}
                    </td>
                    <td className="px-5 py-3.5 font-mono-tabular text-slate-200">{c.status}</td>
                    <td className="px-5 py-3.5 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(c.id);
                          loadBundle(c.id);
                          setStep('metadata');
                        }}
                        className="rounded border border-slate-700 px-3 py-1 text-slate-200 hover:bg-slate-800"
                      >
                        Edit Dossier
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ type: 'delete', caseId: c.id, title: c.title })}
                        className="rounded border border-red-900 px-2.5 py-1 text-red-300 hover:bg-red-950"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Multi-Step Case Editor */}
      {bundle && metaForm && (
        <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <p className="font-mono-tabular text-xs text-[#C9A45C]">
                Editing {bundle.caseData.case_code} · Current Status: {bundle.caseData.status}
              </p>
              <h3 className="font-display text-2xl font-semibold text-white">{bundle.caseData.title}</h3>
            </div>
            <Link
              to={`/investigate/${bundle.caseData.id}`}
              className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Preview Investigation Room</span>
            </Link>
          </div>

          {/* Step Tabs */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'metadata', label: '1. Metadata & Tasks' },
              { id: 'chapters', label: `2. Chapters (${bundle.chapters.length})` },
              { id: 'evidence', label: `3. Evidence (${bundle.evidence.length})` },
              { id: 'characters', label: `4. Characters (${bundle.characters.length})` },
              { id: 'witnesses', label: `5. Witnesses & Q&A (${bundle.witnesses.length})` },
              { id: 'hints', label: `6. Hints (${bundle.hints.length})` },
              { id: 'solution', label: '7. Private Master Solution' },
              { id: 'publish', label: '8. Validate & Publish' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setStep(s.id as EditorStep);
                  setError('');
                  setSuccess('');
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  step === s.id
                    ? 'bg-[#C9A45C] text-[#070B13] font-semibold'
                    : 'border border-slate-800 bg-[#070B13] text-slate-300 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {error && (
            <div role="alert" className="rounded-md border border-red-800 bg-red-950/50 px-4 py-3 text-xs text-red-200">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md border border-emerald-800 bg-emerald-950/50 px-4 py-3 text-xs text-emerald-200">
              {success}
            </div>
          )}

          {/* Step 1: Metadata */}
          {step === 'metadata' && (
            <form onSubmit={handleSaveMetadata} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Case Code</label>
                  <input
                    type="text"
                    required
                    value={metaForm.case_code}
                    onChange={(e) => setMetaForm({ ...metaForm, case_code: e.target.value })}
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-300 mb-1">Title</label>
                  <input
                    type="text"
                    required
                    value={metaForm.title}
                    onChange={(e) => setMetaForm({ ...metaForm, title: e.target.value })}
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Estimated Duration</label>
                  <input
                    type="text"
                    value={metaForm.estimated_duration}
                    onChange={(e) => setMetaForm({ ...metaForm, estimated_duration: e.target.value })}
                    placeholder="e.g. 60 mins or 10"
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Institution</label>
                  <select
                    value={metaForm.institution_id}
                    onChange={(e) => setMetaForm({ ...metaForm, institution_id: Number(e.target.value) })}
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  >
                    {(bootstrap?.institutions || []).map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Bangladesh Division</label>
                  <select
                    value={metaForm.region_id}
                    onChange={(e) => setMetaForm({ ...metaForm, region_id: Number(e.target.value) })}
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  >
                    {(bootstrap?.regions || []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Difficulty</label>
                  <select
                    value={metaForm.difficulty}
                    onChange={(e) => setMetaForm({ ...metaForm, difficulty: e.target.value })}
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  >
                    <option value="STANDARD">Standard</option>
                    <option value="INTERMEDIATE">Intermediate</option>
                    <option value="ADVANCED">Advanced</option>
                    <option value="CLASSIFIED">Classified</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Cover / Crime Scene Image
                    {bundle.caseData.scene_3d_url && (
                      <span className="ml-2 rounded border border-[#C9A45C]/50 px-1.5 py-0.5 font-mono-tabular text-[10px] text-[#C9A45C]">
                        {bundle.caseData.scene_preferred_view === '3D' ? '3D SCENE DEFAULT' : '3D SCENE READY'}
                      </span>
                    )}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={metaForm.cover_image_url || ''}
                      onChange={(e) => setMetaForm({ ...metaForm, cover_image_url: e.target.value })}
                      placeholder="Select from Media Library..."
                      className="flex-1 min-w-[160px] rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setPickerTarget('cover')}
                      className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                    >
                      Browse / Upload
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setStudioTarget({
                          entityType: 'CASE_SCENE',
                          entityId: bundle.caseData.id,
                          title: `${bundle.caseData.title} — Crime Scene`,
                          subtitle: `Case ${bundle.caseData.case_code}`,
                          standardImageUrl: metaForm.cover_image_url || bundle.caseData.cover_image_url || null,
                          currentModelId: bundle.caseData.scene_3d_model_id,
                          currentModelUrl: bundle.caseData.scene_3d_url,
                          currentModelFormat: bundle.caseData.scene_3d_format,
                          currentPreferredView: bundle.caseData.scene_preferred_view,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded border border-[#C9A45C]/60 px-3 py-2 text-xs text-[#C9A45C] hover:bg-[#C9A45C]/10"
                    >
                      <Box className="h-3.5 w-3.5" />
                      <span>3D Studio</span>
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="case-min-rank-order" className="block text-xs text-slate-300 mb-1">
                    Min Rank Order
                  </label>
                  <input
                    id="case-min-rank-order"
                    type="text"
                    inputMode="numeric"
                    value={minRankInput}
                    onChange={(e) => setMinRankInput(sanitizeDigitInput(e.target.value))}
                    placeholder="e.g. 1"
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Short Description</label>
                <textarea
                  rows={2}
                  value={metaForm.short_description}
                  onChange={(e) => setMetaForm({ ...metaForm, short_description: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Full Case Story & Briefing</label>
                <textarea
                  rows={5}
                  value={metaForm.full_story}
                  onChange={(e) => setMetaForm({ ...metaForm, full_story: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Player Tasks (one per line)</label>
                  <textarea
                    rows={4}
                    value={tasksText}
                    onChange={(e) => setTasksText(e.target.value)}
                    placeholder="Identify forged document..."
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Evaluation Criteria (one per line)</label>
                  <textarea
                    rows={4}
                    value={criteriaText}
                    onChange={(e) => setCriteriaText(e.target.value)}
                    placeholder="Evidence citation accuracy..."
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="rounded-md bg-[#C9A45C] px-5 py-2 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]"
              >
                Save Draft Metadata
              </button>
            </form>
          )}

          {/* Step 2: Chapters */}
          {step === 'chapters' && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-4">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Chapter number"
                  value={chapNum}
                  onChange={(e) => setChapNum(sanitizeDigitInput(e.target.value))}
                  placeholder="Ch #"
                  className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
                <input
                  type="text"
                  value={chapTitle}
                  onChange={(e) => setChapTitle(e.target.value)}
                  placeholder="Chapter Title"
                  className="sm:col-span-3 rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
              </div>
              <textarea
                rows={3}
                value={chapText}
                onChange={(e) => setChapText(e.target.value)}
                placeholder="Chapter briefing text..."
                className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
              />
              <button
                type="button"
                onClick={async () => {
                  setError('');
                  setSuccess('');
                  const parsedChapNum = parsePositiveInt(chapNum);
                  if (!parsedChapNum) {
                    setError('Chapter number must be 1 or greater.');
                    return;
                  }
                  if (!chapTitle.trim() || !chapText.trim()) {
                    setError('Chapter title and briefing text are required.');
                    return;
                  }
                  try {
                    const res = await apiFetch(`/api/admin/cases/${selectedId}/chapters`, {
                      method: 'POST',
                      body: JSON.stringify({
                        chapter_number: parsedChapNum,
                        title: chapTitle.trim(),
                        briefing_text: chapText.trim(),
                      }),
                    });
                    setBundle(res);
                    setChapTitle('');
                    setChapText('');
                    setChapNum(String(parsedChapNum + 1));
                    setSuccess('Chapter added to dossier.');
                  } catch (err: any) {
                    setError(err.message || 'Could not add chapter.');
                  }
                }}
                className="rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13]"
              >
                Add Chapter
              </button>

              <div className="divide-y divide-slate-800 border-t border-slate-800 pt-2">
                {bundle.chapters.map((ch: any) => (
                  <div key={ch.id} className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <span className="font-mono-tabular text-xs text-[#C9A45C]">Chapter {ch.chapter_number}</span>
                      <p className="text-sm font-medium text-white">{ch.title}</p>
                      <p className="text-xs text-slate-400 mt-1">{ch.briefing_text}</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        setError('');
                        try {
                          const res = await apiFetch(`/api/admin/cases/${selectedId}/chapters/${ch.id}`, { method: 'DELETE' });
                          setBundle(res);
                        } catch (err: any) {
                          setError(err.message || 'Could not delete chapter.');
                        }
                      }}
                      className="p-1 text-slate-500 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Evidence */}
          {step === 'evidence' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <input
                  type="text"
                  value={evCode}
                  onChange={(e) => setEvCode(e.target.value)}
                  placeholder="Code (EV-01)"
                  className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
                <input
                  type="text"
                  value={evTitle}
                  onChange={(e) => setEvTitle(e.target.value)}
                  placeholder="Evidence Title"
                  className="sm:col-span-2 rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
                <select
                  value={evType}
                  onChange={(e) => setEvType(e.target.value)}
                  className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                >
                  <option value="DOCUMENT">Document</option>
                  <option value="PHOTOGRAPH">Photograph</option>
                  <option value="AUDIO">Audio</option>
                  <option value="PHYSICAL">Physical</option>
                  <option value="DIGITAL">Digital</option>
                  <option value="FORENSIC">Forensic</option>
                </select>
              </div>
              <textarea
                rows={2}
                value={evDesc}
                onChange={(e) => setEvDesc(e.target.value)}
                placeholder="Player-visible evidence description..."
                className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={evImg}
                    onChange={(e) => setEvImg(e.target.value)}
                    placeholder="Image URL (optional)"
                    className="flex-1 rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setPickerTarget('evidence')}
                    className="rounded border border-slate-700 px-2.5 py-2 text-xs text-slate-200"
                  >
                    Pick
                  </button>
                </div>
                <select
                  value={evDocId}
                  onChange={(e) => setEvDocId(e.target.value)}
                  className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
                >
                  <option value="">Attach Document (optional)</option>
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
                <select
                  value={evAudioId}
                  onChange={(e) => setEvAudioId(e.target.value)}
                  className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
                >
                  <option value="">Attach Audio (optional)</option>
                  {audioList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Evidence chapter number"
                  value={evChapter}
                  onChange={(e) => setEvChapter(sanitizeDigitInput(e.target.value))}
                  placeholder="Chapter #"
                  className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
                />
                <select
                  value={evModel3dId}
                  onChange={(e) => {
                    setEvModel3dId(e.target.value);
                    if (!e.target.value) setEvPreferredView('STANDARD');
                  }}
                  aria-label="Attach 3D model to evidence"
                  className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
                >
                  <option value="">Optional 3D Model (.GLB/.GLTF)</option>
                  {models3d.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} ({m.format})
                    </option>
                  ))}
                </select>
                <select
                  value={evPreferredView}
                  disabled={!evModel3dId}
                  onChange={(e) => setEvPreferredView(e.target.value as PreferredViewMode)}
                  aria-label="Default evidence presentation mode"
                  className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white disabled:opacity-45"
                >
                  <option value="STANDARD">Default: Standard View</option>
                  <option value="3D">Default: Realistic 3D View</option>
                </select>
                <input
                  type="text"
                  value={evPrivateExp}
                  onChange={(e) => setEvPrivateExp(e.target.value)}
                  placeholder="Private Admin Explanation (never sent to players)"
                  className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  setError('');
                  setSuccess('');
                  const parsedEvChapter = parsePositiveInt(evChapter);
                  if (!parsedEvChapter) {
                    setError('Evidence chapter number must be 1 or greater.');
                    return;
                  }
                  if (!evCode.trim() || !evTitle.trim()) {
                    setError('Evidence code and title are required.');
                    return;
                  }
                  try {
                    const res = await apiFetch(`/api/admin/cases/${selectedId}/evidence`, {
                      method: 'POST',
                      body: JSON.stringify({
                        evidence_code: evCode.trim(),
                        title: evTitle.trim(),
                        evidence_type: evType,
                        description: evDesc,
                        image_url: evImg || null,
                        document_id: evDocId || null,
                        audio_id: evAudioId || null,
                        model_3d_id: evModel3dId || null,
                        preferred_view: evModel3dId ? evPreferredView : 'STANDARD',
                        chapter_number: parsedEvChapter,
                        private_explanation: evPrivateExp,
                      }),
                    });
                    setBundle(res);
                    setEvTitle('');
                    setEvDesc('');
                    setEvImg('');
                    setEvModel3dId('');
                    setEvPreferredView('STANDARD');
                    setEvPrivateExp('');
                    setSuccess('Evidence item added to dossier.');
                  } catch (err: any) {
                    setError(err.message || 'Could not add evidence item.');
                  }
                }}
                className="rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13]"
              >
                Add Evidence Item
              </button>

              <div className="divide-y divide-slate-800 border-t border-slate-800 pt-2">
                {bundle.evidence.map((ev: any) => (
                  <div key={ev.id} className="py-3 flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono-tabular text-xs text-[#C9A45C]">
                          {ev.evidence_code} · {ev.evidence_type} · Ch {ev.chapter_number}
                        </span>
                        {ev.model_3d_url && (
                          <span className="inline-flex items-center gap-1 rounded border border-[#C9A45C]/50 bg-[#070B13] px-2 py-0.5 font-mono-tabular text-[10px] text-[#C9A45C]">
                            <Box className="h-3 w-3" />
                            <span>{ev.preferred_view === '3D' ? '3D DEFAULT' : '3D READY'}</span>
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-white">{ev.title}</p>
                      <p className="text-xs text-slate-400">{ev.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setStudioTarget({
                            entityType: 'EVIDENCE',
                            entityId: ev.id,
                            title: `${ev.evidence_code} — ${ev.title}`,
                            subtitle: `${ev.evidence_type} · Chapter ${ev.chapter_number}`,
                            standardImageUrl: ev.image_url || null,
                            currentModelId: ev.model_3d_id,
                            currentModelUrl: ev.model_3d_url,
                            currentModelFormat: ev.model_3d_format,
                            currentPreferredView: ev.preferred_view,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded border border-[#C9A45C]/50 px-2.5 py-1 text-xs text-[#C9A45C] hover:bg-[#C9A45C]/10"
                      >
                        <Box className="h-3.5 w-3.5" />
                        <span>3D Studio</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setError('');
                          try {
                            const res = await apiFetch(`/api/admin/cases/${selectedId}/evidence/${ev.id}`, { method: 'DELETE' });
                            setBundle(res);
                          } catch (err: any) {
                            setError(err.message || 'Could not delete evidence item.');
                          }
                        }}
                        className="p-1 text-slate-500 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Characters */}
          {step === 'characters' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  type="text"
                  value={charName}
                  onChange={(e) => setCharName(e.target.value)}
                  placeholder="Character Name"
                  className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
                <input
                  type="text"
                  value={charRole}
                  onChange={(e) => setCharRole(e.target.value)}
                  placeholder="Role (e.g. Harbor Supervisor)"
                  className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={charPortrait}
                    onChange={(e) => setCharPortrait(e.target.value)}
                    placeholder="Portrait URL"
                    className="flex-1 rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setPickerTarget('character')}
                    className="rounded border border-slate-700 px-2.5 py-2 text-xs text-slate-200"
                  >
                    Pick
                  </button>
                </div>
              </div>
              <textarea
                rows={2}
                value={charDesc}
                onChange={(e) => setCharDesc(e.target.value)}
                placeholder="Public description..."
                className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={charBg}
                  onChange={(e) => setCharBg(e.target.value)}
                  placeholder="Background notes..."
                  className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  value={charPrivate}
                  onChange={(e) => setCharPrivate(e.target.value)}
                  placeholder="Private Admin Info (hidden from players)"
                  className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={charModel3dId}
                  onChange={(e) => {
                    setCharModel3dId(e.target.value);
                    if (!e.target.value) setCharPreferredView('STANDARD');
                  }}
                  aria-label="Attach 3D model to character"
                  className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
                >
                  <option value="">Optional 3D Character Asset (.GLB/.GLTF)</option>
                  {models3d.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} ({m.format})
                    </option>
                  ))}
                </select>
                <select
                  value={charPreferredView}
                  disabled={!charModel3dId}
                  onChange={(e) => setCharPreferredView(e.target.value as PreferredViewMode)}
                  aria-label="Default character view mode"
                  className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white disabled:opacity-45"
                >
                  <option value="STANDARD">Default: Standard Portrait</option>
                  <option value="3D">Default: Realistic 3D Asset</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={charPublic} onChange={(e) => setCharPublic(e.target.checked)} />
                  <span>Visible in Public Character Profiles</span>
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    setError('');
                    setSuccess('');
                    if (!charName.trim() || !charRole.trim()) {
                      setError('Character name and role are required.');
                      return;
                    }
                    try {
                      const res = await apiFetch(`/api/admin/cases/${selectedId}/characters`, {
                        method: 'POST',
                        body: JSON.stringify({
                          name: charName.trim(),
                          role: charRole.trim(),
                          portrait_url: charPortrait || null,
                          description: charDesc,
                          background: charBg,
                          private_info: charPrivate,
                          model_3d_id: charModel3dId || null,
                          preferred_view: charModel3dId ? charPreferredView : 'STANDARD',
                          is_public: charPublic,
                        }),
                      });
                      setBundle(res);
                      setCharName('');
                      setCharRole('');
                      setCharDesc('');
                      setCharBg('');
                      setCharPrivate('');
                      setCharModel3dId('');
                      setCharPreferredView('STANDARD');
                      setSuccess('Character added to dossier.');
                    } catch (err: any) {
                      setError(err.message || 'Could not add character.');
                    }
                  }}
                  className="rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13]"
                >
                  Add Character
                </button>
              </div>
              <div className="divide-y divide-slate-800 border-t border-slate-800 pt-2">
                {bundle.characters.map((ch: any) => (
                  <div key={ch.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-white">
                          {ch.name} <span className="text-xs text-[#C9A45C]">· {ch.role}</span>
                        </p>
                        {ch.model_3d_url && (
                          <span className="inline-flex items-center gap-1 rounded border border-[#C9A45C]/50 bg-[#070B13] px-2 py-0.5 font-mono-tabular text-[10px] text-[#C9A45C]">
                            <Box className="h-3 w-3" />
                            <span>{ch.preferred_view === '3D' ? '3D DEFAULT' : '3D READY'}</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{ch.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setStudioTarget({
                            entityType: 'CHARACTER',
                            entityId: ch.id,
                            title: ch.name,
                            subtitle: ch.role,
                            standardImageUrl: ch.portrait_url || null,
                            currentModelId: ch.model_3d_id,
                            currentModelUrl: ch.model_3d_url,
                            currentModelFormat: ch.model_3d_format,
                            currentPreferredView: ch.preferred_view,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded border border-[#C9A45C]/50 px-2.5 py-1 text-xs text-[#C9A45C] hover:bg-[#C9A45C]/10"
                      >
                        <Box className="h-3.5 w-3.5" />
                        <span>3D Studio</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setError('');
                          try {
                            const res = await apiFetch(`/api/admin/cases/${selectedId}/characters/${ch.id}`, { method: 'DELETE' });
                            setBundle(res);
                          } catch (err: any) {
                            setError(err.message || 'Could not delete character.');
                          }
                        }}
                        className="p-1 text-slate-500 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Witnesses & Interrogations */}
          {step === 'witnesses' && (
            <div className="space-y-6">
              <div className="space-y-3 border-b border-slate-800 pb-6">
                <h4 className="text-sm font-semibold text-white">Add Witness & Statement</h4>
                <div className="grid gap-3 sm:grid-cols-3">
                  <input
                    type="text"
                    value={witName}
                    onChange={(e) => setWitName(e.target.value)}
                    placeholder="Witness Name"
                    className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  />
                  <input
                    type="text"
                    value={witRole}
                    onChange={(e) => setWitRole(e.target.value)}
                    placeholder="Witness Role"
                    className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Witness chapter number"
                    value={witChapter}
                    onChange={(e) => setWitChapter(sanitizeDigitInput(e.target.value))}
                    placeholder="Chapter #"
                    className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  />
                </div>
                <textarea
                  rows={2}
                  value={witStatement}
                  onChange={(e) => setWitStatement(e.target.value)}
                  placeholder="Initial witness statement..."
                  className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
                <button
                  type="button"
                  onClick={async () => {
                    setError('');
                    setSuccess('');
                    const parsedWitChapter = parsePositiveInt(witChapter);
                    if (!parsedWitChapter) {
                      setError('Witness chapter number must be 1 or greater.');
                      return;
                    }
                    if (!witName.trim() || !witStatement.trim()) {
                      setError('Witness name and initial statement are required.');
                      return;
                    }
                    try {
                      const res = await apiFetch(`/api/admin/cases/${selectedId}/witnesses`, {
                        method: 'POST',
                        body: JSON.stringify({
                          name: witName.trim(),
                          role: witRole.trim(),
                          statement_text: witStatement.trim(),
                          chapter_number: parsedWitChapter,
                        }),
                      });
                      setBundle(res);
                      setWitName('');
                      setWitRole('');
                      setWitStatement('');
                      if (res.witnesses?.[0]) setInqWitnessId(res.witnesses[0].id);
                      setSuccess('Witness added to dossier.');
                    } catch (err: any) {
                      setError(err.message || 'Could not add witness.');
                    }
                  }}
                  className="rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13]"
                >
                  Add Witness
                </button>
              </div>

              {bundle.witnesses.length > 0 && (
                <div className="space-y-3 border-b border-slate-800 pb-6">
                  <h4 className="text-sm font-semibold text-white">Add Interrogation Question</h4>
                  <select
                    value={inqWitnessId}
                    onChange={(e) => setInqWitnessId(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  >
                    {bundle.witnesses.map((w: any) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.role})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={inqQuestion}
                    onChange={(e) => setInqQuestion(e.target.value)}
                    placeholder="Player-selectable question..."
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  />
                  <textarea
                    rows={2}
                    value={inqResponse}
                    onChange={(e) => setInqResponse(e.target.value)}
                    placeholder="Witness response..."
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      value={inqHint}
                      onChange={(e) => setInqHint(e.target.value)}
                      placeholder="Follow-up observation (shown after asking)"
                      className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={inqHiddenRule}
                      onChange={(e) => setInqHiddenRule(e.target.value)}
                      placeholder="Hidden Evaluation Rule (admin only)"
                      className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      setError('');
                      setSuccess('');
                      if (!inqWitnessId || !inqQuestion.trim() || !inqResponse.trim()) {
                        setError('Witness, question, and response are required.');
                        return;
                      }
                      try {
                        const res = await apiFetch(`/api/admin/cases/${selectedId}/interrogations`, {
                          method: 'POST',
                          body: JSON.stringify({
                            witness_id: inqWitnessId,
                            question_text: inqQuestion.trim(),
                            response_text: inqResponse.trim(),
                            follow_up_hint: inqHint,
                            hidden_evaluation_rule: inqHiddenRule,
                          }),
                        });
                        setBundle(res);
                        setInqQuestion('');
                        setInqResponse('');
                        setInqHint('');
                        setInqHiddenRule('');
                        setSuccess('Interrogation question added.');
                      } catch (err: any) {
                        setError(err.message || 'Could not add interrogation question.');
                      }
                    }}
                    className="rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13]"
                  >
                    Add Interrogation Question
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {bundle.witnesses.map((w: any) => (
                  <div key={w.id} className="rounded border border-slate-800 bg-[#070B13] p-4 flex justify-between items-start">
                    <div>
                      <p className="text-sm font-semibold text-white">{w.name} ({w.role})</p>
                      <p className="text-xs text-slate-400 mt-1">{w.statement_text}</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        setError('');
                        try {
                          const res = await apiFetch(`/api/admin/cases/${selectedId}/witnesses/${w.id}`, { method: 'DELETE' });
                          setBundle(res);
                        } catch (err: any) {
                          setError(err.message || 'Could not delete witness.');
                        }
                      }}
                      className="p-1 text-slate-500 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 6: Hints */}
          {step === 'hints' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Hint chapter number"
                  value={hintChapter}
                  onChange={(e) => setHintChapter(sanitizeDigitInput(e.target.value))}
                  placeholder="Chapter"
                  className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Hint order number"
                  value={hintOrder}
                  onChange={(e) => setHintOrder(sanitizeDigitInput(e.target.value))}
                  placeholder="Order"
                  className="rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
                <input
                  type="text"
                  value={hintText}
                  onChange={(e) => setHintText(e.target.value)}
                  placeholder="Hint guidance text..."
                  className="sm:col-span-2 rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  setError('');
                  setSuccess('');
                  const parsedHintChapter = parsePositiveInt(hintChapter);
                  const parsedHintOrder = parsePositiveInt(hintOrder);
                  if (!parsedHintChapter || !parsedHintOrder) {
                    setError('Hint chapter and order numbers must be 1 or greater.');
                    return;
                  }
                  if (!hintText.trim()) {
                    setError('Hint text is required.');
                    return;
                  }
                  try {
                    const res = await apiFetch(`/api/admin/cases/${selectedId}/hints`, {
                      method: 'POST',
                      body: JSON.stringify({
                        chapter_number: parsedHintChapter,
                        hint_order: parsedHintOrder,
                        hint_text: hintText.trim(),
                      }),
                    });
                    setBundle(res);
                    setHintText('');
                    setHintOrder(String(parsedHintOrder + 1));
                    setSuccess('Hint added to dossier.');
                  } catch (err: any) {
                    setError(err.message || 'Could not add hint.');
                  }
                }}
                className="rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13]"
              >
                Add Hint
              </button>
              <div className="divide-y divide-slate-800 border-t border-slate-800 pt-2">
                {bundle.hints.map((h: any) => (
                  <div key={h.id} className="py-3 flex items-center justify-between">
                    <span className="text-xs text-slate-300">
                      Ch {h.chapter_number} (#{h.hint_order}): {h.hint_text}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        setError('');
                        try {
                          const res = await apiFetch(`/api/admin/cases/${selectedId}/hints/${h.id}`, { method: 'DELETE' });
                          setBundle(res);
                        } catch (err: any) {
                          setError(err.message || 'Could not delete hint.');
                        }
                      }}
                      className="p-1 text-slate-500 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 7: Private Master Solution */}
          {step === 'solution' && solForm && (
            <form onSubmit={handleSaveSolution} className="space-y-4">
              <div className="rounded border border-amber-800/60 bg-amber-950/20 p-3 text-xs text-amber-200">
                Strictly Confidential: Master solution data is stored server-side and is never exposed in public or player-facing API responses.
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Responsible Subject / Suspect</label>
                <input
                  type="text"
                  value={solForm.responsible_character}
                  onChange={(e) => setSolForm({ ...solForm, responsible_character: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Complete Master Solution</label>
                <textarea
                  rows={5}
                  value={solForm.master_solution}
                  onChange={(e) => setSolForm({ ...solForm, master_solution: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Critical Clues (one per line)</label>
                  <textarea
                    rows={3}
                    value={solForm.critical_clues_text}
                    onChange={(e) => setSolForm({ ...solForm, critical_clues_text: e.target.value })}
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Red Herrings (one per line)</label>
                  <textarea
                    rows={3}
                    value={solForm.red_herrings_text}
                    onChange={(e) => setSolForm({ ...solForm, red_herrings_text: e.target.value })}
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Internal Case Notes</label>
                <textarea
                  rows={2}
                  value={solForm.internal_notes}
                  onChange={(e) => setSolForm({ ...solForm, internal_notes: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-white"
                />
              </div>
              <button
                type="submit"
                className="rounded-md bg-[#C9A45C] px-5 py-2 text-xs font-semibold text-[#070B13]"
              >
                Save Private Master Solution
              </button>
            </form>
          )}

          {/* Step 8: Validation & Publishing */}
          {step === 'publish' && (
            <div className="space-y-6">
              <div className="rounded-lg border border-slate-800 bg-[#070B13] p-5 space-y-3">
                <div className="flex items-center gap-2">
                  {bundle.validation.valid ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-amber-400" />
                  )}
                  <h4 className="text-sm font-semibold text-white">
                    {bundle.validation.valid
                      ? 'All Publication Requirements Validated'
                      : 'Complete Required Fields Before Publishing'}
                  </h4>
                </div>
                {!bundle.validation.valid && (
                  <ul className="space-y-1 text-xs text-amber-300 list-disc pl-5">
                    {bundle.validation.errors.map((err: string, i: number) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleStatusChange(bundle.caseData.id, 'IN_REVIEW')}
                  className="rounded-md border border-slate-700 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  Mark In Review
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange(bundle.caseData.id, 'READY_TO_PUBLISH')}
                  className="rounded-md border border-slate-700 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  Mark Ready to Publish
                </button>
                {bundle.caseData.status !== 'PUBLISHED' ? (
                  <button
                    type="button"
                    disabled={!bundle.validation.valid}
                    onClick={() =>
                      setConfirmAction({
                        type: 'publish',
                        caseId: bundle.caseData.id,
                        title: bundle.caseData.title,
                      })
                    }
                    className="rounded-md bg-[#C9A45C] px-5 py-2 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774] disabled:opacity-40"
                  >
                    Publish Case
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(bundle.caseData.id, 'DRAFT')}
                    className="rounded-md border border-amber-700 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-950/40"
                  >
                    Unpublish (Return to Draft)
                  </button>
                )}

                {bundle.caseData.status !== 'ARCHIVED' ? (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(bundle.caseData.id, 'ARCHIVED')}
                    className="rounded-md border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    Archive Case
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(bundle.caseData.id, 'DRAFT')}
                    className="rounded-md border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    Restore to Draft
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <ImagePickerModal
        open={Boolean(pickerTarget)}
        defaultFolder={pickerTarget === 'evidence' ? 'evidence' : pickerTarget === 'character' ? 'characters' : 'cases'}
        onSelect={(url, asset) => {
          if (pickerTarget === 'cover' && metaForm) setMetaForm({ ...metaForm, cover_image_url: url });
          if (pickerTarget === 'evidence') {
            setEvImg(url);
            if (asset?.model_3d_id) {
              setEvModel3dId(asset.model_3d_id);
              setEvPreferredView(asset.preferred_view || '3D');
            }
          }
          if (pickerTarget === 'character') {
            setCharPortrait(url);
            if (asset?.model_3d_id) {
              setCharModel3dId(asset.model_3d_id);
              setCharPreferredView(asset.preferred_view || '3D');
            }
          }
          setPickerTarget(null);
        }}
        onClose={() => setPickerTarget(null)}
      />

      <Evidence3DStudioModal
        open={Boolean(studioTarget)}
        target={studioTarget}
        onClose={() => setStudioTarget(null)}
        onSaved={() => {
          if (selectedId) loadBundle(selectedId);
          loadCases();
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.type === 'publish' ? 'Publish Investigation Case' : 'Delete Case'}
        description={
          confirmAction?.type === 'publish'
            ? `Publishing "${confirmAction.title}" makes it visible to eligible investigators in the Case Library and Player Dashboard. Proceed?`
            : `Permanently delete "${confirmAction?.title}" and all attached chapters, evidence, and reports?`
        }
        confirmLabel={confirmAction?.type === 'publish' ? 'Publish Now' : 'Delete Case'}
        destructive={confirmAction?.type === 'delete'}
        onConfirm={async () => {
          if (!confirmAction) return;
          if (confirmAction.type === 'publish') {
            await handleStatusChange(confirmAction.caseId, 'PUBLISHED');
          } else {
            await handleDeleteCase(confirmAction.caseId);
          }
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
