import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlatform } from '../context/PlatformContext';
import { BangladeshMap, SectorTierBadgeIcon } from '../components/BangladeshMap';
import { DIVISION_COMMAND_META } from '../data/bangladeshMapData';
import type { Region } from '../shared/types';

export function RegionsPage() {
  const { bootstrap } = usePlatform();
  const regions = bootstrap?.regions || [];
  const [selected, setSelected] = useState<Region | null>(null);

  useEffect(() => {
    if (regions.length > 0 && !selected) {
      setSelected(regions[0]);
    }
  }, [regions, selected]);

  return (
    <div className="bg-[#070B13] py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12">
        <header className="max-w-3xl space-y-3 border-b border-slate-800 pb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
            Regional Worldbuilding
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold text-white text-balance">
            Eight Divisions of Bangladesh
          </h1>
          <p className="text-base leading-relaxed text-slate-300">
            Select any division to review its regional sector profile, command headquarters tier, terrain context, and active published investigation dossiers.
          </p>
        </header>

        <BangladeshMap
          regions={regions}
          selectedRegionId={selected?.id || null}
          onSelectRegion={setSelected}
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 pt-4">
          {regions.map((region) => {
            const meta = DIVISION_COMMAND_META[region.code];
            return (
              <div
                key={region.id}
                className="rounded-lg border border-slate-800 bg-[#0B111E] p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-mono-tabular">
                    <span className="text-[#C9A45C]">{region.code}</span>
                    <span className="text-slate-500">{region.division_bn}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-2xl font-semibold text-white">{region.name}</h2>
                    {meta && <SectorTierBadgeIcon tier={meta.sectorTier} className="h-4 w-4 shrink-0" />}
                  </div>
                  {meta && (
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                      {meta.tierBadge} · {meta.hqCity} HQ
                    </p>
                  )}
                  <p className="text-xs text-slate-400">{region.headquarters_label}</p>
                  <p className="text-xs leading-relaxed text-slate-300 line-clamp-3">
                    {region.description}
                  </p>
                </div>
                <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
                  <span className="font-mono-tabular text-slate-400">
                    {region.published_case_count || 0} Published Cases
                  </span>
                  <Link
                    to={`/cases?region=${region.id}`}
                    className="font-medium text-[#C9A45C] hover:text-[#D8B774]"
                  >
                    Filter Archive
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
