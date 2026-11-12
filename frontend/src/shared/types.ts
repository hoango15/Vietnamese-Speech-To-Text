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
