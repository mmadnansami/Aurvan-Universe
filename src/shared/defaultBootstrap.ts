import type { Institution, Rank, Region, SiteContentItem } from './types';

export interface BootstrapPayload {
  settings: Record<string, string>;
  content: Record<string, SiteContentItem>;
  institutions: Institution[];
  ranks: Rank[];
  regions: Region[];
}

export const OFFICIAL_PLATFORM_LOGO_URL =
  '/assets/aistudio/Picsart_26-11-18_14-53-47-026_fe064427.png';

export const DEFAULT_INSTITUTIONS: Institution[] = [
  {
    id: 1,
    code: 'AURVAN_POLICE',
    name: 'AURVAN POLICE',
    short_name: 'AURVAN POLICE',
    tagline: 'Law · Order · Safety',
    description:
      'The foundational investigative institution of AURVAN UNIVERSE. Newly inducted analysts begin their career here, mastering field observation, forensic documentation, witness interviews, and regional case reconstruction across Bangladesh.',
    responsibilities: [
      'Primary crime scene preservation and physical evidence cataloging',
      'District-level witness interviews and timeline reconstruction',
      'Document verification and municipal record cross-referencing',
      'Preparing foundational analytical case reports for review',
    ],
    progression_notes:
      'Entry tier for all newly registered investigators. Successful completion of foundational cases qualifies investigators for promotion toward SAB.',
    logo_url: '/assets/aistudio/file_00000000893c8211af5348f9c1bdddb0_633903a5.png',
    sort_order: 1,
  },
  {
    id: 2,
    code: 'SAB',
    name: 'SAB — Special Action Battalion',
    short_name: 'SAB',
    tagline: 'Tactical Inquiry · Rapid Analysis',
    description:
      'The second-tier specialized investigative command within AURVAN UNIVERSE. SAB handles complex multi-district networks, high-stakes maritime and transit anomalies, coordinated digital forensics, and rapid-response tactical inquiries.',
    responsibilities: [
      'Cross-division organized network analysis and financial tracing',
      'Complex audio intercept transcription and voice correlation',
      'High-pressure interrogation sequences and contradiction detection',
      'Multi-chapter tactical operations across urban and riverine sectors',
    ],
    progression_notes:
      'Mid-career elite division unlocked after demonstrating consistent analytical precision and high evaluation scores in AURVAN POLICE.',
    logo_url: '/assets/aistudio/file_000000000bd08211acdd3915c209f158_96896452.png',
    sort_order: 2,
  },
  {
    id: 3,
    code: 'SIA',
    name: 'SIA — State Intelligence Agency',
    short_name: 'SIA',
    tagline: 'Strategic Intelligence · National Archive',
    description:
      'The highest investigative institution in AURVAN UNIVERSE. SIA analysts confront classified geopolitical puzzles, deep archival conspiracies, cryptographic ciphers, and systemic threats requiring supreme deductive rigor.',
    responsibilities: [
      'Classified strategic counter-intelligence and archival investigations',
      'Deep-cover behavioral profiling and multi-layered deception analysis',
      'Inter-regional intelligence synthesis across all eight divisions',
      'High-clearance oversight and master dossier verification',
    ],
    progression_notes:
      'Apex investigative institution reserved for senior analysts who have mastered both AURVAN POLICE and SAB assignments.',
    logo_url: '/assets/aistudio/file_00000000f28082118b380bed63b951cc_406a7688.png',
    sort_order: 3,
  },
];

export const DEFAULT_RANKS: Rank[] = [
  {
    id: 1,
    institution_id: 1,
    institution_code: 'AURVAN_POLICE',
    institution_name: 'AURVAN POLICE',
    code: 'AP_CADET',
    title: 'Probationary Investigator',
    level_order: 1,
    min_cases_required: 0,
    min_score_required: 0,
    description: 'Initial field clearance for standard district dossiers.',
  },
  {
    id: 2,
    institution_id: 1,
    institution_code: 'AURVAN_POLICE',
    institution_name: 'AURVAN POLICE',
    code: 'AP_INSPECTOR',
    title: 'Case Inspector',
    level_order: 2,
    min_cases_required: 2,
    min_score_required: 70,
    description: 'Cleared for multi-chapter civic and forensic inquiries.',
  },
  {
    id: 3,
    institution_id: 1,
    institution_code: 'AURVAN_POLICE',
    institution_name: 'AURVAN POLICE',
    code: 'AP_SENIOR',
    title: 'Senior Precinct Analyst',
    level_order: 3,
    min_cases_required: 5,
    min_score_required: 75,
    description: 'Eligible for SAB transfer evaluation.',
  },
  {
    id: 4,
    institution_id: 2,
    institution_code: 'SAB',
    institution_name: 'SAB — Special Action Battalion',
    code: 'SAB_OPERATIVE',
    title: 'Special Inquiry Officer',
    level_order: 1,
    min_cases_required: 6,
    min_score_required: 78,
    description: 'Entry specialist rank within Special Action Battalion.',
  },
  {
    id: 5,
    institution_id: 2,
    institution_code: 'SAB',
    institution_name: 'SAB — Special Action Battalion',
    code: 'SAB_COMMANDER',
    title: 'Tactical Unit Lead',
    level_order: 2,
    min_cases_required: 9,
    min_score_required: 82,
    description: 'Commands complex cross-division investigative files.',
  },
  {
    id: 6,
    institution_id: 2,
    institution_code: 'SAB',
    institution_name: 'SAB — Special Action Battalion',
    code: 'SAB_DIRECTOR',
    title: 'Deputy Battalion Chief',
    level_order: 3,
    min_cases_required: 12,
    min_score_required: 85,
    description: 'Eligible for SIA strategic intelligence vetting.',
  },
  {
    id: 7,
    institution_id: 3,
    institution_code: 'SIA',
    institution_name: 'SIA — State Intelligence Agency',
    code: 'SIA_ANALYST',
    title: 'Intelligence Officer',
    level_order: 1,
    min_cases_required: 14,
    min_score_required: 88,
    description: 'Cleared for classified archival and strategic dossiers.',
  },
  {
    id: 8,
    institution_id: 3,
    institution_code: 'SIA',
    institution_name: 'SIA — State Intelligence Agency',
    code: 'SIA_SENIOR',
    title: 'Senior Directorate Fellow',
    level_order: 2,
    min_cases_required: 18,
    min_score_required: 90,
    description: 'Lead analyst on sovereign-level fictional inquiries.',
  },
  {
    id: 9,
    institution_id: 3,
    institution_code: 'SIA',
    institution_name: 'SIA — State Intelligence Agency',
    code: 'SIA_CHIEF',
    title: 'Principal Archive Director',
    level_order: 3,
    min_cases_required: 22,
    min_score_required: 92,
    description: 'Highest attainable investigative distinction in AURVAN.',
  },
];

export const DEFAULT_REGIONS: Region[] = [
  {
    id: 1,
    code: 'DHK',
    name: 'Dhaka',
    division_bn: 'ঢাকা',
    headquarters_label: 'Central Metro Command',
    description:
      'Administrative heartland of riverine terminals, financial districts, dense transit corridors, and archival ministries.',
    terrain_notes: 'Urban megacity & Buriganga-Shitalakshya river network',
    map_x: 52,
    map_y: 50,
    illustration_url: null,
    is_active: true,
    published_case_count: 0,
  },
  {
    id: 2,
    code: 'CTG',
    name: 'Chattogram',
    division_bn: 'চট্টগ্রাম',
    headquarters_label: 'Maritime & Hill Sector',
    description:
      'Deep-water maritime port, coastal shipping lanes, industrial export zones, and forested hill tracts.',
    terrain_notes: 'Seaport terminals, Bay coastline & Chittagong Hill Tracts',
    map_x: 77,
    map_y: 70,
    illustration_url: null,
    is_active: true,
    published_case_count: 0,
  },
  {
    id: 3,
    code: 'RAJ',
    name: 'Rajshahi',
    division_bn: 'রাজশাহী',
    headquarters_label: 'Padma Basin Station',
    description:
      'Historic Silk City corridor along the Padma river with academic campuses, heritage estates, and border rail junctions.',
    terrain_notes: 'Alluvial plains & western rail transit routes',
    map_x: 27,
    map_y: 42,
    illustration_url: null,
    is_active: true,
    published_case_count: 0,
  },
  {
    id: 4,
    code: 'KHL',
    name: 'Khulna',
    division_bn: 'খুলনা',
    headquarters_label: 'Sundarbans Estuary Post',
    description:
      'Southern industrial port and gateway to the mangrove delta, shipyards, and tidal waterways.',
    terrain_notes: 'Mangrove channels, Mongla port corridor & coastal embankments',
    map_x: 36,
    map_y: 72,
    illustration_url: null,
    is_active: true,
    published_case_count: 0,
  },
  {
    id: 5,
    code: 'BAR',
    name: 'Barishal',
    division_bn: 'বরিশাল',
    headquarters_label: 'Deltaic River Command',
    description:
      'Intricate labyrinth of southern rivers, nocturnal launch terminals, and isolated island municipalities.',
    terrain_notes: 'Interconnected estuarine waterways & river ports',
    map_x: 51,
    map_y: 77,
    illustration_url: null,
    is_active: true,
    published_case_count: 0,
  },
  {
    id: 6,
    code: 'SYL',
    name: 'Sylhet',
    division_bn: 'সিলেট',
    headquarters_label: 'Northeast Valley Bureau',
    description:
      'Tea estate highlands, limestone quarries, wetland haors, and misty borderland passes.',
    terrain_notes: 'Haor wetlands, rolling tea hills & northeastern valleys',
    map_x: 78,
    map_y: 34,
    illustration_url: null,
    is_active: true,
    published_case_count: 0,
  },
  {
    id: 7,
    code: 'RNG',
    name: 'Rangpur',
    division_bn: 'রংপুর',
    headquarters_label: 'Northern Teesta Post',
    description:
      'Northern agricultural heartland, Teesta river barrages, historic cantonments, and northern transit hubs.',
    terrain_notes: 'Teesta floodplain & northern frontier highways',
    map_x: 31,
    map_y: 20,
    illustration_url: null,
    is_active: true,
    published_case_count: 0,
  },
  {
    id: 8,
    code: 'MYM',
    name: 'Mymensingh',
    division_bn: 'ময়মনসিংহ',
    headquarters_label: 'Brahmaputra Sector',
    description:
      'Old Brahmaputra river basin, research institutes, garo foothill routes, and central-north rail links.',
    terrain_notes: 'Brahmaputra basin & Garo foothill corridors',
    map_x: 54,
    map_y: 33,
    illustration_url: null,
    is_active: true,
    published_case_count: 0,
  },
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  site_title: 'AURVAN UNIVERSE',
  site_subtitle: 'Independent Fictional Investigation Platform',
  platform_logo_url: OFFICIAL_PLATFORM_LOGO_URL,
  favicon_url: '',
  contact_email: 'archive@aurvan-universe.org',
  registration_enabled: 'true',
  maintenance_mode: 'false',
  social_facebook: '',
  social_youtube: '',
  social_discord: '',
  theme_accent: '#C9A45C',
};

export const DEFAULT_CONTENT: Record<string, SiteContentItem> = {
  hero: {
    key: 'hero',
    section_group: 'homepage',
    title: 'Every Clue Leaves a Trace Across the Delta',
    body: 'AURVAN UNIVERSE is an independent fictional investigation and critical-thinking platform inspired by Bangladesh. Examine authentic-style evidence dossiers, reconstruct timelines, question witnesses, and advance through three fictional investigative institutions.',
    media_url: '/src/assets/images/hero_aurvan_backdrop_1794990312662.jpg',
    is_visible: true,
    extra_json: JSON.stringify({
      eyebrow: 'Fictional Investigative Universe · Inspired by Bangladesh',
      primaryCta: 'Enter Case Library',
      secondaryCta: 'Explore Institutions',
    }),
  },
  universe_intro: {
    key: 'universe_intro',
    section_group: 'homepage',
    title: 'Built for Analytical Rigor and Deduction',
    body: 'Set within a grounded fictional world shaped by Bangladesh’s rivers, ports, cities, and heritage corridors, AURVAN UNIVERSE challenges investigators to separate verifiable evidence from assumption. Every dossier requires patient reading, cross-referencing, and disciplined reasoning.',
    media_url: null,
    is_visible: true,
    extra_json: null,
  },
  about_universe: {
    key: 'about_universe',
    section_group: 'universe',
    title: 'The AURVAN UNIVERSE Mandate',
    body: 'AURVAN UNIVERSE is strictly a fictional entertainment and educational initiative. It is not affiliated with any real government agency, law enforcement force, or intelligence service. All institutions, cases, characters, and dossiers exist purely to cultivate critical thinking, structured research, teamwork, and responsible decision-making.',
    media_url: null,
    is_visible: true,
    extra_json: null,
  },
  announcement_banner: {
    key: 'announcement_banner',
    section_group: 'global',
    title: 'Platform Readiness',
    body: 'Welcome to AURVAN UNIVERSE. Official investigative dossiers are published directly by the Directorate.',
    media_url: null,
    is_visible: true,
    extra_json: null,
  },
  footer_disclaimer: {
    key: 'footer_disclaimer',
    section_group: 'footer',
    title: 'Independent Fictional Platform Notice',
    body: 'AURVAN UNIVERSE is an independent fictional investigation and educational mystery platform inspired by Bangladesh. It is not a real government agency, police department, intelligence service, or law enforcement organization.',
    media_url: null,
    is_visible: true,
    extra_json: null,
  },
};

export const DEFAULT_BOOTSTRAP_DATA: BootstrapPayload = {
  settings: DEFAULT_SETTINGS,
  content: DEFAULT_CONTENT,
  institutions: DEFAULT_INSTITUTIONS,
  ranks: DEFAULT_RANKS,
  regions: DEFAULT_REGIONS,
};

export function isValidBootstrapPayload(data: unknown): data is BootstrapPayload {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Record<string, unknown>;
  return (
    typeof candidate.settings === 'object' &&
    candidate.settings !== null &&
    typeof candidate.content === 'object' &&
    candidate.content !== null &&
    Array.isArray(candidate.institutions) &&
    candidate.institutions.length > 0 &&
    Array.isArray(candidate.ranks) &&
    candidate.ranks.length > 0 &&
    Array.isArray(candidate.regions) &&
    candidate.regions.length > 0
  );
}
