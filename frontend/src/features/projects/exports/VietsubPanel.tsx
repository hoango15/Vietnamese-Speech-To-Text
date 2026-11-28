import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownToLine, Eye, Film, RefreshCw } from "lucide-react";
import { api } from "../../../shared/api/client";
import type { ExportFile, Job, List, Media, Project, Transcript } from "../../../shared/types";
import { useResource } from "../../../shared/hooks/useResource";
import { useAction } from "../../../shared/hooks/useAction";
import { ErrorBox, Loading } from "../../../shared/ui/components";
import { bytes, date } from "../../../shared/lib/format";
import { JobCard } from "../jobs/JobCard";
import { VietsubPreviewDialog } from "./VietsubPreviewDialog";
import "./vietsub.css";

export function VietsubPanel({ project, media, exports, onRendered }: {
  project: Project; media: Media; exports: ExportFile[]; onRendered: () => void;
}) {
  const transcript = useResource<Transcript>(`/projects/${project.project_id}/transcripts/current?media_file_id=${encodeURIComponent(media.media_file_id)}`, true);
  const jobs = useResource<List<Job>>(`/projects/${project.project_id}/jobs`);
  const [width, setWidth] = useState(42), [speakers, setSpeakers] = useState(false);
  const [preview, setPreview] = useState(false), [burnJob, setBurnJob] = useState<Job | null>(null);
  const action = useAction();
  useEffect(() => {
    if (jobs.data) setBurnJob(jobs.data.items.find(job => job.media_file_id === media.media_file_id && job.job_kind === "BURN_IN") ?? null);
  }, [jobs.data, media.media_file_id]);
  const complete = useCallback(() => { onRendered(); jobs.reload(); }, [onRendered, jobs.reload]);
  const ready = Boolean(transcript.data?.segments.some(segment => segment.segment_text.trim()));
  const validWidth = Number.isInteger(width) && width >= 10 && width <= 120;
  const active = Boolean(burnJob && ["QUEUED", "RUNNING"].includes(burnJob.job_status_code))
    || Boolean(jobs.data?.items.some(job => job.media_file_id === media.media_file_id && job.job_id !== burnJob?.job_id && ["QUEUED", "RUNNING"].includes(job.job_status_code)));
  const latest = transcript.data?.transcript_id && exports.find(file => file.export_kind_code === "BURNED_VIDEO" && file.transcript_id === transcript.data?.transcript_id);
  return <section className="vietsub-panel" aria-label="Tạo video Vietsub">
    <div className="section-heading"><div><h3><Film size={20} />Tạo video Vietsub</h3><p>Gắn bản chép lời tiếng Việt đã lưu lên video. Video nguồn được giữ nguyên.</p></div><button className="icon-button" aria-label="Cập nhật Vietsub" onClick={() => { transcript.reload(); jobs.reload(); onRendered(); }}><RefreshCw size={17} /></button></div>
    {transcript.loading ? <Loading /> : transcript.error ? <ErrorBox error={transcript.error} retry={transcript.reload} /> : !ready ? <p className="vietsub-help">Cần bản chép lời có nội dung và dấu thời gian trước khi tạo Vietsub. <Link className="text-link" to={`/projects/${project.project_id}?tab=content&media=${encodeURIComponent(media.media_file_id)}`}>Mở bản ghi để xử lý video</Link></p> : <p className="vietsub-help">Bản chép lời phiên bản {transcript.data?.version_no} · <Link className="text-link" to={`/projects/${project.project_id}?tab=content&media=${encodeURIComponent(media.media_file_id)}`}>Sửa câu và thời gian</Link></p>}
    {jobs.error && <ErrorBox error={jobs.error} retry={jobs.reload} />}
    <div className="vietsub-options"><label>Số ký tự tối đa mỗi dòng<input aria-label="Số ký tự mỗi dòng Vietsub" type="number" min={10} max={120} step={1} required value={Number.isFinite(width) ? width : ""} onChange={event => setWidth(event.target.valueAsNumber)} /></label>
      <label className="checkbox-label"><input aria-label="Kèm tên người nói trong Vietsub" type="checkbox" checked={speakers} onChange={event => setSpeakers(event.target.checked)} />Kèm tên người nói</label>
    </div>
    <div className="vietsub-actions"><button className="button secondary" disabled={!ready || !validWidth || transcript.loading} onClick={() => setPreview(true)}><Eye size={16} />Xem trước Vietsub</button>
      {project.can_edit && <button className="button" disabled={!ready || !validWidth || transcript.loading || jobs.loading || Boolean(jobs.error) || active || action.busy} onClick={() => action.run(async () => {
        const job = await api.request<Job>(`/projects/${project.project_id}/subtitles/burn-in`, { method: "POST", body: { max_chars_per_line: width, includes_speaker_label: speakers, transcript_id: transcript.data?.transcript_id, media_file_id: media.media_file_id } });
        setBurnJob(job); jobs.reload();
      }, "Đã bắt đầu tạo video Vietsub.")}><Film size={16} />Xuất video Vietsub</button>}
    </div>
    <p className="muted small-text">Phụ đề tự chia tối đa 2 dòng theo dấu thời gian. Video xuất là MP4, giữ tiếng gốc.</p>
    {active && <p className="vietsub-help">Dự án có tác vụ đang chạy. Có thể rời trang và quay lại để xem tiếp tiến trình.</p>}
    {burnJob && <JobCard job={burnJob} canEdit={project.can_edit} onComplete={complete} onChange={jobs.reload} />}
    {latest && <div className="vietsub-result"><div><strong>Video Vietsub mới nhất</strong><small>{bytes(latest.file_size_bytes)} · {date(latest.created_at)} · bản chép lời hiện hành</small></div><button className="button secondary" disabled={action.busy} onClick={() => action.run(() => api.download(`/exports/${latest.export_file_id}/download`, latest.file_name))}><ArrowDownToLine size={16} />Tải video Vietsub</button></div>}
    {preview && transcript.data && <VietsubPreviewDialog projectId={project.project_id} mediaId={media.media_file_id} transcriptId={transcript.data.transcript_id} width={width} speakers={speakers} onClose={() => setPreview(false)} />}
  </section>;
}
