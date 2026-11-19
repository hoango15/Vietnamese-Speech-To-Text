// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { ProcessPanel } from "./ProcessPanel";
import type { Job, Media, Project } from "../../../shared/types";
import { NoticeProvider } from "../../../shared/ui/NoticeProvider";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
const project: Project = { project_id: "p1", project_title: "Họp", project_description: "", language_code: "vi", project_status_code: "READY",
  owner_user_id: "u1", owner_name: "An", created_at: "2026-11-04T00:00:00Z", updated_at: "2026-11-04T00:00:00Z", deleted_at: null,
  can_edit: true, can_manage: true, member_count: 1 };
afterEach(async () => { if (root) await act(() => root.unmount()); document.body.innerHTML = ""; vi.useRealTimers(); vi.unstubAllGlobals(); });
async function mount(available: boolean, image = false, remote = false, options: {
  project?: Partial<Project>; disabled?: boolean; supported?: boolean; job?: Partial<Job>; jobError?: boolean; onComplete?: () => void;
  history?: Partial<Job>[]; laterPageError?: boolean;
} = {}) {
  const posts: Record<string, unknown>[] = [];
  const media: Media = { media_file_id: "m1", project_id: "p1", mime_type: image ? "image/png" : "audio/wav",
    media_kind_code: image ? "ORIGINAL_IMAGE" : "ORIGINAL_AUDIO", duration_ms: 60000, is_current: true,
    file_name: "source", file_size_bytes: 10, created_at: "2026-11-04T00:00:00Z" };
  const job = { job_id: "j1", project_id: "p1", media_file_id: "m1", job_status_code: "QUEUED", progress_percent: 0,
    error_message: null, created_at: "2026-11-04T00:00:00Z", stages: [] };
  vi.stubGlobal("fetch", async (url: string, request: RequestInit) => {
    if (url === "/api/system/capabilities") return Response.json({ asr: options.supported ?? true, ocr: options.supported ?? true, diarization: available, llm: false,
      asr_model: remote ? "colab-whisper" : "base", asr_provider: remote ? "colab" : "local", max_upload_bytes: 100000 });
    if (url === "/api/projects/p1/jobs" && request.method === "POST") { posts.push(JSON.parse(request.body as string)); return Response.json(job, { status: 201 }); }
    if (url === "/api/jobs/j1") return Response.json({ ...job, ...options.job });
    if (url.startsWith("/api/projects/p1/jobs")) {
      const query = new URL(url, "http://localhost").searchParams;
      const page = Number(query.get("page") ?? 1), size = Number(query.get("page_size") ?? 20);
      const items = (options.history ?? (options.job ? [options.job] : [])).map(item => ({ ...job, ...item }))
        .filter(item => !query.get("status") || item.job_status_code === query.get("status"));
      return options.jobError || (options.laterPageError && page > 1)
        ? Response.json({ detail: "Chưa xác định được tác vụ đang chạy" }, { status: 503 })
        : Response.json({ items: items.slice((page - 1) * size, page * size), total: items.length });
    }
    return Response.json({ items: [], total: 0 });
  });
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><NoticeProvider><ProcessPanel project={{ ...project, ...options.project }} media={media}
    disabled={options.disabled} onComplete={options.onComplete ?? (() => {})} /></NoticeProvider></MemoryRouter>));
  return { host, posts, media };
}
async function start(host: HTMLElement) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(el => el.textContent?.includes("Bắt đầu xử lý") || el.textContent?.includes("Nhận dạng văn bản"))!;
  await act(async () => button.click());
}
async function chooseCount(host: HTMLElement, value: string) {
  const field = host.querySelector<HTMLInputElement>('[aria-label="Số người nói"]')!;
  expect(field).toBeTruthy();
  await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
}
it("sends diarization opt-in and an optional speaker count to the actual job endpoint", async () => {
  const { host, posts } = await mount(true);
  const checkbox = host.querySelector<HTMLInputElement>('[aria-label="Tự phân biệt người nói"]');
  expect(checkbox).toBeTruthy();
  await act(() => checkbox!.click());
  await chooseCount(host, "2");
  await start(host);
  expect(posts).toEqual([{ media_file_id: "m1", is_minutes_requested: false, is_diarization_requested: true, expected_speaker_count: 2 }]);
});

it.each(["QUEUED", "RUNNING"])("finds a selected source's %s job beyond the first history page", async status => {
  const history = Array.from({ length: 20 }, (_, index) => ({ job_id: `new-${index}`, media_file_id: `other-${index}`, job_status_code: status }));
  history.push({ job_id: "j1", media_file_id: "m1", job_status_code: status });
  const { host, posts } = await mount(true, false, false, { history });
  expect(host.querySelector('[role="progressbar"]')).not.toBeNull();
  await start(host);
  expect(posts).toEqual([]);
  expect([...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Bắt đầu xử lý"))?.disabled).toBe(true);
});

it("blocks processing when a later active-job page fails to load", async () => {
  const history = Array.from({ length: 21 }, (_, index) => ({ job_id: `other-${index}`, media_file_id: `other-${index}`, job_status_code: "RUNNING" }));
  const { host, posts } = await mount(true, false, false, { history, laterPageError: true });
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await start(host);
  expect(posts).toEqual([]);
});
it("blocks invalid speaker counts before submitting a job", async () => {
  const { host, posts } = await mount(true);
  const checkbox = host.querySelector<HTMLInputElement>('[aria-label="Tự phân biệt người nói"]');
  expect(checkbox).toBeTruthy();
  await act(() => checkbox!.click());
  await chooseCount(host, "21");
  await start(host);
  expect(posts).toHaveLength(0);
  expect(host.querySelector('[role="alert"]')).toBeTruthy();
});
it("keeps regular recognition usable when the worker cannot separate speakers", async () => {
  const { host, posts } = await mount(false);
  const checkbox = host.querySelector<HTMLInputElement>('[aria-label="Tự phân biệt người nói"]');
  expect(checkbox?.disabled).toBe(true);
  await act(() => [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(el => !el.hasAttribute("aria-label"))!.click());
  await start(host);
  expect(posts[0]).toEqual({ media_file_id: "m1", is_minutes_requested: true, is_diarization_requested: false });
});
it("requires at least one audio processing option before creating a job", async () => {
  const { host, posts } = await mount(true);
  await start(host);
  expect(posts).toHaveLength(0);
  expect(host.querySelector('[role="alert"]')).toBeTruthy();
});
it("does not offer or request speaker separation for OCR", async () => {
  const { host, posts } = await mount(true, true);
  expect(host.querySelector('[aria-label="Tự phân biệt người nói"]')).toBeNull();
  await start(host);
  expect(posts[0]).toEqual({ media_file_id: "m1", is_minutes_requested: false, is_diarization_requested: false });
});

it("shows the Colab destination before submitting audio for remote recognition", async () => {
  const { host, posts } = await mount(false, false, true);
  expect(host.textContent).toContain("Âm thanh sẽ được gửi tới Colab");
  expect(posts).toHaveLength(0);
});

it("keeps the selected file in its processing-history link",async()=>{
 const {host}=await mount(true);
 expect(host.querySelector<HTMLAnchorElement>('a[href*="tab=jobs"]')?.getAttribute("href")).toBe("/projects/p1?tab=jobs&media=m1");
});

it("hides job creation for a read-only project", async () => {
  const { host, posts } = await mount(true, false, false, { project: { can_edit: false, can_manage: false } });
  expect([...host.querySelectorAll("button")].some(button => button.textContent?.includes("Bắt đầu xử lý"))).toBe(false);
  expect(posts).toEqual([]);
});

it.each([{ disabled: true }, { supported: false }, { job: { job_status_code: "RUNNING" } }, { jobError: true }])(
  "blocks job creation when the source cannot start: %j", async options => {
    const { host, posts } = await mount(true, false, false, options);
    const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Bắt đầu xử lý"))!;
    expect(button.disabled).toBe(true);
    await start(host);
    expect(posts).toEqual([]);
  },
);

it("refreshes results once and unlocks processing after the active task completes", async () => {
  vi.useFakeTimers();
  const completed = vi.fn();
  const status: Partial<Job> = { job_status_code: "RUNNING", started_at: "2026-11-04T00:00:00Z" };
  const { host } = await mount(true, false, false, { job: status, onComplete: completed });
  status.job_status_code = "SUCCEEDED";
  status.finished_at = "2026-11-04T00:01:00Z";
  status.progress_percent = 100;
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(completed).toHaveBeenCalledTimes(1);
  expect([...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Bắt đầu xử lý"))?.disabled).toBe(false);
  await act(() => vi.advanceTimersByTimeAsync(4000));
  expect(completed).toHaveBeenCalledTimes(1);
});

it("keeps processing locked when another active job replaces the completed attempt", async () => {
  vi.useFakeTimers();
  const status: Partial<Job> = { job_id: "j1", job_status_code: "RUNNING" };
  const history = [status];
  const { host, posts } = await mount(true, false, false, { job: status, history });
  status.job_status_code = "SUCCEEDED";
  status.finished_at = "2026-11-04T00:01:00Z";
  status.progress_percent = 100;
  history.unshift({ job_id: "j2", media_file_id: "m1", job_status_code: "QUEUED" });
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("0");
  expect([...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Bắt đầu xử lý"))?.disabled).toBe(true);
  await start(host);
  expect(posts).toEqual([]);
});
