import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOAD_PUBLIC_DIR = path.resolve(process.cwd(), 'uploads', 'public');
const UPLOAD_MODELS_DIR = path.resolve(process.cwd(), 'uploads', 'public', 'models');
const UPLOAD_PRIVATE_DIR = path.resolve(process.cwd(), 'uploads', 'private');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_PUBLIC_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_MODELS_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_PRIVATE_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'aurvan.db');
export const PUBLIC_UPLOADS_PATH = UPLOAD_PUBLIC_DIR;
export const MODELS_UPLOADS_PATH = UPLOAD_MODELS_DIR;
export const PRIVATE_UPLOADS_PATH = UPLOAD_PRIVATE_DIR;

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(password: string, existingSalt?: string): { salt: string; hash: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  if (derived.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuf);
}

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS institutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      description TEXT NOT NULL,
      responsibilities_json TEXT NOT NULL DEFAULT '[]',
      progression_notes TEXT NOT NULL DEFAULT '',
      logo_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ranks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      level_order INTEGER NOT NULL,
      min_cases_required INTEGER NOT NULL DEFAULT 0,
      min_score_required INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      division_bn TEXT NOT NULL,
      headquarters_label TEXT NOT NULL,
      description TEXT NOT NULL,
      terrain_notes TEXT NOT NULL DEFAULT '',
      map_x REAL NOT NULL,
      map_y REAL NOT NULL,
      illustration_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      player_code TEXT UNIQUE NOT NULL,
      institution_id INTEGER NOT NULL REFERENCES institutions(id),
      rank_id INTEGER NOT NULL REFERENCES ranks(id),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      reset_token TEXT,
      reset_expires_at TEXT,
      bio TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'PLAYER' CHECK (role IN ('PLAYER', 'ADMIN', 'SUPER_ADMIN')),
      granted_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      folder TEXT NOT NULL DEFAULT 'general',
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      url TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'upload',
      uploaded_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      case_code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      short_description TEXT NOT NULL DEFAULT '',
      full_story TEXT NOT NULL DEFAULT '',
      institution_id INTEGER NOT NULL REFERENCES institutions(id),
      region_id INTEGER NOT NULL REFERENCES regions(id),
      difficulty TEXT NOT NULL DEFAULT 'STANDARD' CHECK (difficulty IN ('STANDARD', 'INTERMEDIATE', 'ADVANCED', 'CLASSIFIED')),
      estimated_duration TEXT NOT NULL DEFAULT '60 mins',
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_REVIEW', 'READY_TO_PUBLISH', 'PUBLISHED', 'ARCHIVED')),
      cover_image_url TEXT,
      thumbnail_url TEXT,
      gallery_json TEXT NOT NULL DEFAULT '[]',
      player_tasks_json TEXT NOT NULL DEFAULT '[]',
      evaluation_criteria_json TEXT NOT NULL DEFAULT '[]',
      min_rank_order INTEGER NOT NULL DEFAULT 1,
      published_at TEXT,
      created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      is_confidential INTEGER NOT NULL DEFAULT 1,
      case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
      uploaded_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audio_assets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      transcript TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      url TEXT NOT NULL,
      case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
      chapter_number INTEGER NOT NULL DEFAULT 1,
      uploaded_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS case_chapters (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      chapter_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      briefing_text TEXT NOT NULL,
      unlock_condition TEXT NOT NULL DEFAULT 'IMMEDIATE'
    );

    CREATE TABLE IF NOT EXISTS case_evidence (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      evidence_code TEXT NOT NULL,
      title TEXT NOT NULL,
      evidence_type TEXT NOT NULL DEFAULT 'DOCUMENT',
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT,
      document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
      audio_id TEXT REFERENCES audio_assets(id) ON DELETE SET NULL,
      chapter_number INTEGER NOT NULL DEFAULT 1,
      access_condition TEXT NOT NULL DEFAULT 'IMMEDIATE',
      related_characters_json TEXT NOT NULL DEFAULT '[]',
      related_evidence_json TEXT NOT NULL DEFAULT '[]',
      private_explanation TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 1,
      is_visible INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS case_characters (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      portrait_url TEXT,
      description TEXT NOT NULL DEFAULT '',
      background TEXT NOT NULL DEFAULT '',
      relationships_json TEXT NOT NULL DEFAULT '[]',
      private_info TEXT NOT NULL DEFAULT '',
      is_public INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS case_witnesses (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      portrait_url TEXT,
      statement_text TEXT NOT NULL DEFAULT '',
      chapter_number INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS interrogation_questions (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      witness_id TEXT NOT NULL REFERENCES case_witnesses(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      response_text TEXT NOT NULL,
      follow_up_hint TEXT NOT NULL DEFAULT '',
      hidden_evaluation_rule TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS case_hints (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      chapter_number INTEGER NOT NULL DEFAULT 1,
      hint_order INTEGER NOT NULL DEFAULT 1,
      hint_text TEXT NOT NULL,
      unlock_condition TEXT NOT NULL DEFAULT 'ON_REQUEST',
      is_enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS case_solutions (
      case_id TEXT PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
      master_solution TEXT NOT NULL DEFAULT '',
      actual_timeline_json TEXT NOT NULL DEFAULT '[]',
      responsible_character TEXT NOT NULL DEFAULT '',
      evidence_explanations_json TEXT NOT NULL DEFAULT '[]',
      red_herrings_json TEXT NOT NULL DEFAULT '[]',
      critical_clues_json TEXT NOT NULL DEFAULT '[]',
      internal_notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS case_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'COMPLETED')),
      current_chapter INTEGER NOT NULL DEFAULT 1,
      unlocked_hints_json TEXT NOT NULL DEFAULT '[]',
      asked_questions_json TEXT NOT NULL DEFAULT '[]',
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, case_id)
    );

    CREATE TABLE IF NOT EXISTS player_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, case_id)
    );

    CREATE TABLE IF NOT EXISTS investigation_timeline (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      event_time TEXT NOT NULL,
      event_title TEXT NOT NULL,
      event_notes TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS evidence_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      source_evidence_id TEXT NOT NULL REFERENCES case_evidence(id) ON DELETE CASCADE,
      target_evidence_id TEXT NOT NULL REFERENCES case_evidence(id) ON DELETE CASCADE,
      connection_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS case_reports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      suspect_identified TEXT NOT NULL,
      reasoning_text TEXT NOT NULL,
      evidence_references_json TEXT NOT NULL DEFAULT '[]',
      timeline_summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
      submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS report_evaluations (
      id TEXT PRIMARY KEY,
      report_id TEXT UNIQUE NOT NULL REFERENCES case_reports(id) ON DELETE CASCADE,
      evaluated_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      score INTEGER NOT NULL DEFAULT 0,
      decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
      feedback TEXT NOT NULL DEFAULT '',
      career_action TEXT NOT NULL DEFAULT '',
      evaluated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS career_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      from_institution_id INTEGER REFERENCES institutions(id),
      to_institution_id INTEGER REFERENCES institutions(id),
      from_rank_id INTEGER REFERENCES ranks(id),
      to_rank_id INTEGER REFERENCES ranks(id),
      reason TEXT NOT NULL,
      recorded_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS site_content (
      key TEXT PRIMARY KEY,
      section_group TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      media_url TEXT,
      is_visible INTEGER NOT NULL DEFAULT 1,
      extra_json TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      admin_email TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS models_3d (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'GLB' CHECK (format IN ('GLB', 'GLTF')),
      mime_type TEXT NOT NULL DEFAULT 'model/gltf-binary',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      url TEXT NOT NULL DEFAULT '',
      storage_path TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'UPLOAD' CHECK (source_type IN ('UPLOAD', 'AI_CONVERSION')),
      source_image_url TEXT,
      linked_entity_type TEXT,
      linked_entity_id TEXT,
      provider TEXT NOT NULL DEFAULT 'manual',
      external_task_id TEXT,
      progress INTEGER NOT NULL DEFAULT 100,
      status TEXT NOT NULL DEFAULT 'READY' CHECK (status IN ('QUEUED', 'PROCESSING', 'READY', 'FAILED')),
      error_message TEXT NOT NULL DEFAULT '',
      uploaded_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
    CREATE INDEX IF NOT EXISTS idx_cases_region ON cases(region_id);
    CREATE INDEX IF NOT EXISTS idx_cases_institution ON cases(institution_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_reports_user ON case_reports(user_id);
    CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_models_3d_entity ON models_3d(linked_entity_type, linked_entity_id);
  `);

  const ensureColumn = (table: string, column: string, definition: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  ensureColumn('media_assets', 'model_3d_id', 'TEXT REFERENCES models_3d(id) ON DELETE SET NULL');
  ensureColumn('media_assets', 'preferred_view', "TEXT NOT NULL DEFAULT 'STANDARD'");
  ensureColumn('documents', 'model_3d_id', 'TEXT REFERENCES models_3d(id) ON DELETE SET NULL');
  ensureColumn('documents', 'preferred_view', "TEXT NOT NULL DEFAULT 'STANDARD'");
  ensureColumn('case_evidence', 'model_3d_id', 'TEXT REFERENCES models_3d(id) ON DELETE SET NULL');
  ensureColumn('case_evidence', 'preferred_view', "TEXT NOT NULL DEFAULT 'STANDARD'");
  ensureColumn('case_characters', 'model_3d_id', 'TEXT REFERENCES models_3d(id) ON DELETE SET NULL');
  ensureColumn('case_characters', 'preferred_view', "TEXT NOT NULL DEFAULT 'STANDARD'");
  ensureColumn('cases', 'scene_3d_model_id', 'TEXT REFERENCES models_3d(id) ON DELETE SET NULL');
  ensureColumn('cases', 'scene_preferred_view', "TEXT NOT NULL DEFAULT 'STANDARD'");

  seedInitialData();
}

function seedInitialData(): void {
  const instCount = db.prepare('SELECT COUNT(*) as c FROM institutions').get() as { c: number };
  if (instCount.c === 0) {
    const insertInst = db.prepare(`
      INSERT INTO institutions (code, name, short_name, tagline, description, responsibilities_json, progression_notes, logo_url, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertInst.run(
      'AURVAN_POLICE',
      'AURVAN POLICE',
      'AURVAN POLICE',
      'Law · Order · Safety',
      'The foundational investigative institution of AURVAN UNIVERSE. Newly inducted analysts begin their career here, mastering field observation, forensic documentation, witness interviews, and regional case reconstruction across Bangladesh.',
      JSON.stringify([
        'Primary crime scene preservation and physical evidence cataloging',
        'District-level witness interviews and timeline reconstruction',
        'Document verification and municipal record cross-referencing',
        'Preparing foundational analytical case reports for review',
      ]),
      'Entry tier for all newly registered investigators. Successful completion of foundational cases qualifies investigators for promotion toward SAB.',
      '/assets/aistudio/file_00000000893c8211af5348f9c1bdddb0_633903a5.png',
      1
    );

    insertInst.run(
      'SAB',
      'SAB — Special Action Battalion',
      'SAB',
      'Tactical Inquiry · Rapid Analysis',
      'The second-tier specialized investigative command within AURVAN UNIVERSE. SAB handles complex multi-district networks, high-stakes maritime and transit anomalies, coordinated digital forensics, and rapid-response tactical inquiries.',
      JSON.stringify([
        'Cross-division organized network analysis and financial tracing',
        'Complex audio intercept transcription and voice correlation',
        'High-pressure interrogation sequences and contradiction detection',
        'Multi-chapter tactical operations across urban and riverine sectors',
      ]),
      'Mid-career elite division unlocked after demonstrating consistent analytical precision and high evaluation scores in AURVAN POLICE.',
      '/assets/aistudio/file_000000000bd08211acdd3915c209f158_96896452.png',
      2
    );

    insertInst.run(
      'SIA',
      'SIA — State Intelligence Agency',
      'SIA',
      'Strategic Intelligence · National Archive',
      'The highest investigative institution in AURVAN UNIVERSE. SIA analysts confront classified geopolitical puzzles, deep archival conspiracies, cryptographic ciphers, and systemic threats requiring supreme deductive rigor.',
      JSON.stringify([
        'Classified strategic counter-intelligence and archival investigations',
        'Deep-cover behavioral profiling and multi-layered deception analysis',
        'Inter-regional intelligence synthesis across all eight divisions',
        'High-clearance oversight and master dossier verification',
      ]),
      'Apex investigative institution reserved for senior analysts who have mastered both AURVAN POLICE and SAB assignments.',
      '/assets/aistudio/file_00000000f28082118b380bed63b951cc_406a7688.png',
      3
    );
  }

  const rankCount = db.prepare('SELECT COUNT(*) as c FROM ranks').get() as { c: number };
  if (rankCount.c === 0) {
    const insts = db.prepare('SELECT id, code FROM institutions').all() as Array<{ id: number; code: string }>;
    const byCode = Object.fromEntries(insts.map((i) => [i.code, i.id]));
    const insertRank = db.prepare(`
      INSERT INTO ranks (institution_id, code, title, level_order, min_cases_required, min_score_required, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // AURVAN POLICE ranks
    insertRank.run(byCode['AURVAN_POLICE'], 'AP_CADET', 'Probationary Investigator', 1, 0, 0, 'Initial field clearance for standard district dossiers.');
    insertRank.run(byCode['AURVAN_POLICE'], 'AP_INSPECTOR', 'Case Inspector', 2, 2, 70, 'Cleared for multi-chapter civic and forensic inquiries.');
    insertRank.run(byCode['AURVAN_POLICE'], 'AP_SENIOR', 'Senior Precinct Analyst', 3, 5, 75, 'Eligible for SAB transfer evaluation.');

    // SAB ranks
    insertRank.run(byCode['SAB'], 'SAB_OPERATIVE', 'Special Inquiry Officer', 1, 6, 78, 'Entry specialist rank within Special Action Battalion.');
    insertRank.run(byCode['SAB'], 'SAB_COMMANDER', 'Tactical Unit Lead', 2, 9, 82, 'Commands complex cross-division investigative files.');
    insertRank.run(byCode['SAB'], 'SAB_DIRECTOR', 'Deputy Battalion Chief', 3, 12, 85, 'Eligible for SIA strategic intelligence vetting.');

    // SIA ranks
    insertRank.run(byCode['SIA'], 'SIA_ANALYST', 'Intelligence Officer', 1, 14, 88, 'Cleared for classified archival and strategic dossiers.');
    insertRank.run(byCode['SIA'], 'SIA_SENIOR', 'Senior Directorate Fellow', 2, 18, 90, 'Lead analyst on sovereign-level fictional inquiries.');
    insertRank.run(byCode['SIA'], 'SIA_CHIEF', 'Principal Archive Director', 3, 22, 92, 'Highest attainable investigative distinction in AURVAN.');
  }

  const regCount = db.prepare('SELECT COUNT(*) as c FROM regions').get() as { c: number };
  if (regCount.c === 0) {
    const insertRegion = db.prepare(`
      INSERT INTO regions (code, name, division_bn, headquarters_label, description, terrain_notes, map_x, map_y, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const divisions = [
      ['DHK', 'Dhaka', 'ঢাকা', 'Central Metro Command', 'Administrative heartland of riverine terminals, financial districts, dense transit corridors, and archival ministries.', 'Urban megacity & Buriganga-Shitalakshya river network', 52, 50],
      ['CTG', 'Chattogram', 'চট্টগ্রাম', 'Maritime & Hill Sector', 'Deep-water maritime port, coastal shipping lanes, industrial export zones, and forested hill tracts.', 'Seaport terminals, Bay coastline & Chittagong Hill Tracts', 77, 70],
      ['RAJ', 'Rajshahi', 'রাজশাহী', 'Padma Basin Station', 'Historic Silk City corridor along the Padma river with academic campuses, heritage estates, and border rail junctions.', 'Alluvial plains & western rail transit routes', 27, 42],
      ['KHL', 'Khulna', 'খুলনা', 'Sundarbans Estuary Post', 'Southern industrial port and gateway to the mangrove delta, shipyards, and tidal waterways.', 'Mangrove channels, Mongla port corridor & coastal embankments', 36, 72],
      ['BAR', 'Barishal', 'বরিশাল', 'Deltaic River Command', 'Intricate labyrinth of southern rivers, nocturnal launch terminals, and isolated island municipalities.', 'Interconnected estuarine waterways & river ports', 51, 77],
      ['SYL', 'Sylhet', 'সিলেট', 'Northeast Valley Bureau', 'Tea estate highlands, limestone quarries, wetland haors, and misty borderland passes.', 'Haor wetlands, rolling tea hills & northeastern valleys', 78, 34],
      ['RNG', 'Rangpur', 'রংপুর', 'Northern Teesta Post', 'Northern agricultural heartland, Teesta river barrages, historic cantonments, and northern transit hubs.', 'Teesta floodplain & northern frontier highways', 31, 20],
      ['MYM', 'Mymensingh', 'ময়মনসিংহ', 'Brahmaputra Sector', 'Old Brahmaputra river basin, research institutes, garo foothill routes, and central-north rail links.', 'Brahmaputra basin & Garo foothill corridors', 54, 33],
    ];
    for (const d of divisions) {
      insertRegion.run(...d);
    }
  }

  const settingsCount = db.prepare('SELECT COUNT(*) as c FROM site_settings').get() as { c: number };
  if (settingsCount.c === 0) {
    const insertSetting = db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?)');
    insertSetting.run('site_title', 'AURVAN UNIVERSE');
    insertSetting.run('site_subtitle', 'Independent Fictional Investigation Platform');
    insertSetting.run('platform_logo_url', '/assets/aistudio/Picsart_26-11-18_14-53-47-026_fe064427.png');
    insertSetting.run('favicon_url', '');
    insertSetting.run('contact_email', 'archive@aurvan-universe.org');
    insertSetting.run('registration_enabled', 'true');
    insertSetting.run('maintenance_mode', 'false');
    insertSetting.run('social_facebook', '');
    insertSetting.run('social_youtube', '');
    insertSetting.run('social_discord', '');
    insertSetting.run('theme_accent', '#C9A45C');
  }

  const contentCount = db.prepare('SELECT COUNT(*) as c FROM site_content').get() as { c: number };
  if (contentCount.c === 0) {
    const insertContent = db.prepare(`
      INSERT INTO site_content (key, section_group, title, body, media_url, is_visible, extra_json)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);

    insertContent.run(
      'hero',
      'homepage',
      'Every Clue Leaves a Trace Across the Delta',
      'AURVAN UNIVERSE is an independent fictional investigation and critical-thinking platform inspired by Bangladesh. Examine authentic-style evidence dossiers, reconstruct timelines, question witnesses, and advance through three fictional investigative institutions.',
      '/src/assets/images/hero_aurvan_backdrop_1794990312662.jpg',
      JSON.stringify({
        eyebrow: 'Fictional Investigative Universe · Inspired by Bangladesh',
        primaryCta: 'Enter Case Library',
        secondaryCta: 'Explore Institutions',
      })
    );

    insertContent.run(
      'universe_intro',
      'homepage',
      'Built for Analytical Rigor and Deduction',
      'Set within a grounded fictional world shaped by Bangladesh’s rivers, ports, cities, and heritage corridors, AURVAN UNIVERSE challenges investigators to separate verifiable evidence from assumption. Every dossier requires patient reading, cross-referencing, and disciplined reasoning.',
      null,
      null
    );

    insertContent.run(
      'about_universe',
      'universe',
      'The AURVAN UNIVERSE Mandate',
      'AURVAN UNIVERSE is strictly a fictional entertainment and educational initiative. It is not affiliated with any real government agency, law enforcement force, or intelligence service. All institutions, cases, characters, and dossiers exist purely to cultivate critical thinking, structured research, teamwork, and responsible decision-making.',
      null,
      null
    );

    insertContent.run(
      'announcement_banner',
      'global',
      'Platform Readiness',
      'Welcome to AURVAN UNIVERSE. Official investigative dossiers are published directly by the Directorate.',
      null,
      null
    );

    insertContent.run(
      'footer_disclaimer',
      'footer',
      'Independent Fictional Platform Notice',
      'AURVAN UNIVERSE is an independent fictional investigation and educational mystery platform inspired by Bangladesh. It is not a real government agency, police department, intelligence service, or law enforcement organization.',
      null,
      null
    );
  }

  // Register official uploaded emblems and hero backdrop in Media Library so admin can inspect/manage/replace them
  const mediaCount = db.prepare('SELECT COUNT(*) as c FROM media_assets').get() as { c: number };
  if (mediaCount.c === 0) {
    const insertMedia = db.prepare(`
      INSERT INTO media_assets (id, title, file_name, folder, mime_type, size_bytes, url, source_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'system')
    `);
    insertMedia.run(
      'media_logo_aurvan',
      'AURVAN UNIVERSE Official Logo',
      'aurvan_universe_logo.png',
      'logos',
      'image/png',
      512000,
      '/assets/aistudio/Picsart_26-11-18_14-53-47-026_fe064427.png'
    );
    insertMedia.run(
      'media_logo_police',
      'AURVAN POLICE Official Emblem',
      'aurvan_police_emblem.png',
      'logos',
      'image/png',
      480000,
      '/assets/aistudio/file_00000000893c8211af5348f9c1bdddb0_633903a5.png'
    );
    insertMedia.run(
      'media_logo_sab',
      'SAB Special Action Battalion Emblem',
      'sab_emblem.png',
      'logos',
      'image/png',
      495000,
      '/assets/aistudio/file_000000000bd08211acdd3915c209f158_96896452.png'
    );
    insertMedia.run(
      'media_logo_sia',
      'SIA State Intelligence Agency Emblem',
      'sia_emblem.png',
      'logos',
      'image/png',
      470000,
      '/assets/aistudio/file_00000000f28082118b380bed63b951cc_406a7688.png'
    );
    insertMedia.run(
      'media_hero_backdrop',
      'AURVAN Command Archive Backdrop',
      'hero_aurvan_backdrop.jpg',
      'banners',
      'image/jpeg',
      380000,
      '/src/assets/images/hero_aurvan_backdrop_1794990312662.jpg'
    );
  }

  // Ensure official transparent PNG logo replaces the earlier default if still active
  const legacyLogo = '/assets/aistudio/file_00000000a13c81fa84e8422b38a192dc_031441f8.png';
  const officialPngLogo = '/assets/aistudio/Picsart_26-11-18_14-53-47-026_fe064427.png';
  db.prepare("UPDATE site_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'platform_logo_url' AND value = ?").run(
    officialPngLogo,
    legacyLogo
  );
  db.prepare("UPDATE media_assets SET url = ? WHERE id = 'media_logo_aurvan' AND url = ?").run(
    officialPngLogo,
    legacyLogo
  );

  // Bootstrap Super Admin account securely (scrypt salt + hash only; never plaintext in source or DB)
  const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'muttakiadnansami@gmail.com').toLowerCase().trim();
  const existingAdmin = db.prepare('SELECT id FROM profiles WHERE lower(email) = ?').get(adminEmail) as { id: string } | undefined;

  if (!existingAdmin) {
    const siaInst = db.prepare("SELECT id FROM institutions WHERE code = 'SIA'").get() as { id: number };
    const siaTopRank = db.prepare("SELECT id FROM ranks WHERE code = 'SIA_CHIEF'").get() as { id: number };
    const adminId = 'usr_super_admin_001';

    let salt = 'cae6677739c063d10bb3f8a7f8b39f0e';
    let hash = 'eedf921985325ed34f1cc3ceeb82b05193d0542a05191b4687e78c25925eb92c088c6de6e38f7c76d22e0f123f4f02988d4b5c2725975b8fb72e2b58467da2ae';

    if (process.env.BOOTSTRAP_ADMIN_PASSWORD && process.env.BOOTSTRAP_ADMIN_PASSWORD.trim().length > 0) {
      const derived = hashPassword(process.env.BOOTSTRAP_ADMIN_PASSWORD.trim());
      salt = derived.salt;
      hash = derived.hash;
    }

    db.prepare(`
      INSERT INTO profiles (id, email, full_name, password_hash, password_salt, player_code, institution_id, rank_id, status, email_verified, bio)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?)
    `).run(
      adminId,
      adminEmail,
      'Directorate Super Admin',
      hash,
      salt,
      'AUR-DIR-0001',
      siaInst.id,
      siaTopRank.id,
      'Platform Super Administrator for AURVAN UNIVERSE.'
    );

    db.prepare(`
      INSERT INTO user_roles (user_id, role, granted_by)
      VALUES (?, 'SUPER_ADMIN', 'SYSTEM_BOOTSTRAP')
    `).run(adminId);

    db.prepare(`
      INSERT INTO admin_logs (id, admin_id, admin_email, action, target_type, target_id, details)
      VALUES (?, ?, ?, 'SYSTEM_BOOTSTRAP', 'USER', ?, 'Initial Super Admin account provisioned.')
    `).run(`log_${crypto.randomUUID()}`, adminId, adminEmail, adminId);
  }
}

export function writeAdminLog(
  adminId: string | null,
  adminEmail: string,
  action: string,
  targetType: string,
  targetId: string,
  details: string
): void {
  db.prepare(`
    INSERT INTO admin_logs (id, admin_id, admin_email, action, target_type, target_id, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(`log_${crypto.randomUUID()}`, adminId, adminEmail, action, targetType, targetId, details);
}
