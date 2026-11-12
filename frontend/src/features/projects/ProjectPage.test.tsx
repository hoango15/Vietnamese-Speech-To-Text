// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import App from "../../app/App";
import { api } from "../../shared/api/client";
import type { Session } from "../../shared/types";

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
async function mount(handler: (url: string, options: RequestInit) => Response | Promise<Response> = () => Response.json({ items: [media], total: 1 })) {
  api.setSession(null);
  window.history.replaceState(null, "", "/projects/p1");
  vi.stubGlobal("fetch", (url: string, options: RequestInit = {}) => Promise.resolve(url === "/api/auth/refresh"
    ? Response.json(session) : url === "/api/projects/p1" ? Response.json(project) : handler(url, options)));
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<App />));
}
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined; api.setSession(null); vi.unstubAllGlobals(); document.body.innerHTML = "";
});

it("opens project files from the protected detail route with size and duration", async () => {
  await mount();
  expect(host.querySelector("main h1")?.textContent).toBe(project.project_title);
  expect(host.querySelector(".media-info")?.textContent).toContain("hop.wav");
  expect(host.querySelector(".media-info")?.textContent).toContain("2.0 KB");
  expect(host.querySelector(".media-info")?.textContent).toContain("00:01:05");
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
