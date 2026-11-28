// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { LibraryPage } from "./LibraryPage";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if (root) await act(() => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

it.each(["minutes", "subtitles"] as const)("keeps the project and date available in expandable %s details", async kind => {
  const item = kind === "minutes"
    ? { minutes_id: "minutes-old", meeting_title: "Biên bản A", version_no: 1 }
    : { export_file_id: "subtitle-a", file_name: "a.srt", export_kind_code: "SRT", file_size_bytes: 50 };
  vi.stubGlobal("fetch", async () => Response.json({ items: [{ ...item, media_file_id: "source-a",
    project_id: "p1", project_title: "Họp sản phẩm", created_at: "2026-11-09" }], total: 1 }));
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const router = createMemoryRouter([{ path: "*", element: <LibraryPage kind={kind} /> }]);
  await act(async () => root.render(<RouterProvider router={router} />));
  const details = host.querySelector("tbody details");
  expect(details).not.toBeNull();
  expect(details?.textContent).toContain("Họp sản phẩm");
  expect(details?.textContent).toContain("09/11/2026");
  if (kind === "subtitles") expect(details?.querySelector("a")?.getAttribute("href")).toBe("/projects/p1?tab=exports&media=source-a");
});

it("links a minutes version to its exact source and document", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ items: [{ minutes_id: "minutes-old", media_file_id: "source-a", project_id: "p1", meeting_title: "Biên bản A", version_no: 1, created_at: "2026-11-09" }], total: 1 }));
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const router = createMemoryRouter([{ path: "*", element: <LibraryPage kind="minutes" /> }]);
  await act(async () => root.render(<RouterProvider router={router} />));
  const link = host.querySelector<HTMLAnchorElement>("tbody a")!;
  const url = new URL(link.href);
  expect(url.searchParams.get("media")).toBe("source-a");
  expect(url.searchParams.get("minutes")).toBe("minutes-old");
});

it.each(["minutes", "subtitles"] as const)("labels unknown-source %s without opening another source", async kind => {
  const item = kind === "minutes"
    ? { minutes_id: "minutes-old", meeting_title: "Biên bản cũ", version_no: 1 }
    : { export_file_id: "subtitle-old", file_name: "old.srt", export_kind_code: "SRT", file_size_bytes: 50 };
  vi.stubGlobal("fetch", async () => Response.json({ items: [{ ...item, media_file_id: null,
    project_id: "p1", project_title: "Dự án", created_at: "2026-11-09" }], total: 1 }));
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const router = createMemoryRouter([{ path: "*", element: <LibraryPage kind={kind} /> }]);
  await act(async () => root.render(<RouterProvider router={router} />));
  expect(host.querySelector("tbody")?.textContent).toContain("Nguồn chưa xác định");
  if (kind === "subtitles") {
    expect(host.querySelector("tbody a")).toBeNull();
    expect(host.querySelector("tbody button")?.textContent).toContain("Tải xuống");
  } else {
    const url = new URL(host.querySelector<HTMLAnchorElement>("tbody a")!.href);
    expect(url.searchParams.get("minutes")).toBe("minutes-old");
  }
});
