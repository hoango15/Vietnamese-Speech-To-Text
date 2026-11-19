import { useId, useState, type RefObject } from "react";
import { BookmarkPlus, Pencil, Trash2 } from "lucide-react";
import { api } from "../../../shared/api/client";
import { useAction } from "../../../shared/hooks/useAction";
import { useResource } from "../../../shared/hooks/useResource";
import { time } from "../../../shared/lib/format";
import { Empty, ErrorBox, Loading } from "../../../shared/ui/components";
import type { List, Media } from "../../../shared/types";
import "./bookmarks.css";

interface Bookmark {
  bookmark_id: string;
  media_file_id: string;
  timestamp_ms: number;
  note: string;
}
interface Draft { id?: string; seconds: string; note: string }

export function BookmarksPanel({ media, mediaRef, ready }: {
  media: Media;
  mediaRef: RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  ready: boolean;
}) {
  const path = `/projects/${media.project_id}/bookmarks`;
  const resource = useResource<List<Bookmark>>(`${path}?media_file_id=${encodeURIComponent(media.media_file_id)}`), action = useAction();
  const [draft, setDraft] = useState<Draft | null>(null), [error, setError] = useState("");
  const id = useId();
  const maximum = media.duration_ms == null ? 2147483647 : Math.min(media.duration_ms, 2147483647);
  const items = resource.data?.items.filter(item => item.media_file_id === media.media_file_id) ?? [];
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !ready || action.busy) return;
    const seconds = Number(draft.seconds), timestamp = Math.round(seconds * 1000);
    if (!draft.seconds.trim() || !Number.isFinite(seconds) || seconds < 0 || timestamp > maximum || draft.note.length > 2000) {
      setError("Nhập thời điểm hợp lệ trong thời lượng tệp và ghi chú không quá 2.000 ký tự.");
      return;
    }
    setError("");
    await action.run(async () => {
      await api.request(draft.id ? `${path}/${draft.id}` : path, {
        method: draft.id ? "PATCH" : "POST",
        body: { ...(draft.id ? {} : { media_file_id: media.media_file_id }), timestamp_ms: timestamp, note: draft.note },
      });
      setDraft(null);
      resource.reload();
    }, "Đã lưu dấu mốc.");
  }
  return <div className="card bookmarks-panel" aria-label="Dấu mốc cá nhân">
    <div className="section-heading"><h3>Dấu mốc cá nhân</h3></div>
    <p className="muted small-text">Chỉ bạn xem được các ghi chú gắn với tệp này.</p>
    <button className="button secondary small full-width" disabled={!ready || action.busy} onClick={() => {
      const seconds = mediaRef.current?.currentTime;
      if (seconds === undefined || !Number.isFinite(seconds)) { setError("Chờ tệp sẵn sàng để đánh dấu."); return; }
      setError("");
      setDraft({ seconds: String(Math.round(Math.max(0, seconds) * 1000) / 1000), note: "" });
    }}><BookmarkPlus size={16} />Đánh dấu thời điểm hiện tại</button>
    {error && <ErrorBox error={error} />}
    {draft && <form className="bookmark-form" onSubmit={save}>
      <label htmlFor={`${id}-time`}>Thời điểm (giây)
        <input id={`${id}-time`} name="timestamp" type="number" min="0" max={maximum / 1000} step="0.001" required
          value={draft.seconds} disabled={action.busy || !ready} onChange={event => setDraft({ ...draft, seconds: event.target.value })} />
      </label>
      <label htmlFor={`${id}-note`}>Ghi chú
        <textarea id={`${id}-note`} name="note" rows={3} maxLength={2000} value={draft.note} disabled={action.busy || !ready}
          onChange={event => setDraft({ ...draft, note: event.target.value })} />
      </label>
      <div className="row-actions">
        <button type="submit" className="button small" disabled={action.busy || !ready}>{action.busy ? "Đang lưu…" : "Lưu dấu mốc"}</button>
        <button type="button" className="button secondary small" disabled={action.busy} onClick={() => { setDraft(null); setError(""); }}>Hủy</button>
      </div>
    </form>}
    {resource.loading ? <Loading /> : resource.error ? <ErrorBox error={resource.error} retry={resource.reload} />
      : items.length ? <ul className="bookmark-list">
        {items.map(item => <li key={item.bookmark_id}>
          <div className="bookmark-heading">
            <button className="text-link" aria-label={`Mở dấu mốc tại ${time(item.timestamp_ms)}`} disabled={!ready} onClick={() => {
              if (mediaRef.current) { mediaRef.current.currentTime = item.timestamp_ms / 1000; mediaRef.current.focus(); }
            }}>{time(item.timestamp_ms)}</button>
            <div className="row-actions">
              <button className="icon-button" aria-label={`Sửa dấu mốc tại ${time(item.timestamp_ms)}`} disabled={action.busy || !ready}
                onClick={() => { setError(""); setDraft({ id: item.bookmark_id, seconds: String(item.timestamp_ms / 1000), note: item.note }); }}><Pencil size={15} /></button>
              <button className="icon-button danger" aria-label={`Xóa dấu mốc tại ${time(item.timestamp_ms)}`} disabled={action.busy || !ready} onClick={() => {
                if (confirm("Xóa dấu mốc này?")) action.run(async () => {
                  await api.request(`${path}/${item.bookmark_id}`, { method: "DELETE" });
                  if (draft?.id === item.bookmark_id) setDraft(null);
                  resource.reload();
                }, "Đã xóa dấu mốc.");
              }}><Trash2 size={15} /></button>
            </div>
          </div>
          {item.note && <p className="bookmark-note">{item.note}</p>}
        </li>)}
      </ul> : <Empty title="Chưa có dấu mốc" description="Đánh dấu trong lúc nghe để quay lại đoạn quan trọng." />}
  </div>;
}
