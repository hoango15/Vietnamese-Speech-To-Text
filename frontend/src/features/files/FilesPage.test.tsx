// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { FilesPage } from "./FilesPage";
import { NoticeProvider } from "../../shared/ui/NoticeProvider";
import type { FileRecord } from "../../shared/types";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots) await act(() => root.unmount());
  roots.length = 0;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
const file: FileRecord = {
  id: "e1", project_id: "p1", project_title: "Họp sản phẩm",
  file_name: "phu-de.srt", kind: "SRT", size: 80,
  created_at: "2026-11-02T00:00:00Z", download_url: "/api/exports/e1/download",
};
async function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const router = createMemoryRouter([
    { path: "/files", element: <NoticeProvider><FilesPage /></NoticeProvider> },
    { path: "/projects/:id", element: <p>Editor dự án</p> },
  ], { initialEntries: ["/files"] });
  await act(async () => root.render(<RouterProvider router={router} />));
  return { host, router };
}
async function openPreview(host: HTMLElement) {
  const button = host.querySelector<HTMLButtonElement>('[aria-label="Xem phu-de.srt"]');
  expect(button, "Tệp phải có thao tác xem nhanh").not.toBeNull();
  await act(async () => button!.click());
}
it("preserves the exact source and file metadata in expandable row details", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ items: [{ ...file, media_file_id: "source-a" }], total: 1 }));
  const { host } = await mount();
  const details = host.querySelector("tbody details");
  expect(details).not.toBeNull();
  expect(details?.textContent).toContain("Họp sản phẩm");
  expect(details?.textContent).toContain("80 B");
  expect(details?.textContent).toContain("02/11/2026");
  const source = details?.querySelector<HTMLAnchorElement>("a");
  expect(source?.getAttribute("href")).toBe("/projects/p1?tab=exports&media=source-a");
  expect(host.querySelector('[aria-label="Tải phu-de.srt"]')).not.toBeNull();
});

it("previews actual subtitle text safely and opens the owning project's exports tab", async () => {
  vi.stubGlobal("fetch", async (url: string) => url.endsWith("/download")
    ? new Response("1\n00:00:01,000 --> 00:00:02,000\nXin chào <script>không thực thi</script>")
    : Response.json({ items: [file], total: 1 }));
  const { host, router } = await mount();
  await openPreview(host);
  expect(host.querySelector("dialog pre")?.textContent).toContain("Xin chào <script>");
  expect(host.querySelector("dialog script")).toBeNull();
  const link = host.querySelector<HTMLAnchorElement>('dialog a');
  expect(link?.getAttribute("href")).toBe("/projects/p1?tab=exports");
  await act(() => link!.click());
  expect(router.state.location.pathname).toBe("/projects/p1");
  expect(router.state.location.search).toBe("?tab=exports");
});
it("shows download failures in the preview and retries without losing file details", async () => {
  let failed = true;
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.endsWith("/download")) return failed
      ? Response.json({ detail: "Tệp tạm thời không tải được" }, { status: 503 })
      : new Response("Nội dung đã tải lại");
    return Response.json({ items: [file], total: 1 });
  });
  const { host } = await mount();
  await openPreview(host);
  expect(host.querySelector("dialog [role=alert]")?.textContent).toContain("Tệp tạm thời không tải được");
  expect(host.querySelector("dialog")?.textContent).toContain("Họp sản phẩm");
  failed = false;
  const retry = [...host.querySelectorAll<HTMLButtonElement>("dialog button")]
    .find(button => button.textContent === "Thử lại");
  await act(async () => retry!.click());
  expect(host.querySelector("dialog pre")?.textContent).toBe("Nội dung đã tải lại");
});
it("does not load a large file into memory when opening its details", async () => {
  let downloads = 0;
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.endsWith("/download")) { downloads++; return new Response("large"); }
    return Response.json({ items: [{ ...file, size: 100 * 1024 * 1024 }], total: 1 });
  });
  const { host } = await mount();
  await openPreview(host);
  expect(downloads).toBe(0);
  expect(host.querySelector("dialog")?.textContent).toContain("Tệp lớn hơn 20 MB");
});
it("opens extracted audio in the source workspace rather than the exports tab", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ items: [{ ...file,
    file_name: "trich-xuat.wav", kind: "AUDIO_WAV", size: 30 * 1024 * 1024,
    download_url: "/api/media/m1/download",
  }], total: 1 }));
  const { host } = await mount();
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Xem trich-xuat.wav"]')!.click());
  expect(host.querySelector("dialog a")?.getAttribute("href")).toBe("/projects/p1?tab=content");
});
it("aborts an unfinished preview request when the dialog closes", async () => {
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
    if (url.endsWith("/download")) {
      signal = options.signal ?? undefined;
      return new Promise<Response>((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    }
    return Response.json({ items: [file], total: 1 });
  });
  const { host } = await mount();
  await openPreview(host);
  expect(signal?.aborted).toBe(false);
  await act(() => host.querySelector<HTMLButtonElement>('dialog [aria-label="Đóng hộp thoại"]')!.click());
  expect(signal?.aborted).toBe(true);
  expect(host.querySelector("dialog")).toBeNull();
});

it("keeps the source of an exported file in both project links", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ items: [{ ...file, media_file_id: "source-a", size: 30 * 1024 * 1024 }], total: 1 }));
  const { host } = await mount();
  const tableLink = host.querySelector<HTMLAnchorElement>('tbody a')!;
  expect(new URL(tableLink.href).searchParams.get("media")).toBe("source-a");
  await openPreview(host);
  const previewLink = host.querySelector<HTMLAnchorElement>('dialog a')!;
  expect(new URL(previewLink.href).searchParams.get("media")).toBe("source-a");
  expect(new URL(previewLink.href).searchParams.get("tab")).toBe("exports");
});

it("labels an export with unknown source instead of opening an unrelated editor", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ items: [{ ...file, media_file_id: null, size: 30 * 1024 * 1024 }], total: 1 }));
  const { host } = await mount();
  await openPreview(host);
  expect(host.querySelector("dialog")?.textContent).toContain("Nguồn chưa xác định");
  expect(host.querySelector("dialog a")).toBeNull();
  expect(host.querySelector("tbody a")).toBeNull();
});
