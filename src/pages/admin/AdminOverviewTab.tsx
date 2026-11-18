import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

export function AdminOverviewTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/admin/overview')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading live Directorate metrics...</p>;
  }

  const stats = data?.stats || {
    totalPlayers: 0,
    activePlayers: 0,
    publishedCases: 0,
    draftCases: 0,
    archivedCases: 0,
    pendingReports: 0,
    completedInvestigations: 0,
  };

  const statCards = [
    { label: 'Total Registered Players', value: stats.totalPlayers },
    { label: 'Active Players', value: stats.activePlayers },
    { label: 'Published Cases', value: stats.publishedCases },
    { label: 'Draft / Review Cases', value: stats.draftCases },
    { label: 'Archived Cases', value: stats.archivedCases },
    { label: 'Pending Reports', value: stats.pendingReports },
    { label: 'Completed Investigations', value: stats.completedInvestigations },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-semibold text-white">Directorate Overview</h2>
        <p className="text-sm text-slate-400 mt-1">
          Live operational counters drawn directly from the platform database.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-800 bg-[#0B111E] p-5">
            <p className="text-xs text-slate-400">{item.label}</p>
            <p className="font-mono-tabular text-3xl font-semibold text-white mt-2">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-800 bg-[#0B111E] overflow-hidden">
        <div className="border-b border-slate-800 px-6 py-4">
          <h3 className="font-display text-2xl font-semibold text-white">
            Recent Administrative Activities
          </h3>
        </div>
        {!data?.recentLogs?.length ? (
          <p className="p-6 text-sm text-slate-400">No administrative audit entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-[#070B13] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">Admin</th>
                  <th className="px-5 py-3 font-medium">Details</th>
                  <th className="px-5 py-3 font-medium text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {data.recentLogs.map((log: any) => (
                  <tr key={log.id}>
                    <td className="px-5 py-3 font-mono-tabular text-[#C9A45C]">{log.action}</td>
                    <td className="px-5 py-3 text-slate-300">{log.admin_email}</td>
                    <td className="px-5 py-3 text-slate-400">{log.details}</td>
                    <td className="px-5 py-3 font-mono-tabular text-right text-slate-500">
                      {log.created_at}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
