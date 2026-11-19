import { useState } from "react";
import { Link } from "react-router-dom";
import { Archive, ArrowDownToLine, Eye, FileText, HardDrive, Search } from "lucide-react";
import { api } from "../../shared/api/client";
import type { FileRecord, List } from "../../shared/types";
import { bytes, date } from "../../shared/lib/format";
import {
  Empty,
  ErrorBox,
  FileIcon,
  fileKindNames,
  Loading,
  MobileDetails,
  PageTitle,
  Pagination,
  TabList,
} from "../../shared/ui/components";
import { useAction } from "../../shared/hooks/useAction";
import { useResource } from "../../shared/hooks/useResource";
import { FilePreviewDialog } from "./components/FilePreviewDialog";
import "./files.css";

export function FilesPage() {
  const [q, setQ] = useState(""),
    [kind, setKind] = useState(""),
    [page, setPage] = useState(1),
    [preview, setPreview] = useState<FileRecord | null>(null),
    action = useAction();
  const { data, error, loading, reload } = useResource<List<FileRecord>>(
    `/files?q=${encodeURIComponent(q)}&kind=${kind}&page=${page}`,
  );
  return (
    <>
      <PageTitle
        title="Tất cả tệp đã tạo"
        subtitle="Một nơi để xem lại tệp nguồn, phụ đề và tài liệu của mọi dự án."
      />
      <div className="stats-grid files-stats">
        {[
          { label: "Tệp theo bộ lọc", value: data?.total ?? "—", icon: Archive, note: "Tất cả các trang kết quả" },
          { label: "Tệp kết quả", value: data?.items.filter(file => !file.kind.includes("ORIGINAL_")).length ?? "—", icon: FileText, note: "Trên trang hiện tại" },
          { label: "Dung lượng tệp", value: data ? bytes(data.items.reduce((total, file) => total + file.size, 0)) : "—", icon: HardDrive, note: "Trên trang hiện tại" },
        ].map(item => <div className="stat-card" key={item.label}>
          <div><span>{item.label}</span><div className="stat-value">{item.value}</div><small className="muted">{item.note}</small></div>
          <div className="stat-icon teal"><item.icon size={22} /></div>
        </div>)}
      </div>
      <TabList label="Nhóm tệp">
        {[
          ["", "Tất cả"], ["ORIGINAL_VIDEO", "Video"], ["ORIGINAL_AUDIO", "Âm thanh"],
          ["ORIGINAL_IMAGE", "Hình ảnh"], ["SRT", "Phụ đề SRT"], ["VTT", "Phụ đề VTT"],
          ["TXT", "Văn bản TXT"], ["DOCX", "Tài liệu DOCX"], ["PDF", "Tài liệu PDF"], ["BURNED_VIDEO", "Video có phụ đề"],
        ].map(([code, label]) => <button key={code} role="tab" aria-selected={kind === code} tabIndex={kind === code ? 0 : -1}
          id={`file-tab-${code || "all"}`} aria-controls="files-panel"
          className={kind === code ? "active" : ""} onClick={() => { setKind(code); setPage(1); }}>{label}</button>)}
      </TabList>
      <div id="files-panel" role="tabpanel" aria-label="Danh sách tệp">
      <div className="toolbar">
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label="Tìm tệp"
            placeholder="Tìm tên tệp…"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          aria-label="Loại tệp"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả loại tệp</option>
          {[
            "ORIGINAL_VIDEO",
            "ORIGINAL_AUDIO",
            "ORIGINAL_IMAGE",
            "TXT",
            "SRT",
            "VTT",
            "DOCX",
            "PDF",
            "BURNED_VIDEO",
          ].map((code) => (
            <option key={code} value={code}>{fileKindNames[code] ?? code}</option>
          ))}
        </select>
      </div>
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading ? (
        <Loading />
      ) : !data?.items.length ? (
        <div className="card">
          <Empty
            title={q || kind ? "Không tìm thấy tệp" : "Kho tệp đang trống"}
            description={q || kind ? "Thử từ khóa hoặc loại tệp khác." : "Tải tệp nguồn hoặc xuất kết quả từ một dự án."}
          />
          {page > 1 && <Pagination page={page} total={data?.total ?? 0} onChange={setPage} />}
        </div>
      ) : (
        <div className="card table-wrap">
          <div className="section-heading files-table-heading"><div><h2>Thư viện đầu ra</h2><p className="muted">Chọn tệp để xem nhanh hoặc mở nội dung trong dự án.</p></div></div>
          <table className="responsive-table">
            <thead>
              <tr>
                <th>Tệp</th>
                <th className="desktop-column">Dự án</th>
                <th className="desktop-column">Dung lượng</th>
                <th className="desktop-column">Ngày tạo</th>
                <th><span className="sr-only">Thao tác</span></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((file) => (
                <tr key={file.id}>
                  <td>
                    <div className="table-project">
                      <FileIcon kind={file.kind} />
                      <div>
                        <button className="file-name-button" onClick={() => setPreview(file)}>{file.file_name}</button>
                        <small>{fileKindNames[file.kind] ?? file.kind}</small>
                        {file.media_file_id === null && <small>Nguồn chưa xác định</small>}
                      </div>
                    </div>
                    <MobileDetails>
                      <dt>Dự án</dt><dd>{file.media_file_id === null ? file.project_title : <Link to={`/projects/${file.project_id}${file.media_file_id ? `?tab=${file.download_url.includes("/media/") ? "content" : "exports"}&media=${encodeURIComponent(file.media_file_id)}` : ""}`}>{file.project_title}</Link>}</dd>
                      <dt>Dung lượng</dt><dd>{bytes(file.size)}</dd>
                      <dt>Ngày tạo</dt><dd>{date(file.created_at)}</dd>
                    </MobileDetails>
                  </td>
                  <td className="desktop-column">
                    {file.media_file_id === null ? <span>{file.project_title}</span> : <Link to={`/projects/${file.project_id}${file.media_file_id ? `?tab=${file.download_url.includes("/media/") ? "content" : "exports"}&media=${encodeURIComponent(file.media_file_id)}` : ""}`}>
                      {file.project_title}
                    </Link>}
                  </td>
                  <td className="desktop-column">{bytes(file.size)}</td>
                  <td className="desktop-column">{date(file.created_at)}</td>
                  <td>
                    <div className="row-actions">
                    <button className="icon-button" aria-label={"Xem " + file.file_name} onClick={() => setPreview(file)}><Eye size={18} /></button>
                    <button
                      className="icon-button"
                      aria-label={"Tải " + file.file_name}
                      disabled={action.busy}
                      onClick={() =>
                        action.run(() =>
                          api.download(file.download_url, file.file_name),
                        )
                      }
                    >
                      <ArrowDownToLine size={18} />
                    </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} total={data.total} onChange={setPage} />
        </div>
      )}
      </div>
      {preview && <FilePreviewDialog key={preview.id} file={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
