import { useState, type FormEvent } from "react";
import { api } from "../../../shared/api/client";
import type { Company, Project } from "../../../shared/types";
import { Modal } from "../../../shared/ui/components";
import { PaginatedSelect } from "../../../shared/ui/PaginatedSelect";
import { useAction } from "../../../shared/hooks/useAction";
import { useAuth } from "../../auth/AuthProvider";

export function ProjectForm({
  project,
  companyId,
  initialScope,
  onClose,
  onSaved,
}: {
  project?: Project;
  companyId?: string;
  initialScope?: "PERSONAL" | "TEAM";
  onClose: () => void;
  onSaved: (saved: Project) => void;
}) {
  const action = useAction();
  const { user } = useAuth();
  const canTeam = user?.user_role_code === "ADMIN" || (user?.user_role_code === "COMPANY_OWNER" && Boolean(user.company_id));
  const [scope, setScope] = useState(project?.project_scope ?? initialScope ?? (companyId || (user?.user_role_code === "COMPANY_OWNER" && user.company_id) ? "TEAM" : "PERSONAL"));
  const personal = scope === "PERSONAL";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await action.run(
      async () => {
        const saved = await api.request<Project>(
          project ? "/projects/" + project.project_id : "/projects",
          {
            method: project ? "PATCH" : "POST",
            body: {
              project_title: values.get("project_title"),
              project_description: values.get("project_description"),
              language_code: values.get("language_code"),
              ...(!project ? { project_scope: personal ? "PERSONAL" : "TEAM" } : {}),
              ...(!project && !personal ? { company_id: companyId || values.get("company_id") || user?.company_id } : {}),
              ...(personal ? { project_type: values.get("project_type") } : {}),
            },
          },
        );
        onSaved(saved);
        onClose();
      },
      project ? "Đã cập nhật dự án." : "Đã tạo dự án.",
    );
  }
  return (
    <Modal
      title={project ? "Chỉnh sửa dự án" : personal ? "Tạo dự án cá nhân" : "Tạo dự án mới"}
      onClose={onClose}
    >
      <form className="stack" onSubmit={submit}>
        {!project && !companyId && canTeam && <label>Phạm vi dự án<select name="project_scope" value={scope} onChange={event => setScope(event.target.value as "PERSONAL" | "TEAM")}><option value="PERSONAL">Dự án cá nhân</option><option value="TEAM">Dự án công ty</option></select></label>}
        {!project && !personal && !companyId && user?.user_role_code === "ADMIN" && <PaginatedSelect<Company> path="/companies" label="Công ty" searchLabel="Tìm công ty để chọn" emptyLabel="Chọn công ty" name="company_id" required option={company => ({ value: company.company_id, label: company.company_name })} />}
        <p className="muted">
          {personal
            ? "Chọn loại nội dung cho dự án cá nhân của bạn."
            : "Mỗi dự án có thể lưu nhiều tệp video, âm thanh hoặc hình ảnh nguồn."}
        </p>
        {personal && (
          <label>
            Loại dự án
            <select name="project_type" defaultValue={project?.project_type ?? "VIDEO"}>
              <option value="VIDEO">Video</option>
              <option value="IMAGE">Hình ảnh</option>
              <option value="LECTURE">Bài giảng (video hoặc âm thanh)</option>
              <option value="AUDIO">Âm thanh</option>
            </select>
          </label>
        )}
        <label>
          Tên dự án
          <input
            name="project_title"
            required
            autoFocus
            maxLength={300}
            defaultValue={project?.project_title}
            placeholder="Ví dụ: Họp nhóm sản phẩm tháng 11"
          />
        </label>
        <label>
          Mô tả
          <textarea
            name="project_description"
            rows={3}
            defaultValue={project?.project_description}
            placeholder="Nội dung và mục tiêu của dự án…"
          />
        </label>
        <label>
          Ngôn ngữ
          <select
            name="language_code"
            defaultValue={project?.language_code ?? "vi"}
          >
            <option value="vi">Tiếng Việt</option>
            <option value="en">Tiếng Anh</option>
            <option value="auto">Tự nhận diện</option>
          </select>
        </label>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="button" disabled={action.busy}>
            {action.busy ? "Đang lưu…" : project ? "Lưu thay đổi" : "Tạo dự án"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
