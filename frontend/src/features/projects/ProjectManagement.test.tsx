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
async function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  expect(element).not.toBeNull();
  await act(() => {
    const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLInputElement ? "input" : "change", { bubbles: true }));
  });
}
async function submitDialog() {
  await act(() => document.querySelector("dialog form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
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

it("creates a personal project without inheriting the owner's company and reloads the list", async () => {
  const saved: unknown[] = [];
  await mount("/my-projects", (url, options) => {
    if (url === "/api/projects" && options.method === "POST") {
      saved.push(JSON.parse(String(options.body)));
      return Response.json(project);
    }
    return Response.json({ items: saved.length ? [project] : [], total: saved.length });
  });
  await act(() => button("Tạo dự án").click());
  const dialog = document.querySelector("dialog")!;
  expect(dialog).not.toBeNull();
  expect(dialog.querySelector<HTMLSelectElement>('[name="project_scope"]')?.value).toBe("PERSONAL");
  expect(dialog.querySelector<HTMLInputElement>('[name="project_title"]')?.required).toBe(true);
  await change(dialog.querySelector('[name="project_title"]')!, project.project_title);
  await change(dialog.querySelector('[name="project_type"]')!, "AUDIO");
  await submitDialog();
  expect(saved).toEqual([{ project_title: project.project_title, project_description: "", language_code: "vi", project_scope: "PERSONAL", project_type: "AUDIO" }]);
  expect(document.querySelector("dialog")).toBeNull();
  expect(host.querySelector("tbody")?.textContent).toContain(project.project_title);
});

it("keeps an admin's selected company when searching another page and submits the company project", async () => {
  const saved: unknown[] = [];
  const companyQueries: URLSearchParams[] = [];
  await mount("/projects", (url, options) => {
    if (url === "/api/projects" && options.method === "POST") { saved.push(JSON.parse(String(options.body))); return Response.json(project); }
    if (url.startsWith("/api/companies?")) {
      const query = new URL(url, "http://local").searchParams; companyQueries.push(query);
      return Response.json({ items: query.get("page") === "2" ? [{ company_id: "company21", company_name: "Công ty trang hai", owner_user_id: "owner", owner_name: "Chủ", owner_email: "owner@example.test", member_count: 0, project_count: 0, created_at: session.user.created_at }] : [], total: 21 });
    }
    return Response.json({ items: [], total: 0 });
  }, { ...session.user, user_role_code: "ADMIN" });
  await act(() => button("Tạo dự án").click());
  const dialog = document.querySelector("dialog")!;
  await change(dialog.querySelector('[name="project_scope"]')!, "TEAM");
  const select = dialog.querySelector<HTMLSelectElement>('[name="company_id"]')!;
  expect(select.required).toBe(true);
  expect(select.checkValidity()).toBe(false);
  await act(() => button("Sau", dialog).click());
  expect(saved).toEqual([]);
  expect(companyQueries.at(-1)?.get("page")).toBe("2");
  await change(select, "company21");
  await change(dialog.querySelector('[aria-label="Tìm công ty để chọn"]')!, "khác");
  expect(companyQueries.at(-1)?.get("page")).toBe("1");
  expect(select.value).toBe("company21");
  expect(select.selectedOptions[0]?.textContent).toBe("Công ty trang hai");
  await change(dialog.querySelector('[name="project_title"]')!, "Dự án công ty");
  await submitDialog();
  expect(saved).toEqual([{ project_title: "Dự án công ty", project_description: "", language_code: "vi", project_scope: "TEAM", company_id: "company21" }]);
});

it("preserves form values after a failed creation and allows retry", async () => {
  let failed = true;
  await mount("/my-projects", (url, options) => url === "/api/projects" && options.method === "POST"
    ? failed ? Response.json({ detail: "Không thể tạo dự án" }, { status: 409 }) : Response.json(project)
    : Response.json({ items: [], total: 0 }));
  await act(() => button("Tạo dự án").click());
  await change(document.querySelector('[name="project_title"]')!, "Dự án giữ lại");
  await submitDialog();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Không thể tạo dự án");
  expect(document.querySelector<HTMLInputElement>('[name="project_title"]')?.value).toBe("Dự án giữ lại");
  failed = false;
  await submitDialog();
  expect(document.querySelector("dialog")).toBeNull();
});

it("retries the company selector without submitting the project form", async () => {
  let failed = true;
  const mutations: string[] = [];
  await mount("/projects", (url, options) => {
    if (options.method && options.method !== "GET") mutations.push(url);
    if (url.startsWith("/api/companies?")) return failed
      ? Response.json({ detail: "Không tải được công ty" }, { status: 500 })
      : Response.json({ items: [], total: 0 });
    return Response.json({ items: [], total: 0 });
  }, { ...session.user, user_role_code: "ADMIN" });
  await act(() => button("Tạo dự án").click());
  const dialog = document.querySelector("dialog")!;
  await change(dialog.querySelector('[name="project_scope"]')!, "TEAM");
  await change(dialog.querySelector('[name="project_title"]')!, "Dự án");
  expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("Không tải được công ty");
  failed = false;
  await act(() => button("Thử lại", dialog).click());
  expect(mutations).toEqual([]);
  expect(dialog.querySelector('[role="alert"]')).toBeNull();
});

it("blocks an empty required title before submitting a project", async () => {
  const mutations: string[] = [];
  await mount("/my-projects", (url, options) => {
    if (options.method && options.method !== "GET") mutations.push(url);
    return Response.json({ items: [], total: 0 });
  });
  await act(() => button("Tạo dự án").click());
  const form = document.querySelector<HTMLFormElement>("dialog form")!;
  expect(form.checkValidity()).toBe(false);
  await act(() => form.requestSubmit());
  expect(mutations).toEqual([]);
  expect(document.querySelector("dialog")).not.toBeNull();
});

it("edits a managed project without changing its scope or company", async () => {
  const saved: { method?: string; body: unknown }[] = [];
  await mount("/projects", (url, options) => {
    if (url === "/api/projects/project" && options.method === "PATCH") {
      const body = JSON.parse(String(options.body)); saved.push({ method: options.method, body });
      return Response.json({ ...project, ...body });
    }
    return Response.json({ items: [{ ...project, project_title: saved.length ? "Tên đã sửa" : project.project_title }], total: 1 });
  });
  const edit = host.querySelector<HTMLButtonElement>('[aria-label="Sửa Cuộc họp sản phẩm"]');
  expect(edit).not.toBeNull();
  await act(() => edit!.click());
  expect(document.querySelector<HTMLInputElement>('[name="project_title"]')?.value).toBe(project.project_title);
  expect(document.querySelector('[name="project_scope"]')).toBeNull();
  await change(document.querySelector('[name="project_title"]')!, "Tên đã sửa");
  await submitDialog();
  expect(saved).toEqual([{ method: "PATCH", body: { project_title: "Tên đã sửa", project_description: project.project_description, language_code: "vi", project_type: "VIDEO" } }]);
  expect(document.querySelector("dialog")).toBeNull();
  expect(host.querySelector("tbody")?.textContent).toContain("Tên đã sửa");
});

it("hides editing for projects without management permission", async () => {
  await mount("/projects", () => Response.json({ items: [{ ...project, can_manage: false, can_edit: false }], total: 1 }), { ...session.user, user_role_code: "VIEWER" });
  expect(host.querySelector('[aria-label="Sửa Cuộc họp sản phẩm"]')).toBeNull();
  expect([...host.querySelectorAll("button")].some(item => item.textContent?.trim() === "Tạo dự án")).toBe(false);
});

it("keeps edited values visible when saving a project fails", async () => {
  await mount("/projects", (url, options) => options.method === "PATCH"
    ? Response.json({ detail: "Không có quyền sửa dự án" }, { status: 403 })
    : Response.json({ items: [project], total: 1 }));
  const edit = host.querySelector<HTMLButtonElement>('[aria-label="Sửa Cuộc họp sản phẩm"]');
  expect(edit).not.toBeNull();
  await act(() => edit!.click());
  await change(document.querySelector('[name="project_title"]')!, "Nội dung chưa lưu");
  await submitDialog();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("Không có quyền sửa dự án");
  expect(document.querySelector<HTMLInputElement>('[name="project_title"]')?.value).toBe("Nội dung chưa lưu");
});
