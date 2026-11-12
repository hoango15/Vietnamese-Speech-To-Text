import { vi } from "vitest";

export function browserRecording() {
  const tracks = [{ stop: vi.fn(), onended: null as (() => void) | null }];
  const stream = { getTracks: () => tracks } as unknown as MediaStream;
  const microphone = vi.fn().mockResolvedValue(stream);
  class Recorder {
    static instances: Recorder[] = [];
    static isTypeSupported = () => true;
    state = "inactive";
    mimeType = "audio/webm;codecs=opus";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() { Recorder.instances.push(this); }
    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["recorded-audio"], { type: this.mimeType }) });
      this.onstop?.();
    }
  }
  class Speech {
    static instances: Speech[] = [];
    lang = "";
    continuous = false;
    interimResults = false;
    onresult: ((event: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    start = vi.fn();
    stop = vi.fn();
    abort = vi.fn();
    constructor() { Speech.instances.push(this); }
    result(items: [string, boolean][], resultIndex = 0) {
      this.onresult?.({ resultIndex, results: items.map(([transcript, isFinal]) => ({ 0: { transcript }, length: 1, isFinal })) });
    }
  }
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: microphone } });
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("SpeechRecognition", Speech);
  vi.stubGlobal("webkitSpeechRecognition", undefined);
  return { microphone, tracks, stream, Recorder, Speech };
}
