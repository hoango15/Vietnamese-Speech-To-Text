import { expect, it } from "vitest";
import { uploadChunks } from "./upload";

it("resumes from authoritative offset and reconciles duplicate chunk conflict", async () => {
  let offset = 3,
    conflicts = 0;
  const chunks: number[] = [];
  const file = new Blob(["abcdefghij"]);
  const api = {
    request: async (
      _path: string,
      options?: {
        method?: string;
        headers?: Record<string, string>;
        body?: unknown;
      },
    ) => {
      if (options?.method === "PATCH") {
        if (conflicts++ === 0) {
          offset = 5;
          throw { status: 409 };
        }
        expect(options.headers?.["Upload-Offset"]).toBe(String(offset));
        const body = options.body as Blob;
        chunks.push(body.size);
        offset += body.size;
      }
      return {
        upload_id: "id",
        uploaded_size_bytes: offset,
        expected_size_bytes: 10,
        upload_status_code: "UPLOADING",
      };
    },
  };
  const progress: number[] = [];
  await uploadChunks(
    api as never,
    "id",
    file,
    new AbortController().signal,
    (n) => progress.push(n),
    4,
  );
  expect(offset).toBe(10);
  expect(chunks).toEqual([4, 1]);
  expect(progress.at(-1)).toBe(100);
});
it("does not send chunks when paused", async () => {
  const abort = new AbortController();
  abort.abort();
  let calls = 0;
  await expect(
    uploadChunks(
      {
        request: async () => {
          calls++;
        },
      } as never,
      "id",
      new Blob(["abc"]),
      abort.signal,
      () => {},
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(calls).toBe(0);
});
it.each([false, true])("resumes a completed normalized upload without resending bytes (conflict: %s)", async conflict => {
  let reads = 0;
  const methods: string[] = [], progress: number[] = [];
  const api = { request: async (_path: string, options?: { method?: string }) => {
    methods.push(options?.method ?? "GET");
    if (options?.method === "PATCH") throw { status: 409 };
    const completed = !conflict || reads++ > 0;
    return { upload_id: "id", uploaded_size_bytes: completed ? 3 : 0,
      expected_size_bytes: completed ? 3 : 10, upload_status_code: completed ? "COMPLETED" : "UPLOADING" };
  } };
  await uploadChunks(api as never, "id", new Blob(["abcdefghij"]), new AbortController().signal, value => progress.push(value));
  expect(methods).toEqual(conflict ? ["GET", "PATCH", "GET"] : ["GET"]);
  expect(progress.at(-1)).toBe(100);
});
