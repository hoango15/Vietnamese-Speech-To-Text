// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectsPage } from "./ProjectsPage";
import { api } from "../../shared/api/client";
import { AuthContext } from "../auth/AuthProvider";
import { NoticeProvider } from "../../shared/ui/NoticeProvider";
import type { Role, User } from "../../shared/types";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots) await act(() => root.unmount());
  roots.length = 0;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
const project = {
  project_id: "trash-project",
  project_title: "Dự án cần khôi phục",
  project_description: "",
  language_code: "vi",
  project_status_code: "DRAFT",
  owner_user_id: "old-owner",
  owner_name: "Người quản lý cũ",
  created_at: "2026-11-02T00:00:00Z",
  updated_at: "2026-11-02T00:00:00Z",
  deleted_at: "2026-11-02T01:00:00Z",
  can_manage: true,
  can_edit: true,
  member_count: 0,
};
function button(host: HTMLElement, text: string) {
  return Array.from(host.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === text,
  );
}
async function mount(role: Role = "ADMIN") {
  const user: User = {
    user_id: "current-admin",
    email: "admin@example.com",
    full_name: "Quản trị viên",
    user_role_code: role,
    is_active: true,
    created_at: "2026-11-02T00:00:00Z",
  };
  api.setSession({ access_token: "test-access-token", user });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const router = createMemoryRouter(
    [
      {
        path: "/projects",
        element: (
          <AuthContext.Provider
            value={{ user, update: () => {}, sessionEnded: false }}
          >
            <NoticeProvider>
              <ProjectsPage />
            </NoticeProvider>
          </AuthContext.Provider>
        ),
      },
    ],
    { initialEntries: ["/projects"] },
  );
  await act(async () => root.render(<RouterProvider router={router} />));
  await act(() => button(host, "Thùng rác")!.click());
  return host;
}
it("keeps secondary project information in expandable details alongside recovery actions", async () => {
  vi.stubGlobal("fetch", async (url: string) => Response.json(url.startsWith("/api/companies?")
    ? { items: [], total: 0 } : { items: [{ ...project, company_name: "Công ty thử nghiệm" }], total: 1 }));
  const host = await mount();
  const details = host.querySelector("tbody details");
  expect(details).not.toBeNull();
  expect(details?.querySelector("summary")?.textContent).toBe("Chi tiết");
  expect(details?.textContent).toContain("Công ty thử nghiệm");
  expect(details?.textContent).toContain("Người quản lý cũ");
  expect(details?.textContent).toContain("02/11/2026");
  expect(button(host, "Khôi phục")).toBeDefined();
  expect(button(host, "Chuyển cho tôi và khôi phục")).toBeDefined();
});

it("transfers a trashed project to the current admin before restoring it, then reloads the trash list", async () => {
  const mutations: { url: string; method: string; body: unknown }[] = [];
  let transferred = false,
    restored = false;
  vi.stubGlobal("confirm", () => true);
  vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
    if (options.method === "PATCH" || options.method === "POST") {
      mutations.push({
        url,
        method: options.method,
        body: options.body ? JSON.parse(options.body as string) : null,
      });
      if (url === "/api/projects/trash-project/owner") {
        await Promise.resolve();
        transferred = true;
        return Response.json({ ...project, owner_user_id: "current-admin" });
      }
      if (url === "/api/projects/trash-project/restore") {
        expect(transferred).toBe(true);
        restored = true;
        return Response.json({ ...project, deleted_at: null });
      }
    }
    return Response.json({
      items: url.includes("deleted=true") && !restored ? [project] : [],
      total: url.includes("deleted=true") && !restored ? 1 : 0,
    });
  });
  const host = await mount();
  expect(button(host, "Khôi phục")).toBeDefined();
  const recover = button(host, "Chuyển cho tôi và khôi phục");
  expect(recover).toBeDefined();
  await act(() => recover!.click());
  expect(mutations).toEqual([
    {
      url: "/api/projects/trash-project/owner",
      method: "PATCH",
      body: { user_id: "current-admin" },
    },
    { url: "/api/projects/trash-project/restore", method: "POST", body: null },
  ]);
  expect(host.textContent).toContain("Thùng rác trống");
});
it("keeps the project unchanged when admin declines recovery confirmation", async () => {
  const mutations: string[] = [];
  vi.stubGlobal("confirm", () => false);
  vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
    if (options.method) mutations.push(url);
    return Response.json({
      items: url.includes("deleted=true") ? [project] : [],
      total: 1,
    });
  });
  const host = await mount();
  const recover = button(host, "Chuyển cho tôi và khôi phục");
  expect(recover).toBeDefined();
  await act(() => recover!.click());
  expect(mutations).toEqual([]);
  expect(host.textContent).toContain(project.project_title);
});
it("does not restore when ownership transfer fails", async () => {
  const mutations: string[] = [];
  vi.stubGlobal("confirm", () => true);
  vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
    if (options.method) {
      mutations.push(url);
      return Response.json(
        { detail: "Không thể chuyển người quản lý." },
        { status: 409 },
      );
    }
    return Response.json({
      items: url.includes("deleted=true") ? [project] : [],
      total: 1,
    });
  });
  const host = await mount();
  const recover = button(host, "Chuyển cho tôi và khôi phục");
  expect(recover).toBeDefined();
  await act(() => recover!.click());
  expect(mutations).toEqual(["/api/projects/trash-project/owner"]);
  expect(host.textContent).toContain("Không thể chuyển người quản lý.");
});
it.each<Role>(["MANAGER", "MEMBER", "VIEWER"])(
  "hides admin ownership recovery from %s",
  async (role) => {
    vi.stubGlobal("fetch", async (url: string) =>
      Response.json({
        items: url.includes("deleted=true") ? [project] : [],
        total: 1,
      }),
    );
    const host = await mount(role);
    expect(button(host, "Chuyển cho tôi và khôi phục")).toBeUndefined();
  },
);
