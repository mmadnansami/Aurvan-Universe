import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  DEFAULT_BOOTSTRAP_DATA,
  isValidBootstrapPayload,
  type BootstrapPayload,
} from '../shared/defaultBootstrap';
import {
  canTransitionCaseStatus,
  isPlayerEligibleForCase,
  slugifyCaseTitle,
  validateCaseForPublish,
  validateModel3DPayload,
  validateUploadFile,
} from '../shared/validation';
import type {
  AudioAsset,
  CaseStatus,
  DocumentAsset,
  Entity3DLinkType,
  MediaAsset,
  Model3DAsset,
  PreferredViewMode,
  PublicCaseSummary,
  PublicUser,
  UserRole,
} from '../shared/types';

export const BOOTSTRAP_SUPER_ADMIN_EMAIL = 'muttakiadnansami@gmail.com';
const MAX_FIRESTORE_DATA_URL_LEN = 780_000;

function randomId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand.slice(0, 24)}`;
}

function toIso(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (typeof (val as Timestamp).toDate === 'function') {
    return (val as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

function isBootstrapAdminEmail(email: string | null | undefined): boolean {
  return (email || '').trim().toLowerCase() === BOOTSTRAP_SUPER_ADMIN_EMAIL;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Failed to read file "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

async function compressImageIfNeeded(file: File): Promise<{ dataUrl: string; mimeType: string; sizeBytes: number }> {
  const rawUrl = await fileToDataUrl(file);
  if (rawUrl.length <= 450_000) {
    return { dataUrl: rawUrl, mimeType: file.type || 'image/png', sizeBytes: file.size };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1400;
      let width = img.naturalWidth || 1200;
      let height = img.naturalHeight || 900;
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not initialize image compressor.'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      let compressed = canvas.toDataURL('image/jpeg', 0.84);
      if (compressed.length > MAX_FIRESTORE_DATA_URL_LEN) {
        compressed = canvas.toDataURL('image/jpeg', 0.65);
      }
      if (compressed.length > MAX_FIRESTORE_DATA_URL_LEN) {
        reject(new Error(`Image "${file.name}" is too large even after compression. Use a smaller image.`));
        return;
      }
      resolve({
        dataUrl: compressed,
        mimeType: 'image/jpeg',
        sizeBytes: Math.round((compressed.length * 3) / 4),
      });
    };
    img.onerror = () => reject(new Error(`Invalid image file "${file.name}".`));
    img.src = rawUrl;
  });
}

async function readBoundedAssetDataUrl(file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  if (dataUrl.length > MAX_FIRESTORE_DATA_URL_LEN) {
    throw new Error(
      `File "${file.name}" exceeds the 570 KB direct cloud storage limit for this format. Please compress the file or attach a hosted URL.`
    );
  }
  return dataUrl;
}

const PUBLIC_BOOTSTRAP_CACHE_KEY = 'aurvan_cache_bootstrap_v1';
const PUBLIC_CASES_CACHE_KEY = 'aurvan_cache_cases_v1';
const PUBLISHED_CASES_MEMORY_TTL_MS = 30_000;

let publishedCasesCache: { rows: any[]; fetchedAt: number } | null = null;
let publishedCasesInFlight: Promise<any[]> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, ms);

    promise.then(
      (val) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(val);
        }
      },
      (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      }
    );
  });
}

function readLocalCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLocalCache(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

function invalidatePublicCaches(): void {
  publishedCasesCache = null;
  publishedCasesInFlight = null;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PUBLIC_BOOTSTRAP_CACHE_KEY);
    window.localStorage.removeItem(PUBLIC_CASES_CACHE_KEY);
  } catch {
    // Ignore storage errors
  }
}

async function fetchPublishedCaseRows(): Promise<any[]> {
  const now = Date.now();
  if (publishedCasesCache && now - publishedCasesCache.fetchedAt < PUBLISHED_CASES_MEMORY_TTL_MS) {
    return publishedCasesCache.rows;
  }
  if (publishedCasesInFlight) {
    return publishedCasesInFlight;
  }

  publishedCasesInFlight = (async () => {
    try {
      const snap = await withTimeout(
        getDocs(query(collection(db, 'cases'), where('status', '==', 'PUBLISHED'))),
        3500,
        null
      );
      if (snap) {
        const rows = snap.docs.map((d) => d.data());
        publishedCasesCache = { rows, fetchedAt: Date.now() };
        return rows;
      }
      const cached = readLocalCache<{ cases?: any[] }>(PUBLIC_CASES_CACHE_KEY);
      return Array.isArray(cached?.cases) ? cached.cases : [];
    } catch {
      const cached = readLocalCache<{ cases?: any[] }>(PUBLIC_CASES_CACHE_KEY);
      return Array.isArray(cached?.cases) ? cached.cases : [];
    } finally {
      publishedCasesInFlight = null;
    }
  })();

  return publishedCasesInFlight;
}

async function getRawBootstrap(timeoutMs = 3500): Promise<BootstrapPayload> {
  try {
    const snap = await withTimeout(getDoc(doc(db, 'platform', 'bootstrap')), timeoutMs, null);
    if (snap && snap.exists()) {
      const data = snap.data();
      const merged: BootstrapPayload = {
        settings: { ...DEFAULT_BOOTSTRAP_DATA.settings, ...(data.settings || {}) },
        content: { ...DEFAULT_BOOTSTRAP_DATA.content, ...(data.content || {}) },
        institutions:
          Array.isArray(data.institutions) && data.institutions.length > 0
            ? data.institutions
            : DEFAULT_BOOTSTRAP_DATA.institutions,
        ranks:
          Array.isArray(data.ranks) && data.ranks.length > 0
            ? data.ranks
            : DEFAULT_BOOTSTRAP_DATA.ranks,
        regions:
          Array.isArray(data.regions) && data.regions.length > 0
            ? data.regions
            : DEFAULT_BOOTSTRAP_DATA.regions,
      };
      if (isValidBootstrapPayload(merged)) {
        return merged;
      }
    }
  } catch {
    // Public fallback preserves site content even on network hiccups
  }
  const cached = readLocalCache<BootstrapPayload>(PUBLIC_BOOTSTRAP_CACHE_KEY);
  if (cached && isValidBootstrapPayload(cached)) {
    return cached;
  }
  return JSON.parse(JSON.stringify(DEFAULT_BOOTSTRAP_DATA)) as BootstrapPayload;
}

async function saveBootstrapPayload(payload: BootstrapPayload): Promise<void> {
  const path = 'platform/bootstrap';
  try {
    await setDoc(doc(db, 'platform', 'bootstrap'), {
      settings: payload.settings,
      content: payload.content,
      institutions: payload.institutions,
      ranks: payload.ranks,
      regions: payload.regions,
      updatedAt: serverTimestamp(),
    });
    invalidatePublicCaches();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

async function writeAdminLog(
  actor: PublicUser,
  action: string,
  targetType: string,
  targetId: string,
  summary: string
): Promise<void> {
  const id = randomId('log');
  const path = `adminLogs/${id}`;
  try {
    await setDoc(doc(db, 'adminLogs', id), {
      id,
      actor_id: actor.id,
      actor_email: (actor.email || 'admin@aurvan-universe.org').slice(0, 254),
      action: action.slice(0, 80),
      target_type: targetType.slice(0, 80),
      target_id: targetId.slice(0, 128),
      summary: summary.slice(0, 1000),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function ensureFirebaseUserProfile(firebaseUser: FirebaseUser): Promise<PublicUser> {
  const uid = firebaseUser.uid;
  const email = (firebaseUser.email || '').trim().toLowerCase();
  const isBootstrapAdmin = isBootstrapAdminEmail(email) && firebaseUser.emailVerified;

  if (isBootstrapAdmin) {
    const adminRef = doc(db, 'admins', uid);
    try {
      const adminSnap = await getDoc(adminRef);
      if (!adminSnap.exists()) {
        await setDoc(adminRef, {
          role: 'SUPER_ADMIN',
          email,
          grantedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `admins/${uid}`);
    }
  }

  const userRef = doc(db, 'users', uid);
  const privateRef = doc(db, 'users', uid, 'private', 'info');

  let userData: Record<string, any> | null = null;
  try {
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      userData = userSnap.data();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }

  if (!userData) {
    const inst = DEFAULT_BOOTSTRAP_DATA.institutions[0];
    const rank = DEFAULT_BOOTSTRAP_DATA.ranks[0];
    const role: UserRole = isBootstrapAdmin ? 'SUPER_ADMIN' : 'PLAYER';
    const playerCode = isBootstrapAdmin
      ? 'AUR-HQ-0001'
      : `AUR-2026-${uid.slice(-4).toUpperCase()}`;

    const newProfile = {
      id: uid,
      full_name: (firebaseUser.displayName || email.split('@')[0] || 'Investigator').slice(0, 120),
      player_code: playerCode,
      role,
      institution_id: inst.id,
      institution_code: inst.code,
      institution_name: inst.name,
      rank_id: rank.id,
      rank_title: rank.title,
      rank_order: rank.level_order,
      status: 'ACTIVE',
      bio: '',
      approved_cases_count: 0,
      average_score: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(userRef, newProfile);
      await setDoc(privateRef, {
        email,
        email_verified: firebaseUser.emailVerified,
        updatedAt: serverTimestamp(),
      });
      const freshSnap = await getDoc(userRef);
      userData = freshSnap.data() || newProfile;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${uid}`);
    }
  } else {
    // Sync PII private doc & elevate bootstrap admin if previously created as player
    try {
      const privSnap = await getDoc(privateRef);
      if (!privSnap.exists() || privSnap.data()?.email !== email) {
        await setDoc(privateRef, {
          email,
          email_verified: firebaseUser.emailVerified,
          updatedAt: serverTimestamp(),
        });
      }
      if (isBootstrapAdmin && userData.role !== 'SUPER_ADMIN') {
        await updateDoc(userRef, {
          role: 'SUPER_ADMIN',
          updatedAt: serverTimestamp(),
        });
        userData = { ...userData, role: 'SUPER_ADMIN' };
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  }

  // Ensure /platform/bootstrap exists when an admin connects
  if (userData.role === 'SUPER_ADMIN' || userData.role === 'ADMIN') {
    try {
      const bootSnap = await getDoc(doc(db, 'platform', 'bootstrap'));
      if (!bootSnap.exists()) {
        await saveBootstrapPayload(DEFAULT_BOOTSTRAP_DATA);
      }
    } catch {
      // Non-blocking seed check
    }
  }

  return {
    id: userData.id || uid,
    email,
    full_name: userData.full_name || 'Investigator',
    player_code: userData.player_code || `AUR-2026-${uid.slice(-4).toUpperCase()}`,
    role: userData.role || 'PLAYER',
    institution_id: Number(userData.institution_id || 1),
    institution_code: userData.institution_code || 'AURVAN_POLICE',
    institution_name: userData.institution_name || 'AURVAN POLICE',
    rank_id: Number(userData.rank_id || 1),
    rank_title: userData.rank_title || 'Probationary Investigator',
    rank_order: Number(userData.rank_order || 1),
    status: userData.status || 'ACTIVE',
    email_verified: firebaseUser.emailVerified,
    bio: userData.bio || '',
    created_at: toIso(userData.createdAt),
  };
}

async function getCurrentAppUser(): Promise<PublicUser> {
  const current = auth.currentUser;
  if (!current) {
    throw new Error('Authentication required. Please sign in.');
  }
  const user = await ensureFirebaseUserProfile(current);
  if (user.status === 'SUSPENDED') {
    throw new Error('Your account is currently suspended. Contact the Directorate.');
  }
  return user;
}

async function requireAdminUser(): Promise<PublicUser> {
  const user = await getCurrentAppUser();
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw new Error('Insufficient clearance for this restricted resource.');
  }
  return user;
}

// ── Public Operations ────────────────────────────────────────────────────────
async function handlePublicBootstrap(): Promise<BootstrapPayload> {
  const [boot, publishedCases] = await Promise.all([
    getRawBootstrap(3500),
    fetchPublishedCaseRows(),
  ]);

  const countByRegion = new Map<number, number>();
  for (const c of publishedCases) {
    const rId = Number(c.region_id);
    countByRegion.set(rId, (countByRegion.get(rId) || 0) + 1);
  }

  const payload: BootstrapPayload = {
    ...boot,
    regions: boot.regions.map((reg) => ({
      ...reg,
      published_case_count: countByRegion.get(reg.id) || 0,
    })),
  };
  writeLocalCache(PUBLIC_BOOTSTRAP_CACHE_KEY, payload);
  return payload;
}

async function handlePublicCases(searchParams: URLSearchParams): Promise<{ cases: PublicCaseSummary[] }> {
  const search = (searchParams.get('search') || '').trim().toLowerCase();
  const regionId = searchParams.get('regionId') ? Number(searchParams.get('regionId')) : null;
  const institutionId = searchParams.get('institutionId')
    ? Number(searchParams.get('institutionId'))
    : null;
  const difficulty = (searchParams.get('difficulty') || '').trim();

  const rows = await fetchPublishedCaseRows();

  const toSummary = (c: any): PublicCaseSummary => ({
    id: c.id,
    case_code: c.case_code,
    title: c.title,
    slug: c.slug,
    short_description: c.short_description,
    institution_id: c.institution_id,
    institution_code: c.institution_code,
    institution_name: c.institution_name,
    region_id: c.region_id,
    region_name: c.region_name,
    difficulty: c.difficulty,
    estimated_duration: c.estimated_duration,
    status: c.status,
    cover_image_url: c.cover_image_url || null,
    thumbnail_url: c.thumbnail_url || null,
    min_rank_order: Number(c.min_rank_order || 1),
    published_at: c.published_at || null,
  });

  if (!search && !regionId && !institutionId && !difficulty) {
    const sortedAll = [...rows]
      .sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')))
      .map(toSummary);
    writeLocalCache(PUBLIC_CASES_CACHE_KEY, { cases: sortedAll });
    return { cases: sortedAll };
  }

  const filtered = rows
    .filter((c) => {
      if (
        search &&
        !String(c.title || '').toLowerCase().includes(search) &&
        !String(c.case_code || '').toLowerCase().includes(search) &&
        !String(c.short_description || '').toLowerCase().includes(search)
      ) {
        return false;
      }
      if (regionId && Number(c.region_id) !== regionId) return false;
      if (institutionId && Number(c.institution_id) !== institutionId) return false;
      if (difficulty && c.difficulty !== difficulty) return false;
      return true;
    })
    .sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));

  return {
    cases: filtered.map(toSummary),
  };
}

async function handleHallOfFame() {
  try {
    const snap = await withTimeout(
      getDocs(query(collection(db, 'users'), where('approved_cases_count', '>', 0))),
      3500,
      null
    );
    if (!snap) return { entries: [] };
    const entries = snap.docs
      .map((d) => d.data())
      .filter((u) => u.status === 'ACTIVE' && u.role === 'PLAYER')
      .map((u) => ({
        user_id: u.id,
        full_name: u.full_name,
        player_code: u.player_code,
        institution_name: u.institution_name,
        rank_title: u.rank_title,
        approved_cases: Number(u.approved_cases_count || 0),
        average_score: Number(u.average_score || 0),
        latest_commendation_at: toIso(u.updatedAt),
      }))
      .sort(
        (a, b) => b.approved_cases - a.approved_cases || b.average_score - a.average_score
      )
      .slice(0, 50);

    return { entries };
  } catch {
    return { entries: [] };
  }
}

// ── Admin Case Bundle Loader & Helpers ───────────────────────────────────────
async function getFullCaseBundle(caseId: string) {
  let caseSnap;
  try {
    caseSnap = await getDoc(doc(db, 'cases', caseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `cases/${caseId}`);
  }
  if (!caseSnap.exists()) return null;
  const caseRow = caseSnap.data() as Record<string, any>;

  const [chSnap, evSnap, chrSnap, witSnap, intSnap, hntSnap, solSnap, docSnap, audSnap, m3dSnap] =
    await Promise.all([
      getDocs(collection(db, 'cases', caseId, 'chapters')),
      getDocs(collection(db, 'cases', caseId, 'evidence')),
      getDocs(collection(db, 'cases', caseId, 'characters')),
      getDocs(collection(db, 'cases', caseId, 'witnesses')),
      getDocs(collection(db, 'cases', caseId, 'interrogations')),
      getDocs(collection(db, 'cases', caseId, 'hints')),
      getDoc(doc(db, 'caseSolutions', caseId)),
      getDocs(collection(db, 'documents')),
      getDocs(collection(db, 'audioAssets')),
      getDocs(collection(db, 'models3d')),
    ]);

  const solutionData = solSnap.exists() ? solSnap.data() : {};
  const privEvNotes: Record<string, string> = solutionData.private_evidence_notes || {};
  const privCharNotes: Record<string, string> = solutionData.private_character_notes || {};
  const hiddenIntRules: Record<string, string> = solutionData.hidden_interrogation_rules || {};

  const readyModels = new Map<string, any>();
  for (const d of m3dSnap.docs) {
    const m = d.data();
    if (m.status === 'READY') readyModels.set(m.id, m);
  }
  const docsMap = new Map(docSnap.docs.map((d) => [d.id, d.data()]));
  const audioMap = new Map(audSnap.docs.map((d) => [d.id, d.data()]));

  const chapters = chSnap.docs
    .map((d) => d.data())
    .sort((a, b) => Number(a.chapter_number) - Number(b.chapter_number));

  const evidence = evSnap.docs
    .map((d) => {
      const ev = d.data();
      const m = ev.model_3d_id ? readyModels.get(ev.model_3d_id) : null;
      const linkedDoc = ev.document_id ? docsMap.get(ev.document_id) : null;
      const linkedAud = ev.audio_id ? audioMap.get(ev.audio_id) : null;
      return {
        ...ev,
        related_characters: ev.related_characters || [],
        related_evidence: ev.related_evidence || [],
        private_explanation: privEvNotes[ev.id] || '',
        document_title: linkedDoc?.title || null,
        document_mime: linkedDoc?.mime_type || null,
        audio_title: linkedAud?.title || null,
        audio_url: linkedAud?.url || null,
        audio_transcript: linkedAud?.transcript || null,
        model_3d_url: m?.url || null,
        model_3d_format: m?.format || null,
        model_3d_status: m?.status || null,
      };
    })
    .sort(
      (a: any, b: any) =>
        Number(a.chapter_number) - Number(b.chapter_number) ||
        Number(a.sort_order) - Number(b.sort_order)
    );

  const characters = chrSnap.docs.map((d) => {
    const ch = d.data();
    const m = ch.model_3d_id ? readyModels.get(ch.model_3d_id) : null;
    return {
      ...ch,
      relationships: ch.relationships || [],
      private_info: privCharNotes[ch.id] || '',
      model_3d_url: m?.url || null,
      model_3d_format: m?.format || null,
    };
  });

  const witnesses = witSnap.docs
    .map((d) => d.data())
    .sort((a, b) => Number(a.chapter_number) - Number(b.chapter_number));

  const questions = intSnap.docs
    .map((d) => {
      const q = d.data();
      return {
        ...q,
        hidden_evaluation_rule: hiddenIntRules[q.id] || '',
      };
    })
    .sort((a: any, b: any) => Number(a.sort_order) - Number(b.sort_order));

  const hints = hntSnap.docs
    .map((d) => d.data())
    .sort(
      (a, b) =>
        Number(a.chapter_number) - Number(b.chapter_number) ||
        Number(a.hint_order) - Number(b.hint_order)
    );

  const sceneModel = caseRow.scene_3d_model_id
    ? readyModels.get(caseRow.scene_3d_model_id)
    : null;

  const parsedCase: Record<string, any> = {
    ...caseRow,
    scene_3d_url: sceneModel?.url || caseRow.scene_3d_url || null,
    scene_3d_format: sceneModel?.format || caseRow.scene_3d_format || null,
    gallery: caseRow.gallery || [],
    player_tasks: caseRow.player_tasks || [],
    evaluation_criteria: caseRow.evaluation_criteria || [],
    created_at: toIso(caseRow.createdAt),
    updated_at: toIso(caseRow.updatedAt),
  };

  const solution = {
    case_id: caseId,
    master_solution: solutionData.master_solution || '',
    actual_timeline: solutionData.actual_timeline || [],
    responsible_character: solutionData.responsible_character || '',
    evidence_explanations: solutionData.evidence_explanations || [],
    red_herrings: solutionData.red_herrings || [],
    critical_clues: solutionData.critical_clues || [],
    internal_notes: solutionData.internal_notes || '',
  };

  const validation = validateCaseForPublish({
    case_code: parsedCase.case_code,
    title: parsedCase.title,
    short_description: parsedCase.short_description,
    full_story: parsedCase.full_story,
    institution_id: parsedCase.institution_id,
    region_id: parsedCase.region_id,
    difficulty: parsedCase.difficulty,
    estimated_duration: parsedCase.estimated_duration,
    player_tasks: parsedCase.player_tasks,
    evaluation_criteria: parsedCase.evaluation_criteria,
    chaptersCount: chapters.length,
    evidenceCount: evidence.length,
    hasMasterSolution: solSnap.exists(),
    masterSolutionText: solution.master_solution,
  });

  return {
    caseData: parsedCase,
    chapters,
    evidence,
    characters,
    witnesses,
    questions,
    hints,
    solution,
    validation,
  };
}

async function syncCaseCountsAndStatus(caseId: string, nextStatus?: CaseStatus): Promise<void> {
  const [chSnap, evSnap] = await Promise.all([
    getDocs(collection(db, 'cases', caseId, 'chapters')),
    getDocs(collection(db, 'cases', caseId, 'evidence')),
  ]);

  if (nextStatus) {
    const [chrSnap, witSnap, intSnap, hntSnap] = await Promise.all([
      getDocs(collection(db, 'cases', caseId, 'characters')),
      getDocs(collection(db, 'cases', caseId, 'witnesses')),
      getDocs(collection(db, 'cases', caseId, 'interrogations')),
      getDocs(collection(db, 'cases', caseId, 'hints')),
    ]);

    const batch = writeBatch(db);
    for (const snap of [chSnap, evSnap, chrSnap, witSnap, intSnap, hntSnap]) {
      for (const d of snap.docs) {
        batch.update(d.ref, { case_status: nextStatus });
      }
    }
    await batch.commit();
  }

  await updateDoc(doc(db, 'cases', caseId), {
    chapters_count: chSnap.size,
    evidence_count: evSnap.size,
    updatedAt: serverTimestamp(),
  });
}

// ── Player Operations ────────────────────────────────────────────────────────
async function checkPlayerCaseAccess(caseId: string, user: PublicUser) {
  let caseSnap;
  try {
    caseSnap = await getDoc(doc(db, 'cases', caseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `cases/${caseId}`);
  }
  if (!caseSnap.exists()) {
    throw new Error('Investigation dossier not found.');
  }
  const caseRow = caseSnap.data();
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  if (!isAdmin && caseRow.status !== 'PUBLISHED') {
    throw new Error('This dossier is not published.');
  }
  if (!isAdmin) {
    const eligibility = isPlayerEligibleForCase(
      user.institution_code,
      user.rank_order,
      caseRow.institution_code,
      Number(caseRow.min_rank_order || 1)
    );
    if (!eligibility.eligible) {
      throw new Error(eligibility.reason || 'Insufficient institutional clearance.');
    }
  }
  return caseRow;
}

async function handlePlayerDashboard(user: PublicUser) {
  const boot = await getRawBootstrap();
  const [casesSnap, progSnap, repSnap, notifSnap, careerSnap] = await Promise.all([
    getDocs(query(collection(db, 'cases'), where('status', '==', 'PUBLISHED'))),
    getDocs(collection(db, 'users', user.id, 'caseProgress')),
    getDocs(query(collection(db, 'reports'), where('user_id', '==', user.id))),
    getDocs(collection(db, 'users', user.id, 'notifications')),
    getDocs(collection(db, 'users', user.id, 'careerHistory')),
  ]);

  const availableCases = casesSnap.docs
    .map((d) => {
      const c = d.data();
      const eligibility = isPlayerEligibleForCase(
        user.institution_code,
        user.rank_order,
        c.institution_code,
        Number(c.min_rank_order || 1)
      );
      return {
        ...c,
        eligible:
          user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? true : eligibility.eligible,
        eligibility_reason: eligibility.reason || null,
      };
    })
    .sort((a: any, b: any) =>
      String(b.published_at || '').localeCompare(String(a.published_at || ''))
    );

  const activeProgress = progSnap.docs.map((d) => d.data());
  const reports = repSnap.docs
    .map((d) => d.data())
    .sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));

  const notifications = notifSnap.docs
    .map((d) => {
      const n = d.data();
      return { ...n, created_at: toIso(n.createdAt) };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20);

  const careerHistory = careerSnap.docs
    .map((d) => ({ ...d.data(), created_at: toIso(d.data().createdAt) }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const institutionRanks = boot.ranks.filter((r) => r.institution_id === user.institution_id);
  const approvedCount = reports.filter((r) => r.decision === 'APPROVED').length;
  const scores = reports
    .filter((r) => typeof r.score === 'number')
    .map((r) => r.score as number);
  const averageScore =
    scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return {
    availableCases,
    activeProgress,
    reports,
    notifications,
    careerHistory,
    institutionRanks,
    stats: {
      activeCount: activeProgress.filter((p) => p.status === 'IN_PROGRESS').length,
      submittedReportsCount: reports.length,
      approvedCount,
      averageScore,
    },
  };
}

async function handlePlayerRoom(caseId: string, user: PublicUser) {
  const caseRow = await checkPlayerCaseAccess(caseId, user);
  const progressRef = doc(db, 'users', user.id, 'caseProgress', caseId);
  const progSnap = await getDoc(progressRef);
  let progress: any;
  if (!progSnap.exists()) {
    progress = {
      id: caseId,
      user_id: user.id,
      case_id: caseId,
      status: 'IN_PROGRESS',
      current_chapter: 1,
      unlocked_hints: [],
      asked_questions: [],
      updatedAt: serverTimestamp(),
    };
    await setDoc(progressRef, progress);
  } else {
    progress = progSnap.data();
  }

  const unlockedHintIds: string[] = progress.unlocked_hints || [];
  const askedQuestionIds: string[] = progress.asked_questions || [];

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const [
    chSnap,
    evSnap,
    chrSnap,
    witSnap,
    intSnap,
    hntSnap,
    noteSnap,
    tmlSnap,
    conSnap,
    repSnap,
    docsSnap,
    audSnap,
    m3dSnap,
  ] = await Promise.all([
    isAdmin
      ? getDocs(collection(db, 'cases', caseId, 'chapters'))
      : getDocs(query(collection(db, 'cases', caseId, 'chapters'), where('case_status', '==', 'PUBLISHED'))),
    isAdmin
      ? getDocs(collection(db, 'cases', caseId, 'evidence'))
      : getDocs(query(collection(db, 'cases', caseId, 'evidence'), where('case_status', '==', 'PUBLISHED'))),
    isAdmin
      ? getDocs(query(collection(db, 'cases', caseId, 'characters'), where('is_public', '==', true)))
      : getDocs(
          query(
            collection(db, 'cases', caseId, 'characters'),
            where('case_status', '==', 'PUBLISHED'),
            where('is_public', '==', true)
          )
        ),
    isAdmin
      ? getDocs(collection(db, 'cases', caseId, 'witnesses'))
      : getDocs(query(collection(db, 'cases', caseId, 'witnesses'), where('case_status', '==', 'PUBLISHED'))),
    isAdmin
      ? getDocs(collection(db, 'cases', caseId, 'interrogations'))
      : getDocs(query(collection(db, 'cases', caseId, 'interrogations'), where('case_status', '==', 'PUBLISHED'))),
    isAdmin
      ? getDocs(query(collection(db, 'cases', caseId, 'hints'), where('is_enabled', '==', true)))
      : getDocs(
          query(
            collection(db, 'cases', caseId, 'hints'),
            where('case_status', '==', 'PUBLISHED'),
            where('is_enabled', '==', true)
          )
        ),
    getDoc(doc(db, 'users', user.id, 'caseNotes', caseId)),
    getDocs(query(collection(db, 'users', user.id, 'timeline'), where('case_id', '==', caseId))),
    getDocs(query(collection(db, 'users', user.id, 'connections'), where('case_id', '==', caseId))),
    getDocs(query(collection(db, 'reports'), where('user_id', '==', user.id))),
    getDocs(query(collection(db, 'documents'), where('is_confidential', '==', false))),
    getDocs(query(collection(db, 'audioAssets'), where('is_public', '==', true))),
    getDocs(query(collection(db, 'models3d'), where('is_public', '==', true))),
  ]);

  const docsMap = new Map(docsSnap.docs.map((d) => [d.id, d.data()]));
  const audMap = new Map(audSnap.docs.map((d) => [d.id, d.data()]));
  const readyModels = new Map<string, any>();
  for (const d of m3dSnap.docs) {
    const m = d.data();
    if (m.status === 'READY') readyModels.set(m.id, m);
  }

  const chapters = chSnap.docs
    .map((d) => d.data())
    .sort((a, b) => Number(a.chapter_number) - Number(b.chapter_number));

  const evidence = evSnap.docs
    .map((d) => d.data())
    .filter((ev) => ev.is_visible !== false)
    .map((ev) => {
      const linkedDoc = ev.document_id ? docsMap.get(ev.document_id) : null;
      const docModel = linkedDoc?.model_3d_id ? readyModels.get(linkedDoc.model_3d_id) : null;
      const linkedAud = ev.audio_id ? audMap.get(ev.audio_id) : null;
      const evModel = ev.model_3d_id ? readyModels.get(ev.model_3d_id) : null;
      return {
        id: ev.id,
        case_id: ev.case_id,
        evidence_code: ev.evidence_code,
        title: ev.title,
        evidence_type: ev.evidence_type,
        description: ev.description,
        image_url: ev.image_url || null,
        document_id: linkedDoc ? ev.document_id : null,
        document_title: linkedDoc?.title || null,
        document_mime: linkedDoc?.mime_type || null,
        doc_model_3d_url: docModel?.url || null,
        doc_model_3d_format: docModel?.format || null,
        doc_preferred_view: docModel && linkedDoc?.preferred_view === '3D' ? '3D' : 'STANDARD',
        audio_id: ev.audio_id || null,
        audio_title: linkedAud?.title || null,
        audio_url: linkedAud?.url || null,
        audio_transcript: linkedAud?.transcript || null,
        model_3d_id: ev.model_3d_id || null,
        model_3d_url: evModel?.url || null,
        model_3d_format: evModel?.format || null,
        preferred_view: evModel && ev.preferred_view === '3D' ? '3D' : 'STANDARD',
        chapter_number: ev.chapter_number,
        access_condition: ev.access_condition,
        related_characters: ev.related_characters || [],
        related_evidence: ev.related_evidence || [],
        sort_order: ev.sort_order,
      };
    })
    .sort(
      (a, b) =>
        Number(a.chapter_number) - Number(b.chapter_number) ||
        Number(a.sort_order) - Number(b.sort_order)
    );

  const characters = chrSnap.docs.map((d) => {
    const ch = d.data();
    const chModel = ch.model_3d_id ? readyModels.get(ch.model_3d_id) : null;
    return {
      ...ch,
      model_3d_url: chModel?.url || null,
      model_3d_format: chModel?.format || null,
      preferred_view: chModel && ch.preferred_view === '3D' ? '3D' : 'STANDARD',
    };
  });

  const witnesses = witSnap.docs
    .map((d) => d.data())
    .sort((a, b) => Number(a.chapter_number) - Number(b.chapter_number));

  const questions = intSnap.docs
    .map((d) => {
      const q = d.data();
      const asked = askedQuestionIds.includes(q.id);
      return {
        id: q.id,
        case_id: q.case_id,
        witness_id: q.witness_id,
        question_text: q.question_text,
        asked,
        response_text: asked ? q.response_text : null,
        follow_up_hint: asked ? q.follow_up_hint : null,
        sort_order: q.sort_order,
      };
    })
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order));

  const hints = hntSnap.docs
    .map((d) => {
      const h = d.data();
      const unlocked = unlockedHintIds.includes(h.id);
      return {
        id: h.id,
        case_id: h.case_id,
        chapter_number: h.chapter_number,
        hint_order: h.hint_order,
        unlock_condition: h.unlock_condition,
        unlocked,
        hint_text: unlocked ? h.hint_text : null,
      };
    })
    .sort(
      (a, b) =>
        Number(a.chapter_number) - Number(b.chapter_number) ||
        Number(a.hint_order) - Number(b.hint_order)
    );

  const timeline = tmlSnap.docs
    .map((d) => d.data())
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order));

  const connections = conSnap.docs
    .map((d) => ({ ...d.data(), created_at: toIso(d.data().createdAt) }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const reports = repSnap.docs
    .map((d) => d.data())
    .filter((r) => r.case_id === caseId)
    .sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));

  const sceneModel = caseRow.scene_3d_model_id
    ? readyModels.get(caseRow.scene_3d_model_id)
    : null;

  return {
    dossier: {
      id: caseRow.id,
      case_code: caseRow.case_code,
      title: caseRow.title,
      short_description: caseRow.short_description,
      full_story: caseRow.full_story,
      institution_name: caseRow.institution_name,
      institution_code: caseRow.institution_code,
      region_name: caseRow.region_name,
      headquarters_label: '',
      difficulty: caseRow.difficulty,
      estimated_duration: caseRow.estimated_duration,
      cover_image_url: caseRow.cover_image_url || null,
      scene_3d_model_id: caseRow.scene_3d_model_id || null,
      scene_3d_url: sceneModel?.url || caseRow.scene_3d_url || null,
      scene_3d_format: sceneModel?.format || caseRow.scene_3d_format || null,
      scene_preferred_view:
        (sceneModel || caseRow.scene_3d_url) && caseRow.scene_preferred_view === '3D'
          ? '3D'
          : 'STANDARD',
      gallery: caseRow.gallery || [],
      player_tasks: caseRow.player_tasks || [],
      evaluation_criteria: caseRow.evaluation_criteria || [],
      status: caseRow.status,
    },
    progress: {
      status: progress.status,
      current_chapter: progress.current_chapter,
    },
    chapters,
    evidence,
    characters,
    witnesses,
    questions,
    hints,
    note: noteSnap.exists() ? noteSnap.data().content || '' : '',
    noteUpdatedAt: noteSnap.exists() ? toIso(noteSnap.data().updatedAt) : null,
    timeline,
    connections,
    reports,
  };
}

export async function getFirestoreDocumentData(docId: string): Promise<{
  fileName: string;
  mimeType: string;
  dataUrl: string;
  textContent: string | null;
}> {
  await getCurrentAppUser();
  const snap = await getDoc(doc(db, 'documents', docId));
  if (!snap.exists()) {
    throw new Error('Document not found.');
  }
  const d = snap.data();
  const dataUrl = String(d.data_url || '');
  const mimeType = String(d.mime_type || 'application/octet-stream');
  let textContent: string | null = null;
  if (mimeType === 'text/plain' && dataUrl.startsWith('data:')) {
    try {
      const resp = await fetch(dataUrl);
      textContent = await resp.text();
    } catch {
      textContent = null;
    }
  }
  return {
    fileName: String(d.file_name || `${d.title || 'document'}.txt`),
    mimeType,
    dataUrl,
    textContent,
  };
}

export async function downloadFirestoreDocument(docId: string): Promise<void> {
  const docData = await getFirestoreDocumentData(docId);
  const link = document.createElement('a');
  link.href = docData.dataUrl;
  link.download = docData.fileName;
  link.click();
}

// ── Main Dispatcher for apiFetch('/api/...') ─────────────────────────────────
export async function dispatchFirebaseApi<T = any>(
  rawPath: string,
  options: RequestInit = {}
): Promise<T> {
  const url = new URL(rawPath, 'https://aurvan.local');
  const pathname = url.pathname;
  const method = (options.method || 'GET').toUpperCase();

  const parseJsonBody = () => {
    if (!options.body) return {};
    if (typeof options.body === 'string') {
      try {
        return JSON.parse(options.body);
      } catch {
        return {};
      }
    }
    return {};
  };

  // 1. Public Endpoints
  if (pathname === '/api/public/bootstrap' && method === 'GET') {
    return (await handlePublicBootstrap()) as T;
  }
  if (pathname === '/api/public/cases' && method === 'GET') {
    return (await handlePublicCases(url.searchParams)) as T;
  }
  if (pathname === '/api/public/hall-of-fame' && method === 'GET') {
    return (await handleHallOfFame()) as T;
  }
  if (pathname === '/api/health' && method === 'GET') {
    return { ok: true, platform: 'AURVAN UNIVERSE' } as T;
  }

  // 2. Player Endpoints
  if (pathname === '/api/player/dashboard' && method === 'GET') {
    const user = await getCurrentAppUser();
    return (await handlePlayerDashboard(user)) as T;
  }
  if (pathname === '/api/player/profile' && method === 'PATCH') {
    const user = await getCurrentAppUser();
    const b = parseJsonBody();
    const fullName = String(b.full_name || '').trim();
    const bio = String(b.bio || '').trim().slice(0, 600);
    if (fullName.length < 2) {
      throw new Error('Display name must be at least 2 characters.');
    }
    await updateDoc(doc(db, 'users', user.id), {
      full_name: fullName.slice(0, 120),
      bio,
      updatedAt: serverTimestamp(),
    });
    return { success: true } as T;
  }
  if (pathname === '/api/player/notifications/read' && method === 'POST') {
    const user = await getCurrentAppUser();
    const snap = await getDocs(collection(db, 'users', user.id, 'notifications'));
    const batch = writeBatch(db);
    for (const d of snap.docs) {
      if (!d.data().is_read) {
        batch.update(d.ref, { is_read: true });
      }
    }
    await batch.commit();
    return { success: true } as T;
  }

  const playerRoomMatch = pathname.match(/^\/api\/player\/cases\/([^/]+)\/room$/);
  if (playerRoomMatch && method === 'GET') {
    const user = await getCurrentAppUser();
    return (await handlePlayerRoom(playerRoomMatch[1], user)) as T;
  }

  const playerNotesMatch = pathname.match(/^\/api\/player\/cases\/([^/]+)\/notes$/);
  if (playerNotesMatch && method === 'PUT') {
    const user = await getCurrentAppUser();
    const caseId = playerNotesMatch[1];
    await checkPlayerCaseAccess(caseId, user);
    const b = parseJsonBody();
    await setDoc(doc(db, 'users', user.id, 'caseNotes', caseId), {
      id: caseId,
      user_id: user.id,
      case_id: caseId,
      content: String(b.content || '').slice(0, 50000),
      updatedAt: serverTimestamp(),
    });
    return { success: true, updated_at: new Date().toISOString() } as T;
  }

  const playerTimelineMatch = pathname.match(/^\/api\/player\/cases\/([^/]+)\/timeline$/);
  if (playerTimelineMatch && method === 'POST') {
    const user = await getCurrentAppUser();
    const caseId = playerTimelineMatch[1];
    await checkPlayerCaseAccess(caseId, user);
    const b = parseJsonBody();
    const eventTime = String(b.event_time || '').trim();
    const eventTitle = String(b.event_title || '').trim();
    const eventNotes = String(b.event_notes || '').trim();
    if (!eventTime || !eventTitle) {
      throw new Error('Time marker and event title are required.');
    }
    const existingSnap = await getDocs(
      query(collection(db, 'users', user.id, 'timeline'), where('case_id', '==', caseId))
    );
    const id = randomId('tml');
    const item = {
      id,
      user_id: user.id,
      case_id: caseId,
      event_time: eventTime.slice(0, 120),
      event_title: eventTitle.slice(0, 240),
      event_notes: eventNotes.slice(0, 4000),
      sort_order: existingSnap.size + 1,
      createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'users', user.id, 'timeline', id), item);
    return { item } as T;
  }

  const playerTimelineDelMatch = pathname.match(/^\/api\/player\/cases\/([^/]+)\/timeline\/([^/]+)$/);
  if (playerTimelineDelMatch && method === 'DELETE') {
    const user = await getCurrentAppUser();
    await deleteDoc(doc(db, 'users', user.id, 'timeline', playerTimelineDelMatch[2]));
    return { success: true } as T;
  }

  const playerConnMatch = pathname.match(/^\/api\/player\/cases\/([^/]+)\/connections$/);
  if (playerConnMatch && method === 'POST') {
    const user = await getCurrentAppUser();
    const caseId = playerConnMatch[1];
    await checkPlayerCaseAccess(caseId, user);
    const b = parseJsonBody();
    const sourceId = String(b.source_evidence_id || '');
    const targetId = String(b.target_evidence_id || '');
    const note = String(b.connection_note || '').trim();
    if (!sourceId || !targetId || sourceId === targetId) {
      throw new Error('Select two distinct evidence items to connect.');
    }
    const id = randomId('con');
    const connection = {
      id,
      user_id: user.id,
      case_id: caseId,
      source_evidence_id: sourceId,
      target_evidence_id: targetId,
      connection_note: note.slice(0, 2000),
      createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'users', user.id, 'connections', id), connection);
    return { connection } as T;
  }

  const playerConnDelMatch = pathname.match(/^\/api\/player\/cases\/([^/]+)\/connections\/([^/]+)$/);
  if (playerConnDelMatch && method === 'DELETE') {
    const user = await getCurrentAppUser();
    await deleteDoc(doc(db, 'users', user.id, 'connections', playerConnDelMatch[2]));
    return { success: true } as T;
  }

  const playerHintMatch = pathname.match(/^\/api\/player\/cases\/([^/]+)\/hints\/([^/]+)\/unlock$/);
  if (playerHintMatch && method === 'POST') {
    const user = await getCurrentAppUser();
    const [, caseId, hintId] = playerHintMatch;
    await checkPlayerCaseAccess(caseId, user);
    const hSnap = await getDoc(doc(db, 'cases', caseId, 'hints', hintId));
    if (!hSnap.exists() || !hSnap.data().is_enabled) {
      throw new Error('Hint not found.');
    }
    const progRef = doc(db, 'users', user.id, 'caseProgress', caseId);
    const progSnap = await getDoc(progRef);
    const currentUnlocked: string[] = progSnap.exists()
      ? progSnap.data().unlocked_hints || []
      : [];
    if (!currentUnlocked.includes(hintId)) {
      await updateDoc(progRef, {
        unlocked_hints: [...currentUnlocked, hintId],
        updatedAt: serverTimestamp(),
      });
    }
    return { hint_text: hSnap.data().hint_text } as T;
  }

  const playerIntMatch = pathname.match(
    /^\/api\/player\/cases\/([^/]+)\/interrogations\/([^/]+)\/ask$/
  );
  if (playerIntMatch && method === 'POST') {
    const user = await getCurrentAppUser();
    const [, caseId, qId] = playerIntMatch;
    await checkPlayerCaseAccess(caseId, user);
    const qSnap = await getDoc(doc(db, 'cases', caseId, 'interrogations', qId));
    if (!qSnap.exists()) {
      throw new Error('Interrogation question not found.');
    }
    const progRef = doc(db, 'users', user.id, 'caseProgress', caseId);
    const progSnap = await getDoc(progRef);
    const currentAsked: string[] = progSnap.exists() ? progSnap.data().asked_questions || [] : [];
    if (!currentAsked.includes(qId)) {
      await updateDoc(progRef, {
        asked_questions: [...currentAsked, qId],
        updatedAt: serverTimestamp(),
      });
    }
    const qData = qSnap.data();
    return {
      id: qId,
      response_text: qData.response_text,
      follow_up_hint: qData.follow_up_hint,
    } as T;
  }

  const playerReportMatch = pathname.match(/^\/api\/player\/cases\/([^/]+)\/report$/);
  if (playerReportMatch && method === 'POST') {
    const user = await getCurrentAppUser();
    const caseId = playerReportMatch[1];
    const caseRow = await checkPlayerCaseAccess(caseId, user);
    const b = parseJsonBody();
    const suspectIdentified = String(b.suspect_identified || '').trim();
    const reasoningText = String(b.reasoning_text || '').trim();
    const evidenceRefs = Array.isArray(b.evidence_references) ? b.evidence_references : [];
    const timelineSummary = String(b.timeline_summary || '').trim();

    if (suspectIdentified.length < 2 || reasoningText.length < 20) {
      throw new Error(
        'Provide the identified subject and thorough analytical reasoning (minimum 20 characters).'
      );
    }

    const reportId = randomId('rep');
    const nowIso = new Date().toISOString();
    const reportDoc = {
      id: reportId,
      user_id: user.id,
      player_name: user.full_name,
      player_code: user.player_code,
      case_id: caseId,
      case_code: caseRow.case_code,
      case_title: caseRow.title,
      suspect_identified: suspectIdentified.slice(0, 200),
      reasoning_text: reasoningText.slice(0, 30000),
      evidence_references: evidenceRefs.slice(0, 50),
      timeline_summary: timelineSummary.slice(0, 10000),
      status: 'SUBMITTED',
      score: null,
      decision: null,
      feedback: null,
      career_action: null,
      evaluated_by: null,
      submitted_at: nowIso,
      evaluated_at: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'reports', reportId), reportDoc);
    await updateDoc(doc(db, 'users', user.id, 'caseProgress', caseId), {
      status: 'SUBMITTED',
      updatedAt: serverTimestamp(),
    });
    const notifId = randomId('ntf');
    await setDoc(doc(db, 'users', user.id, 'notifications', notifId), {
      id: notifId,
      user_id: user.id,
      title: 'Investigation Report Filed',
      message: `Your final report for ${caseRow.case_code} (${caseRow.title}) has been submitted for Directorate evaluation.`,
      is_read: false,
      createdAt: serverTimestamp(),
    });
    return { report: reportDoc } as T;
  }

  // 3. Admin Endpoints
  const adminUser = await requireAdminUser();

  if (pathname === '/api/admin/overview' && method === 'GET') {
    const [usersSnap, casesSnap, repsSnap, logsSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'cases')),
      getDocs(collection(db, 'reports')),
      getDocs(collection(db, 'adminLogs')),
    ]);
    const players = usersSnap.docs.map((d) => d.data()).filter((u) => u.role === 'PLAYER');
    const cases = casesSnap.docs.map((d) => d.data());
    const reports = repsSnap.docs.map((d) => d.data());
    const recentLogs = logsSnap.docs
      .map((d) => ({ ...d.data(), created_at: toIso(d.data().createdAt) }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 12);

    return {
      stats: {
        totalPlayers: players.length,
        activePlayers: players.filter((p) => p.status === 'ACTIVE').length,
        publishedCases: cases.filter((c) => c.status === 'PUBLISHED').length,
        draftCases: cases.filter((c) =>
          ['DRAFT', 'IN_REVIEW', 'READY_TO_PUBLISH'].includes(c.status)
        ).length,
        archivedCases: cases.filter((c) => c.status === 'ARCHIVED').length,
        pendingReports: reports.filter((r) =>
          ['SUBMITTED', 'UNDER_REVIEW'].includes(r.status)
        ).length,
        completedInvestigations: reports.filter((r) => r.status === 'APPROVED').length,
      },
      recentLogs,
    } as T;
  }

  // Admin Cases CRUD
  if (pathname === '/api/admin/cases' && method === 'GET') {
    const snap = await getDocs(collection(db, 'cases'));
    const cases = snap.docs
      .map((d) => ({
        ...d.data(),
        created_at: toIso(d.data().createdAt),
        updated_at: toIso(d.data().updatedAt),
      }))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return { cases } as T;
  }

  if (pathname === '/api/admin/cases' && method === 'POST') {
    const b = parseJsonBody();
    const title = String(b.title || '').trim();
    const caseCode = String(b.case_code || '').trim().toUpperCase();
    if (title.length < 3 || caseCode.length < 2) {
      throw new Error('Case Title (min 3 chars) and Case ID/Code (min 2 chars) are required.');
    }
    const existingSnap = await getDocs(
      query(collection(db, 'cases'), where('case_code', '==', caseCode))
    );
    if (!existingSnap.empty) {
      throw new Error(`Case ID ${caseCode} already exists.`);
    }

    const boot = await getRawBootstrap();
    const inst =
      boot.institutions.find((i) => i.id === Number(b.institution_id || 1)) ||
      boot.institutions[0];
    const reg =
      boot.regions.find((r) => r.id === Number(b.region_id || 1)) || boot.regions[0];

    const id = randomId('cas');
    const baseSlug = slugifyCaseTitle(title) || `case-${Date.now()}`;
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

    await setDoc(doc(db, 'cases', id), {
      id,
      case_code: caseCode.slice(0, 64),
      title: title.slice(0, 200),
      slug: slug.slice(0, 240),
      short_description: String(b.short_description || '').slice(0, 1000),
      full_story: String(b.full_story || '').slice(0, 50000),
      institution_id: inst.id,
      institution_code: inst.code,
      institution_name: inst.name,
      region_id: reg.id,
      region_name: reg.name,
      difficulty: String(b.difficulty || 'STANDARD'),
      estimated_duration: String(b.estimated_duration || '60 mins').slice(0, 80),
      status: 'DRAFT',
      cover_image_url: b.cover_image_url || null,
      thumbnail_url: b.thumbnail_url || null,
      scene_3d_model_id: null,
      scene_3d_url: null,
      scene_3d_format: null,
      scene_preferred_view: 'STANDARD',
      gallery: Array.isArray(b.gallery) ? b.gallery.slice(0, 20) : [],
      player_tasks: Array.isArray(b.player_tasks) ? b.player_tasks.slice(0, 30) : [],
      evaluation_criteria: Array.isArray(b.evaluation_criteria)
        ? b.evaluation_criteria.slice(0, 30)
        : [],
      min_rank_order: Number(b.min_rank_order || 1),
      chapters_count: 0,
      evidence_count: 0,
      created_by: adminUser.id,
      published_at: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, 'caseSolutions', id), {
      case_id: id,
      master_solution: '',
      actual_timeline: [],
      responsible_character: '',
      evidence_explanations: [],
      red_herrings: [],
      critical_clues: [],
      internal_notes: '',
      private_evidence_notes: {},
      private_character_notes: {},
      hidden_interrogation_rules: {},
      updatedAt: serverTimestamp(),
    });

    await writeAdminLog(adminUser, 'CASE_CREATED', 'CASE', id, `Created draft case ${caseCode}: ${title}`);
    return (await getFullCaseBundle(id)) as T;
  }

  const caseIdMatch = pathname.match(/^\/api\/admin\/cases\/([^/]+)$/);
  if (caseIdMatch) {
    const caseId = caseIdMatch[1];
    if (method === 'GET') {
      const bundle = await getFullCaseBundle(caseId);
      if (!bundle) throw new Error('Case not found.');
      return bundle as T;
    }
    if (method === 'PUT') {
      const snap = await getDoc(doc(db, 'cases', caseId));
      if (!snap.exists()) throw new Error('Case not found.');
      const existing = snap.data();
      const b = parseJsonBody();
      const boot = await getRawBootstrap();
      const inst =
        boot.institutions.find((i) => i.id === Number(b.institution_id || existing.institution_id)) ||
        boot.institutions[0];
      const reg =
        boot.regions.find((r) => r.id === Number(b.region_id || existing.region_id)) ||
        boot.regions[0];

      await updateDoc(doc(db, 'cases', caseId), {
        case_code: String(b.case_code || existing.case_code).trim().toUpperCase().slice(0, 64),
        title: String(b.title || existing.title).trim().slice(0, 200),
        short_description: String(b.short_description ?? existing.short_description).slice(0, 1000),
        full_story: String(b.full_story ?? existing.full_story).slice(0, 50000),
        institution_id: inst.id,
        institution_code: inst.code,
        institution_name: inst.name,
        region_id: reg.id,
        region_name: reg.name,
        difficulty: String(b.difficulty || existing.difficulty),
        estimated_duration: String(b.estimated_duration || existing.estimated_duration).slice(0, 80),
        cover_image_url: b.cover_image_url ?? existing.cover_image_url ?? null,
        thumbnail_url: b.thumbnail_url ?? existing.thumbnail_url ?? null,
        gallery: Array.isArray(b.gallery) ? b.gallery.slice(0, 20) : existing.gallery || [],
        player_tasks: Array.isArray(b.player_tasks)
          ? b.player_tasks.slice(0, 30)
          : existing.player_tasks || [],
        evaluation_criteria: Array.isArray(b.evaluation_criteria)
          ? b.evaluation_criteria.slice(0, 30)
          : existing.evaluation_criteria || [],
        min_rank_order: Number(b.min_rank_order || existing.min_rank_order || 1),
        updatedAt: serverTimestamp(),
      });
      invalidatePublicCaches();
      await writeAdminLog(adminUser, 'CASE_UPDATED', 'CASE', caseId, `Updated metadata for case ${existing.case_code}`);
      return (await getFullCaseBundle(caseId)) as T;
    }
    if (method === 'DELETE') {
      const snap = await getDoc(doc(db, 'cases', caseId));
      if (!snap.exists()) throw new Error('Case not found.');
      const existing = snap.data();
      const subNames = ['chapters', 'evidence', 'characters', 'witnesses', 'interrogations', 'hints'];
      for (const sub of subNames) {
        const subSnap = await getDocs(collection(db, 'cases', caseId, sub));
        const batch = writeBatch(db);
        for (const d of subSnap.docs) batch.delete(d.ref);
        await batch.commit();
      }
      await deleteDoc(doc(db, 'caseSolutions', caseId)).catch(() => undefined);
      await deleteDoc(doc(db, 'cases', caseId));
      invalidatePublicCaches();
      await writeAdminLog(adminUser, 'CASE_DELETED', 'CASE', caseId, `Deleted case ${existing.case_code}: ${existing.title}`);
      return { success: true } as T;
    }
  }

  const caseStatusMatch = pathname.match(/^\/api\/admin\/cases\/([^/]+)\/status$/);
  if (caseStatusMatch && method === 'POST') {
    const caseId = caseStatusMatch[1];
    const b = parseJsonBody();
    const targetStatus = String(b.status || '') as CaseStatus;
    const bundle = await getFullCaseBundle(caseId);
    if (!bundle) throw new Error('Case not found.');
    if (!canTransitionCaseStatus(bundle.caseData.status, targetStatus)) {
      throw new Error(
        `Cannot transition directly from ${bundle.caseData.status} to ${targetStatus}. Restore to DRAFT first.`
      );
    }
    if (targetStatus === 'PUBLISHED' && !bundle.validation.valid) {
      throw new Error(bundle.validation.errors.join(' '));
    }
    const publishedAt =
      targetStatus === 'PUBLISHED'
        ? new Date().toISOString()
        : targetStatus === 'DRAFT'
        ? null
        : bundle.caseData.published_at || null;

    await updateDoc(doc(db, 'cases', caseId), {
      status: targetStatus,
      published_at: publishedAt,
      updatedAt: serverTimestamp(),
    });
    await syncCaseCountsAndStatus(caseId, targetStatus);
    invalidatePublicCaches();
    const actionName =
      targetStatus === 'PUBLISHED'
        ? 'CASE_PUBLISHED'
        : targetStatus === 'ARCHIVED'
        ? 'CASE_ARCHIVED'
        : 'CASE_STATUS_CHANGED';
    await writeAdminLog(
      adminUser,
      actionName,
      'CASE',
      caseId,
      `Changed case ${bundle.caseData.case_code} status to ${targetStatus}`
    );
    return (await getFullCaseBundle(caseId)) as T;
  }

  // Sub-resources: Chapters, Evidence, Characters, Witnesses, Interrogations, Hints, Solution
  const chPostMatch = pathname.match(/^\/api\/admin\/cases\/([^/]+)\/chapters$/);
  if (chPostMatch && method === 'POST') {
    const caseId = chPostMatch[1];
    const b = parseJsonBody();
    if (!b.title || !b.briefing_text) {
      throw new Error('Chapter title and briefing text are required.');
    }
    const cSnap = await getDoc(doc(db, 'cases', caseId));
    if (!cSnap.exists()) throw new Error('Case not found.');
    const id = randomId('chp');
    await setDoc(doc(db, 'cases', caseId, 'chapters', id), {
      id,
      case_id: caseId,
      case_status: cSnap.data().status,
      chapter_number: Number(b.chapter_number || 1),
      title: String(b.title).slice(0, 200),
      briefing_text: String(b.briefing_text).slice(0, 30000),
      unlock_condition: String(b.unlock_condition || 'IMMEDIATE').slice(0, 120),
      createdAt: serverTimestamp(),
    });
    await syncCaseCountsAndStatus(caseId);
    await writeAdminLog(adminUser, 'CHAPTER_ADDED', 'CASE', caseId, `Added chapter: ${b.title}`);
    return (await getFullCaseBundle(caseId)) as T;
  }

  const chDelMatch = pathname.match(/^\/api\/admin\/cases\/([^/]+)\/chapters\/([^/]+)$/);
  if (chDelMatch && method === 'DELETE') {
    await deleteDoc(doc(db, 'cases', chDelMatch[1], 'chapters', chDelMatch[2]));
    await syncCaseCountsAndStatus(chDelMatch[1]);
    return (await getFullCaseBundle(chDelMatch[1])) as T;
  }

  const evPostMatch = pathname.match(/^\/api\/admin\/cases\/([^/]+)\/evidence$/);
  if (evPostMatch && method === 'POST') {
    const caseId = evPostMatch[1];
    const b = parseJsonBody();
    if (!b.evidence_code || !b.title) {
      throw new Error('Evidence code and title are required.');
    }
    const cSnap = await getDoc(doc(db, 'cases', caseId));
    if (!cSnap.exists()) throw new Error('Case not found.');
    const id = randomId('evd');
    const model3dId = b.model_3d_id ? String(b.model_3d_id) : null;
    const preferredView: PreferredViewMode = model3dId && b.preferred_view === '3D' ? '3D' : 'STANDARD';

    await setDoc(doc(db, 'cases', caseId, 'evidence', id), {
      id,
      case_id: caseId,
      case_status: cSnap.data().status,
      evidence_code: String(b.evidence_code).trim().toUpperCase().slice(0, 64),
      title: String(b.title).trim().slice(0, 200),
      evidence_type: String(b.evidence_type || 'DOCUMENT'),
      description: String(b.description || '').slice(0, 15000),
      image_url: b.image_url || null,
      document_id: b.document_id || null,
      audio_id: b.audio_id || null,
      model_3d_id: model3dId,
      preferred_view: preferredView,
      chapter_number: Number(b.chapter_number || 1),
      access_condition: String(b.access_condition || 'IMMEDIATE').slice(0, 120),
      related_characters: Array.isArray(b.related_characters) ? b.related_characters.slice(0, 30) : [],
      related_evidence: Array.isArray(b.related_evidence) ? b.related_evidence.slice(0, 30) : [],
      sort_order: Number(b.sort_order || 1),
      is_visible: b.is_visible !== false,
      createdAt: serverTimestamp(),
    });

    if (b.private_explanation) {
      const solSnap = await getDoc(doc(db, 'caseSolutions', caseId));
      const sol = solSnap.exists() ? solSnap.data() : { case_id: caseId, master_solution: '' };
      await setDoc(
        doc(db, 'caseSolutions', caseId),
        {
          case_id: caseId,
          master_solution: sol.master_solution || '',
          private_evidence_notes: {
            ...(sol.private_evidence_notes || {}),
            [id]: String(b.private_explanation).slice(0, 5000),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    if (model3dId) {
      await updateDoc(doc(db, 'models3d', model3dId), {
        linked_entity_type: 'EVIDENCE',
        linked_entity_id: id,
        updatedAt: serverTimestamp(),
      }).catch(() => undefined);
    }

    await syncCaseCountsAndStatus(caseId);
    await writeAdminLog(adminUser, 'EVIDENCE_ADDED', 'CASE', caseId, `Added evidence ${b.evidence_code}`);
    return (await getFullCaseBundle(caseId)) as T;
  }

  const evDelMatch = pathname.match(/^\/api\/admin\/cases\/([^/]+)\/evidence\/([^/]+)$/);
  if (evDelMatch && method === 'DELETE') {
    await deleteDoc(doc(db, 'cases', evDelMatch[1], 'evidence', evDelMatch[2]));
    await syncCaseCountsAndStatus(evDelMatch[1]);
    return (await getFullCaseBundle(evDelMatch[1])) as T;
  }

  const chrPostMatch = pathname.match(/^\/api\/admin\/cases\/([^/]+)\/characters$/);
  if (chrPostMatch && method === 'POST') {
    const caseId = chrPostMatch[1];
    const b = parseJsonBody();
    if (!b.name || !b.role) {
      throw new Error('Character name and role are required.');
    }
    const cSnap = await getDoc(doc(db, 'cases', caseId));
    if (!cSnap.exists()) throw new Error('Case not found.');
    const id = randomId('chr');
    const model3dId = b.model_3d_id ? String(b.model_3d_id) : null;
    const preferredView: PreferredViewMode = model3dId && b.preferred_view === '3D' ? '3D' : 'STANDARD';

    await setDoc(doc(db, 'cases', caseId, 'characters', id), {
      id,
      case_id: caseId,
      case_status: cSnap.data().status,
      name: String(b.name).trim().slice(0, 160),
      role: String(b.role).trim().slice(0, 160),
      portrait_url: b.portrait_url || null,
      description: String(b.description || '').slice(0, 10000),
      background: String(b.background || '').slice(0, 10000),
      relationships: Array.isArray(b.relationships) ? b.relationships.slice(0, 30) : [],
      model_3d_id: model3dId,
      preferred_view: preferredView,
      is_public: b.is_public !== false,
      createdAt: serverTimestamp(),
    });

    if (b.private_info) {
      const solSnap = await getDoc(doc(db, 'caseSolutions', caseId));
      const sol = solSnap.exists() ? solSnap.data() : { case_id: caseId, master_solution: '' };
      await setDoc(
        doc(db, 'caseSolutions', caseId),
        {
          case_id: caseId,
          master_solution: sol.master_solution || '',
          private_character_notes: {
            ...(sol.private_character_notes || {}),
            [id]: String(b.private_info).slice(0, 5000),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    if (model3dId) {
      await updateDoc(doc(db, 'models3d', model3dId), {
        linked_entity_type: 'CHARACTER',
        linked_entity_id: id,
        updatedAt: serverTimestamp(),
      }).catch(() => undefined);
    }

    return (await getFullCaseBundle(caseId)) as T;
  }

  const chrDelMatch = pathname.match(/^\/api\/admin\/cases\/([^/]+)\/characters\/([^/]+)$/);
  if (chrDelMatch && method === 'DELETE') {
    await deleteDoc(doc(db, 'cases', chrDelMatch[1], 'characters', chrDelMatch[2]));
    return (await getFullCaseBundle(chrDelMatch[1])) as T;
  }

  const witPostMatch = pathname.match(/^\/api\/admin\/cases\/([^/]+)\/witnesses$/);
  if (witPostMatch && method === 'POST') {
    const caseId = witPostMatch[1];
    const b = parseJsonBody();
    if (!b.name || !b.statement_text) {
      throw new Error('Witness name and initial statement are required.');
    }
    const cSnap = await getDoc(doc(db, 'cases', caseId));
    if (!cSnap.exists()) throw new Error('Case not found.');
    const id = randomId('wit');
    await setDoc(doc(db, 'cases', caseId, 'witnesses', id), {
      id,
      case_id: caseId,
      case_status: cSnap.data().status,
      name: String(b.name).trim().slice(0, 160),
      role: String(b.role || 'Witness').slice(0, 160),
      portrait_url: b.portrait_url || null,
      statement_text: String(b.statement_text).slice(0, 20000),
      chapter_number: Number(b.chapter_number || 1),
      createdAt: serverTimestamp(),
    });
    return (await getFullCaseBundle(caseId)) as T;
  }

  const witDelMatch = pathname.match(/^\/api\/admin\/cases\/([^/]+)\/witnesses\/([^/]+)$/);
  if (witDelMatch && method === 'DELETE') {
    await deleteDoc(doc(db, 'cases', witDelMatch[1], 'witnesses', witDelMatch[2]));
    return (await getFullCaseBundle(witDelMatch[1])) as T;
  }

  const intPostMatch = pathname.match(/^\/api\/admin\/cases\/([^/]+)\/interrogations$/);
  if (intPostMatch && method === 'POST') {
    const caseId = intPostMatch[1];
    const b = parseJsonBody();
    if (!b.witness_id || !b.question_text || !b.response_text) {
      throw new Error('Witness, question, and response are required.');
    }
    const cSnap = await getDoc(doc(db, 'cases', caseId));
    if (!cSnap.exists()) throw new Error('Case not found.');
    const id = randomId('inq');
    await setDoc(doc(db, 'cases', caseId, 'interrogations', id), {
      id,
      case_id: caseId,
      case_status: cSnap.data().status,
      witness_id: String(b.witness_id),
      question_text: String(b.question_text).slice(0, 2000),
      response_text: String(b.response_text).slice(0, 10000),
      follow_up_hint: String(b.follow_up_hint || '').slice(0, 2000),
      sort_order: Number(b.sort_order || 1),
      createdAt: serverTimestamp(),
    });
    if (b.hidden_evaluation_rule) {
      const solSnap = await getDoc(doc(db, 'caseSolutions', caseId));
      const sol = solSnap.exists() ? solSnap.data() : { case_id: caseId, master_solution: '' };
      await setDoc(
        doc(db, 'caseSolutions', caseId),
        {
          case_id: caseId,
          master_solution: sol.master_solution || '',
          hidden_interrogation_rules: {
            ...(sol.hidden_interrogation_rules || {}),
            [id]: String(b.hidden_evaluation_rule).slice(0, 2000),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    return (await getFullCaseBundle(caseId)) as T;
  }

  const intDelMatch = pathname.match(/^\/api\/admin\/cases\/([^/]+)\/interrogations\/([^/]+)$/);
  if (intDelMatch && method === 'DELETE') {
    await deleteDoc(doc(db, 'cases', intDelMatch[1], 'interrogations', intDelMatch[2]));
    return (await getFullCaseBundle(intDelMatch[1])) as T;
  }

  const hintPostMatch = pathname.match(/^\/api\/admin\/cases\/([^/]+)\/hints$/);
  if (hintPostMatch && method === 'POST') {
    const caseId = hintPostMatch[1];
    const b = parseJsonBody();
    if (!b.hint_text) throw new Error('Hint text is required.');
    const cSnap = await getDoc(doc(db, 'cases', caseId));
    if (!cSnap.exists()) throw new Error('Case not found.');
    const id = randomId('hnt');
    await setDoc(doc(db, 'cases', caseId, 'hints', id), {
      id,
      case_id: caseId,
      case_status: cSnap.data().status,
      chapter_number: Number(b.chapter_number || 1),
      hint_order: Number(b.hint_order || 1),
      hint_text: String(b.hint_text).slice(0, 5000),
      unlock_condition: String(b.unlock_condition || 'ON_REQUEST').slice(0, 120),
      is_enabled: b.is_enabled !== false,
      createdAt: serverTimestamp(),
    });
    return (await getFullCaseBundle(caseId)) as T;
  }

  const hintDelMatch = pathname.match(/^\/api\/admin\/cases\/([^/]+)\/hints\/([^/]+)$/);
  if (hintDelMatch && method === 'DELETE') {
    await deleteDoc(doc(db, 'cases', hintDelMatch[1], 'hints', hintDelMatch[2]));
    return (await getFullCaseBundle(hintDelMatch[1])) as T;
  }

  const solPutMatch = pathname.match(/^\/api\/admin\/cases\/([^/]+)\/solution$/);
  if (solPutMatch && method === 'PUT') {
    const caseId = solPutMatch[1];
    const b = parseJsonBody();
    const prevSnap = await getDoc(doc(db, 'caseSolutions', caseId));
    const prev = prevSnap.exists() ? prevSnap.data() : {};
    await setDoc(doc(db, 'caseSolutions', caseId), {
      case_id: caseId,
      master_solution: String(b.master_solution || '').slice(0, 40000),
      actual_timeline: Array.isArray(b.actual_timeline) ? b.actual_timeline.slice(0, 50) : [],
      responsible_character: String(b.responsible_character || '').slice(0, 200),
      evidence_explanations: Array.isArray(b.evidence_explanations)
        ? b.evidence_explanations.slice(0, 50)
        : [],
      red_herrings: Array.isArray(b.red_herrings) ? b.red_herrings.slice(0, 50) : [],
      critical_clues: Array.isArray(b.critical_clues) ? b.critical_clues.slice(0, 50) : [],
      internal_notes: String(b.internal_notes || '').slice(0, 20000),
      private_evidence_notes: prev.private_evidence_notes || {},
      private_character_notes: prev.private_character_notes || {},
      hidden_interrogation_rules: prev.hidden_interrogation_rules || {},
      updatedAt: serverTimestamp(),
    });
    await writeAdminLog(adminUser, 'SOLUTION_UPDATED', 'CASE', caseId, 'Updated confidential master solution.');
    return (await getFullCaseBundle(caseId)) as T;
  }

  // Media Library
  if (pathname === '/api/admin/media' && method === 'GET') {
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const folder = (url.searchParams.get('folder') || '').trim();
    const [mediaSnap, m3dSnap] = await Promise.all([
      getDocs(collection(db, 'mediaAssets')),
      getDocs(collection(db, 'models3d')),
    ]);
    const readyModels = new Map<string, any>();
    for (const d of m3dSnap.docs) {
      if (d.data().status === 'READY') readyModels.set(d.id, d.data());
    }
    const assets: MediaAsset[] = mediaSnap.docs
      .map((d) => {
        const m = d.data();
        const linkedModel = m.model_3d_id ? readyModels.get(m.model_3d_id) : null;
        return {
          id: m.id,
          title: m.title,
          file_name: m.file_name,
          folder: m.folder,
          mime_type: m.mime_type,
          size_bytes: m.size_bytes,
          url: m.url,
          source_type: m.source_type,
          model_3d_id: m.model_3d_id || null,
          model_3d_url: linkedModel?.url || null,
          model_3d_format: linkedModel?.format || null,
          preferred_view: m.preferred_view || 'STANDARD',
          uploaded_by: m.uploaded_by,
          created_at: toIso(m.createdAt),
        };
      })
      .filter((a) => {
        if (
          search &&
          !a.title.toLowerCase().includes(search) &&
          !a.file_name.toLowerCase().includes(search)
        ) {
          return false;
        }
        if (folder && folder !== 'all' && a.folder !== folder) return false;
        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { assets } as T;
  }

  if (pathname === '/api/admin/media' && method === 'POST') {
    if (!(options.body instanceof FormData)) {
      throw new Error('Image files FormData is required.');
    }
    const files = options.body.getAll('files').filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new Error('No image files were provided.');
    const folder = String(options.body.get('folder') || 'general').trim() || 'general';
    const customTitle = String(options.body.get('title') || '').trim();
    const created: MediaAsset[] = [];

    for (const file of files) {
      const check = validateUploadFile('image', file.type || 'image/png', file.size, file.name);
      if (!check.valid) throw new Error(`${file.name}: ${check.errors[0]}`);
      const compressed = await compressImageIfNeeded(file);
      const id = randomId('med');
      const title = (customTitle || file.name.replace(/\.[^/.]+$/, '')).slice(0, 200);
      await setDoc(doc(db, 'mediaAssets', id), {
        id,
        title,
        file_name: file.name.slice(0, 240),
        folder: folder.slice(0, 80),
        mime_type: compressed.mimeType.slice(0, 80),
        size_bytes: compressed.sizeBytes,
        url: compressed.dataUrl,
        source_type: 'upload',
        model_3d_id: null,
        preferred_view: 'STANDARD',
        is_public: true,
        uploaded_by: adminUser.id,
        createdAt: serverTimestamp(),
      });
      created.push({
        id,
        title,
        file_name: file.name,
        folder,
        mime_type: compressed.mimeType,
        size_bytes: compressed.sizeBytes,
        url: compressed.dataUrl,
        source_type: 'upload',
        uploaded_by: adminUser.id,
        created_at: new Date().toISOString(),
      });
    }
    await writeAdminLog(
      adminUser,
      'MEDIA_UPLOADED',
      'MEDIA',
      created[0]?.id || 'batch',
      `Uploaded ${created.length} image(s) to folder "${folder}".`
    );
    return { assets: created } as T;
  }

  const mediaReplaceMatch = pathname.match(/^\/api\/admin\/media\/([^/]+)\/replace$/);
  if (mediaReplaceMatch && method === 'POST') {
    const id = mediaReplaceMatch[1];
    if (!(options.body instanceof FormData)) throw new Error('Replacement image file is required.');
    const file = options.body.get('file');
    if (!(file instanceof File)) throw new Error('Replacement image file is required.');
    const check = validateUploadFile('image', file.type || 'image/png', file.size, file.name);
    if (!check.valid) throw new Error(check.errors[0]);
    const compressed = await compressImageIfNeeded(file);
    await updateDoc(doc(db, 'mediaAssets', id), {
      file_name: file.name.slice(0, 240),
      mime_type: compressed.mimeType,
      size_bytes: compressed.sizeBytes,
      url: compressed.dataUrl,
    });
    const snap = await getDoc(doc(db, 'mediaAssets', id));
    return { asset: { ...snap.data(), created_at: toIso(snap.data()?.createdAt) } } as T;
  }

  const mediaIdMatch = pathname.match(/^\/api\/admin\/media\/([^/]+)$/);
  if (mediaIdMatch) {
    const id = mediaIdMatch[1];
    if (method === 'PATCH') {
      const b = parseJsonBody();
      const title = String(b.title || '').trim();
      const folder = String(b.folder || 'general').trim();
      if (!title) throw new Error('Title is required.');
      await updateDoc(doc(db, 'mediaAssets', id), {
        title: title.slice(0, 200),
        folder: folder.slice(0, 80),
      });
      const snap = await getDoc(doc(db, 'mediaAssets', id));
      return { asset: { ...snap.data(), created_at: toIso(snap.data()?.createdAt) } } as T;
    }
    if (method === 'DELETE') {
      await deleteDoc(doc(db, 'mediaAssets', id));
      await writeAdminLog(adminUser, 'MEDIA_DELETED', 'MEDIA', id, `Deleted media ${id}`);
      return { success: true } as T;
    }
  }

  // Documents
  if (pathname === '/api/admin/documents' && method === 'GET') {
    const [docSnap, m3dSnap] = await Promise.all([
      getDocs(collection(db, 'documents')),
      getDocs(collection(db, 'models3d')),
    ]);
    const readyModels = new Map<string, any>();
    for (const d of m3dSnap.docs) {
      if (d.data().status === 'READY') readyModels.set(d.id, d.data());
    }
    const documents: DocumentAsset[] = docSnap.docs
      .map((d) => {
        const x = d.data();
        const linkedModel = x.model_3d_id ? readyModels.get(x.model_3d_id) : null;
        return {
          id: x.id,
          title: x.title,
          file_name: x.file_name,
          mime_type: x.mime_type,
          size_bytes: x.size_bytes,
          is_confidential: Boolean(x.is_confidential),
          case_id: x.case_id || null,
          model_3d_id: x.model_3d_id || null,
          model_3d_url: linkedModel?.url || null,
          model_3d_format: linkedModel?.format || null,
          preferred_view: x.preferred_view || 'STANDARD',
          uploaded_by: x.uploaded_by,
          created_at: toIso(x.createdAt),
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { documents } as T;
  }

  if (pathname === '/api/admin/documents' && method === 'POST') {
    if (!(options.body instanceof FormData)) throw new Error('Document file is required.');
    const file = options.body.get('file');
    if (!(file instanceof File)) throw new Error('Document file is required.');
    const check = validateUploadFile('document', file.type || 'text/plain', file.size, file.name);
    if (!check.valid) throw new Error(check.errors[0]);
    const dataUrl = await readBoundedAssetDataUrl(file);
    const id = randomId('doc');
    const title = String(options.body.get('title') || file.name).trim().slice(0, 200);
    const isConf = options.body.get('is_confidential') !== 'false';
    const caseId = options.body.get('case_id') ? String(options.body.get('case_id')) : null;

    await setDoc(doc(db, 'documents', id), {
      id,
      title,
      file_name: file.name.slice(0, 240),
      mime_type: (file.type || 'application/octet-stream').slice(0, 80),
      size_bytes: file.size,
      data_url: dataUrl,
      is_confidential: isConf,
      case_id: caseId,
      model_3d_id: null,
      preferred_view: 'STANDARD',
      uploaded_by: adminUser.id,
      createdAt: serverTimestamp(),
    });
    await writeAdminLog(adminUser, 'DOCUMENT_UPLOADED', 'DOCUMENT', id, `Uploaded document "${title}"`);
    return {
      document: {
        id,
        title,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        is_confidential: isConf,
        case_id: caseId,
        uploaded_by: adminUser.id,
        created_at: new Date().toISOString(),
      },
    } as T;
  }

  const docDelMatch = pathname.match(/^\/api\/admin\/documents\/([^/]+)$/);
  if (docDelMatch && method === 'DELETE') {
    await deleteDoc(doc(db, 'documents', docDelMatch[1]));
    await writeAdminLog(adminUser, 'DOCUMENT_DELETED', 'DOCUMENT', docDelMatch[1], `Deleted document ${docDelMatch[1]}`);
    return { success: true } as T;
  }

  // Audio
  if (pathname === '/api/admin/audio' && method === 'GET') {
    const snap = await getDocs(collection(db, 'audioAssets'));
    const audio: AudioAsset[] = snap.docs
      .map((d) => ({
        ...(d.data() as any),
        created_at: toIso(d.data().createdAt),
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { audio } as T;
  }

  if (pathname === '/api/admin/audio' && method === 'POST') {
    if (!(options.body instanceof FormData)) throw new Error('Audio file is required.');
    const file = options.body.get('file');
    if (!(file instanceof File)) throw new Error('Audio file is required.');
    const check = validateUploadFile('audio', file.type || 'audio/mpeg', file.size, file.name);
    if (!check.valid) throw new Error(check.errors[0]);
    const dataUrl = await readBoundedAssetDataUrl(file);
    const id = randomId('aud');
    const title = String(options.body.get('title') || file.name).trim().slice(0, 200);
    const description = String(options.body.get('description') || '').trim().slice(0, 5000);
    const transcript = String(options.body.get('transcript') || '').trim().slice(0, 30000);
    const caseId = options.body.get('case_id') ? String(options.body.get('case_id')) : null;
    const chapterNumber = Math.max(1, Number(options.body.get('chapter_number') || 1));

    const asset = {
      id,
      title,
      description,
      transcript,
      file_name: file.name.slice(0, 240),
      mime_type: (file.type || 'audio/mpeg').slice(0, 80),
      size_bytes: file.size,
      url: dataUrl,
      case_id: caseId,
      chapter_number: chapterNumber,
      is_public: true,
      uploaded_by: adminUser.id,
      createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'audioAssets', id), asset);
    await writeAdminLog(adminUser, 'AUDIO_UPLOADED', 'AUDIO', id, `Uploaded audio "${title}"`);
    return { asset: { ...asset, created_at: new Date().toISOString() } } as T;
  }

  const audioDelMatch = pathname.match(/^\/api\/admin\/audio\/([^/]+)$/);
  if (audioDelMatch && method === 'DELETE') {
    await deleteDoc(doc(db, 'audioAssets', audioDelMatch[1]));
    await writeAdminLog(adminUser, 'AUDIO_DELETED', 'AUDIO', audioDelMatch[1], `Deleted audio ${audioDelMatch[1]}`);
    return { success: true } as T;
  }

  // 3D Evidence Studio
  if (pathname === '/api/admin/3d' && method === 'GET') {
    const snap = await getDocs(collection(db, 'models3d'));
    const models: Model3DAsset[] = snap.docs
      .map((d) => ({
        ...(d.data() as any),
        created_at: toIso(d.data().createdAt),
        updated_at: toIso(d.data().updatedAt),
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      models,
      providerStatus: {
        configured: false,
        provider: null,
        providerLabel: 'Direct GLB/GLTF Cloud Mode',
        message:
          'Direct GLB/GLTF upload & 3D inspection is ready in cloud storage. AI image-to-3D generation requires configuring MESHY_API_KEY or TRIPO_API_KEY on a dedicated conversion worker.',
      },
    } as T;
  }

  if (pathname === '/api/admin/3d/upload' && method === 'POST') {
    if (!(options.body instanceof FormData)) throw new Error('3D model file is required.');
    const file = options.body.get('file');
    if (!(file instanceof File)) throw new Error('3D model file is required.');
    const uploadCheck = validateUploadFile('model3d', file.type || '', file.size, file.name);
    if (!uploadCheck.valid) throw new Error(uploadCheck.errors[0] || 'Invalid 3D model file.');
    const format: 'GLB' | 'GLTF' = file.name.toLowerCase().endsWith('.gltf') ? 'GLTF' : 'GLB';
    const dataUrl = await readBoundedAssetDataUrl(file);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = validateModel3DPayload(bytes, format);
    if (!check.valid) throw new Error(check.errors[0] || 'Invalid 3D model.');
    const id = randomId('m3d');
    const title = String(options.body.get('title') || file.name.replace(/\.[^/.]+$/, '')).slice(0, 200);
    const linkedType = options.body.get('linked_entity_type')
      ? (String(options.body.get('linked_entity_type')) as Entity3DLinkType)
      : null;
    const linkedId = options.body.get('linked_entity_id')
      ? String(options.body.get('linked_entity_id'))
      : null;

    const modelDoc = {
      id,
      title,
      file_name: file.name.slice(0, 240),
      format,
      mime_type: format === 'GLB' ? 'model/gltf-binary' : 'model/gltf+json',
      size_bytes: file.size,
      url: dataUrl,
      source_type: 'UPLOAD' as const,
      source_image_url: null,
      linked_entity_type: linkedType,
      linked_entity_id: linkedId,
      provider: 'upload',
      external_task_id: null,
      progress: 100,
      status: 'READY' as const,
      error_message: '',
      is_public: true,
      uploaded_by: adminUser.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'models3d', id), modelDoc);
    await writeAdminLog(adminUser, 'MODEL_3D_UPLOADED', 'MODEL_3D', id, `Uploaded 3D model "${title}" (${format})`);
    return {
      model: { ...modelDoc, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    } as T;
  }

  if (pathname === '/api/admin/3d/generate' && method === 'POST') {
    throw new Error(
      'External AI 3D conversion provider (MESHY_API_KEY / TRIPO_API_KEY) is not configured. Use Upload 3D Model (.glb/.gltf) or keep Standard View.'
    );
  }

  if (pathname === '/api/admin/3d/link' && method === 'POST') {
    const b = parseJsonBody();
    const entityType = String(b.entity_type || '') as Entity3DLinkType;
    const entityId = String(b.entity_id || '');
    const modelId = b.model_3d_id ? String(b.model_3d_id) : null;
    const preferredView: PreferredViewMode = modelId && b.preferred_view === '3D' ? '3D' : 'STANDARD';
    const caseId = b.case_id ? String(b.case_id) : '';

    if (modelId) {
      await updateDoc(doc(db, 'models3d', modelId), {
        linked_entity_type: entityType,
        linked_entity_id: entityId,
        updatedAt: serverTimestamp(),
      }).catch(() => undefined);
    }
    if (entityType === 'MEDIA') {
      await updateDoc(doc(db, 'mediaAssets', entityId), {
        model_3d_id: modelId,
        preferred_view: preferredView,
      });
    } else if (entityType === 'DOCUMENT') {
      await updateDoc(doc(db, 'documents', entityId), {
        model_3d_id: modelId,
        preferred_view: preferredView,
      });
    } else if (entityType === 'CASE_SCENE') {
      await updateDoc(doc(db, 'cases', entityId), {
        scene_3d_model_id: modelId,
        scene_preferred_view: preferredView,
        updatedAt: serverTimestamp(),
      });
    } else if (entityType === 'EVIDENCE') {
      let resolvedCaseId = caseId;
      if (!resolvedCaseId) {
        const casesSnap = await getDocs(collection(db, 'cases'));
        for (const c of casesSnap.docs) {
          const evSnap = await getDoc(doc(db, 'cases', c.id, 'evidence', entityId));
          if (evSnap.exists()) {
            resolvedCaseId = c.id;
            break;
          }
        }
      }
      if (resolvedCaseId) {
        await updateDoc(doc(db, 'cases', resolvedCaseId, 'evidence', entityId), {
          model_3d_id: modelId,
          preferred_view: preferredView,
        });
      }
    } else if (entityType === 'CHARACTER') {
      let resolvedCaseId = caseId;
      if (!resolvedCaseId) {
        const casesSnap = await getDocs(collection(db, 'cases'));
        for (const c of casesSnap.docs) {
          const chrSnap = await getDoc(doc(db, 'cases', c.id, 'characters', entityId));
          if (chrSnap.exists()) {
            resolvedCaseId = c.id;
            break;
          }
        }
      }
      if (resolvedCaseId) {
        await updateDoc(doc(db, 'cases', resolvedCaseId, 'characters', entityId), {
          model_3d_id: modelId,
          preferred_view: preferredView,
        });
      }
    }
    await writeAdminLog(adminUser, 'MODEL_3D_LINKED', entityType, entityId, `Linked 3D view (${preferredView}) on ${entityType}`);
    return { success: true } as T;
  }

  const m3dIdMatch = pathname.match(/^\/api\/admin\/3d\/([^/]+)$/);
  if (m3dIdMatch) {
    const id = m3dIdMatch[1];
    if (method === 'GET') {
      const snap = await getDoc(doc(db, 'models3d', id));
      if (!snap.exists()) throw new Error('3D model not found.');
      return {
        model: {
          ...snap.data(),
          created_at: toIso(snap.data().createdAt),
          updated_at: toIso(snap.data().updatedAt),
        },
      } as T;
    }
    if (method === 'DELETE') {
      await deleteDoc(doc(db, 'models3d', id));
      await writeAdminLog(adminUser, 'MODEL_3D_DELETED', 'MODEL_3D', id, `Deleted 3D asset ${id}`);
      return { success: true } as T;
    }
  }

  // Players Management
  if (pathname === '/api/admin/players' && method === 'GET') {
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const [usersSnap, repsSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'reports')),
    ]);
    const reportsByUser = new Map<string, { total: number; approved: number }>();
    for (const d of repsSnap.docs) {
      const r = d.data();
      const prev = reportsByUser.get(r.user_id) || { total: 0, approved: 0 };
      prev.total += 1;
      if (r.status === 'APPROVED') prev.approved += 1;
      reportsByUser.set(r.user_id, prev);
    }

    const players = await Promise.all(
      usersSnap.docs.map(async (d) => {
        const u = d.data();
        let email = '';
        let emailVerified = true;
        try {
          const privSnap = await getDoc(doc(db, 'users', u.id, 'private', 'info'));
          if (privSnap.exists()) {
            email = privSnap.data().email || '';
            emailVerified = Boolean(privSnap.data().email_verified);
          }
        } catch {
          // Ignore missing private doc
        }
        const counts = reportsByUser.get(u.id) || { total: 0, approved: 0 };
        return {
          ...u,
          email,
          email_verified: emailVerified,
          total_reports: counts.total,
          approved_reports: counts.approved,
          created_at: toIso(u.createdAt),
        };
      })
    );

    const filtered = players
      .filter(
        (p: any) =>
          !search ||
          p.email.toLowerCase().includes(search) ||
          String(p.full_name || '').toLowerCase().includes(search) ||
          String(p.player_code || '').toLowerCase().includes(search)
      )
      .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at));

    return { players: filtered } as T;
  }

  const playerStatusMatch = pathname.match(/^\/api\/admin\/players\/([^/]+)\/status$/);
  if (playerStatusMatch && method === 'PATCH') {
    const uid = playerStatusMatch[1];
    const b = parseJsonBody();
    const nextStatus = b.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) throw new Error('Player not found.');
    if (snap.data().role === 'SUPER_ADMIN') {
      throw new Error('Super Admin accounts cannot be suspended.');
    }
    await updateDoc(doc(db, 'users', uid), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
    await writeAdminLog(
      adminUser,
      nextStatus === 'SUSPENDED' ? 'PLAYER_SUSPENDED' : 'PLAYER_RESTORED',
      'USER',
      uid,
      `Changed account status to ${nextStatus}`
    );
    return { success: true } as T;
  }

  const playerCareerMatch = pathname.match(/^\/api\/admin\/players\/([^/]+)\/career$/);
  if (playerCareerMatch && method === 'PATCH') {
    const uid = playerCareerMatch[1];
    const b = parseJsonBody();
    const boot = await getRawBootstrap();
    const inst = boot.institutions.find((i) => i.id === Number(b.institution_id));
    const rank = boot.ranks.find((r) => r.id === Number(b.rank_id));
    if (!inst || !rank) throw new Error('Valid institution and rank are required.');
    const reason = String(b.reason || 'Directorate career assignment').trim().slice(0, 500);

    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) throw new Error('Player not found.');
    const current = snap.data();

    await updateDoc(doc(db, 'users', uid), {
      institution_id: inst.id,
      institution_code: inst.code,
      institution_name: inst.name,
      rank_id: rank.id,
      rank_title: rank.title,
      rank_order: rank.level_order,
      updatedAt: serverTimestamp(),
    });

    const carId = randomId('car');
    await setDoc(doc(db, 'users', uid, 'careerHistory', carId), {
      id: carId,
      user_id: uid,
      from_institution_name: current.institution_name || '',
      to_institution_name: inst.name,
      from_rank_title: current.rank_title || '',
      to_rank_title: rank.title,
      reason,
      recorded_by: adminUser.id,
      createdAt: serverTimestamp(),
    });

    const ntfId = randomId('ntf');
    await setDoc(doc(db, 'users', uid, 'notifications', ntfId), {
      id: ntfId,
      user_id: uid,
      title: 'Career Status Updated',
      message: `Your institutional assignment or rank has been updated: ${reason}`,
      is_read: false,
      createdAt: serverTimestamp(),
    });

    await writeAdminLog(adminUser, 'PLAYER_CAREER_UPDATED', 'USER', uid, reason);
    return { success: true } as T;
  }

  // Reports Evaluation
  if (pathname === '/api/admin/reports' && method === 'GET') {
    const [repSnap, solSnap] = await Promise.all([
      getDocs(collection(db, 'reports')),
      getDocs(collection(db, 'caseSolutions')),
    ]);
    const solMap = new Map(solSnap.docs.map((d) => [d.id, d.data()]));
    const reports = repSnap.docs
      .map((d) => {
        const r = d.data();
        const sol = solMap.get(r.case_id);
        return {
          ...r,
          master_solution: sol?.master_solution || '',
          responsible_character: sol?.responsible_character || '',
        };
      })
      .sort((a: any, b: any) =>
        String(b.submitted_at || '').localeCompare(String(a.submitted_at || ''))
      );
    return { reports } as T;
  }

  const evalMatch = pathname.match(/^\/api\/admin\/reports\/([^/]+)\/evaluate$/);
  if (evalMatch && method === 'POST') {
    const reportId = evalMatch[1];
    const repSnap = await getDoc(doc(db, 'reports', reportId));
    if (!repSnap.exists()) throw new Error('Report not found.');
    const rep = repSnap.data();
    const b = parseJsonBody();
    const score = Math.max(0, Math.min(100, Number(b.score || 0)));
    const decision = b.decision === 'REJECTED' ? 'REJECTED' : 'APPROVED';
    const feedback = String(b.feedback || '').trim().slice(0, 10000);
    const careerAction = String(b.career_action || '').trim().slice(0, 500);
    const nowIso = new Date().toISOString();

    await updateDoc(doc(db, 'reports', reportId), {
      status: decision,
      score,
      decision,
      feedback,
      career_action: careerAction,
      evaluated_by: adminUser.id,
      evaluated_at: nowIso,
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'users', rep.user_id, 'caseProgress', rep.case_id), {
      status: decision === 'APPROVED' ? 'COMPLETED' : 'IN_PROGRESS',
      updatedAt: serverTimestamp(),
    }).catch(() => undefined);

    // Recalculate aggregate Hall of Fame stats on user profile
    const userRepsSnap = await getDocs(
      query(collection(db, 'reports'), where('user_id', '==', rep.user_id))
    );
    const approved = userRepsSnap.docs
      .map((d) => d.data())
      .filter((r) => r.status === 'APPROVED');
    const avg =
      approved.length > 0
        ? Math.round(
            (approved.reduce((acc, r) => acc + Number(r.score || 0), 0) / approved.length) * 10
          ) / 10
        : 0;
    await updateDoc(doc(db, 'users', rep.user_id), {
      approved_cases_count: approved.length,
      average_score: avg,
      updatedAt: serverTimestamp(),
    });

    const ntfId = randomId('ntf');
    await setDoc(doc(db, 'users', rep.user_id, 'notifications', ntfId), {
      id: ntfId,
      user_id: rep.user_id,
      title: `Report Evaluation: ${decision}`,
      message: `Your investigation report received a score of ${score}/100 (${decision}). ${feedback}`,
      is_read: false,
      createdAt: serverTimestamp(),
    });

    await writeAdminLog(
      adminUser,
      'REPORT_EVALUATED',
      'REPORT',
      reportId,
      `Evaluated report (${decision}, score ${score}/100)`
    );
    return { success: true } as T;
  }

  // Website Content, Institutions, Ranks, Regions, Settings
  const instPutMatch = pathname.match(/^\/api\/admin\/institutions\/(\d+)$/);
  if (instPutMatch && method === 'PUT') {
    const id = Number(instPutMatch[1]);
    const b = parseJsonBody();
    const boot = await getRawBootstrap();
    boot.institutions = boot.institutions.map((i) =>
      i.id === id
        ? {
            ...i,
            name: String(b.name || i.name),
            short_name: String(b.short_name || i.short_name),
            tagline: String(b.tagline || ''),
            description: String(b.description || ''),
            responsibilities: Array.isArray(b.responsibilities) ? b.responsibilities : [],
            progression_notes: String(b.progression_notes || ''),
            logo_url: b.logo_url === '' ? null : b.logo_url ?? i.logo_url,
          }
        : i
    );
    await saveBootstrapPayload(boot);
    await writeAdminLog(adminUser, 'INSTITUTION_UPDATED', 'INSTITUTION', String(id), `Updated institution ${b.name}`);
    return { success: true } as T;
  }

  const rankPutMatch = pathname.match(/^\/api\/admin\/ranks\/(\d+)$/);
  if (rankPutMatch && method === 'PUT') {
    const id = Number(rankPutMatch[1]);
    const b = parseJsonBody();
    const boot = await getRawBootstrap();
    boot.ranks = boot.ranks.map((r) =>
      r.id === id
        ? {
            ...r,
            title: String(b.title || r.title),
            min_cases_required: Number(b.min_cases_required || 0),
            min_score_required: Number(b.min_score_required || 0),
            description: String(b.description || ''),
          }
        : r
    );
    await saveBootstrapPayload(boot);
    await writeAdminLog(adminUser, 'RANK_UPDATED', 'RANK', String(id), `Updated rank ${b.title}`);
    return { success: true } as T;
  }

  const regPutMatch = pathname.match(/^\/api\/admin\/regions\/(\d+)$/);
  if (regPutMatch && method === 'PUT') {
    const id = Number(regPutMatch[1]);
    const b = parseJsonBody();
    const boot = await getRawBootstrap();
    boot.regions = boot.regions.map((r) =>
      r.id === id
        ? {
            ...r,
            headquarters_label: String(b.headquarters_label || ''),
            description: String(b.description || ''),
            terrain_notes: String(b.terrain_notes || ''),
            illustration_url: b.illustration_url || null,
          }
        : r
    );
    await saveBootstrapPayload(boot);
    await writeAdminLog(adminUser, 'REGION_UPDATED', 'REGION', String(id), `Updated region #${id}`);
    return { success: true } as T;
  }

  const contentPutMatch = pathname.match(/^\/api\/admin\/content\/([^/]+)$/);
  if (contentPutMatch && method === 'PUT') {
    const key = contentPutMatch[1];
    const b = parseJsonBody();
    const boot = await getRawBootstrap();
    boot.content[key] = {
      key,
      section_group: b.section_group || boot.content[key]?.section_group || 'homepage',
      title: String(b.title || ''),
      body: String(b.body || ''),
      media_url: b.media_url === '' ? null : b.media_url ?? null,
      is_visible: b.is_visible !== false,
      extra_json: b.extra_json || null,
    };
    await saveBootstrapPayload(boot);
    await writeAdminLog(adminUser, 'CONTENT_UPDATED', 'CONTENT', key, `Updated website section "${key}"`);
    return { success: true } as T;
  }

  if (pathname === '/api/admin/settings' && method === 'PUT') {
    const b = parseJsonBody();
    const boot = await getRawBootstrap();
    for (const [k, v] of Object.entries(b)) {
      boot.settings[k] = String(v ?? '');
    }
    await saveBootstrapPayload(boot);
    await writeAdminLog(adminUser, 'SETTINGS_UPDATED', 'SETTINGS', 'global', 'Updated global site settings.');
    return { success: true } as T;
  }

  if (pathname === '/api/admin/logs' && method === 'GET') {
    const snap = await getDocs(collection(db, 'adminLogs'));
    const logs = snap.docs
      .map((d) => ({ ...d.data(), created_at: toIso(d.data().createdAt) }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 200);
    return { logs } as T;
  }

  throw new Error(`Unsupported API route: ${method} ${pathname}`);
}
