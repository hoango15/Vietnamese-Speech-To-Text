import { api } from "../../../shared/api/client";
import type { ExportFile, Job, Minutes, Transcript } from "../../../shared/types";
import { useAction } from "../../../shared/hooks/useAction";
import { useResource } from "../../../shared/hooks/useResource";
import { Empty, ErrorBox, Loading, Modal } from "../../../shared/ui/components";
import { time } from "../../../shared/lib/format";

export function JobResults({ job, onClose }: { job: Job; onClose: () => void }) {
  const resource = useResource<{
    media: { media_file_id: string; file_name: string };
    transcript: Transcript | null;
    minutes: (Minutes & { transcript_id: string; transcript_version_no: number }) | null;
    exports: ExportFile[];
    ocr: { document_text: string } | null;
  }>(`/jobs/${job.job_id}/results`);
  const action = useAction();
  const value = resource.data;
  return <Modal title="Kết quả tác vụ" onClose={onClose}>
    {resource.error ? <ErrorBox error={resource.error} retry={resource.reload} /> : resource.loading ? <Loading /> : value ? <div className="stack job-results">
      <p>{value.media.file_name}</p>
      <button className="button secondary small" disabled={action.busy} onClick={() => action.run(() =>
        api.download(`/media/${value.media.media_file_id}/download`, value.media.file_name))}>Tải tệp nguồn</button>
      {value.transcript && <>
        <h3>Bản ghi · phiên bản {value.transcript.version_no}</h3>
        <p className="muted small-text">Bản ghi thuộc lần xử lý này. Các tệp bên dưới giữ phiên bản tại thời điểm xuất.</p>
        <div className="preview-text">{value.transcript.segments.map((segment, index) => <p key={index}>
          <small>{time(segment.start_ms)} – {time(segment.end_ms)}</small><br />{segment.segment_text}
        </p>)}</div>
      </>}
      {value.ocr && <pre className="preview-text">{value.ocr.document_text}</pre>}
      {value.minutes && <>
        <h3>{value.minutes.meeting_title}</h3>
        <p className="muted small-text">Biên bản dựa trên bản ghi phiên bản {value.minutes.transcript_version_no}.</p>
        {value.transcript && value.minutes.transcript_id !== value.transcript.transcript_id &&
          <p className="provider-note">Bản ghi đã thay đổi sau khi tạo biên bản. Nội dung biên bản cần được rà soát.</p>}
        <p className="preview-text">{value.minutes.summary_text}</p>
        <h4>Chủ đề chính</h4>
        {value.minutes.topics.length ? value.minutes.topics.map((topic, index) => <div key={index}>
          <strong>{topic.topic_title}</strong><p className="preview-text">{topic.topic_summary}</p>
        </div>) : <p>Chưa xác định</p>}
        <h4>Quyết định</h4>
        {value.minutes.decisions.length ? <ul>{value.minutes.decisions.map((decision, index) =>
          <li key={index}>{decision.decision_text}</li>)}</ul> : <p>Chưa xác định</p>}
        <h4>Công việc cần làm</h4>
        {value.minutes.action_items.length ? <ul>{value.minutes.action_items.map((item, index) => <li key={index}>
          <p>{item.item_description}</p>
          <p className="muted small-text">Người phụ trách: {item.assignee_name || "Chưa xác định"} · Hạn: {item.due_date || "Chưa xác định"}</p>
        </li>)}</ul> : <p>Chưa xác định</p>}
      </>}
      {value.exports.length ? <><h3>Tệp kết quả của tác vụ</h3>{value.exports.map(file => <button key={file.export_file_id}
        className="button secondary small" disabled={action.busy} onClick={() => action.run(() =>
          api.download(`/exports/${file.export_file_id}/download`, file.file_name))}>{file.export_kind_code} · {file.file_name}</button>)}</>
        : <Empty title="Chưa xuất tệp" description="Mở tab Phụ đề & xuất tệp để tạo kết quả từ nội dung đã lưu." />}
    </div> : null}
  </Modal>;
}
