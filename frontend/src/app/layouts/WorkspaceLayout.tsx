import { Suspense, useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AudioLines, Bell, ChevronRight, LogOut, Menu, Search, X } from "lucide-react";
import { useAuth } from "../../features/auth/AuthProvider";
import { Avatar, Loading } from "../../shared/ui/components";
import { managementNavigation, workspaceNavigation, workspaceSections } from "./navigation";
import "./workspace.css";

export function WorkspaceLayout() {
  const { user } = useAuth();
  const [mobile, setMobile] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const change = () => {
      setCompact(media.matches);
      if (!media.matches) setMobile(false);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    if (!mobile || !compact) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarRef.current?.querySelector<HTMLButtonElement>(".mobile-close")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobile(false);
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') ?? [],
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      menuRef.current?.focus();
    };
  }, [mobile, compact]);

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  }

  const current = workspaceSections.find((section) => section.path === location.pathname);

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Đến nội dung chính</a>
      <aside
        id="workspace-navigation"
        ref={sidebarRef}
        className={"sidebar " + (mobile ? "open" : "")}
        inert={compact && !mobile}
        role={compact && mobile ? "dialog" : undefined}
        aria-modal={compact && mobile ? true : undefined}
        aria-label="Menu không gian làm việc"
      >
        <Link className="brand" to="/" onClick={() => setMobile(false)}>
          <span className="brand-icon"><AudioLines size={25} /></span>
          <span>Thanh Âm<small>KHÔNG GIAN LÀM VIỆC</small></span>
        </Link>
        <button type="button" className="mobile-close icon-button" aria-label="Đóng menu" onClick={() => setMobile(false)}>
          <X />
        </button>
        <div className="nav-caption">KHÔNG GIAN LÀM VIỆC</div>
        <nav aria-label="Điều hướng chính">
          {workspaceNavigation.map((item) => (
            <NavLink end={item.path === "/"} key={item.path} to={item.path} onClick={() => setMobile(false)}>
              <item.icon size={20} /><span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="nav-caption settings-caption">QUẢN LÝ</div>
        <nav aria-label="Cài đặt">
          {managementNavigation.filter((item) => !item.roles || item.roles.includes(user.user_role_code)).map((item) => (
            <NavLink key={item.path} to={item.path} onClick={() => setMobile(false)}>
              <item.icon size={20} /><span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <Avatar name={user.full_name} />
            <Link to="/profile" className="sidebar-profile" onClick={() => setMobile(false)}>
              <strong>{user.full_name}</strong><small>{user.email}</small>
            </Link>
            <Link
              aria-label="Đăng xuất"
              title="Đăng xuất"
              className="icon-button"
              to="/logout"
              state={{ from: location.pathname + location.search + location.hash }}
            >
              <LogOut size={18} />
            </Link>
          </div>
        </div>
      </aside>
      {mobile && (
        <button type="button" className="sidebar-backdrop" onClick={() => setMobile(false)} aria-label="Đóng menu" />
      )}
      <div className="app-main" inert={compact && mobile}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-menu icon-button"
              aria-label="Mở menu"
              ref={menuRef}
              aria-controls="workspace-navigation"
              aria-expanded={mobile}
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span className="topbar-label">Không gian làm việc</span>
            <ChevronRight size={14} />
            <span className="topbar-current">{current?.label ?? "Thanh Âm"}</span>
          </div>
          <div className="topbar-right">
            <form className="top-search" role="search" onSubmit={(event) => {
              event.preventDefault();
              navigate("/search" + (q.trim() ? "?q=" + encodeURIComponent(q.trim()) : ""));
            }}>
              <Search size={17} />
              <input
                aria-label="Tìm kiếm nội dung bản chép lời"
                placeholder="Tìm nội dung bản chép lời…"
                maxLength={300}
                value={q}
                onChange={(event) => setQ(event.target.value)}
              />
              <kbd>↵</kbd>
            </form>
            <Link className="notification-button icon-button" to="/notifications" aria-label="Thông báo">
              <Bell size={20} />
            </Link>
            <span className="header-divider" />
            <Link to="/profile" aria-label="Hồ sơ của tôi"><Avatar name={user.full_name} /></Link>
          </div>
        </header>
        <main id="main-content" className="content" tabIndex={-1}>
          <Suspense fallback={<Loading />}><Outlet /></Suspense>
        </main>
        <footer className="footer">
          <span>Thanh Âm · Không gian làm việc của bạn</span>
          <span>Nội dung được bảo vệ theo quyền truy cập</span>
        </footer>
      </div>
    </div>
  );
}
