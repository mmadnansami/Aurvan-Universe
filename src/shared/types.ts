export type UserRole = 'PLAYER' | 'ADMIN' | 'SUPER_ADMIN';

export type CaseStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'READY_TO_PUBLISH'
  | 'PUBLISHED'
  | 'ARCHIVED';

export type CaseDifficulty = 'STANDARD' | 'INTERMEDIATE' | 'ADVANCED' | 'CLASSIFIED';

export type InstitutionCode = 'AURVAN_POLICE' | 'SAB' | 'SIA';

export interface Institution {
  id: number;
  code: InstitutionCode;
  name: string;
  short_name: string;
  tagline: string;
  description: string;
  responsibilities: string[];
  progression_notes: string;
  logo_url: string | null;
  sort_order: number;
}

export interface Rank {
  id: number;
  institution_id: number;
  institution_code?: InstitutionCode;
  institution_name?: string;
  code: string;
  title: string;
  level_order: number;
  min_cases_required: number;
  min_score_required: number;
  description: string;
}

export interface Region {
  id: number;
  code: string;
  name: string;
  division_bn: string;
  headquarters_label: string;
  description: string;
  terrain_notes: string;
  map_x: number;
  map_y: number;
  illustration_url: string | null;
  is_active: boolean;
  published_case_count?: number;
}

export interface PublicUser {
  id: string;
  email: string;
  full_name: string;
  player_code: string;
  role: UserRole;
  institution_id: number;
  institution_code: InstitutionCode;
  institution_name: string;
  rank_id: number;
  rank_title: string;
  rank_order: number;
  status: 'ACTIVE' | 'SUSPENDED';
  email_verified: boolean;
  bio: string;
  created_at: string;
}

export type PreferredViewMode = 'STANDARD' | '3D';
export type Entity3DLinkType = 'MEDIA' | 'EVIDENCE' | 'DOCUMENT' | 'CHARACTER' | 'CASE_SCENE';
export type Model3DStatus = 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';

export interface Model3DAsset {
  id: string;
  title: string;
  file_name: string;
  format: 'GLB' | 'GLTF';
  mime_type: string;
  size_bytes: number;
  url: string;
  source_type: 'UPLOAD' | 'AI_CONVERSION';
  source_image_url: string | null;
  linked_entity_type: Entity3DLinkType | null;
  linked_entity_id: string | null;
  provider: string;
  external_task_id: string | null;
  progress: number;
  status: Model3DStatus;
  error_message: string;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Studio3DProviderStatus {
  configured: boolean;
  provider: 'meshy' | 'tripo' | 'custom' | null;
  providerLabel: string;
  message: string;
}

export interface PublicCaseSummary {
  id: string;
  case_code: string;
  title: string;
  slug: string;
  short_description: string;
  institution_id: number;
  institution_code: InstitutionCode;
  institution_name: string;
  region_id: number;
  region_name: string;
  difficulty: CaseDifficulty;
  estimated_duration: string;
  status: CaseStatus;
  cover_image_url: string | null;
  thumbnail_url: string | null;
  scene_3d_model_id?: string | null;
  scene_3d_url?: string | null;
  scene_3d_format?: 'GLB' | 'GLTF' | null;
  scene_preferred_view?: PreferredViewMode;
  min_rank_order: number;
  published_at: string | null;
}

export interface CaseChapter {
  id: string;
  case_id: string;
  chapter_number: number;
  title: string;
  briefing_text: string;
  unlock_condition: string;
}

export interface CaseEvidence {
  id: string;
  case_id: string;
  evidence_code: string;
  title: string;
  evidence_type: 'PHYSICAL' | 'DIGITAL' | 'DOCUMENT' | 'AUDIO' | 'PHOTOGRAPH' | 'FORENSIC';
  description: string;
  image_url: string | null;
  document_id: string | null;
  document_title?: string | null;
  document_mime?: string | null;
  audio_id: string | null;
  audio_title?: string | null;
  audio_url?: string | null;
  audio_transcript?: string | null;
  model_3d_id?: string | null;
  model_3d_url?: string | null;
  model_3d_format?: 'GLB' | 'GLTF' | null;
  model_3d_status?: Model3DStatus | null;
  preferred_view?: PreferredViewMode;
  chapter_number: number;
  access_condition: string;
  related_characters: string[];
  related_evidence: string[];
  private_explanation?: string;
  sort_order: number;
  is_visible: boolean;
}

export interface CaseCharacter {
  id: string;
  case_id: string;
  name: string;
  role: string;
  portrait_url: string | null;
  description: string;
  background: string;
  relationships: string[];
  private_info?: string;
  model_3d_id?: string | null;
  model_3d_url?: string | null;
  model_3d_format?: 'GLB' | 'GLTF' | null;
  preferred_view?: PreferredViewMode;
  is_public: boolean;
}

export interface CaseWitness {
  id: string;
  case_id: string;
  name: string;
  role: string;
  portrait_url: string | null;
  statement_text: string;
  chapter_number: number;
}

export interface InterrogationQuestion {
  id: string;
  case_id: string;
  witness_id: string;
  question_text: string;
  response_text: string;
  follow_up_hint: string;
  hidden_evaluation_rule?: string;
  sort_order: number;
}

export interface CaseHint {
  id: string;
  case_id: string;
  chapter_number: number;
  hint_order: number;
  hint_text: string;
  unlock_condition: string;
  is_enabled: boolean;
}

export interface CaseSolution {
  case_id: string;
  master_solution: string;
  actual_timeline: Array<{ time: string; event: string }>;
  responsible_character: string;
  evidence_explanations: string[];
  red_herrings: string[];
  critical_clues: string[];
  internal_notes: string;
}

export interface MediaAsset {
  id: string;
  title: string;
  file_name: string;
  folder: string;
  mime_type: string;
  size_bytes: number;
  url: string;
  source_type: string;
  model_3d_id?: string | null;
  model_3d_url?: string | null;
  model_3d_format?: 'GLB' | 'GLTF' | null;
  preferred_view?: PreferredViewMode;
  uploaded_by: string | null;
  created_at: string;
}

export interface DocumentAsset {
  id: string;
  title: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  is_confidential: boolean;
  case_id: string | null;
  model_3d_id?: string | null;
  model_3d_url?: string | null;
  model_3d_format?: 'GLB' | 'GLTF' | null;
  preferred_view?: PreferredViewMode;
  uploaded_by: string | null;
  created_at: string;
}

export interface AudioAsset {
  id: string;
  title: string;
  description: string;
  transcript: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  url: string;
  case_id: string | null;
  chapter_number: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface SiteContentItem {
  key: string;
  section_group: string;
  title: string;
  body: string;
  media_url: string | null;
  is_visible: boolean;
  extra_json: string | null;
}

export interface CaseValidationPayload {
  case_code: string;
  title: string;
  short_description: string;
  full_story: string;
  institution_id: number | null;
  region_id: number | null;
  difficulty: string;
  estimated_duration: string;
  player_tasks: string[];
  evaluation_criteria: string[];
  chaptersCount: number;
  evidenceCount: number;
  hasMasterSolution: boolean;
  masterSolutionText?: string;
}
