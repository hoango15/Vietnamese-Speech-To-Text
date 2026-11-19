import {
  Bell,
  BookOpen,
  CreditCard,
  FileText,
  FolderClosed,
  HardDrive,
  LayoutDashboard,
  Search,
  Settings,
  ShieldCheck,
  Subtitles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "../../shared/types";

export interface WorkspaceDestination {
  path: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
}

export const workspaceNavigation: WorkspaceDestination[] = [
  { path: "/", label: "Tổng quan", icon: LayoutDashboard },
  { path: "/projects", label: "Dự án", icon: FolderClosed },
  { path: "/my-projects", label: "Dự án cá nhân", icon: FolderClosed },
  { path: "/search", label: "Tìm kiếm nội dung", icon: Search },
  { path: "/library/minutes", label: "Biên bản cuộc họp", icon: FileText },
  { path: "/library/subtitles", label: "Phụ đề", icon: Subtitles },
  { path: "/files", label: "Kho tệp", icon: HardDrive },
  { path: "/glossaries", label: "Từ điển thuật ngữ", icon: BookOpen },
  { path: "/payments", label: "Thanh toán", icon: CreditCard },
];

export const managementNavigation: WorkspaceDestination[] = [
  { path: "/admin", label: "Quản trị hệ thống", icon: ShieldCheck, roles: ["ADMIN"] },
  { path: "/company", label: "Quản trị công ty", icon: ShieldCheck, roles: ["COMPANY_OWNER"] },
  { path: "/settings", label: "Cài đặt", icon: Settings },
];

export const workspaceSections: WorkspaceDestination[] = [
  ...workspaceNavigation,
  ...managementNavigation,
  { path: "/profile", label: "Hồ sơ của tôi", icon: UserRound },
  { path: "/notifications", label: "Thông báo", icon: Bell },
];
