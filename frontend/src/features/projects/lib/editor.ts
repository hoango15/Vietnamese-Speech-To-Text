import type { Segment } from "../../../shared/types";

export function splitSegment(segment: Segment): [Segment, Segment] {
  const middle = Math.floor((segment.start_ms + segment.end_ms) / 2),
    words = segment.segment_text.split(/\s+/),
    cut = Math.ceil(words.length / 2);
  return [
    { ...segment, end_ms: middle, segment_text: words.slice(0, cut).join(" ") },
    {
      ...segment,
      segment_id: undefined,
      start_ms: middle,
      segment_text: words.slice(cut).join(" "),
    },
  ];
}
export function mergeSegments(first: Segment, second: Segment): Segment {
  return {
    ...first,
    end_ms: second.end_ms,
    segment_text: [first.segment_text, second.segment_text]
      .filter(Boolean)
      .join(" "),
  };
}
export function validateSegments(segments: Segment[]): string {
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (
      !Number.isInteger(segment.start_ms) ||
      !Number.isInteger(segment.end_ms) ||
      segment.start_ms < 0 ||
      segment.end_ms <= segment.start_ms
    )
      return `Đoạn ${i + 1}: thời gian kết thúc phải lớn hơn bắt đầu (mili giây).`;
    if (i && segment.start_ms < segments[i - 1].end_ms)
      return `Đoạn ${i + 1}: thời gian chồng lấn với đoạn trước.`;
  }
  return "";
}
export function reassignSpeaker(
  segments: Segment[],
  source: string,
  target: string | null,
): Segment[] {
  return segments.map((segment) =>
    segment.speaker_id === source
      ? { ...segment, speaker_id: target }
      : segment,
  );
}
