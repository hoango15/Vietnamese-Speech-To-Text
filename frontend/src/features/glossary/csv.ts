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
