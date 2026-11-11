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
