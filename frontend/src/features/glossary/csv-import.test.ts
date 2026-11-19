import { describe, expect, it } from "vitest";
import { parseGlossaryCsv } from "./csv-import";

describe("parseGlossaryCsv", () => {
  it("parses the exported Vietnamese header and defaults a missing language to Vietnamese", () => {
    expect(parseGlossaryCsv('\uFEFF"Thuật ngữ","Giải thích","Ngôn ngữ","Nhóm"\r\n"Cuộc họp","Trao đổi","",""'))
      .toEqual([{ term: "Cuộc họp", definition: "Trao đổi", language_code: "vi", category: null }]);
  });

  it("supports quoted commas, doubled quotes, and line breaks", () => {
    expect(parseGlossaryCsv('term,definition,language,category\n"Từ, ""đặc biệt""","Dòng một\nDòng hai",en,"Nhóm, A"'))
      .toEqual([{ term: 'Từ, "đặc biệt"', definition: "Dòng một\nDòng hai", language_code: "en", category: "Nhóm, A" }]);
  });

  it("accepts English and Vietnamese column names", () => {
    expect(parseGlossaryCsv("Thuật ngữ,Giải thích,Ngôn ngữ,Nhóm\nXin chào,Hello,vi,Chào hỏi")[0])
      .toEqual({ term: "Xin chào", definition: "Hello", language_code: "vi", category: "Chào hỏi" });
  });

  it("rejects missing required columns and unclosed quoted fields", () => {
    expect(() => parseGlossaryCsv("name,details\nA,B")).toThrow("cột “Thuật ngữ” và “Giải thích”");
    expect(() => parseGlossaryCsv('term,definition\n"A,B')).toThrow("ngoặc kép chưa đóng");
  });

  it("reports invalid rows instead of silently skipping partial terms", () => {
    expect(() => parseGlossaryCsv("term,definition\nTừ,")).toThrow("Dòng 2");
  });
});
