import { Link, Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { Activity, ArrowUpRight, FileText, FolderClosed, HardDrive, RefreshCw, Users } from "lucide-react";
import { useResource } from "../../shared/hooks/useResource";
import { bytes, date } from "../../shared/lib/format";
import type { Audit, Capabilities } from "../../shared/types";
import { Empty, ErrorBox, Loading, PageTitle, Status, TabList } from "../../shared/ui/components";
import { ProjectsPage } from "../projects/ProjectsPage";
import { FilesPage } from "../files/FilesPage";
import { GlossaryPage } from "../glossary/GlossaryPage";
import { GeneralSettings } from "../settings/components/GeneralSettings";
import { AdminPage } from "./AdminPage";
import { AdminAudit, AdminJobs, AdminUploads } from "./AdminOperations";
import { CompaniesPage } from "../companies/CompaniesPage";
import "./console.css";
import "../settings/settings.css";

interface Overview {
  stats: Record<string, number>;
  job_statuses: { job_status_code: string; total: number }[];
  daily_jobs: { day: string; total: number; succeeded: number; failed: number }[];
  time_zone: string;
  activities: Audit[];
}
export function AdminConsole() {
  return <div className="admin-console"><Routes>
    <Route index element={<AdminOverview />} />
    <Route path="users" element={<><PageTitle title="Người dùng & phân quyền" subtitle="Quản lý tài khoản và quyền truy cập trong workspace." /><AdminPage embedded /><RoleGuide /></>} />
    <Route path="projects" element={<ProjectsPage />} />
    <Route path="companies" element={<CompaniesPage />} />
    <Route path="files" element={<AdminFiles />} />
    <Route path="jobs" element={<AdminJobs />} />
    <Route path="glossaries" element={<GlossaryPage />} />
    <Route path="organization" element={<><PageTitle title="Tổ chức" subtitle="Thông tin workspace đang quản trị." /><GeneralSettings /></>} />
    <Route path="audit-logs" element={<AdminAudit />} />
    <Route path="system" element={<AdminSystem />} />
    <Route path="*" element={<Navigate to="/admin" replace />} />
  </Routes></div>;
}
function AdminOverview() {
  const resource = useResource<Overview>("/admin/overview");
  const org = useResource<{ organization_name: string }>("/organizations/current");
  const data = resource.data;
  return <>
    <PageTitle title="Quản trị hệ thống" subtitle="Tổng quan hoạt động và dữ liệu của workspace.">
      <button className="button secondary" onClick={resource.reload} disabled={resource.loading}><RefreshCw size={16} />Làm mới</button>
    </PageTitle>
    <div className="console-banner"><div><span className="eyebrow">BẢNG ĐIỀU KHIỂN QUẢN TRỊ</span><h2>{org.data?.organization_name ?? "Workspace hiện tại"}</h2><p>Dữ liệu thực tế của mọi công ty và dự án trong workspace.</p></div><Link to="/" className="button secondary">Mở workspace<ArrowUpRight size={16} /></Link></div>
    {org.error && <ErrorBox error={org.error} retry={org.reload} />}
    {resource.error ? <ErrorBox error={resource.error} retry={resource.reload} /> : !data ? <Loading /> : <>
      <div className="stats-grid console-stats">
        {[
          { label: "Người dùng", value: data.stats.users, note: `${data.stats.active_users} tài khoản hoạt động`, icon: Users, to: "/admin/users" },
          { label: "Dự án", value: data.stats.projects, note: "Cá nhân và tổ chức đang lưu", icon: FolderClosed, to: "/admin/projects" },
          { label: "Tệp nguồn & kết quả", value: data.stats.files + data.stats.exports, note: `${data.stats.exports} tệp kết quả`, icon: FileText, to: "/admin/files" },
          { label: "Dung lượng dữ liệu", value: bytes(data.stats.storage_bytes + data.stats.export_bytes), note: "Tệp thuộc dự án đang lưu", icon: HardDrive, to: "/admin/files" },
        ].map(item => <Link key={item.label} to={item.to} className="stat-card"><div><span>{item.label}</span><div className="stat-value">{item.value}</div><small className="muted">{item.note}</small></div><div className="stat-icon teal"><item.icon size={22} /></div></Link>)}
      </div>
      <div className="console-overview-grid">
        <section className="card console-panel"><div className="section-heading"><div><h2>Hoạt động xử lý</h2><p className="muted">7 ngày gần nhất · {data.time_zone}</p></div><Activity size={20} /></div>
          <div className="console-chart" role="img" aria-label="Tác vụ trong 7 ngày">
            {data.daily_jobs.map(day => <div className="console-chart-day" key={day.day}>
              <strong>{day.total}</strong><div className="console-chart-track"><span style={{ height: `${Math.max(2, day.total / Math.max(1, ...data.daily_jobs.map(d => d.total)) * 100)}%` }} /></div><small>{day.day.slice(8)}/{day.day.slice(5, 7)}</small>
            </div>)}
          </div>
          <details><summary>Xem số liệu theo ngày</summary><div className="table-wrap"><table><thead><tr><th>Ngày (UTC)</th><th>Tổng tác vụ</th><th>Hoàn thành</th><th>Thất bại</th></tr></thead><tbody>{data.daily_jobs.map(day => <tr key={day.day}><td>{day.day}</td><td>{day.total}</td><td>{day.succeeded}</td><td>{day.failed}</td></tr>)}</tbody></table></div></details>
        </section>
        <section className="card console-panel"><div className="section-heading"><h2>Tác vụ AI</h2><Link className="text-link" to="/admin/jobs">Xem tất cả</Link></div>
          {["RUNNING", "QUEUED", "SUCCEEDED", "FAILED", "CANCELED"].map(status => <Link className="console-status-row" key={status} to={`/admin/jobs?status=${status}`}><Status code={status} /><strong>{data.job_statuses.find(s => s.job_status_code === status)?.total ?? 0}</strong></Link>)}
          <Link className="button secondary console-system-link" to="/admin/system">Kiểm tra dịch vụ</Link>
        </section>
        <section className="card console-panel console-activity"><div className="section-heading"><h2>Hoạt động gần đây</h2><Link className="text-link" to="/admin/audit-logs">Toàn bộ nhật ký</Link></div>
          {data.activities.length ? <div className="table-wrap"><table><thead><tr><th>Người thực hiện</th><th>Thao tác</th><th>Tài nguyên</th><th>Thời gian</th></tr></thead><tbody>{data.activities.map(log => <tr key={log.audit_log_id}><td>{log.full_name ?? "Hệ thống"}</td><td>{log.action_name}</td><td>{log.entity_name}</td><td className="muted">{date(log.occurred_at)}</td></tr>)}</tbody></table></div> : <Empty title="Chưa có hoạt động" />}
        </section>
      </div>
    </>}
  </>;
}
function AdminFiles() {
  const [params, setParams] = useSearchParams();
  const uploads = params.get("tab") === "uploads";
  return <><TabList label="Quản trị kho tệp">
    <button role="tab" aria-selected={!uploads} aria-controls="console-files" tabIndex={uploads ? -1 : 0} onClick={() => setParams({})} className={!uploads ? "active" : ""}>Tệp đã lưu</button>
    <button role="tab" aria-selected={uploads} aria-controls="console-files" tabIndex={uploads ? 0 : -1} onClick={() => setParams({ tab: "uploads" })} className={uploads ? "active" : ""}>Phiên tải lên</button>
  </TabList><div id="console-files" role="tabpanel" aria-label={uploads ? "Phiên tải lên" : "Tệp đã lưu"}>{uploads ? <AdminUploads /> : <FilesPage />}</div></>;
}
function RoleGuide() {
  return <section className="card console-panel console-role-guide"><h2>Phạm vi quyền hạn</h2><div className="table-wrap"><table><thead><tr><th>Vai trò</th><th>Phạm vi quyền</th></tr></thead><tbody>
    <tr><td><Status code="ADMIN" /></td><td>Quản trị tài khoản, mọi công ty, dự án, tổ chức và tác vụ trong workspace.</td></tr>
    <tr><td><Status code="COMPANY_OWNER" /></td><td>Tạo công ty, quản lý thành viên và mọi dự án của công ty mình; chặn hoặc gỡ quyền tham gia công ty.</td></tr>
    <tr><td><Status code="MEMBER" /></td><td>Tạo dự án cá nhân; biên tập dự án được cấp quyền chỉnh sửa.</td></tr>
    <tr><td><Status code="VIEWER" /></td><td>Xem dự án được chia sẻ và tải kết quả; không chỉnh sửa nội dung.</td></tr>
  </tbody></table></div><p className="muted">Chỉ ADMIN được chia sẻ dự án cá nhân. Thay đổi vai trò hoặc khóa tài khoản sẽ thu hồi phiên đăng nhập.</p></section>;
}
interface SystemData { services: Record<string, { status: string; detail?: string; responding_workers?: number; free_bytes?: number; total_bytes?: number }>; capabilities: Capabilities }
function AdminSystem() {
  const resource = useResource<SystemData>("/admin/system");
  const names: Record<string, string> = { api: "API", database: "Cơ sở dữ liệu", redis: "Hàng đợi Redis", worker: "Worker xử lý", storage: "Kho tệp" };
  return <><PageTitle title="Hệ thống" subtitle="Kiểm tra kết nối và khả năng xử lý trên máy chủ hiện tại."><button className="button secondary" onClick={resource.reload} disabled={resource.loading}><RefreshCw size={16} />Kiểm tra lại</button></PageTitle>
    {resource.error ? <ErrorBox error={resource.error} retry={resource.reload} /> : resource.loading ? <Loading /> : resource.data && <>
      <div className="console-service-grid">{Object.entries(resource.data.services).map(([key, service]) => <section key={key} className="card console-panel"><div className="section-heading"><h2>{names[key] ?? key}</h2><span className={`console-health ${service.status}`}>{service.status === "ok" ? "Hoạt động" : service.status === "error" ? "Có sự cố" : "Chưa xác định"}</span></div>{service.detail && <p>{service.detail}</p>}{service.responding_workers !== undefined && <p>{service.responding_workers} worker phản hồi</p>}{service.free_bytes !== undefined && <p>Còn trống {bytes(service.free_bytes)} / {bytes(service.total_bytes ?? 0)} trên ổ lưu trữ.</p>}</section>)}</div>
      <section className="card console-panel console-capabilities"><h2>Khả năng xử lý</h2><p className="muted">Trạng thái cấu hình tại máy chủ; kết nối Colab được xác định khi chạy tác vụ.</p><dl>
        <div><dt>Nhận dạng giọng nói</dt><dd>{resource.data.capabilities.asr ? "Sẵn sàng" : "Chưa sẵn sàng"} · {resource.data.capabilities.asr_provider} · {resource.data.capabilities.asr_model}</dd></div>
        <div><dt>Xử lý văn bản</dt><dd>{resource.data.capabilities.text_provider}</dd></div>
        <div><dt>Nhận dạng hình ảnh</dt><dd>{resource.data.capabilities.ocr ? "Sẵn sàng" : "Chưa sẵn sàng"}</dd></div>
        <div><dt>Phân biệt người nói</dt><dd>{resource.data.capabilities.diarization ? "Sẵn sàng" : "Chưa sẵn sàng"}</dd></div>
        <div><dt>Giới hạn mỗi tệp tải lên</dt><dd>{bytes(resource.data.capabilities.max_upload_bytes)}</dd></div>
      </dl></section>
    </>}
  </>;
}
