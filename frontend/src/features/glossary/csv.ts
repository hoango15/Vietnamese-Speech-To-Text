export interface GlossaryCsvEntry {
  term: string;
  definition: string;
  language_code: string;
  category?: string | null;
}

function cell(value: string | null | undefined): string {
  return `"${(value ?? "").replaceAll('"', '""')}"`;
}

export function glossaryToCsv(terms: GlossaryCsvEntry[]): string {
  const rows = [
    ["Thuật ngữ", "Giải thích", "Ngôn ngữ", "Nhóm"],
    ...terms.map(item => [item.term, item.definition, item.language_code, item.category ?? ""]),
  ];
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n");
}

export function downloadGlossaryCsv(content: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
