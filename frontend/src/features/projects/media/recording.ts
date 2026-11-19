export interface RecordingState {
  phase: "idle" | "requesting" | "recording" | "stopping" | "stopped";
  text: string;
  interim: string;
  seconds: number;
  file: File | null;
  error: string;
  speechError: string;
}
interface SpeechResult { isFinal: boolean; [index: number]: { transcript: string } }
interface Speech {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
function speechConstructor(): (new () => Speech) | undefined {
  const browser = globalThis as typeof globalThis & { SpeechRecognition?: new () => Speech; webkitSpeechRecognition?: new () => Speech };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}
function recordingMime() {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
    .find(type => globalThis.MediaRecorder?.isTypeSupported(type));
}
export function recordingSupported() {
  return !!(globalThis.isSecureContext && typeof globalThis.navigator?.mediaDevices?.getUserMedia === "function" && speechConstructor() && recordingMime());
}
export class RecordingSession {
  private state: RecordingState = { phase: "idle", text: "", interim: "", seconds: 0, file: null, error: "", speechError: "" };
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private speech?: Speech;
  private chunks: Blob[] = [];
  private bytes = 0;
  private disposed = false;
  private speechFailed = false;
  private restarts = 0;
  private prefix = "";
  private timer?: ReturnType<typeof setInterval>;
  private restart?: ReturnType<typeof setTimeout>;
  private speechTimeout?: ReturnType<typeof setTimeout>;

  constructor(private language: string, private maxBytes: number, private changed: (state: RecordingState) => void) {}
  private update(patch: Partial<RecordingState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.changed(this.state);
  }
  private requesting() { return this.state.phase === "requesting"; }
  async start() {
    if (this.disposed || this.state.phase !== "idle") return;
    if (!recordingSupported()) {
      this.update({ phase: "stopped", error: "Thu âm có chữ trực tiếp cần Chrome/Edge, micro và localhost hoặc HTTPS." });
      return;
    }
    this.update({ phase: "requesting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (this.disposed || !this.requesting()) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this.stream = stream;
      const recorder = this.recorder = new MediaRecorder(stream, { mimeType: recordingMime(), audioBitsPerSecond: 64000 });
      recorder.ondataavailable = event => {
        if (this.disposed || !event.data.size) return;
        this.chunks.push(event.data);
        this.bytes += event.data.size;
        if (this.bytes >= this.maxBytes && this.state.phase === "recording") {
          this.update({ error: "Đã đạt giới hạn dung lượng. Hãy tải bản thu xuống; chia nhỏ nếu vượt giới hạn máy chủ." });
          this.stop();
        }
      };
      recorder.onstop = () => {
        if (this.disposed) return;
        if (this.state.phase === "recording") this.stop();
        this.releaseTracks();
        const mime = recorder.mimeType;
        const extension = mime.startsWith("audio/webm") ? "weba" : mime.startsWith("audio/ogg") ? "ogg" : "m4a";
        const file = this.bytes ? new File(this.chunks, `thu-am-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`, { type: mime }) : null;
        this.chunks = [];
        this.update({ phase: "stopped", file, ...(!file ? { error: "Không có dữ liệu âm thanh. Kiểm tra micro rồi thu lại." } : {}) });
      };
      recorder.onerror = () => {
        this.update({ error: "Trình duyệt gặp lỗi khi ghi âm. Kiểm tra bản thu trước khi sử dụng." });
        this.stop();
      };
      stream.getTracks().forEach(track => { track.onended = () => {
        this.update({ error: "Micro đã ngắt kết nối. Bản thu đã được dừng." });
        this.stop();
      }; });
      recorder.start(1000);
      this.update({ phase: "recording" });
      const started = Date.now();
      this.timer = setInterval(() => {
        const seconds = Math.floor((Date.now() - started) / 1000);
        this.update({ seconds });
        if (seconds >= 3600) {
          this.update({ error: "Đã đạt giới hạn 60 phút. Bản thu đã được dừng." });
          this.stop();
        }
      }, 1000);
      this.startSpeech();
    } catch (error) {
      this.releaseTracks();
      if (this.disposed || !this.requesting()) return;
      const name = (error as Error).name;
      this.update({ phase: "stopped", error: name === "NotAllowedError"
        ? "Chưa được cấp quyền micro. Cho phép micro trong cài đặt trang rồi thử lại."
        : name === "NotFoundError" ? "Không tìm thấy micro. Kết nối micro rồi thử lại."
        : "Không mở được micro. Đóng ứng dụng đang dùng micro rồi thử lại." });
    }
  }
  private startSpeech() {
    if (this.disposed || this.speechFailed || this.state.phase !== "recording") return;
    const Constructor = speechConstructor();
    if (!Constructor) return;
    this.prefix = [this.state.text, this.state.interim].filter(Boolean).join(" ");
    this.update({ text: this.prefix, interim: "" });
    let speech: Speech;
    try { speech = this.speech = new Constructor(); }
    catch {
      this.failSpeech("Không khởi động được nhận dạng trực tiếp; âm thanh vẫn đang được thu.");
      return;
    }
    speech.lang = this.language;
    speech.continuous = true;
    speech.interimResults = true;
    speech.onresult = event => {
      if (this.disposed || this.speech !== speech || this.speechFailed) return;
      const final: string[] = [], interim: string[] = [];
      for (const result of Array.from(event.results)) {
        (result.isFinal ? final : interim).push(result[0].transcript.trim());
      }
      if (final.length || interim.length) this.restarts = 0;
      this.update({ text: [this.prefix, ...final].filter(Boolean).join(" "), interim: interim.join(" ") });
    };
    speech.onerror = event => {
      if (this.disposed || this.speech !== speech || this.state.phase !== "recording") return;
      // A silent recognition cycle may end normally; restart is bounded in onend.
      if (event.error === "no-speech" || event.error === "aborted") return;
      this.failSpeech(event.error === "network" ? "Lỗi mạng: chữ trực tiếp đã ngừng; âm thanh vẫn đang được thu."
        : event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Dịch vụ nhận dạng chưa được cấp quyền; âm thanh vẫn đang được thu."
          : "Dịch vụ nhận dạng đã ngừng; âm thanh vẫn đang được thu.");
    };
    speech.onend = () => {
      if (this.disposed || this.speech !== speech || this.speechFailed || this.state.phase !== "recording") return;
      this.detachSpeech();
      if (++this.restarts > 3) {
        this.failSpeech("Không duy trì được nhận dạng trực tiếp; âm thanh vẫn đang được thu.");
      } else this.restart = setTimeout(() => this.startSpeech(), 250);
    };
    try { speech.start(); }
    catch { this.failSpeech("Không khởi động được nhận dạng trực tiếp; âm thanh vẫn đang được thu."); }
  }
  private failSpeech(speechError: string) {
    this.speechFailed = true;
    this.update({ speechError });
    this.detachSpeech();
  }
  private detachSpeech() {
    const speech = this.speech;
    this.speech = undefined;
    if (!speech) return;
    speech.onresult = speech.onerror = speech.onend = null;
    try { speech.abort(); } catch { /* Already ended. */ }
  }
  private releaseTracks() {
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.stream = undefined;
  }
  stop() {
    if (this.disposed || !["recording", "requesting"].includes(this.state.phase)) return;
    const requesting = this.state.phase === "requesting";
    this.update({ phase: requesting ? "stopped" : "stopping" });
    clearInterval(this.timer);
    clearTimeout(this.restart);
    try { this.speech?.stop(); } catch { this.detachSpeech(); }
    // Allow the service's final result after stop, then release its connection.
    this.speechTimeout = setTimeout(() => this.detachSpeech(), 1000);
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
      else this.update({ phase: "stopped" });
    } catch {
      this.update({ phase: "stopped", error: "Không hoàn tất được bản thu. Hãy kiểm tra micro rồi thử lại." });
    }
    this.releaseTracks();
  }
  dispose() {
    this.disposed = true;
    clearInterval(this.timer); clearTimeout(this.restart); clearTimeout(this.speechTimeout);
    this.detachSpeech();
    if (this.recorder) {
      this.recorder.ondataavailable = this.recorder.onstop = this.recorder.onerror = null;
      try { if (this.recorder.state !== "inactive") this.recorder.stop(); } catch { /* Already stopped. */ }
    }
    this.releaseTracks(); this.chunks = [];
  }
}
