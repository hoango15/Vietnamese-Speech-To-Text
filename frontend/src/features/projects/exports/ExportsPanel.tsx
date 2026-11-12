import { useEffect, useState } from "react";
import { ArrowDownToLine, Eye, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../../../shared/api/client";
import type { ExportFile, List, Media, Project } from "../../../shared/types";
import { bytes, date } from "../../../shared/lib/format";
import { Empty, ErrorBox, Loading, Modal } from "../../../shared/ui/components";
import { useAction } from "../../../shared/hooks/useAction";
import { useResource } from "../../../shared/hooks/useResource";
import { VietsubPanel } from "./VietsubPanel";

export function ExportsPanel({ project, media }: { project: Project; media?: Media }) {
  const resource = useResource<List<ExportFile>>(
      `/projects/${project.project_id}/exports${media ? "?media_file_id=" + encodeURIComponent(media.media_file_id) : ""}`,
    ),
    isImage = media?.media_kind_code === "ORIGINAL_IMAGE",
    [source, setSource] = useState(isImage ? "ocr" : "transcript"),
    [kind, setKind] = useState("TXT"),
    [maxChars, setMaxChars] = useState(42),
    [speakers, setSpeakers] = useState(true),
    [preview, setPreview] = useState<{ name: string; text: string } | null>(
      null,
    ),
    action = useAction();
  useEffect(() => {
    setSource(isImage ? "ocr" : "transcript");
    setKind("TXT");
  }, [isImage]);
  const subtitles = source === "transcript";
  return (
    <div className="card panel">
      <div className="section-heading">
        <div>
          <h2>Phụ đề & xuất kết quả</h2>
          <p>Tạo tệp để chia sẻ và sử dụng ngoài không gian làm việc.</p>
        </div>
        <button
          className="icon-button"
          aria-label="Cập nhật tệp xuất"
          onClick={resource.reload}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {media?.media_kind_code === "ORIGINAL_VIDEO" && <VietsubPanel project={project} media={media} exports={resource.data?.items ?? []} onRendered={resource.reload} />}
      {project.can_edit && (
        <form
          className="export-form"
          onSubmit={(event) => {
            event.preventDefault();
            action.run(async () => {
              await api.request(`/projects/${project.project_id}/exports`, {
                method: "POST",
                body: {
                  media_file_id: media?.media_file_id,
                  kind,
                  source,
                  ...(subtitles
                    ? {
                        max_chars_per_line: maxChars,
                        includes_speaker_label: speakers,
                      }
                    : {}),
                },
              });
              resource.reload();
            }, "Đã tạo tệp xuất.");
          }}
        >
          <div className="inline-form">
            <label>
              Nội dung xuất
              <select
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  setKind("TXT");
                }}
              >
                {isImage ? (
                  <option value="ocr">Văn bản OCR</option>
                ) : (
                  <>
                    <option value="transcript">Bản ghi nội dung</option>
                    <option value="minutes">Biên bản cuộc họp</option>
                  </>
                )}
              </select>
            </label>
            <label>
              Định dạng
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                {[
                  "TXT",
                  ...(subtitles ? ["SRT", "VTT"] : []),
                  "DOCX",
                  "PDF",
                ].map((code) => (
                  <option key={code}>{code}</option>
                ))}
              </select>
            </label>
          </div>
          {subtitles && (
            <>
              <label>
                Số ký tự tối đa mỗi dòng phụ đề
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={Number.isFinite(maxChars) ? maxChars : ""}
                  onChange={(event) => setMaxChars(event.target.valueAsNumber)}
                  required
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={speakers}
                  onChange={(event) => setSpeakers(event.target.checked)}
                />
                Kèm tên người nói
              </label>
            </>
          )}
          <div className="form-actions">
            <button className="button" disabled={action.busy}>
              <ArrowDownToLine size={16} />
              Tạo tệp xuất
            </button>
          </div>
        </form>
      )}
      <h3 className="export-list-title">Tệp đã xuất</h3>
      {resource.error ? (
        <ErrorBox error={resource.error} retry={resource.reload} />
      ) : resource.loading ? (
        <Loading />
      ) : !resource.data?.items.length ? (
        <Empty
          title="Chưa có tệp xuất"
          description="Chọn nội dung và định dạng để tạo tệp đầu tiên."
        />
      ) : (
        <div className="export-list">
          {resource.data.items.map((file) => (
            <div className="export-item" key={file.export_file_id}>
              <div className="export-kind">{file.export_kind_code}</div>
              <div className="grow">
                <strong>{file.file_name}</strong>
                {file.media_file_id === null && <small>{"Ngu\u1ed3n ch\u01b0a x\u00e1c \u0111\u1ecbnh"}</small>}
                {file.is_stale && <p className="danger small-text">Kết quả đã cũ. Nội dung đã thay đổi; hãy tạo lại tệp xuất.</p>}
                <small>
                  {bytes(file.file_size_bytes)} · {{ transcript: "Bản ghi", minutes: "Biên bản", ocr: "Văn bản OCR" }[file.source] ?? file.source} ·{" "}
                  {date(file.created_at)}
                </small>
              </div>
              <div className="row-actions">
                {["SRT", "VTT"].includes(file.export_kind_code) && (
                  <button
                    className="icon-button"
                    aria-label={"Xem trước " + file.file_name}
                    disabled={action.busy}
                    onClick={() =>
                      action.run(async () => {
                        const blob = await api.blob(
                          "/exports/" + file.export_file_id + "/download",
                        );
                        setPreview({
                          name: file.file_name,
                          text: await blob.text(),
                        });
                      })
                    }
                  >
                    <Eye size={18} />
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label={"Tải " + file.file_name}
                  disabled={action.busy}
                  onClick={() =>
                    action.run(() =>
                      api.download(
                        "/exports/" + file.export_file_id + "/download",
                        file.file_name,
                      ),
                    )
                  }
                >
                  <ArrowDownToLine size={18} />
                </button>
                {project.can_manage && (
                  <button
                    className="icon-button danger"
                    aria-label={"Xóa " + file.file_name}
                    disabled={action.busy}
                    onClick={() => {
                      if (confirm("Xóa tệp xuất này?"))
                        action.run(async () => {
                          await api.request("/exports/" + file.export_file_id, {
                            method: "DELETE",
                          });
                          resource.reload();
                        });
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {preview && (
        <Modal title={preview.name} onClose={() => setPreview(null)}>
          <p className="muted small-text">
            Phụ đề và dấu thời gian từ tệp đã xuất.
          </p>
          <pre className="subtitle-preview">{preview.text}</pre>
        </Modal>
      )}
    </div>
  );
}
