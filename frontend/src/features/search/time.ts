export function searchTimestamp(milliseconds: number): string {
  const seconds = Number.isFinite(milliseconds) ? Math.max(0, Math.floor(milliseconds / 1000)) : 0;
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function timestampQuery(milliseconds: number): string {
  return Number.isFinite(milliseconds) && milliseconds >= 0 ? `&t=${Math.floor(milliseconds)}` : "";
}
