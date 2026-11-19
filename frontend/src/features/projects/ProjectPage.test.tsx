// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import App from "../../app/App";
import { api } from "../../shared/api/client";
import type { Project, Session } from "../../shared/types";
import { browserRecording } from "./media/recording.test-helpers";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const project = {
  project_id: "p1", project_title: "Cuộc họp dự án", project_description: "Nội dung nguồn", language_code: "vi",
  project_scope: "PERSONAL", project_type: "AUDIO", project_status_code: "DRAFT", owner_user_id: "owner", owner_name: "Chủ dự án",
  created_at: "2026-11-12T00:00:00Z", updated_at: "2026-11-12T00:00:00Z", deleted_at: null, can_manage: true, can_edit: true, member_count: 1,
};
const media = { media_file_id: "m1", project_id: "p1", media_kind_code: "ORIGINAL_AUDIO", mime_type: "audio/wav", file_name: "hop.wav", file_size_bytes: 2048, duration_ms: 65000, created_at: "2026-11-12T00:00:00Z", is_current: true };
const session: Session = { access_token: "token", user: { user_id: "owner", email: "owner@example.test", full_name: "Chủ dự án", user_role_code: "MANAGER", is_active: true, created_at: project.created_at } };
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
async function mount(handler: (url: string, options: RequestInit) => Response | Promise<Response> = () => Response.json({ items: [media], total: 1 }), details: Partial<Project> = {}, path = "/projects/p1") {
  api.setSession(null);
  window.history.replaceState(null, "", path);
  vi.stubGlobal("fetch", (url: string, options: RequestInit = {}) => Promise.resolve(url === "/api/auth/refresh"
    ? Response.json(session) : url === "/api/projects/p1" && options.method !== "PATCH" ? Response.json({ ...project, ...details })
    : url.endsWith("/playback") ? Response.json({ url: url.replace(/\/playback$/, "/stream"), expires_in: 300 }) : handler(url, options)));
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<App />));
}
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined; api.setSession(null); vi.unstubAllGlobals(); document.body.innerHTML = ""; localStorage.clear();
});

it("opens project files from the protected detail route with size and duration", async () => {
  await mount();
  expect(host.querySelector("main h1")?.textContent).toBe(project.project_title);
  expect(host.querySelector(".media-info")?.textContent).toContain("hop.wav");
  expect(host.querySelector(".media-info")?.textContent).toContain("2.0 KB");
  expect(host.querySelector(".media-info")?.textContent).toContain("00:01:05");
});

it("opens processing history without discarding the selected media or filters", async () => {
  const requests: string[] = [];
  await mount(url => {
    requests.push(url);
    return Response.json({ items: url.includes("/jobs?") ? [] : [media], total: 0 });
  }, {}, "/projects/p1?media=m1&jobs_q=hop.wav");
  const history = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Lịch sử xử lý");
  expect(history).toBeDefined();
  await act(() => history!.click());
  expect(window.location.search).toContain("tab=jobs");
  expect(window.location.search).toContain("media=m1");
  expect(window.location.search).toContain("jobs_q=hop.wav");
  expect(host.querySelector("h2")?.textContent).toBe("Lịch sử xử lý");
  expect(requests).toContain("/api/projects/p1/jobs?q=hop.wav&page=1&page_size=20");
});

it("starts processing the selected preview source and keeps it when opening history", async () => {
  const posts: unknown[] = [];
  await mount((url, options) => {
    if (url === "/api/system/capabilities") return Response.json({ asr: true, ocr: true, diarization: true, llm: false, asr_model: "base", max_upload_bytes: 100000 });
    if (url === "/api/projects/p1/media") return Response.json({ items: [media, { ...media, media_file_id: "m2", file_name: "other.wav", is_current: false }], total: 2 });
    if (url === "/api/projects/p1/jobs" && options.method === "POST") {
      posts.push(JSON.parse(String(options.body)));
      return Response.json({ job_id: "j2", project_id: "p1", media_file_id: "m2", job_status_code: "QUEUED", progress_percent: 0, error_message: null, created_at: project.created_at });
    }
    return Response.json({ items: [], total: 0 });
  });
  const select = host.querySelector<HTMLSelectElement>('[aria-label="Chọn tệp xem trước"]')!;
  await act(() => { select.value = "m2"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  const speakers = host.querySelector<HTMLInputElement>('[aria-label="Tự phân biệt người nói"]');
  expect(speakers).not.toBeNull();
  await act(() => speakers!.click());
  await act(() => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Bắt đầu xử lý"))!.click());
  expect(posts).toEqual([{ media_file_id: "m2", is_minutes_requested: false, is_diarization_requested: true }]);
  const history = host.querySelector<HTMLAnchorElement>('a[href*="tab=jobs"]')!;
  await act(() => history.click());
  expect(window.location.search).toContain("media=m2");
  await act(() => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Tệp nguồn")!.click());
  expect(host.querySelector<HTMLSelectElement>('[aria-label="Chọn tệp xem trước"]')?.value).toBe("m2");
});

it("switches original files and displays the selected file's duration", async () => {
  await mount(() => Response.json({ items: [media, { ...media, media_file_id: "m2", file_name: "bai-giang.wav", duration_ms: 3600000, is_current: false }, { ...media, media_file_id: "generated", media_kind_code: "AUDIO_WAV", file_name: "derived.wav" }], total: 3 }));
  const select = host.querySelector<HTMLSelectElement>('[aria-label="Chọn tệp xem trước"]');
  expect(select).not.toBeNull();
  expect(select!.options.length).toBe(2);
  await act(() => { select!.value = "m2"; select!.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(host.querySelector(".media-info")?.textContent).toContain("bai-giang.wav");
  expect(host.querySelector(".media-info")?.textContent).toContain("01:00:00");
});

it("shows unknown duration without presenting it as zero", async () => {
  await mount(() => Response.json({ items: [{ ...media, duration_ms: 0 }], total: 1 }));
  expect(host.querySelector(".media-info")?.textContent).toContain("Chưa có thời lượng");
});

it("shows an empty source list", async () => {
  await mount(() => Response.json({ items: [], total: 0 }));
  expect(host.querySelector(".source-empty")?.textContent).toContain("Thêm tệp để bắt đầu");
});

it("retries failed source loading without hiding the project title", async () => {
  let failed = true;
  await mount(() => failed ? Response.json({ detail: "Không tải được danh sách tệp" }, { status: 503 }) : Response.json({ items: [media], total: 1 }));
  expect(host.querySelector("main h1")?.textContent).toBe(project.project_title);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Không tải được danh sách tệp");
  failed = false;
  const retry = [...host.querySelectorAll("button")].find(item => item.textContent?.trim() === "Thử lại");
  expect(retry).toBeDefined();
  await act(() => retry!.click());
  expect(host.querySelector(".media-info")?.textContent).toContain("hop.wav");
});

it("uploads a selected source, shows completion and reloads the server-provided duration", async () => {
  let completed = false, offset = 0;
  const requests: { url: string; method: string; body: unknown }[] = [];
  await mount((url, options) => {
    requests.push({ url, method: options.method ?? "GET", body: options.body });
    if (url === "/api/system/capabilities") return Response.json({ asr: false, ocr: false, diarization: false, llm: false, asr_model: "", max_upload_bytes: 1024 });
    if (url === "/api/projects/p1/jobs" || url.includes("/bookmarks") || url.startsWith("/api/glossaries")) return Response.json({ items: [], total: 0 });
    if (url === "/api/projects/p1/media") return Response.json({ items: completed ? [media] : [], total: completed ? 1 : 0 });
    if (url === "/api/uploads/u1/complete") { completed = true; return Response.json(media); }
    if (options.method === "PATCH") offset += (options.body as Blob).size;
    return Response.json({ upload_id: "u1", expected_size_bytes: 4, uploaded_size_bytes: offset, upload_status_code: "UPLOADING" });
  });
  const input = host.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  const files = new DataTransfer(); files.items.add(new File(["wave"], "hop.wav", { type: "audio/wav" }));
  await act(() => { Object.defineProperty(input, "files", { value: files.files, configurable: true }); input!.dispatchEvent(new Event("change", { bubbles: true })); });
  const upload = [...host.querySelectorAll("button")].find(item => item.textContent?.trim() === "Tải lên");
  expect(upload).toBeDefined();
  await act(() => upload!.click());
  expect(JSON.parse(String(requests.find(item => item.url === "/api/uploads/init")?.body))).toEqual({ project_id: "p1", file_name: "hop.wav", mime_type: "audio/wav", expected_size_bytes: 4 });
  expect(await (requests.find(item => item.method === "PATCH")!.body as Blob).text()).toBe("wave");
  expect(host.querySelector(".upload-card")?.textContent).toContain("Đã tải lên");
  expect(host.querySelector(".media-info")?.textContent).toContain("00:01:05");
  expect(requests.some(item => item.url.includes("/jobs") && item.method === "POST")).toBe(false);
});

it("hides upload controls for read-only projects", async () => {
  await mount(undefined, { can_edit: false, can_manage: false });
  expect(host.querySelector(".media-info")?.textContent).toContain("hop.wav");
  expect(host.querySelector('input[type="file"]')).toBeNull();
});

it("hides file controls for deleted projects", async () => {
  await mount(undefined, { deleted_at: "2026-11-12T01:00:00Z" });
  expect(host.textContent).toContain("Dự án đã bị xóa");
  expect(host.querySelector(".upload-card")).toBeNull();
  expect(host.querySelector(".media-card")).toBeNull();
});

it("shows the selected source and project-only activity in the overview without losing media links", async () => {
  await mount(url => {
    if (url === "/api/projects/p1/media") return Response.json({ items: [media, { ...media, media_file_id: "m2", file_name: "selected.wav", is_current: false, duration_ms: 120000 }], total: 2 });
    if (url.endsWith("/members")) return Response.json({ items: [{ user_id: "reader", full_name: "Người xem", permission: "VIEWER" }], total: 1 });
    if (url.endsWith("/activities")) return Response.json({ items: [
      { audit_log_id: "a1", entity_name: "project", entity_id: "p1", action_name: "CREATE", full_name: "Chủ dự án", occurred_at: project.created_at },
      { audit_log_id: "a2", entity_name: "project", entity_id: "another", action_name: "FOREIGN_ACTIVITY", occurred_at: project.created_at },
    ], total: 2 });
    return Response.json({ items: [], total: 0 });
  }, {}, "/projects/p1?tab=overview&media=m2");
  const overview = host.querySelector(".project-overview");
  expect(overview).not.toBeNull();
  expect(overview?.textContent).toContain("selected.wav");
  expect(overview?.textContent).toContain("00:02:00");
  expect(overview?.querySelector('[aria-label="Phiên bản nguồn"]')?.textContent).toContain("2");
  expect(overview?.textContent).toContain("Đã tạo dự án");
  expect(overview?.textContent).not.toContain("FOREIGN_ACTIVITY");
  expect(overview?.textContent).toContain("Người xem");
  expect(overview?.querySelector('a[href="/projects/p1?tab=content&media=m2"]')).not.toBeNull();
  expect(overview?.querySelector('a[href="/projects/p1?tab=jobs&media=m2"]')).not.toBeNull();
});

it("retries a failed overview activity request", async () => {
  let failed = true;
  await mount(url => url.endsWith("/activities") && failed
    ? Response.json({ detail: "Không tải được hoạt động" }, { status: 503 })
    : Response.json({ items: [], total: 0 }), {}, "/projects/p1?tab=overview");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Không tải được hoạt động");
  failed = false;
  await act(() => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Thử lại")!.click());
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelector(".project-overview")?.textContent).toContain("Chưa có hoạt động gần đây");
});

it("edits project settings from the detail page and refreshes the saved title", async () => {
  const details: Partial<Project> = {};
  const writes: unknown[] = [];
  await mount((url, options) => {
    if (url === "/api/projects/p1" && options.method === "PATCH") {
      const body = JSON.parse(String(options.body));
      writes.push(body);
      Object.assign(details, body);
      return Response.json({ ...project, ...details });
    }
    return Response.json({ items: [], total: 0 });
  }, details);
  const settings = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Cài đặt dự án");
  expect(settings).toBeDefined();
  await act(() => settings!.click());
  const input = document.querySelector<HTMLInputElement>('dialog [name="project_title"]')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Tên đã cập nhật");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector<HTMLFormElement>("dialog form")!.requestSubmit();
  });
  expect(writes).toEqual([{ project_title: "Tên đã cập nhật", project_description: "Nội dung nguồn", language_code: "vi", project_type: "AUDIO" }]);
  expect(document.querySelector("dialog")).toBeNull();
  expect(host.querySelector("main h1")?.textContent).toBe("Tên đã cập nhật");
});

it.each([{ can_manage: false }, { deleted_at: "2026-11-12T01:00:00Z" }])("hides detail settings when management is unavailable: %o", async details => {
  await mount(undefined, details);
  expect([...host.querySelectorAll("button")].some(button => button.textContent?.trim() === "Cài đặt dự án")).toBe(false);
});

it("protects a live recording from navigation and releases the microphone when leaving is confirmed", async () => {
  const browser = browserRecording();
  await mount(url => Response.json(url === "/api/projects/p1/media" ? { items: [media], total: 1 }
    : url === "/api/system/capabilities" ? { asr: false, ocr: false, diarization: false, llm: false, asr_model: "", max_upload_bytes: 1024 }
    : { items: [], total: 0 }));
  const start = [...host.querySelectorAll("button")].find(item => item.textContent?.trim() === "Bắt đầu thu");
  expect(start).toBeDefined();
  await act(() => start!.click());
  expect(host.querySelector<HTMLSelectElement>('[aria-label="Chọn tệp xem trước"]')?.disabled).toBe(true);
  const settings = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Cài đặt dự án")!;
  expect(settings.disabled).toBe(true);
  await act(() => settings.click());
  expect(document.querySelector("dialog")).toBeNull();
  const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  const back = host.querySelector<HTMLAnchorElement>(".back-link")!;
  vi.stubGlobal("confirm", () => false);
  await act(() => back.click());
  expect(window.location.pathname).toBe("/projects/p1");
  expect(browser.tracks[0].stop).not.toHaveBeenCalled();
  vi.stubGlobal("confirm", () => true);
  await act(() => back.click());
  expect(window.location.pathname).toBe("/projects");
  expect(browser.tracks[0].stop).toHaveBeenCalled();
});

async function mountTranscript(requests: string[] = [], path = "/projects/p1?tab=transcript&media=m2") {
  await mount(url => {
    requests.push(url);
    if (url === "/api/projects/p1/media") return Response.json({ items: [media, { ...media, media_file_id: "m2", file_name: "selected.wav", is_current: false }], total: 2 });
    if (url === "/api/system/capabilities") return Response.json({ asr: false, ocr: false, diarization: false, llm: false, grammar: false, asr_model: "", max_upload_bytes: 1024 });
    if (url === "/api/projects/p1/transcripts/current?media_file_id=m2") return Response.json({
      transcript_id: "t2", project_id: "p1", media_file_id: "m2", version_no: 1, revision: 1,
      segments: [{ segment_id: "s2", start_ms: 12500, end_ms: 15000, segment_text: "Nội dung tệp đã chọn", speaker_id: null }], speakers: [],
    });
    if (url === "/api/projects/p1/transcripts?media_file_id=m2") return Response.json({ items: [{ transcript_id: "t2", media_file_id: "m2", version_no: 1, is_current: true, created_at: project.created_at }], total: 1 });
    return Response.json({ items: [], total: 0 });
  }, {}, path);
}

it.each(["/projects/p1?tab=transcript&media=m2", "/projects/p1?tab=content&media=m2&t=1250"])("loads the selected media transcript and seeks its source from a segment timestamp: %s", async path => {
  const requests: string[] = [];
  await mountTranscript(requests, path);
  expect(requests).toContain("/api/projects/p1/transcripts/current?media_file_id=m2");
  expect(host.querySelector<HTMLTextAreaElement>(".segment textarea")?.value).toBe("Nội dung tệp đã chọn");
  expect(host.querySelector<HTMLSelectElement>('[aria-label="Chọn tệp xem trước"]')?.value).toBe("m2");
  expect([...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Bản ghi")?.getAttribute("aria-pressed")).toBe("true");
  const audio = host.querySelector<HTMLAudioElement>("audio")!;
  expect(audio).not.toBeNull();
  if (path.includes("t=1250")) {
    await act(() => audio.dispatchEvent(new Event("loadedmetadata")));
    expect(audio.currentTime).toBe(1.25);
  }
  await act(() => host.querySelector<HTMLButtonElement>(".timestamp")!.click());
  expect(audio.currentTime).toBe(12.5);
});

it("keeps an unsaved transcript when leaving is cancelled and disables source changes", async () => {
  await mountTranscript();
  const textarea = host.querySelector<HTMLTextAreaElement>(".segment textarea");
  expect(textarea).not.toBeNull();
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Bản nháp chưa lưu");
    textarea!.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(host.querySelector<HTMLSelectElement>('[aria-label="Chọn tệp xem trước"]')?.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Xóa tệp nguồn"]')?.disabled).toBe(true);
  const confirm = vi.fn(() => false);
  vi.stubGlobal("confirm", confirm);
  await act(() => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Tệp nguồn")!.click());
  expect(confirm).toHaveBeenCalledOnce();
  expect(window.location.search).toContain("tab=transcript");
  expect(host.querySelector<HTMLTextAreaElement>(".segment textarea")?.value).toBe("Bản nháp chưa lưu");
});

it("lets viewers mark the selected media after metadata loads and seek their private notes", async () => {
  const writes: unknown[] = [];
  let notes: Record<string, unknown>[] = [];
  await mount((url, options) => {
    if (url === "/api/projects/p1/media") return Response.json({ items: [media], total: 1 });
    if (url.includes("/transcripts/current")) return Response.json({ detail: "Chưa có bản ghi" }, { status: 404 });
    if (url.includes("/bookmarks")) {
      if (options.method === "POST") {
        const body = JSON.parse(String(options.body));
        writes.push(body);
        notes = [{ bookmark_id: "b1", ...body }];
        return Response.json(notes[0], { status: 201 });
      }
      return Response.json({ items: notes, total: notes.length });
    }
    return Response.json({ items: [], total: 0 });
  }, { can_manage: false, can_edit: false }, "/projects/p1?tab=transcript&media=m1");
  const mark = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Đánh dấu thời điểm hiện tại"));
  expect(mark).toBeDefined();
  expect(mark!.disabled).toBe(true);
  expect(host.querySelector('input[type="file"]')).toBeNull();
  const audio = host.querySelector<HTMLAudioElement>("audio")!;
  audio.currentTime = 12.345;
  await act(() => audio.dispatchEvent(new Event("loadedmetadata")));
  expect(mark!.disabled).toBe(false);
  await act(() => mark!.click());
  const form = host.querySelector<HTMLFormElement>(".bookmark-form")!;
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(writes).toEqual([{ media_file_id: "m1", timestamp_ms: 12345, note: "" }]);
  audio.currentTime = 0;
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Mở dấu mốc tại 00:00:12"]')!.click());
  expect(audio.currentTime).toBe(12.345);
  await act(() => audio.dispatchEvent(new Event("error")));
  expect(mark!.disabled).toBe(true);
});

it("resets bookmark drafts and readiness when selecting another audio or video source", async () => {
  const requests: string[] = [];
  await mount(url => {
    requests.push(url);
    if (url === "/api/projects/p1/media") return Response.json({ items: [media, { ...media, media_file_id: "m2", media_kind_code: "ORIGINAL_VIDEO", mime_type: "video/mp4", file_name: "second.mp4", is_current: false }], total: 2 });
    if (url.includes("/bookmarks")) return Response.json({ items: [{ bookmark_id: "b1", media_file_id: "m1", timestamp_ms: 1000, note: "Ghi chú nguồn một" }], total: 1 });
    return Response.json({ items: [], total: 0 });
  });
  const audio = host.querySelector<HTMLAudioElement>("audio")!;
  await act(() => audio.dispatchEvent(new Event("loadedmetadata")));
  const mark = () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Đánh dấu thời điểm hiện tại"))!;
  expect(mark()).toBeDefined();
  await act(() => mark().click());
  expect(host.querySelector(".bookmark-form")).not.toBeNull();
  const select = host.querySelector<HTMLSelectElement>('[aria-label="Chọn tệp xem trước"]')!;
  await act(() => { select.value = "m2"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(requests).toContain("/api/projects/p1/bookmarks?media_file_id=m2");
  expect(host.querySelector(".bookmark-form")).toBeNull();
  expect(host.textContent).not.toContain("Ghi chú nguồn một");
  expect(mark().disabled).toBe(true);
  const video = host.querySelector<HTMLVideoElement>("video")!;
  await act(() => video.dispatchEvent(new Event("loadedmetadata")));
  expect(mark().disabled).toBe(false);
  await act(() => video.dispatchEvent(new Event("emptied")));
  expect(mark().disabled).toBe(true);
});

it("does not offer timestamped bookmarks for image sources", async () => {
  const requests: string[] = [];
  await mount(url => {
    requests.push(url);
    if (url === "/api/projects/p1/media") return Response.json({ items: [{ ...media, mime_type: "image/png", media_kind_code: "ORIGINAL_IMAGE", file_name: "image.png" }], total: 1 });
    if (url.endsWith("/download")) return new Response(new Blob(["image"], { type: "image/png" }));
    return Response.json({ items: [], total: 0 });
  });
  expect(host.querySelector(".bookmarks-panel")).toBeNull();
  expect(requests.some(url => url.includes("/bookmarks"))).toBe(false);
});
