// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import { api } from "../shared/api/client";
import type { Session } from "../shared/types";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const session: Session = {
  access_token: "test-access-token",
  user: {
    user_id: "test-user",
    email: "user@example.test",
    full_name: "Nguyễn Văn An",
    user_role_code: "MEMBER",
    is_active: true,
    created_at: "2026-11-12T00:00:00Z",
  },
};

const dashboard = {
  stats: { projects: 12, ready: 8, processing: 3, duration_ms: 3661000, storage_bytes: 1572864 },
  projects: [],
  activities: [],
};

const recentProject = {
  project_id: "recent-project",
  project_title: "Cuộc họp tuần",
  project_description: "",
  language_code: "vi",
  project_scope: "PERSONAL",
  company_id: null,
  company_name: null,
  project_type: "AUDIO",
  can_invite: true,
  project_status_code: "PROCESSING",
  owner_user_id: "test-user",
  owner_name: "Nguyễn Văn An",
  created_at: "2026-11-10T00:00:00Z",
  updated_at: "2026-11-11T00:00:00Z",
  deleted_at: null,
  can_manage: true,
  can_edit: true,
  member_count: 3,
  media_kind: "ORIGINAL_AUDIO",
  progress_percent: 42,
};

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  api.setSession(null);
  host = document.createElement("div");
  document.body.append(host);
  fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/auth/refresh")
      return Response.json({ detail: "Phiên đã hết hạn." }, { status: 401 });
    if (url === "/api/dashboard") return Response.json(dashboard);
    if (url === "/api/projects/recent-project") return Response.json(recentProject);
    if (url === "/api/projects/recent-project/media") return Response.json({ items: [], total: 0 });
    if (url.startsWith("/api/projects?")) return Response.json({ items: [], total: 0 });
    if (url.startsWith("/api/companies?")) return Response.json({ items: [], total: 0 });
    throw new Error(`Unexpected API call: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  api.setSession(null);
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function renderApp() {
  root = createRoot(host);
  await act(async () => root!.render(<App />));
}

async function click(label: string) {
  const button = Array.from(host.querySelectorAll("button")).find(
    (item) => item.textContent === label,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

async function fill(selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(selector)!;
  expect(input).not.toBeNull();
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    host.querySelector("form")!.requestSubmit();
  });
}

async function fillLogin() {
  await fill('[name="email"]', session.user.email);
  await fill('input[autocomplete="current-password"]', "TestPassword123");
}

it("opens login for a visitor and switches to the complete registration form", async () => {
  await renderApp();
  expect(window.location.pathname).toBe("/login");
  expect(host.querySelector("h2")?.textContent).toBe("Chào mừng trở lại");
  await click("Đăng ký");
  expect(host.querySelector("h2")?.textContent).toBe("Tạo tài khoản");
  expect(host.querySelector('[name="full_name"]')).not.toBeNull();
  expect(host.querySelectorAll('input[type="password"]')).toHaveLength(2);
  expect(host.querySelector('input[type="password"]')?.getAttribute("minlength")).toBe("10");
});

it("blocks mismatched registration passwords before contacting the API", async () => {
  await renderApp();
  await click("Đăng ký");
  await fill('[name="full_name"]', session.user.full_name);
  await fill('[name="email"]', session.user.email);
  await fill('input[type="password"]', "TestPassword123");
  await fill('label:last-of-type input', "DifferentPassword123");
  await submit();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Mật khẩu xác nhận chưa khớp.");
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/auth/refresh"]);
});

it("registers through the API then returns to login with cleared passwords", async () => {
  await renderApp();
  await click("Đăng ký");
  await fill('[name="full_name"]', session.user.full_name);
  await fill('[name="email"]', session.user.email);
  await fill('input[type="password"]', "TestPassword123");
  const passwords = host.querySelectorAll<HTMLInputElement>('input[type="password"]');
  await fill('label:last-of-type input', "TestPassword123");
  expect(passwords).toHaveLength(2);
  fetchMock.mockResolvedValueOnce(Response.json({ user_id: session.user.user_id }, { status: 201 }));
  await submit();
  const [, options] = fetchMock.mock.calls.at(-1)! as unknown as [string, RequestInit];
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/auth/register");
  expect(options.method).toBe("POST");
  expect(options.credentials).toBe("include");
  expect(JSON.parse(options.body as string)).toEqual({
    full_name: session.user.full_name,
    email: session.user.email,
    password: "TestPassword123",
  });
  expect(host.textContent).toContain("Đăng ký thành công.");
  expect(host.querySelector("h2")?.textContent).toBe("Chào mừng trở lại");
  expect(host.querySelector<HTMLInputElement>('input[type="password"]')?.value).toBe("");
});

it("locks registration fields until the pending request completes", async () => {
  await renderApp();
  await click("Đăng ký");
  await fill('[name="full_name"]', session.user.full_name);
  await fill('[name="email"]', session.user.email);
  await fill('input[type="password"]', "TestPassword123");
  await fill('label:last-of-type input', "TestPassword123");
  let finish!: (response: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve; }));
  await submit();
  const fields = Array.from(host.querySelectorAll("input"));
  const fieldsLocked = fields.every((field) => field.disabled);
  const submitLocked = host.querySelector<HTMLButtonElement>(".auth-submit")!.disabled;
  await act(async () => finish(Response.json({ user_id: session.user.user_id }, { status: 201 })));
  expect(fieldsLocked).toBe(true);
  expect(submitLocked).toBe(true);
  expect(host.querySelector<HTMLInputElement>('[name="email"]')?.value).toBe(session.user.email);
  expect(host.querySelector<HTMLInputElement>('[name="email"]')?.disabled).toBe(false);
});

it.each([
  { name: "", email: "user@example.test", password: "TestPassword123" },
  { name: "Nguyễn Văn An", email: "invalid-email", password: "TestPassword123" },
  { name: "Nguyễn Văn An", email: "user@example.test", password: "short1" },
  { name: "Nguyễn Văn An", email: "user@example.test", password: "NoDigitsInPassword" },
])("blocks invalid registration before making a request: %j", async ({ name, email, password }) => {
  await renderApp();
  await click("Đăng ký");
  await fill('[name="full_name"]', name);
  await fill('[name="email"]', email);
  await fill('input[type="password"]', password);
  await fill('label:last-of-type input', password);
  await submit();
  expect(host.querySelector("form")?.checkValidity()).toBe(false);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/auth/refresh"]);
  expect(host.querySelector("h2")?.textContent).toBe("Tạo tài khoản");
});

it("logs in through the API and shows the signed-in account", async () => {
  await renderApp();
  await fillLogin();
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await submit();
  const [url, options] = fetchMock.mock.calls.find(([url]) => url === "/api/auth/login")! as unknown as [string, RequestInit];
  expect(url).toBe("/api/auth/login");
  expect(options.method).toBe("POST");
  expect(JSON.parse(options.body as string)).toEqual({ email: session.user.email, password: "TestPassword123" });
  expect(host.querySelector("main h1")?.textContent).toBe("Tổng quan");
  expect(host.querySelector("main")?.textContent).toContain("Xin chào, An!");
  expect(host.textContent).toContain(session.user.full_name);
  expect(window.location.pathname).toBe("/");
});

it("shows an API login error and keeps the visitor on the login form", async () => {
  await renderApp();
  await fillLogin();
  fetchMock.mockResolvedValueOnce(Response.json({ detail: "Email hoặc mật khẩu không đúng." }, { status: 401 }));
  await submit();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Email hoặc mật khẩu không đúng.");
  expect(window.location.pathname).toBe("/login");
  expect(host.querySelector<HTMLButtonElement>('[type="submit"], .auth-submit')?.disabled).toBe(false);
  expect(Array.from(host.querySelectorAll("input")).every((field) => !field.disabled)).toBe(true);
});

it("restores an existing session without displaying the login form", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  expect(host.textContent).toContain(session.user.email);
  expect(host.querySelector(".auth-form")).toBeNull();
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/auth/refresh", "/api/dashboard"]);
});

it.each([
  ["ADMIN", "Bắt đầu một dự án"],
  ["COMPANY_OWNER", "Bắt đầu một dự án"],
  ["MEMBER", "Bắt đầu một dự án"],
  ["MANAGER", "Khám phá dự án"],
  ["VIEWER", "Khám phá dự án"],
] as const)("opens Dashboard with the correct project action for %s", async (role, action) => {
  fetchMock.mockResolvedValueOnce(Response.json({ ...session, user: { ...session.user, user_role_code: role } }));
  await renderApp();
  expect(host.querySelector("main h1")?.textContent).toBe("Tổng quan");
  expect(host.querySelector(".welcome-banner h2")?.textContent).toBe("Xin chào, An!");
  const link = host.querySelector<HTMLAnchorElement>('.welcome-banner a[href="/projects"]');
  expect(link?.textContent).toBe(action);
  await act(async () => link!.click());
  expect(host.querySelector("main h1")?.textContent).toBe("Dự án");
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain("/api/projects?q=&status=&deleted=false&page=1&page_size=20");
});

it("logs out only after confirmation then allows another login", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/logout"]')!.click());
  expect(host.textContent).toContain("Xác nhận đăng xuất");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await submit();
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/auth/logout");
  expect(host.textContent).toContain("Đã đăng xuất");
  await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/login"]')!.click());
  expect(host.querySelector("h2")?.textContent).toBe("Chào mừng trở lại");
});

it("renders the protected workspace shell and loads only the published Dashboard API", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  expect(host.querySelector('nav[aria-label="Điều hướng chính"]')).not.toBeNull();
  expect(host.querySelector("header")).not.toBeNull();
  expect(host.querySelector("main#main-content")).not.toBeNull();
  expect(host.querySelector("footer")).not.toBeNull();
  expect(host.querySelector('a[href="#main-content"]')).not.toBeNull();
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/auth/refresh", "/api/dashboard"]);
});

it("returns to the requested protected URL after login", async () => {
  window.history.replaceState(null, "", "/projects?view=personal#latest");
  await renderApp();
  expect(window.location.pathname).toBe("/login");
  expect(host.querySelector("aside")).toBeNull();
  expect(window.history.state?.usr?.from).toBe("/projects?view=personal#latest");
  await fillLogin();
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await submit();
  expect(window.location.pathname + window.location.search + window.location.hash)
    .toBe("/projects?view=personal#latest");
  expect(host.querySelector("main h1")?.textContent).toBe("Dự án");
});

it("renders the seven latest activities and labels system events", async () => {
  const activities = Array.from({ length: 8 }, (_, index) => ({
    audit_log_id: `audit-${index}`,
    action_name: index === 7 ? "Hoạt động cũ hơn" : "Cập nhật dự án",
    entity_name: "Dự án",
    entity_id: "recent-project",
    occurred_at: "2026-11-11T12:00:00Z",
    full_name: index === 0 ? "Trần Bình" : null,
    change_detail: null,
  }));
  fetchMock.mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(Response.json({
    ...dashboard, activities,
  }));
  await renderApp();
  const entries = host.querySelectorAll(".activity-list > li");
  expect(entries).toHaveLength(7);
  expect(entries[0].querySelector("strong")?.textContent).toBe("Trần Bình");
  expect(entries[1].querySelector("strong")?.textContent).toBe("Hệ thống");
  expect(entries[0].querySelector("p")?.textContent).toBe("Cập nhật dự án · Dự án");
  expect(entries[0].querySelector("time")?.textContent).toBe("11/11/2026");
  expect(entries[0].querySelector("time")?.getAttribute("datetime")).toBe("2026-11-11T12:00:00Z");
  expect(host.querySelector(".activity-card")?.textContent).not.toContain("Hoạt động cũ hơn");
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/auth/refresh", "/api/dashboard"]);
});

it("shows an empty activity message when the API returns no events", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  expect(host.querySelector(".activity-empty")?.textContent).toContain("Chưa có hoạt động được ghi nhận.");
  expect(host.querySelector(".activity-list")).toBeNull();
});

it("navigates between workspace sections and marks only the active sidebar link", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  const files = host.querySelector<HTMLAnchorElement>('nav a[href="/files"]');
  expect(files).not.toBeNull();
  await act(async () => files!.click());
  expect(window.location.pathname).toBe("/files");
  expect(files?.getAttribute("aria-current")).toBe("page");
  expect(host.querySelectorAll('nav a[aria-current="page"]')).toHaveLength(1);
  expect(host.querySelector("main h1")?.textContent).toBe("Kho tệp");
  expect(host.querySelector("main")?.textContent).toContain("sẽ được bổ sung");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("routes header search with trimmed query text without fabricating search results", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  expect(host.querySelector(".top-search")).not.toBeNull();
  await fill('.top-search input', "  tiếng Việt & phụ đề  ");
  await act(async () => host.querySelector<HTMLFormElement>(".top-search")!.requestSubmit());
  expect(window.location.pathname).toBe("/search");
  expect(new URLSearchParams(window.location.search).get("q")).toBe("tiếng Việt & phụ đề");
  expect(host.querySelector("main h1")?.textContent).toBe("Tìm kiếm nội dung");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("traps mobile menu focus and restores focus and scrolling after Escape", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  const sidebar = host.querySelector<HTMLElement>(".sidebar");
  expect(sidebar).not.toBeNull();
  const menu = host.querySelector<HTMLButtonElement>('[aria-label="Mở menu"]')!;
  expect(sidebar!.hasAttribute("inert")).toBe(true);
  await act(() => menu.click());
  expect(menu.getAttribute("aria-expanded")).toBe("true");
  expect(sidebar!.getAttribute("role")).toBe("dialog");
  expect(sidebar!.hasAttribute("inert")).toBe(false);
  expect(host.querySelector(".app-main")?.hasAttribute("inert")).toBe(true);
  expect(document.body.style.overflow).toBe("hidden");
  const controls = Array.from(sidebar!.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)'));
  controls.at(-1)!.focus();
  await act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
  expect(document.activeElement).toBe(controls[0]);
  await act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(sidebar!.hasAttribute("inert")).toBe(true);
  expect(menu.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(menu);
  expect(document.body.style.overflow).toBe("");
});

it("closes the mobile menu after following a section link", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  expect(host.querySelector('[aria-label="Mở menu"]')).not.toBeNull();
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Mở menu"]')!.click());
  await act(async () => host.querySelector<HTMLAnchorElement>('nav a[href="/files"]')!.click());
  expect(window.location.pathname).toBe("/files");
  expect(host.querySelector(".sidebar")?.hasAttribute("inert")).toBe(true);
  expect(host.querySelector(".app-main")?.hasAttribute("inert")).toBe(false);
  expect(host.querySelector(".sidebar-backdrop")).toBeNull();
});

it.each([
  ["MEMBER", null],
  ["ADMIN", "/admin"],
  ["COMPANY_OWNER", "/company"],
] as const)("shows management navigation for the %s role", async (role, managementPath) => {
  fetchMock.mockResolvedValueOnce(Response.json({ ...session, user: { ...session.user, user_role_code: role } }));
  await renderApp();
  expect(host.querySelector('nav[aria-label="Cài đặt"]')).not.toBeNull();
  const admin = host.querySelector('nav a[href="/admin"]');
  const company = host.querySelector('nav a[href="/company"]');
  expect(Boolean(admin)).toBe(managementPath === "/admin");
  expect(Boolean(company)).toBe(managementPath === "/company");
});

it("rejects direct management navigation by a member", async () => {
  window.history.replaceState(null, "", "/admin");
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  expect(host.querySelector("main h1")?.textContent).toBe("Bạn không có quyền truy cập");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("lets the user cancel logout and return to the previous workspace section", async () => {
  window.history.replaceState(null, "", "/files?kind=audio");
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  await act(async () => host.querySelector<HTMLAnchorElement>('a[aria-label="Đăng xuất"]')!.click());
  expect(host.textContent).toContain("Xác nhận đăng xuất");
  await click("Hủy");
  expect(window.location.pathname + window.location.search).toBe("/files?kind=audio");
  expect(host.querySelector("main h1")?.textContent).toBe("Kho tệp");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("renders Dashboard statistics from the authenticated API response", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  expect(Array.from(host.querySelectorAll(".stat-value"), (item) => item.textContent))
    .toEqual(["12", "8", "3", "01:01:01"]);
  expect(host.querySelector(".stats-grid")?.textContent).toContain("Đã lưu 1.5 MB");
  const request = fetchMock.mock.calls.find(([url]) => url === "/api/dashboard")!;
  expect(new Headers((request[1] as RequestInit).headers).get("Authorization"))
    .toBe("Bearer test-access-token");
});

it("shows zero statistics when the account has no projects", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(Response.json({
    ...dashboard,
    stats: { projects: 0, ready: 0, processing: 0, duration_ms: 0, storage_bytes: 0 },
  }));
  await renderApp();
  expect(Array.from(host.querySelectorAll(".stat-value"), (item) => item.textContent))
    .toEqual(["0", "0", "0", "00:00:00"]);
  expect(host.querySelector(".stats-grid")?.textContent).toContain("Đã lưu 0 B");
});

it("shows loading without invented statistics while Dashboard is pending", async () => {
  let finish!: (response: Response) => void;
  fetchMock.mockResolvedValueOnce(Response.json(session))
    .mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve; }));
  await renderApp();
  expect(host.querySelector('main [role="status"]')?.textContent).toContain("Đang tải dữ liệu");
  expect(host.querySelector(".stat-value")).toBeNull();
  await act(async () => finish(Response.json(dashboard)));
  expect(host.querySelector('main [role="status"]')).toBeNull();
  expect(host.querySelectorAll(".stat-card")).toHaveLength(4);
});

it("shows the Dashboard API error and reloads successfully on retry", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(
    Response.json({ detail: "Chưa thể tải tổng quan." }, { status: 503 }),
  );
  await renderApp();
  expect(host.querySelector('main [role="alert"]')?.textContent).toContain("Chưa thể tải tổng quan.");
  expect(host.querySelector(".stat-value")).toBeNull();
  await click("Thử lại");
  expect(host.querySelector('main [role="alert"]')).toBeNull();
  expect(host.querySelector(".stat-value")?.textContent).toBe("12");
  expect(fetchMock.mock.calls.map(([url]) => url))
    .toEqual(["/api/auth/refresh", "/api/dashboard", "/api/dashboard"]);
});

it("cancels the pending Dashboard request when leaving the page", async () => {
  let finish!: (response: Response) => void;
  fetchMock.mockResolvedValueOnce(Response.json(session))
    .mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve; }));
  await renderApp();
  const request = fetchMock.mock.calls.find(([url]) => url === "/api/dashboard")!;
  const signal = (request[1] as RequestInit).signal!;
  expect(signal.aborted).toBe(false);
  await act(async () => host.querySelector<HTMLAnchorElement>('nav a[href="/files"]')!.click());
  expect(signal.aborted).toBe(true);
  await act(async () => finish(Response.json(dashboard)));
  expect(host.querySelector("main h1")?.textContent).toBe("Kho tệp");
  expect(host.querySelector(".stat-value")).toBeNull();
});

it("renders recent project cards with their status, progress and destination", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(session)).mockResolvedValueOnce(Response.json({
    ...dashboard,
    projects: [recentProject, {
      ...recentProject, project_id: "ready-project", project_title: "Phỏng vấn",
      project_description: "Nội dung đã xử lý", project_status_code: "READY", media_kind: "ORIGINAL_VIDEO",
    }],
  }));
  await renderApp();
  const cards = host.querySelectorAll<HTMLAnchorElement>(".project-card");
  expect(cards).toHaveLength(2);
  expect(cards[0].querySelector("h3")?.textContent).toBe("Cuộc họp tuần");
  expect(cards[0].textContent).toContain("Chưa có mô tả dự án.");
  expect(cards[0].textContent).toContain("Đang xử lý");
  expect(cards[0].textContent).toContain("11/11/2026");
  expect(cards[0].querySelector(".project-card-bottom > span:last-child")?.textContent).toBe("3 thành viên");
  expect(cards[0].querySelector<HTMLElement>(".progress > span")?.style.width).toBe("42%");
  const progress = cards[0].querySelector('[role="progressbar"]');
  expect(progress?.getAttribute("aria-label")).toBe("Tiến độ Cuộc họp tuần");
  expect(progress?.getAttribute("aria-valuenow")).toBe("42");
  expect(cards[1].textContent).toContain("Nội dung đã xử lý");
  expect(cards[1].textContent).toContain("Hoàn thành");
  expect(cards[1].querySelector(".progress")).toBeNull();
  expect(cards[1].querySelector(".file-icon.blue")).not.toBeNull();
  await act(async () => cards[0].click());
  expect(window.location.pathname).toBe("/projects/recent-project");
  expect(host.querySelector("main h1")?.textContent).toBe("Cuộc họp tuần");
  expect(host.querySelector(".source-empty")?.textContent).toContain("Thêm tệp để bắt đầu");
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain("/api/projects/recent-project/media");
});

it.each([
  ["MEMBER", "Tạo dự án đầu tiên và thêm nội dung của bạn."],
  ["VIEWER", "Dự án sẽ xuất hiện khi quản lý thêm bạn vào."],
] as const)("shows the empty project guidance for %s", async (role, description) => {
  fetchMock.mockResolvedValueOnce(Response.json({ ...session, user: { ...session.user, user_role_code: role } }));
  await renderApp();
  expect(host.querySelector(".empty h3")?.textContent).toBe("Chưa có dự án");
  expect(host.querySelector(".empty p")?.textContent).toBe(description);
  const link = host.querySelector<HTMLAnchorElement>('.empty a[href="/projects"]');
  expect(link?.textContent).toBe("Đến dự án");
  await act(async () => link!.click());
  expect(host.querySelector("main h1")?.textContent).toBe("Dự án");
});
