import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, FolderClosed, HardDrive, Plus, Search, Users } from "lucide-react";
import { api } from "../../shared/api/client";
import type { Audit, Company, List, User } from "../../shared/types";
import {
  Avatar,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  PageTitle,
  Pagination,
  statusNames,
  TabList,
} from "../../shared/ui/components";
import { bytes, date } from "../../shared/lib/format";
import { useAction } from "../../shared/hooks/useAction";
import { useResource } from "../../shared/hooks/useResource";
import { useAuth } from "../auth/AuthProvider";
import { CompanyProjectsPanel } from "./CompanyProjectsPanel";
import "./admin.css";

export function AdminPage({ embedded = false }: { embedded?: boolean }) {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.user_role_code === "ADMIN";
  const roles = isAdmin ? ["MEMBER", "COMPANY_OWNER", "VIEWER", "ADMIN"] : ["MEMBER", "VIEWER"];
  const [tab, setTab] = useState("users"),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [roleFilter, setRoleFilter] = useState(""),
    [activeFilter, setActiveFilter] = useState(""),
    [companyFilter, setCompanyFilter] = useState(""),
    [create, setCreate] = useState(false),
    action = useAction();
  const stats = useResource<Record<string, number>>(embedded ? null : isAdmin ? "/system/stats" : "/management/stats"),
    organization = useResource<{ organization_name: string }>("/organizations/current"),
    users = useResource<List<User>>(
      tab === "users" ? `/users?q=${encodeURIComponent(q)}&page=${page}${roleFilter ? `&role=${roleFilter}` : ""}${activeFilter ? `&active=${activeFilter}` : ""}${companyFilter ? `&company_id=${companyFilter}` : ""}` : null,
    ),
    companies = useResource<List<Company>>(isAdmin ? "/companies?page_size=100" : null),
    audit = useResource<List<Audit>>(
      isAdmin && tab === "audit"
        ? `/audit-logs?page=${page}&q=${encodeURIComponent(q)}`
        : null,
    );
  return (
    <>
      {embedded ? (
        <div className="section-heading">
          <div><h2>Thành viên trong workspace</h2><p className="muted">Quản lý tài khoản và quyền truy cập trong workspace.</p></div>
          <button className="button" onClick={() => setCreate(true)}><Plus size={17} />Tạo tài khoản</button>
        </div>
      ) : <PageTitle
        title={isAdmin ? "Quản trị hệ thống" : "Quản trị công ty"}
        subtitle="Quản lý tài khoản workspace và thành viên trong các dự án."
      >
        {tab === "users" && (
          <button className="button" onClick={() => setCreate(true)}>
            <Plus size={17} />
            Tạo tài khoản
          </button>
        )}
      </PageTitle>}
      {!embedded && <>
      <div className="admin-company-scope">
        <div><span className="eyebrow">KHÔNG GIAN QUẢN TRỊ</span><strong>{organization.data?.organization_name ?? "Công ty hiện tại"}</strong></div>
        <p>{isAdmin ? "Quản trị tài khoản và dữ liệu của mọi công ty trong workspace." : "Bạn quản lý tài khoản thành viên, người xem và các dự án nhóm mình sở hữu."}</p>
      </div>
      {organization.error && <ErrorBox error={organization.error} retry={organization.reload} />}
      {stats.error && <ErrorBox error={stats.error} retry={stats.reload} />}
      <div className="stats-grid admin-stats">
        {[
          { name: isAdmin ? "Người dùng" : "Tài khoản được quản lý", key: "users", icon: Users },
          { name: "Đang hoạt động", key: "active_users", icon: CheckCircle2 },
          { name: isAdmin ? "Dự án" : "Dự án nhóm sở hữu", key: "projects", icon: FolderClosed },
          { name: "Dung lượng", key: "storage_bytes", icon: HardDrive },
        ].map((item) => (
          <div className="stat-card" key={item.key}>
            <div>
              <span>{item.name}</span>
              <div className="stat-value">
                {stats.data
                  ? item.key === "storage_bytes"
                    ? bytes(stats.data[item.key])
                    : stats.data[item.key]
                  : "—"}
              </div>
            </div>
            <div className="stat-icon teal">
              <item.icon size={22} />
            </div>
          </div>
        ))}
      </div>
      <TabList label={isAdmin ? "Quản trị workspace" : "Quản trị công ty"}>
        <button
          role="tab" id="admin-tab-users" aria-controls="admin-panel" aria-selected={tab === "users"} tabIndex={tab === "users" ? 0 : -1}
          className={tab === "users" ? "active" : ""}
          onClick={() => {
            setTab("users");
            setPage(1);
          }}
        >
          Người dùng
        </button>
        <button role="tab" id="admin-tab-projects" aria-controls="admin-panel" aria-selected={tab === "projects"} tabIndex={tab === "projects" ? 0 : -1}
          className={tab === "projects" ? "active" : ""} onClick={() => setTab("projects")}>
          Dự án quản lý
        </button>
        {isAdmin && <button
          role="tab" id="admin-tab-audit" aria-controls="admin-panel" aria-selected={tab === "audit"} tabIndex={tab === "audit" ? 0 : -1}
          className={tab === "audit" ? "active" : ""}
          onClick={() => {
            setTab("audit");
            setPage(1);
          }}
        >
          Nhật ký hoạt động
        </button>}
      </TabList>
      {isAdmin && <Link className="text-link admin-projects-link" to="/projects">Dự án toàn workspace</Link>}
      </>}
      <div id="admin-panel" role={embedded ? undefined : "tabpanel"} aria-labelledby={embedded ? undefined : `admin-tab-${tab}`}>
      {tab === "projects" ? <CompanyProjectsPanel owned={!isAdmin} /> : <>
      <div className="toolbar">
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label="Tìm trong quản trị"
            placeholder={
              tab === "users" ? "Tìm tên hoặc email…" : "Tìm hoạt động…"
            }
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>
      {tab === "users" && <div className="admin-user-filters">
        {isAdmin && <label>Công ty<select aria-label="Lọc công ty" value={companyFilter} onChange={event => { setCompanyFilter(event.target.value); setPage(1); }}><option value="">Tất cả công ty</option>{companies.data?.items.map(company => <option key={company.company_id} value={company.company_id}>{company.company_name}</option>)}</select></label>}
        <span className="muted">{users.data ? `${users.data.total} tài khoản` : "Tài khoản workspace"}</span>
        <label>Vai trò<select aria-label="Lọc vai trò" value={roleFilter} onChange={event => { setRoleFilter(event.target.value); setPage(1); }}>
          <option value="">Tất cả vai trò</option>
          {roles.map(role => <option key={role} value={role}>{statusNames[role]}</option>)}
        </select></label>
        <label>Trạng thái<select aria-label="Lọc trạng thái tài khoản" value={activeFilter} onChange={event => { setActiveFilter(event.target.value); setPage(1); }}>
          <option value="">Tất cả trạng thái</option><option value="true">Hoạt động</option><option value="false">Đã khóa</option>
        </select></label>
      </div>}
      {tab === "users" ? (
        users.error ? (
          <ErrorBox error={users.error} retry={users.reload} />
        ) : users.loading ? (
          <Loading />
        ) : users.data?.items.length ? (
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th>Công ty</th>
                  <th>Ngày tham gia</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.data.items.map((user) => (
                  <tr key={user.user_id}>
                    <td>
                      <div className="table-project">
                        <Avatar name={user.full_name} />
                        <div>
                          <strong>{user.full_name}</strong>
                          <small>{user.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        aria-label={"Vai trò " + user.full_name}
                        value={user.user_role_code}
                        disabled={action.busy}
                        onChange={(event) => {
                          const role = event.target.value;
                          if (confirm(`Đổi vai trò của ${user.full_name}?`))
                            action.run(async () => {
                              await api.request(`/users/${user.user_id}/role`, {
                                method: "PATCH",
                                body: { role },
                              });
                              users.reload();
                              stats.reload();
                            }, "Đã cập nhật vai trò.");
                        }}
                      >
                        {roles.map(
                          (role) => (
                            <option key={role} value={role}>{statusNames[role]}</option>
                          ),
                        )}
                      </select>
                    </td>
                    <td>
                      <span
                        className={
                          "status " +
                          (user.is_active ? "status-ready" : "status-failed")
                        }
                      >
                        <i />
                        {user.is_active ? "Hoạt động" : "Đã khóa"}
                      </span>
                    </td>
                    <td className="muted">{user.company_name ?? user.company_id ?? "Chưa thuộc công ty"}</td>
                    <td>{date(user.created_at)}</td>
                    <td>
                      <button
                        className={
                          "button small " +
                          (user.is_active ? "danger-button" : "secondary")
                        }
                        disabled={action.busy}
                        onClick={() => {
                          if (
                            confirm(
                              `${user.is_active ? "Khóa" : "Mở khóa"} tài khoản ${user.email}?`,
                            )
                          )
                            action.run(async () => {
                              await api.request(
                                `/users/${user.user_id}/status`,
                                {
                                  method: "PATCH",
                                  body: { is_active: !user.is_active },
                                },
                              );
                              users.reload();
                              stats.reload();
                            }, "Đã cập nhật trạng thái.");
                        }}
                      >
                        {user.is_active ? "Khóa" : "Mở khóa"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={page}
              total={users.data.total}
              onChange={setPage}
            />
          </div>
        ) : (
          <Empty title="Chưa tìm thấy người dùng">
            {page > 1 && <Pagination page={page} total={users.data?.total ?? 0} onChange={setPage} />}
          </Empty>
        )
      ) : audit.error ? (
        <ErrorBox error={audit.error} retry={audit.reload} />
      ) : audit.loading ? (
        <Loading />
      ) : audit.data?.items.length ? (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Người thực hiện</th>
                <th>Hành động</th>
                <th>Đối tượng</th>
                <th>Thời gian</th>
                <th>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {audit.data.items.map((item) => (
                <tr key={item.audit_log_id}>
                  <td>{item.full_name || "Hệ thống"}</td>
                  <td>{item.action_name}</td>
                  <td>
                    {item.entity_name}
                    <small className="cell-small">{item.entity_id}</small>
                  </td>
                  <td>{date(item.occurred_at)}</td>
                  <td>
                    {Boolean(item.change_detail) && (
                      <details>
                        <summary>Xem chi tiết</summary>
                        <pre>
                          {typeof item.change_detail === "string"
                            ? item.change_detail
                            : JSON.stringify(item.change_detail, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} total={audit.data.total} onChange={setPage} />
        </div>
      ) : (
        <Empty title="Chưa có nhật ký">
          {page > 1 && <Pagination page={page} total={audit.data?.total ?? 0} onChange={setPage} />}
        </Empty>
      )}
      </>}
      </div>
      {create && (
        <Modal title="Tạo tài khoản" onClose={() => setCreate(false)}>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              action.run(async () => {
                await api.request("/users", {
                  method: "POST",
                  body: {
                    email: form.get("email"),
                    full_name: form.get("full_name"),
                    password: form.get("password"),
                    role: form.get("role"),
                  },
                });
                setCreate(false);
                users.reload();
                stats.reload();
              }, "Đã tạo tài khoản.");
            }}
          >
            <label>
              Họ và tên
              <input name="full_name" required maxLength={200} />
            </label>
            <label>
              Email
              <input type="email" name="email" required />
            </label>
            <label>
              Mật khẩu ban đầu
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={10}
                pattern="(?=.*[A-Za-z])(?=.*[0-9]).{10,128}"
                title="Mật khẩu dài 10–128 ký tự, gồm ít nhất một chữ A–Z và một chữ số."
                placeholder="10–128 ký tự, có chữ và số"
                maxLength={128}
                required
              />
            </label>
            <label>
              Vai trò
              <select name="role">
                {roles.map((role) => (
                  <option key={role} value={role}>{statusNames[role]}</option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setCreate(false)}
              >
                Hủy
              </button>
              <button className="button" disabled={action.busy}>
                Tạo tài khoản
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// M�n h�nh qu?n tr? ngu?i d�ng v� c?u h�nh h? th?ng
