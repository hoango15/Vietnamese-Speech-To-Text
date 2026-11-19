import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownToLine, ArrowUpRight, FileSearch } from "lucide-react";
import { api } from "../../../shared/api/client";
import type { FileRecord } from "../../../shared/types";
import { bytes, date } from "../../../shared/lib/format";
import { message } from "../../../shared/lib/errors";
import { useAction } from "../../../shared/hooks/useAction";
import { ErrorBox, FileIcon, fileKindNames, Loading, Modal } from "../../../shared/ui/components";

export function FilePreviewDialog({ file, onClose }: { file: FileRecord; onClose: () => void }) {
  const [preview, setPreview] = useState({ text: "", url: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const action = useAction();
  const textFile = ["TXT", "SRT", "VTT"].includes(file.kind);
  const image = file.kind === "ORIGINAL_IMAGE";
  const audio = file.kind.includes("AUDIO");
  const video = file.kind.includes("VIDEO");
  const supported = textFile || image || audio || video || file.kind === "PDF";
  const tooLarge = file.size > 20 * 1024 * 1024;
  const sourceMedia = /^\/(?:api\/)?media\//.test(file.download_url);

  useEffect(() => {
    if (!supported || tooLarge) return;
    const controller = new AbortController();
    let objectUrl = "";
    setLoading(true);
    setError("");
    setPreview({ text: "", url: "" });
    api.blob(file.download_url, { signal: controller.signal })
      .then(async blob => {
        if (controller.signal.aborted) return;
        if (textFile) {
          const text = await blob.text();
          if (!controller.signal.aborted) setPreview({ text, url: "" });
        } else {
          objectUrl = URL.createObjectURL(blob);
          setPreview({ text: "", url: objectUrl });
        }
      })
      .catch(reason => { if (!controller.signal.aborted) setError(message(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.download_url, supported, tooLarge, textFile, attempt]);

  return (
    <Modal title="Chi tiết tệp" onClose={onClose}>
      <div className="file-detail-heading">
        <FileIcon kind={file.kind} />
        <div><h3>{file.file_name}</h3><p className="muted">{file.project_title}</p></div>
        <span className="badge">{fileKindNames[file.kind] ?? file.kind}</span>
      </div>
      <dl className="file-metadata">
        <div><dt>Loại tệp</dt><dd>{fileKindNames[file.kind] ?? file.kind}</dd></div>
        <div><dt>Dung lượng</dt><dd>{bytes(file.size)}</dd></div>
        <div><dt>Ngày tạo</dt><dd>{date(file.created_at)}</dd></div>
        <div><dt>Dự án</dt><dd>{file.project_title}</dd></div>
      </dl>
      <section className="file-preview" aria-label="Xem nhanh nội dung">
        {tooLarge ? <div className="preview-unavailable"><FileSearch size={32} /><p>Tệp lớn hơn 20 MB. Tải xuống hoặc mở dự án để xem nội dung.</p></div>
          : !supported ? <div className="preview-unavailable"><FileSearch size={32} /><p>Tải tệp xuống để xem định dạng này, hoặc mở nội dung trong dự án.</p></div>
          : loading ? <Loading />
          : error ? <ErrorBox error={error} retry={() => setAttempt(value => value + 1)} />
          : textFile ? <pre>{preview.text || "Tệp không có nội dung văn bản."}</pre>
          : preview.url && (image ? <img src={preview.url} alt={file.file_name} />
            : audio ? <audio src={preview.url} controls preload="metadata" />
            : video ? <video src={preview.url} controls preload="metadata" />
            : <iframe src={preview.url} title={file.file_name} sandbox="" />)}
      </section>
      <div className="form-actions file-preview-actions">
        <button className="button secondary" disabled={action.busy}
          onClick={() => action.run(() => api.download(file.download_url, file.file_name))}>
          <ArrowDownToLine size={16} />Tải xuống
        </button>
        {file.media_file_id === null ? <p className="muted">Nguồn chưa xác định. Bạn vẫn có thể tải tệp xuống.</p> : <Link className="button" to={`/projects/${file.project_id}?tab=${sourceMedia ? "content" : "exports"}${file.media_file_id ? `&media=${encodeURIComponent(file.media_file_id)}` : ""}`}>
          Mở trong dự án<ArrowUpRight size={16} />
        </Link>}
      </div>
    </Modal>
  );
}
