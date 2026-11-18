import { usePlatform } from '../context/PlatformContext';
import { InstitutionLogo } from '../components/InstitutionLogo';

export function InstitutionsPage() {
  const { bootstrap } = usePlatform();
  const institutions = bootstrap?.institutions || [];
  const ranks = bootstrap?.ranks || [];

  return (
    <div className="bg-[#070B13] py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
        <header className="max-w-3xl space-y-3 border-b border-slate-800 pb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
            Institutional Profiles
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold text-white text-balance">
            Three Fictional Investigative Institutions
          </h1>
          <p className="text-base leading-relaxed text-slate-300">
            Progression within AURVAN UNIVERSE follows a strict three-tier institutional path: AURVAN POLICE → SAB → SIA. Each institution maintains its own rank hierarchy, operational mandate, and clearance standards.
          </p>
        </header>

        <div className="space-y-10">
          {institutions.map((inst, index) => {
            const instRanks = ranks.filter((r) => r.institution_id === inst.id);
            return (
              <article
                key={inst.id}
                id={inst.code.toLowerCase()}
                className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 sm:p-8 space-y-8"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-slate-800 pb-6">
                  <div className="flex items-center gap-5">
                    <InstitutionLogo
                      logoUrl={inst.logo_url}
                      name={inst.name}
                      shortName={inst.short_name}
                      size="lg"
                    />
                    <div>
                      <p className="font-mono-tabular text-xs text-[#C9A45C]">
                        Institution 0{index + 1} · {inst.code}
                      </p>
                      <h2 className="font-display text-3xl sm:text-4xl font-semibold text-white mt-1">
                        {inst.name}
                      </h2>
                      <p className="text-sm text-slate-400 mt-1">{inst.tagline}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-8 lg:grid-cols-12">
                  <div className="lg:col-span-7 space-y-6">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                        Institutional Overview
                      </h3>
                      <p className="mt-2 text-sm sm:text-base leading-relaxed text-slate-300">
                        {inst.description}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                        Core Responsibilities
                      </h3>
                      <ul className="mt-3 space-y-2 text-sm text-slate-300 list-disc pl-5">
                        {inst.responsibilities.map((resp, i) => (
                          <li key={i}>{resp}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-md border border-slate-800 bg-[#070B13] p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-[#C9A45C]">
                        Career Progression Path
                      </h4>
                      <p className="mt-1.5 text-sm text-slate-300">{inst.progression_notes}</p>
                    </div>
                  </div>

                  <div className="lg:col-span-5">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
                      Rank Hierarchy
                    </h3>
                    <div className="divide-y divide-slate-800 rounded-md border border-slate-800 bg-[#070B13]">
                      {instRanks.map((rank) => (
                        <div key={rank.id} className="p-4 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-white">{rank.title}</span>
                            <span className="font-mono-tabular text-xs text-[#C9A45C]">
                              Tier {rank.level_order}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">{rank.description}</p>
                          <p className="font-mono-tabular text-[11px] text-slate-500 pt-1">
                            Requirement: {rank.min_cases_required} Approved Cases · Min Avg {rank.min_score_required}%
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
