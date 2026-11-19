export function canCreateProject(role: string): boolean {
  return role === "ADMIN" || role === "COMPANY_OWNER" || role === "MEMBER";
}
