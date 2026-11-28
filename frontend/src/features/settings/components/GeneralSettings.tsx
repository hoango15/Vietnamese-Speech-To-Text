import { Link } from "react-router-dom";
import { Building2, ShieldCheck } from "lucide-react";
import { api } from "../../../shared/api/client";
import { useResource } from "../../../shared/hooks/useResource";
import { useAction } from "../../../shared/hooks/useAction";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBox, Loading } from "../../../shared/ui/components";

export function GeneralSettings() {
  const { user } = useAuth();
  const action = useAction();
  const org = useResource<{ organization_id: string; organization_name: string }>("/organizations/current");
  const canEdit = user?.user_role_code === "ADMIN";
  return <div className="workspace-settings-grid">
    <section className="card settings-card">
      <div className="section-heading"><div><h2>Thông tin workspace</h2><p className="muted">Không gian chung cho các dự án trong tổ chức.</p></div><Building2 size={20} /></div>
      {org.error ? <ErrorBox error={org.error} retry={org.reload} /> : org.loading ? <Loading /> : org.data &&
        <form className="stack" key={org.data.organization_name} onSubmit={event => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          action.run(async () => org.setData(await api.request("/organizations/current", {
            method: "PATCH", body: { organization_name: form.get("name") },
          })), "Đã cập nhật tổ chức.");
        }}>
          <label>Tên workspace<input name="name" defaultValue={org.data.organization_name} readOnly={!canEdit} required maxLength={200} /></label>
          {canEdit ? <button className="button" disabled={action.busy}>{action.busy ? "Đang lưu…" : "Lưu thay đổi"}</button>
            : <p className="muted">Quản trị viên có thể cập nhật thông tin workspace.</p>}
        </form>}
    </section>
    <aside className="card settings-card settings-help">
      <ShieldCheck size={26} /><h2>Tài khoản của bạn</h2>
      <p>Tên hiển thị và mật khẩu được quản lý trong hồ sơ cá nhân. Quyền truy cập nội dung phụ thuộc vai trò và từng dự án.</p>
      <Link className="text-link" to="/profile">Mở hồ sơ cá nhân</Link>
    </aside>
  </div>;
}
