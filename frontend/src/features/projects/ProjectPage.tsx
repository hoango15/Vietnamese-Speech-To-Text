import { useCallback, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Clock3, Settings2, Users } from "lucide-react";
import type { List, Media, Project } from "../../shared/types";
import { date } from "../../shared/lib/format";
import { Empty, ErrorBox, Loading, PageTitle, Status } from "../../shared/ui/components";
import { useResource } from "../../shared/hooks/useResource";
import { useUnsavedChanges } from "../../shared/hooks/useUnsavedChanges";
import { MediaPanel } from "./media/MediaPanel";
import { UploadPanel } from "./media/UploadPanel";
import { JobsPanel } from "./jobs/JobsPanel";
import { ProjectForm } from "./components/ProjectForm";
import { ProjectOverviewPanel } from "./overview/ProjectOverviewPanel";
import { TranscriptEditor } from "./transcript/TranscriptEditor";
import "./media/media.css";

export default function ProjectPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const history = params.get("tab") === "jobs";
  const overview = params.get("tab") === "overview";
  const transcriptTab = params.get("tab") === "transcript" || (params.get("tab") === "content" && params.has("t"));
  const [edit, setEdit] = useState(false);
  const changeTab = (tab: string) => setParams(current => {
    const next = new URLSearchParams(current);
    next.set("tab", tab);
    next.delete("t");
    return next;
  });
  const [sourceBusy, setSourceBusy] = useState(false);
  const [recordingDirty, setRecordingDirty] = useState(false);
  const [transcriptDirty, setTranscriptDirty] = useState(false);
  const [resultVersion, setResultVersion] = useState(0);
  const reportDirty = useCallback((dirty: boolean) => setTranscriptDirty(dirty), []);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  useUnsavedChanges(transcriptDirty, undefined, recordingDirty, sourceBusy);
  const project = useResource<Project>("/projects/" + id);
  const media = useResource<List<Media>>(project.data && !project.data.deleted_at ? `/projects/${id}/media` : null);
  const processingComplete = useCallback(() => {
    project.reload(); media.reload();
    if (!transcriptDirty) setResultVersion(version => version + 1);
  }, [project.reload, media.reload, transcriptDirty]);
  const sources = media.data?.items.filter(item => item.media_kind_code.startsWith("ORIGINAL_")) ?? [];
  const current = sources.find(item => item.media_file_id === params.get("media")) ?? sources.find(item => item.is_current) ?? sources[0];
  const seek = (ms: number) => {
    if (mediaRef.current) { mediaRef.current.currentTime = ms / 1000; mediaRef.current.focus(); }
  };
  if (project.loading && !project.data) return <Loading />;
  if (project.error) return <ErrorBox error={project.error} retry={project.reload} />;
  const p = project.data;
  if (!p) return null;
  return <>
    <Link className="back-link" to="/projects"><ArrowLeft size={16} />Tất cả dự án</Link>
    <PageTitle title={p.project_title} subtitle={p.deleted_at ? "Dự án đã nằm trong thùng rác." : p.project_description || "Quản lý tệp nguồn của dự án."}>
      <Status code={p.project_status_code} />
      {p.can_manage && !p.deleted_at && <button className="button secondary" disabled={sourceBusy || recordingDirty || transcriptDirty} onClick={() => setEdit(true)}><Settings2 size={17} />Cài đặt dự án</button>}
    </PageTitle>
    {p.deleted_at ? <div className="card"><Empty title="Dự án đã bị xóa" description="Khôi phục trong thùng rác để tiếp tục làm việc." /></div> : <>
      <div className="project-meta">
        <span><Users size={15} />{p.member_count} thành viên</span>
        <span><Clock3 size={15} />Cập nhật {date(p.updated_at)}</span>
        <span>Người quản lý: {p.owner_name}</span>
      </div>
      <nav className="project-tabs" aria-label="Màn hình dự án">
        <button className="button secondary" aria-pressed={overview} disabled={sourceBusy || recordingDirty} onClick={() => changeTab("overview")}>Tổng quan dự án</button>
        <button className="button secondary" aria-pressed={!history && !overview && !transcriptTab} disabled={sourceBusy || recordingDirty} onClick={() => changeTab("content")}>Tệp nguồn</button>
        <button className="button secondary" aria-pressed={transcriptTab} disabled={sourceBusy || recordingDirty} onClick={() => changeTab("transcript")}>Bản ghi</button>
        <button className="button secondary" aria-pressed={history} disabled={sourceBusy || recordingDirty} onClick={() => changeTab("jobs")}>Lịch sử xử lý</button>
      </nav>
      {overview ? <ProjectOverviewPanel key={p.project_id} project={p} media={media.data?.items ?? []} /> : history ? <JobsPanel key={p.project_id} project={p} /> : <div className="project-media-layout">
        <MediaPanel key={p.project_id} project={p} media={media.data?.items ?? []} loading={media.loading} error={media.error} reload={media.reload} disabled={sourceBusy || recordingDirty || transcriptDirty} onProcessed={processingComplete} mediaRef={mediaRef} />
        {transcriptTab ? current && !current.mime_type.startsWith("image/") ? <TranscriptEditor key={`${p.project_id}:${current.media_file_id}:${resultVersion}`} project={p} mediaId={current.media_file_id} seek={seek} reportDirty={reportDirty} /> : <div className="card"><Empty title="Chọn tệp âm thanh hoặc video để xem bản ghi" /></div> : p.can_edit && <UploadPanel key={p.project_id + ":upload"} project={p} onComplete={media.reload} canChangeSource={() => !transcriptDirty} onUploading={setSourceBusy} onRecordingDirty={setRecordingDirty} />}
      </div>}
    </>}
    {edit && p.can_manage && !p.deleted_at && <ProjectForm project={p} onClose={() => setEdit(false)} onSaved={project.reload} />}
  </>;
}
