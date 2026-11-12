// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../../shared/api/client";
import type { Project } from "../../../shared/types";
import { NoticeProvider } from "../../../shared/ui/NoticeProvider";
import { UploadPanel } from "./UploadPanel";
import { browserRecording } from "./recording.test-helpers";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
const project: Project = { project_id: "p1", project_title: "Nguồn của tôi", project_description: "", language_code: "vi", project_scope: "PERSONAL", project_type: "VIDEO", project_status_code: "DRAFT", owner_user_id: "owner", owner_name: "Chủ dự án", member_count: 1, can_edit: true, can_manage: true, deleted_at: null, created_at: "2026-11-12", updated_at: "2026-11-12" };
type Request = { url: string; method: string; body: unknown; headers: Headers };
afterEach(async () => {
  for (const root of roots.splice(0)) await act(() => root.unmount());
  document.body.innerHTML = ""; localStorage.clear(); api.setSession(null); vi.unstubAllGlobals();
});
async function mount(kind: Project["project_type"] = "VIDEO", maxBytes = 1024) {
  let offset = 0, count = 0, size = 0;
  const requests: Request[] = [], completed = vi.fn(), onUploading = vi.fn();
  vi.stubGlobal("fetch", async (url: string, options: RequestInit = {}) => {
    const method = options.method ?? "GET";
    const body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
    requests.push({ url, method, body, headers: new Headers(options.headers) });
    if (url === "/api/system/capabilities") return Response.json({ asr: false, ocr: false, diarization: false, llm: false, asr_model: "", max_upload_bytes: maxBytes });
    if (url === "/api/uploads/init") { offset = 0; count++; size = body.expected_size_bytes; }
    if (method === "PATCH") offset += (body as Blob).size;
    if (url.endsWith("/complete")) return Response.json({ media_file_id: "m" + count, project_id: "p1", file_name: "source.mp4", mime_type: "video/mp4", media_kind_code: "ORIGINAL_VIDEO", file_size_bytes: size, duration_ms: 1000, is_current: true, created_at: "2026-11-12" });
    return Response.json({ upload_id: "u" + count, uploaded_size_bytes: offset, expected_size_bytes: size, upload_status_code: "UPLOADING" });
  });
  api.setSession(null);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(() => root.render(<NoticeProvider><UploadPanel project={{ ...project, project_type: kind }} canChangeSource={() => true} onComplete={completed} onUploading={onUploading} /></NoticeProvider>));
  return { host, requests, completed, onUploading };
}
function button(host: HTMLElement, text: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === text);
  expect(found, text).toBeDefined(); return found!;
}
async function select(host: HTMLElement, files: File[], method = "picker") {
  const data = new DataTransfer(); files.forEach(file => data.items.add(file));
  await act(() => {
    if (method === "drop") {
      const event = new Event("drop", { bubbles: true, cancelable: true }); Object.defineProperty(event, "dataTransfer", { value: data });
      host.querySelector(".upload-drop")!.dispatchEvent(event);
    } else {
      const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, "files", { value: data.files, configurable: true }); input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}
it.each(["picker", "drop"])("uploads the actual file selected by %s without starting a processing job", async method => {
  const { host, requests, completed } = await mount();
  await select(host, [new File(["clip"], "hop.mp4", { type: "video/mp4" })], method);
  expect(requests.some(item => item.url === "/api/uploads/init")).toBe(false);
  await act(() => button(host, "Tải lên").click());
  expect(requests.find(item => item.url === "/api/uploads/init")?.body).toEqual({ project_id: "p1", file_name: "hop.mp4", mime_type: "video/mp4", expected_size_bytes: 4 });
  expect(await (requests.find(item => item.method === "PATCH")!.body as Blob).text()).toBe("clip");
  expect(completed).toHaveBeenCalledOnce();
  expect(requests.some(item => item.url.includes("/jobs"))).toBe(false);
  expect(host.querySelector(".upload-card")?.textContent).toContain("Đã tải lên");
});
it.each([["VIDEO", ".mp4", ".wav"], ["IMAGE", ".png", ".mp4"], ["AUDIO", ".wav", ".png"], ["LECTURE", ".mp4", ".jpg"]] as const)("rejects incompatible dropped files for %s", async (kind, allowed, rejected) => {
  const { host, requests } = await mount(kind);
  expect(host.querySelector<HTMLInputElement>('input[type="file"]')!.accept.split(",")).toContain(allowed);
  await select(host, [new File(["data"], "wrong" + rejected)], "drop");
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(button(host, "Tải lên").disabled).toBe(true);
  expect(requests.some(item => item.url === "/api/uploads/init")).toBe(false);
});
it.each([new File([], "empty.mp4"), new File([new Uint8Array(1025)], "large.mp4")])("rejects invalid file $name", async file => {
  const { host } = await mount(); await select(host, [file]);
  expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(button(host, "Tải lên").disabled).toBe(true);
});
it("pauses an in-flight chunk and resumes from the server offset", async () => {
  const { host, requests } = await mount("VIDEO", 20 * 1024 * 1024);
  const original = globalThis.fetch;
  let patches = 0;
  vi.stubGlobal("fetch", (url: string, options: RequestInit = {}) => {
    if (options.method === "PATCH" && ++patches === 2) return new Promise<Response>((_resolve, reject) => options.signal!.addEventListener("abort", () => reject(new DOMException("Paused", "AbortError")), { once: true }));
    return original(url, options);
  });
  await select(host, [new File([new Uint8Array(6 * 1024 * 1024)], "large.mp4", { type: "video/mp4" })]);
  await act(() => button(host, "Tải lên").click());
  expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("83");
  await act(() => button(host, "Tạm dừng").click());
  expect(host.querySelector(".upload-card")?.textContent).toContain("Đã tạm dừng");
  expect(localStorage.length).toBe(1);
  await act(() => button(host, "Tiếp tục").click());
  expect(requests.filter(item => item.method === "PATCH").at(-1)?.headers.get("Upload-Offset")).toBe("5242880");
  expect(requests.filter(item => item.url === "/api/uploads/init")).toHaveLength(1);
  expect(host.querySelector(".upload-card")?.textContent).toContain("Đã tải lên");
  expect(localStorage.length).toBe(0);
});
it("keeps selection locked until server cancellation finishes", async () => {
  const { host, onUploading } = await mount();
  const original = globalThis.fetch;
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", (url: string, options: RequestInit = {}) => {
    if (options.method === "PATCH") return new Promise<Response>((_resolve, reject) => options.signal!.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true }));
    if (options.method === "DELETE") return new Promise<Response>(resolve => { finish = resolve; });
    return original(url, options);
  });
  await select(host, [new File(["clip"], "hop.mp4", { type: "video/mp4" })]);
  await act(() => button(host, "Tải lên").click());
  await act(() => button(host, "Hủy phiên").click());
  expect(button(host, "Chọn tệp từ máy tính").disabled).toBe(true);
  expect(host.querySelector(".upload-card")?.textContent).toContain("Đang hủy phiên");
  expect(onUploading.mock.lastCall).toEqual([true]);
  await act(() => finish(Response.json({ ok: true })));
  expect(button(host, "Chọn tệp từ máy tính").disabled).toBe(false);
  expect(onUploading.mock.lastCall).toEqual([false]);
  expect(localStorage.length).toBe(0);
});
it("retains the failed file and remaining batch without reuploading the completed file", async () => {
  const { host, requests, completed } = await mount();
  const original = globalThis.fetch; let inits = 0;
  vi.stubGlobal("fetch", (url: string, options: RequestInit = {}) => url === "/api/uploads/init" && ++inits === 2 ? Promise.resolve(Response.json({ detail: "offline" }, { status: 503 })) : original(url, options));
  await select(host, ["one.mp4", "two.mp4", "three.mp4"].map(name => new File(["clip"], name, { type: "video/mp4" })), "drop");
  await act(() => button(host, "Tải lên").click());
  expect(host.textContent).toContain("two.mp4"); expect(host.textContent).toContain("three.mp4");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("offline");
  await act(() => button(host, "Tải lên").click());
  expect(requests.filter(item => item.url === "/api/uploads/init").map(item => (item.body as { file_name: string }).file_name)).toEqual(["one.mp4", "two.mp4", "three.mp4"]);
  expect(completed).toHaveBeenCalledTimes(3);
});

it("restores a saved upload after reopening and sends only the missing bytes", async () => {
  const file = new File(["abcd"], "hop.mp4", { type: "video/mp4", lastModified: 123 });
  localStorage.setItem("thanh-am-upload:undefined:p1", JSON.stringify({ id: "old-session", name: file.name, size: 4, lastModified: 123 }));
  const { host, requests } = await mount();
  const original = globalThis.fetch;
  const chunks: { offset: string | null; text: string }[] = [];
  vi.stubGlobal("fetch", async (url: string, options: RequestInit = {}) => {
    if (url === "/api/uploads/old-session") {
      if (options.method === "PATCH") chunks.push({ offset: new Headers(options.headers).get("Upload-Offset"), text: await (options.body as Blob).text() });
      return Response.json({ upload_id: "old-session", expected_size_bytes: 4, uploaded_size_bytes: chunks.length ? 4 : 2, upload_status_code: "UPLOADING" });
    }
    return original(url, options);
  });
  await select(host, [new File(["abcd"], "different.mp4", { type: "video/mp4", lastModified: 123 })]);
  expect(button(host, "Tiếp tục").disabled).toBe(true);
  await select(host, [file]);
  await act(() => button(host, "Tiếp tục").click());
  expect(chunks).toEqual([{ offset: "2", text: "cd" }]);
  expect(requests.some(item => item.url === "/api/uploads/init")).toBe(false);
  expect(localStorage.length).toBe(0);
});

it("previews a microphone recording and uploads its actual audio data", async () => {
  const browser = browserRecording();
  const { host, requests } = await mount("AUDIO");
  expect(browser.microphone).not.toHaveBeenCalled();
  await act(() => button(host, "Bắt đầu thu").click());
  expect(button(host, "Chọn tệp từ máy tính").disabled).toBe(true);
  await act(() => button(host, "Dừng thu").click());
  expect(host.querySelector('audio[aria-label="Nghe lại bản thu"]')).not.toBeNull();
  await act(() => button(host, "Dùng bản thu làm nguồn").click());
  await act(() => button(host, "Tải lên").click());
  expect(await (requests.find(item => item.method === "PATCH")!.body as Blob).text()).toBe("recorded-audio");
  expect(requests.some(item => item.url.includes("/jobs"))).toBe(false);
});

it.each(["VIDEO", "IMAGE"] as const)("hides audio recording for %s projects", async kind => {
  browserRecording(); const { host } = await mount(kind);
  expect([...host.querySelectorAll("button")].some(item => item.textContent?.trim() === "Bắt đầu thu")).toBe(false);
});

it("removes a discarded recording from the pending upload", async () => {
  browserRecording(); const { host, requests } = await mount("AUDIO");
  await act(() => button(host, "Bắt đầu thu").click());
  await act(() => button(host, "Dừng thu").click());
  await act(() => button(host, "Dùng bản thu làm nguồn").click());
  expect(button(host, "Tải lên").disabled).toBe(false);
  vi.stubGlobal("confirm", () => true);
  await act(() => button(host, "Bỏ bản thu").click());
  expect(button(host, "Tải lên").disabled).toBe(true);
  expect(requests.some(item => item.url === "/api/uploads/init")).toBe(false);
});
