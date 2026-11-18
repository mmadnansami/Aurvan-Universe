import { Building2 } from 'lucide-react';
import type { Region } from '../shared/types';
import {
  BANGLADESH_MAP_VIEWBOX,
  DIVISION_COMMAND_META,
  DIVISION_GEOMETRIES,
  type SectorTier,
} from '../data/bangladeshMapData';

interface BangladeshMapProps {
  regions: Region[];
  selectedRegionId: number | null;
  onSelectRegion: (region: Region) => void;
}

const TIER_STYLES: Record<
  SectorTier,
  {
    color: string;
    fillSelected: string;
    fillDefault: string;
    strokeDefault: string;
    badgeBg: string;
    badgeBorder: string;
    badgeText: string;
    shortLabel: string;
    legendTitle: string;
    legendDesc: string;
  }
> = {
  CENTRAL_HQ: {
    color: '#C9A45C',
    fillSelected: 'rgba(201, 164, 92, 0.24)',
    fillDefault: '#18243A',
    strokeDefault: 'rgba(201, 164, 92, 0.55)',
    badgeBg: 'bg-[#C9A45C]/15',
    badgeBorder: 'border-[#C9A45C]/45',
    badgeText: 'text-[#E3C582]',
    shortLabel: 'Central HQ · Tier III',
    legendTitle: 'Central Directorate HQ (Tier III)',
    legendDesc: 'Dhaka — National Command & SIA Sovereign Hub',
  },
  SIA_TIER_3: {
    color: '#38BDF8',
    fillSelected: 'rgba(56, 189, 248, 0.20)',
    fillDefault: '#111F33',
    strokeDefault: 'rgba(56, 189, 248, 0.45)',
    badgeBg: 'bg-sky-500/10',
    badgeBorder: 'border-sky-400/35',
    badgeText: 'text-sky-300',
    shortLabel: 'SIA · Tier III',
    legendTitle: 'SIA Intelligence Bureau (Tier III)',
    legendDesc: 'Sylhet — Strategic Border & Signals Intelligence',
  },
  SAB_TIER_2: {
    color: '#F59E0B',
    fillSelected: 'rgba(245, 158, 11, 0.19)',
    fillDefault: '#141F33',
    strokeDefault: 'rgba(245, 158, 11, 0.42)',
    badgeBg: 'bg-amber-500/10',
    badgeBorder: 'border-amber-400/35',
    badgeText: 'text-amber-300',
    shortLabel: 'SAB · Tier II',
    legendTitle: 'SAB Tactical Command (Tier II)',
    legendDesc: 'Chattogram, Khulna, Rangpur — Special Action Sectors',
  },
  POLICE_TIER_1: {
    color: '#93C5FD',
    fillSelected: 'rgba(147, 197, 253, 0.19)',
    fillDefault: '#101A2C',
    strokeDefault: 'rgba(148, 163, 184, 0.35)',
    badgeBg: 'bg-blue-400/10',
    badgeBorder: 'border-blue-300/30',
    badgeText: 'text-blue-200',
    shortLabel: 'AURVAN POLICE · Tier I',
    legendTitle: 'AURVAN POLICE Field Division (Tier I)',
    legendDesc: 'Rajshahi, Barishal, Mymensingh — Civic Stations',
  },
};

export function SectorTierBadgeIcon({
  tier,
  className = 'h-4 w-4',
}: {
  tier: SectorTier;
  className?: string;
}) {
  const color = TIER_STYLES[tier].color;

  if (tier === 'CENTRAL_HQ') {
    return (
      <svg viewBox="-12 -12 24 24" className={className} aria-hidden="true">
        <polygon
          points="0,-10 8.7,-5 8.7,5 0,10 -8.7,5 -8.7,-5"
          fill="#070B13"
          stroke={color}
          strokeWidth="1.9"
        />
        <polygon
          points="0,-5.5 1.6,-1.8 5.6,-1.8 2.4,0.7 3.6,4.6 0,2.3 -3.6,4.6 -2.4,0.7 -5.6,-1.8 -1.6,-1.8"
          fill={color}
        />
      </svg>
    );
  }
  if (tier === 'SIA_TIER_3') {
    return (
      <svg viewBox="-12 -12 24 24" className={className} aria-hidden="true">
        <polygon points="0,-9.5 9.5,0 0,9.5 -9.5,0" fill="#070B13" stroke={color} strokeWidth="1.9" />
        <circle r="2.8" fill={color} />
      </svg>
    );
  }
  if (tier === 'SAB_TIER_2') {
    return (
      <svg viewBox="-12 -12 24 24" className={className} aria-hidden="true">
        <path
          d="M -7.5 -7.5 L 7.5 -7.5 L 7.5 1 C 7.5 6 0 9.5 0 9.5 C 0 9.5 -7.5 6 -7.5 1 Z"
          fill="#070B13"
          stroke={color}
          strokeWidth="1.8"
        />
        <path
          d="M -3.5 1.2 L 0 -2.6 L 3.5 1.2"
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="-12 -12 24 24" className={className} aria-hidden="true">
      <path
        d="M -6.5 -7 L 6.5 -7 L 6.5 1 C 6.5 5.2 0 8.5 0 8.5 C 0 8.5 -6.5 5.2 -6.5 1 Z"
        fill="#070B13"
        stroke={color}
        strokeWidth="1.7"
      />
      <circle r="2.2" fill={color} />
    </svg>
  );
}

function MapNodeIcon({
  tier,
  selected,
}: {
  tier: SectorTier;
  selected: boolean;
}) {
  const color = TIER_STYLES[tier].color;
  const scale = selected ? 1.15 : 1;

  if (tier === 'CENTRAL_HQ') {
    // Sovereign Central HQ: double beacon ring + hexagonal gold badge + crisp star
    return (
      <g transform={`scale(${scale})`}>
        <circle r="15" fill="rgba(201, 164, 92, 0.14)" stroke="#C9A45C" strokeWidth="1" strokeDasharray="2.5 2" />
        <polygon
          points="0,-10 8.7,-5 8.7,5 0,10 -8.7,5 -8.7,-5"
          fill="#070B13"
          stroke="#C9A45C"
          strokeWidth="1.8"
        />
        <polygon
          points="0,-5.5 1.6,-1.8 5.6,-1.8 2.4,0.7 3.6,4.6 0,2.3 -3.6,4.6 -2.4,0.7 -5.6,-1.8 -1.6,-1.8"
          fill="#C9A45C"
        />
      </g>
    );
  }

  if (tier === 'SIA_TIER_3') {
    // SIA Tier III: Strategic diamond crest with intelligence core
    return (
      <g transform={`scale(${scale})`}>
        {selected && <circle r="13" fill="rgba(56, 189, 248, 0.15)" stroke={color} strokeWidth="0.9" />}
        <polygon
          points="0,-9.5 9.5,0 0,9.5 -9.5,0"
          fill="#070B13"
          stroke={color}
          strokeWidth="1.7"
        />
        <circle r="2.7" fill={color} />
      </g>
    );
  }

  if (tier === 'SAB_TIER_2') {
    // SAB Tier II: Tactical Shield with upward tactical chevron
    return (
      <g transform={`scale(${scale})`}>
        {selected && <circle r="13" fill="rgba(245, 158, 11, 0.15)" stroke={color} strokeWidth="0.9" />}
        <path
          d="M -7.5 -7.5 L 7.5 -7.5 L 7.5 1 C 7.5 6 0 9.5 0 9.5 C 0 9.5 -7.5 6 -7.5 1 Z"
          fill="#070B13"
          stroke={color}
          strokeWidth="1.6"
        />
        <path d="M -3.5 1.2 L 0 -2.6 L 3.5 1.2" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    );
  }

  // AURVAN POLICE Tier I: Classic Field Division Shield with center emblem dot
  return (
    <g transform={`scale(${scale})`}>
      {selected && <circle r="12" fill="rgba(147, 197, 253, 0.15)" stroke={color} strokeWidth="0.9" />}
      <path
        d="M -6.5 -7 L 6.5 -7 L 6.5 1 C 6.5 5.2 0 8.5 0 8.5 C 0 8.5 -6.5 5.2 -6.5 1 Z"
        fill="#070B13"
        stroke={color}
        strokeWidth="1.5"
      />
      <circle r="2.1" fill={color} />
    </g>
  );
}

export function BangladeshMap({ regions, selectedRegionId, onSelectRegion }: BangladeshMapProps) {
  const activeRegion = regions.find((r) => r.id === selectedRegionId) || regions[0] || null;
  const activeMeta = activeRegion ? DIVISION_COMMAND_META[activeRegion.code] : null;
  const dhakaGeo = DIVISION_GEOMETRIES.DHK;

  return (
    <div className="grid gap-8 lg:grid-cols-12 items-stretch">
      {/* Left: Authentic Cartographic Map of Bangladesh's 8 Divisions */}
      <div className="lg:col-span-7 rounded-lg border border-slate-800 bg-[#0B111E] p-5 sm:p-6 flex flex-col justify-between space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-[#C9A45C]">
              Regional Command Topology
            </p>
            <h3 className="font-display text-2xl font-semibold text-white mt-1">
              Bangladesh Eight-Division Operations Map
            </h3>
          </div>
          <span className="font-mono-tabular text-xs text-slate-400">
            {regions.length} Divisions · 3 Institutional Tiers
          </span>
        </div>

        {/* Interactive Authentic Bangladesh SVG Map */}
        <div className="relative mx-auto w-full max-w-[490px] rounded-md border border-slate-800/70 bg-[#070C16] p-2 sm:p-3">
          <svg
            viewBox={BANGLADESH_MAP_VIEWBOX}
            className="h-auto w-full block select-none"
            role="img"
            aria-label="Authentic geographic map of the eight divisions of Bangladesh with headquarters and institutional tier markers"
          >
            <defs>
              <pattern id="aurvan-geo-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path
                  d="M 36 0 L 0 0 0 36"
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.06)"
                  strokeWidth="0.7"
                />
              </pattern>
              <radialGradient id="bd-sea-glow" cx="50%" cy="88%" r="45%">
                <stop offset="0%" stopColor="rgba(56, 189, 248, 0.09)" />
                <stop offset="100%" stopColor="rgba(7, 12, 22, 0)" />
              </radialGradient>
            </defs>

            {/* Cartographic Grid & Bay of Bengal Ambient Tone */}
            <rect width="500" height="688" fill="#070C16" rx="6" />
            <rect width="500" height="688" fill="url(#aurvan-geo-grid)" rx="6" />
            <rect width="500" height="688" fill="url(#bd-sea-glow)" rx="6" />

            {/* Subtle Latitude / Longitude Graticule Labels */}
            <g fill="rgba(148, 163, 184, 0.35)" fontSize="9" fontFamily="ui-monospace, monospace">
              <text x="10" y="96">26°N</text>
              <text x="10" y="294">24°N</text>
              <text x="10" y="492">22°N</text>
              <text x="112" y="676">89°E</text>
              <text x="242" y="676">90°E</text>
              <text x="372" y="676">92°E</text>
            </g>

            {/* Subtle Bay of Bengal geographic water label */}
            <text
              x="160"
              y="625"
              textAnchor="middle"
              fill="rgba(148, 163, 184, 0.25)"
              fontSize="11"
              letterSpacing="4"
              fontWeight="600"
            >
              BAY OF BENGAL
            </text>

            {/* Layer 1: Authentic Division Geographic Polygons */}
            {regions.map((region) => {
              const geo = DIVISION_GEOMETRIES[region.code];
              const meta = DIVISION_COMMAND_META[region.code];
              if (!geo || !meta) return null;

              const selected = activeRegion?.id === region.id;
              const style = TIER_STYLES[meta.sectorTier];

              return (
                <path
                  key={`poly-${region.code}`}
                  d={geo.path}
                  fillRule="evenodd"
                  fill={selected ? style.fillSelected : style.fillDefault}
                  stroke={selected ? style.color : style.strokeDefault}
                  strokeWidth={selected ? '1.8' : '0.95'}
                  strokeLinejoin="round"
                  onClick={() => onSelectRegion(region)}
                  className="cursor-pointer transition-colors duration-150 hover:brightness-125"
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${region.name} division (${meta.tierBadge})`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectRegion(region);
                    }
                  }}
                />
              );
            })}

            {/* Layer 2: Command Corridor Links from Dhaka Central HQ */}
            {dhakaGeo && (
              <g
                stroke="rgba(201, 164, 92, 0.24)"
                strokeWidth="0.9"
                strokeDasharray="3.5 3.5"
                pointerEvents="none"
              >
                {regions.map((region) => {
                  if (region.code === 'DHK') return null;
                  const geo = DIVISION_GEOMETRIES[region.code];
                  if (!geo) return null;
                  return (
                    <line
                      key={`link-${region.code}`}
                      x1={dhakaGeo.hqX}
                      y1={dhakaGeo.hqY}
                      x2={geo.hqX}
                      y2={geo.hqY}
                    />
                  );
                })}
              </g>
            )}

            {/* Layer 3: Headquarters & Tier Icon Markers + Crisp Division Labels */}
            {regions.map((region) => {
              const geo = DIVISION_GEOMETRIES[region.code];
              const meta = DIVISION_COMMAND_META[region.code];
              if (!geo || !meta) return null;

              const selected = activeRegion?.id === region.id;
              const style = TIER_STYLES[meta.sectorTier];
              const isBarishal = region.code === 'BAR';
              const isDhaka = region.code === 'DHK';
              const labelY = isBarishal ? 22 : isDhaka ? -28 : -24;

              return (
                <g
                  key={`marker-${region.code}`}
                  transform={`translate(${geo.hqX}, ${geo.hqY})`}
                  onClick={() => onSelectRegion(region)}
                  className="cursor-pointer"
                >
                  <MapNodeIcon tier={meta.sectorTier} selected={selected} />

                  {/* Division Label with dark halo so borders never obscure text */}
                  <text
                    x={geo.labelDx}
                    y={labelY}
                    textAnchor="middle"
                    fontSize={selected ? '12.5' : '11.2'}
                    fontWeight={selected ? '700' : '600'}
                    fill={selected ? '#FFFFFF' : '#E2E8F0'}
                    stroke="#070C16"
                    strokeWidth="3.5"
                    paintOrder="stroke"
                    strokeLinejoin="round"
                  >
                    {isDhaka ? 'Dhaka (HQ)' : region.name}
                  </text>

                  {/* Subtle tier sub-tag */}
                  <text
                    x={geo.labelDx}
                    y={labelY + 11}
                    textAnchor="middle"
                    fontSize="8.2"
                    fontWeight="600"
                    letterSpacing="0.5"
                    fill={style.color}
                    stroke="#070C16"
                    strokeWidth="2.8"
                    paintOrder="stroke"
                  >
                    {meta.sectorTier === 'CENTRAL_HQ'
                      ? 'CENTRAL HQ'
                      : meta.sectorTier === 'SIA_TIER_3'
                        ? 'SIA · T3'
                        : meta.sectorTier === 'SAB_TIER_2'
                          ? 'SAB · T2'
                          : 'POLICE · T1'}
                  </text>

                  {/* Optional active published case count indicator */}
                  {(region.published_case_count || 0) > 0 && (
                    <g transform="translate(12, -10)">
                      <circle r="7.5" fill="#C9A45C" stroke="#070C16" strokeWidth="1.2" />
                      <text
                        textAnchor="middle"
                        y="3"
                        fontSize="8.5"
                        fontWeight="700"
                        fill="#070B13"
                      >
                        {region.published_case_count}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Icon & Institutional Tier Legend (সংকেত নির্দেশিকা) */}
        <div className="rounded-md border border-slate-800/90 bg-[#070C16] p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[#C9A45C]">
              Headquarters &amp; Tier Legend (সংকেত তালিকা)
            </span>
            <span className="text-[11px] text-slate-500">Click any division to inspect</span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {(
              ['CENTRAL_HQ', 'SIA_TIER_3', 'SAB_TIER_2', 'POLICE_TIER_1'] as SectorTier[]
            ).map((tierKey) => {
              const item = TIER_STYLES[tierKey];
              return (
                <div
                  key={tierKey}
                  className="flex items-start gap-2.5 rounded border border-slate-800/80 bg-[#0B111E]/90 px-3 py-2"
                >
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-700/80 bg-[#070B13]">
                    <SectorTierBadgeIcon tier={tierKey} className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold ${item.badgeText}`}>{item.legendTitle}</p>
                    <p className="text-[11px] text-slate-400 leading-snug">{item.legendDesc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 8-Division Quick Select Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          {regions.map((region) => {
            const selected = activeRegion?.id === region.id;
            const meta = DIVISION_COMMAND_META[region.code];
            const tierKey = meta?.sectorTier || 'POLICE_TIER_1';
            const style = TIER_STYLES[tierKey];
            return (
              <button
                key={region.id}
                type="button"
                onClick={() => onSelectRegion(region)}
                className={`rounded-md px-3 py-2 text-left text-xs font-medium transition-colors border ${
                  selected
                    ? 'border-[#C9A45C] bg-[#C9A45C]/10 text-white'
                    : 'border-slate-800 bg-[#070B13] text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="truncate font-semibold text-slate-100">{region.name}</span>
                  <SectorTierBadgeIcon tier={tierKey} className="h-3.5 w-3.5 shrink-0" />
                </div>
                <div className="mt-1 flex items-center justify-between gap-1">
                  <span className={`text-[10px] font-medium truncate ${style.badgeText}`}>
                    {tierKey === 'CENTRAL_HQ'
                      ? 'Central HQ'
                      : tierKey === 'SIA_TIER_3'
                        ? 'SIA · T3'
                        : tierKey === 'SAB_TIER_2'
                          ? 'SAB · T2'
                          : 'Police · T1'}
                  </span>
                  <span className="font-mono-tabular text-[10px] text-slate-500">
                    {region.published_case_count || 0} Cases
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Selected Division Command Profile */}
      <div className="lg:col-span-5 rounded-lg border border-slate-800 bg-[#0B111E] p-6 flex flex-col justify-between">
        {activeRegion ? (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <p className="font-mono-tabular text-xs text-[#C9A45C] tracking-wider">
                  {activeRegion.code} · {activeRegion.division_bn}
                </p>
                <h3 className="font-display text-3xl font-semibold text-white mt-1">
                  {activeRegion.name} Division
                </h3>
                <p className="text-xs text-slate-400 mt-1">{activeRegion.headquarters_label}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Published</p>
                <p className="font-mono-tabular text-2xl font-semibold text-white">
                  {activeRegion.published_case_count || 0}
                </p>
              </div>
            </div>

            {activeMeta && (
              <div
                className={`rounded-md border p-4 space-y-2 ${TIER_STYLES[activeMeta.sectorTier].badgeBg} ${TIER_STYLES[activeMeta.sectorTier].badgeBorder}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <SectorTierBadgeIcon tier={activeMeta.sectorTier} className="h-4 w-4" />
                    <span
                      className={`text-xs font-semibold uppercase tracking-wider ${TIER_STYLES[activeMeta.sectorTier].badgeText}`}
                    >
                      {activeMeta.tierBadge}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-300 font-mono-tabular">
                    <Building2 className="h-3 w-3 text-slate-400" />
                    {activeMeta.hqCity} HQ
                  </span>
                </div>
                <p className="text-sm font-medium text-white">{activeMeta.tierTitle}</p>
                <p className="text-xs text-slate-300">
                  Command Authority: <span className="text-slate-100">{activeMeta.institutionLabel}</span> · {activeMeta.commandStatus}
                </p>
              </div>
            )}

            {activeRegion.illustration_url && (
              <div className="overflow-hidden rounded-md border border-slate-800 aspect-video bg-slate-900">
                <img
                  src={activeRegion.illustration_url}
                  alt={activeRegion.name}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Regional Overview
                </h4>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  {activeRegion.description}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Operational Terrain
                </h4>
                <p className="mt-1.5 text-sm text-slate-300">{activeRegion.terrain_notes}</p>
              </div>
            </div>

            <div className="rounded-md border border-slate-800 bg-[#070B13] p-4">
              <p className="text-xs font-medium text-slate-300">
                {(activeRegion.published_case_count || 0) === 0
                  ? 'No published investigation dossiers assigned to this division yet.'
                  : `${activeRegion.published_case_count} published investigation dossier(s) currently open in ${activeRegion.name}.`}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Select a division to inspect regional briefing.</p>
        )}
      </div>
    </div>
  );
}
