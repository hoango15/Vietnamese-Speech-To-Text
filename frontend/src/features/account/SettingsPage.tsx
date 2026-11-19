import { useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { api } from "../../shared/api/client";
import { useAction } from "../../shared/hooks/useAction";
import { PageTitle } from "../../shared/ui/components";

export function SettingsPage() {
  const [current, setCurrent] = useState(""), [password, setPassword] = useState(""), [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false), [showPassword, setShowPassword] = useState(false), [showConfirmation, setShowConfirmation] = useState(false);
  const action = useAction(), mismatch = Boolean(confirmPassword && password !== confirmPassword);
  return <>
    <PageTitle title="Cài đặt tài khoản" subtitle="Quản lý bảo mật và thông tin đăng nhập của bạn." />
    <section className="card panel account-page settings-page">
      <div className="settings-intro"><ShieldCheck size={22} /><div><h2>Bảo mật tài khoản</h2><p>Chọn mật khẩu dài ít nhất 10 ký tự, có chữ hoa và chữ số.</p></div></div>
      <form className="account-form" onSubmit={event => { event.preventDefault(); if (password !== confirmPassword) return; action.run(async () => { await api.request("/auth/password", { method: "PATCH", body: { current_password: current, new_password: password } }); setCurrent(""); setPassword(""); setConfirmPassword(""); }, "Đã đổi mật khẩu."); }}>
        <h2><KeyRound size={18} />Đổi mật khẩu</h2>
        <label>Mật khẩu hiện tại<div className="password-entry"><input aria-label="Mật khẩu hiện tại" type={showCurrent ? "text" : "password"} autoComplete="current-password" required maxLength={128} value={current} onChange={event => setCurrent(event.target.value)} /><button type="button" className="icon-button" aria-label={showCurrent ? "Ẩn mật khẩu hiện tại" : "Hiện mật khẩu hiện tại"} onClick={() => setShowCurrent(value => !value)}>{showCurrent ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
        <label>Mật khẩu mới<div className="password-entry"><input aria-label="Mật khẩu mới" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={10} maxLength={128} pattern="(?=.*[A-Z])(?=.*[0-9]).{10,128}" title="Cần ít nhất 10 ký tự, một chữ hoa và một chữ số." value={password} onChange={event => setPassword(event.target.value)} /><button type="button" className="icon-button" aria-label={showPassword ? "Ẩn mật khẩu mới" : "Hiện mật khẩu mới"} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
        <label>Xác nhận mật khẩu mới<div className="password-entry"><input aria-label="Xác nhận mật khẩu mới" type={showConfirmation ? "text" : "password"} autoComplete="new-password" required maxLength={128} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /><button type="button" className="icon-button" aria-label={showConfirmation ? "Ẩn xác nhận mật khẩu mới" : "Hiện xác nhận mật khẩu mới"} onClick={() => setShowConfirmation(value => !value)}>{showConfirmation ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
        {mismatch && <p className="account-validation" role="alert">Mật khẩu xác nhận chưa khớp.</p>}
        <div className="form-actions"><button className="button" disabled={action.busy || mismatch || !current || !password || !confirmPassword}><KeyRound size={16} />Cập nhật mật khẩu</button></div>
      </form>
    </section>
  </>;
}
