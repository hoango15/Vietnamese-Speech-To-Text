import { useEffect, useState } from "react";
import { History, RefreshCw, Save } from "lucide-react";
import { api } from "../../../shared/api/client";
import type { List, OCR, OCRVersion, Project } from "../../../shared/types";
import { date } from "../../../shared/lib/format";
import { Empty, ErrorBox, Loading, Modal } from "../../../shared/ui/components";
import { useResource } from "../../../shared/hooks/useResource";
import { useAction } from "../../../shared/hooks/useAction";
import "./ocr.css";

export function OCREditor({ project, mediaId, reportDirty }: {
  project: Project;
  mediaId?: string;
  reportDirty: (dirty: boolean) => void;
}) {
  const query = mediaId ? "?media_file_id=" + encodeURIComponent(mediaId) : "";
  const resource = useResource<OCR>(`/projects/${project.project_id}/ocr${query}`, true);
  const versions = useResource<List<OCRVersion>>(`/projects/${project.project_id}/ocr/versions${query}`);
  const [history, setHistory] = useState(false);
  const [value, setValue] = useState<OCR | null>(null);
  const [dirty, setDirty] = useState(false);
  const action = useAction();
  useEffect(() => {
    setValue(resource.data);
    setDirty(false);
  }, [resource.data]);
  useEffect(() => {
    reportDirty(dirty);
    return () => reportDirty(false);
  }, [dirty, reportDirty]);
  return (
    <div className="card panel ocr-panel">
      <div className="section-heading">
        <div>
          <h2>Văn bản OCR</h2>
          <p>{value ? `Revision ${value.revision} · ${value.language_code.toUpperCase()}` : "Văn bản được nhận dạng từ hình ảnh"}{dirty && " · Chưa lưu"}</p>
        </div>
        <div className="row-actions">
          <button className="icon-button" aria-label="Lịch sử OCR" onClick={() => { versions.reload(); setHistory(true); }}><History size={18} /></button>
          <button className="icon-button" aria-label="Cập nhật OCR" disabled={action.busy} onClick={() => {
            if (!dirty || confirm("Bỏ chỉnh sửa chưa lưu và tải lại?")) resource.reload();
          }}><RefreshCw size={18} /></button>
          {project.can_edit && value && <button className="button small" disabled={action.busy || resource.loading || !dirty} onClick={() => action.run(async () => {
            const result = await api.request<OCR>("/ocr/" + value.ocr_document_id, {
              method: "PATCH", body: { revision: value.revision, text: value.text },
            });
            setValue(result);
            setDirty(false);
            versions.reload();
          }, "Đã lưu văn bản OCR.")}><Save size={16} />Lưu</button>}
        </div>
      </div>
      {resource.error ? <ErrorBox error={resource.error} retry={resource.reload} /> : resource.loading ? <Loading /> : !value ? (
        <Empty title="Chưa có văn bản OCR" description="Bắt đầu nhận dạng ảnh nguồn để lấy văn bản." />
      ) : <>
        <label className="sr-only" htmlFor="ocr-text">Văn bản nhận dạng</label>
        <textarea id="ocr-text" className="ocr-text" value={value.text} maxLength={2_000_000} readOnly={!project.can_edit || action.busy} onChange={event => {
          setValue({ ...value, text: event.target.value });
          setDirty(true);
        }} />
        <p className="small-text muted">{value.text.length.toLocaleString("vi-VN")} ký tự · Kiểm tra tên riêng và dấu tiếng Việt trước khi xuất.</p>
      </>}
      {history && <Modal title="Lịch sử văn bản OCR" onClose={() => setHistory(false)}>
        {versions.error ? <ErrorBox error={versions.error} retry={versions.reload} /> : versions.loading ? <Loading /> : versions.data?.items.length ? (
          <div className="ocr-versions">
            {versions.data.items.map(version => <details key={version.ocr_version_id}>
              <summary>Revision {version.revision} · {date(version.created_at)}</summary>
              <pre className="ocr-snapshot">{version.text}</pre>
            </details>)}
          </div>
        ) : <Empty title="Chưa có lịch sử" />}
      </Modal>}
    </div>
  );
}
