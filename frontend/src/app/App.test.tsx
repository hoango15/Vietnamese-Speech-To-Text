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
let fetchMock: ReturnType<typeof vi.fn<(url: string, options?: RequestInit) => Promise<Response>>>;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  api.setSession(null);
  host = document.createElement("div");
  document.body.append(host);
  fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/auth/refresh")
      return Response.json({ detail: "Phiên đã hết hạn." }, { status: 401 });
    if (url === "/api/dashboard") return Response.json(dashboard);
    if (url === "/api/audit-logs?page=1&page_size=7")
      return Response.json({ items: [], total: 0, deletable_total: 0 });
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

function mockDashboardResponse(response: Response | Promise<Response>) {
  const defaultFetch = fetchMock.getMockImplementation()!;
  let pending = true;
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url === "/api/dashboard" && pending) {
      pending = false;
      return response;
    }
    return defaultFetch(url, options);
  });
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

async function choose(selector: string, value: string) {
  const select = host.querySelector<HTMLSelectElement>(selector)!;
  expect(select).not.toBeNull();
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
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
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/auth/refresh", "/api/dashboard", "/api/audit-logs?page=1&page_size=7"]);
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
  expect(fetchMock).toHaveBeenCalledTimes(3);
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await submit();
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/auth/logout");
  expect(host.textContent).toContain("Đã đăng xuất");
  await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/login"]')!.click());
  expect(host.querySelector("h2")?.textContent).toBe("Chào mừng trở lại");
});

it("renders the protected workspace shell and loads the Dashboard and activity APIs", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  expect(host.querySelector('nav[aria-label="Điều hướng chính"]')).not.toBeNull();
  expect(host.querySelector("header")).not.toBeNull();
  expect(host.querySelector("main#main-content")).not.toBeNull();
  expect(host.querySelector("footer")).not.toBeNull();
  expect(host.querySelector('a[href="#main-content"]')).not.toBeNull();
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/auth/refresh", "/api/dashboard", "/api/audit-logs?page=1&page_size=7"]);
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
  const defaultFetch = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) =>
    url === "/api/audit-logs?page=1&page_size=7"
      ? Response.json({ items: activities.slice(0, 7), total: activities.length, deletable_total: 0 })
      : defaultFetch(url, options));
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  const entries = host.querySelectorAll(".activity-list > li");
  expect(entries).toHaveLength(7);
  expect(entries[0].querySelector("strong")?.textContent).toBe("Trần Bình");
  expect(entries[1].querySelector("strong")?.textContent).toBe("Hệ thống");
  expect(entries[0].querySelector("p")?.textContent).toBe("Cập nhật dự án · Dự án");
  expect(entries[0].querySelector("time")?.textContent).toBe("11/11/2026");
  expect(entries[0].querySelector("time")?.getAttribute("datetime")).toBe("2026-11-11T12:00:00Z");
  expect(host.querySelector(".activity-card")?.textContent).not.toContain("Hoạt động cũ hơn");
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/auth/refresh", "/api/dashboard", "/api/audit-logs?page=1&page_size=7"]);
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
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("routes header search and loads transcript matches for the trimmed query", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  const defaultFetch = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url.startsWith("/api/search/transcripts?")) {
      const filtered = url.includes("project_id=project-2");
      return Response.json({
        items: [{
          project_id: filtered ? "project-2" : "project-1", project_title: filtered ? "Dự án lọc" : "Cuộc họp tuần", media_file_id: "media-1",
          segment_no: 2, start_ms: 65000, end_ms: 69000, segment_text: "Tiếng Việt và phụ đề",
          speaker_name: "Nguyễn An",
        }],
        total: 1,
        projects: [{ project_id: "project-1", project_title: "Cuộc họp tuần" }, { project_id: "project-2", project_title: "Dự án lọc" }],
      });
    }
    return defaultFetch(url, options);
  });
  expect(host.querySelector(".top-search")).not.toBeNull();
  await fill('.top-search input', "  tiếng Việt & phụ đề  ");
  await act(async () => host.querySelector<HTMLFormElement>(".top-search")!.requestSubmit());
  expect(window.location.pathname).toBe("/search");
  expect(new URLSearchParams(window.location.search).get("q")).toBe("tiếng Việt & phụ đề");
  expect(host.querySelector("main h1")?.textContent).toBe("Tìm kiếm nội dung");
  expect(host.querySelector(".search-result")?.textContent).toContain("Tiếng Việt và phụ đề");
  expect(host.querySelector(".search-result")?.textContent).toContain("00:01:05");
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
    "/api/search/transcripts?q=ti%E1%BA%BFng%20Vi%E1%BB%87t%20%26%20ph%E1%BB%A5%20%C4%91%E1%BB%81&page=1&page_size=20",
  );
  expect(fetchMock).toHaveBeenCalledTimes(4);
  await choose('[aria-label="Lọc kết quả theo dự án"]', "project-2");
  expect(host.querySelector(".search-result-body > a strong")?.textContent).toBe("Dự án lọc");
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain("/api/search/transcripts?q=ti%E1%BA%BFng%20Vi%E1%BB%87t%20%26%20ph%E1%BB%A5%20%C4%91%E1%BB%81&page=1&page_size=20&project_id=project-2");
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Xóa nội dung tìm kiếm"]')!.click());
  expect(window.location.search).toBe("");
  expect(host.querySelector(".search-result")).toBeNull();
  expect(host.querySelector(".empty")?.textContent).toContain("Nhập từ khóa");
});

it("loads notifications and marks a selected item as read", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  const defaultFetch = fetchMock.getMockImplementation()!;
  let markedAsRead = false;
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url.startsWith("/api/notifications?unread_only=false&page=1&page_size=20")) {
      const matchesType = !url.includes("type_code=JOB_FAILED");
      return Response.json({
        items: matchesType ? [{
          notification_id: "notification-1", notification_type_code: "PROJECT_UPDATE",
          title: "Dự án được cập nhật", message: "An đã cập nhật cuộc họp tuần.",
          created_at: "2026-11-19T10:00:00Z", read_at: markedAsRead ? "2026-11-19T11:00:00Z" : null,
          project_id: "project-1", project_title: "Cuộc họp tuần", media_file_id: "media-1", start_ms: 65000,
        }] : [],
        total: matchesType ? 1 : 0, unread_count: matchesType && !markedAsRead ? 1 : 0,
        notification_types: [{ code: "PROJECT_UPDATE", label: "Cập nhật dự án" }, { code: "JOB_FAILED", label: "Xử lý thất bại" }],
      });
    }
    if (url === "/api/notifications/notification-1/read") { markedAsRead = true; return new Response(null, { status: 204 }); }
    return defaultFetch(url, options);
  });
  await act(async () => host.querySelector<HTMLAnchorElement>('[aria-label="Thông báo"]')!.click());
  expect(host.querySelector("main h1")?.textContent).toBe("Thông báo");
  expect(host.querySelector(".notification-item")?.textContent).toContain("An đã cập nhật cuộc họp tuần.");
  expect(host.querySelector('.notification-project[href="/projects/project-1?tab=content&media=media-1&t=65000"]')?.textContent).toContain("Cuộc họp tuần");
  expect(host.querySelector(".notification-count-badge")?.textContent).toBe("1");
  await choose('[aria-label="Lọc theo loại thông báo"]', "JOB_FAILED");
  expect(window.location.search).toContain("type=JOB_FAILED");
  expect(host.querySelector(".empty")?.textContent).toContain("Chưa có thông báo");
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain("/api/notifications?unread_only=false&page=1&page_size=20&type_code=JOB_FAILED");
  await choose('[aria-label="Lọc theo loại thông báo"]', "PROJECT_UPDATE");
  expect(host.querySelector(".notification-item")?.textContent).toContain("Cuộc họp tuần");
  await click("Đánh dấu đã đọc");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(fetchMock.mock.calls.map(([url, options]) => [url, (options as RequestInit | undefined)?.method]))
    .toContainEqual(["/api/notifications/notification-1/read", "PATCH"]);
  expect(host.querySelector(".notification-item")?.classList.contains("is-read")).toBe(true);
  expect(host.querySelector(".notification-count-badge")).toBeNull();
  await click("Đã đọc");
  expect(window.location.search).toContain("read=true");
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain("/api/notifications?unread_only=false&page=1&page_size=20&read_only=true&type_code=PROJECT_UPDATE");
});

it("restores notification filters and pagination from the URL", async () => {
  window.history.replaceState(null, "", "/notifications?unread=true&type=JOB_FAILED&page=2");
  fetchMock.mockResolvedValueOnce(Response.json(session));
  const defaultFetch = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url === "/api/notifications?unread_only=true&page=2&page_size=20&type_code=JOB_FAILED") return Response.json({
      items: [{ notification_id: "n21", notification_type_code: "JOB_FAILED", title: "Tác vụ thất bại", message: "Hãy thử lại.", created_at: "2026-11-19T10:00:00Z", read_at: null }],
      total: 21, unread_count: 3, notification_types: [{ code: "JOB_FAILED", label: "Xử lý thất bại" }],
    });
    return defaultFetch(url, options);
  });
  await renderApp();
  expect(window.location.search).toBe("?unread=true&type=JOB_FAILED&page=2");
  expect(host.querySelector(".pagination")?.textContent).toContain("Trang 2/2");
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain("/api/notifications?unread_only=true&page=2&page_size=20&type_code=JOB_FAILED");
});

it("filters glossary terms by language without changing their content", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  const defaultFetch = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url.startsWith("/api/glossaries?")) {
      const english = url.includes("language_code=en");
      return Response.json({ items: english ? [
        { term_id: "en-1", term: "meeting", definition: "Nội dung trao đổi", language_code: "en", updated_at: "2026-11-19T00:00:00Z" },
      ] : [
        { term_id: "vi-1", term: "cuộc họp", definition: "Nội dung trao đổi", language_code: "vi", updated_at: "2026-11-19T02:00:00Z" },
        { term_id: "vi-2", term: "Áp dụng", definition: "Dùng vào thực tế", language_code: "vi", updated_at: "2026-11-19T01:00:00Z" },
      ], total: english ? 1 : 2 });
    }
    return defaultFetch(url, options);
  });
  await act(async () => host.querySelector<HTMLAnchorElement>('nav a[href="/glossaries"]')!.click());
  expect(host.querySelector(".glossary-term-title h2")?.textContent).toBe("cuộc họp");
  await choose('[aria-label="Sắp xếp thuật ngữ"]', "term");
  expect(host.querySelector(".glossary-term-title h2")?.textContent).toBe("Áp dụng");
  await choose('[aria-label="Lọc thuật ngữ theo ngôn ngữ"]', "en");
  expect(host.querySelector(".glossary-term-title h2")?.textContent).toBe("meeting");
  expect(fetchMock.mock.calls.map(([url]) => url)).toContain("/api/glossaries?q=&page=1&page_size=20&language_code=en");
});

it("previews CSV glossary imports before creating each term", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  const defaultFetch = fetchMock.getMockImplementation()!;
  const creates: unknown[] = [];
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url.startsWith("/api/glossaries?")) return Response.json({ items: [], total: 0 });
    if (url === "/api/glossaries" && options?.method === "POST") {
      creates.push(JSON.parse(options.body as string));
      return Response.json({ term_id: `term-${creates.length}` }, { status: 201 });
    }
    return defaultFetch(url, options);
  });
  await act(async () => host.querySelector<HTMLAnchorElement>('nav a[href="/glossaries"]')!.click());
  const input = host.querySelector<HTMLInputElement>('.glossary-import input[type="file"]')!;
  const file = new File(["term,definition,language,category\nmeeting,cuộc họp,en,General\nagenda,chương trình,en,General"], "terms.csv", { type: "text/csv" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(host.querySelector(".glossary-import-preview")?.textContent).toContain("meeting");
  expect(host.textContent).toContain("Đã đọc 2 thuật ngữ");
  await click("Nhập 2 thuật ngữ");
  expect(creates).toEqual([
    { term: "meeting", definition: "cuộc họp", language_code: "en", category: "General" },
    { term: "agenda", definition: "chương trình", language_code: "en", category: "General" },
  ]);
  expect(host.textContent).not.toContain("Đã đọc 2 thuật ngữ");
});

it("reveals and hides each password field independently in account settings", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  await act(async () => host.querySelector<HTMLAnchorElement>('nav a[href="/settings"]')!.click());
  const current = host.querySelector<HTMLInputElement>('[aria-label="Mật khẩu hiện tại"]')!;
  const next = host.querySelector<HTMLInputElement>('[aria-label="Mật khẩu mới"]')!;
  expect(current.type).toBe("password");
  expect(next.type).toBe("password");
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Hiện mật khẩu mới"]')!.click());
  expect(next.type).toBe("text");
  expect(current.type).toBe("password");
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Ẩn mật khẩu mới"]')!.click());
  expect(next.type).toBe("password");
  await fill('[aria-label="Mật khẩu mới"]', "abcdefghij");
  expect(host.querySelectorAll(".password-rule.valid")).toHaveLength(1);
  await fill('[aria-label="Mật khẩu mới"]', "Abcdefghij1");
  expect(host.querySelectorAll(".password-rule.valid")).toHaveLength(3);
  await fill('[aria-label="Mật khẩu hiện tại"]', "Abcdefghij1");
  await fill('[aria-label="Xác nhận mật khẩu mới"]', "Abcdefghij1");
  expect(host.querySelector(".account-validation")?.textContent).toContain("khác mật khẩu hiện tại");
  expect(host.querySelector<HTMLButtonElement>(".settings-page .form-actions button")?.disabled).toBe(true);
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
  mockDashboardResponse(Response.json({
    ...dashboard,
    stats: { projects: 0, ready: 0, processing: 0, duration_ms: 0, storage_bytes: 0 },
  }));
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  expect(Array.from(host.querySelectorAll(".stat-value"), (item) => item.textContent))
    .toEqual(["0", "0", "0", "00:00:00"]);
  expect(host.querySelector(".stats-grid")?.textContent).toContain("Đã lưu 0 B");
});

it("shows loading without invented statistics while Dashboard is pending", async () => {
  let finish!: (response: Response) => void;
  mockDashboardResponse(new Promise<Response>((resolve) => { finish = resolve; }));
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  expect(host.querySelector('main [role="status"]')?.textContent).toContain("Đang tải dữ liệu");
  expect(host.querySelector(".stat-value")).toBeNull();
  await act(async () => finish(Response.json(dashboard)));
  expect(host.querySelector('main [role="status"]')).toBeNull();
  expect(host.querySelectorAll(".stat-card")).toHaveLength(4);
});

it("shows the Dashboard API error and reloads successfully on retry", async () => {
  mockDashboardResponse(Response.json({ detail: "Chưa thể tải tổng quan." }, { status: 503 }));
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  expect(host.querySelector('main [role="alert"]')?.textContent).toContain("Chưa thể tải tổng quan.");
  expect(host.querySelector(".stat-value")).toBeNull();
  await click("Thử lại");
  expect(host.querySelector('main [role="alert"]')).toBeNull();
  expect(host.querySelector(".stat-value")?.textContent).toBe("12");
  expect(fetchMock.mock.calls.map(([url]) => url))
    .toEqual(["/api/auth/refresh", "/api/dashboard", "/api/audit-logs?page=1&page_size=7", "/api/dashboard"]);
});

it("cancels the pending Dashboard request when leaving the page", async () => {
  let finish!: (response: Response) => void;
  mockDashboardResponse(new Promise<Response>((resolve) => { finish = resolve; }));
  fetchMock.mockResolvedValueOnce(Response.json(session));
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
  mockDashboardResponse(Response.json({
    ...dashboard,
    projects: [recentProject, {
      ...recentProject, project_id: "ready-project", project_title: "Phỏng vấn",
      project_description: "Nội dung đã xử lý", project_status_code: "READY", media_kind: "ORIGINAL_VIDEO",
    }],
  }));
  fetchMock.mockResolvedValueOnce(Response.json(session));
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
