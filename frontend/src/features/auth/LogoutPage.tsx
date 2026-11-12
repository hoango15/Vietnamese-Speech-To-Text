import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../../shared/api/client";
import { message } from "../../shared/lib/errors";
import { ErrorBox } from "../../shared/ui/components";
import { useAuth } from "./AuthProvider";

export function LogoutPage() {
  const { user } = useAuth();
  const location = useLocation(), navigate = useNavigate();
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState("");
  const from = location.state?.from;
  const returnTo = typeof from === "string" && from.startsWith("/") && !from.startsWith("//") && from.split("?")[0] !== "/logout" ? from : "/";
  async function logout(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api.request("/auth/logout", { method: "POST" });
    } catch (reason) {
      setError(message(reason)); setBusy(false); return;
    }
    api.setSession(null);
    setDone(true); setBusy(false);
  }
  return <main className="boot">
    <section className="card panel stack" aria-labelledby="logout-title">
      {done || !user ? <>
        <h1 id="logout-title">Đã đăng xuất</h1>
        <p>Phiên làm việc trên trình duyệt này đã kết thúc.</p>
        <Link className="button" to="/login">Đăng nhập lại</Link>
      </> : <form className="stack" onSubmit={logout}>
        <h1 id="logout-title">Xác nhận đăng xuất</h1>
        <p>Bạn muốn kết thúc phiên làm việc của {user.full_name}?</p>
        {error && <ErrorBox error={error} />}
        <div className="form-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={() => navigate(returnTo, { replace: true })}>Hủy</button>
          <button className="button" disabled={busy}>{busy ? "Đang đăng xuất…" : "Đăng xuất"}</button>
        </div>
      </form>}
    </section>
  </main>;
}
