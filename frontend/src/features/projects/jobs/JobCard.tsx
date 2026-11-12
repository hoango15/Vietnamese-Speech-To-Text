import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "../../../shared/api/client";
import type { Job } from "../../../shared/types";
import { date, time } from "../../../shared/lib/format";
import { ErrorBox, Status } from "../../../shared/ui/components";
import { message } from "../../../shared/lib/errors";
import { useAction } from "../../../shared/hooks/useAction";

export function JobCard({ job, canEdit, onComplete, onChange, onResults }: {
  job: Job;
  canEdit: boolean;
  onComplete?: () => void;
  onChange?: () => void;
  onResults?: () => void;
}) {
  const [value, setValue] = useState(job),
    [error, setError] = useState(""),
    [now, setNow] = useState(Date.now),
    action = useAction();
  const mutationVersion = useRef(0);
  useEffect(() => setValue(job), [job]);
  useEffect(() => {
    if (value.job_status_code === "SUCCEEDED") onComplete?.();
  }, [value.job_id, value.job_status_code, onComplete]);
  useEffect(() => {
    setNow(Date.now());
    if (value.job_status_code !== "RUNNING") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [value.job_id, value.job_status_code]);
  useEffect(() => {
    if (!["QUEUED", "RUNNING"].includes(value.job_status_code)) return;
    const controller = new AbortController();
    let loading = false;
    const timer = setInterval(async () => {
      if (loading) return;
      loading = true;
      const version = mutationVersion.current;
      try {
        const updated = await api.request<Job>("/jobs/" + job.job_id, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted && version === mutationVersion.current) {
          setValue(updated);
          setError("");
        }
      } catch (error) {
        if (!controller.signal.aborted && version === mutationVersion.current) setError(message(error));
      } finally {
        loading = false;
      }
    }, 2000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [job.job_id, value.job_status_code]);
  const elapsed = value.started_at && value.job_status_code !== "QUEUED"
    ? Math.max(0, Math.floor(((value.finished_at ? Date.parse(value.finished_at) : now) - Date.parse(value.started_at)) / 1000))
    : 0;
  const audio = value.asr_progress;
  return (
    <div className="job-card">
      {value.file_name && <p><strong>{value.file_name}</strong> · <small>{value.job_id}</small></p>}
      {!!value.requested_exports?.length && <p className="muted small-text">Đầu ra: {value.requested_exports.join(", ")}</p>}
      <div className="job-top">
        <Status code={value.job_status_code} />
        <small>{date(value.created_at)}</small>
      </div>
      <div className="job-progress-label">
        <span>Tiến độ</span>
        <strong>{value.progress_percent}%</strong>
      </div>
      <div className="progress" role="progressbar" aria-label="Tiến độ xử lý" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value.progress_percent}>
        <span style={{ width: value.progress_percent + "%" }} />
      </div>
      <div className="job-timing">
        <span>{value.job_status_code === "QUEUED" ? "Chờ bắt đầu" : "Thời gian xử lý"}</span>
        {value.job_status_code !== "QUEUED" && <strong role="timer" aria-label="Thời gian xử lý" aria-live="off">
          {Math.floor(elapsed / 60)} phút {(elapsed % 60).toString().padStart(2, "0")} giây
        </strong>}
      </div>
      {audio && <div className="job-timing">
        <span>Âm thanh đã nhận dạng</span>
        <strong>{time(audio.processed_audio_ms).replace(/^00:/, "")} / {time(audio.total_audio_ms).replace(/^00:/, "")}</strong>
      </div>}
      {["QUEUED", "RUNNING"].includes(value.job_status_code) && <p className="job-progress-hint">
        Cập nhật mỗi 2 giây. % tăng khi hoàn tất giai đoạn hoặc phần âm thanh.
      </p>}
      {value.stages && (
        <div className="job-stages">
          {value.stages.map((stage, i) => (
            <div key={i}>
              <span>
                {{
                  EXTRACT_AUDIO: "Chuẩn bị âm thanh",
                  VAD: "Phát hiện giọng nói",
                  ASR: "Nhận dạng nội dung",
                  OCR: "Nhận dạng văn bản",
                  DIARIZE: "Phân tách người nói",
                  ALIGN: "Căn chỉnh thời gian",
                  POSTPROCESS: "Hoàn thiện nội dung",
                  MINUTES: "Tổng hợp biên bản",
                  EXPORT: "Xuất kết quả",
                  BURN_IN: "Gắn phụ đề",
                }[stage.job_stage_type_code] ?? stage.job_stage_type_code}
              </span>
              <Status code={stage.stage_status_code} />
              {stage.error_message && (
                <p className="danger">{stage.error_message}</p>
              )}
            </div>
          ))}
        </div>
      )}
      {value.error_message && <ErrorBox error={value.error_message} />}{" "}
      {error && <ErrorBox error={error} />}{" "}
      {onResults && value.job_status_code === "SUCCEEDED" && <button className="button secondary small" onClick={onResults}>Xem kết quả tác vụ</button>}
      {canEdit && (
        <div className="row-actions">
          {["QUEUED", "RUNNING"].includes(value.job_status_code) && (
            <button
              className="button secondary small"
              disabled={action.busy}
              onClick={() =>
                action.run(async () => {
                  const updated = await api.request<Job>(`/jobs/${value.job_id}/cancel`, {
                    method: "POST",
                  });
                  mutationVersion.current++;
                  setValue(updated);
                  onChange?.();
                })
              }
            >
              Hủy xử lý
            </button>
          )}
          {value.job_status_code === "FAILED" && (
            <button
              className="button secondary small"
              disabled={action.busy}
              onClick={() =>
                action.run(async () => {
                  setValue(
                    await api.request<Job>(`/jobs/${value.job_id}/retry`, {
                      method: "POST",
                    }),
                  );
                  onChange?.();
                })
              }
            >
              <RefreshCw size={14} />
              Thử lại
            </button>
          )}
        </div>
      )}
    </div>
  );
}
