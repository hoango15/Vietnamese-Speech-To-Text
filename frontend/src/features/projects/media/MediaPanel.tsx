import { useEffect, useRef, useState, type RefObject } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDownToLine, Play, RotateCw, Trash2, UploadCloud } from "lucide-react";
import { api } from "../../../shared/api/client";
import { message } from "../../../shared/lib/errors";
import type { Media, Project } from "../../../shared/types";
import { bytes, date, time } from "../../../shared/lib/format";
import { ErrorBox, Loading } from "../../../shared/ui/components";
import { ProcessPanel } from "./ProcessPanel";
import { useAction } from "../../../shared/hooks/useAction";
import { BookmarksPanel } from "../bookmarks/BookmarksPanel";

export function MediaPanel({ project, media, loading, error, reload, disabled = false, onProcessed, mediaRef }: {
  project: Project;
  media: Media[];
  loading: boolean;
  error: string;
  reload: () => void;
  disabled?: boolean;
  onProcessed?: () => void;
  mediaRef?: RefObject<HTMLVideoElement | HTMLAudioElement | null>;
}) {
  const [params, setParams] = useSearchParams();
  const ownMediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const playerRef = mediaRef ?? ownMediaRef;
  const [readyMedia, setReadyMedia] = useState<string | null>(null);
  const selected = params.get("media") ?? "";
  const [source, setSource] = useState<{ id: string; url: string } | null>(null),
    [blobLoading, setBlobLoading] = useState(false),
    [blobError, setBlobError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [rotation, setRotation] = useState(0),
    action = useAction();
  const sources = media.filter(item => item.media_kind_code.startsWith("ORIGINAL_"));
  const current = sources.find(item => item.media_file_id === selected) ?? sources.find(item => item.is_current) ?? sources[0];
  const url = source?.id === current?.media_file_id ? source?.url : "";
  useEffect(() => {
    if (loading || error) setReadyMedia(null);
  }, [loading, error]);
  useEffect(() => {
    setSource(null);
    setBlobError("");
    setReadyMedia(null);
    setRotation(0);
    if (!current) return;
    const controller = new AbortController();
    let objectUrl = "";
    let renewal: ReturnType<typeof setTimeout> | undefined;
    setBlobLoading(true);
    const load = async () => {
      try {
        let url: string;
        if (current.mime_type.startsWith("image/")) {
          const blob = await api.blob(`/media/${current.media_file_id}/download`, { signal: controller.signal });
          if (controller.signal.aborted) return;
          url = objectUrl = URL.createObjectURL(blob);
        } else {
          const playback = await api.request<{ url: string; expires_in: number }>(`/media/${current.media_file_id}/playback`, { method: "POST", signal: controller.signal });
          if (controller.signal.aborted) return;
          const expected = `/api/media/${encodeURIComponent(current.media_file_id)}/stream`;
          if (playback.url !== expected) throw new Error("Đường dẫn phát media không hợp lệ.");
          url = playback.url;
          renewal = setTimeout(load, Math.max(1000, (playback.expires_in || 300) * 800));
        }
        setSource({ id: current.media_file_id, url });
      } catch (error) {
        if (!controller.signal.aborted) setBlobError(message(error));
      } finally {
        if (!controller.signal.aborted) setBlobLoading(false);
      }
    };
    void load();
    return () => {
      controller.abort();
      if (renewal) clearTimeout(renewal);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [current?.media_file_id, attempt]);
  return <div className="card media-card" id="source-player">
    <div className="section-heading"><h2>Nội dung nguồn</h2><span className="badge">{project.language_code.toUpperCase()}</span></div>
    {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : !current ? <div className="source-empty">
      <UploadCloud size={32} /><p>Thêm tệp để bắt đầu</p><small>Video, âm thanh hoặc hình ảnh</small>
    </div> : <>
      <select className="media-select" aria-label="Chọn tệp xem trước" disabled={disabled || action.busy} value={current.media_file_id} onChange={event => {
        const id = event.target.value;
        setParams(previous => { const next = new URLSearchParams(previous); next.set("media", id); return next; });
      }}>
        {sources.map(item => <option value={item.media_file_id} key={item.media_file_id}>{item.file_name}</option>)}
      </select>
            {blobLoading ? (
              <Loading />
            ) : blobError ? (
              <ErrorBox error={blobError} retry={() => setAttempt(value => value + 1)} />
            ) : url && current ? (
              <div className="media-preview">
                {current.mime_type.startsWith("image/") ? (
                  <>
                    <img
                      style={{ transform: `rotate(${rotation}deg)` }}
                      src={url}
                      alt={current.file_name}
                    />
                    <button
                      className="button secondary small"
                      onClick={() => setRotation((n) => (n + 90) % 360)}
                    >
                      <RotateCw size={15} />
                      Xoay ảnh
                    </button>
                  </>
                ) : current.mime_type.startsWith("video/") ? (
                  <video
                    key={current.media_file_id}
                    ref={element => { playerRef.current = element; }}
                    controls
                    src={url}
                    preload="metadata"
                    aria-label="Video nguồn"
                    onLoadedMetadata={event => {
                      setReadyMedia(current.media_file_id);
                      const at = Number(params.get("t"));
                      if (params.has("t") && Number.isFinite(at) && at >= 0) event.currentTarget.currentTime = at / 1000;
                    }}
                    onEmptied={() => setReadyMedia(null)}
                    onError={() => setBlobError("Không phát được video. Hãy thử lại hoặc tải tệp xuống.")}
                  />
                ) : (
                  <div className="audio-player">
                    <div className="audio-art">
                      <Play size={28} />
                    </div>
                    <audio
                      key={current.media_file_id}
                      ref={element => { playerRef.current = element; }}
                      controls
                      src={url}
                      preload="metadata"
                      aria-label="Âm thanh nguồn"
                      onLoadedMetadata={event => {
                        setReadyMedia(current.media_file_id);
                        const at = Number(params.get("t"));
                        if (params.has("t") && Number.isFinite(at) && at >= 0) event.currentTarget.currentTime = at / 1000;
                      }}
                      onEmptied={() => setReadyMedia(null)}
                      onError={() => setBlobError("Không phát được âm thanh. Hãy thử lại hoặc tải tệp xuống.")}
                    />
                  </div>
                )}
              </div>
            ) : null}
      <div className="media-info">
        <strong>{current.file_name}</strong>
        <small>{bytes(current.file_size_bytes)}
          {!current.mime_type.startsWith("image/") && " · " + (current.duration_ms > 0 ? time(current.duration_ms) : "Chưa có thời lượng")}
          {" · " + date(current.created_at)}
        </small>
      </div>
      <div className="row-actions">
        <button className="button secondary small" disabled={action.busy} onClick={() =>
          action.run(() => api.download(`/media/${current.media_file_id}/download`, current.file_name))}>
          <ArrowDownToLine size={15} />Tải xuống
        </button>
        {project.can_manage && <button className="icon-button danger" aria-label="Xóa tệp nguồn"
          disabled={disabled || action.busy} onClick={() => {
            if (!confirm("Xóa tệp này? Các kết quả liên quan có thể không còn nguồn để phát.")) return;
            action.run(async () => {
              await api.request(`/media/${current.media_file_id}`, { method: "DELETE" });
              setParams(previous => {
                const next = new URLSearchParams(previous);
                if (next.get("media") === current.media_file_id) next.delete("media");
                return next;
              });
              reload();
            }, "Đã xóa tệp.");
          }}><Trash2 size={16} /></button>}
      </div>
      <ProcessPanel key={current.media_file_id} project={project} media={current} disabled={disabled || action.busy} onComplete={onProcessed ?? reload} />
      {(current.media_kind_code === "ORIGINAL_AUDIO" || current.media_kind_code === "ORIGINAL_VIDEO") && <BookmarksPanel
        key={`bookmarks:${current.media_file_id}`} media={current} mediaRef={playerRef}
        ready={readyMedia === current.media_file_id && Boolean(url) && !blobLoading && !blobError}
      />}
    </>}
  </div>;
}
