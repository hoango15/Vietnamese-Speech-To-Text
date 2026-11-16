// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { NoticeProvider } from "../../shared/ui/NoticeProvider";
import { DashboardPage } from "./DashboardPage";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
let requests: { path: string; method: string }[];
let records: ReturnType<typeof entry>[];
let failDelete = false;
let failAudit = false;
let waitForDelete: Promise<void> | undefined;
function entry(id: number, canDelete = true) {
  return { audit_log_id: String(id), full_name: "Thành viên", action_name: "UPDATE", entity_name: "project",
    entity_id: `p${id}`, occurred_at: "2026-11-16T00:00:00Z", can_delete: canDelete };
}
afterEach(async () => {
  if (root) await act(() => root.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks(); vi.unstubAllGlobals(); failDelete = false; failAudit = false; waitForDelete = undefined;
});
async function mount() {
  requests = [];
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("fetch", async (path: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    requests.push({ path, method });
    if (path === "/api/dashboard") return Response.json({ stats: { projects: 0, ready: 0, processing: 0,
      duration_ms: 0, storage_bytes: 0 }, projects: [], activities: records.slice(0, 7) });
    const url = new URL(path, "http://localhost");
    if (method === "DELETE") {
      if (waitForDelete) await waitForDelete;
      if (failDelete) return Response.json({ detail: "Không xóa được nhật ký" }, { status: 503 });
      const id = url.pathname.match(/^\/api\/audit-logs\/(\d+)$/)?.[1];
      const before = records.length;
      records = records.filter(record => !record.can_delete || (id && record.audit_log_id !== id));
      return Response.json({ ok: true, deleted: before - records.length });
    }
    if (failAudit) return Response.json({ detail: "Activity unavailable" }, { status: 503 });
    const page = Number(url.searchParams.get("page") ?? 1);
    const size = Number(url.searchParams.get("page_size") ?? 20);
    return Response.json({ items: records.slice((page - 1) * size, page * size), total: records.length,
      deletable_total: records.filter(record => record.can_delete).length });
  });
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<NoticeProvider><MemoryRouter initialEntries={["/"]}>
    <DashboardPage />
  </MemoryRouter></NoticeProvider>));
  return host;
}
function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === label);
  expect(found, `Missing button ${label}`).toBeDefined();
  return found!;
}

it("paginates dashboard activities on the server with seven entries per page", async () => {
  records = Array.from({ length: 10 }, (_, index) => entry(index + 1));
  const host = await mount();
  expect(requests.some(item => item.path === "/api/audit-logs?page=1&page_size=7")).toBe(true);
  expect(host.querySelectorAll(".activity-item")).toHaveLength(7);
  await act(async () => button("Sau").click());
  expect(requests.at(-1)?.path).toBe("/api/audit-logs?page=2&page_size=7");
  expect(host.querySelectorAll(".activity-item")).toHaveLength(3);
  expect(host.textContent).toContain("10 kết quả · Trang 2/2");
});

it("retries a failed activity request without losing dashboard statistics", async () => {
  records = [entry(1)];
  failAudit = true;
  const host = await mount();
  expect(host.textContent).toContain("Activity unavailable");
  expect(host.querySelectorAll(".stat-value")).toHaveLength(4);
  failAudit = false;
  await act(async () => button("Thử lại").click());
  expect(host.querySelectorAll(".activity-item")).toHaveLength(1);
  expect(host.textContent).not.toContain("Activity unavailable");
});

it("confirms row deletion and corrects an emptied dashboard last page", async () => {
  records = Array.from({ length: 8 }, (_, index) => entry(index + 1));
  const host = await mount();
  await act(async () => button("Sau").click());
  expect(host.querySelector('[aria-label="Xóa nhật ký 8"]')).not.toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Xóa nhật ký 8"]')!.click());
  expect(window.confirm).toHaveBeenCalled();
  expect(requests).toContainEqual({ path: "/api/audit-logs/8", method: "DELETE" });
  expect(host.textContent).toContain("7 kết quả · Trang 1/1");
  expect(host.querySelectorAll(".activity-item")).toHaveLength(7);
});

it("keeps records when confirmation is canceled or deletion fails", async () => {
  records = [entry(1)];
  const host = await mount();
  expect(host.querySelector('[aria-label="Xóa nhật ký 1"]')).not.toBeNull();
  vi.mocked(window.confirm).mockReturnValue(false);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Xóa nhật ký 1"]')!.click());
  expect(requests.some(item => item.method === "DELETE")).toBe(false);
  vi.mocked(window.confirm).mockReturnValue(true);
  failDelete = true;
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Xóa nhật ký 1"]')!.click());
  expect(host.querySelectorAll(".activity-item")).toHaveLength(1);
  expect(host.textContent).toContain("Không xóa được nhật ký");
});

it("sends only one delete request for repeated clicks and refreshes the current dashboard page", async () => {
  records = Array.from({ length: 10 }, (_, index) => entry(index + 1));
  const host = await mount();
  let finish!: () => void;
  waitForDelete = new Promise<void>(resolve => { finish = resolve; });
  const remove = host.querySelector<HTMLButtonElement>('[aria-label="Xóa nhật ký 1"]')!;
  expect(remove).not.toBeNull();
  await act(() => { remove.click(); remove.click(); });
  expect(requests.filter(item => item.method === "DELETE")).toHaveLength(1);
  await act(async () => button("Sau").click());
  await act(async () => finish());
  expect(requests.at(-1)?.path).toBe("/api/audit-logs?page=2&page_size=7");
  expect(host.querySelectorAll(".activity-item")).toHaveLength(2);
  expect(host.textContent).toContain("9 kết quả · Trang 2/2");
});
