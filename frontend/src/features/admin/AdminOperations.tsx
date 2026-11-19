import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { RefreshCw, Search } from "lucide-react";
import type { Audit, Job, List } from "../../shared/types";
import { useResource } from "../../shared/hooks/useResource";
import { bytes, date } from "../../shared/lib/format";
import { Empty, ErrorBox, Loading, Modal, PageTitle, Pagination, Status } from "../../shared/ui/components";
import { JobCard } from "../projects/jobs/JobCard";

function useConsoleList<T>(path: string) {
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const query = new URLSearchParams(params); query.set("page", String(page));
  const resource = useResource<List<T>>(path + "?" + query);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.set("page", key === "page" ? value : "1"); setParams(next);
  };
  return { ...resource, params, page, update };
}
function SearchField({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return <div className="search-field"><Search size={18} /><input aria-label={label} placeholder={label + "…"} value={value} maxLength={200} onChange={event => onChange(event.target.value)} /></div>;
}
type AdminJob = Job & { project_title: string; job_kind: string };
export function AdminJobs() {
  const list = useConsoleList<AdminJob>("/admin/jobs");
  const [selected, setSelected] = useState<AdminJob | null>(null);
  useEffect(() => {
    if (list.loading) return;
    const timer = setTimeout(list.reload, 5000);
    return () => clearTimeout(timer);
  }, [list.loading, list.reload, list.data]);
  return <><PageTitle title="Tác vụ AI" subtitle="Theo dõi hàng đợi, tiến độ và lỗi xử lý trong workspace."><button className="button secondary" disabled={list.loading} onClick={list.reload}><RefreshCw size={16} />Làm mới</button></PageTitle>
    <div className="toolbar"><SearchField label="Tìm dự án hoặc mã tác vụ" value={list.params.get("q") ?? ""} onChange={value => list.update("q", value)} />
      <select aria-label="Trạng thái tác vụ" value={list.params.get("status") ?? ""} onChange={event => list.update("status", event.target.value)}><option value="">Tất cả trạng thái</option>{[["QUEUED", "Chờ xử lý"], ["RUNNING", "Đang chạy"], ["SUCCEEDED", "Hoàn thành"], ["FAILED", "Thất bại"], ["CANCELED", "Đã hủy"]].map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select>
      <select aria-label="Loại tác vụ" value={list.params.get("kind") ?? ""} onChange={event => list.update("kind", event.target.value)}><option value="">Tất cả loại</option><option value="TRANSCRIBE">Nhận dạng giọng nói</option><option value="OCR">Nhận dạng hình ảnh</option><option value="BURN_IN">Gắn phụ đề</option></select>
    </div><p className="muted">Tự cập nhật mỗi 5 giây. Mở chi tiết để xem tiến độ mỗi 2 giây và thời gian xử lý.</p>
    {list.error ? <ErrorBox error={list.error} retry={list.reload} /> : !list.data ? <Loading /> : <div className="card table-wrap">
      <table><thead><tr><th>Dự án / tác vụ</th><th>Loại</th><th>Trạng thái</th><th>Tiến độ</th><th>Tạo lúc</th><th>Thao tác</th></tr></thead><tbody>{list.data.items.map(job => <tr key={job.job_id}>
        <td><Link className="text-link" to={`/projects/${job.project_id}?tab=content`}>{job.project_title}</Link><small className="console-id">{job.job_id}</small></td><td>{job.job_kind}</td><td><Status code={job.job_status_code} /></td><td><strong>{job.progress_percent}%</strong><div className="progress"><span style={{ width: job.progress_percent + "%" }} /></div></td><td className="muted">{date(job.created_at)}</td><td><button className="button secondary small" onClick={() => setSelected(job)}>Chi tiết</button></td>
      </tr>)}</tbody></table>{!list.data.items.length && <Empty title="Không có tác vụ phù hợp" />}<Pagination page={list.page} total={list.data.total} onChange={page => list.update("page", String(page))} />
    </div>}
    {selected && <JobDetails job={selected} onClose={() => setSelected(null)} refresh={list.reload} />}
  </>;
}
function JobDetails({ job, onClose, refresh }: { job: AdminJob; onClose: () => void; refresh: () => void }) {
  const detail = useResource<Job>("/jobs/" + job.job_id);
  const logs = useResource<List<{ job_event_id: number; event_type: string; event_payload: unknown; occurred_at: string }>>(`/jobs/${job.job_id}/logs`);
  const changed = () => { detail.reload(); logs.reload(); refresh(); };
  return <Modal title="Chi tiết tác vụ" onClose={onClose}><p><strong>{job.project_title}</strong></p><small className="console-id">{job.job_id}</small>
    {detail.error && <ErrorBox error={detail.error} retry={detail.reload} />}
    <JobCard job={detail.data ?? job} canEdit onChange={changed} onComplete={detail.reload} />
    <div className="section-heading"><h3>Nhật ký tác vụ</h3><button className="button secondary small" onClick={logs.reload}>Tải nhật ký</button></div>
    {logs.error ? <ErrorBox error={logs.error} retry={logs.reload} /> : !logs.data ? <Loading /> : logs.data.items.length ? <ol className="console-job-logs">{logs.data.items.map(log => <li key={log.job_event_id}><strong>{log.event_type}</strong><small>{date(log.occurred_at)}</small><pre>{JSON.stringify(log.event_payload, null, 2)}</pre></li>)}</ol> : <Empty title="Chưa có sự kiện" />}
  </Modal>;
}
interface UploadRecord { upload_id: string; project_id: string; project_title: string; full_name: string; file_name: string; upload_status_code: string; expected_size_bytes: number; uploaded_size_bytes: number; created_at: string; expires_at: string }
export function AdminUploads() {
  const list = useConsoleList<UploadRecord>("/admin/uploads");
  return <><PageTitle title="Phiên tải lên" subtitle="Theo dõi các phiên tải tệp của thành viên trong workspace."><button className="button secondary" disabled={list.loading} onClick={list.reload}><RefreshCw size={16} />Làm mới</button></PageTitle>
    <div className="toolbar"><SearchField label="Tìm tên tệp hoặc dự án" value={list.params.get("q") ?? ""} onChange={value => list.update("q", value)} /><select aria-label="Trạng thái tải lên" value={list.params.get("status") ?? ""} onChange={event => list.update("status", event.target.value)}><option value="">Tất cả trạng thái</option>{[["INITIATED", "Khởi tạo"], ["UPLOADING", "Đang tải"], ["COMPLETED", "Hoàn tất"], ["CANCELED", "Đã hủy"], ["EXPIRED", "Hết hạn"], ["FAILED", "Thất bại"]].map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></div>
    {list.error ? <ErrorBox error={list.error} retry={list.reload} /> : !list.data ? <Loading /> : <div className="card table-wrap"><table><thead><tr><th>Tệp / dự án</th><th>Người tải</th><th>Trạng thái</th><th>Đã tải lên</th><th>Khởi tạo</th></tr></thead><tbody>{list.data.items.map(upload => {
      const percent = upload.expected_size_bytes > 0 ? Math.min(100, Math.floor(upload.uploaded_size_bytes / upload.expected_size_bytes * 100)) : 0;
      return <tr key={upload.upload_id}><td><strong>{upload.file_name}</strong><Link className="console-id text-link" to={`/projects/${upload.project_id}`}>{upload.project_title}</Link></td><td>{upload.full_name}</td><td><Status code={upload.upload_status_code} /></td><td>{bytes(upload.uploaded_size_bytes)} / {bytes(upload.expected_size_bytes)} · {percent}%<div className="progress" role="progressbar" aria-label={`Tải ${upload.file_name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: percent + "%" }} /></div></td><td className="muted">{date(upload.created_at)}</td></tr>;
    })}</tbody></table>{!list.data.items.length && <Empty title="Không có phiên tải phù hợp" />}<Pagination page={list.page} total={list.data.total} onChange={page => list.update("page", String(page))} /></div>}
  </>;
}
export function AdminAudit() {
  const list = useConsoleList<Audit>("/admin/audit");
  return <><PageTitle title="Nhật ký hoạt động" subtitle="Tra cứu người thực hiện và thay đổi trong workspace."><button className="button secondary" disabled={list.loading} onClick={list.reload}><RefreshCw size={16} />Làm mới</button></PageTitle>
    <div className="toolbar"><SearchField label="Tìm người, thao tác hoặc mã tài nguyên" value={list.params.get("q") ?? ""} onChange={value => list.update("q", value)} />
      <select aria-label="Tài nguyên nhật ký" value={list.params.get("entity") ?? ""} onChange={event => list.update("entity", event.target.value)}><option value="">Mọi tài nguyên</option>{["project", "user", "organization", "transcript", "glossary", "export", "media", "minutes", "ocr"].map(name => <option key={name} value={name}>{name}</option>)}</select>
      <SearchField label="Lọc mã thao tác" value={list.params.get("action") ?? ""} onChange={value => list.update("action", value)} />
    </div>
    {list.error ? <ErrorBox error={list.error} retry={list.reload} /> : !list.data ? <Loading /> : <div className="card table-wrap"><table><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Thao tác</th><th>Tài nguyên</th><th>Chi tiết</th></tr></thead><tbody>{list.data.items.map(log => <tr key={log.audit_log_id}><td className="muted">{date(log.occurred_at)}</td><td>{log.full_name ?? "Hệ thống"}</td><td><span className="console-action">{log.action_name}</span></td><td>{log.entity_name}<small className="console-id">{log.entity_id}</small></td><td><details><summary>Xem thay đổi</summary><pre className="console-audit-detail">{JSON.stringify(log.change_detail ?? {}, null, 2)}</pre></details></td></tr>)}</tbody></table>{!list.data.items.length && <Empty title="Không có nhật ký phù hợp" />}<Pagination page={list.page} total={list.data.total} onChange={page => list.update("page", String(page))} /></div>}
  </>;
}
