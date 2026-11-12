import type { ReactNode } from "react";
import { AlertCircle, FileAudio, FileImage, FileText, FileVideo, FolderOpen, LoaderCircle } from "lucide-react";

export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} /> Đang tải dữ liệu…
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar">
      {name
        .split(" ")
        .filter(Boolean)
        .slice(-2)
        .map((s) => s[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}

export function ErrorBox({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={19} />
      <span>{error}</span>
      {retry && (
        <button className="button small secondary" onClick={retry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

export function PageTitle({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}

export function Empty({
  title = "Chưa có dữ liệu",
  description = "Nội dung sẽ xuất hiện tại đây khi bạn bắt đầu làm việc.",
  children,
}: {
  title?: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <FolderOpen size={30} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}

export const statusNames: Record<string, string> = {
  DRAFT: "Bản nháp",
  PROCESSING: "Đang xử lý",
  READY: "Hoàn thành",
  FAILED: "Thất bại",
  QUEUED: "Đang chờ",
  RUNNING: "Đang xử lý",
  SUCCEEDED: "Hoàn thành",
  CANCELED: "Đã hủy",
};

export function Status({ code }: { code: string }) {
  return (
    <span className={"status status-" + code.toLowerCase()}>
      <i />
      {statusNames[code] ?? code}
    </span>
  );
}

export function FileIcon({ kind }: { kind?: string }) {
  const Icon = kind?.includes("IMAGE")
    ? FileImage
    : kind?.includes("VIDEO")
      ? FileVideo
      : kind && !kind.includes("AUDIO") ? FileText : FileAudio;
  return (
    <div
      className={
        "file-icon " +
        (kind?.includes("IMAGE")
          ? "purple"
          : kind?.includes("VIDEO")
            ? "blue"
            : "")
      }
    >
      <Icon size={21} />
    </div>
  );
}

export function MobileDetails({ children }: { children: ReactNode }) {
  return <details className="mobile-row-details"><summary>Chi tiết</summary><dl>{children}</dl></details>;
}


export function Pagination({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {total} kết quả · Trang {page}/{Math.max(1, Math.ceil(total / 20))}
      </span>
      <div>
        <button
          className="button small secondary"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Trước
        </button>
        <button
          className="button small secondary"
          disabled={page * 20 >= total}
          onClick={() => onChange(page + 1)}
        >
          Sau
        </button>
      </div>
    </div>
  );
}
