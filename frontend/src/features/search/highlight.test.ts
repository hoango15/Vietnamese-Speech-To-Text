import { expect, it } from "vitest";
import { highlightText } from "./highlight";

it("highlights every case-insensitive match while preserving the original Vietnamese text", () => {
  expect(highlightText("Tiếng Việt, tiếng việt", "tiếng")).toEqual([
    { text: "Tiếng", match: true }, { text: " Việt, ", match: false },
    { text: "tiếng", match: true }, { text: " việt", match: false },
  ]);
});

it("treats regular expression punctuation in a query as literal text", () => {
  expect(highlightText("a+b and a+b", "a+b")).toEqual([
    { text: "a+b", match: true }, { text: " and ", match: false }, { text: "a+b", match: true },
  ]);
});

it("leaves text unchanged for an empty search", () => {
  expect(highlightText("Nội dung", "  ")).toEqual([{ text: "Nội dung", match: false }]);
});
