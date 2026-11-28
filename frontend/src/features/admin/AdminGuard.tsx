import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { CompaniesPage } from "../companies/CompaniesPage";
import { AdminConsole } from "./AdminConsole";

export function AdminGuard() {
  const { user } = useAuth();
  if (user?.user_role_code === "ADMIN") return <AdminConsole />;
  if (user?.user_role_code === "COMPANY_OWNER") return <Navigate to="/company" replace />;
  return <Navigate to="/" replace />;
}

export function CompanyGuard() {
  const { user } = useAuth();
  return user?.user_role_code === "COMPANY_OWNER" ? <CompaniesPage /> : <Navigate to="/" replace />;
}
