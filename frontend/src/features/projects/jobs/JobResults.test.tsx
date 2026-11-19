// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { JobResults } from "./JobResults";
import { NoticeProvider } from "../../../shared/ui/NoticeProvider";
import type { Job } from "../../../shared/types";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if (root) await act(() => root.unmount()); document.body.innerHTML = ""; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("shows complete historical minutes and downloads the exact source and export", async () => {
  const requests: string[] = [];
  const downloads: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
  vi.stubGlobal("fetch", async (url: string) => {
    requests.push(url);
    if (url.endsWith("/download")) return new Response("result bytes");
    return Response.json({
      media: { media_file_id: "source-old", file_name: "cuoc-hop-cu.wav" },
      transcript: { transcript_id: "t2", version_no: 2, segments: [{ start_ms: 0, end_ms: 1000, segment_text: "Bản ghi mới." }] },
      minutes: { minutes_id: "m1", transcript_id: "t1", transcript_version_no: 1, meeting_title: "Cuộc họp cũ",
        summary_text: "Tóm tắt cũ", topics: [{ topic_title: "Tiến độ", topic_summary: "Đánh giá tiến độ tuần" }],
        decisions: [{ decision_text: "Thống nhất kiểm tra" }], action_items: [{ item_description: "Thử nghiệm hệ thống", assignee_name: null, due_date: null, action_item_status_code: "OPEN" }] },
      exports: [{ export_file_id: "export-old", export_kind_code: "SRT", file_name: "phu-de-cu.srt" }], ocr: null,
    });
  });
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<NoticeProvider><JobResults job={{ job_id: "job-old" } as Job} onClose={() => {}} /></NoticeProvider>));
  expect(requests[0]).toBe("/api/jobs/job-old/results");
  expect(document.body.textContent).toContain("Đánh giá tiến độ tuần");
  expect(document.body.textContent).toContain("Thống nhất kiểm tra");
  expect(document.body.textContent).toContain("Thử nghiệm hệ thống");
  expect(document.body.textContent).toContain("Chưa xác định");
  expect(document.body.textContent).toContain("Biên bản dựa trên bản ghi phiên bản 1");
  for (const button of document.body.querySelectorAll<HTMLButtonElement>("button")) {
    if (button.textContent?.includes("Tải tệp nguồn") || button.textContent?.includes("phu-de-cu.srt")) await act(async () => button.click());
  }
  expect(requests).toEqual(["/api/jobs/job-old/results", "/api/media/source-old/download", "/api/exports/export-old/download"]);
  expect(downloads).toEqual(["cuoc-hop-cu.wav", "phu-de-cu.srt"]);
});

it("ignores an old result response after selecting a different job", async () => {
  let finishOld!: (response: Response) => void;
  vi.stubGlobal("fetch", (url: string) => url === "/api/jobs/old/results"
    ? new Promise<Response>(resolve => { finishOld = resolve; })
    : Promise.resolve(Response.json({ media: { media_file_id: "new-source", file_name: "new.png" }, transcript: null, minutes: null,
      exports: [], ocr: { document_text: "Nội dung mới" } })));
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const view = (id: string) => <NoticeProvider><JobResults job={{ job_id: id } as Job} onClose={() => {}} /></NoticeProvider>;
  await act(async () => root.render(view("old")));
  await act(async () => root.render(view("new")));
  await act(async () => finishOld(Response.json({ media: { media_file_id: "old-source", file_name: "old.png" }, transcript: null, minutes: null,
    exports: [], ocr: { document_text: "Nội dung cũ" } })));
  expect(document.body.textContent).toContain("Nội dung mới");
  expect(document.body.textContent).not.toContain("Nội dung cũ");
});
