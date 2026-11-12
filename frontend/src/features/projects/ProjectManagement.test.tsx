// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import App from "../../app/App";
import { api } from "../../shared/api/client";
import type { Project, Session } from "../../shared/types";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const session: Session = {
  access_token: "token",
  user: { user_id: "owner", email: "owner@example.test", full_name: "Chủ dự án", user_role_code: "COMPANY_OWNER", company_id: "company", is_active: true, created_at: "2026-11-12T00:00:00Z" },
};
const project: Project = {
  project_id: "project", project_title: "Cuộc họp sản phẩm", project_description: "Nội dung cuộc họp",
  language_code: "vi", project_scope: "PERSONAL", project_type: "VIDEO", project_status_code: "DRAFT",
  owner_user_id: "owner", owner_name: "Chủ dự án", created_at: "2026-11-12T00:00:00Z", updated_at: "2026-11-12T00:00:00Z",
  deleted_at: null, can_manage: true, can_edit: true, member_count: 1,
};
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
type Handler = (url: string, options: RequestInit) => Response | Promise<Response>;
async function mount(path = "/projects", handler: Handler = () => Response.json({ items: [project], total: 1 }), actor = session.user) {
  api.setSession(null);
  window.history.replaceState(null, "", path);
  vi.stubGlobal("fetch", (url: string, options: RequestInit = {}) => url === "/api/auth/refresh"
    ? Promise.resolve(Response.json({ ...session, user: actor })) : Promise.resolve(handler(url, options)));
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<App />));
}
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  api.setSession(null);
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
function button(text: string, scope: ParentNode = host) {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === text);
  expect(found, `Button ${text}`).toBeDefined();
  return found!;
}

it("opens the project list through its protected route and displays API results", async () => {
  await mount();
  expect(host.querySelector("tbody")?.textContent).toContain(project.project_title);
  expect(host.querySelector('tbody a')?.getAttribute("href")).toBe("/projects/project");
  expect(host.querySelector("tbody details")?.textContent).toContain(project.owner_name);
});

it("enforces personal ownership despite conflicting URL filters and resets pagination on type changes", async () => {
  const queries: URLSearchParams[] = [];
  await mount("/my-projects?scope=TEAM&company_id=foreign&project_type=IMAGE&page=3&status=READY&q=abc", url => {
    queries.push(new URL(url, "http://local").searchParams);
    return Response.json({ items: [], total: 0 });
  });
  expect(Object.fromEntries(queries.at(-1)!)).toMatchObject({ scope: "PERSONAL", owned: "true", page: "3", project_type: "IMAGE", status: "READY", q: "abc" });
  expect(queries.at(-1)!.has("company_id")).toBe(false);
  expect(button("Trước").disabled).toBe(false);
  await act(() => button("Âm thanh").click());
  expect(Object.fromEntries(queries.at(-1)!)).toMatchObject({ scope: "PERSONAL", owned: "true", page: "1", project_type: "AUDIO" });
});

it.each(["0", "-1", "abc", "1.5", "9007199254740992"])("normalizes invalid page %s before requesting projects", async page => {
  const queries: URLSearchParams[] = [];
  await mount(`/projects?page=${page}`, url => {
    queries.push(new URL(url, "http://local").searchParams);
    return Response.json({ items: [], total: 0 });
  });
  expect(queries.at(-1)?.get("page")).toBe("1");
});

it("retries a failed project list request", async () => {
  let failed = true;
  await mount("/projects", () => failed ? Response.json({ detail: "Không tải được dự án" }, { status: 500 }) : Response.json({ items: [project], total: 1 }));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Không tải được dự án");
  failed = false;
  await act(() => button("Thử lại").click());
  expect(host.querySelector("tbody")?.textContent).toContain(project.project_title);
});
