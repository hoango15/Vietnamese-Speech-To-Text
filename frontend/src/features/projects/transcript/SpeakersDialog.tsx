import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { api } from "../../../shared/api/client";
import type { List, Project, Speaker } from "../../../shared/types";
import { ErrorBox, Loading, Modal } from "../../../shared/ui/components";
import { useAction } from "../../../shared/hooks/useAction";
import { useResource } from "../../../shared/hooks/useResource";

export function SpeakersDialog({
  project,
  mediaId,
  onClose,
  onChange,
  onReassign,
}: {
  project: Project;
  mediaId?: string;
  onClose: () => void;
  onChange: (speakers: Speaker[]) => void;
  onReassign: (source: string, target: string | null) => void;
}) {
  const resource = useResource<List<Speaker>>(
      `/projects/${project.project_id}/speakers${mediaId ? "?media_file_id=" + encodeURIComponent(mediaId) : ""}`,
    ),
    action = useAction(),
    [editing, setEditing] = useState<Speaker | null>(null),
    [merge, setMerge] = useState<Record<string, string>>({});
  useEffect(() => {
    if (resource.data) onChange(resource.data.items);
  }, [resource.data]);
  return (
    <Modal title="Người nói" onClose={onClose}>
      <p className="muted">
        Đặt tên, màu sắc và gộp người nói. Các thay đổi áp dụng ngay.
      </p>
      {resource.error ? (
        <ErrorBox error={resource.error} retry={resource.reload} />
      ) : resource.loading ? (
        <Loading />
      ) : (
        <div className="speaker-list">
          {resource.data?.items.map((speaker) => (
            <div className="speaker-item" key={speaker.speaker_id}>
              <div className="speaker-name">
                <i style={{ background: speaker.color_hex }} />
                <strong>{speaker.display_name || speaker.speaker_label}</strong>
              </div>
              {project.can_edit && (
                <>
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      aria-label={"Sửa " + speaker.display_name}
                      onClick={() => setEditing(speaker)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={"Xóa " + speaker.display_name}
                      onClick={() => {
                        if (
                          confirm(
                            "Xóa người nói? Các đoạn sẽ được bỏ gán người nói.",
                          )
                        )
                          action.run(async () => {
                            await api.request(
                              "/speakers/" + speaker.speaker_id,
                              { method: "DELETE" },
                            );
                            onReassign(speaker.speaker_id, null);
                            resource.reload();
                          });
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="speaker-merge">
                    <select
                      aria-label={"Gộp " + speaker.display_name + " vào"}
                      value={merge[speaker.speaker_id] ?? ""}
                      onChange={(event) =>
                        setMerge({
                          ...merge,
                          [speaker.speaker_id]: event.target.value,
                        })
                      }
                    >
                      <option value="">Gộp vào người nói khác…</option>
                      {resource.data?.items
                        .filter(
                          (item) => item.speaker_id !== speaker.speaker_id,
                        )
                        .map((item) => (
                          <option key={item.speaker_id} value={item.speaker_id}>
                            {item.display_name}
                          </option>
                        ))}
                    </select>
                    <button
                      className="button secondary small"
                      disabled={action.busy || !merge[speaker.speaker_id]}
                      onClick={() => {
                        if (
                          confirm(
                            "Gộp người nói và chuyển tất cả đoạn sang người nói đích?",
                          )
                        )
                          action.run(async () => {
                            await api.request(
                              `/speakers/${speaker.speaker_id}/merge`,
                              {
                                method: "POST",
                                body: {
                                  target_speaker_id: merge[speaker.speaker_id],
                                },
                              },
                            );
                            onReassign(
                              speaker.speaker_id,
                              merge[speaker.speaker_id],
                            );
                            resource.reload();
                          });
                      }}
                    >
                      Gộp
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {project.can_edit && (
        <form
          className="stack term-form"
          key={editing?.speaker_id ?? "new"}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            action.run(async () => {
              await api.request(
                editing
                  ? "/speakers/" + editing.speaker_id
                  : `/projects/${project.project_id}/speakers${mediaId ? "?media_file_id=" + encodeURIComponent(mediaId) : ""}`,
                {
                  method: editing ? "PATCH" : "POST",
                  body: {
                    display_name: form.get("name"),
                    color_hex: form.get("color"),
                  },
                },
              );
              setEditing(null);
              resource.reload();
            }, "Đã lưu người nói.");
          }}
        >
          <h3>{editing ? "Sửa người nói" : "Thêm người nói"}</h3>
          <div className="inline-form">
            <label>
              Tên hiển thị
              <input
                name="name"
                required
                defaultValue={editing?.display_name}
                maxLength={200}
              />
            </label>
            <label>
              Màu
              <input
                type="color"
                name="color"
                defaultValue={editing?.color_hex ?? "#0d9488"}
              />
            </label>
          </div>
          <div className="form-actions">
            {editing && (
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(null)}
              >
                Hủy
              </button>
            )}
            <button className="button" disabled={action.busy}>
              {editing ? "Lưu thay đổi" : "Thêm người nói"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
