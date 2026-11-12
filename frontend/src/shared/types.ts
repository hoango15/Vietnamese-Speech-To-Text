export type Role = "ADMIN" | "COMPANY_OWNER" | "MANAGER" | "MEMBER" | "VIEWER";
export interface User {
  user_id: string;
  email: string;
  full_name: string;
  user_role_code: Role;
  is_active: boolean;
  created_at: string;
  company_id?: string | null;
  company_name?: string | null;
  company_projects_enabled?: boolean;
}
export interface Session {
  access_token: string;
  user: User;
}
export interface Project {
  project_id: string;
  project_title: string;
  project_description: string;
  language_code: string;
  project_scope?: "PERSONAL" | "TEAM";
  company_id?: string | null;
  company_name?: string | null;
  project_type?: "VIDEO" | "IMAGE" | "LECTURE" | "AUDIO" | null;
  can_invite?: boolean;
  project_status_code: string;
  owner_user_id: string;
  owner_name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  can_manage: boolean;
  can_edit: boolean;
  member_count: number;
  media_kind?: string;
  progress_percent?: number;
}
export interface Audit {
  audit_log_id: string;
  action_name: string;
  entity_name: string;
  entity_id: string;
  occurred_at: string;
  full_name?: string;
  change_detail?: unknown;
}

export interface Company {
  company_id: string;
  company_name: string;
  owner_user_id: string;
  owner_name: string;
  owner_email: string;
  member_count: number;
  project_count: number;
  created_at: string;
}

export interface List<T> {
  items: T[];
  total: number;
}

export interface Media {
  media_file_id: string;
  project_id: string;
  media_kind_code: string;
  mime_type: string;
  file_name: string;
  file_size_bytes: number;
  duration_ms: number;
  created_at: string;
  is_current: boolean;
}

export interface Job {
  job_id: string;
  job_kind?: string;
  project_id: string;
  media_file_id: string;
  file_name?: string;
  requested_exports?: string[];
  job_status_code: string;
  progress_percent: number;
  error_message: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  asr_model_name?: string;
  asr_progress?: { processed_audio_ms: number; total_audio_ms: number } | null;
  stages?: {
    job_stage_type_code: string;
    stage_status_code: string;
    error_message?: string;
  }[];
}

export interface Segment {
  segment_id?: string;
  segment_no?: number;
  start_ms: number;
  end_ms: number;
  segment_text: string;
  speaker_id?: string | null;
  confidence_score?: number;
}

export interface Speaker {
  media_file_id?: string | null;
  speaker_id: string;
  speaker_label: string;
  display_name: string;
  color_hex: string;
}

export interface Transcript {
  media_file_id?: string | null;
  transcript_id: string;
  project_id: string;
  version_no: number;
  revision: number;
  segments: Segment[];
  speakers: Speaker[];
}

export interface Minutes {
  media_file_id?: string | null;
  minutes_id: string;
  project_id: string;
  project_title?: string;
  meeting_title: string;
  meeting_date: string | null;
  summary_text: string;
  version_no: number;
  llm_model_name: string;
  topics: {
    topic_title: string;
    topic_summary: string;
    source_start_ms?: number | null;
  }[];
  decisions: { decision_text: string; source_start_ms?: number | null }[];
  action_items: {
    item_description: string;
    assignee_name?: string;
    due_date?: string | null;
    action_item_status_code: string;
    source_start_ms?: number | null;
  }[];
  created_at: string;
}

export interface ExportFile {
  media_file_id?: string | null;
  export_file_id: string;
  transcript_id?: string | null;
  project_id: string;
  project_title?: string;
  export_kind_code: string;
  file_name: string;
  file_size_bytes: number;
  source: string;
  created_at: string;
  is_stale?: boolean;
}

export interface FileRecord {
  media_file_id?: string | null;
  id: string;
  project_id: string;
  project_title: string;
  file_name: string;
  kind: string;
  size: number;
  created_at: string;
  download_url: string;
}

export interface Capabilities {
  asr: boolean;
  ocr: boolean;
  diarization: boolean;
  llm: boolean;
  asr_model: string;
  asr_provider?: "local" | "colab";
  text_provider?: "local" | "colab";
  grammar?: boolean;
  max_upload_bytes: number;
}

export interface Upload {
  upload_id: string;
  uploaded_size_bytes: number;
  expected_size_bytes: number;
  upload_status_code: string;
}
