// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { AdminConsole } from "./AdminConsole";
import { AuthContext } from "../auth/AuthProvider";
import { NoticeProvider } from "../../shared/ui/NoticeProvider";
import type { Role, User } from "../../shared/types";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
const member: User = { user_id: "member-1", email: "member@example.test", full_name: "Thành viên thử nghiệm",
  user_role_code: "MEMBER", is_active: true, created_at: "2026-11-19T00:00:00Z" };

afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function mount(path: string, handler: (url: string, options: RequestInit) => Response, role: Role = "ADMIN") {
  vi.stubGlobal("fetch", async (url: string, options: RequestInit = {}) => handler(url, options));
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<MemoryRouter initialEntries={[path]}><NoticeProvider>
    <AuthContext.Provider value={{ user: { ...member, user_id: "current", user_role_code: role }, update: () => {}, sessionEnded: false }}>
      <Routes><Route path="/admin/*" element={<AdminConsole />} /></Routes>
    </AuthContext.Provider>
  </NoticeProvider></MemoryRouter>));
  return host;
}

async function change(input: HTMLInputElement, value: string) {
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("loads the published users route and preserves account input after a rejected create request", async () => {
  const host = await mount("/admin/users", (url, options) => {
    if (url.startsWith("/api/users?")) return Response.json({ items: [member], total: 1 });
    if (url === "/api/users" && options.method === "POST") return Response.json({ detail: "Email đã được đăng ký" }, { status: 409 });
    if (url === "/api/organizations/current") return Response.json({ organization_id: "o1", organization_name: "Workspace" });
    return Response.json({ items: [], total: 0 });
  });
  expect(host.querySelector("h1")?.textContent).toBe("Người dùng & phân quyền");
  expect(host.querySelector("table")?.textContent).toContain(member.full_name);
  const create = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Tạo tài khoản")!;
  await act(() => create.click());
  const form = document.querySelector<HTMLFormElement>("dialog form")!;
  await change(form.querySelector<HTMLInputElement>('[name="full_name"]')!, "Người dùng mới");
  await change(form.querySelector<HTMLInputElement>('[name="email"]')!, "new@example.test");
  await change(form.querySelector<HTMLInputElement>('[name="password"]')!, "ExamplePassword123");
  await act(async () => form.requestSubmit());
  expect(document.querySelector("dialog")).not.toBeNull();
  expect(form.querySelector<HTMLInputElement>('[name="full_name"]')?.value).toBe("Người dùng mới");
  expect(document.body.textContent).toContain("Email đã được đăng ký");
});

it("loads workspace settings and retains the draft when saving fails before retrying", async () => {
  const writes: unknown[] = [];
  let fails = true;
  const host = await mount("/admin/organization", (_url, options) => {
    if (options.method === "PATCH") {
      writes.push(JSON.parse(String(options.body)));
      return fails ? Response.json({ detail: "Không lưu được workspace" }, { status: 503 })
        : Response.json({ organization_id: "o1", organization_name: "Workspace mới" });
    }
    return Response.json({ organization_id: "o1", organization_name: "Workspace cũ" });
  });
  const input = host.querySelector<HTMLInputElement>('[name="name"]')!;
  expect(input.value).toBe("Workspace cũ");
  await change(input, "Workspace mới");
  await act(async () => host.querySelector<HTMLFormElement>("form")!.requestSubmit());
  expect(writes).toEqual([{ organization_name: "Workspace mới" }]);
  expect(input.value).toBe("Workspace mới");
  expect(document.body.textContent).toContain("Không lưu được workspace");
  fails = false;
  await act(async () => host.querySelector<HTMLFormElement>("form")!.requestSubmit());
  expect(host.querySelector<HTMLInputElement>('[name="name"]')?.value).toBe("Workspace mới");
  expect(document.body.textContent).toContain("Đã cập nhật tổ chức.");
});

it("renders workspace settings read-only for a non-admin account", async () => {
  const host = await mount("/admin/organization", () => Response.json({ organization_id: "o1", organization_name: "Workspace" }), "MEMBER");
  expect(host.querySelector<HTMLInputElement>('[name="name"]')?.readOnly).toBe(true);
  expect([...host.querySelectorAll("button")].some(button => button.textContent === "Lưu thay đổi")).toBe(false);
});
