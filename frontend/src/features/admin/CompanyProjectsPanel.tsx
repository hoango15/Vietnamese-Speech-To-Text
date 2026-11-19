import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Users } from "lucide-react";
import type { List, Project } from "../../shared/types";
import { useResource } from "../../shared/hooks/useResource";
import { date } from "../../shared/lib/format";
import { Empty, ErrorBox, Loading, Pagination, Status, statusNames } from "../../shared/ui/components";

export function CompanyProjectsPanel({ owned, companyId }: { owned: boolean; companyId?: string }) {
  const [q, setQ] = useState(""), [status, setStatus] = useState(""), [page, setPage] = useState(1);
  const projects = useResource<List<Project>>(`/projects?q=${encodeURIComponent(q)}&status=${status}&page=${page}&page_size=20${companyId ? `&scope=TEAM&company_id=${encodeURIComponent(companyId)}` : owned ? "&owned=true&scope=TEAM" : ""}`);
  return <section>
    <div className="section-heading"><div><h2>{owned ? "Dự án nhóm của bạn" : "Dự án trong công ty"}</h2>
      <p>{owned ? "Thêm thành viên, cấp quyền chỉnh sửa hoặc gỡ quyền truy cập trong từng dự án bạn sở hữu." : "Theo dõi dự án và quản lý thành viên trong công ty."}</p></div></div>
    <div className="toolbar">
      <div className="search-field"><Search size={18} /><input aria-label="Tìm dự án quản lý" placeholder="Tìm tên hoặc mô tả dự án…" maxLength={200}
        value={q} onChange={event => { setQ(event.target.value); setPage(1); }} /></div>
      <select aria-label="Lọc trạng thái dự án" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
        <option value="">Tất cả trạng thái</option>
        {["DRAFT", "PROCESSING", "READY", "FAILED"].map(code => <option key={code} value={code}>{statusNames[code]}</option>)}
      </select>
    </div>
    {projects.error ? <ErrorBox error={projects.error} retry={projects.reload} /> : projects.loading ? <Loading /> : projects.data?.items.length ?
      <div className="card table-wrap"><table><thead><tr><th>Dự án</th><th>Người quản lý</th><th>Trạng thái</th><th>Thành viên</th><th>Cập nhật</th><th>Thao tác</th></tr></thead>
        <tbody>{projects.data.items.map(project => <tr key={project.project_id}>
          <td><Link className="text-link" to={`/projects/${project.project_id}`}>{project.project_title}</Link><small className="cell-small">{project.project_scope === "PERSONAL" ? "Cá nhân" : "Dự án nhóm"}</small></td>
          <td>{project.owner_name}</td><td><Status code={project.project_status_code} /></td><td>{project.member_count}</td><td>{date(project.updated_at)}</td>
          <td><Link className="button secondary small" to={`/projects/${project.project_id}?tab=members`}>
            <Users size={16} />Quản lý thành viên</Link></td>
        </tr>)}</tbody></table><Pagination page={page} total={projects.data.total} onChange={setPage} /></div>
      : <Empty title="Chưa tìm thấy dự án" description={q || status ? "Thử từ khóa hoặc trạng thái khác." : "Tạo dự án nhóm từ nút Dự án mới để bắt đầu cộng tác."}>
        {page > 1 && <Pagination page={page} total={projects.data?.total ?? 0} onChange={setPage} />}
      </Empty>}
  </section>;
}
