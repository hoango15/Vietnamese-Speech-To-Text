import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { History, Play } from "lucide-react";
import { api } from "../../../shared/api/client";
import type { Capabilities, Job, List, Media, Project } from "../../../shared/types";
import { ErrorBox } from "../../../shared/ui/components";
import { useAction } from "../../../shared/hooks/useAction";
import { useResource } from "../../../shared/hooks/useResource";
import { message } from "../../../shared/lib/errors";
import { JobCard } from "../jobs/JobCard";

function useActiveJobs(projectId: string) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ projectId, data: [] as Job[], loading: true, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    setState(old => ({ projectId, data: old.projectId === projectId ? old.data : [], loading: true, error: "" }));
    Promise.all(["QUEUED", "RUNNING"].map(async status => {
      const jobs: Job[] = [];
      for (let page = 1; !controller.signal.aborted; page++) {
        const result = await api.request<List<Job>>(`/projects/${projectId}/jobs?status=${status}&page=${page}&page_size=20`, { signal: controller.signal });
        jobs.push(...result.items);
        if (!result.items.length || page * 20 >= result.total) break;
      }
      return jobs;
    })).then(pages => {
      if (!controller.signal.aborted) setState({ projectId, data: pages.flat(), loading: false, error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ projectId, data: [], loading: false, error: message(error) });
    });
    return () => controller.abort();
  }, [projectId, version]);
  const current = state.projectId === projectId ? state : { data: [], loading: true, error: "" };
  return { ...current, reload: () => setVersion(value => value + 1) };
}

export function ProcessPanel({ project, media, onComplete, disabled = false }: {
  project: Project;
  media?: Media;
  onComplete: () => void;
  disabled?: boolean;
}) {
  const [params] = useSearchParams();
  const historyParams = new URLSearchParams(params);
  historyParams.set("tab", "jobs");
  if (media) historyParams.set("media", media.media_file_id);
  else historyParams.delete("media");
  const capabilities = useResource<Capabilities>("/system/capabilities"),
    jobs = useActiveJobs(project.project_id),
    glossaries = useResource<List<{ glossary_id: string; glossary_name: string }>>("/glossaries?page_size=100"),
    [glossary, setGlossary] = useState(""),
    [minutes, setMinutes] = useState(false),
    [diarization, setDiarization] = useState(false),
    [speakerCount, setSpeakerCount] = useState(""),
    [validation, setValidation] = useState(""),
    [lastJob, setLastJob] = useState<Job | null>(null),
    action = useAction();
  const image = media?.media_kind_code === "ORIGINAL_IMAGE",
    separateSpeakers = !image && diarization && !!capabilities.data?.diarization,
    supported = image ? capabilities.data?.ocr : capabilities.data?.asr,
    localJob = lastJob?.project_id === project.project_id && lastJob?.media_file_id === media?.media_file_id ? lastJob : null,
    currentJob = localJob && ["QUEUED", "RUNNING"].includes(localJob.job_status_code) ? localJob :
      jobs.data.find(job => job.media_file_id === media?.media_file_id && job.job_id !== localJob?.job_id) ?? localJob,
    active = !!currentJob && ["QUEUED", "RUNNING"].includes(currentJob.job_status_code);
  return <section className="processing-card" aria-label="Xử lý nội dung">
    <div className="section-heading"><h3>Xử lý nội dung</h3><span className="badge">{image ? "OCR" : "ASR"}</span></div>
    {capabilities.error && <ErrorBox error={capabilities.error} retry={capabilities.reload} />}
    {jobs.error && <ErrorBox error={jobs.error} retry={jobs.reload} />}
    <p className="muted small-text">{image ? "Nhận dạng văn bản từ ảnh bằng OCR." :
      `Nhận dạng giọng nói${capabilities.data ? " · " + capabilities.data.asr_model : ""}. ${capabilities.data?.diarization ? "Có hỗ trợ nhận diện người nói tự động." : "Gán người nói thủ công trong trình biên tập."}`}</p>
    {!image && capabilities.data?.asr_provider === "colab" && <p className="provider-note">
      Âm thanh sẽ được gửi tới Colab đã cấu hình để nhận dạng. Tệp nguồn và kết quả được quản lý trong dự án.
    </p>}
    {project.can_edit && !project.deleted_at && <fieldset disabled={disabled || action.busy || active} className="processing-options">
      <label>Từ điển thuật ngữ
        <select value={glossary} onChange={event => setGlossary(event.target.value)}>
          <option value="">Không sử dụng</option>
          {glossaries.data?.items.map(item => <option value={item.glossary_id} key={item.glossary_id}>{item.glossary_name}</option>)}
        </select>
      </label>
      {glossaries.error && <ErrorBox error={glossaries.error} retry={glossaries.reload} />}
      {!image && <>
        <label className="checkbox-label">
          <input type="checkbox" aria-label="Tự phân biệt người nói" checked={diarization} disabled={!capabilities.data?.diarization || action.busy}
            onChange={event => { setDiarization(event.target.checked); setValidation(""); }} />Tự phân biệt người nói
        </label>
        {separateSpeakers && <>
          <label>Số người nói (tùy chọn)
            <input type="number" aria-label="Số người nói" min="1" max="20" step="1" placeholder="Tự ước lượng" value={speakerCount}
              onChange={event => { setSpeakerCount(event.target.value); setValidation(""); }} />
          </label>
          <p className="muted small-text">Xử lý cục bộ. Kiểm tra và đổi tên người nói sau khi hoàn tất; giọng chồng lấn có thể chưa chính xác.</p>
        </>}
        <label className="checkbox-label"><input type="checkbox" checked={minutes} onChange={event => setMinutes(event.target.checked)} />Tạo biên bản sau khi nhận dạng</label>
      </>}
      {validation && <ErrorBox error={validation} />}
      {minutes && capabilities.data?.llm && <p className="provider-note">Tổ chức đã bật LLM. Nội dung bản ghi có thể được gửi đến nhà cung cấp đã cấu hình.</p>}
      <button className="button full-width" disabled={disabled || action.busy || active || jobs.loading || !!jobs.error || !media || !supported}
        onClick={() => {
          if (!image && !minutes && !separateSpeakers) {
            setValidation("Chọn ít nhất một tùy chọn: phân biệt người nói hoặc tạo biên bản.");
            return;
          }
          if (separateSpeakers && speakerCount.trim() && (!Number.isInteger(Number(speakerCount)) || Number(speakerCount) < 1 || Number(speakerCount) > 20)) {
            setValidation("Số người nói phải là số nguyên từ 1 đến 20.");
            return;
          }
          setValidation("");
          action.run(async () => {
            if (!media) return;
            setLastJob(await api.request<Job>(`/projects/${project.project_id}/jobs`, { method: "POST", body: {
              media_file_id: media.media_file_id,
              ...(glossary ? { glossary_id: glossary } : {}),
              is_minutes_requested: minutes && !image,
              is_diarization_requested: separateSpeakers,
              ...(separateSpeakers && speakerCount.trim() ? { expected_speaker_count: Number(speakerCount) } : {}),
            } }));
          }, "Đã đưa yêu cầu vào hàng chờ.");
        }}><Play size={16} />{action.busy ? "Đang tạo yêu cầu…" : image ? "Nhận dạng văn bản" : "Bắt đầu xử lý"}</button>
      {media && supported === false && <p className="small-text danger">Máy chủ chưa cấu hình khả năng này.</p>}
    </fieldset>}
    {currentJob && <JobCard job={currentJob} canEdit={project.can_edit && !project.deleted_at && !disabled}
      onChange={updated => { setLastJob(updated); jobs.reload(); }}
      onComplete={updated => { setLastJob(updated); jobs.reload(); onComplete(); }} />}
    <Link className="text-link small-text" to={`/projects/${project.project_id}?${historyParams}`} aria-disabled={disabled || action.busy}
      tabIndex={disabled || action.busy ? -1 : undefined} onClick={event => { if (disabled || action.busy) event.preventDefault(); }}>
      <History size={15} />Xem lịch sử xử lý
    </Link>
  </section>;
}
