import type { Session } from "../types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
type Options = Omit<RequestInit, "body"> & { body?: unknown };
export class ApiClient {
  private token: string | null = null;
  private sessionVersion = 0;
  private refreshing: Promise<Session> | null = null;
  onSession: (session: Session | null) => void = () => {};
  setSession(session: Session | null) {
    this.sessionVersion++;
    this.refreshing = null;
    this.token = session?.access_token ?? null;
    this.onSession(session);
  }
  async refresh(): Promise<Session> {
    if (!this.refreshing) {
      const version = this.sessionVersion;
      const refreshing = this.request<Session>(
        "/auth/refresh",
        { method: "POST" },
        false,
      )
        .then((session) => {
          if (version === this.sessionVersion) {
            this.token = session.access_token;
            this.onSession(session);
          }
          return session;
        })
        .catch((error) => {
          if (version === this.sessionVersion && error instanceof ApiError && error.status === 401)
            this.setSession(null);
          throw error;
        })
        .finally(() => {
          if (this.refreshing === refreshing) this.refreshing = null;
        });
      this.refreshing = refreshing;
    }
    return this.refreshing;
  }
  private route(path: string): string {
    if (
      !/^\/(?!\/)[a-zA-Z]/.test(path) ||
      path.includes("\\") ||
      /(?:^|\/)\.\.(?:\/|$)/.test(path)
    )
      throw new ApiError(400, "Đường dẫn tải tệp không hợp lệ.");
    return path.startsWith("/api/") ? path : "/api" + path;
  }
  private async send(
    path: string,
    options: Options = {},
    retry = true,
  ): Promise<Response> {
    const url = this.route(path),
      headers = new Headers(options.headers);
    const token = this.token, version = this.sessionVersion;
    if (token) headers.set("Authorization", "Bearer " + token);
    const raw =
      options.body instanceof Blob ||
      options.body instanceof FormData ||
      options.body instanceof ArrayBuffer;
    if (options.body !== undefined && !raw)
      headers.set("Content-Type", "application/json");
    const response = await fetch(url, {
      ...options,
      body:
        options.body === undefined
          ? undefined
          : raw
            ? (options.body as BodyInit)
            : JSON.stringify(options.body),
      headers,
      credentials: "include",
    });
    if (response.status === 401 && retry && (!path.startsWith("/auth/") || path === "/auth/logout") && version === this.sessionVersion) {
      if (token === this.token) await this.refresh();
      if (version === this.sessionVersion) return this.send(path, options, false);
    }
    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ detail: `Yêu cầu thất bại (${response.status}).` }));
      const detail =
        typeof error?.detail === "string"
          ? error.detail
          : Array.isArray(error?.detail)
            ? "Dữ liệu không hợp lệ: " + error.detail.map((item: { msg?: string } | null) => typeof item?.msg === "string" ? item.msg : "Kiểm tra lại trường nhập.").join("; ")
            : `Yêu cầu thất bại (${response.status}). Vui lòng thử lại.`;
      if (response.status === 401 && !path.startsWith("/auth/") && version === this.sessionVersion)
        this.setSession(null);
      throw new ApiError(response.status, detail);
    }
    return response;
  }
  async request<T = unknown>(
    path: string,
    options: Options = {},
    retry = true,
  ): Promise<T> {
    const response = await this.send(path, options, retry);
    return response.status === 204 ? (undefined as T) : response.json();
  }
  async blob(path: string, options: Pick<RequestInit, "signal"> = {}): Promise<Blob> {
    return (await this.send(path, options)).blob();
  }
  async download(path: string, fileName: string) {
    const blob = await this.blob(path),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
export const api = new ApiClient();
