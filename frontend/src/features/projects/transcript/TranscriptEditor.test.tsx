// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { TranscriptEditor } from "./TranscriptEditor";
import type { Project, Transcript, TranscriptVersion } from "../../../shared/types";
import { NoticeProvider } from "../../../shared/ui/NoticeProvider";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if (root) await act(() => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

async function mount(options: { grammar?: boolean; canEdit?: boolean; response?: Promise<Response>; saveResponse?: Promise<Response>; mediaId?: string; versions?: TranscriptVersion[] } = {}) {
  const project = { project_id: "p1", can_edit: options.canEdit ?? true } as Project;
  const transcript: Transcript = { transcript_id: "t1", project_id: "p1", revision: 1, version_no: 1,
    speakers: [{ speaker_id: "sp1", speaker_label: "Speaker 1", display_name: "An", color_hex: "#0d9488" }],
    segments: [{ segment_id: "s1", start_ms: 125, end_ms: 1750, segment_text: "xin chao", speaker_id: "sp1" }] };
  const writes: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    if (init.method === "POST" || init.method === "PUT") {
      writes.push({ url, body: JSON.parse(init.body as string) });
      if (url.endsWith("/fix-grammar")) return options.response ?? Response.json({ text: "Xin chào." });
      if (url === "/api/transcripts/t1") return options.saveResponse ?? Response.json({ ...transcript, transcript_id: "t2", revision: 2, version_no: 2,
        segments: (writes.at(-1)!.body.segments as Transcript["segments"]) });
    }
    if (url.split("?")[0] === "/api/projects/p1/transcripts/current") return Response.json(transcript);
    if (url.split("?")[0] === "/api/projects/p1/transcripts") return Response.json({ items: options.versions ?? [], total: options.versions?.length ?? 0 });
    if (url === "/api/transcripts/legacy") return Response.json({...transcript, media_file_id:null, segments:[{...transcript.segments[0],segment_text:"Legacy content"}]});
    if (url === "/api/system/capabilities") return Response.json({ asr: true, ocr: true, diarization: false, llm: true,
      grammar: options.grammar ?? true, asr_model: "base", asr_provider: "local", text_provider: "colab", max_upload_bytes: 100000 });
    return Response.json({ detail: "Unexpected test request" }, { status: 404 });
  });
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const router = createMemoryRouter([{ path: "*", element: <NoticeProvider><TranscriptEditor mediaId={options.mediaId} project={project} seek={() => {}} reportDirty={() => {}} /></NoticeProvider> }]);
  await act(async () => root.render(<RouterProvider router={router} />));
  return { host, writes };
}

it("corrects a segment as a draft and preserves timing/speaker until the user saves", async () => {
  const { host, writes } = await mount();
  const fix = host.querySelector<HTMLButtonElement>('[aria-label="Sửa chính tả đoạn 1"]');
  expect(fix).toBeTruthy();
  expect(host.textContent).toContain("Colab");
  await act(async () => fix!.click());
  expect(host.querySelector<HTMLTextAreaElement>("#segment-0")!.value).toBe("Xin chào.");
  expect(writes).toEqual([{ url: "/api/projects/p1/fix-grammar", body: { text: "xin chao" } }]);
  const save = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Lưu bản ghi"))!;
  expect(save.disabled).toBe(false);
  await act(async () => save.click());
  expect(writes[1]).toEqual({ url: "/api/transcripts/t1", body: { revision: 1,
    segments: [{ segment_id: "s1", start_ms: 125, end_ms: 1750, segment_text: "Xin chào.", speaker_id: "sp1" }] } });
});

it("keeps newer edits when a grammar response arrives late", async () => {
  let finish!: (response: Response) => void;
  const response = new Promise<Response>(resolve => { finish = resolve; });
  const { host } = await mount({ response });
  const fix = host.querySelector<HTMLButtonElement>('[aria-label="Sửa chính tả đoạn 1"]');
  expect(fix).toBeTruthy();
  await act(() => fix!.click());
  const input = host.querySelector<HTMLTextAreaElement>("#segment-0")!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Nội dung người dùng vừa sửa.");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => finish(Response.json({ text: "Xin chào." })));
  expect(input.value).toBe("Nội dung người dùng vừa sửa.");
});

it("locks transcript mutations while saving so the response cannot discard newer edits", async () => {
  let finish!: (response: Response) => void;
  const saveResponse = new Promise<Response>(resolve => { finish = resolve; });
  const { host, writes } = await mount({ saveResponse });
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Sửa chính tả đoạn 1"]')!.click());
  const save = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Lưu bản ghi"))!;
  await act(() => save.click());
  expect(host.querySelector<HTMLTextAreaElement>("#segment-0")!.readOnly).toBe(true);
  expect(host.querySelector<HTMLSelectElement>("#speaker-0")!.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Xóa đoạn 1"]')!.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Cập nhật bản ghi"]')!.disabled).toBe(true);
  await act(async () => finish(Response.json({ transcript_id: "t1", project_id: "p1", revision: 2, version_no: 1,
    speakers: [], segments: writes.at(-1)!.body.segments })));
  expect(host.querySelector<HTMLTextAreaElement>("#segment-0")!.readOnly).toBe(false);
});

it("keeps the original draft when Colab fails", async () => {
  const { host } = await mount({ response: Promise.resolve(Response.json({ detail: "Colab không sẵn sàng" }, { status: 503 })) });
  const fix = host.querySelector<HTMLButtonElement>('[aria-label="Sửa chính tả đoạn 1"]');
  expect(fix).toBeTruthy();
  await act(async () => fix!.click());
  expect(host.querySelector<HTMLTextAreaElement>("#segment-0")!.value).toBe("xin chao");
  expect(host.textContent).toContain("Colab không sẵn sàng");
});

it("blocks saving a dirty draft while grammar processing is pending", async () => {
  let finish!: (response: Response) => void;
  const response = new Promise<Response>(resolve => { finish = resolve; });
  const { host, writes } = await mount({ response });
  const input = host.querySelector<HTMLTextAreaElement>("#segment-0")!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "xin chao moi");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const save = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Lưu bản ghi"))!;
  expect(save.disabled).toBe(false);
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Sửa chính tả đoạn 1"]')!.click());
  expect(save.disabled).toBe(true);
  await act(() => save.click());
  expect(writes.map(write => write.url)).toEqual(["/api/projects/p1/fix-grammar"]);
  await act(async () => finish(Response.json({ text: "Xin chào mới." })));
  expect(input.value).toBe("Xin chào mới.");
  expect(save.disabled).toBe(false);
});

it.each([{ grammar: false }, { canEdit: false }])("hides grammar processing when disabled or read-only: %j", async options => {
  const { host } = await mount(options);
  expect(host.querySelector('[aria-label="Sửa chính tả đoạn 1"]')).toBeNull();
});

it("labels unbound history and previews it without restoring or replacing selected source", async()=>{
 const {host,writes}=await mount({mediaId:"m1",versions:[{transcript_id:"legacy",version_no:0,created_at:"2026-01-01",is_current:false,media_file_id:null},{transcript_id:"mock",version_no:1,created_at:"2026-01-01",is_current:true}]});
 await act(()=>host.querySelector<HTMLButtonElement>('button[aria-label="L\u1ecbch s\u1eed phi\u00ean b\u1ea3n"]')!.click());
 expect(host.textContent?.split("Ngu\u1ed3n ch\u01b0a x\u00e1c \u0111\u1ecbnh")).toHaveLength(2);
 expect([...host.querySelectorAll("button")].some(b=>b.textContent?.trim()==="D\u00f9ng b\u1ea3n n\u00e0y")).toBe(false);
 await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent?.trim()==="Xem")!.click());
 expect(host.textContent).toContain("Legacy content");expect(writes).toEqual([]);
 expect(host.querySelector<HTMLTextAreaElement>("#segment-0")!.value).toBe("xin chao");
});
