import { Link, useSearchParams } from "react-router-dom";
import { Activity, ArrowRight, Clock3, FileAudio, FolderOpen, RefreshCw, ShieldCheck, Users } from "lucide-react";
import type { Audit, Job, List, Media, Project } from "../../../shared/types";
import { bytes, date, time } from "../../../shared/lib/format";
import { useResource } from "../../../shared/hooks/useResource";
import { Avatar, Empty, ErrorBox, FileIcon, Loading, Status } from "../../../shared/ui/components";
import "./overview.css";

type Member = { user_id: string; full_name: string; permission: "EDITOR" | "VIEWER" };

const actions: Record<string, string> = {
  CREATE: "Đã tạo dự án", UPDATE: "Đã cập nhật dự án", START_JOB: "Đã bắt đầu xử lý",
  UPLOAD: "Đã tải tệp lên", ADD_MEMBER: "Đã cập nhật thành viên", REMOVE_MEMBER: "Đã gỡ thành viên",
  RESTORE: "Đã khôi phục dự án", TRANSFER_OWNER: "Đã chuyển người quản lý",
  GENERATE_MINUTES: "Đã tạo biên bản", EDIT_MINUTES: "Đã cập nhật biên bản", EXPORT: "Đã xuất kết quả",
  EDIT_TRANSCRIPT: "Đã lưu bản ghi", RESTORE_TRANSCRIPT: "Đã khôi phục phiên bản bản ghi",
  EDIT_OCR: "Đã cập nhật văn bản OCR", DELETE_MEDIA: "Đã xóa tệp nguồn",
};
export function ProjectOverviewPanel({ project, media }: { project: Project; media: Media[] }) {
  const [params] = useSearchParams();
  const mediaQuery = params.get("media") ? "&media=" + encodeURIComponent(params.get("media")!) : "";
  const members = useResource<List<Member>>(`/projects/${project.project_id}/members`);
  const jobs = useResource<List<Job>>(`/projects/${project.project_id}/jobs`);
  const activity = useResource<List<Audit>>(`/projects/${project.project_id}/activities`);
  const current = media.find(file => file.media_file_id === params.get("media") && file.media_kind_code.startsWith("ORIGINAL_"))
    ?? media.find(file => file.is_current && file.media_kind_code.startsWith("ORIGINAL_"));
  const sourceVersions = media.filter(file => file.media_kind_code.startsWith("ORIGINAL_"));
  const entries = activity.data?.items.filter(item => item.entity_name === "project" && item.entity_id === project.project_id).slice(0, 8) ?? [];
  const refreshing = jobs.loading || members.loading || activity.loading;
  return <div className="project-overview">
    <div className="overview-toolbar"><div><h2>Không gian dự án</h2><p className="muted">Theo dõi nguồn nội dung, thành viên và những cập nhật gần đây.</p></div>
      <button className="button secondary small" disabled={refreshing} onClick={() => { jobs.reload(); members.reload(); activity.reload(); }}><RefreshCw size={15} />Làm mới</button>
    </div>
    <div className="stats-grid overview-stats">
      {[
        { label: "Phiên bản nguồn", value: sourceVersions.length, note: "Một nguồn hiện hành trong dự án", icon: FolderOpen },
        { label: "Thời lượng nguồn", value: current ? time(current.duration_ms ?? 0) : "—", note: "Video hoặc âm thanh hiện hành", icon: Clock3 },
        { label: "Thành viên được thêm", value: members.data?.total ?? project.member_count, note: "Ngoài người quản lý dự án", icon: Users },
      ].map(item => <div className="stat-card" aria-label={item.label} key={item.label}>
        <div><span>{item.label}</span><div className="stat-value">{item.value}</div><small className="muted">{item.note}</small></div>
        <div className="stat-icon teal"><item.icon size={21} /></div>
      </div>)}
    </div>
    <div className="overview-grid">
      <div className="overview-main">
        <section className="card overview-card">
          <div className="section-heading"><h2>Nội dung nguồn</h2><FileAudio size={19} /></div>
          {current ? <>
            <div className="overview-source"><FileIcon kind={current.media_kind_code} /><div><h3>{current.file_name}</h3><p>{bytes(current.file_size_bytes)} · {project.language_code.toUpperCase()} · {date(current.created_at)}</p></div><Status code={project.project_status_code} /></div>
            <Link className="text-link" to={`/projects/${project.project_id}?tab=content${mediaQuery}`}>Xem tệp nguồn<ArrowRight size={15} /></Link>
          </> : <Empty title="Chưa có tệp nguồn" description="Thêm video, âm thanh hoặc hình ảnh để bắt đầu.">
            <Link className="button secondary" to={`/projects/${project.project_id}?tab=content${mediaQuery}`}>{project.can_edit ? "Tải lên tệp nguồn" : "Xem nội dung dự án"}</Link>
          </Empty>}
        </section>
        <section className="card overview-card">
          <div className="section-heading"><div><h2>Dự án đã làm gì?</h2><p className="muted">Hoạt động gần đây trong dự án này.</p></div><Activity size={19} /></div>
          {activity.error ? <ErrorBox error={activity.error} retry={activity.reload} /> : activity.loading ? <Loading />
            : entries.length ? <ol className="overview-timeline">{entries.map(item => <li key={item.audit_log_id}>
              <div className="timeline-dot"><Activity size={14} /></div><div><h3>{actions[item.action_name] ?? item.action_name}</h3><p>{item.full_name || "Hệ thống"}</p><small>{date(item.occurred_at)}</small></div>
            </li>)}</ol> : <Empty title="Chưa có hoạt động gần đây" description="Lịch sử cập nhật dự án sẽ xuất hiện tại đây." />}
        </section>
        <section className="card overview-card">
          <div className="section-heading"><h2>Xử lý gần đây</h2><Link className="text-link" to={`/projects/${project.project_id}?tab=jobs${mediaQuery}`}>Xem lịch sử<ArrowRight size={14} /></Link></div>
          {jobs.error ? <ErrorBox error={jobs.error} retry={jobs.reload} /> : jobs.loading ? <Loading />
            : jobs.data?.items.length ? <div className="overview-jobs">{jobs.data.items.slice(0, 3).map(job => <Link to={`/projects/${project.project_id}?tab=jobs${mediaQuery}`} className="overview-job" key={job.job_id}>
              <div><h3>Tác vụ {job.job_id.slice(0, 8)}</h3><small>{date(job.created_at)}</small></div><Status code={job.job_status_code} /><span>{job.progress_percent}%</span>
            </Link>)}</div> : <p className="muted">Dự án chưa chạy tác vụ xử lý.</p>}
        </section>
      </div>
      <aside className="overview-side">
        <section className="card overview-card">
          <div className="section-heading"><h2>Thành viên dự án</h2><Users size={19} /></div>
          <div className="overview-member"><Avatar name={project.owner_name} /><div><strong>{project.owner_name}</strong><small>Người quản lý dự án</small></div><ShieldCheck size={17} /></div>
          {members.error ? <ErrorBox error={members.error} retry={members.reload} /> : members.loading ? <Loading />
            : members.data?.items.slice(0, 4).map(member => <div className="overview-member" key={member.user_id}>
              <Avatar name={member.full_name} /><div><strong>{member.full_name}</strong><small>{member.permission === "EDITOR" ? "Biên tập viên" : "Chỉ xem"}</small></div>
            </div>)}
        </section>
        <section className="card overview-card overview-permission">
          <ShieldCheck size={25} /><h2>Quyền của bạn</h2><p>{project.project_scope === "PERSONAL"
            ? project.can_invite
              ? "Bạn có thể quản lý nội dung và chia sẻ dự án cá nhân cho tài khoản cùng công ty."
              : project.can_manage
                ? "Bạn quản lý và chỉnh sửa dự án cá nhân. ADMIN quản lý việc chia sẻ thành viên."
                : project.can_edit
                  ? "Bạn được ADMIN cấp quyền chỉnh sửa nội dung trong dự án cá nhân này."
                  : "Bạn được ADMIN cấp quyền xem và tải kết quả của dự án cá nhân này."
            : project.can_manage
            ? "Bạn có thể quản lý dự án, cấp quyền cho thành viên và chỉnh sửa toàn bộ nội dung."
            : project.can_edit ? "Bạn có thể tải nguồn, xử lý và chỉnh sửa nội dung trong dự án này."
              : "Bạn có thể xem nội dung và tải các kết quả đã được chia sẻ."}</p>
        </section>
      </aside>
    </div>
  </div>;
}
