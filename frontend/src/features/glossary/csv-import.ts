import type { GlossaryCsvEntry } from "./csv";

function readRows(input: string): string[][] {
  const rows: string[][] = [[]];
  let value = "", quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"' && value.length === 0) quoted = true;
    else if (char === ",") { rows.at(-1)!.push(value); value = ""; }
    else if (char === "\n" || char === "\r") {
      rows.at(-1)!.push(value); value = "";
      if (char === "\r" && input[i + 1] === "\n") i++;
      rows.push([]);
    } else value += char;
  }
  if (quoted) throw new Error("Tệp CSV có dấu ngoặc kép chưa đóng.");
  rows.at(-1)!.push(value);
  return rows.filter(row => row.some(cell => cell.trim()));
}

function headerName(value: string): string {
  return value.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
}

export function parseGlossaryCsv(input: string): GlossaryCsvEntry[] {
  const rows = readRows(input.replace(/^\uFEFF/, ""));
  const header = rows.shift();
  if (!header) throw new Error("Tệp CSV chưa có dữ liệu.");
  const columns = header.map(headerName);
  const find = (...names: string[]) => columns.findIndex(column => names.includes(column));
  const termColumn = find("term", "thuatngu");
  const definitionColumn = find("definition", "giaithich");
  const languageColumn = find("language", "languagecode", "ngongu");
  const categoryColumn = find("category", "group", "nhom");
  if (termColumn < 0 || definitionColumn < 0)
    throw new Error("CSV cần có cột “Thuật ngữ” và “Giải thích”.");
  if (rows.length > 500) throw new Error("Mỗi lần chỉ có thể nhập tối đa 500 thuật ngữ.");
  return rows.map((row, index) => {
    const term = row[termColumn]?.trim() ?? "", definition = row[definitionColumn]?.trim() ?? "";
    const language_code = (languageColumn >= 0 ? row[languageColumn]?.trim() : "") || "vi";
    if (!term || !definition) throw new Error(`Dòng ${index + 2}: cần có thuật ngữ và phần giải thích.`);
    if (term.length > 160 || definition.length > 4000)
      throw new Error(`Dòng ${index + 2}: thuật ngữ tối đa 160 ký tự, giải thích tối đa 4.000 ký tự.`);
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language_code))
      throw new Error(`Dòng ${index + 2}: mã ngôn ngữ không hợp lệ.`);
    return {
      term,
      definition,
      language_code,
      category: (categoryColumn >= 0 ? row[categoryColumn]?.trim() : "") || null,
    };
  });
}
