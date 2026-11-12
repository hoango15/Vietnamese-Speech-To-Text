import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownToLine, ArrowRight, Search } from "lucide-react";
import { api } from "../../shared/api/client";
import type { ExportFile, List, Minutes } from "../../shared/types";
import { bytes, date } from "../../shared/lib/format";
import { Empty, ErrorBox, Loading, MobileDetails, PageTitle, Pagination } from "../../shared/ui/components";
import { useAction } from "../../shared/hooks/useAction";
import { useResource } from "../../shared/hooks/useResource";

export function LibraryPage({ kind }: { kind: "minutes" | "subtitles" }) {
  const minutes = kind === "minutes",
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    action = useAction();
  const { data, error, loading, reload } = useResource<
    List<Minutes | ExportFile>
  >(
    `/library/${minutes ? "minutes" : "subtitles"}?q=${encodeURIComponent(q)}&page=${page}`,
  );
  return (
    <>
      <PageTitle
        title={minutes ? "Biên bản cuộc họp" : "Thư viện phụ đề"}
        subtitle={
          minutes
            ? "Tìm lại nội dung, quyết định và công việc từ các cuộc họp."
            : "Tất cả phụ đề đã xuất trong không gian của bạn."
        }
      />
      <div className="toolbar">
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label="Tìm thư viện"
            placeholder="Tìm tên dự án hoặc nội dung…"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading ? (
        <Loading />
      ) : !data?.items.length ? (
        <div className="card">
          <Empty
            title={q ? "Không tìm thấy kết quả" : minutes ? "Chưa có biên bản" : "Chưa có phụ đề"}
            description={q ? "Thử từ khóa khác để tìm trong thư viện." : "Mở dự án, xử lý nội dung và tạo kết quả đầu tiên."}
          />
          {page > 1 && <Pagination page={page} total={data?.total ?? 0} onChange={setPage} />}
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="responsive-table">
            <thead>
              <tr>
                <th>{minutes ? "Biên bản" : "Tệp phụ đề"}</th>
                <th className="desktop-column">Dự án</th>
                <th className="desktop-column">Ngày tạo</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => {
                if ("minutes_id" in item)
                  return (
                    <tr key={item.minutes_id}>
                      <td>
                        <strong>{item.meeting_title}</strong>
                        <small className="cell-small">
                          Phiên bản {item.version_no}
                        </small>
                        {item.media_file_id === null && <small className="cell-small">Nguồn chưa xác định</small>}
                        <MobileDetails>
                          <dt>Dự án</dt><dd>{item.project_title}</dd>
                          <dt>Ngày tạo</dt><dd>{date(item.created_at)}</dd>
                        </MobileDetails>
                      </td>
                      <td className="desktop-column">{item.project_title}</td>
                      <td className="desktop-column">{date(item.created_at)}</td>
                      <td>
                        <Link
                          className="text-link"
                          to={`/projects/${item.project_id}?tab=minutes${item.media_file_id ? `&media=${encodeURIComponent(item.media_file_id)}` : ""}&minutes=${encodeURIComponent(item.minutes_id)}`}
                        >
                          Mở biên bản
                          <ArrowRight size={15} />
                        </Link>
                      </td>
                    </tr>
                  );
                return (
                  <tr key={item.export_file_id}>
                    <td>
                      <strong>{item.file_name}</strong>
                      <small className="cell-small">
                        {bytes(item.file_size_bytes)} · {item.export_kind_code}
                      </small>
                      {item.media_file_id === null && <small className="cell-small">Nguồn chưa xác định</small>}
                      <MobileDetails>
                        <dt>Dự án</dt><dd>{item.media_file_id === null ? item.project_title : <Link to={`/projects/${item.project_id}?tab=exports${item.media_file_id ? `&media=${encodeURIComponent(item.media_file_id)}` : ""}`}>{item.project_title}</Link>}</dd>
                        <dt>Ngày tạo</dt><dd>{date(item.created_at)}</dd>
                      </MobileDetails>
                    </td>
                    <td className="desktop-column">
                      {item.media_file_id === null ? item.project_title : <Link to={`/projects/${item.project_id}?tab=exports${item.media_file_id ? `&media=${encodeURIComponent(item.media_file_id)}` : ""}`}>
                        {item.project_title}
                      </Link>}
                    </td>
                    <td className="desktop-column">{date(item.created_at)}</td>
                    <td>
                      <button
                        className="button secondary small"
                        disabled={action.busy}
                        onClick={() =>
                          action.run(() =>
                            api.download(
                              `/exports/${item.export_file_id}/download`,
                              item.file_name,
                            ),
                          )
                        }
                      >
                        <ArrowDownToLine size={16} />
                        Tải xuống
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} total={data.total} onChange={setPage} />
        </div>
      )}
    </>
  );
}
