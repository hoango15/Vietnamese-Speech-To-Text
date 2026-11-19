import { useEffect, useRef, useState } from "react";
import {
  History,
  Merge,
  Play,
  Plus,
  RefreshCw,
  Save,
  Scissors,
  Search,
  SpellCheck,
  Trash2,
  Users,
  Subtitles,
} from "lucide-react";
import { api } from "../../../shared/api/client";
import { mergeSegments, reassignSpeaker, splitSegment, validateSegments } from "../lib/editor";
import type { Capabilities, List, Project, Segment, Transcript, TranscriptVersion } from "../../../shared/types";
import { date, time } from "../../../shared/lib/format";
import { Empty, ErrorBox, Loading, Modal } from "../../../shared/ui/components";
import { useAction } from "../../../shared/hooks/useAction";
import { useResource } from "../../../shared/hooks/useResource";
import { SpeakersDialog } from "./SpeakersDialog";
import "./transcript.css";

export function TranscriptEditor({
  project,
  mediaId,
  seek,
  reportDirty,
  onCreateSubtitles,
}: {
  project: Project;
  mediaId?: string;
  seek: (ms: number) => void;
  reportDirty: (dirty: boolean) => void;
  onCreateSubtitles?: () => void;
}) {
  const resource = useResource<Transcript>(
      `/projects/${project.project_id}/transcripts/current${mediaId ? "?media_file_id=" + encodeURIComponent(mediaId) : ""}`,
      true,
    ),
    versions = useResource<List<TranscriptVersion>>(
      `/projects/${project.project_id}/transcripts${mediaId ? "?media_file_id=" + encodeURIComponent(mediaId) : ""}`,
    ),
    [transcript, setTranscript] = useState<Transcript | null>(null),
    [dirty, setDirty] = useState(false),
    [q, setQ] = useState(""),
    [history, setHistory] = useState(false),
    [historyPreview, setHistoryPreview] = useState<Transcript | null>(null),
    [speakers, setSpeakers] = useState(false),
    [validation, setValidation] = useState(""),
    action = useAction(),
    grammar = useAction(),
    capabilities = useResource<Capabilities>("/system/capabilities");
  const latestTranscript = useRef(transcript);
  latestTranscript.current = transcript;
  useEffect(() => {
    setTranscript(resource.data);
    setDirty(false);
  }, [resource.data]);
  useEffect(() => {
    reportDirty(dirty);
    return () => reportDirty(false);
  }, [dirty, reportDirty]);
  function updateSegments(segments: Segment[]) {
    if (transcript) {
      setTranscript({ ...transcript, segments });
      setDirty(true);
      setValidation("");
    }
  }
  function change(index: number, patch: Partial<Segment>) {
    if (transcript)
      updateSegments(
        transcript.segments.map((segment, i) =>
          i === index ? { ...segment, ...patch } : segment,
        ),
      );
  }
  async function fixGrammar(index: number) {
    if (!transcript) return;
    const source = transcript, segment = source.segments[index];
    await grammar.run(async () => {
      const result = await api.request<{ text: string }>(`/projects/${project.project_id}/fix-grammar`, {
        method: "POST", body: { text: segment.segment_text },
      });
      const current = latestTranscript.current;
      if (current?.transcript_id !== source.transcript_id || current.revision !== source.revision || current.segments[index] !== segment)
        throw new Error("Đoạn đã thay đổi trong khi sửa chính tả. Nội dung mới được giữ nguyên.");
      setTranscript({ ...current, segments: current.segments.map((item, i) => i === index ? { ...item, segment_text: result.text } : item) });
      setDirty(true);
      setValidation("");
    }, "Đã sửa chính tả bản nháp. Kiểm tra nội dung trước khi lưu.");
  }
  async function save() {
    if (!transcript || grammar.busy) return;
    const error = validateSegments(transcript.segments);
    if (error) {
      setValidation(error);
      return;
    }
    await action.run(async () => {
      const result = await api.request<Transcript>(
        "/transcripts/" + transcript.transcript_id,
        {
          method: "PUT",
          body: {
            revision: transcript.revision,
            segments: transcript.segments.map(
              ({ segment_id, start_ms, end_ms, segment_text, speaker_id }) => ({
                ...(segment_id ? { segment_id } : {}),
                start_ms,
                end_ms,
                segment_text,
                speaker_id: speaker_id || null,
              }),
            ),
          },
        },
      );
      setTranscript(result);
      setDirty(false);
      versions.reload();
    }, "Đã lưu bản ghi.");
  }
  return (
    <div className="card transcript-panel">
      <div className="panel-header">
        <div>
          <h2>Bản ghi nội dung</h2>
          <p>
            {transcript
              ? `${transcript.segments.length} đoạn · Phiên bản ${transcript.version_no} · Revision ${transcript.revision}`
              : "Văn bản có dấu thời gian từ nội dung nguồn"}
            {dirty && <span className="unsaved"> · Chưa lưu</span>}
          </p>
        </div>
        <div className="row-actions">
          <button
            className="icon-button"
            title="Cập nhật kết quả"
            aria-label="Cập nhật bản ghi"
            disabled={action.busy}
            onClick={() => {
              if (!dirty || confirm("Bỏ các chỉnh sửa chưa lưu và tải lại?"))
                resource.reload();
            }}
          >
            <RefreshCw size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Lịch sử phiên bản"
            title="Lịch sử phiên bản"
            onClick={() => { versions.reload(); setHistory(true); }}
          >
            <History size={18} />
          </button>
          {project.can_edit && transcript && (
            <button
              className="button small"
              disabled={action.busy || grammar.busy || !dirty}
              onClick={save}
            >
              <Save size={16} />
              Lưu bản ghi
            </button>
          )}
        </div>
      </div>
      {resource.error ? (
        <ErrorBox error={resource.error} retry={resource.reload} />
      ) : resource.loading ? (
        <Loading />
      ) : !transcript ? (
        <Empty
          title="Chưa có bản ghi"
          description="Xử lý video hoặc âm thanh để nhận nội dung có dấu thời gian."
        />
      ) : (
        <>
          {project.can_edit && onCreateSubtitles && transcript.segments.some(segment => segment.segment_text.trim()) && <div className="vietsub-transcript-entry"><span>{dirty ? "Lưu bản ghi trước khi tạo Vietsub." : "Bản chép lời đã sẵn sàng để gắn phụ đề lên video."}</span><button className="button secondary small" disabled={dirty || action.busy || grammar.busy} onClick={onCreateSubtitles}><Subtitles size={16} />Tạo Vietsub</button></div>}
          <div className="editor-toolbar">
            <div className="search-field">
              <Search size={17} />
              <input
                aria-label="Tìm trong bản ghi"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Tìm trong bản ghi…"
              />
            </div>
            <button
              className="button secondary small"
              onClick={() => setSpeakers(true)}
              disabled={action.busy}
            >
              <Users size={16} />
              Người nói
            </button>
          </div>
          {project.can_edit && capabilities.data?.grammar && <p className="provider-note">
            Sửa chính tả gửi nội dung đoạn được chọn tới Colab. Kết quả là bản nháp; kiểm tra trước khi lưu.
          </p>}
          {validation && <ErrorBox error={validation} />}
          {q && !transcript.segments.some(segment => segment.segment_text.toLocaleLowerCase("vi").includes(q.toLocaleLowerCase("vi"))) && (
            <Empty title="Không tìm thấy đoạn phù hợp" description="Thử từ khóa khác để tìm trong bản ghi." />
          )}
          <div className="segment-list">
            {transcript.segments.map((segment, index) => {
              if (
                q &&
                !segment.segment_text
                  .toLocaleLowerCase("vi")
                  .includes(q.toLocaleLowerCase("vi"))
              )
                return null;
              return (
                <article
                  className="segment"
                  key={segment.segment_id ?? `new-${index}`}
                >
                  <div className="segment-header">
                    <button
                      className="timestamp"
                      onClick={() => seek(segment.start_ms)}
                      title="Tua đến đoạn này"
                    >
                      <Play size={12} />
                      {time(segment.start_ms)}
                    </button>
                    <span className="segment-number">Đoạn {index + 1}</span>
                    {project.can_edit && (
                      <div className="segment-actions">
                        {capabilities.data?.grammar && <button className="icon-button"
                          aria-label={"Sửa chính tả đoạn " + (index + 1)} title="Sửa chính tả bằng Colab"
                          disabled={grammar.busy || action.busy || !segment.segment_text.trim()}
                          onClick={() => fixGrammar(index)}><SpellCheck size={15} /></button>}
                        <button
                          className="icon-button"
                          aria-label={"Tách đoạn " + (index + 1)}
                          title="Tách đôi đoạn"
                          disabled={action.busy || segment.end_ms - segment.start_ms < 2}
                          onClick={() =>
                            updateSegments([
                              ...transcript.segments.slice(0, index),
                              ...splitSegment(segment),
                              ...transcript.segments.slice(index + 1),
                            ])
                          }
                        >
                          <Scissors size={15} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={
                            "Gộp đoạn " + (index + 1) + " với đoạn tiếp theo"
                          }
                          title="Gộp với đoạn sau"
                          disabled={action.busy || index === transcript.segments.length - 1}
                          onClick={() =>
                            updateSegments([
                              ...transcript.segments.slice(0, index),
                              mergeSegments(
                                segment,
                                transcript.segments[index + 1],
                              ),
                              ...transcript.segments.slice(index + 2),
                            ])
                          }
                        >
                          <Merge size={15} />
                        </button>
                        <button
                          className="icon-button danger"
                          aria-label={"Xóa đoạn " + (index + 1)}
                          disabled={action.busy}
                          title="Xóa đoạn"
                          onClick={() =>
                            updateSegments(
                              transcript.segments.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="segment-fields">
                    <label className="sr-only" htmlFor={"speaker-" + index}>
                      Người nói đoạn {index + 1}
                    </label>
                    <select
                      id={"speaker-" + index}
                      disabled={!project.can_edit || action.busy}
                      value={segment.speaker_id ?? ""}
                      onChange={(event) =>
                        change(index, {
                          speaker_id: event.target.value || null,
                        })
                      }
                    >
                      <option value="">Chưa gán người nói</option>
                      {transcript.speakers.map((speaker) => (
                        <option
                          key={speaker.speaker_id}
                          value={speaker.speaker_id}
                        >
                          {speaker.display_name || speaker.speaker_label}
                        </option>
                      ))}
                    </select>
                    {project.can_edit && (
                      <div className="timestamp-inputs">
                        <label>
                          Bắt đầu (ms)
                          <input
                            type="number"
                            disabled={action.busy}
                            min={0}
                            step={1}
                            value={Number.isFinite(segment.start_ms) ? segment.start_ms : ""}
                            onChange={(event) =>
                              change(index, {
                                start_ms: event.target.valueAsNumber,
                              })
                            }
                          />
                        </label>
                        <label>
                          Kết thúc (ms)
                          <input
                            type="number"
                            disabled={action.busy}
                            min={1}
                            step={1}
                            value={Number.isFinite(segment.end_ms) ? segment.end_ms : ""}
                            onChange={(event) =>
                              change(index, {
                                end_ms: event.target.valueAsNumber,
                              })
                            }
                          />
                        </label>
                      </div>
                    )}
                  </div>
                  <label className="sr-only" htmlFor={"segment-" + index}>
                    Nội dung đoạn {index + 1}
                  </label>
                  <textarea
                    id={"segment-" + index}
                    rows={Math.max(
                      2,
                      Math.ceil(segment.segment_text.length / 85),
                    )}
                    readOnly={!project.can_edit || action.busy}
                    value={segment.segment_text}
                    onChange={(event) =>
                      change(index, { segment_text: event.target.value })
                    }
                  />
                </article>
              );
            })}
          </div>
          {project.can_edit && (
            <div className="editor-footer">
              <button
                className="button secondary small"
                disabled={action.busy}
                onClick={() => {
                  const start = transcript.segments.at(-1)?.end_ms ?? 0;
                  updateSegments([
                    ...transcript.segments,
                    {
                      start_ms: start,
                      end_ms: start + 3000,
                      segment_text: "",
                      speaker_id: null,
                    },
                  ]);
                }}
              >
                <Plus size={16} />
                Thêm đoạn
              </button>
              <span className="muted small-text">
                Lưu toàn bộ đoạn trong một phiên bản chỉnh sửa.
              </span>
            </div>
          )}
        </>
      )}
      {history && (
        <Modal title="Lịch sử bản ghi" onClose={() => setHistory(false)}>
          {versions.error ? (
            <ErrorBox error={versions.error} retry={versions.reload} />
          ) : versions.loading ? (
            <Loading />
          ) : versions.data?.items.length ? (
            <div className="version-list">
              {versions.data.items.map((version) => (
                <div key={version.transcript_id}>
                  <div>
                    <strong>Phiên bản {version.version_no}</strong>
                    <small>{date(version.created_at)}</small>
                    {version.media_file_id === null && <small>{"Ngu\u1ed3n ch\u01b0a x\u00e1c \u0111\u1ecbnh"}</small>}
                  </div>
                  {version.media_file_id === null ? (
                    <button className="button secondary small" disabled={action.busy}
                      onClick={() => action.run(async () => {
                        setHistoryPreview(await api.request<Transcript>(`/transcripts/${version.transcript_id}`));
                      })}>Xem</button>
                  ) : version.is_current ? (
                    <span className="badge">Hiện hành</span>
                  ) : project.can_edit ? (
                    <button
                      className="button secondary small"
                      disabled={action.busy}
                      onClick={() => {
                        if (
                          dirty &&
                          !confirm("Bỏ chỉnh sửa chưa lưu và chuyển phiên bản?")
                        )
                          return;
                        action.run(async () => {
                          await api.request(
                            `/transcripts/${version.transcript_id}/set-current`,
                            { method: "POST" },
                          );
                          setHistory(false);
                          resource.reload();
                          versions.reload();
                        }, "Đã chuyển bản ghi hiện hành.");
                      }}
                    >
                      Dùng bản này
                    </button>
                  ) : null}
                </div>
              ))}
              {historyPreview && <div className="preview-text">{historyPreview.segments.map((segment, index) => <p key={index}>{segment.segment_text}</p>)}</div>}
            </div>
          ) : (
            <Empty title="Chưa có lịch sử" />
          )}
        </Modal>
      )}
      {speakers && (
        <SpeakersDialog
          mediaId={mediaId}
          onReassign={(source, target) => {
            if (transcript)
              updateSegments(
                reassignSpeaker(transcript.segments, source, target),
              );
          }}
          project={project}
          onClose={() => setSpeakers(false)}
          onChange={(items) => {
            if (transcript) setTranscript({ ...transcript, speakers: items });
          }}
        />
      )}
    </div>
  );
}
