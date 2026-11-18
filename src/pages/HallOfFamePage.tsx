import { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface HallEntry {
  user_id: string;
  full_name: string;
  player_code: string;
  institution_name: string;
  rank_title: string;
  approved_cases: number;
  average_score: number;
  latest_commendation_at: string;
}

export function HallOfFamePage() {
  const [entries, setEntries] = useState<HallEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ entries: HallEntry[] }>('/api/public/hall-of-fame')
      .then((res) => setEntries(res.entries))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-[#070B13] py-14 sm:py-20 min-h-[70vh]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-10">
        <header className="max-w-3xl space-y-3 border-b border-slate-800 pb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
            Verified Commendations
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold text-white">
            Hall of Fame
          </h1>
          <p className="text-base text-slate-300">
            Official recognition of active investigators whose submitted reports have been reviewed and approved by the Directorate.
          </p>
        </header>

        {loading ? (
          <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-12 text-center text-sm text-slate-400">
            Loading verified commendation records...
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 bg-[#0B111E]/70 p-14 text-center space-y-3">
            <Award className="mx-auto h-10 w-10 text-slate-500" />
            <h2 className="font-display text-3xl font-semibold text-white">
              No Verified Commendations Yet.
            </h2>
            <p className="mx-auto max-w-md text-sm text-slate-400">
              Investigators appear here only after solving published cases and receiving formal Directorate report approval.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-800 bg-[#0B111E] overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-[#070B13] text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-3 font-medium">Pos</th>
                  <th className="px-6 py-3 font-medium">Investigator</th>
                  <th className="px-6 py-3 font-medium">Player ID</th>
                  <th className="px-6 py-3 font-medium">Institution & Rank</th>
                  <th className="px-6 py-3 font-medium text-right">Approved Cases</th>
                  <th className="px-6 py-3 font-medium text-right">Avg Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {entries.map((entry, idx) => (
                  <tr key={entry.user_id} className="hover:bg-slate-900/40">
                    <td className="px-6 py-4 font-mono-tabular text-xs text-[#C9A45C]">
                      #{idx + 1}
                    </td>
                    <td className="px-6 py-4 font-medium text-white">{entry.full_name}</td>
                    <td className="px-6 py-4 font-mono-tabular text-xs text-slate-400">
                      {entry.player_code}
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      <span className="block text-xs text-white">{entry.institution_name}</span>
                      <span className="text-xs text-slate-400">{entry.rank_title}</span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono-tabular text-white">
                      {entry.approved_cases}
                    </td>
                    <td className="px-6 py-4 text-right font-mono-tabular text-[#C9A45C]">
                      {entry.average_score}%
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
