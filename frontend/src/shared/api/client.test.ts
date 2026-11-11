import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "./client";

afterEach(() => vi.unstubAllGlobals());
describe("authenticated API boundary", () => {
  it.each(["before 401", "during refresh"])("does not replay an old mutation under a newer login %s", async timing => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn((url: string) => {
      if (url === "/api/auth/refresh" || (timing === "before 401" && fetch.mock.calls.length === 1))
        return new Promise<Response>(resolve => { finish = resolve; });
      return Promise.resolve(Response.json({ detail: "expired" }, { status: 401 }));
    });
    vi.stubGlobal("fetch", fetch);
    const client = new ApiClient();
    const old = { access_token: "old", user: { user_id: "old" } } as NonNullable<Parameters<ApiClient["setSession"]>[0]>;
    const next = { access_token: "new", user: { user_id: "new" } } as typeof old;
    client.setSession(old);
    const sessions: unknown[] = [];
    client.onSession = session => sessions.push(session);
    const request = client.request("/projects/shared", { method: "PATCH", body: { project_name: "Old draft" } });
    if (timing === "during refresh") await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    client.setSession(next);
    finish(timing === "before 401" ? Response.json({ detail: "expired" }, { status: 401 }) : Response.json(old));
    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(timing === "before 401" ? 1 : 2);
    expect(sessions).toEqual([next]);
  });
  it("keeps a newer session refresh independent of an older pending refresh", async () => {
    const finishes: ((response: Response) => void)[] = [];
    const fetch = vi.fn(() => new Promise<Response>(resolve => finishes.push(resolve)));
    vi.stubGlobal("fetch", fetch);
    const client = new ApiClient();
    const oldRefresh = client.refresh();
    client.setSession({ access_token: "login", user: { user_id: "new" } } as NonNullable<Parameters<ApiClient["setSession"]>[0]>);
    const newRefresh = client.refresh();
    expect(fetch).toHaveBeenCalledTimes(2);
    finishes[0](Response.json({ access_token: "old", user: { user_id: "old" } }));
    await oldRefresh;
    const concurrent = client.refresh();
    expect(fetch).toHaveBeenCalledTimes(2);
    finishes[1](Response.json({ access_token: "fresh", user: { user_id: "new" } }));
    await expect(newRefresh).resolves.toMatchObject({ access_token: "fresh" });
    await expect(concurrent).resolves.toMatchObject({ access_token: "fresh" });
  });
  it("retries a delayed old-token 401 after the same session has refreshed", async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn((url: string, options: RequestInit) => {
      if (url === "/api/auth/refresh") return Promise.resolve(Response.json({ access_token: "fresh", user: { user_id: "user" } }));
      if (new Headers(options.headers).get("Authorization") === "Bearer fresh") return Promise.resolve(Response.json({ ok: true }));
      if (url === "/api/files") return new Promise<Response>(resolve => { finish = resolve; });
      return Promise.resolve(Response.json({ detail: "expired" }, { status: 401 }));
    });
    vi.stubGlobal("fetch", fetch);
    const client = new ApiClient();
    client.setSession({ access_token: "old", user: { user_id: "user" } } as NonNullable<Parameters<ApiClient["setSession"]>[0]>);
    const delayed = client.request("/files");
    await expect(client.request("/projects")).resolves.toEqual({ ok: true });
    finish(Response.json({ detail: "expired" }, { status: 401 }));
    await expect(delayed).resolves.toEqual({ ok: true });
    expect(fetch.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
  });
  it.each([null, { detail: [null, { msg: "Invalid input" }] }])("preserves HTTP errors for malformed error payloads: %j", async payload => {
    vi.stubGlobal("fetch", async () => Response.json(payload, { status: 502 }));
    await expect(new ApiClient().request("/projects")).rejects.toBeInstanceOf(ApiError);
  });
  it.each(["logout", "login", "failed refresh"])("does not let an old refresh overwrite a later %s", async change => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", () => new Promise<Response>(resolve => { finish = resolve; }));
    const client = new ApiClient();
    const sessions: unknown[] = [];
    client.onSession = session => sessions.push(session);
    const refreshing = client.refresh();
    const next = change === "logout" ? null : { access_token: "new-login", user: { user_id: "new-user" } } as Parameters<ApiClient["setSession"]>[0];
    client.setSession(next);
    finish(change === "failed refresh" ? Response.json({ detail: "expired" }, { status: 401 })
      : Response.json({ access_token: "old-refresh", user: { user_id: "old-user" } }));
    await refreshing.catch(() => {});
    expect(sessions).toEqual([next]);
  });
  it("does not clear a new login when an older request returns its final 401", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", () => new Promise<Response>(resolve => { finish = resolve; }));
    const client = new ApiClient();
    const sessions: unknown[] = [];
    client.onSession = session => sessions.push(session);
    const request = client.request("/projects", {}, false);
    const session = { access_token: "new-login", user: { user_id: "new-user" } } as NonNullable<Parameters<ApiClient["setSession"]>[0]>;
    client.setSession(session);
    finish(Response.json({ detail: "expired" }, { status: 401 }));
    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(sessions).toEqual([session]);
  });
  it("shows validation messages without exposing rejected passwords or raw error objects", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ detail: [{
      type: "string_too_short", loc: ["body", "password"],
      msg: "String should have at least 10 characters", input: "secret123",
    }] }, { status: 422 }));
    await expect(new ApiClient().request("/auth/register", { method: "POST", body: {} }))
      .rejects.toMatchObject({ status: 422, message: "Dữ liệu không hợp lệ: String should have at least 10 characters" });
  });
  it("refreshes one time for simultaneous expired requests, retries with memory token and cookie credentials", async () => {
    let refreshes = 0;
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
      expect(options.credentials).toBe("include");
      if (url === "/api/auth/refresh") {
        refreshes++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return Response.json({
          access_token: "fresh",
          user: {
            user_id: "u1",
            email: "u@example.com",
            full_name: "User",
            user_role_code: "MEMBER",
            is_active: true,
            created_at: "2026-11-02T00:00:00Z",
          },
        });
      }
      const token = new Headers(options.headers).get("Authorization");
      if (token !== "Bearer fresh")
        return Response.json({ detail: "expired" }, { status: 401 });
      requests.push(url);
      return Response.json({ items: [], total: 0 });
    });
    const client = new ApiClient();
    const results = await Promise.all([
      client.request("/projects"),
      client.request("/files"),
    ]);
    expect(refreshes).toBe(1);
    expect(requests.sort()).toEqual(["/api/files", "/api/projects"]);
    expect(results).toEqual([
      { items: [], total: 0 },
      { items: [], total: 0 },
    ]);
  });
  it("preserves conflict status and detail so editors never silently overwrite", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ detail: "Revision conflict" }, { status: 409 }),
    );
    const client = new ApiClient();
    await expect(
      client.request("/transcripts/t1", {
        method: "PUT",
        body: { revision: 2, segments: [] },
      }),
    ).rejects.toMatchObject({ status: 409, message: "Revision conflict" });
  });
  it("rejects off-origin download routes before sending credentials", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const client = new ApiClient();
    await expect(
      client.blob("https://other.test/steal"),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
