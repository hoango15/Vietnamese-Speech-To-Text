import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AudioLines, ChevronRight, FileText, ShieldCheck, Subtitles } from "lucide-react";
import { api } from "../../shared/api/client";
import type { Session } from "../../shared/types";
import { useAction } from "../../shared/hooks/useAction";
import { useAuth } from "./AuthProvider";

export function LoginPage() {
  const [register, setRegister] = useState(false),
    [registered, setRegistered] = useState(false),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [validation, setValidation] = useState("");
  const { user, sessionEnded } = useAuth(),
    { run, busy } = useAction(),
    navigate = useNavigate(),
    location = useLocation();
  if (user) return <Navigate to="/" replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation("");
    const form = new FormData(event.currentTarget);
    if (register && password !== confirm) {
      setValidation("Mật khẩu xác nhận chưa khớp.");
      return;
    }
    await run(async () => {
      if (register) {
        await api.request("/auth/register", {
          method: "POST",
          body: {
            full_name: form.get("full_name"),
            email: form.get("email"),
            password,
          },
        });
        setRegistered(true);
        setRegister(false);
        setPassword("");
        setConfirm("");
      } else {
        const session = await api.request<Session>("/auth/login", {
          method: "POST",
          body: { email: form.get("email"), password },
        });
        api.setSession(session);
        const from = location.state?.from;
        navigate(
          typeof from === "string" &&
            from.startsWith("/") &&
            !from.startsWith("//")
            ? from
            : "/",
          { replace: true },
        );
      }
    });
  }
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Link className="brand" to="/">
          <span className="brand-icon">
            <AudioLines size={27} />
          </span>
          <span>Thanh Âm</span>
        </Link>
        <div className="auth-story-content">
          <span className="eyebrow">LẮNG NGHE NHỮNG ĐIỀU QUAN TRỌNG</span>
          <h1>
            Biến mọi lời nói
            <br />
            thành giá trị.
          </h1>
          <p>
            Chuyển âm thanh, video và hình ảnh thành văn bản.
            <br />
            Một không gian để cùng làm việc, lưu giữ và kết nối tri thức.
          </p>
          <div className="waveform" aria-hidden="true">
            {Array.from({ length: 45 }, (_, i) => (
              <i
                key={i}
                style={{
                  height: `${18 + Math.abs(Math.sin(i * 0.79)) * 75}px`,
                }}
              />
            ))}
          </div>
          <div className="auth-tags">
            <span>
              <FileText size={17} />
              Văn bản & biên bản
            </span>
            <span>
              <Subtitles size={17} />
              Phụ đề tự động
            </span>
          </div>
        </div>
        <small>Thanh Âm · Từ âm thanh đến tri thức</small>
      </div>
      <div className="auth-form-side">
        <form className="auth-form" onSubmit={submit}>
          <span className="eyebrow">BẮT ĐẦU KẾT NỐI</span>
          <h2>{register ? "Tạo tài khoản" : "Chào mừng trở lại"}</h2>
          <p>
            {register
              ? "Đăng ký để tham gia không gian làm việc."
              : "Đăng nhập để tiếp tục công việc của bạn."}
          </p>
          {sessionEnded && (
            <div className="notice-inline" role="status">
              Phiên đăng nhập đã kết thúc. Hãy đăng nhập lại để tiếp tục.
            </div>
          )}
          {registered && (
            <div className="success-box">
              Đăng ký thành công. Đăng nhập để tạo dự án cá nhân của bạn.
            </div>
          )}
          {validation && (
            <div role="alert" className="error-box">
              {validation}
            </div>
          )}
          {register && (
            <label>
              Họ và tên
              <input
                name="full_name"
                autoComplete="name"
                required
                maxLength={200}
                placeholder="Nguyễn Văn An"
              />
            </label>
          )}
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="ban@congty.vn"
            />
          </label>
          <label>
            Mật khẩu
            <input
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={register ? 10 : 1}
              pattern={
                register ? "(?=.*[A-Za-z])(?=.*[0-9]).{10,128}" : undefined
              }
              title={
                register
                  ? "Mật khẩu dài 10–128 ký tự, gồm ít nhất một chữ A–Z và một chữ số."
                  : undefined
              }
              maxLength={128}
              required
              placeholder={
                register
                  ? "10–128 ký tự, có chữ và số"
                  : "Nhập mật khẩu của bạn"
              }
            />
          </label>
          {register && (
            <label>
              Xác nhận mật khẩu
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
                minLength={10}
              />
            </label>
          )}
          <button className="button auth-submit" disabled={busy}>
            {busy ? "Đang xử lý…" : register ? "Tạo tài khoản" : "Đăng nhập"}
            <ChevronRight size={18} />
          </button>
          <div className="auth-switch">
            {register ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setRegister(!register);
                setValidation("");
                setRegistered(false);
                setPassword("");
                setConfirm("");
              }}
            >
              {register ? "Đăng nhập" : "Đăng ký"}
            </button>
          </div>
          <div className="auth-security">
            <ShieldCheck size={16} />
            Dữ liệu của bạn được bảo vệ theo quyền truy cập.
          </div>
        </form>
      </div>
    </div>
  );
}
