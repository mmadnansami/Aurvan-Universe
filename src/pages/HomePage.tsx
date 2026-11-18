import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Compass, FileSearch, FolderOpen, Scale, ShieldCheck } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { apiFetch } from '../lib/api';
import { InstitutionLogo } from '../components/InstitutionLogo';
import { BangladeshMap } from '../components/BangladeshMap';
import type { PublicCaseSummary, Region } from '../shared/types';

export function HomePage() {
  const { bootstrap, user } = usePlatform();
  const [publishedCases, setPublishedCases] = useState<PublicCaseSummary[]>([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<{ cases: PublicCaseSummary[] }>('/api/public/cases')
      .then((res) => {
        if (active) setPublishedCases(res.cases);
      })
      .catch(() => {
        if (active) setPublishedCases([]);
      })
      .finally(() => {
        if (active) setCasesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (bootstrap?.regions?.length && !selectedRegion) {
      setSelectedRegion(bootstrap.regions[0]);
    }
  }, [bootstrap, selectedRegion]);

  const hero = bootstrap?.content?.hero;
  const intro = bootstrap?.content?.universe_intro;
  const announcement = bootstrap?.content?.announcement_banner;
  const institutions = bootstrap?.institutions || [];
  const regions = bootstrap?.regions || [];
  const platformLogo = bootstrap?.settings?.platform_logo_url;
  const heroExtra = (() => {
    try {
      return hero?.extra_json ? JSON.parse(hero.extra_json) : {};
    } catch {
      return {};
    }
  })();

  return (
    <div className="bg-[#070B13] text-slate-100">
      {/* Optional Admin-Controlled Global Announcement */}
      {announcement?.is_visible && announcement.body && (
        <div className="border-b border-slate-800/80 bg-[#0B111E] px-4 py-2.5 text-center text-xs text-slate-300">
          <span className="font-semibold text-[#C9A45C] mr-2">{announcement.title}:</span>
          <span>{announcement.body}</span>
        </div>
      )}

      {/* 1. Cinematic Hero Section */}
      {(!hero || hero.is_visible) && (
        <section className="relative overflow-hidden border-b border-slate-800/80">
          {hero?.media_url && (
            <div className="absolute inset-0">
              <img
                src={hero.media_url}
                alt="AURVAN UNIVERSE Command Archive"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover opacity-35"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#070B13] via-[#070B13]/80 to-[#070B13]/60" />
            </div>
          )}

          <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="grid gap-12 lg:grid-cols-12 items-center">
              <div className="lg:col-span-8 space-y-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C9A45C]">
                  {heroExtra.eyebrow || 'Fictional Investigative Universe · Inspired by Bangladesh'}
                </p>
                <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-white leading-[1.08] text-balance">
                  {hero?.title || 'Every Clue Leaves a Trace Across the Delta'}
                </h1>
                <p className="max-w-2xl text-base sm:text-lg leading-relaxed text-slate-300">
                  {hero?.body ||
                    'AURVAN UNIVERSE is an independent fictional investigation and critical-thinking platform inspired by Bangladesh.'}
                </p>

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <Link
                    to="/cases"
                    className="inline-flex items-center gap-2 rounded-md bg-[#C9A45C] px-6 py-3 text-sm font-semibold text-[#070B13] hover:bg-[#D8B774] transition-colors whitespace-nowrap"
                  >
                    <span>{heroExtra.primaryCta || 'Enter Case Library'}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/institutions"
                    className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-[#0B111E]/80 px-6 py-3 text-sm font-medium text-slate-200 hover:border-slate-500 hover:text-white transition-colors whitespace-nowrap"
                  >
                    <span>{heroExtra.secondaryCta || 'Explore Institutions'}</span>
                  </Link>
                </div>

                <p className="pt-2 text-xs text-slate-400">
                  Independent fictional educational platform · Not affiliated with any real government or law enforcement body.
                </p>
              </div>

              <div className="lg:col-span-4 flex justify-start lg:justify-end">
                <div className="w-full max-w-sm rounded-lg border border-slate-800 bg-[#0B111E]/90 p-6 backdrop-blur-sm space-y-5">
                  {platformLogo ? (
                    <div className="flex items-center justify-center rounded-md border border-slate-800/80 bg-[#070B13]/60 px-4 py-5">
                      <img
                        src={platformLogo}
                        alt="AURVAN UNIVERSE Emblem"
                        referrerPolicy="no-referrer"
                        className="mx-auto h-28 w-auto object-contain"
                      />
                    </div>
                  ) : (
                    <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-slate-700 bg-black/40">
                      <span className="font-display text-xl tracking-wider text-slate-400">
                        AURVAN UNIVERSE
                      </span>
                    </div>
                  )}
                  <div className="space-y-2 border-t border-slate-800 pt-4 text-xs text-slate-400">
                    <div className="flex items-center justify-between">
                      <span>Institutions</span>
                      <span className="font-mono-tabular text-slate-200">{institutions.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Regional Divisions</span>
                      <span className="font-mono-tabular text-slate-200">{regions.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Published Cases</span>
                      <span className="font-mono-tabular text-slate-200">{publishedCases.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 2. AURVAN UNIVERSE Introduction */}
      {(!intro || intro.is_visible) && (
        <section className="border-b border-slate-800/80 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-12 items-start">
              <div className="lg:col-span-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
                  Platform Mandate
                </p>
                <h2 className="font-display text-3xl sm:text-4xl font-semibold text-white mt-2 text-balance">
                  {intro?.title || 'Built for Analytical Rigor and Deduction'}
                </h2>
              </div>
              <div className="lg:col-span-7 space-y-6">
                <p className="text-base leading-relaxed text-slate-300">
                  {intro?.body}
                </p>
                <div className="grid gap-6 sm:grid-cols-3 border-t border-slate-800 pt-6">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Critical Thinking</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                      Test hypotheses against physical, documentary, and audio evidence without guesswork.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Structured Research</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                      Cross-examine timelines, witness statements, and regional logistics across Bangladesh.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Accountable Reasoning</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                      Defend conclusions in formal written reports evaluated against clear analytical criteria.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 3. Our Three Institutions */}
      <section className="border-b border-slate-800/80 bg-[#090E18] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
                Fictional Institutional Hierarchy
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-white mt-2">
                Three Investigative Institutions
              </h2>
            </div>
            <Link
              to="/institutions"
              className="text-sm font-medium text-[#C9A45C] hover:text-[#D8B774] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Inspect Full Profiles</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {institutions.map((inst, index) => (
              <div
                key={inst.id}
                className="flex flex-col justify-between rounded-lg border border-slate-800 bg-[#0D1422] p-6 space-y-6"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <InstitutionLogo
                      logoUrl={inst.logo_url}
                      name={inst.name}
                      shortName={inst.short_name}
                      size="md"
                    />
                    <span className="font-mono-tabular text-xs text-slate-500">
                      Tier 0{index + 1}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-display text-2xl font-semibold text-white">{inst.name}</h3>
                    <p className="text-xs font-medium text-[#C9A45C] mt-1">{inst.tagline}</p>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-300">{inst.description}</p>
                </div>

                <div className="border-t border-slate-800 pt-4">
                  <Link
                    to={`/institutions#${inst.code.toLowerCase()}`}
                    className="text-xs font-semibold text-slate-200 hover:text-[#C9A45C] inline-flex items-center gap-1.5"
                  >
                    <span>View Rank Structure & Mandate</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Bangladesh Regional Investigation Map */}
      <section className="border-b border-slate-800/80 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
                Geographic Context
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-white mt-2">
                Eight Divisions of Bangladesh
              </h2>
            </div>
            <Link
              to="/regions"
              className="text-sm font-medium text-[#C9A45C] hover:text-[#D8B774] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Explore All Divisions</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <BangladeshMap
            regions={regions}
            selectedRegionId={selectedRegion?.id || null}
            onSelectRegion={(reg) => setSelectedRegion(reg)}
          />
        </div>
      </section>

      {/* 5. How the Investigation System Works */}
      <section className="border-b border-slate-800/80 bg-[#090E18] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
              Methodology
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold text-white mt-2">
              How the Investigation System Works
            </h2>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: '01',
                icon: BookOpen,
                title: 'Case Briefing',
                desc: 'Receive regional dossier, chapter directives, and initial background files.',
              },
              {
                step: '02',
                icon: FileSearch,
                title: 'Evidence & Testimony',
                desc: 'Inspect images, documents, audio intercepts, character profiles, and witness interrogations.',
              },
              {
                step: '03',
                icon: Compass,
                title: 'Reconstruct & Connect',
                desc: 'Record private detective notes, build event timelines, and map links on the connection board.',
              },
              {
                step: '04',
                icon: Scale,
                title: 'Submit & Evaluation',
                desc: 'File your final written report for formal Directorate review, scoring, and rank progression.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.step} className="rounded-lg border border-slate-800 bg-[#0D1422] p-6 space-y-3">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="font-mono-tabular text-xs font-semibold text-[#C9A45C]">
                      Step {item.step}
                    </span>
                    <Icon className="h-4 w-4 text-slate-400" />
                  </div>
                  <h3 className="text-base font-semibold text-white">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-slate-400">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6. Career Progression */}
      <section className="border-b border-slate-800/80 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
                Advancement Track
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-white mt-2">
                Career Progression Path
              </h2>
            </div>
            <Link
              to="/career"
              className="text-sm font-medium text-[#C9A45C] hover:text-[#D8B774] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>View Rank Requirements</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {institutions.map((inst, idx) => (
              <div
                key={inst.id}
                className="rounded-lg border border-slate-800 bg-[#0B111E] p-6 space-y-3"
              >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-mono-tabular text-[#C9A45C]">Stage 0{idx + 1}</span>
                  <span>{idx === 0 ? 'Entry Command' : idx === 1 ? 'Tactical Tier' : 'Highest Institution'}</span>
                </div>
                <h3 className="font-display text-2xl font-semibold text-white">{inst.name}</h3>
                <p className="text-sm text-slate-300 leading-relaxed">{inst.progression_notes}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Case Library Preview */}
      <section className="border-b border-slate-800/80 bg-[#090E18] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
                Official Archive
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-white mt-2">
                Case Library Preview
              </h2>
            </div>
            <Link
              to="/cases"
              className="text-sm font-medium text-[#C9A45C] hover:text-[#D8B774] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Open Full Archive</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {casesLoading ? (
            <div className="rounded-lg border border-slate-800 bg-[#0D1422] p-12 text-center text-sm text-slate-400">
              Loading case archive...
            </div>
          ) : publishedCases.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 bg-[#0D1422]/70 p-12 text-center space-y-3">
              <FolderOpen className="mx-auto h-10 w-10 text-slate-500" />
              <h3 className="font-display text-2xl font-semibold text-white">
                No Investigation Cases Available Yet.
              </h3>
              <p className="mx-auto max-w-md text-sm text-slate-400">
                The Directorate has not published any public investigation dossiers yet. Register an investigator account to prepare for upcoming case releases.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {publishedCases.slice(0, 3).map((c) => (
                <Link
                  key={c.id}
                  to={user ? `/investigate/${c.id}` : '/cases'}
                  className="group rounded-lg border border-slate-800 bg-[#0D1422] overflow-hidden hover:border-[#C9A45C]/60 transition-colors"
                >
                  {c.cover_image_url ? (
                    <div className="aspect-video w-full overflow-hidden bg-slate-900">
                      <img
                        src={c.cover_image_url}
                        alt={c.title}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                  ) : null}
                  <div className="p-6 space-y-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono-tabular">
                      <span className="text-[#C9A45C]">{c.case_code}</span>
                      <span>·</span>
                      <span>{c.region_name}</span>
                      <span>·</span>
                      <span>{c.difficulty}</span>
                    </div>
                    <h3 className="font-display text-2xl font-semibold text-white group-hover:text-[#C9A45C] transition-colors">
                      {c.title}
                    </h3>
                    <p className="text-sm text-slate-300 line-clamp-2">{c.short_description}</p>
                    <p className="text-xs text-slate-500 pt-1">{c.institution_name}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 8. Join AURVAN CTA */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8 space-y-6">
          <ShieldCheck className="mx-auto h-8 w-8 text-[#C9A45C]" />
          <h2 className="font-display text-3xl sm:text-5xl font-semibold text-white text-balance">
            {user ? 'Your Investigator Dossier Is Active' : 'Begin Your Service in AURVAN POLICE'}
          </h2>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-300">
            {user
              ? 'Open your operational dashboard to track institutional clearance, review notifications, and enter published investigations.'
              : 'Create an investigator profile to receive your official Player ID, build your analytical record, and prepare for upcoming fictional investigations.'}
          </p>
          <div className="pt-2">
            <Link
              to={user ? (user.role === 'PLAYER' ? '/dashboard' : '/admin') : '/auth'}
              className="inline-flex items-center gap-2 rounded-md bg-[#C9A45C] px-7 py-3.5 text-sm font-semibold text-[#070B13] hover:bg-[#D8B774] transition-colors"
            >
              <span>
                {user
                  ? user.role === 'PLAYER'
                    ? 'Open Investigator Dashboard'
                    : 'Open Super Admin Panel'
                  : 'Create Investigator Account'}
              </span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
