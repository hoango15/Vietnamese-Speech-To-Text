import { useState } from "react";
import { TabList } from "../../shared/ui/components";
import { AdminAudit, AdminJobs, AdminUploads } from "./AdminOperations";
import "./admin.css";

type ConsoleTab = "jobs" | "uploads" | "audit";
const tabs: { id: ConsoleTab; label: string }[] = [
  { id: "jobs", label: "Tác vụ AI" },
  { id: "uploads", label: "Phiên tải lên" },
  { id: "audit", label: "Nhật ký hoạt động" },
];

export function AdminConsole() {
  const [tab, setTab] = useState<ConsoleTab>("jobs");
  return <div className="admin-console">
    <TabList label="Chức năng quản trị" className="admin-console-tabs">
      {tabs.map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`admin-panel-${item.id}`} id={`admin-tab-${item.id}`} className={"button " + (tab === item.id ? "" : "secondary")} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </TabList>
    <div role="tabpanel" id={`admin-panel-${tab}`} aria-labelledby={`admin-tab-${tab}`}>
      {tab === "jobs" ? <AdminJobs /> : tab === "uploads" ? <AdminUploads /> : <AdminAudit />}
    </div>
  </div>;
}
