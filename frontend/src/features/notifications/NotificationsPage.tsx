import { useEffect } from "react";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../shared/api/client";
import type { List } from "../../shared/types";
import { date } from "../../shared/lib/format";
import { Empty, ErrorBox, Loading, PageTitle, Pagination } from "../../shared/ui/components";
import { useAction } from "../../shared/hooks/useAction";
import { useResource } from "../../shared/hooks/useResource";
import "./notifications.css";

interface AppNotification {
  notification_id: string;
  notification_type_code: string;
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
  project_id?: string | null;
  project_title?: string | null;
  media_file_id?: string | null;
  start_ms?: number | null;
}
type NotificationPage = List<AppNotification> & {
  unread_count: number;
  notification_types?: { code: string; label: string }[];
};

export function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const requestedPage = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const unreadOnly = params.get("unread") === "true";
  const typeCode = params.get("type") ?? "";
  const path = `/notifications?unread_only=${unreadOnly}&page=${page}&page_size=20${typeCode ? `&type_code=${encodeURIComponent(typeCode)}` : ""}`;
  const resource = useResource<NotificationPage>(path), action = useAction();
  useEffect(() => {
    if (resource.data) window.dispatchEvent(new CustomEvent("notifications:unread-count", { detail: resource.data.unread_count }));
  }, [resource.data?.unread_count]);
  const selectFilter = (unread: boolean) => {
    const next = new URLSearchParams(params);
    if (unread) next.set("unread", "true");
    else next.delete("unread");
    next.delete("page");
    setParams(next);
  };
  const selectType = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set("type", value); else next.delete("type");
    next.delete("page");
    setParams(next);
  };
  const selectPage = (value: number) => {
    const next = new URLSearchParams(params);
    if (value > 1) next.set("page", String(value)); else next.delete("page");
    setParams(next);
  };
  const notificationTypes = [...(resource.data?.notification_types ?? [...new Set(resource.data?.items.map(item => item.notification_type_code) ?? [])]
    .map(code => ({ code, label: code.toLocaleLowerCase().replaceAll("_", " ") })))];
  if (typeCode && !notificationTypes.some(type => type.code === typeCode))
    notificationTypes.push({ code: typeCode, label: typeCode.toLocaleLowerCase().replaceAll("_", " ") });

  return <>
    <PageTitle title="Thông báo" subtitle="Theo dõi cập nhật về dự án và hoạt động trong workspace.">
      <button className="button secondary" disabled={action.busy || !resource.data?.unread_count} onClick={() => action.run(async () => {
        await api.request("/notifications/read-all", { method: "POST" });
        window.dispatchEvent(new CustomEvent("notifications:unread-count", { detail: 0 }));
        resource.reload();
      }, "Đã đánh dấu tất cả thông báo là đã đọc.")}><CheckCheck size={16} />Đánh dấu tất cả đã đọc</button>
    </PageTitle>
    <section className="card panel notifications-page">
      <div className="toolbar notification-filters" aria-label="Lọc thông báo">
        <button className={`button ${unreadOnly ? "secondary" : ""}`} aria-pressed={!unreadOnly} onClick={() => selectFilter(false)}>Tất cả</button>
        <button className={`button ${unreadOnly ? "" : "secondary"}`} aria-pressed={unreadOnly} onClick={() => selectFilter(true)}>Chưa đọc{resource.data ? ` (${resource.data.unread_count})` : ""}</button>
        {(notificationTypes.length > 1 || Boolean(typeCode)) && <label className="notification-type-label">Loại thông báo<select aria-label="Lọc theo loại thông báo" value={typeCode} onChange={event => selectType(event.target.value)}><option value="">Mọi loại</option>{notificationTypes.map(type => <option key={type.code} value={type.code}>{type.label}</option>)}</select></label>}
      </div>
      {resource.error ? <ErrorBox error={resource.error} retry={resource.reload} /> : resource.loading && !resource.data ? <Loading /> : resource.data?.items.length ? <>
        <div className="notification-list">{resource.data.items.map(item => <article className={`notification-item ${item.read_at ? "is-read" : "is-unread"}`} key={item.notification_id}>
          <span className="notification-icon"><Bell size={18} /></span>
          <div className="notification-copy"><div className="notification-title"><h2>{item.title}</h2>{!item.read_at && <span className="unread-pill">Mới</span>}</div><p>{item.message}</p><time dateTime={item.created_at}>{date(item.created_at)}</time>
            {item.project_id && <Link className="text-link notification-project" to={item.media_file_id
              ? `/projects/${encodeURIComponent(item.project_id)}?tab=content&media=${encodeURIComponent(item.media_file_id)}${typeof item.start_ms === "number" && Number.isFinite(item.start_ms) && item.start_ms >= 0 ? `&t=${item.start_ms}` : ""}`
              : `/projects/${encodeURIComponent(item.project_id)}`}>{item.project_title || "Mở dự án"}<ExternalLink size={14} /></Link>}
          </div>
          {!item.read_at && <button className="button secondary small notification-read" disabled={action.busy} onClick={() => action.run(async () => {
            await api.request(`/notifications/${encodeURIComponent(item.notification_id)}/read`, { method: "PATCH" });
            window.dispatchEvent(new CustomEvent("notifications:unread-count", { detail: Math.max(0, resource.data!.unread_count - 1) }));
            resource.reload();
          }, "Đã đánh dấu thông báo là đã đọc.")}>Đánh dấu đã đọc</button>}
        </article>)}</div>
        <Pagination page={page} total={resource.data.total} onChange={selectPage} />
      </> : <Empty title={unreadOnly ? "Không còn thông báo chưa đọc" : "Chưa có thông báo"} description={unreadOnly ? "Bạn đã đọc hết thông báo của mình." : "Thông báo về dự án và hoạt động sẽ xuất hiện tại đây."} />}
    </section>
  </>;
}
