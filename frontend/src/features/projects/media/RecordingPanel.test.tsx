// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { RecordingPanel } from "./RecordingPanel";
import { browserRecording } from "./recording.test-helpers";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots) await act(() => root.unmount());
  roots.length = 0; document.body.innerHTML = "";
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
async function mount() {
  const host = document.createElement("div"), root = createRoot(host);
  document.body.append(host); roots.push(root);
  const select = vi.fn().mockReturnValue(true), dirty = vi.fn();
  await act(() => root.render(<RecordingPanel onSelect={select} onDirty={dirty} maxBytes={100000} language="vi" disabled={false} />));
  return { host, select, dirty, root };
}
function button(host: HTMLElement, text: string) {
  return [...host.querySelectorAll("button")].find(item => item.textContent?.trim() === text)!;
}
it("shows unsupported browsers without requesting microphone", async () => {
  const browser = browserRecording(); vi.stubGlobal("SpeechRecognition", undefined);
  const { host } = await mount();
  expect(button(host, "Bắt đầu thu").disabled).toBe(true);
  expect(host.textContent).toContain("Chrome/Edge");
  expect(browser.microphone).not.toHaveBeenCalled();
});
it("renders live text then prepares the actual recorded file for the existing upload", async () => {
  const browser = browserRecording(), { host, select, dirty } = await mount();
  expect(browser.microphone).not.toHaveBeenCalled();
  await act(async () => button(host, "Bắt đầu thu").click());
  await act(() => browser.Speech.instances[0].result([["xin chào", true], ["các bạn", false]]));
  expect(host.textContent).toContain("xin chào");
  expect(host.textContent).toContain("các bạn");
  expect(dirty).toHaveBeenLastCalledWith(true);
  await act(() => button(host, "Dừng thu").click());
  expect(host.querySelector('audio[controls]')).not.toBeNull();
  await act(() => button(host, "Dùng bản thu làm nguồn").click());
  expect(select.mock.calls[0][0]).toBeInstanceOf(File);
  expect(await select.mock.calls[0][0].text()).toBe("recorded-audio");
  expect(host.textContent).toContain("Tải lên");
  expect(host.textContent).toContain("bản nháp");
});
it("preserves a draft when discarding is rejected and revokes preview on unmount", async () => {
  const browser = browserRecording(), { host, root } = await mount();
  const revoke = vi.spyOn(URL, "revokeObjectURL");
  await act(async () => button(host, "Bắt đầu thu").click());
  await act(() => browser.Speech.instances[0].result([["nội dung cần giữ", true]]));
  await act(() => button(host, "Dừng thu").click());
  const url = host.querySelector("audio")!.src;
  vi.stubGlobal("confirm", () => false);
  await act(() => button(host, "Bỏ bản thu").click());
  expect(host.querySelector<HTMLTextAreaElement>("textarea")!.value).toContain("nội dung cần giữ");
  await act(() => root.unmount()); roots.pop();
  expect(revoke).toHaveBeenCalledWith(url);
});

it("displays elapsed recording time and retains the duration after stopping", async () => {
  vi.useFakeTimers(); browserRecording(); const { host } = await mount();
  await act(() => button(host, "Bắt đầu thu").click());
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(host.textContent).toContain("Đang thu · 00:00:03");
  await act(() => button(host, "Dừng thu").click());
  expect(host.textContent).toContain("Đã dừng · 00:00:03");
  expect(host.querySelector('audio[aria-label="Nghe lại bản thu"]')).not.toBeNull();
});
