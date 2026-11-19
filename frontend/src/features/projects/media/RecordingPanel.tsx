import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { ErrorBox } from "../../../shared/ui/components";
import { bytes, time } from "../../../shared/lib/format";
import { RecordingSession, recordingSupported, type RecordingState } from "./recording";

const empty: RecordingState = { phase: "idle", text: "", interim: "", seconds: 0, file: null, error: "", speechError: "" };

export function RecordingPanel({ onSelect, onDiscard, onDirty, onActive, maxBytes, language, disabled, savedFile }: {
  onSelect: (file: File) => boolean;
  onDiscard?: (file: File | null) => void;
  onDirty?: (dirty: boolean) => void;
  onActive?: (active: boolean) => void;
  maxBytes: number;
  language: string;
  disabled: boolean;
  savedFile?: File | null;
}) {
  const [state, setState] = useState(empty), [preview, setPreview] = useState(""),
    [textUrl, setTextUrl] = useState(""), [draft, setDraft] = useState<string | null>(null),
    [downloadedText, setDownloadedText] = useState(""), [downloadedAudio, setDownloadedAudio] = useState(false),
    [selected, setSelected] = useState(false);
  const session = useRef<RecordingSession | null>(null);
  const active = ["requesting", "recording", "stopping"].includes(state.phase);
  const text = draft ?? [state.text, state.interim].filter(Boolean).join(" ");
  const limit = Math.min(maxBytes, 100 * 1024 * 1024);
  const dirty = active || !!(state.file && !downloadedAudio && state.file !== savedFile) || !!(text && text !== downloadedText);
  const supported = recordingSupported();
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  useEffect(() => { onActive?.(active); return () => onActive?.(false); }, [active, onActive]);
  useEffect(() => () => session.current?.dispose(), []);
  useEffect(() => {
    if (!state.file) { setPreview(""); return; }
    const url = URL.createObjectURL(state.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [state.file]);
  useEffect(() => {
    if (active || !text) { setTextUrl(""); return; }
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    setTextUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [active, text]);
  function reset() {
    if (dirty && !confirm("Bỏ bản thu và chữ chưa lưu? Hãy tải xuống trước nếu cần giữ lại.")) return;
    session.current?.dispose(); session.current = null;
    onDiscard?.(state.file);
    setState(empty); setDraft(null); setDownloadedText(""); setDownloadedAudio(false); setSelected(false);
  }
  function start() {
    if (disabled || active || session.current) return;
    const current = new RecordingSession(language === "en" ? "en-US" : language === "vi" || language === "auto" ? "vi-VN" : language,
      limit, setState);
    session.current = current;
    void current.start();
  }
  return <section className="recording-panel" aria-label="Thu âm trực tiếp">
    <h3><Mic size={17} /> Thu âm trực tiếp</h3>
    <p className="small-text muted">Chữ hiện khi nói qua dịch vụ nhận dạng của trình duyệt, có thể gửi âm thanh tới nhà cung cấp Chrome/Edge. Cần Internet và quyền micro; chỉ bắt đầu khi bạn bấm nút.</p>
    <p className="small-text muted">Tối đa 60 phút hoặc {bytes(limit)}. Chữ trực tiếp là bản nháp trên trình duyệt, chưa lưu vào dự án. Tải TXT để giữ lại.</p>
    {!supported && <p role="status">Dùng Chrome/Edge có nhận dạng giọng nói, micro và địa chỉ localhost hoặc HTTPS.</p>}
    <div className="row-actions">
      {state.phase === "idle" ? <button type="button" className="button secondary small" disabled={disabled || !supported} onClick={start}><Mic size={15} />Bắt đầu thu</button>
        : active ? <button type="button" className="button secondary small" disabled={state.phase === "stopping"} onClick={() => session.current?.stop()}><Square size={15} />{state.phase === "requesting" ? "Hủy mở micro" : "Dừng thu"}</button>
        : <button type="button" className="button secondary small" disabled={disabled} onClick={reset}>Bỏ bản thu</button>}
      <span className="small-text" role="status">{state.phase === "requesting" ? "Đang chờ quyền micro…" : state.phase === "recording" ? "Đang thu · " + time(state.seconds * 1000) : state.phase === "stopping" ? "Đang hoàn tất…" : state.phase === "stopped" ? "Đã dừng · " + time(state.seconds * 1000) : "Chưa thu âm"}</span>
    </div>
    {active && <div className="recording-live" role="log" aria-label="Chữ đang nhận dạng" aria-live="polite" aria-atomic="true">
      {state.text}<span className="muted">{state.interim && " " + state.interim}</span>
      {!text && <span className="muted">{state.phase === "recording" ? "Hãy nói để nhận chữ…" : "Chưa có chữ nhận dạng."}</span>}
    </div>}
    {state.error && <ErrorBox error={state.error} />}
    {state.speechError && <ErrorBox error={state.speechError} />}
    {state.phase === "stopped" && <>
      <label className="stack">Chữ trực tiếp (bản nháp)
        <textarea aria-label="Chữ trực tiếp (bản nháp)" rows={6} value={text} onChange={event => setDraft(event.target.value)} placeholder="Chưa nhận được chữ. Bạn vẫn có thể tải âm thanh lên để xử lý." />
      </label>
      {preview && <audio controls preload="metadata" src={preview} aria-label="Nghe lại bản thu" />}
      <div className="row-actions">
        {preview && <a className="button secondary small" href={preview} download={state.file!.name} onClick={() => setDownloadedAudio(true)}>Tải âm thanh</a>}
        {textUrl && <a className="button secondary small" href={textUrl} download="thu-am-truc-tiep.txt" onClick={() => setDownloadedText(text)}>Tải TXT</a>}
        <button type="button" className="button small" disabled={disabled || !state.file} onClick={() => {
          if (state.file && onSelect(state.file)) setSelected(true);
        }}>Dùng bản thu làm nguồn</button>
      </div>
      {selected && <p role="status" className="small-text">Đã chọn bản thu. Bấm Tải lên ở dưới để lưu âm thanh vào dự án. Chữ trực tiếp vẫn là bản nháp, hãy tải TXT.</p>}
      <p className="small-text muted">Để có bản ghi có thời gian, phụ đề hoặc biên bản, tải âm thanh lên rồi chạy xử lý. Nhận dạng máy chủ có thể cho nội dung khác chữ trực tiếp.</p>
    </>}
  </section>;
}
