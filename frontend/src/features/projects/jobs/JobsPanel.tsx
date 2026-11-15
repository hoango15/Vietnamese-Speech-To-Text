import { RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import type { Job, List, Project } from "../../../shared/types";
import { Empty, ErrorBox, Loading, Pagination, statusNames } from "../../../shared/ui/components";
import { useResource } from "../../../shared/hooks/useResource";
import { JobCard } from "./JobCard";

export function JobsPanel({ project }: { project: Project }) {
  const [params, setParams] = useSearchParams();
  const q = params.get("jobs_q") ?? "";
  const status = params.get("jobs_status") ?? "";
  const pageValue = Number(params.get("jobs_page") ?? 1);
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const query = new URLSearchParams({ q, page: String(page), page_size: "20" });
  if (status) query.set("status", status);
  const { data, error, loading, reload } = useResource<List<Job>>(
    `/projects/${project.project_id}/jobs?${query}`,
  );
  function filter(values: Record<string, string>) {
    setParams(current => {
      const next = new URLSearchParams(current);
      next.set("jobs_page", "1");
      for (const [key, value] of Object.entries(values)) value ? next.set(key, value) : next.delete(key);
      return next;
    });
  }
  return (
    <div className="card panel jobs-panel">
      <div className="section-heading">
        <div>
          <h2>Lịch sử xử lý</h2>
          <p>Tiến trình cập nhật tự động mỗi 2 giây.</p>
        </div>
        <button
          className="icon-button"
          aria-label="Cập nhật lịch sử"
          onClick={reload}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      <form className="toolbar" onSubmit={event => {
        event.preventDefault();
        filter({ jobs_q: String(new FormData(event.currentTarget).get("q") ?? "").trim() });
      }}>
        <input key={q} name="q" aria-label="Tìm tác vụ" placeholder="Tên tệp hoặc mã tác vụ" maxLength={200} defaultValue={q} />
        <select aria-label="Trạng thái tác vụ" value={status} onChange={event => filter({ jobs_status: event.target.value })}>
          <option value="">Tất cả trạng thái</option>
          {["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELED"].map(code => <option key={code} value={code}>{statusNames[code]}</option>)}
        </select>
        <button className="button secondary small">Tìm kiếm</button>
      </form>
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading ? (
        <Loading />
      ) : data?.items.length ? (
        data.items.map((job) => (
          <JobCard job={job} canEdit={project.can_edit} key={job.job_id} onChange={reload} />
        ))
      ) : (
        <Empty
          title="Chưa có lần xử lý nào"
          description="Tải tệp nguồn lên, rồi bắt đầu nhận dạng nội dung."
        />
      )}
      {data && !error && <Pagination page={page} total={data.total} onChange={value => filter({ jobs_page: String(value) })} />}
    </div>
  );
}
