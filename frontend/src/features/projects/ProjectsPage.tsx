import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { canCreateProject } from "./lib/permissions";
import type { List, Project } from "../../shared/types";
import {
  Avatar,
  Empty,
  ErrorBox,
  FileIcon,
  Loading,
  MobileDetails,
  PageTitle,
  Pagination,
  Status,
} from "../../shared/ui/components";
import { date } from "../../shared/lib/format";
import { useAuth } from "../auth/AuthProvider";
import { useResource } from "../../shared/hooks/useResource";
import type { Company } from "../../shared/types";
import { PaginatedSelect } from "../../shared/ui/PaginatedSelect";

import "./projects.css";

export function ProjectsPage({ personal = false }: { personal?: boolean }) {
  const { user } = useAuth(),
    [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "",
    scope = personal ? "PERSONAL" : params.get("scope") ?? "",
    companyId = personal ? "" : params.get("company_id") ?? "",
    projectType = params.get("project_type") ?? "",
    status = params.get("status") ?? "",
    deleted = false,
    sort = params.get("sort") === "title" ? "title" : "recent",
    requestedPage = Number(params.get("page") ?? 1),
    page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "page") next.set("page", "1");
    setParams(next);
  }
  function setPage(value: number) { filter("page", String(value)); }
  const { data, error, loading, reload } = useResource<List<Project>>(
    `/projects?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}&deleted=${deleted}&page=${page}&page_size=20${scope ? `&scope=${encodeURIComponent(scope)}` : ""}${personal ? "&owned=true" : ""}${projectType ? `&project_type=${encodeURIComponent(projectType)}` : ""}${companyId ? `&company_id=${encodeURIComponent(companyId)}` : ""}`,
  );
  const projects = [...(data?.items ?? [])].sort((a, b) =>
    sort === "title"
      ? a.project_title.localeCompare(b.project_title, "vi")
      : b.updated_at.localeCompare(a.updated_at),
  );
  return (
    <>
      <PageTitle
        title={deleted ? "Thùng rác dự án" : personal ? "Dự án cá nhân" : "Dự án"}
        subtitle="Quản lý và cộng tác trên tất cả nội dung của bạn."
      />
      {personal ? <div className="toolbar" aria-label="Loại dự án cá nhân">
        {[["", "Tất cả"], ["VIDEO", "Video"], ["IMAGE", "Hình ảnh"], ["LECTURE", "Bài giảng"], ["AUDIO", "Âm thanh"]].map(([value, label]) => <button key={value} className={`button ${projectType === value ? "" : "secondary"}`} aria-pressed={projectType === value} onClick={() => filter("project_type", value)}>{label}</button>)}
      </div> : <div className="toolbar" aria-label="Phạm vi dự án">
        {[["", "Tất cả dự án"], ["PERSONAL", "Dự án cá nhân"], ["TEAM", "Dự án công ty"]].map(([value, label]) => <button key={value} className={`button ${scope === value ? "" : "secondary"}`} aria-pressed={scope === value} onClick={() => filter("scope", value)}>{label}</button>)}
      </div>}
      {!personal && user?.user_role_code === "ADMIN" && <div className="company-filter"><PaginatedSelect<Company> path="/companies" label="Lọc công ty" searchLabel="Tìm công ty để lọc" emptyLabel="Tất cả công ty" value={companyId} onChange={value => filter("company_id", value)} option={company => ({ value: company.company_id, label: company.company_name })} /></div>}
      {scope === "TEAM" && user?.user_role_code !== "ADMIN" && (!user?.company_id || user.company_projects_enabled === false) && <p className="muted">{user?.company_id ? "Bạn đang bị chặn tham gia dự án công ty. Dự án cá nhân vẫn hoạt động." : "Bạn chưa thuộc công ty. Chủ công ty có thể thêm bạn bằng email."}</p>}
      <div className="toolbar">
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label="Tìm kiếm dự án"
            placeholder="Tìm theo tên dự án…"
            value={q}
            onChange={(event) => {
              filter("q", event.target.value);
            }}
          />
        </div>
        <select
          aria-label="Lọc trạng thái"
          value={status}
          onChange={(event) => {
            filter("status", event.target.value);
          }}
        >
          <option value="">Tất cả trạng thái</option>
          {["DRAFT", "PROCESSING", "READY", "FAILED"].map((code) => (
            <option value={code} key={code}>
              {
                {
                  DRAFT: "Bản nháp",
                  PROCESSING: "Đang xử lý",
                  READY: "Hoàn thành",
                  FAILED: "Thất bại",
                }[code]
              }
            </option>
          ))}
        </select>
        <select
          aria-label="Sắp xếp"
          value={sort}
          onChange={(event) => filter("sort", event.target.value)}
        >
          <option value="recent">Cập nhật gần nhất</option>
          <option value="title">Tên A–Z (trang này)</option>
        </select>
      </div>
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading ? (
        <Loading />
      ) : projects.length ? (
        <div className="card table-wrap">
          <table className="responsive-table">
            <thead>
              <tr>
                <th>Dự án</th>
                <th className="desktop-column">Công ty</th>
                <th className="desktop-column">Trạng thái</th>
                <th className="desktop-column">Người quản lý</th>
                <th className="desktop-column">Cập nhật</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.project_id}>
                  <td>
                    <Link
                      className="table-project"
                      to={"/projects/" + project.project_id}
                    >
                      <FileIcon kind={project.media_kind} />
                      <div>
                        <strong>{project.project_title}</strong>
                        <small>
                          {project.member_count} thành viên ·{" "}
                          {project.language_code.toUpperCase()} · {project.project_scope === "PERSONAL" ? "Cá nhân" : "Công ty"}
                        </small>
                      </div>
                    </Link>
                    <div className="mobile-row-status"><Status code={project.project_status_code} /></div>
                    <MobileDetails>
                      <dt>Công ty</dt><dd>{project.company_name ?? (project.company_id ? project.company_id : "—")}</dd>
                      <dt>Người quản lý</dt><dd>{project.owner_name || "Quản lý"}</dd>
                      <dt>Cập nhật</dt><dd>{date(project.updated_at)}</dd>
                    </MobileDetails>
                  </td>
                  <td className="muted desktop-column">{project.company_name ?? (project.company_id ? project.company_id : "—")}</td>
                  <td className="desktop-column">
                    <Status code={project.project_status_code} />
                  </td>
                  <td className="desktop-column">
                    <div className="person">
                      <Avatar name={project.owner_name || "Quản lý"} />
                      {project.owner_name}
                    </div>
                  </td>
                  <td className="muted desktop-column">{date(project.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} total={data?.total ?? 0} onChange={setPage} />
        </div>
      ) : (
        <div className="card">
          <Empty
            title={deleted ? "Thùng rác trống" : "Chưa tìm thấy dự án"}
            description={
              q
                ? "Thử từ khóa hoặc bộ lọc khác."
                : canCreateProject(user?.user_role_code ?? "")
                  ? "Bắt đầu bằng một dự án mới."
                  : "Quản lý cần thêm tài khoản của bạn vào dự án."
            }
          />
          {page > 1 && <Pagination page={page} total={data?.total ?? 0} onChange={setPage} />}
        </div>
      )}
    </>
  );
}
