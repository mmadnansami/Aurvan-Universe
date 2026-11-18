import { Link } from 'react-router-dom';
import { usePlatform } from '../context/PlatformContext';

export function CareerPage() {
  const { bootstrap, user } = usePlatform();
  const institutions = bootstrap?.institutions || [];
  const ranks = bootstrap?.ranks || [];

  return (
    <div className="bg-[#070B13] py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-12">
        <header className="max-w-3xl space-y-3 border-b border-slate-800 pb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
            Merit & Advancement
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold text-white">
            Career & Rank Progression
          </h1>
          <p className="text-base leading-relaxed text-slate-300">
            Every registered investigator enters service in AURVAN POLICE. Advancement through SAB and SIA is earned strictly through approved case reports, analytical precision, and Directorate evaluation.
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'Report Quality & Accuracy',
              body: 'Evaluations weigh suspect identification, verifiable evidence citations, and logical timeline coherence.',
            },
            {
              title: 'Zero Automated Shortcuts',
              body: 'Ranks and institutional transfers are recorded in your official career ledger following administrative review.',
            },
            {
              title: 'Clearance-Gated Dossiers',
              body: 'Higher-tier SAB and SIA investigations unlock as your rank and institutional standing advance.',
            },
          ].map((card) => (
            <div key={card.title} className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-2">
              <h2 className="text-base font-semibold text-white">{card.title}</h2>
              <p className="text-sm leading-relaxed text-slate-400">{card.body}</p>
            </div>
          ))}
        </section>

        <section className="space-y-8">
          {institutions.map((inst) => {
            const instRanks = ranks.filter((r) => r.institution_id === inst.id);
            return (
              <div key={inst.id} className="rounded-lg border border-slate-800 bg-[#0B111E] overflow-hidden">
                <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-2xl font-semibold text-white">{inst.name}</h2>
                    <p className="text-xs text-slate-400">{inst.tagline}</p>
                  </div>
                  <span className="font-mono-tabular text-xs text-[#C9A45C]">{instRanks.length} Ranks</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-800 bg-[#070B13] text-xs uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-6 py-3 font-medium">Tier</th>
                        <th className="px-6 py-3 font-medium">Rank Title</th>
                        <th className="px-6 py-3 font-medium">Code</th>
                        <th className="px-6 py-3 font-medium text-right">Approved Cases</th>
                        <th className="px-6 py-3 font-medium text-right">Min Avg Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {instRanks.map((rank) => {
                        const isCurrent = user?.rank_id === rank.id;
                        return (
                          <tr key={rank.id} className={isCurrent ? 'bg-[#C9A45C]/10' : ''}>
                            <td className="px-6 py-3.5 font-mono-tabular text-xs text-slate-400">
                              0{rank.level_order}
                            </td>
                            <td className="px-6 py-3.5 font-medium text-white">
                              {rank.title}
                              {isCurrent && (
                                <span className="ml-2 text-xs text-[#C9A45C]">(Your Current Rank)</span>
                              )}
                              <p className="text-xs font-normal text-slate-400 mt-0.5">{rank.description}</p>
                            </td>
                            <td className="px-6 py-3.5 font-mono-tabular text-xs text-slate-400">
                              {rank.code}
                            </td>
                            <td className="px-6 py-3.5 font-mono-tabular text-right text-slate-200">
                              {rank.min_cases_required}
                            </td>
                            <td className="px-6 py-3.5 font-mono-tabular text-right text-slate-200">
                              {rank.min_score_required}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </section>

        {!user && (
          <div className="text-center pt-4">
            <Link
              to="/auth"
              className="inline-flex rounded-md bg-[#C9A45C] px-6 py-3 text-sm font-semibold text-[#070B13] hover:bg-[#D8B774]"
            >
              Register to Begin Your Career
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
