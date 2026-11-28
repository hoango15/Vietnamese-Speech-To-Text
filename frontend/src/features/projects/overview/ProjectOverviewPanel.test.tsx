// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import type { Project } from "../../../shared/types";
import { ProjectOverviewPanel } from "./ProjectOverviewPanel";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const project: Project = {
  project_id: "p1", project_title: "Dự án", project_description: "", language_code: "vi",
  project_scope: "TEAM", project_status_code: "DRAFT", owner_user_id: "owner", owner_name: "Chủ dự án",
  created_at: "2026-11-12T00:00:00Z", updated_at: "2026-11-12T00:00:00Z", deleted_at: null,
  can_manage: false, can_edit: false, member_count: 2,
};
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
async function mount(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", handler);
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  const router = createMemoryRouter([{ path: "/projects/p1", element: <ProjectOverviewPanel project={project} media={[]} /> }], {
    initialEntries: ["/projects/p1?media=m1"],
  });
  await act(async () => root!.render(<RouterProvider router={router} />));
}
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined; document.body.innerHTML = ""; vi.unstubAllGlobals();
});

it("shows loading before member and activity results, then empty states and viewer permissions", async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  await mount(async () => { await pending; return Response.json({ items: [], total: 0 }); });
  expect(host.querySelector(".loading")).not.toBeNull();
  expect(host.textContent).not.toContain("Chưa có hoạt động gần đây");
  await act(async () => finish());
  expect(host.querySelector(".loading")).toBeNull();
  expect(host.textContent).toContain("Chưa có tệp nguồn");
  expect(host.textContent).toContain("Chưa có hoạt động gần đây");
  expect(host.textContent).toContain("Dự án chưa chạy tác vụ xử lý");
  expect(host.querySelector(".overview-permission")?.textContent).toContain("Bạn có thể xem nội dung và tải các kết quả đã được chia sẻ.");
  expect(host.querySelector('a[href="/projects/p1?tab=content&media=m1"]')?.textContent).toContain("Xem nội dung dự án");
});

it("refreshes failed member and job summaries without navigating away", async () => {
  let failed = true;
  await mount(url => {
    if (failed && !url.endsWith("/activities")) return Response.json({ detail: url.endsWith("/members") ? "Không tải được thành viên" : "Không tải được tác vụ" }, { status: 503 });
    return Response.json({ items: [], total: 0 });
  });
  expect(host.querySelectorAll('[role="alert"]').length).toBe(2);
  expect(host.textContent).toContain("Không tải được thành viên");
  expect(host.textContent).toContain("Không tải được tác vụ");
  failed = false;
  await act(() => [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Làm mới")!.click());
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.textContent).toContain("Dự án chưa chạy tác vụ xử lý");
});
