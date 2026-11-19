import { expect, it } from "vitest";
import {
  splitSegment,
  mergeSegments,
  validateSegments,
  reassignSpeaker,
} from "./editor";

const segment = {
  segment_id: "s1",
  segment_no: 1,
  start_ms: 1000,
  end_ms: 5000,
  segment_text: "Xin chào mọi người",
  speaker_id: "p1",
};
it("splits timing and text while giving new segment no persisted identity", () => {
  const [first, second] = splitSegment(segment);
  expect(first.end_ms).toBe(3000);
  expect(second.start_ms).toBe(3000);
  expect(second.segment_id).toBeUndefined();
  expect(first.segment_text + " " + second.segment_text).toBe(
    "Xin chào mọi người",
  );
});
it("merges adjacent segments without losing words or the outer timestamps", () => {
  expect(
    mergeSegments(segment, {
      ...segment,
      segment_id: "s2",
      start_ms: 5000,
      end_ms: 8000,
      segment_text: "Cảm ơn",
    }),
  ).toMatchObject({
    start_ms: 1000,
    end_ms: 8000,
    segment_text: "Xin chào mọi người Cảm ơn",
  });
});
it("rejects invalid and overlapping timestamps before saving", () => {
  expect(validateSegments([{ ...segment, end_ms: 500 }])).toBeTruthy();
  expect(
    validateSegments([segment, { ...segment, start_ms: 4000, end_ms: 6000 }]),
  ).toBeTruthy();
  expect(
    validateSegments([segment, { ...segment, start_ms: 5000, end_ms: 6000 }]),
  ).toBe("");
});
it("preserves unsaved text when a speaker is merged or deleted", () => {
  const draft = [
    { ...segment, segment_text: "Nội dung chưa lưu" },
    { ...segment, segment_id: "s2", speaker_id: "p2" },
  ];
  expect(reassignSpeaker(draft, "p1", "p3")).toEqual([
    { ...draft[0], speaker_id: "p3" },
    draft[1],
  ]);
  expect(reassignSpeaker(draft, "p1", null)[0]).toMatchObject({
    segment_text: "Nội dung chưa lưu",
    speaker_id: null,
  });
  expect(draft[0].speaker_id).toBe("p1");
});
