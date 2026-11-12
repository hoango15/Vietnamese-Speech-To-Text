// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { ExportsPanel } from "./ExportsPanel";
import { NoticeProvider } from "../../../shared/ui/NoticeProvider";
import type { Media, Project } from "../../../shared/types";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
let requests: { url: string; method: string; body: unknown }[] = [];
let foreignJob = false, unboundExport = false;
let transcript = true, started = false, finished = false, resumed = false, previewFails = false;
let delayedVideo: Promise<Response> | null = null;
const media = { media_file_id: "m1", project_id: "p1", media_kind_code: "ORIGINAL_VIDEO", mime_type: "video/mp4", file_name: "hop.mp4", file_size_bytes: 20 } as Media;
const project = { project_id: "p1", project_title: "Họp", language_code: "vi", can_edit: true, can_manage: true } as Project;
const job = () => ({ job_id: "j1", project_id: "p1", media_file_id: "m1", job_kind: "BURN_IN", job_status_code: finished ? "SUCCEEDED" : "RUNNING", progress_percent: finished ? 100 : 35, created_at: "2026-11-04T00:00:00Z", started_at: "2026-11-04T00:00:00Z", error_message: null });
afterEach(async () => {
  if (root) await act(() => root.unmount());
  document.body.innerHTML = ""; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  foreignJob = false; unboundExport = false; requests = []; transcript = true; started = false; finished = false; resumed = false; previewFails = false; delayedVideo = null;
});
async function mount(canEdit = true) {
  vi.spyOn(URL, "createObjectURL").mockImplementation(blob => blob instanceof Blob && blob.type.includes("vtt") ? "blob:captions" : "blob:video");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
    requests.push({ url, method: options.method ?? "GET", body: options.body ? JSON.parse(options.body as string) : null });
    if (url.split("?")[0].endsWith("/transcripts/current")) return transcript ? Response.json({ transcript_id: "t1", revision: 1, version_no: 1, segments: [{ start_ms: 0, end_ms: 2000, segment_text: "Xin chào Việt Nam" }], speakers: [] }) : Response.json({ detail: "Chưa có transcript" }, { status: 404 });
    if (url === "/api/projects/p1/jobs") return Response.json({ items: foreignJob ? [{...job(),media_file_id:"other-source"}] : resumed || started ? [job()] : [], total: foreignJob || resumed || started ? 1 : 0 });
    if (url === "/api/jobs/j1") return Response.json(job());
    if (url.split("?")[0].endsWith("/subtitles/burn-in")) { started = true; return Response.json(job()); }
    if (url.includes("/subtitles/preview?")) return previewFails ? Response.json({ detail: "Timestamp không hợp lệ" }, { status: 422 }) : new Response("WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nXin chào Việt Nam\n", { headers: { "Content-Type": "text/vtt" } });
    if (url === "/api/media/m1/download") return delayedVideo ?? new Response(new Blob(["video"], { type: "video/mp4" }));
    if (url.split("?")[0].endsWith("/exports")) return Response.json({ items: [{ export_file_id: "old", media_file_id: unboundExport ? null : undefined, transcript_id: "old-transcript", export_kind_code: "BURNED_VIDEO", file_name: "video-cu.mp4", file_size_bytes: 3, source: "transcript", created_at: "2026-11-03T00:00:00Z" }, ...(finished ? [{ export_file_id: "e1", transcript_id: "t1", export_kind_code: "BURNED_VIDEO", file_name: "video-phu-de.mp4", file_size_bytes: 3, source: "transcript", created_at: "2026-11-04T00:00:00Z" }] : [])], total: finished ? 2 : 1 });
    if (url === "/api/exports/e1/download") return new Response(new Blob(["rendered"], { type: "video/mp4" }));
    return Response.json({ items: [], total: 0 });
  });
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const router = createMemoryRouter([{ path: "/projects/:id", element: <NoticeProvider><ExportsPanel project={{ ...project, can_edit: canEdit, can_manage: canEdit }} media={media} /></NoticeProvider> }], { initialEntries: ["/projects/p1?tab=exports"] });
  await act(async () => root.render(<RouterProvider router={router} />)); return host;
}
function button(text: string) { return [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === text)!; }
it("previews authenticated video with Vietnamese timed captions and frees both blob URLs", async () => {
  const host = await mount();
  await act(() => button("Xem trước Vietsub").click());
  const video = host.querySelector<HTMLVideoElement>("dialog video");
  expect(video?.getAttribute("src")).toBe("blob:video");
  const track = video?.querySelector("track");
  expect(track?.getAttribute("src")).toBe("blob:captions"); expect(track?.getAttribute("srclang")).toBe("vi");
  expect(track?.hasAttribute("default")).toBe(true);
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Đóng hộp thoại"]')!.click());
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:video"); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:captions");
});
it("requires a saved transcript and gives viewers preview without write actions", async () => {
  transcript = false;
  const host = await mount();
  expect(button("Xuất video Vietsub").disabled).toBe(true); expect(button("Xem trước Vietsub").disabled).toBe(true);
  expect(host.textContent).toContain("Cần bản chép lời");
  await act(() => root.unmount());
  transcript = true;
  await mount(false);
  expect(button("Xuất video Vietsub")).toBeUndefined(); expect(button("Xem trước Vietsub").disabled).toBe(false);
});
it("uses matching line width and speaker labels for preview and render", async () => {
  const host = await mount();
  const width = host.querySelector<HTMLInputElement>('[aria-label="Số ký tự mỗi dòng Vietsub"]')!;
  await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(width, "120"); width.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(() => host.querySelector<HTMLInputElement>('[aria-label="Kèm tên người nói trong Vietsub"]')!.click());
  await act(() => button("Xem trước Vietsub").click());
  const query = new URL(requests.find(r => r.url.includes("subtitles/preview"))!.url, "http://local").searchParams;
  expect(query.get("max_chars_per_line")).toBe("120"); expect(query.get("includes_speaker_label")).toBe("true");
  expect(query.get("transcript_id")).toBe("t1"); expect(query.get("media_file_id")).toBe("m1");
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Đóng hộp thoại"]')!.click());
  await act(() => button("Xuất video Vietsub").click());
  expect(requests.find(r => r.url.split("?")[0].endsWith("/subtitles/burn-in"))?.body).toEqual({ max_chars_per_line: 120, includes_speaker_label: true, transcript_id: "t1", media_file_id: "m1" });
  expect(button("Xuất video Vietsub").disabled).toBe(true);
});
it("resumes an existing subtitle job and offers the current transcript's rendered MP4", async () => {
  vi.useFakeTimers(); resumed = true;
  const host = await mount();
  expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("35");
  expect(button("Xu\u1ea5t video Vietsub").disabled).toBe(true);
  expect(button("Tải video Vietsub")).toBeUndefined();
  finished = true;
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(button("Tải video Vietsub")).toBeDefined();
  await act(() => button("Tải video Vietsub").click());
  expect(requests.some(r => r.url === "/api/exports/e1/download")).toBe(true);
  expect(button("Xuất video Vietsub").disabled).toBe(false);
});
it("shows preview errors and ignores media arriving after the dialog is closed", async () => {
  const host = await mount(); previewFails = true;
  await act(() => button("Xem trước Vietsub").click());
  expect(host.querySelector("dialog [role=alert]")?.textContent).toContain("Timestamp không hợp lệ");
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Đóng hộp thoại"]')!.click());
  previewFails = false;
  let complete!: (value: Response) => void;
  delayedVideo = new Promise(resolve => { complete = resolve; });
  await act(() => button("Xem trước Vietsub").click());
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Đóng hộp thoại"]')!.click());
  await act(async () => complete(new Response(new Blob(["late"], { type: "video/mp4" }))));
  expect(host.querySelector("dialog")).toBeNull(); expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("allows selected video processing while another source has an active job",async()=>{
 foreignJob=true;await mount();
 expect(button("Xu\u1ea5t video Vietsub").disabled).toBe(false);
});

it("labels only exports whose source is explicitly unbound",async()=>{
 unboundExport=true;const host=await mount();
 expect(host.textContent?.split("Ngu\u1ed3n ch\u01b0a x\u00e1c \u0111\u1ecbnh")).toHaveLength(2);
});
