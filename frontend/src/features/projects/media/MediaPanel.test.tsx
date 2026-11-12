// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { MediaPanel } from "./MediaPanel";
import type { Media, Project } from "../../../shared/types";

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
  vi.stubGlobal("fetch", async () => Response.json({ url: "https://foreign.example/stream", expires_in: 300 }));
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const media: Media = { media_file_id: "m1", project_id: "p1", media_kind_code: "ORIGINAL_VIDEO", is_current: true, mime_type: "video/mp4", file_name: "clip.mp4", file_size_bytes: 1024, duration_ms: 10000, created_at: "2026-11-12" };
  await act(() => root.render(<MediaPanel project={{ language_code: "vi" } as Project} media={[media]} loading={false} error="" reload={() => {}} />));
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
  await act(() => root.render(<MediaPanel project={{ language_code: "vi" } as Project} media={media} loading={false} error="" reload={() => {}} />));
  expect(host.querySelector("img")?.getAttribute("alt")).toBe("m1.png");
  const select = host.querySelector<HTMLSelectElement>("select")!;
  await act(() => { select.value = "m2"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(revoke).toHaveBeenCalledWith("blob:image-1");
  expect(host.querySelector("img")?.getAttribute("alt")).toBe("m2.png");
  await act(() => root.unmount());
  expect(revoke).toHaveBeenCalledWith("blob:image-2");
});
