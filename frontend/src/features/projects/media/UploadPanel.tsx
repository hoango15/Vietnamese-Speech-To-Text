import { useEffect, useRef, useState } from "react";
import { FolderOpen, Pause, UploadCloud, X } from "lucide-react";
import { api } from "../../../shared/api/client";
import { uploadChunks } from "./upload";
import type { Capabilities, Media, Project, Upload } from "../../../shared/types";
import { bytes } from "../../../shared/lib/format";
import { ErrorBox } from "../../../shared/ui/components";
import { message } from "../../../shared/lib/errors";
import { useAuth } from "../../auth/AuthProvider";
import { useNotice } from "../../../shared/ui/NoticeProvider";
import { useResource } from "../../../shared/hooks/useResource";
import { RecordingPanel } from "./RecordingPanel";

interface SavedUpload {
  id: string;
  name: string;
  size: number;
  lastModified: number;
}

const mimeTypes: Record<string, string> = {
  mp4: "video/mp4", mov: "video/quicktime", mkv: "video/x-matroska", webm: "video/webm", avi: "video/x-msvideo",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg", flac: "audio/flac", weba: "audio/webm",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp",
};

export function UploadPanel({
  project,
  onComplete,
  canChangeSource,
  onUploading,
  onRecordingDirty,
}: {
  project: Project;
  onComplete: () => void;
  canChangeSource: () => boolean;
  onUploading: (busy: boolean) => void;
  onRecordingDirty?: (dirty: boolean) => void;
}) {
  const { user } = useAuth(),
    key = `thanh-am-upload:${user?.user_id}:${project.project_id}`,
    [saved, setSaved] = useState<SavedUpload | null>(() => {
      try {
        return JSON.parse(localStorage.getItem(key) ?? "null");
      } catch {
        return null;
      }
    }),
    [remaining, setRemaining] = useState<File[]>([]),
    [file, setFile] = useState<File | null>(null),
    [progress, setProgress] = useState(0),
    [uploading, setBusy] = useState(false),
    [canceling, setCanceling] = useState(false),
    [error, setError] = useState(""),
    [drag, setDrag] = useState(false),
    [status, setStatus] = useState(""),
    [recordingActive, setRecordingActive] = useState(false),
    [savedRecording, setSavedRecording] = useState<File | null>(null),
    controller = useRef<AbortController | null>(null),
    input = useRef<HTMLInputElement>(null),
    notice = useNotice();
  const busy = uploading || canceling;
  const capabilities = useResource<Capabilities>("/system/capabilities");
  const prefixes = project.project_type === "VIDEO" ? ["video/"]
    : project.project_type === "IMAGE" ? ["image/"]
    : project.project_type === "AUDIO" ? ["audio/"]
    : project.project_type === "LECTURE" ? ["video/", "audio/"]
    : ["video/", "audio/", "image/"];
  const extensions = Object.keys(mimeTypes).filter(extension => prefixes.some(prefix => mimeTypes[extension].startsWith(prefix)));
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    onUploading(busy);
    return () => onUploading(false);
  }, [busy, onUploading]);
  function fileError(file: File) {
    if (!extensions.includes(file.name.split(".").at(-1)?.toLowerCase() ?? ""))
      return "Loại tệp không phù hợp với dự án. Chọn định dạng được liệt kê bên dưới.";
    if (file.size === 0) return "Tệp đang trống.";
    if (capabilities.data && file.size > capabilities.data.max_upload_bytes)
      return `Tệp vượt giới hạn ${bytes(capabilities.data.max_upload_bytes)}.`;
    return "";
  }
  function choose(files: ArrayLike<File> | null) {
    const file = files?.[0];
    if (!file || busy || recordingActive) return false;
    if (
      saved &&
      (saved.name !== file.name ||
        saved.size !== file.size ||
        saved.lastModified !== file.lastModified)
    ) {
      setError("Chọn đúng tệp đang tải dở, hoặc hủy phiên cũ trước.");
      return false;
    }
    const validation = Array.from(files ?? []).map(fileError).find(Boolean);
    if (validation) {
      setError(validation);
      return false;
    }
    setFile(file);
    setStatus("Sẵn sàng tải lên");
    setRemaining(Array.from(files ?? []).slice(1));
    setError("");
    return true;
  }
  function persist(value: SavedUpload | null) {
    setSaved(value);
    try {
      value
        ? localStorage.setItem(key, JSON.stringify(value))
        : localStorage.removeItem(key);
    } catch {
      /* Upload still works when browser storage is unavailable. */
    }
  }
  async function start() {
    if (!file || busy || recordingActive) return;
    if (!canChangeSource()) {
      setError(
        "Hãy lưu hoặc bỏ các chỉnh sửa nội dung trước khi thay đổi tệp nguồn.",
      );
      return;
    }
    const validation = fileError(file);
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    const mime = file.type || mimeTypes[file.name.split(".").at(-1)?.toLowerCase() ?? ""];
    if (
      !mime ||
      !["audio/", "video/", "image/"].some((prefix) => mime.startsWith(prefix))
    ) {
      setError("Chọn tệp video, âm thanh hoặc hình ảnh được hỗ trợ.");
      return;
    }
    setBusy(true);
    controller.current = new AbortController();
    const batch = [file, ...remaining];
    try {
      for (let index = 0; index < batch.length; index++) {
        const file = batch[index];
        const mime = file.type || mimeTypes[file.name.split(".").at(-1)?.toLowerCase() ?? ""];
        const validation = fileError(file);
        if (validation) throw new Error(validation);
        setFile(file);
        setStatus("Đang tải lên: " + file.name);
        setRemaining(batch.slice(index + 1));
        let session = index === 0 ? saved : null;
        if (!session) {
          const created = await api.request<Upload>("/uploads/init", {
            method: "POST",
            body: {
              project_id: project.project_id,
              file_name: file.name,
              mime_type: mime,
              expected_size_bytes: file.size,
            },
            signal: controller.current.signal,
          });
          session = {
            id: created.upload_id,
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
          };
          persist(session);
        }
        await uploadChunks(
          api,
          session.id,
          file,
          controller.current.signal,
          setProgress,
        );
        controller.current.signal.throwIfAborted();
        setStatus("Đang hoàn tất tệp: " + file.name);
        await api.request<Media>(`/uploads/${session.id}/complete`, {
          method: "POST",
          signal: controller.current.signal,
        });
        persist(null);
        setSavedRecording(file);
        setFile(batch[index + 1] ?? null);
        setRemaining(batch.slice(index + 2));
        setProgress(0);
        onComplete();
        setStatus("Đã tải lên: " + file.name);
        notice("Đã tải tệp lên.");
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") setStatus("Đã tạm dừng");
      else { setStatus("Tải lên thất bại"); setError(message(error)); }
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (canceling) return;
    controller.current?.abort();
    setCanceling(true);
    setStatus("Đang hủy phiên…");
    try {
      if (saved)
        await api.request("/uploads/" + saved.id, { method: "DELETE" });
      persist(null);
      setFile(null);
      setRemaining([]);
      setProgress(0);
      setError("");
      setStatus("Đã hủy phiên");
    } catch (error) {
      setError(message(error));
      setStatus("Hủy phiên thất bại");
    } finally {
      setCanceling(false);
    }
  }
  return (
    <div className="card upload-card">
      {project.can_edit && project.project_type !== "VIDEO" && project.project_type !== "IMAGE" && <RecordingPanel
        onSelect={recorded => choose([recorded])}
        onDiscard={recorded => {
          if (file === recorded && !saved) {
            setFile(null);
            setStatus("");
          }
        }}
        onDirty={onRecordingDirty} onActive={setRecordingActive} savedFile={savedRecording}
        disabled={busy || !!saved} maxBytes={capabilities.data?.max_upload_bytes ?? 100 * 1024 * 1024}
        language={project.language_code}
      />}
      <h3>{saved ? "Tiếp tục tải tệp" : "Tải tệp lên"}</h3>
      <input
        type="file"
        multiple
        ref={input}
        className="sr-only"
        aria-label="Tệp nguồn từ máy tính"
        tabIndex={-1}
        accept={extensions.map(extension => "." + extension).join(",")}
        disabled={busy || recordingActive}
        onChange={(event) => {
          choose(event.target.files);
          event.target.value = "";
        }}
      />
      <div
        className={"upload-drop " + (drag ? "drag" : "")}
        role="group"
        aria-label="Kéo thả hoặc chọn tệp nguồn"
        aria-disabled={busy || recordingActive}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy && !recordingActive) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          choose(event.dataTransfer.files);
        }}
      >
        <UploadCloud size={27} />
        <strong>{file?.name ?? saved?.name ?? "Kéo thả tệp vào đây"}</strong>
        <button
          type="button"
          className="button secondary small"
          disabled={busy || recordingActive}
          onClick={() => input.current?.click()}
        >
          <FolderOpen size={16} />
          Chọn tệp từ máy tính
        </button>
        <small>
          {saved
            ? "Chọn lại đúng tệp để tiếp tục"
            : extensions.map(extension => extension.toUpperCase()).join(", ")}
          {capabilities.data &&
            " · tối đa " + bytes(capabilities.data.max_upload_bytes)}
        </small>
      </div>
      {remaining.length > 0 && <ul className="muted small-text">{remaining.map((item, index) => <li key={index}>{item.name}</li>)}</ul>}
      {saved && !file && (
        <p className="muted small-text">
          Phiên tải dở được giữ lại. Chọn lại tệp gốc để tiếp tục.
        </p>
      )}
      {error && <ErrorBox error={error} />}{" "}
      {(busy || progress > 0) && (
        <>
          <div className="progress" role="progressbar" aria-label="Tiến độ tải tệp" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ width: progress + "%" }} />
          </div>
          <p className="small-text muted">Đã tải {progress}%</p>
        </>
      )}
      <p className="small-text muted" role="status">{canceling ? "Đang hủy phiên…" : status || (saved ? "Phiên tải đang tạm dừng" : "Chưa chọn tệp")}</p>
      <div className="row-actions">
        {busy ? (
          <button
            className="button secondary small"
            onClick={() => controller.current?.abort()}
            disabled={canceling}
          >
            <Pause size={15} />
            Tạm dừng
          </button>
        ) : (
          <button className="button small" onClick={start} disabled={!file || recordingActive}>
            {saved ? "Tiếp tục" : "Tải lên"}
          </button>
        )}
        {saved && (
          <button className="button secondary small" onClick={cancel} disabled={canceling}>
            <X size={15} />
            Hủy phiên
          </button>
        )}
      </div>
    </div>
  );
}
