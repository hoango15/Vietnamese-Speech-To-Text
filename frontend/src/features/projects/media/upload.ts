import type { ApiClient } from "../../../shared/api/client";
import type { Upload } from "../../../shared/types";

export async function uploadChunks(
  api: Pick<ApiClient, "request">,
  id: string,
  file: Blob,
  signal: AbortSignal,
  progress: (n: number) => void,
  size = 5 * 1024 * 1024,
): Promise<void> {
  signal.throwIfAborted();
  let session = await api.request<Upload>(`/uploads/${id}`, { signal }),
    conflicts = 0;
  while (session.upload_status_code !== "COMPLETED" && session.uploaded_size_bytes < file.size) {
    signal.throwIfAborted();
    const offset = session.uploaded_size_bytes;
    try {
      session = await api.request<Upload>(`/uploads/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/octet-stream",
          "Upload-Offset": String(offset),
        },
        body: file.slice(offset, offset + size),
        signal,
      });
      if (session.uploaded_size_bytes <= offset)
        throw new Error(
          "Máy chủ không nhận thêm dữ liệu. Hãy tiếp tục tải lại.",
        );
      conflicts = 0;
    } catch (error) {
      if ((error as { status?: number }).status !== 409 || ++conflicts > 3)
        throw error;
      session = await api.request<Upload>(`/uploads/${id}`, { signal });
    }
    progress(session.upload_status_code === "COMPLETED" ? 100 : Math.min(100, Math.round((session.uploaded_size_bytes / file.size) * 100)));
  }
  progress(100);
}
