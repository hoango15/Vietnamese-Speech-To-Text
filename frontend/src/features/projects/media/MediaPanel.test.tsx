// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { MediaPanel } from "./MediaPanel";
import type { Media, Project } from "../../../shared/types";
import { NoticeProvider } from "../../../shared/ui/NoticeProvider";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if (root) await act(() => root.unmount()); document.body.innerHTML = ""; vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("renews playback permission without restarting the active audio source", async () => {
  vi.useFakeTimers();
  let grants = 0;
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.endsWith("/playback")) { grants++; return Response.json({ url: "/api/media/m1/stream", expires_in: 2 }); }
    return Response.json({ items: [], total: 0 });
  });
  const media = [{ media_file_id: "m1", project_id: "p1", media_kind_code: "ORIGINAL_AUDIO", is_current: true,
    mime_type: "audio/wav", file_name: "audio.wav", file_size_bytes: 1024, duration_ms: 10000, created_at: "2026-11-09" } as Media];
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><MediaPanel project={{ project_id: "p1", language_code: "vi", can_edit: false, can_manage: false } as Project}
    media={media} loading={false} error="" reload={() => {}} /></MemoryRouter>));
  const audio = host.querySelector<HTMLAudioElement>("audio")!;
  audio.currentTime = 4;
  await act(async () => vi.advanceTimersByTimeAsync(1800));
  expect(grants).toBe(2);
  expect(host.querySelector("audio")).toBe(audio);
  expect(audio.currentTime).toBe(4);
  await act(() => root.unmount());
  await act(async () => vi.advanceTimersByTimeAsync(4000));
  expect(grants).toBe(2);
});

it("streams large video without a blob download and retries a failed playback grant", async () => {
  let failed = true;
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    requests.push(url);
    if (url.endsWith("/playback")) return failed ? Response.json({ detail: "Kết nối tạm lỗi" }, { status: 503 })
      : Response.json({ url: "/api/media/m1/stream", expires_in: 300 });
    return Response.json({ items: [], total: 0 });
  });
  const media = [{ media_file_id: "m1", project_id: "p1", media_kind_code: "ORIGINAL_VIDEO", is_current: true,
    mime_type: "video/mp4", file_name: "large.mp4", file_size_bytes: 1024 ** 3, duration_ms: 10000, created_at: "2026-11-09" } as Media];
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><MediaPanel project={{ project_id: "p1", language_code: "vi", can_edit: false, can_manage: false } as Project}
    media={media} loading={false} error="" reload={() => {}} /></MemoryRouter>));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Kết nối tạm lỗi");
  failed = false;
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Thử lại")!.click());
  expect(host.querySelector("video")?.getAttribute("src")).toBe("/api/media/m1/stream");
  expect(requests.filter(url => url.endsWith("/download"))).toEqual([]);
});

it("aborts the previous source download on selection changes and the current download on unmount", async () => {
  const downloads: { url: string; signal: AbortSignal | null | undefined }[] = [];
  vi.stubGlobal("fetch", async (url: string, options: RequestInit = {}) => {
    if (url.endsWith("/download")) {
      downloads.push({ url, signal: options.signal });
      return new Promise<Response>(() => {});
    }
    return Response.json(url.endsWith("/capabilities") ? { asr: false, ocr: false } : { items: [], total: 0 });
  });
  const media = ["m1", "m2"].map((id, index) => ({ media_file_id: id, project_id: "p1", media_kind_code: "ORIGINAL_IMAGE",
    is_current: index === 0, mime_type: "image/png", file_name: id + ".png", file_size_bytes: 20,
    duration_ms: 0, created_at: "2026-11-05T00:00:00Z" } as Media));
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><MediaPanel project={{ project_id: "p1", language_code: "vi", can_edit: false, can_manage: false } as Project}
    media={media} loading={false} error="" reload={() => {}} /></MemoryRouter>));
  expect(downloads.map(download => download.url)).toEqual(["/api/media/m1/download"]);
  const select = host.querySelector<HTMLSelectElement>('[aria-label="Chọn tệp xem trước"]')!;
  await act(() => { select.value = "m2"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(downloads[0].signal?.aborted).toBe(true);
  expect(downloads[1].signal?.aborted).toBe(false);
  await act(() => root.unmount());
  expect(downloads[1].signal?.aborted).toBe(true);
});

it("rejects playback URLs outside the selected media stream", async () => {
  vi.stubGlobal("fetch", async (url: string) => Response.json(url.endsWith("/playback")
    ? { url: "https://foreign.example/stream", expires_in: 300 } : { items: [], total: 0 }));
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const media: Media = { media_file_id: "m1", project_id: "p1", media_kind_code: "ORIGINAL_VIDEO", is_current: true, mime_type: "video/mp4", file_name: "clip.mp4", file_size_bytes: 1024, duration_ms: 10000, created_at: "2026-11-12" };
  await act(() => root.render(<MemoryRouter><MediaPanel project={{ project_id: "p1", language_code: "vi", can_edit: false } as Project} media={[media]} loading={false} error="" reload={() => {}} /></MemoryRouter>));
  expect(host.querySelector("video")).toBeNull();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Đường dẫn phát media không hợp lệ");
});

it("previews images and releases their object URLs on selection changes and unmount", async () => {
  vi.stubGlobal("fetch", async () => new Response(new Blob(["image"], { type: "image/png" })));
  let count = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:image-${++count}`);
  const revoke = vi.spyOn(URL, "revokeObjectURL");
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const media: Media[] = ["m1", "m2"].map((id, index) => ({ media_file_id: id, project_id: "p1", media_kind_code: "ORIGINAL_IMAGE", is_current: index === 0, mime_type: "image/png", file_name: id + ".png", file_size_bytes: 10, duration_ms: 0, created_at: "2026-11-12" }));
  await act(() => root.render(<MemoryRouter><MediaPanel project={{ project_id: "p1", language_code: "vi", can_edit: false } as Project} media={media} loading={false} error="" reload={() => {}} /></MemoryRouter>));
  expect(host.querySelector("img")?.getAttribute("alt")).toBe("m1.png");
  const select = host.querySelector<HTMLSelectElement>("select")!;
  await act(() => { select.value = "m2"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(revoke).toHaveBeenCalledWith("blob:image-1");
  expect(host.querySelector("img")?.getAttribute("alt")).toBe("m2.png");
  await act(() => root.unmount());
  expect(revoke).toHaveBeenCalledWith("blob:image-2");
});

async function mountSourceActions({ canManage = true, disabled = false, failDelete = false } = {}) {
  const requests: { url: string; method: string }[] = [];
  vi.stubGlobal("fetch", async (url: string, options: RequestInit = {}) => {
    requests.push({ url, method: options.method ?? "GET" });
    if (url.endsWith("/playback")) return Response.json({ url: url.includes("/m2/") ? "/api/media/m2/stream" : "/api/media/m1/stream", expires_in: 300 });
    if (url === "/api/media/m2/download") return new Response(new Blob(["audio"], { type: "audio/wav" }));
    if (options.method === "DELETE") return failDelete
      ? Response.json({ detail: "Không thể xóa tệp đang được xử lý." }, { status: 409 })
      : Response.json({ ok: true });
    return Response.json(url.endsWith("/capabilities") ? { asr: false, ocr: false } : { items: [], total: 0 });
  });
  const media: Media[] = ["m1", "m2"].map((id, index) => ({ media_file_id: id, project_id: "p1", media_kind_code: "ORIGINAL_AUDIO",
    is_current: index === 0, mime_type: "audio/wav", file_name: id + ".wav", file_size_bytes: 1024,
    duration_ms: 10000, created_at: "2026-11-16T00:00:00Z" }));
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const reload = vi.fn();
  await act(async () => root.render(<MemoryRouter initialEntries={["/projects/p1?media=m2"]}><NoticeProvider>
    <MediaPanel project={{ project_id: "p1", language_code: "vi", can_edit: false, can_manage: canManage } as Project}
      media={media} loading={false} error="" reload={reload} disabled={disabled} />
  </NoticeProvider></MemoryRouter>));
  return { host, requests, reload };
}

it("downloads the selected source with its original filename", async () => {
  const downloads: { filename: string; url: string }[] = [];
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:source-download");
  vi.spyOn(URL, "revokeObjectURL");
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ filename: this.download, url: this.href });
  });
  const { host, requests } = await mountSourceActions({ canManage: false });
  const button = [...host.querySelectorAll("button")].find(item => item.textContent?.includes("Tải xuống"));
  expect(button, "Selected media must have a download action").toBeTruthy();
  await act(async () => button!.click());
  expect(downloads).toEqual([{ filename: "m2.wav", url: "blob:source-download" }]);
  expect(requests).toContainEqual({ url: "/api/media/m2/download", method: "GET" });
});

it("deletes only the selected source after manager confirmation and refreshes media", async () => {
  const confirm = vi.fn(() => true); vi.stubGlobal("confirm", confirm);
  const { host, requests, reload } = await mountSourceActions();
  const button = host.querySelector<HTMLButtonElement>('[aria-label="Xóa tệp nguồn"]');
  expect(button, "Managers must be able to remove the selected source").toBeTruthy();
  await act(async () => button!.click());
  expect(confirm).toHaveBeenCalledOnce();
  expect(requests.filter(item => item.method === "DELETE")).toEqual([{ url: "/api/media/m2", method: "DELETE" }]);
  expect(reload).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="status"]')?.textContent).toContain("Đã xóa tệp");
});

it("keeps media unchanged when deletion is declined", async () => {
  vi.stubGlobal("confirm", () => false);
  const { host, requests, reload } = await mountSourceActions();
  const button = host.querySelector<HTMLButtonElement>('[aria-label="Xóa tệp nguồn"]');
  expect(button, "Manager delete action is missing").toBeTruthy();
  await act(async () => button!.click());
  expect(requests.some(item => item.method === "DELETE")).toBe(false);
  expect(reload).not.toHaveBeenCalled();
  expect(host.querySelector<HTMLSelectElement>("select")?.value).toBe("m2");
});

it("keeps the selected source and displays server errors when deletion fails", async () => {
  vi.stubGlobal("confirm", () => true);
  const { host, reload } = await mountSourceActions({ failDelete: true });
  const button = host.querySelector<HTMLButtonElement>('[aria-label="Xóa tệp nguồn"]');
  expect(button, "Manager delete action is missing").toBeTruthy();
  await act(async () => button!.click());
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Không thể xóa tệp đang được xử lý.");
  expect(reload).not.toHaveBeenCalled();
  expect(host.querySelector<HTMLSelectElement>("select")?.value).toBe("m2");
  expect(host.querySelector("audio")).not.toBeNull();
});

it("does not offer source deletion to a non-manager", async () => {
  const { host, requests } = await mountSourceActions({ canManage: false });
  expect(host.querySelector('[aria-label="Xóa tệp nguồn"]')).toBeNull();
  expect(requests.some(item => item.method === "DELETE")).toBe(false);
});

it("blocks source deletion while source changes are locked", async () => {
  const confirm = vi.fn(() => true); vi.stubGlobal("confirm", confirm);
  const { host, requests } = await mountSourceActions({ disabled: true });
  const button = host.querySelector<HTMLButtonElement>('[aria-label="Xóa tệp nguồn"]');
  expect(button, "Manager delete action is missing").toBeTruthy();
  expect(button!.disabled).toBe(true);
  await act(async () => button!.click());
  expect(confirm).not.toHaveBeenCalled();
  expect(requests.some(item => item.method === "DELETE")).toBe(false);
});
