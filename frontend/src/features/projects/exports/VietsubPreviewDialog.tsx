import { useEffect, useState } from "react";
import { api } from "../../../shared/api/client";
import { message } from "../../../shared/lib/errors";
import { ErrorBox, Loading, Modal } from "../../../shared/ui/components";

export function VietsubPreviewDialog({ projectId, mediaId, transcriptId, width, speakers, onClose }: {
  projectId: string; mediaId: string; transcriptId: string; width: number; speakers: boolean; onClose: () => void;
}) {
  const [urls, setUrls] = useState({ video: "", captions: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let videoUrl = "", captionsUrl = "";
    setLoading(true); setError(""); setUrls({ video: "", captions: "" });
    Promise.all([
      api.blob(`/media/${mediaId}/download`, { signal: controller.signal }),
      api.blob(`/projects/${projectId}/subtitles/preview?max_chars_per_line=${width}&includes_speaker_label=${speakers}&transcript_id=${transcriptId}&media_file_id=${mediaId}`, { signal: controller.signal }),
    ]).then(([video, captions]) => {
      if (controller.signal.aborted) return;
      videoUrl = URL.createObjectURL(video);
      captionsUrl = URL.createObjectURL(captions);
      setUrls({ video: videoUrl, captions: captionsUrl });
    }).catch(error => {
      if (controller.signal.aborted) return;
      setError(message(error)); setLoading(false); controller.abort();
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => {
      controller.abort();
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (captionsUrl) URL.revokeObjectURL(captionsUrl);
    };
  }, [projectId, mediaId, transcriptId, width, speakers, attempt]);
  return <Modal title="Xem trước Vietsub" onClose={onClose}>
    <p className="muted">Phụ đề lấy từ bản chép lời đã lưu. Bản xem trước dùng trình phát; video xuất có phụ đề gắn trực tiếp.</p>
    {error ? <ErrorBox error={error} retry={() => setAttempt(n => n + 1)} /> : loading ? <Loading /> : <video className="vietsub-preview-video" controls preload="metadata" src={urls.video} aria-label="Video xem trước Vietsub">
      <track key={urls.captions} kind="subtitles" src={urls.captions} srcLang="vi" label="Tiếng Việt" default onLoad={event => { event.currentTarget.track.mode = "showing"; }} />
    </video>}
  </Modal>;
}
