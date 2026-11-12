import { useState } from "react";
import { UploadCloud } from "lucide-react";
import type { Media, Project } from "../../../shared/types";
import { bytes, date, time } from "../../../shared/lib/format";
import { ErrorBox, Loading } from "../../../shared/ui/components";

export function MediaPanel({ project, media, loading, error, reload, disabled = false }: {
  project: Project;
  media: Media[];
  loading: boolean;
  error: string;
  reload: () => void;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState("");
  const sources = media.filter(item => item.media_kind_code.startsWith("ORIGINAL_"));
  const current = sources.find(item => item.media_file_id === selected) ?? sources.find(item => item.is_current) ?? sources[0];
  return <div className="card media-card" id="source-player">
    <div className="section-heading"><h2>Nội dung nguồn</h2><span className="badge">{project.language_code.toUpperCase()}</span></div>
    {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : !current ? <div className="source-empty">
      <UploadCloud size={32} /><p>Thêm tệp để bắt đầu</p><small>Video, âm thanh hoặc hình ảnh</small>
    </div> : <>
      <select className="media-select" aria-label="Chọn tệp xem trước" disabled={disabled} value={current.media_file_id} onChange={event => setSelected(event.target.value)}>
        {sources.map(item => <option value={item.media_file_id} key={item.media_file_id}>{item.file_name}</option>)}
      </select>
      <div className="media-info">
        <strong>{current.file_name}</strong>
        <small>{bytes(current.file_size_bytes)}
          {!current.mime_type.startsWith("image/") && " · " + (current.duration_ms > 0 ? time(current.duration_ms) : "Chưa có thời lượng")}
          {" · " + date(current.created_at)}
        </small>
      </div>
    </>}
  </div>;
}
