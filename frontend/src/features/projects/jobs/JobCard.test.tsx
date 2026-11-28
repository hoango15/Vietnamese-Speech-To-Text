// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JobCard } from "./JobCard";
import type { Job } from "../../../shared/types";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
const start = "2026-11-04T03:00:00Z";
const job = { job_id: "j1", project_id: "p1", media_file_id: "m1", job_status_code: "RUNNING",
  progress_percent: 30, error_message: null, created_at: start, started_at: start, finished_at: null,
  asr_model_name: "colab-whisper", stages: [] };

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-04T03:02:05Z")); });
afterEach(async () => {
  if (root) await act(() => root.unmount());
  vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = "";
});
async function mount(value: Job = job, canEdit = false) {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(() => root.render(<JobCard job={value} canEdit={canEdit} />));
  return host;
}

it("ticks elapsed minutes and seconds without inventing percentage during a Colab request", async () => {
  const fetch = vi.fn(async () => Response.json(job)); vi.stubGlobal("fetch", fetch);
  const host = await mount();
  expect(host.textContent).toContain("2 phút 05 giây");
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(host.textContent).toContain("2 phút 06 giây");
  expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("30");
  expect(fetch).not.toHaveBeenCalled();
});

it("polls live percentage and audio duration, then freezes the clock on completion", async () => {
  const fetch = vi.fn(async () => Response.json({ ...job, progress_percent: 67,
    asr_progress: { processed_audio_ms: 180000, total_audio_ms: 360000 } }));
  vi.stubGlobal("fetch", fetch);
  const host = await mount();
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("67");
  expect(host.textContent).toContain("03:00 / 06:00");
  fetch.mockImplementation(async () => Response.json({ ...job, job_status_code: "SUCCEEDED", progress_percent: 100,
    finished_at: "2026-11-04T03:02:09Z" }));
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(host.textContent).toContain("2 phút 09 giây");
  expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("100");
  const calls = fetch.mock.calls.length;
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(host.textContent).toContain("2 phút 09 giây");
  expect(fetch).toHaveBeenCalledTimes(calls);
});

it.each(["FAILED", "CANCELED"])("freezes elapsed time for %s jobs", async status => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const host = await mount({ ...job, job_status_code: status, finished_at: "2026-11-04T03:01:10Z" });
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(host.textContent).toContain("1 phút 10 giây");
  expect(fetch).not.toHaveBeenCalled();
});

it("does not count queue time or carry a previous attempt's clock into a queued retry", async () => {
  const fetch = vi.fn(async () => Response.json(job)); vi.stubGlobal("fetch", fetch);
  const host = await mount({ ...job, job_status_code: "QUEUED" });
  expect(host.textContent).toContain("Chờ bắt đầu");
  expect(host.textContent).not.toContain("2 phút");
  await act(() => root.render(<JobCard job={{ ...job, job_id: "j2", started_at: "2026-11-04T03:02:05Z" }} canEdit={false} />));
  expect(host.textContent).toContain("0 phút 00 giây");
});

it("cleans up timers and ignores a late response after unmount", async () => {
  let resolve!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>(done => { resolve = done; })); vi.stubGlobal("fetch", fetch);
  await mount();
  await act(() => vi.advanceTimersByTimeAsync(2000));
  await act(() => root.unmount());
  await act(async () => { resolve(Response.json(job)); });
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("ignores an old job's late response after switching jobs", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", () => new Promise<Response>(done => { resolve = done; }));
  const host = await mount();
  await act(() => vi.advanceTimersByTimeAsync(2000));
  await act(() => root.render(<JobCard job={{ ...job, job_id: "j2", progress_percent: 15 }} canEdit={false} />));
  await act(async () => resolve(Response.json({ ...job, progress_percent: 80 })));
  expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("15");
});

it("keeps a cancellation when an older running poll finishes in the same update", async () => {
  let finishPoll!: (response: Response) => void;
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.endsWith("/cancel")) return Response.json({ ...job, job_status_code: "CANCELED", finished_at: "2026-11-04T03:02:07Z" });
    return new Promise<Response>(resolve => { finishPoll = resolve; });
  });
  const host = await mount(job, true);
  await act(() => vi.advanceTimersByTimeAsync(2000));
  await act(async () => {
    [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Hủy xử lý"))!.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    finishPoll(Response.json({ ...job, progress_percent: 50 }));
  });
  expect(host.textContent).toContain("Đã hủy");
  expect(host.textContent).not.toContain("Hủy xử lý");
});

it("notifies a successful attempt once when the parent's completion callback changes", async () => {
  const completed = vi.fn();
  const value = { ...job, job_status_code: "SUCCEEDED", progress_percent: 100, finished_at: "2026-11-04T03:02:07Z" };
  await mount(value);
  await act(() => root.render(<JobCard job={value} canEdit={false} onComplete={() => completed()} />));
  expect(completed).toHaveBeenCalledTimes(1);
  await act(() => root.render(<JobCard job={{ ...value }} canEdit={false} onComplete={() => completed()} />));
  expect(completed).toHaveBeenCalledTimes(1);
});
