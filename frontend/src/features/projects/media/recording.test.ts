// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { RecordingSession, recordingSupported, type RecordingState } from "./recording";
import { browserRecording } from "./recording.test-helpers";

const sessions: RecordingSession[] = [];
afterEach(() => {
  sessions.forEach(session => session.dispose()); sessions.length = 0;
  vi.useRealTimers(); vi.unstubAllGlobals();
});
function session(maxBytes = 100000) {
  let state: RecordingState;
  const current = new RecordingSession("vi-VN", maxBytes, next => { state = next; });
  sessions.push(current);
  return { current, state: () => state! };
}
it("replaces interim results, deduplicates finals and retains them across speech sessions", async () => {
  vi.useFakeTimers();
  const browser = browserRecording(), { current, state } = session();
  await current.start();
  const speech = browser.Speech.instances[0];
  speech.result([["xin", false]]);
  expect(state().interim).toBe("xin");
  speech.result([["xin chào", true], ["các", false]]);
  speech.result([["xin chào", true], ["các bạn", false]], 1);
  expect(state().text).toBe("xin chào");
  expect(state().interim).toBe("các bạn");
  speech.onend?.();
  await vi.advanceTimersByTimeAsync(300);
  browser.Speech.instances.at(-1)!.result([["hôm nay", true]]);
  expect(state().text).toBe("xin chào các bạn hôm nay");
  current.stop();
  expect(state().phase).toBe("stopped");
  expect(state().file?.name).toMatch(/\.weba$/);
  expect(await state().file!.text()).toBe("recorded-audio");
  expect(browser.tracks[0].stop).toHaveBeenCalled();
});
it("stops a microphone granted after cancellation without creating a recorder", async () => {
  const browser = browserRecording();
  let resolve!: (stream: MediaStream) => void;
  browser.microphone.mockReturnValue(new Promise<MediaStream>(done => { resolve = done; }));
  const { current, state } = session();
  const start = current.start(); current.stop(); resolve(browser.stream); await start;
  expect(state().phase).toBe("stopped");
  expect(state().file).toBeNull();
  expect(browser.tracks[0].stop).toHaveBeenCalledOnce();
  expect(browser.Recorder.instances).toHaveLength(0);
});
it("keeps audio and confirmed text when recognition loses network", async () => {
  const browser = browserRecording(), { current, state } = session();
  await current.start();
  browser.Speech.instances[0].result([["nội dung", true]]);
  browser.Speech.instances[0].onerror?.({ error: "network" });
  expect(state().speechError).toContain("mạng");
  expect(state().phase).toBe("recording");
  current.stop();
  expect(state().text).toBe("nội dung");
  expect(state().file!.size).toBeGreaterThan(0);
});
it("bounds silent speech restarts and stops at the recording time limit", async () => {
  vi.useFakeTimers();
  const browser = browserRecording(), { current, state } = session();
  await current.start();
  for (let i = 0; i < 5; i++) {
    browser.Speech.instances.at(-1)!.onend?.();
    await vi.advanceTimersByTimeAsync(300);
  }
  expect(state().speechError).toContain("nhận dạng");
  expect(browser.Speech.instances.length).toBeLessThanOrEqual(4);
  await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
  expect(state().phase).toBe("stopped");
  expect(state().error).toContain("giới hạn");
});
it("stops when chunks reach the byte limit and ignores callbacks after disposal", async () => {
  vi.useFakeTimers();
  const browser = browserRecording(), { current, state } = session(3);
  await current.start();
  browser.Recorder.instances[0].ondataavailable?.({ data: new Blob(["1234"]) });
  expect(state().phase).toBe("stopped");
  expect(state().error).toContain("dung lượng");
  const previous = state(), late = browser.Speech.instances[0].onresult;
  current.dispose();
  late?.({ resultIndex: 0, results: [{ 0: { transcript: "late" }, isFinal: true, length: 1 }] });
  await vi.advanceTimersByTimeAsync(5000);
  expect(state()).toBe(previous);
  expect(vi.getTimerCount()).toBe(0);
});
it("reports denied microphone permission and unsupported browsers", async () => {
  const browser = browserRecording(), { current, state } = session();
  browser.microphone.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
  await current.start();
  expect(state().phase).toBe("stopped");
  expect(state().error).toContain("quyền micro");
  vi.stubGlobal("SpeechRecognition", undefined);
  expect(recordingSupported()).toBe(false);
});
it("ends recognition and timers if MediaRecorder stops without a user click", async () => {
  vi.useFakeTimers();
  const browser = browserRecording(), { current, state } = session();
  await current.start();
  browser.Recorder.instances[0].stop();
  const stopped = state();
  await vi.advanceTimersByTimeAsync(5000);
  expect(state().phase).toBe("stopped");
  expect(state().seconds).toBe(stopped.seconds);
  expect(vi.getTimerCount()).toBe(0);
  expect(browser.Speech.instances[0].onresult).toBeNull();
});
it("keeps recording if constructing the speech service fails", async () => {
  const browser = browserRecording();
  vi.stubGlobal("SpeechRecognition", class { constructor() { throw new Error("service unavailable"); } });
  const { current, state } = session();
  await current.start();
  expect(state().phase).toBe("recording");
  expect(state().speechError).toContain("nhận dạng");
  expect(browser.tracks[0].stop).not.toHaveBeenCalled();
  current.stop();
  expect(state().file!.size).toBeGreaterThan(0);
});
