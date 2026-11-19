import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Empty, PageTitle } from "../../shared/ui/components";

export function CompaniesPage() {
  const { user } = useAuth();
  if (user?.company_id) return <Navigate to={`/projects?scope=TEAM&company_id=${encodeURIComponent(user.company_id)}`} replace />;
  return <>
    <PageTitle title="Quản trị công ty" subtitle="Quản lý dự án thuộc không gian công ty của bạn." />
    <section className="card panel"><Empty title="Tài khoản chưa thuộc công ty" description="Liên hệ quản trị viên để được thêm vào một công ty." /></section>
  </>;
}
