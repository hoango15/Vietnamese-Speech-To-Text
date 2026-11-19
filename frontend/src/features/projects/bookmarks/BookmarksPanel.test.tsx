// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { BookmarksPanel } from "./BookmarksPanel";
import { NoticeProvider } from "../../../shared/ui/NoticeProvider";
import type { Media } from "../../../shared/types";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
const media: Media = { media_file_id: "m1", project_id: "p1", media_kind_code: "ORIGINAL_AUDIO", mime_type: "audio/wav",
  file_name: "hop.wav", file_size_bytes: 10, duration_ms: 60000, is_current: true, created_at: "2026-11-04T00:00:00Z" };
const bookmark = { bookmark_id: "b1", project_id: "p1", media_file_id: "m1", user_id: "u1", timestamp_ms: 12000,
  note: "Quyết định cần nhớ", created_at: "2026-11-04T00:00:00Z", updated_at: "2026-11-04T00:00:00Z" };
afterEach(async () => {
  if (root) await act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
async function mount(fetcher: (url: string, options: RequestInit) => Promise<Response>, ready = true) {
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"), player = document.createElement("audio");
  player.currentTime = 12.345;
  document.body.append(host, player);
  root = createRoot(host);
  await act(async () => root.render(<NoticeProvider><BookmarksPanel media={media} mediaRef={{ current: player }} ready={ready} /></NoticeProvider>));
  return { host, player };
}
function button(host: HTMLElement, text: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find(el => el.textContent?.includes(text));
  expect(found, `button ${text}`).toBeTruthy();
  return found!;
}
async function input(host: HTMLElement, name: string, value: string) {
  const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
  expect(field).toBeTruthy();
  await act(() => {
    const prototype = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit(host: HTMLElement) {
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
it("opens a saved private bookmark at its exact media timestamp", async () => {
  const { host, player } = await mount(async () => Response.json({ items: [bookmark], total: 1 }));
  expect(host.textContent).toContain(bookmark.note);
  player.currentTime = 0;
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Mở dấu mốc tại 00:00:12"]')!.click());
  expect(player.currentTime).toBe(12);
});
it("captures the playback position and displays the note only after a successful save", async () => {
  let items: typeof bookmark[] = [], body: Record<string, unknown> | undefined;
  const { host } = await mount(async (_url, options) => {
    if (options.method === "POST") {
      body = JSON.parse(options.body as string);
      const saved = { ...bookmark, ...body };
      items = [saved];
      return Response.json(saved, { status: 201 });
    }
    return Response.json({ items, total: items.length });
  });
  await act(() => button(host, "Đánh dấu thời điểm hiện tại").click());
  expect(host.querySelector<HTMLInputElement>('[name="timestamp"]')!.value).toBe("12.345");
  await input(host, "note", "Nội dung quan trọng");
  await submit(host);
  expect(body).toEqual({ media_file_id: "m1", timestamp_ms: 12345, note: "Nội dung quan trọng" });
  expect(host.textContent).toContain("Nội dung quan trọng");
  expect(host.querySelector("form")).toBeNull();
});
it("keeps the entered note when saving fails and rejects an out-of-range timestamp", async () => {
  let writes = 0;
  const { host } = await mount(async (_url, options) => {
    if (options.method === "POST") { writes++; return Response.json({ detail: "Máy chủ bận" }, { status: 503 }); }
    return Response.json({ items: [], total: 0 });
  });
  await act(() => button(host, "Đánh dấu thời điểm hiện tại").click());
  await input(host, "timestamp", "61");
  await submit(host);
  expect(writes).toBe(0);
  expect(host.querySelector('[role="alert"]')).toBeTruthy();
  await input(host, "timestamp", "8.5");
  await input(host, "note", "Bản nháp còn giữ");
  await submit(host);
  expect(writes).toBe(1);
  expect(host.querySelector<HTMLTextAreaElement>('[name="note"]')!.value).toBe("Bản nháp còn giữ");
  expect(document.body.textContent).toContain("Máy chủ bận");
  expect(document.body.textContent).not.toContain("Đã lưu dấu mốc.");
});
it("persists edits and removes a bookmark only after the delete request succeeds", async () => {
  let items = [bookmark];
  const { host } = await mount(async (_url, options) => {
    if (options.method === "PATCH") {
      items = [{ ...bookmark, ...JSON.parse(options.body as string) }];
      return Response.json(items[0]);
    }
    if (options.method === "DELETE") { items = []; return Response.json({ ok: true }); }
    return Response.json({ items, total: items.length });
  });
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Sửa dấu mốc tại 00:00:12"]')!.click());
  await input(host, "note", "Đã chỉnh ghi chú");
  await submit(host);
  expect(host.textContent).toContain("Đã chỉnh ghi chú");
  vi.stubGlobal("confirm", () => true);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Xóa dấu mốc tại 00:00:12"]')!.click());
  expect(host.textContent).not.toContain("Đã chỉnh ghi chú");
  expect(host.textContent).toContain("Chưa có dấu mốc");
});
it("offers retry for load errors and disables marking before the player is ready", async () => {
  let fails = true;
  const { host } = await mount(async () => fails ? Response.json({ detail: "Lỗi tải dấu mốc" }, { status: 503 })
    : Response.json({ items: [bookmark], total: 1 }), false);
  expect(host.textContent).toContain("Lỗi tải dấu mốc");
  expect(button(host, "Đánh dấu thời điểm hiện tại").disabled).toBe(true);
  fails = false;
  await act(async () => button(host, "Thử lại").click());
  expect(host.textContent).toContain(bookmark.note);
});

it("requests the selected media and shows an empty state for other media's notes", async () => {
  const requests: string[] = [];
  const { host } = await mount(async url => {
    requests.push(url);
    return Response.json({ items: [{ ...bookmark, media_file_id: "other" }], total: 1 });
  });
  expect(requests).toEqual(["/api/projects/p1/bookmarks?media_file_id=m1"]);
  expect(host.textContent).not.toContain(bookmark.note);
  expect(host.textContent).toContain("Chưa có dấu mốc");
});

it("keeps a note when deletion is cancelled or fails", async () => {
  let deletes = 0;
  const { host } = await mount(async (_url, options) => {
    if (options.method === "DELETE") {
      deletes++;
      return Response.json({ detail: "Không xóa được dấu mốc" }, { status: 503 });
    }
    return Response.json({ items: [bookmark], total: 1 });
  });
  const remove = host.querySelector<HTMLButtonElement>('[aria-label="Xóa dấu mốc tại 00:00:12"]')!;
  vi.stubGlobal("confirm", () => false);
  await act(async () => remove.click());
  expect(deletes).toBe(0);
  expect(host.textContent).toContain(bookmark.note);
  vi.stubGlobal("confirm", () => true);
  await act(async () => remove.click());
  expect(deletes).toBe(1);
  expect(host.textContent).toContain(bookmark.note);
  expect(document.body.textContent).toContain("Không xóa được dấu mốc");
});

it("sends only editable fields when updating a bookmark", async () => {
  let body: unknown;
  const { host } = await mount(async (_url, options) => {
    if (options.method === "PATCH") {
      body = JSON.parse(String(options.body));
      return Response.json({ ...bookmark, timestamp_ms: 1250, note: "Sửa dấu mốc" });
    }
    return Response.json({ items: [bookmark], total: 1 });
  });
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Sửa dấu mốc tại 00:00:12"]')!.click());
  await input(host, "timestamp", "1.25");
  await input(host, "note", "Sửa dấu mốc");
  await submit(host);
  expect(body).toEqual({ timestamp_ms: 1250, note: "Sửa dấu mốc" });
});
