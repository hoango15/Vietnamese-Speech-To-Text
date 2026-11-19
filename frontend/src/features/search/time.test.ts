import { expect, it } from "vitest";
import { searchTimestamp, timestampQuery } from "./time";

it("formats valid search positions as zero-padded hours, minutes and seconds", () => {
  expect(searchTimestamp(3_661_900)).toBe("01:01:01");
});

it("uses a safe zero timestamp for negative or non-finite media positions", () => {
  expect(searchTimestamp(-1)).toBe("00:00:00");
  expect(searchTimestamp(Number.NaN)).toBe("00:00:00");
  expect(searchTimestamp(Number.POSITIVE_INFINITY)).toBe("00:00:00");
});

it("does not add invalid times to project links", () => {
  expect(timestampQuery(65_000)).toBe("&t=65000");
  expect(timestampQuery(-1)).toBe("");
  expect(timestampQuery(Number.NaN)).toBe("");
});
