import type { CaseStatus, CaseValidationPayload } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCaseForPublish(data: CaseValidationPayload): ValidationResult {
  const errors: string[] = [];

  if (!data.case_code || data.case_code.trim().length < 2) {
    errors.push('Case ID / Code is required (minimum 2 characters).');
  }
  if (!data.title || data.title.trim().length < 3) {
    errors.push('Case title is required (minimum 3 characters).');
  }
  if (!data.short_description || data.short_description.trim().length < 10) {
    errors.push('Short description is required (minimum 10 characters).');
  }
  if (!data.full_story || data.full_story.trim().length < 20) {
    errors.push('Full case briefing story is required (minimum 20 characters).');
  }
  if (!data.institution_id) {
    errors.push('Target institution must be assigned.');
  }
  if (!data.region_id) {
    errors.push('Bangladesh division/region must be assigned.');
  }
  if (!data.difficulty) {
    errors.push('Difficulty classification is required.');
  }
  if (!data.estimated_duration || data.estimated_duration.trim().length < 1) {
    errors.push('Estimated investigation duration is required.');
  }
  if (data.chaptersCount < 1) {
    errors.push('At least one investigation chapter is required before publishing.');
  }
  if (data.evidenceCount < 1) {
    errors.push('At least one piece of evidence is required before publishing.');
  }
  if (!data.player_tasks || data.player_tasks.filter((t) => t.trim().length > 0).length < 1) {
    errors.push('At least one player objective/task is required.');
  }
  if (
    !data.evaluation_criteria ||
    data.evaluation_criteria.filter((c) => c.trim().length > 0).length < 1
  ) {
    errors.push('At least one evaluation criterion is required.');
  }
  if (!data.hasMasterSolution || !data.masterSolutionText || data.masterSolutionText.trim().length < 10) {
    errors.push('Private Master Solution must be completed before publishing.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

const VALID_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  DRAFT: ['DRAFT', 'IN_REVIEW', 'READY_TO_PUBLISH', 'PUBLISHED', 'ARCHIVED'],
  IN_REVIEW: ['DRAFT', 'IN_REVIEW', 'READY_TO_PUBLISH', 'PUBLISHED', 'ARCHIVED'],
  READY_TO_PUBLISH: ['DRAFT', 'IN_REVIEW', 'READY_TO_PUBLISH', 'PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  ARCHIVED: ['DRAFT', 'ARCHIVED'],
};

export function canTransitionCaseStatus(from: CaseStatus, to: CaseStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

const INSTITUTION_ORDER: Record<string, number> = {
  AURVAN_POLICE: 1,
  SAB: 2,
  SIA: 3,
};

export function isPlayerEligibleForCase(
  playerInstitutionCode: string,
  playerRankOrder: number,
  caseInstitutionCode: string,
  caseMinRankOrder: number
): { eligible: boolean; reason?: string } {
  const playerTier = INSTITUTION_ORDER[playerInstitutionCode] ?? 1;
  const requiredTier = INSTITUTION_ORDER[caseInstitutionCode] ?? 1;

  if (playerTier < requiredTier) {
    return {
      eligible: false,
      reason: `Requires clearance in ${caseInstitutionCode.replace('_', ' ')}.`,
    };
  }
  if (playerTier === requiredTier && playerRankOrder < caseMinRankOrder) {
    return {
      eligible: false,
      reason: `Requires rank tier ${caseMinRankOrder} or higher within this institution.`,
    };
  }
  return { eligible: true };
}

export type UploadCategory = 'image' | 'document' | 'audio' | 'model3d';

const ALLOWED_MIMES: Record<UploadCategory, string[]> = {
  image: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  document: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ],
  audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave'],
  model3d: ['model/gltf-binary', 'model/gltf+json', 'application/octet-stream', 'application/json'],
};

const MAX_SIZE_BYTES: Record<UploadCategory, number> = {
  image: 10 * 1024 * 1024, // 10 MB
  document: 20 * 1024 * 1024, // 20 MB
  audio: 30 * 1024 * 1024, // 30 MB
  model3d: 50 * 1024 * 1024, // 50 MB
};

export function validateUploadFile(
  category: UploadCategory,
  mimeType: string,
  sizeBytes: number,
  originalName?: string
): ValidationResult {
  const errors: string[] = [];
  const normalizedMime = (mimeType || '').toLowerCase();
  const ext = originalName ? originalName.split('.').pop()?.toLowerCase() ?? '' : '';

  const allowedExtByCategory: Record<UploadCategory, string[]> = {
    image: ['jpg', 'jpeg', 'png', 'webp'],
    document: ['pdf', 'docx', 'txt'],
    audio: ['mp3', 'wav'],
    model3d: ['glb', 'gltf'],
  };

  const mimeValid = ALLOWED_MIMES[category].includes(normalizedMime);
  const extValid = ext ? allowedExtByCategory[category].includes(ext) : false;

  // For model3d, require explicit .glb or .gltf extension (or explicit gltf MIME)
  // so arbitrary application/octet-stream or .json files cannot spoof a 3D model upload.
  const formatValid =
    category === 'model3d'
      ? extValid || normalizedMime === 'model/gltf-binary' || normalizedMime === 'model/gltf+json'
      : mimeValid || extValid;

  if (!formatValid) {
    errors.push(
      `Unsupported ${category} format. Allowed: ${allowedExtByCategory[category]
        .map((e) => e.toUpperCase())
        .join(', ')}.`
    );
  }

  if (sizeBytes <= 0) {
    errors.push('Uploaded file is empty.');
  } else if (sizeBytes > MAX_SIZE_BYTES[category]) {
    const mb = Math.round(MAX_SIZE_BYTES[category] / (1024 * 1024));
    errors.push(`File exceeds maximum allowed size of ${mb} MB.`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateModel3DPayload(bytes: Uint8Array, format: 'GLB' | 'GLTF'): ValidationResult {
  if (format === 'GLB') {
    // Binary glTF header: 12-byte header starting with ASCII "glTF" (0x67, 0x6C, 0x54, 0x46)
    if (
      bytes.length < 12 ||
      bytes[0] !== 0x67 ||
      bytes[1] !== 0x6c ||
      bytes[2] !== 0x54 ||
      bytes[3] !== 0x46
    ) {
      return { valid: false, errors: ['Invalid GLB binary file: missing glTF header signature.'] };
    }
    return { valid: true, errors: [] };
  }

  try {
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !parsed.asset?.version) {
      return { valid: false, errors: ['Invalid GLTF file: missing required glTF asset.version field.'] };
    }
    return { valid: true, errors: [] };
  } catch {
    return { valid: false, errors: ['Invalid GLTF file: malformed JSON content.'] };
  }
}

export function validateEmailAndPassword(email: string, password: string): ValidationResult {
  const errors: string[] = [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email.trim())) {
    errors.push('A valid email address is required.');
  }
  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters long.');
  }
  return { valid: errors.length === 0, errors };
}

export function slugifyCaseTitle(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
