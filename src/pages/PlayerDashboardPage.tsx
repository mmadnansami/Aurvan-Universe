import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Bell, FolderOpen, LogOut, Shield } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { apiFetch } from '../lib/api';
import { InstitutionLogo } from '../components/InstitutionLogo';

export function PlayerDashboardPage() {
  const { user, bootstrap, logout, refreshUser } = usePlatform();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'reports' | 'notifications' | 'settings'>('overview');

  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/player/dashboard');
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      setEditName(user.full_name);
      setEditBio(user.bio || '');
      loadDashboard();
    }
  }, [user]);

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const institutionObj = bootstrap?.institutions?.find((i) => i.id === user.institution_id);
  const unreadCount = (data?.notifications || []).filter((n: any) => !n.is_read).length;

  const handleMarkRead = async () => {
    await apiFetch('/api/player/notifications/read', { method: 'POST' });
    await loadDashboard();
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg('');
    try {
      await apiFetch('/api/player/profile', {
        method: 'PATCH',
        body: JSON.stringify({ full_name: editName, bio: editBio }),
      });
      await refreshUser();
      setSaveMsg('Profile settings updated.');
    } catch (err: any) {
      setSaveMsg(err.message || 'Update failed.');
    } finally {
      setSaving(false);
    }
  };

  const instRanks = data?.institutionRanks || [];
  const currentRankIdx = instRanks.findIndex((r: any) => r.id === user.rank_id);
  const nextRank = currentRankIdx >= 0 && currentRankIdx < instRanks.length - 1 ? instRanks[currentRankIdx + 1] : null;
  const approvedCount = data?.stats?.approvedCount || 0;
  const progressPct = nextRank && nextRank.min_cases_required > 0
    ? Math.min(100, Math.round((approvedCount / nextRank.min_cases_required) * 100))
    : nextRank
    ? 0
    : 100;

  return (
    <div className="bg-[#070B13] py-10 sm:py-14 min-h-[80vh]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Top Investigator Header */}
        <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <InstitutionLogo
              logoUrl={institutionObj?.logo_url}
              name={user.institution_name}
              shortName={institutionObj?.short_name || 'AUR'}
              size="md"
            />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular text-slate-400">
                <span className="text-[#C9A45C]">{user.player_code}</span>
                <span>·</span>
                <span>{user.institution_name}</span>
                <span>·</span>
                <span>{user.rank_title}</span>
              </div>
              <h1 className="font-display text-3xl font-semibold text-white">{user.full_name}</h1>
              <p className="text-xs text-slate-400">{user.email}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
              <Link
                to="/admin"
                className="inline-flex items-center gap-2 rounded-md border border-[#C9A45C]/60 bg-[#C9A45C]/10 px-4 py-2 text-xs font-semibold text-[#C9A45C] hover:bg-[#C9A45C]/20"
              >
                <Shield className="h-4 w-4" />
                <span>Super Admin Panel</span>
              </Link>
            )}
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          {[
            { id: 'overview', label: 'Operations & Cases' },
            { id: 'reports', label: `Submitted Reports (${data?.reports?.length || 0})` },
            { id: 'notifications', label: `Notifications (${unreadCount})` },
            { id: 'settings', label: 'Account Settings' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`rounded-md px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[#C9A45C] text-[#070B13] font-semibold'
                  : 'border border-slate-800 bg-[#0B111E] text-slate-300 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-12 text-center text-sm text-slate-400">
            Loading investigator dashboard...
          </div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Genuine Database Metrics */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-5">
                    <p className="text-xs text-slate-400">Active Investigations</p>
                    <p className="font-mono-tabular text-3xl font-semibold text-white mt-1">
                      {data.stats.activeCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-5">
                    <p className="text-xs text-slate-400">Submitted Reports</p>
                    <p className="font-mono-tabular text-3xl font-semibold text-white mt-1">
                      {data.stats.submittedReportsCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-5">
                    <p className="text-xs text-slate-400">Approved Solves</p>
                    <p className="font-mono-tabular text-3xl font-semibold text-[#C9A45C] mt-1">
                      {data.stats.approvedCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-5">
                    <p className="text-xs text-slate-400">Average Evaluation Score</p>
                    <p className="font-mono-tabular text-3xl font-semibold text-white mt-1">
                      {data.stats.averageScore}%
                    </p>
                  </div>
                </div>

                {/* Career Progress */}
                <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h2 className="font-display text-2xl font-semibold text-white">Career Progression</h2>
                      <p className="text-xs text-slate-400">
                        {nextRank
                          ? `Next Rank: ${nextRank.title} (${nextRank.min_cases_required} approved cases · ${nextRank.min_score_required}% min score)`
                          : 'Highest institutional rank achieved within current command.'}
                      </p>
                    </div>
                    <span className="font-mono-tabular text-xs text-[#C9A45C]">{progressPct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full bg-[#C9A45C] transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Available Published Cases */}
                <div className="space-y-4">
                  <h2 className="font-display text-2xl font-semibold text-white">
                    Available Investigation Dossiers
                  </h2>
                  {data.availableCases.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-700 bg-[#0B111E]/70 p-12 text-center space-y-2">
                      <FolderOpen className="mx-auto h-9 w-9 text-slate-500" />
                      <h3 className="font-display text-2xl font-semibold text-white">
                        No Investigation Cases Available Yet.
                      </h3>
                      <p className="mx-auto max-w-md text-sm text-slate-400">
                        Published cases assigned by the Directorate will appear here automatically.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                      {data.availableCases.map((c: any) => (
                        <div
                          key={c.id}
                          className="rounded-lg border border-slate-800 bg-[#0B111E] p-5 flex flex-col justify-between space-y-4"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs font-mono-tabular text-slate-400">
                              <span className="text-[#C9A45C]">{c.case_code}</span>
                              <span>·</span>
                              <span>{c.region_name}</span>
                              <span>·</span>
                              <span>{c.difficulty}</span>
                            </div>
                            <h3 className="font-display text-xl font-semibold text-white">{c.title}</h3>
                            <p className="text-sm text-slate-300 line-clamp-2">{c.short_description}</p>
                          </div>
                          <div className="border-t border-slate-800 pt-3 flex items-center justify-between">
                            <span className="text-xs text-slate-400">{c.institution_name}</span>
                            {c.eligible ? (
                              <Link
                                to={`/investigate/${c.id}`}
                                className="rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]"
                              >
                                Enter Room
                              </Link>
                            ) : (
                              <span className="text-xs text-amber-400">{c.eligibility_reason}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="space-y-4">
                <h2 className="font-display text-2xl font-semibold text-white">
                  Submitted Reports & Evaluation Results
                </h2>
                {data.reports.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-700 bg-[#0B111E] p-10 text-center text-sm text-slate-400">
                    You have not submitted any investigation reports yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {data.reports.map((rep: any) => (
                      <div key={rep.id} className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                          <div>
                            <span className="font-mono-tabular text-xs text-[#C9A45C]">{rep.case_code}</span>
                            <h3 className="text-base font-semibold text-white">{rep.case_title}</h3>
                          </div>
                          <div className="text-right font-mono-tabular text-xs">
                            <span className="text-slate-200 block">Status: {rep.status}</span>
                            {typeof rep.score === 'number' && (
                              <span className="text-[#C9A45C]">Score: {rep.score}/100</span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-slate-300">
                          <strong className="text-white">Identified Subject:</strong> {rep.suspect_identified}
                        </p>
                        <p className="text-sm text-slate-400">{rep.reasoning_text}</p>
                        {rep.feedback && (
                          <div className="rounded-md border border-slate-700 bg-[#070B13] p-4 text-xs text-slate-300 space-y-1">
                            <p className="font-semibold text-[#C9A45C]">Directorate Evaluation Feedback</p>
                            <p>{rep.feedback}</p>
                            {rep.career_action && <p className="text-slate-400">Career Note: {rep.career_action}</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-2xl font-semibold text-white">Notifications</h2>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkRead}
                      className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                    >
                      Mark All Read
                    </button>
                  )}
                </div>
                {data.notifications.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-700 bg-[#0B111E] p-10 text-center text-sm text-slate-400">
                    No notifications recorded.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-[#0B111E]">
                    {data.notifications.map((n: any) => (
                      <div key={n.id} className="p-4 flex items-start gap-3">
                        <Bell className={`h-4 w-4 mt-0.5 ${n.is_read ? 'text-slate-600' : 'text-[#C9A45C]'}`} />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-white">{n.title}</p>
                          <p className="text-xs text-slate-400">{n.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="max-w-xl rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-5">
                <h2 className="font-display text-2xl font-semibold text-white">Account Settings</h2>
                {saveMsg && (
                  <div className="rounded-md border border-slate-700 bg-[#070B13] px-3 py-2 text-xs text-slate-200">
                    {saveMsg}
                  </div>
                )}
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div>
                    <label htmlFor="prof-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                      Display Name
                    </label>
                    <input
                      id="prof-name"
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3.5 py-2.5 text-sm text-white focus:border-[#C9A45C] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="prof-bio" className="block text-xs font-medium text-slate-300 mb-1.5">
                      Investigator Bio
                    </label>
                    <textarea
                      id="prof-bio"
                      rows={3}
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3.5 py-2.5 text-sm text-white focus:border-[#C9A45C] focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-md bg-[#C9A45C] px-5 py-2.5 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]"
                  >
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
