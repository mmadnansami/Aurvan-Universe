import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Box,
  FileText,
  GitBranch,
  HelpCircle,
  Image as ImageIcon,
  MessageSquare,
  NotebookPen,
  Send,
  Trash2,
  Users,
  Volume2,
  Clock,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getFirestoreDocumentData } from '../lib/firebaseBackend';
import { usePlatform } from '../context/PlatformContext';
import { Model3DViewer } from '../components/Model3DViewer';

type RoomTab =
  | 'briefing'
  | 'evidence'
  | 'characters'
  | 'witnesses'
  | 'notebook'
  | 'timeline'
  | 'board'
  | 'hints'
  | 'report';

export function InvestigationRoomPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const { user } = usePlatform();

  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<RoomTab>('briefing');

  // Lightbox, Document preview & 3D View toggles
  const [zoomImage, setZoomImage] = useState<{ url: string; title: string } | null>(null);
  const [docPreview, setDocPreview] = useState<{ title: string; text: string } | null>(null);
  const [sceneView, setSceneView] = useState<'STANDARD' | '3D'>('STANDARD');
  const [evidenceViews, setEvidenceViews] = useState<Record<string, 'STANDARD' | '3D'>>({});
  const [charViews, setCharViews] = useState<Record<string, 'STANDARD' | '3D'>>({});
  const [doc3dModal, setDoc3dModal] = useState<{ title: string; url: string; format: 'GLB' | 'GLTF' } | null>(null);

  // Notebook state
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSavedMsg, setNoteSavedMsg] = useState('');

  // Timeline state
  const [timeInput, setTimeInput] = useState('');
  const [eventTitleInput, setEventTitleInput] = useState('');
  const [eventNotesInput, setEventNotesInput] = useState('');

  // Evidence Connection Board state
  const [sourceEvId, setSourceEvId] = useState('');
  const [targetEvId, setTargetEvId] = useState('');
  const [connNote, setConnNote] = useState('');

  // Final Report state
  const [suspect, setSuspect] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [selectedEvRefs, setSelectedEvRefs] = useState<string[]>([]);
  const [timelineSummary, setTimelineSummary] = useState('');
  const [reportMsg, setReportMsg] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  const loadRoom = async () => {
    if (!caseId) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(`/api/player/cases/${caseId}/room`);
      setRoom(data);
      setNoteText(data.note || '');
      setSceneView(
        data.dossier?.scene_3d_url && data.dossier?.scene_preferred_view === '3D' ? '3D' : 'STANDARD'
      );
      const nextEvViews: Record<string, 'STANDARD' | '3D'> = {};
      for (const ev of data.evidence || []) {
        nextEvViews[ev.id] = ev.model_3d_url && ev.preferred_view === '3D' ? '3D' : 'STANDARD';
      }
      setEvidenceViews(nextEvViews);
      const nextCharViews: Record<string, 'STANDARD' | '3D'> = {};
      for (const ch of data.characters || []) {
        nextCharViews[ch.id] = ch.model_3d_url && ch.preferred_view === '3D' ? '3D' : 'STANDARD';
      }
      setCharViews(nextCharViews);
      if (data.evidence?.length >= 2) {
        setSourceEvId((prev) => prev || data.evidence[0].id);
        setTargetEvId((prev) => prev || data.evidence[1].id);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load investigation room.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && caseId) {
      loadRoom();
    }
  }, [user, caseId]);

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const handleSaveNotes = async () => {
    if (!caseId) return;
    setNoteSaving(true);
    setNoteSavedMsg('');
    try {
      await apiFetch(`/api/player/cases/${caseId}/notes`, {
        method: 'PUT',
        body: JSON.stringify({ content: noteText }),
      });
      setNoteSavedMsg('Saved to secure dossier.');
    } finally {
      setNoteSaving(false);
    }
  };

  const handleAddTimeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId) return;
    const res = await apiFetch<{ item: any }>(`/api/player/cases/${caseId}/timeline`, {
      method: 'POST',
      body: JSON.stringify({
        event_time: timeInput,
        event_title: eventTitleInput,
        event_notes: eventNotesInput,
      }),
    });
    setRoom((prev: any) => ({ ...prev, timeline: [...prev.timeline, res.item] }));
    setTimeInput('');
    setEventTitleInput('');
    setEventNotesInput('');
  };

  const handleDeleteTimeline = async (itemId: string) => {
    if (!caseId) return;
    await apiFetch(`/api/player/cases/${caseId}/timeline/${itemId}`, { method: 'DELETE' });
    setRoom((prev: any) => ({
      ...prev,
      timeline: prev.timeline.filter((t: any) => t.id !== itemId),
    }));
  };

  const handleAddConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId) return;
    const res = await apiFetch<{ connection: any }>(`/api/player/cases/${caseId}/connections`, {
      method: 'POST',
      body: JSON.stringify({
        source_evidence_id: sourceEvId,
        target_evidence_id: targetEvId,
        connection_note: connNote,
      }),
    });
    setRoom((prev: any) => ({ ...prev, connections: [...prev.connections, res.connection] }));
    setConnNote('');
  };

  const handleDeleteConnection = async (connId: string) => {
    if (!caseId) return;
    await apiFetch(`/api/player/cases/${caseId}/connections/${connId}`, { method: 'DELETE' });
    setRoom((prev: any) => ({
      ...prev,
      connections: prev.connections.filter((c: any) => c.id !== connId),
    }));
  };

  const handleAskQuestion = async (questionId: string) => {
    if (!caseId) return;
    const res = await apiFetch<{ id: string; response_text: string; follow_up_hint: string }>(
      `/api/player/cases/${caseId}/interrogations/${questionId}/ask`,
      { method: 'POST' }
    );
    setRoom((prev: any) => ({
      ...prev,
      questions: prev.questions.map((q: any) =>
        q.id === questionId
          ? { ...q, asked: true, response_text: res.response_text, follow_up_hint: res.follow_up_hint }
          : q
      ),
    }));
  };

  const handleUnlockHint = async (hintId: string) => {
    if (!caseId) return;
    const res = await apiFetch<{ hint_text: string }>(
      `/api/player/cases/${caseId}/hints/${hintId}/unlock`,
      { method: 'POST' }
    );
    setRoom((prev: any) => ({
      ...prev,
      hints: prev.hints.map((h: any) =>
        h.id === hintId ? { ...h, unlocked: true, hint_text: res.hint_text } : h
      ),
    }));
  };

  const handleOpenDocument = async (docId: string, title: string, mime: string) => {
    try {
      const docData = await getFirestoreDocumentData(docId);
      if ((mime === 'text/plain' || docData.mimeType === 'text/plain') && docData.textContent !== null) {
        setDocPreview({ title, text: docData.textContent });
      } else {
        const link = document.createElement('a');
        link.href = docData.dataUrl;
        link.download = docData.fileName || title;
        link.click();
      }
    } catch (err: any) {
      setError(err.message || 'Unable to open document.');
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId) return;
    setSubmittingReport(true);
    setReportMsg('');
    try {
      const res = await apiFetch<{ report: any }>(`/api/player/cases/${caseId}/report`, {
        method: 'POST',
        body: JSON.stringify({
          suspect_identified: suspect,
          reasoning_text: reasoning,
          evidence_references: selectedEvRefs,
          timeline_summary: timelineSummary,
        }),
      });
      setRoom((prev: any) => ({ ...prev, reports: [res.report, ...(prev.reports || [])] }));
      setReportMsg('Investigation report submitted for Directorate evaluation.');
    } catch (err: any) {
      setReportMsg(err.message || 'Submission failed.');
    } finally {
      setSubmittingReport(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#070B13] py-20 text-center text-sm text-slate-400">
        Loading dynamic Investigation Room...
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="bg-[#070B13] py-20 px-4">
        <div className="mx-auto max-w-lg rounded-lg border border-red-900 bg-[#0B111E] p-8 text-center space-y-4">
          <h1 className="font-display text-3xl font-semibold text-white">Access Restricted</h1>
          <p className="text-sm text-red-300">{error || 'Case dossier unavailable.'}</p>
          <Link
            to="/cases"
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-4 py-2 text-xs text-slate-200 hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Case Library</span>
          </Link>
        </div>
      </div>
    );
  }

  const { dossier, chapters, evidence, characters, witnesses, questions, hints, timeline, connections, reports } = room;

  return (
    <div className="bg-[#070B13] min-h-screen py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Dossier Header */}
        <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Dashboard</span>
            </Link>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular text-slate-400">
              <span className="text-[#C9A45C]">{dossier.case_code}</span>
              <span>·</span>
              <span>{dossier.institution_name}</span>
              <span>·</span>
              <span>{dossier.region_name}</span>
              <span>·</span>
              <span>{dossier.difficulty}</span>
            </div>
          </div>

          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white">
            {dossier.title}
          </h1>
          <p className="text-sm text-slate-300 max-w-3xl">{dossier.short_description}</p>
        </div>

        {/* Workspace Navigation Bar */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          {[
            { id: 'briefing', label: 'Briefing & Chapters', icon: BookOpen },
            { id: 'evidence', label: `Evidence (${evidence.length})`, icon: ImageIcon },
            { id: 'characters', label: `Characters (${characters.length})`, icon: Users },
            { id: 'witnesses', label: `Witnesses & Interrogation`, icon: MessageSquare },
            { id: 'notebook', label: 'Detective Notebook', icon: NotebookPen },
            { id: 'timeline', label: `Timeline (${timeline.length})`, icon: Clock },
            { id: 'board', label: `Connection Board (${connections.length})`, icon: GitBranch },
            { id: 'hints', label: `Hints (${hints.length})`, icon: HelpCircle },
            { id: 'report', label: 'Final Report', icon: Send },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as RoomTab)}
                className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                  tab === item.id
                    ? 'bg-[#C9A45C] text-[#070B13] font-semibold'
                    : 'border border-slate-800 bg-[#0B111E] text-slate-300 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* 1. CASE BRIEFING & CHAPTERS */}
        {tab === 'briefing' && (
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-8 space-y-6">
              {(dossier.cover_image_url || dossier.scene_3d_url) && (
                <div className="space-y-2">
                  {dossier.scene_3d_url && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular text-[11px] text-[#C9A45C]">
                        CRIME SCENE VISUALIZATION
                      </span>
                      <div className="inline-flex rounded border border-slate-800 bg-[#0B111E] p-0.5">
                        <button
                          type="button"
                          onClick={() => setSceneView('STANDARD')}
                          className={`rounded px-2.5 py-1 text-[11px] ${
                            sceneView === 'STANDARD'
                              ? 'bg-[#C9A45C] text-[#070B13] font-semibold'
                              : 'text-slate-300'
                          }`}
                        >
                          Standard View
                        </button>
                        <button
                          type="button"
                          onClick={() => setSceneView('3D')}
                          className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] ${
                            sceneView === '3D'
                              ? 'bg-[#C9A45C] text-[#070B13] font-semibold'
                              : 'text-slate-300'
                          }`}
                        >
                          <Box className="h-3 w-3" />
                          <span>3D Scene</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {sceneView === '3D' && dossier.scene_3d_url ? (
                    <Model3DViewer
                      modelUrl={dossier.scene_3d_url}
                      title={`${dossier.title} — Crime Scene`}
                      format={dossier.scene_3d_format || 'GLB'}
                      heightClass="h-[340px] sm:h-[400px]"
                      onFallbackToStandard={() => setSceneView('STANDARD')}
                    />
                  ) : dossier.cover_image_url ? (
                    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900 aspect-video">
                      <img
                        src={dossier.cover_image_url}
                        alt={dossier.title}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : null}
                </div>
              )}

              <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-3">
                <h2 className="font-display text-2xl font-semibold text-white">Case Dossier Narrative</h2>
                <div className="text-sm leading-relaxed text-slate-300 whitespace-pre-line">
                  {dossier.full_story}
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="font-display text-2xl font-semibold text-white">Investigation Chapters</h2>
                {chapters.map((ch: any) => (
                  <div key={ch.id} className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-2">
                    <p className="font-mono-tabular text-xs text-[#C9A45C]">
                      Chapter {ch.chapter_number}
                    </p>
                    <h3 className="text-lg font-semibold text-white">{ch.title}</h3>
                    <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-line">
                      {ch.briefing_text}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
                  Investigator Objectives
                </h3>
                <ul className="space-y-2 text-sm text-slate-300 list-disc pl-5">
                  {(dossier.player_tasks || []).map((t: string, i: number) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Evaluation Criteria
                </h3>
                <ul className="space-y-2 text-sm text-slate-300 list-disc pl-5">
                  {(dossier.evaluation_criteria || []).map((c: string, i: number) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 2, 3, 4, 5. EVIDENCE ARCHIVE (IMAGES, DOCUMENTS, AUDIO) */}
        {tab === 'evidence' && (
          <div className="grid gap-6 md:grid-cols-2">
            {evidence.map((ev: any) => (
              <div key={ev.id} className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
                <div className="flex items-center justify-between text-xs font-mono-tabular">
                  <span className="text-[#C9A45C]">{ev.evidence_code}</span>
                  <span className="text-slate-400">
                    {ev.evidence_type} · Chapter {ev.chapter_number}
                  </span>
                </div>
                <h3 className="font-display text-2xl font-semibold text-white">{ev.title}</h3>
                <p className="text-sm leading-relaxed text-slate-300">{ev.description}</p>

                {(ev.image_url || ev.model_3d_url) && (
                  <div className="space-y-2">
                    {ev.model_3d_url && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 font-mono-tabular text-[11px] text-[#C9A45C]">
                          <Box className="h-3.5 w-3.5" />
                          <span>3D EXHIBIT AVAILABLE</span>
                        </span>
                        <div className="inline-flex rounded border border-slate-800 bg-[#070B13] p-0.5">
                          <button
                            type="button"
                            onClick={() => setEvidenceViews((prev) => ({ ...prev, [ev.id]: 'STANDARD' }))}
                            className={`rounded px-2.5 py-1 text-[11px] ${
                              (evidenceViews[ev.id] || 'STANDARD') === 'STANDARD'
                                ? 'bg-[#C9A45C] text-[#070B13] font-semibold'
                                : 'text-slate-300'
                            }`}
                          >
                            Standard
                          </button>
                          <button
                            type="button"
                            onClick={() => setEvidenceViews((prev) => ({ ...prev, [ev.id]: '3D' }))}
                            className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] ${
                              evidenceViews[ev.id] === '3D'
                                ? 'bg-[#C9A45C] text-[#070B13] font-semibold'
                                : 'text-slate-300'
                            }`}
                          >
                            <Box className="h-3 w-3" />
                            <span>3D View</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {evidenceViews[ev.id] === '3D' && ev.model_3d_url ? (
                      <Model3DViewer
                        modelUrl={ev.model_3d_url}
                        title={ev.title}
                        format={ev.model_3d_format || 'GLB'}
                        heightClass="h-[300px]"
                        onFallbackToStandard={() =>
                          setEvidenceViews((prev) => ({ ...prev, [ev.id]: 'STANDARD' }))
                        }
                      />
                    ) : ev.image_url ? (
                      <button
                        type="button"
                        onClick={() => setZoomImage({ url: ev.image_url, title: ev.title })}
                        className="group relative block w-full overflow-hidden rounded-md border border-slate-800 bg-slate-900"
                      >
                        <img
                          src={ev.image_url}
                          alt={ev.title}
                          referrerPolicy="no-referrer"
                          className="h-52 w-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <span className="absolute bottom-2 right-2 rounded bg-black/80 px-2.5 py-1 text-[11px] text-white">
                          Inspect Full Image
                        </span>
                      </button>
                    ) : null}
                  </div>
                )}

                {ev.document_id && (
                  <div className="rounded-md border border-slate-800 bg-[#070B13] p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="h-4 w-4 text-[#C9A45C] shrink-0" />
                      <span className="truncate text-xs font-medium text-slate-200">
                        {ev.document_title || 'Case Document'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {ev.doc_model_3d_url && (
                        <button
                          type="button"
                          onClick={() =>
                            setDoc3dModal({
                              title: ev.document_title || '3D Document Exhibit',
                              url: ev.doc_model_3d_url,
                              format: ev.doc_model_3d_format || 'GLB',
                            })
                          }
                          className="inline-flex items-center gap-1 rounded border border-[#C9A45C]/60 px-2.5 py-1.5 text-xs text-[#C9A45C] hover:bg-[#C9A45C]/10"
                        >
                          <Box className="h-3.5 w-3.5" />
                          <span>3D Exhibit</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenDocument(ev.document_id, ev.document_title || 'document', ev.document_mime || '')
                        }
                        className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                      >
                        Open Document
                      </button>
                    </div>
                  </div>
                )}

                {ev.audio_url && (
                  <div className="rounded-md border border-slate-800 bg-[#070B13] p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-[#C9A45C]">
                      <Volume2 className="h-4 w-4" />
                      <span>{ev.audio_title || 'Audio Intercept'}</span>
                    </div>
                    <audio controls src={ev.audio_url} className="w-full h-9" />
                    {ev.audio_transcript && (
                      <details className="text-xs text-slate-400">
                        <summary className="cursor-pointer text-slate-300 hover:text-white">
                          View Audio Transcript
                        </summary>
                        <p className="mt-2 whitespace-pre-line leading-relaxed text-slate-300">
                          {ev.audio_transcript}
                        </p>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 6. CHARACTER PROFILES */}
        {tab === 'characters' && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {characters.length === 0 ? (
              <p className="text-sm text-slate-400">No public character profiles attached to this case.</p>
            ) : (
              characters.map((ch: any) => (
                <div key={ch.id} className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
                  {ch.model_3d_url && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular text-[10px] text-[#C9A45C]">3D CHARACTER ASSET</span>
                      <div className="inline-flex rounded border border-slate-800 bg-[#070B13] p-0.5">
                        <button
                          type="button"
                          onClick={() => setCharViews((prev) => ({ ...prev, [ch.id]: 'STANDARD' }))}
                          className={`rounded px-2 py-0.5 text-[11px] ${
                            (charViews[ch.id] || 'STANDARD') === 'STANDARD'
                              ? 'bg-[#C9A45C] text-[#070B13] font-semibold'
                              : 'text-slate-300'
                          }`}
                        >
                          Portrait
                        </button>
                        <button
                          type="button"
                          onClick={() => setCharViews((prev) => ({ ...prev, [ch.id]: '3D' }))}
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] ${
                            charViews[ch.id] === '3D'
                              ? 'bg-[#C9A45C] text-[#070B13] font-semibold'
                              : 'text-slate-300'
                          }`}
                        >
                          <Box className="h-3 w-3" />
                          <span>3D</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {charViews[ch.id] === '3D' && ch.model_3d_url ? (
                    <Model3DViewer
                      modelUrl={ch.model_3d_url}
                      title={ch.name}
                      format={ch.model_3d_format || 'GLB'}
                      heightClass="h-[240px]"
                      onFallbackToStandard={() =>
                        setCharViews((prev) => ({ ...prev, [ch.id]: 'STANDARD' }))
                      }
                    />
                  ) : (
                    <div className="flex items-center gap-4">
                      {ch.portrait_url ? (
                        <img
                          src={ch.portrait_url}
                          alt={ch.name}
                          referrerPolicy="no-referrer"
                          className="h-16 w-16 rounded-md object-cover border border-slate-700"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-md border border-slate-700 bg-[#070B13] flex items-center justify-center text-slate-500 text-xs">
                          No Photo
                        </div>
                      )}
                      <div>
                        <h3 className="font-display text-2xl font-semibold text-white">{ch.name}</h3>
                        <p className="text-xs text-[#C9A45C]">{ch.role}</p>
                      </div>
                    </div>
                  )}
                  {charViews[ch.id] === '3D' && (
                    <div>
                      <h3 className="font-display text-2xl font-semibold text-white">{ch.name}</h3>
                      <p className="text-xs text-[#C9A45C]">{ch.role}</p>
                    </div>
                  )}
                  <p className="text-sm text-slate-300 leading-relaxed">{ch.description}</p>
                  {ch.background && (
                    <p className="text-xs text-slate-400 leading-relaxed border-t border-slate-800 pt-3">
                      {ch.background}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* 7 & 8. WITNESS STATEMENTS & INTERROGATION QUESTIONS */}
        {tab === 'witnesses' && (
          <div className="space-y-6">
            {witnesses.length === 0 ? (
              <p className="text-sm text-slate-400">No witness records listed for this investigation.</p>
            ) : (
              witnesses.map((w: any) => {
                const wQuestions = questions.filter((q: any) => q.witness_id === w.id);
                return (
                  <div key={w.id} className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                      <div>
                        <h3 className="font-display text-2xl font-semibold text-white">{w.name}</h3>
                        <p className="text-xs text-[#C9A45C]">
                          {w.role} · Chapter {w.chapter_number}
                        </p>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                        Official Statement
                      </h4>
                      <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-line">
                        {w.statement_text}
                      </p>
                    </div>

                    {wQuestions.length > 0 && (
                      <div className="space-y-3 border-t border-slate-800 pt-4">
                        <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                          Interrogation Questions
                        </h4>
                        {wQuestions.map((q: any) => (
                          <div key={q.id} className="rounded-md border border-slate-800 bg-[#070B13] p-4 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <p className="text-sm font-medium text-white">{q.question_text}</p>
                              {!q.asked && (
                                <button
                                  type="button"
                                  onClick={() => handleAskQuestion(q.id)}
                                  className="rounded bg-[#C9A45C] px-3 py-1.5 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774] whitespace-nowrap"
                                >
                                  Ask Question
                                </button>
                              )}
                            </div>
                            {q.asked && (
                              <div className="border-t border-slate-800 pt-2 space-y-1">
                                <p className="text-sm text-slate-300">“{q.response_text}”</p>
                                {q.follow_up_hint && (
                                  <p className="text-xs text-[#C9A45C]">Observation: {q.follow_up_hint}</p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 9. DETECTIVE NOTEBOOK */}
        {tab === 'notebook' && (
          <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl font-semibold text-white">Private Detective Notebook</h2>
                <p className="text-xs text-slate-400">Only visible to your account.</p>
              </div>
              <button
                type="button"
                disabled={noteSaving}
                onClick={handleSaveNotes}
                className="rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]"
              >
                {noteSaving ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
            {noteSavedMsg && <p className="text-xs text-emerald-400">{noteSavedMsg}</p>}
            <textarea
              rows={14}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Record observations, anomalies, alibi gaps, and deductions..."
              className="w-full rounded-md border border-slate-700 bg-[#070B13] p-4 text-sm text-slate-200 placeholder-slate-500 focus:border-[#C9A45C] focus:outline-none"
            />
          </div>
        )}

        {/* 10. TIMELINE RECONSTRUCTION */}
        {tab === 'timeline' && (
          <div className="grid gap-6 lg:grid-cols-12">
            <form
              onSubmit={handleAddTimeline}
              className="lg:col-span-4 rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4 h-fit"
            >
              <h2 className="font-display text-2xl font-semibold text-white">Add Timeline Event</h2>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Timestamp / Marker</label>
                <input
                  type="text"
                  required
                  value={timeInput}
                  onChange={(e) => setTimeInput(e.target.value)}
                  placeholder="e.g. 02:14 AM, Nov 12"
                  className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Event Summary</label>
                <input
                  type="text"
                  required
                  value={eventTitleInput}
                  onChange={(e) => setEventTitleInput(e.target.value)}
                  placeholder="e.g. Gate log discrepancy"
                  className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Analytical Notes</label>
                <textarea
                  rows={3}
                  value={eventNotesInput}
                  onChange={(e) => setEventNotesInput(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-[#C9A45C] py-2 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]"
              >
                Add to Timeline
              </button>
            </form>

            <div className="lg:col-span-8 rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
              <h2 className="font-display text-2xl font-semibold text-white">Reconstructed Sequence</h2>
              {timeline.length === 0 ? (
                <p className="text-sm text-slate-400">No timeline entries added yet.</p>
              ) : (
                <div className="divide-y divide-slate-800">
                  {timeline.map((item: any) => (
                    <div key={item.id} className="py-3 flex items-start justify-between gap-4">
                      <div>
                        <span className="font-mono-tabular text-xs text-[#C9A45C]">{item.event_time}</span>
                        <h3 className="text-sm font-semibold text-white">{item.event_title}</h3>
                        {item.event_notes && <p className="text-xs text-slate-400 mt-1">{item.event_notes}</p>}
                      </div>
                      <button
                        type="button"
                        aria-label={`Delete timeline event ${item.event_title}`}
                        onClick={() => handleDeleteTimeline(item.id)}
                        className="p-1.5 text-slate-500 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 11. EVIDENCE CONNECTION BOARD */}
        {tab === 'board' && (
          <div className="grid gap-6 lg:grid-cols-12">
            <form
              onSubmit={handleAddConnection}
              className="lg:col-span-4 rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4 h-fit"
            >
              <h2 className="font-display text-2xl font-semibold text-white">Link Evidence Items</h2>
              <div>
                <label className="block text-xs text-slate-300 mb-1">First Evidence</label>
                <select
                  value={sourceEvId}
                  onChange={(e) => setSourceEvId(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                >
                  {evidence.map((ev: any) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.evidence_code} — {ev.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Connected Evidence</label>
                <select
                  value={targetEvId}
                  onChange={(e) => setTargetEvId(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                >
                  {evidence.map((ev: any) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.evidence_code} — {ev.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Analytical Link Note</label>
                <textarea
                  rows={3}
                  required
                  value={connNote}
                  onChange={(e) => setConnNote(e.target.value)}
                  placeholder="Explain why these two items connect..."
                  className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-[#C9A45C] py-2 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]"
              >
                Create Connection
              </button>
            </form>

            <div className="lg:col-span-8 rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
              <h2 className="font-display text-2xl font-semibold text-white">Evidence Connection Board</h2>
              {connections.length === 0 ? (
                <p className="text-sm text-slate-400">No evidence links mapped yet.</p>
              ) : (
                <div className="space-y-3">
                  {connections.map((conn: any) => {
                    const a = evidence.find((e: any) => e.id === conn.source_evidence_id);
                    const b = evidence.find((e: any) => e.id === conn.target_evidence_id);
                    return (
                      <div
                        key={conn.id}
                        className="rounded-md border border-slate-800 bg-[#070B13] p-4 flex items-start justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <p className="text-xs font-mono-tabular text-[#C9A45C]">
                            {a?.evidence_code} ↔ {b?.evidence_code}
                          </p>
                          <p className="text-sm font-medium text-white">
                            {a?.title} ↔ {b?.title}
                          </p>
                          <p className="text-xs text-slate-300">{conn.connection_note}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteConnection(conn.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400"
                          aria-label="Remove connection"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 12. HINT SYSTEM */}
        {tab === 'hints' && (
          <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
            <h2 className="font-display text-2xl font-semibold text-white">Investigative Hints</h2>
            {hints.length === 0 ? (
              <p className="text-sm text-slate-400">No hints configured for this case.</p>
            ) : (
              <div className="space-y-3">
                {hints.map((h: any) => (
                  <div key={h.id} className="rounded-md border border-slate-800 bg-[#070B13] p-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-mono-tabular text-xs text-slate-400">
                        Chapter {h.chapter_number} · Hint #{h.hint_order}
                      </span>
                      {!h.unlocked && (
                        <button
                          type="button"
                          onClick={() => handleUnlockHint(h.id)}
                          className="rounded border border-[#C9A45C]/60 px-3 py-1.5 text-xs font-medium text-[#C9A45C] hover:bg-[#C9A45C]/10"
                        >
                          Unlock Hint
                        </button>
                      )}
                    </div>
                    {h.unlocked && (
                      <p className="mt-2 text-sm text-slate-200">{h.hint_text}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 13. FINAL INVESTIGATION REPORT */}
        {tab === 'report' && (
          <div className="grid gap-6 lg:grid-cols-12">
            <form
              onSubmit={handleSubmitReport}
              className="lg:col-span-7 rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-5"
            >
              <h2 className="font-display text-2xl font-semibold text-white">
                Submit Final Investigation Report
              </h2>

              {reportMsg && (
                <div className="rounded-md border border-emerald-800 bg-emerald-950/40 px-4 py-2.5 text-xs text-emerald-200">
                  {reportMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Identified Responsible Subject / Conclusion
                </label>
                <input
                  type="text"
                  required
                  value={suspect}
                  onChange={(e) => setSuspect(e.target.value)}
                  placeholder="Name the primary responsible person or conclusion..."
                  className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Analytical Reasoning & Evidence Proof (min. 20 chars)
                </label>
                <textarea
                  rows={6}
                  required
                  minLength={20}
                  value={reasoning}
                  onChange={(e) => setReasoning(e.target.value)}
                  placeholder="Present your deduction logically, citing specific documents, timestamps, and contradictions..."
                  className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Cite Supporting Evidence
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {evidence.map((ev: any) => {
                    const checked = selectedEvRefs.includes(ev.evidence_code);
                    return (
                      <label
                        key={ev.id}
                        className="flex items-center gap-2 rounded border border-slate-800 bg-[#070B13] px-3 py-2 text-xs text-slate-300 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEvRefs((prev) => [...prev, ev.evidence_code]);
                            } else {
                              setSelectedEvRefs((prev) => prev.filter((x) => x !== ev.evidence_code));
                            }
                          }}
                        />
                        <span className="truncate">
                          {ev.evidence_code} — {ev.title}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Timeline Summary
                </label>
                <textarea
                  rows={3}
                  value={timelineSummary}
                  onChange={(e) => setTimelineSummary(e.target.value)}
                  placeholder="Summarize the sequence of critical events..."
                  className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <button
                type="submit"
                disabled={submittingReport}
                className="rounded-md bg-[#C9A45C] px-6 py-2.5 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]"
              >
                {submittingReport ? 'Submitting...' : 'Submit Final Report'}
              </button>
            </form>

            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
                <h3 className="font-display text-2xl font-semibold text-white">Submission History</h3>
                {reports.length === 0 ? (
                  <p className="text-sm text-slate-400">No reports submitted for this dossier yet.</p>
                ) : (
                  <div className="space-y-3">
                    {reports.map((r: any) => (
                      <div key={r.id} className="rounded-md border border-slate-800 bg-[#070B13] p-4 space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-mono-tabular">
                          <span className="text-[#C9A45C]">{r.status}</span>
                          {typeof r.score === 'number' && <span className="text-white">{r.score}/100</span>}
                        </div>
                        <p className="text-sm font-medium text-white">{r.suspect_identified}</p>
                        {r.feedback && <p className="text-xs text-slate-300 pt-1">{r.feedback}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Image Lightbox Modal */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative max-w-4xl w-full space-y-3">
            <div className="flex items-center justify-between text-white">
              <span className="text-sm font-medium">{zoomImage.title}</span>
              <button
                type="button"
                onClick={() => setZoomImage(null)}
                className="rounded bg-slate-800 p-2 text-slate-200 hover:bg-slate-700"
                aria-label="Close image preview"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <img
              src={zoomImage.url}
              alt={zoomImage.title}
              referrerPolicy="no-referrer"
              className="max-h-[80vh] w-full object-contain rounded-lg border border-slate-800 bg-black"
            />
          </div>
        </div>
      )}

      {/* Text Document Preview Modal */}
      {docPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-2xl w-full rounded-lg border border-slate-700 bg-[#0D1422] p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-display text-2xl font-semibold text-white">{docPreview.title}</h3>
              <button
                type="button"
                onClick={() => setDocPreview(null)}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <pre className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap rounded border border-slate-800 bg-[#070B13] p-4 font-mono-tabular text-xs leading-relaxed text-slate-200">
              {docPreview.text}
            </pre>
          </div>
        </div>
      )}
      {/* Document 3D Exhibit Modal */}
      {doc3dModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-4xl w-full rounded-lg border border-slate-700 bg-[#0D1422] p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-display text-2xl font-semibold text-white">{doc3dModal.title}</h3>
              <button
                type="button"
                onClick={() => setDoc3dModal(null)}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <Model3DViewer
              modelUrl={doc3dModal.url}
              title={doc3dModal.title}
              format={doc3dModal.format}
              heightClass="h-[420px]"
              onFallbackToStandard={() => setDoc3dModal(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
