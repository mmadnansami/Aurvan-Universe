import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FolderOpen, Search } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { apiFetch } from '../lib/api';
import { isPlayerEligibleForCase } from '../shared/validation';
import type { PublicCaseSummary } from '../shared/types';

export function CaseLibraryPage() {
  const { bootstrap, user } = usePlatform();
  const [searchParams] = useSearchParams();
  const [cases, setCases] = useState<PublicCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [regionId, setRegionId] = useState(searchParams.get('region') || '');
  const [institutionId, setInstitutionId] = useState('');
  const [difficulty, setDifficulty] = useState('');

  const fetchCases = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (regionId) qs.set('regionId', regionId);
      if (institutionId) qs.set('institutionId', institutionId);
      if (difficulty) qs.set('difficulty', difficulty);
      const res = await apiFetch<{ cases: PublicCaseSummary[] }>(`/api/public/cases?${qs.toString()}`);
      setCases(res.cases);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, [regionId, institutionId, difficulty]);

  const regions = bootstrap?.regions || [];
  const institutions = bootstrap?.institutions || [];

  return (
    <div className="bg-[#070B13] py-14 sm:py-20 min-h-[70vh]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
        <header className="max-w-3xl space-y-3 border-b border-slate-800 pb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
            Published Dossiers
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold text-white">
            Case Library
          </h1>
          <p className="text-base text-slate-300">
            Browse officially published investigations across all three institutions and eight divisions of Bangladesh.
          </p>
        </header>

        {/* Filters Toolbar */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 rounded-lg border border-slate-800 bg-[#0B111E] p-4">
          <div className="lg:col-span-5 relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchCases()}
              placeholder="Search by title or case ID..."
              aria-label="Search cases"
              className="w-full rounded-md border border-slate-700 bg-[#070B13] py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-[#C9A45C] focus:outline-none"
            />
          </div>

          <div className="lg:col-span-2">
            <select
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
              aria-label="Filter by Bangladesh division"
              className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-slate-200 focus:border-[#C9A45C] focus:outline-none"
            >
              <option value="">All Divisions</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <select
              value={institutionId}
              onChange={(e) => setInstitutionId(e.target.value)}
              aria-label="Filter by institution"
              className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-slate-200 focus:border-[#C9A45C] focus:outline-none"
            >
              <option value="">All Institutions</option>
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.short_name}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              aria-label="Filter by difficulty"
              className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3 py-2 text-sm text-slate-200 focus:border-[#C9A45C] focus:outline-none"
            >
              <option value="">All Difficulties</option>
              <option value="STANDARD">Standard</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="ADVANCED">Advanced</option>
              <option value="CLASSIFIED">Classified</option>
            </select>
          </div>

          <div className="lg:col-span-1">
            <button
              type="button"
              onClick={fetchCases}
              className="w-full rounded-md bg-[#C9A45C] px-3 py-2 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]"
            >
              Filter
            </button>
          </div>
        </div>

        {/* Results / Empty State */}
        {loading ? (
          <div className="rounded-lg border border-slate-800 bg-[#0B111E] p-12 text-center text-sm text-slate-400">
            Querying Directorate case archive...
          </div>
        ) : cases.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 bg-[#0B111E]/70 p-14 text-center space-y-3">
            <FolderOpen className="mx-auto h-10 w-10 text-slate-500" />
            <h2 className="font-display text-3xl font-semibold text-white">
              No Investigation Cases Available Yet.
            </h2>
            <p className="mx-auto max-w-lg text-sm text-slate-400">
              No published dossiers match your current selection. Once the Directorate publishes an investigation case, it will appear here for eligible investigators.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {cases.map((c) => {
              const eligibility = user
                ? user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
                  ? { eligible: true }
                  : isPlayerEligibleForCase(
                      user.institution_code,
                      user.rank_order,
                      c.institution_code,
                      c.min_rank_order
                    )
                : null;

              return (
                <article
                  key={c.id}
                  className="flex flex-col justify-between rounded-lg border border-slate-800 bg-[#0B111E] overflow-hidden"
                >
                  <div>
                    {c.cover_image_url ? (
                      <div className="aspect-video w-full bg-slate-900 overflow-hidden">
                        <img
                          src={c.cover_image_url}
                          alt={c.title}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : null}
                    <div className="p-6 space-y-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular text-slate-400">
                        <span className="text-[#C9A45C]">{c.case_code}</span>
                        <span>·</span>
                        <span>{c.region_name}</span>
                        <span>·</span>
                        <span>{c.difficulty}</span>
                      </div>
                      <h2 className="font-display text-2xl font-semibold text-white">{c.title}</h2>
                      <p className="text-sm leading-relaxed text-slate-300">
                        {c.short_description}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-slate-800 px-6 py-4 flex items-center justify-between gap-4">
                    <div className="text-xs text-slate-400">
                      <span className="block font-medium text-slate-200">{c.institution_name}</span>
                      <span className="font-mono-tabular">{c.estimated_duration}</span>
                    </div>
                    {user ? (
                      eligibility?.eligible ? (
                        <Link
                          to={`/investigate/${c.id}`}
                          className="rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774] whitespace-nowrap"
                        >
                          Open Dossier
                        </Link>
                      ) : (
                        <span className="text-xs text-amber-400 text-right">
                          {eligibility?.reason || 'Clearance Required'}
                        </span>
                      )
                    ) : (
                      <Link
                        to="/auth"
                        className="rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
                      >
                        Sign In to Investigate
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
