// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { glossaryToCsv } from "./csv";

it("exports Vietnamese glossary columns with an Excel-compatible UTF-8 marker", () => {
  expect(glossaryToCsv([{ term: "Cuộc họp", definition: "Trao đổi", language_code: "vi" }]))
    .toBe('\uFEFF"Thuật ngữ","Giải thích","Ngôn ngữ","Nhóm"\r\n"Cuộc họp","Trao đổi","vi",""');
});

it("escapes commas, quotes and newlines in every CSV field", () => {
  expect(glossaryToCsv([{ term: 'Từ, "đặc biệt"', definition: "Dòng một\nDòng hai", language_code: "en", category: "Kỹ thuật, nội bộ" }]))
    .toBe('\uFEFF"Thuật ngữ","Giải thích","Ngôn ngữ","Nhóm"\r\n"Từ, ""đặc biệt""","Dòng một\nDòng hai","en","Kỹ thuật, nội bộ"');
});

it("creates a valid header-only CSV template for importing terms", () => {
  expect(glossaryToCsv([])).toBe('\uFEFF"Thuật ngữ","Giải thích","Ngôn ngữ","Nhóm"');
});
