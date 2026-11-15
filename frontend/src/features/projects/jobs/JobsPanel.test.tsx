// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { JobsPanel } from "./JobsPanel";
import type { Project } from "../../../shared/types";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if (root) await act(() => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
const project = { project_id: "p1", can_edit: true } as Project;

it("restores filters from URL, preserves the tab, and resets pagination when filtering", async () => {
  const requests: URL[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    requests.push(new URL(url, "http://localhost"));
    return Response.json({ items: [], total: 45 });
  });
  const router = createMemoryRouter([{ path: "/projects/:id", element: <JobsPanel project={project} /> }], {
    initialEntries: ["/projects/p1?tab=jobs&jobs_q=hop.wav&jobs_status=CANCELED&jobs_page=2"],
  });
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<RouterProvider router={router} />));
  expect(requests.at(-1)?.searchParams.get("q")).toBe("hop.wav");
  expect(requests.at(-1)?.searchParams.get("status")).toBe("CANCELED");
  expect(requests.at(-1)?.searchParams.get("page")).toBe("2");
  const select = host.querySelector<HTMLSelectElement>('select[aria-label="Trạng thái tác vụ"]');
  expect(select).not.toBeNull();
  await act(() => { select!.value = "FAILED"; select!.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(router.state.location.search).toContain("tab=jobs");
  expect(requests.at(-1)?.searchParams.get("status")).toBe("FAILED");
  expect(requests.at(-1)?.searchParams.get("page")).toBe("1");
  expect(host.textContent).toContain("45 kết quả");
  await act(() => [...host.querySelectorAll("button")].find(button => button.textContent === "Sau")!.click());
  expect(requests.at(-1)?.searchParams.get("page")).toBe("2");
});

it("retries a failed history request and renders the empty result", async () => {
  let failed = true;
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    requests.push(url);
    return failed ? Response.json({ detail: "Không tải được lịch sử" }, { status: 503 }) : Response.json({ items: [], total: 0 });
  });
  const router = createMemoryRouter([{ path: "/projects/:id", element: <JobsPanel project={project} /> }], {
    initialEntries: ["/projects/p1?tab=jobs&jobs_page=-1"],
  });
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<RouterProvider router={router} />));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Không tải được lịch sử");
  failed = false;
  await act(() => [...host.querySelectorAll("button")].find(button => button.textContent === "Thử lại")!.click());
  expect(host.textContent).toContain("Chưa có lần xử lý nào");
  expect(requests).toEqual(["/api/projects/p1/jobs?q=&page=1&page_size=20", "/api/projects/p1/jobs?q=&page=1&page_size=20"]);
});
