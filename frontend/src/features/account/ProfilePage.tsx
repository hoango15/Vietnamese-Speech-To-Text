import { useEffect, useState } from "react";
import { Mail, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../../shared/api/client";
import { useAction } from "../../shared/hooks/useAction";
import { Avatar, ErrorBox, Loading, PageTitle } from "../../shared/ui/components";
import type { User } from "../../shared/types";
import { useResource } from "../../shared/hooks/useResource";
import "./account.css";

const roleNames: Record<string, string> = { ADMIN: "Quản trị viên", COMPANY_OWNER: "Chủ công ty", MANAGER: "Quản lý", MEMBER: "Thành viên", VIEWER: "Người xem" };
export function ProfilePage() {
  const { user, update } = useAuth(), action = useAction();
  const resource = useResource<User>("/users/me");
  const profile = resource.data ?? user;
  const [name, setName] = useState(profile?.full_name ?? "");
  const [nameError, setNameError] = useState("");
  useEffect(() => { if (profile) setName(profile.full_name); }, [profile?.full_name]);
  if (resource.loading && !profile) return <Loading />;
  if (resource.error && !profile) return <ErrorBox error={resource.error} retry={resource.reload} />;
  if (!profile) return null;
  const saveProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fullName = name.trim();
    if (!fullName) { setNameError("Họ và tên không được để trống."); return; }
    setNameError("");
    action.run(async () => {
      const saved = await api.request<User>("/users/me", { method: "PATCH", body: { full_name: fullName } });
      update(saved); resource.setData(saved);
    }, "Đã cập nhật hồ sơ.");
  };
  return <>
    <PageTitle title="Hồ sơ của tôi" subtitle="Thông tin tài khoản và vai trò trong không gian làm việc." />
    <section className="card panel account-page">
      <div className="account-identity"><Avatar name={profile.full_name} /><div><h2>{profile.full_name}</h2><p>{profile.email}</p></div></div>
      {resource.error && <ErrorBox error={resource.error} retry={resource.reload} />}
      <form className="account-form" onSubmit={saveProfile}>
        <h2>Thông tin cá nhân</h2>
        <label>Họ và tên<input aria-invalid={Boolean(nameError)} aria-describedby={nameError ? "profile-name-error" : undefined} required maxLength={160} value={name} onChange={event => { setName(event.target.value); if (event.target.value.trim()) setNameError(""); }} />{nameError && <small id="profile-name-error" className="account-validation" role="alert">{nameError}</small>}</label>
        <label>Email đăng nhập<div className="account-readonly"><Mail size={16} />{profile.email}<small>Email hiện chưa thể thay đổi tại đây.</small></div></label>
        <div className="account-role"><ShieldCheck size={18} /><span><strong>{roleNames[profile.user_role_code] ?? profile.user_role_code}</strong><small>{profile.company_name ? `Thành viên của ${profile.company_name}` : "Quyền truy cập theo vai trò tài khoản"}</small></span></div>
        <div className="form-actions"><button className="button" disabled={action.busy || !name.trim() || name.trim() === profile.full_name}><UserRound size={16} />Lưu hồ sơ</button></div>
      </form>
    </section>
  </>;
}
