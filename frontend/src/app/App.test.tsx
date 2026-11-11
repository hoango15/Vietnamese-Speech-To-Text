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
  const [url, options] = fetchMock.mock.calls.at(-1)! as unknown as [string, RequestInit];
  expect(url).toBe("/api/auth/login");
  expect(options.method).toBe("POST");
  expect(JSON.parse(options.body as string)).toEqual({ email: session.user.email, password: "TestPassword123" });
  expect(host.textContent).toContain("Đăng nhập thành công");
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
  expect(host.querySelector("form")).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("logs out only after confirmation then allows another login", async () => {
  fetchMock.mockResolvedValueOnce(Response.json(session));
  await renderApp();
  await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/logout"]')!.click());
  expect(host.textContent).toContain("Xác nhận đăng xuất");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await submit();
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/auth/logout");
  expect(host.textContent).toContain("Đã đăng xuất");
  await act(async () => host.querySelector<HTMLAnchorElement>('a[href="/login"]')!.click());
  expect(host.querySelector("h2")?.textContent).toBe("Chào mừng trở lại");
});
