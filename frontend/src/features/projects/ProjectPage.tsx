import { useEffect, useState } from "react";
import { Link, useBlocker, useParams } from "react-router-dom";
import { ArrowLeft, Clock3, Users } from "lucide-react";
import type { List, Media, Project } from "../../shared/types";
import { date } from "../../shared/lib/format";
import { Empty, ErrorBox, Loading, PageTitle, Status } from "../../shared/ui/components";
import { useResource } from "../../shared/hooks/useResource";
import { MediaPanel } from "./media/MediaPanel";
import { UploadPanel } from "./media/UploadPanel";
import "./media/media.css";

export default function ProjectPage() {
  const { id } = useParams();
  const [sourceBusy, setSourceBusy] = useState(false);
  const [recordingDirty, setRecordingDirty] = useState(false);
  const blocker = useBlocker(recordingDirty);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (confirm("Bỏ bản thu và chữ chưa lưu để rời trang? Hãy tải xuống trước nếu cần giữ lại.")) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!recordingDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recordingDirty]);
  const project = useResource<Project>("/projects/" + id);
  const media = useResource<List<Media>>(project.data && !project.data.deleted_at ? `/projects/${id}/media` : null);
  if (project.loading && !project.data) return <Loading />;
  if (project.error) return <ErrorBox error={project.error} retry={project.reload} />;
  const p = project.data;
  if (!p) return null;
  return <>
    <Link className="back-link" to="/projects"><ArrowLeft size={16} />Tất cả dự án</Link>
    <PageTitle title={p.project_title} subtitle={p.deleted_at ? "Dự án đã nằm trong thùng rác." : p.project_description || "Quản lý tệp nguồn của dự án."}>
      <Status code={p.project_status_code} />
    </PageTitle>
    {p.deleted_at ? <div className="card"><Empty title="Dự án đã bị xóa" description="Khôi phục trong thùng rác để tiếp tục làm việc." /></div> : <>
      <div className="project-meta">
        <span><Users size={15} />{p.member_count} thành viên</span>
        <span><Clock3 size={15} />Cập nhật {date(p.updated_at)}</span>
        <span>Người quản lý: {p.owner_name}</span>
      </div>
      <div className="project-media-layout">
        <MediaPanel key={p.project_id} project={p} media={media.data?.items ?? []} loading={media.loading} error={media.error} reload={media.reload} disabled={sourceBusy || recordingDirty} />
        {p.can_edit && <UploadPanel key={p.project_id + ":upload"} project={p} onComplete={media.reload} canChangeSource={() => true} onUploading={setSourceBusy} onRecordingDirty={setRecordingDirty} />}
      </div>
    </>}
  </>;
}
