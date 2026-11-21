import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { usePlatform } from '../../context/PlatformContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { parseIntInRange, sanitizeDigitInput } from '../../shared/numericInput';

export function AdminOperationsTab({ mode }: { mode: 'players' | 'reports' | 'logs' }) {
  const { bootstrap } = usePlatform();
  const [players, setPlayers] = useState<any[]>([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [reports, setReports] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTarget, setStatusTarget] = useState<any>(null);

  // Career assignment form
  const [careerUser, setCareerUser] = useState<any>(null);
  const [careerInstId, setCareerInstId] = useState(1);
  const [careerRankId, setCareerRankId] = useState(1);
  const [careerReason, setCareerReason] = useState('');

  // Report evaluation form
  const [evalReport, setEvalReport] = useState<any>(null);
  const [evalScore, setEvalScore] = useState('85');
  const [evalDecision, setEvalDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [evalFeedback, setEvalFeedback] = useState('');
  const [evalCareerAction, setEvalCareerAction] = useState('');
  const [evalError, setEvalError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      if (mode === 'players') {
        const res = await apiFetch<{ players: any[] }>(
          `/api/admin/players?search=${encodeURIComponent(playerSearch)}`
        );
        setPlayers(res.players);
      } else if (mode === 'reports') {
        const res = await apiFetch<{ reports: any[] }>('/api/admin/reports');
        setReports(res.reports);
      } else {
        const res = await apiFetch<{ logs: any[] }>('/api/admin/logs');
        setLogs(res.logs);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [mode]);

  const handleToggleStatus = async () => {
    if (!statusTarget) return;
    const next = statusTarget.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    await apiFetch(`/api/admin/players/${statusTarget.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next }),
    });
    setStatusTarget(null);
    await load();
  };

  const handleSaveCareer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!careerUser) return;
    await apiFetch(`/api/admin/players/${careerUser.id}/career`, {
      method: 'PATCH',
      body: JSON.stringify({
        institution_id: careerInstId,
        rank_id: careerRankId,
        reason: careerReason,
      }),
    });
    setCareerUser(null);
    await load();
  };

  const handleEvaluateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evalReport) return;
    setEvalError('');
    const parsedScore = parseIntInRange(evalScore, 0, 100);
    if (parsedScore === null) {
      setEvalError('Score must be a whole number between 0 and 100.');
      return;
    }
    try {
      await apiFetch(`/api/admin/reports/${evalReport.id}/evaluate`, {
        method: 'POST',
        body: JSON.stringify({
          score: parsedScore,
          decision: evalDecision,
          feedback: evalFeedback,
          career_action: evalCareerAction,
        }),
      });
      setEvalReport(null);
      await load();
    } catch (err: any) {
      setEvalError(err.message || 'Could not evaluate report.');
    }
  };

  const institutions = bootstrap?.institutions || [];
  const ranks = bootstrap?.ranks || [];

  return (
    <div className="space-y-6">
      {mode === 'players' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-semibold text-white">Player Management</h2>
              <p className="text-sm text-slate-400">
                Inspect registered investigators, manage account status, and assign institutions or ranks.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && load()}
                  placeholder="Search email, name, ID..."
                  className="rounded-md border border-slate-700 bg-[#0B111E] py-2 pl-9 pr-3 text-sm text-white"
                />
              </div>
              <button
                type="button"
                onClick={load}
                className="rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
              >
                Search
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-slate-400">Loading players...</p>
          ) : (
            <div className="rounded-lg border border-slate-800 bg-[#0B111E] overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-[#070B13] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">Player ID</th>
                    <th className="px-5 py-3 font-medium">Name & Email</th>
                    <th className="px-5 py-3 font-medium">Institution & Rank</th>
                    <th className="px-5 py-3 font-medium">Role / Status</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {players.map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-3.5 font-mono-tabular text-[#C9A45C]">{p.player_code}</td>
                      <td className="px-5 py-3.5">
                        <span className="block font-medium text-white">{p.full_name}</span>
                        <span className="text-slate-400">{p.email}</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-300">
                        <span className="block">{p.institution_name}</span>
                        <span className="text-slate-400">{p.rank_title}</span>
                      </td>
                      <td className="px-5 py-3.5 font-mono-tabular">
                        <span className="text-slate-200">{p.role}</span> ·{' '}
                        <span className={p.status === 'ACTIVE' ? 'text-emerald-400' : 'text-red-400'}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setCareerUser(p);
                            setCareerInstId(p.institution_id);
                            setCareerRankId(p.rank_id);
                            setCareerReason('');
                          }}
                          className="rounded border border-slate-700 px-2.5 py-1 text-slate-200 hover:bg-slate-800"
                        >
                          Assign Rank
                        </button>
                        {p.role !== 'SUPER_ADMIN' && (
                          <button
                            type="button"
                            onClick={() => setStatusTarget(p)}
                            className="rounded border border-slate-700 px-2.5 py-1 text-slate-200 hover:bg-slate-800"
                          >
                            {p.status === 'ACTIVE' ? 'Suspend' : 'Restore'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {careerUser && (
            <form
              onSubmit={handleSaveCareer}
              className="rounded-lg border border-slate-700 bg-[#0B111E] p-6 space-y-4"
            >
              <h3 className="font-display text-2xl font-semibold text-white">
                Assign Institution & Rank — {careerUser.full_name}
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Institution</label>
                  <select
                    value={careerInstId}
                    onChange={(e) => {
                      const nextInst = Number(e.target.value);
                      setCareerInstId(nextInst);
                      const firstRank = ranks.find((r) => r.institution_id === nextInst);
                      if (firstRank) setCareerRankId(firstRank.id);
                    }}
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  >
                    {institutions.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Rank</label>
                  <select
                    value={careerRankId}
                    onChange={(e) => setCareerRankId(Number(e.target.value))}
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  >
                    {ranks
                      .filter((r) => r.institution_id === careerInstId)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Decision Reason</label>
                  <input
                    type="text"
                    required
                    value={careerReason}
                    onChange={(e) => setCareerReason(e.target.value)}
                    placeholder="e.g. Meritorious case completion"
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="rounded bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13]">
                  Save Career Assignment
                </button>
                <button
                  type="button"
                  onClick={() => setCareerUser(null)}
                  className="rounded border border-slate-700 px-4 py-2 text-xs text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <ConfirmDialog
            open={Boolean(statusTarget)}
            title={statusTarget?.status === 'ACTIVE' ? 'Suspend Account' : 'Restore Account'}
            description={`Confirm status change for ${statusTarget?.full_name} (${statusTarget?.email}).`}
            destructive={statusTarget?.status === 'ACTIVE'}
            onConfirm={handleToggleStatus}
            onCancel={() => setStatusTarget(null)}
          />
        </>
      )}

      {mode === 'reports' && (
        <>
          <div>
            <h2 className="font-display text-3xl font-semibold text-white">Report Evaluation</h2>
            <p className="text-sm text-slate-400">
              Review submitted player reports against the confidential master solution and assign scores.
            </p>
          </div>
          {loading ? (
            <p className="text-sm text-slate-400">Loading submitted reports...</p>
          ) : reports.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 bg-[#0B111E] p-12 text-center text-sm text-slate-400">
              No player investigation reports have been submitted yet.
            </div>
          ) : (
            <div className="space-y-4">
              {reports.map((rep) => (
                <div key={rep.id} className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
                    <div>
                      <span className="font-mono-tabular text-xs text-[#C9A45C]">
                        {rep.case_code} · {rep.player_code}
                      </span>
                      <h3 className="text-base font-semibold text-white">
                        {rep.case_title} — Submitted by {rep.player_name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono-tabular text-xs text-slate-300">
                        Status: {rep.status} {typeof rep.score === 'number' ? `(${rep.score}/100)` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEvalReport(rep);
                          setEvalScore(String(rep.score ?? 85));
                          setEvalDecision(rep.decision || 'APPROVED');
                          setEvalFeedback(rep.feedback || '');
                          setEvalCareerAction(rep.career_action || '');
                          setEvalError('');
                        }}
                        className="rounded bg-[#C9A45C] px-3 py-1.5 text-xs font-semibold text-[#070B13]"
                      >
                        Evaluate
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 text-xs">
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-300">Player Submission</p>
                      <p className="text-white">Suspect: {rep.suspect_identified}</p>
                      <p className="text-slate-400">{rep.reasoning_text}</p>
                      {rep.timeline_summary && <p className="text-slate-400">Timeline: {rep.timeline_summary}</p>}
                    </div>
                    <div className="rounded border border-slate-800 bg-[#070B13] p-3 space-y-1">
                      <p className="font-semibold text-[#C9A45C]">Confidential Master Solution Key</p>
                      <p className="text-white">Responsible: {rep.responsible_character || 'Not specified'}</p>
                      <p className="text-slate-400">{rep.master_solution || 'No master solution recorded.'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {evalReport && (
            <form
              onSubmit={handleEvaluateReport}
              className="rounded-lg border border-slate-700 bg-[#0B111E] p-6 space-y-4"
            >
              <h3 className="font-display text-2xl font-semibold text-white">
                Evaluate Report — {evalReport.player_name} ({evalReport.case_code})
              </h3>
              {evalError && (
                <div role="alert" className="rounded-md border border-red-800 bg-red-950/50 px-4 py-2.5 text-xs text-red-200">
                  {evalError}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="eval-report-score" className="block text-xs text-slate-300 mb-1">
                    Score (0–100)
                  </label>
                  <input
                    id="eval-report-score"
                    type="text"
                    inputMode="numeric"
                    value={evalScore}
                    onChange={(e) => setEvalScore(sanitizeDigitInput(e.target.value))}
                    placeholder="0–100"
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Decision</label>
                  <select
                    value={evalDecision}
                    onChange={(e) => setEvalDecision(e.target.value as any)}
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  >
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Career Note</label>
                  <input
                    type="text"
                    value={evalCareerAction}
                    onChange={(e) => setEvalCareerAction(e.target.value)}
                    placeholder="e.g. Cleared for promotion review"
                    className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Evaluation Feedback</label>
                <textarea
                  rows={3}
                  required
                  value={evalFeedback}
                  onChange={(e) => setEvalFeedback(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="rounded bg-[#C9A45C] px-5 py-2 text-xs font-semibold text-[#070B13]">
                  Submit Evaluation
                </button>
                <button
                  type="button"
                  onClick={() => setEvalReport(null)}
                  className="rounded border border-slate-700 px-4 py-2 text-xs text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {mode === 'logs' && (
        <>
          <div>
            <h2 className="font-display text-3xl font-semibold text-white">Admin Audit Logs</h2>
            <p className="text-sm text-slate-400">
              Immutable record of administrative logins, case edits, media uploads, player actions, and settings updates.
            </p>
          </div>
          {loading ? (
            <p className="text-sm text-slate-400">Loading audit logs...</p>
          ) : (
            <div className="rounded-lg border border-slate-800 bg-[#0B111E] overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-[#070B13] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">Timestamp</th>
                    <th className="px-5 py-3 font-medium">Admin</th>
                    <th className="px-5 py-3 font-medium">Action</th>
                    <th className="px-5 py-3 font-medium">Target</th>
                    <th className="px-5 py-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-5 py-3 font-mono-tabular text-slate-400 whitespace-nowrap">
                        {log.created_at}
                      </td>
                      <td className="px-5 py-3 text-slate-200">{log.admin_email}</td>
                      <td className="px-5 py-3 font-mono-tabular text-[#C9A45C]">{log.action}</td>
                      <td className="px-5 py-3 font-mono-tabular text-slate-400">{log.target_type}</td>
                      <td className="px-5 py-3 text-slate-300">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
