// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../../shared/api/client";
import type { Project } from "../../../shared/types";
import { NoticeProvider } from "../../../shared/ui/NoticeProvider";
import { OCREditor } from "./OCREditor";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const documentData = { ocr_document_id: "o1", project_id: "p1", revision: 2, text: "Nội dung nhận dạng", language_code: "vi", created_at: "2026-11-05T00:00:00Z" };
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
const dirty = vi.fn();
async function mount(handler: (url: string, options: RequestInit) => Response | Promise<Response> = url => Response.json(url.includes("/versions") ? { items: [], total: 0 } : documentData), canEdit = false) {
  vi.stubGlobal("fetch", (url: string, options: RequestInit = {}) => Promise.resolve(handler(url, options)));
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(() => root!.render(<NoticeProvider><OCREditor project={{ project_id: "p1", can_edit: canEdit } as Project} mediaId="image 2" reportDirty={dirty} /></NoticeProvider>));
}
function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === label || item.getAttribute("aria-label") === label)!;
}
async function edit(text: string) {
  const textarea = host.querySelector<HTMLTextAreaElement>("textarea")!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, text);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined; api.setSession(null); vi.unstubAllGlobals(); vi.restoreAllMocks(); dirty.mockClear(); document.body.innerHTML = "";
});

it("reads OCR and history for the selected media without exposing viewer edits", async () => {
  const requests: string[] = [];
  await mount(url => { requests.push(url); return Response.json(url.includes("/versions") ? { items: [], total: 0 } : documentData); });
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Nội dung nhận dạng");
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.readOnly).toBe(true);
  expect(button("Lưu")).toBeUndefined();
  expect(requests).toContain("/api/projects/p1/ocr?media_file_id=image%202");
  await act(() => button("Lịch sử OCR").click());
  expect(requests).toContain("/api/projects/p1/ocr/versions?media_file_id=image%202");
  expect(host.textContent).toContain("Chưa có lịch sử");
});

it("shows every history snapshot even when the first item has an older revision", async () => {
  await mount(url => Response.json(url.includes("/versions") ? { items: [
    { ocr_version_id: "v1", ocr_document_id: "o1", revision: 1, text: "Bản cũ", created_at: "2026-11-06T00:00:00Z" },
    { ocr_version_id: "o1:current", ocr_document_id: "o1", revision: 2, text: "Nội dung nhận dạng", created_at: "2026-11-05T00:00:00Z" },
  ], total: 2 } : documentData));
  await act(() => button("Lịch sử OCR").click());
  const snapshots = [...host.querySelectorAll("details")];
  expect(snapshots).toHaveLength(2);
  expect(snapshots[0].textContent).toContain("Bản cũ");
  expect(snapshots[1].textContent).toContain("Nội dung nhận dạng");
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Nội dung nhận dạng");
});

it("treats missing OCR as empty instead of a load error", async () => {
  await mount(url => url.includes("/versions") ? Response.json({ items: [], total: 0 }) : Response.json({ detail: "Chưa có OCR" }, { status: 404 }));
  expect(host.textContent).toContain("Chưa có văn bản OCR");
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("retries a failed OCR load", async () => {
  let failed = true;
  await mount(url => Response.json(url.includes("/versions") ? { items: [], total: 0 } : failed ? { detail: "Máy chủ tạm lỗi" } : documentData, { status: !url.includes("/versions") && failed ? 503 : 200 }));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Máy chủ tạm lỗi");
  failed = false;
  await act(() => button("Thử lại").click());
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Nội dung nhận dạng");
});

it("retries history errors without replacing the displayed document", async () => {
  let failed = true;
  await mount(url => !url.includes("/versions") ? Response.json(documentData) : failed ? Response.json({ detail: "Lỗi lịch sử" }, { status: 503 }) : Response.json({ items: [{ ocr_version_id: "v1", ocr_document_id: "o1", revision: 1, text: "Bản cũ", created_at: documentData.created_at }], total: 1 }));
  await act(() => button("Lịch sử OCR").click());
  expect(document.querySelector("dialog")?.textContent).toContain("Lỗi lịch sử");
  failed = false;
  await act(() => button("Thử lại").click());
  expect(host.querySelector("details")?.textContent).toContain("Bản cũ");
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Nội dung nhận dạng");
});

it("saves the current revision and refreshes history, including an empty text edit", async () => {
  const patches: { url: string; body: unknown }[] = [];
  let historyLoads = 0;
  await mount((url, options) => {
    if (options.method === "PATCH") {
      patches.push({ url, body: JSON.parse(String(options.body)) });
      return Response.json({ ...documentData, text: "", revision: 3 });
    }
    if (url.includes("/versions")) { historyLoads++; return Response.json({ items: [], total: 0 }); }
    return Response.json(documentData);
  }, true);
  expect(button("Lưu")).toBeDefined();
  expect(button("Lưu").disabled).toBe(true);
  await edit("");
  expect(dirty).toHaveBeenLastCalledWith(true);
  await act(() => button("Lưu").click());
  expect(patches).toEqual([{ url: "/api/ocr/o1", body: { revision: 2, text: "" } }]);
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("");
  expect(host.textContent).toContain("Revision 3");
  expect(historyLoads).toBe(2);
  expect(button("Lưu").disabled).toBe(true);
  expect(dirty).toHaveBeenLastCalledWith(false);
});

it("locks the draft and prevents duplicate writes while a save is pending", async () => {
  let resolve!: (response: Response) => void;
  let writes = 0;
  await mount((url, options) => options.method === "PATCH" ? (writes++, new Promise<Response>(done => { resolve = done; })) : Response.json(url.includes("/versions") ? { items: [], total: 0 } : documentData), true);
  await edit("Đã sửa");
  expect(button("Lưu")).toBeDefined();
  await act(() => { button("Lưu").click(); button("Lưu").click(); });
  expect(writes).toBe(1);
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.readOnly).toBe(true);
  expect(button("Cập nhật OCR").disabled).toBe(true);
  await act(() => resolve(Response.json({ ...documentData, text: "Đã sửa", revision: 3 })));
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.readOnly).toBe(false);
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Đã sửa");
});

it("preserves the dirty draft and reports the backend revision conflict", async () => {
  await mount((url, options) => options.method === "PATCH" ? Response.json({ detail: "OCR đã thay đổi. Hãy tải lại trước khi lưu." }, { status: 409 }) : Response.json(url.includes("/versions") ? { items: [], total: 0 } : documentData), true);
  await edit("Bản nháp cần giữ");
  expect(button("Lưu")).toBeDefined();
  await act(() => button("Lưu").click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("OCR đã thay đổi");
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Bản nháp cần giữ");
  expect(button("Lưu").disabled).toBe(false);
  expect(dirty).toHaveBeenLastCalledWith(true);
});

it("requires discard confirmation before refreshing an unsaved draft", async () => {
  let reads = 0;
  const confirm = vi.fn(() => false); vi.stubGlobal("confirm", confirm);
  await mount(url => { if (url.includes("/versions")) return Response.json({ items: [], total: 0 }); reads++; return Response.json(documentData); }, true);
  await edit("Giữ lại");
  await act(() => button("Cập nhật OCR").click());
  expect(confirm).toHaveBeenCalledOnce();
  expect(reads).toBe(1);
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Giữ lại");
  confirm.mockReturnValue(true);
  await act(() => button("Cập nhật OCR").click());
  expect(reads).toBe(2);
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Nội dung nhận dạng");
  expect(dirty).toHaveBeenLastCalledWith(false);
});

it("blocks saving an obsolete draft while a confirmed refresh is still loading", async () => {
  let reads = 0;
  let resolve!: (response: Response) => void;
  vi.stubGlobal("confirm", () => true);
  await mount(url => url.includes("/versions") ? Response.json({ items: [], total: 0 }) : ++reads === 1 ? Response.json(documentData) : new Promise<Response>(done => { resolve = done; }), true);
  await edit("Bản nháp cũ");
  await act(() => button("Cập nhật OCR").click());
  expect(button("Lưu").disabled).toBe(true);
  await act(() => resolve(Response.json({ ...documentData, revision: 3, text: "Kết quả mới" })));
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Kết quả mới");
  expect(dirty).toHaveBeenLastCalledWith(false);
});
