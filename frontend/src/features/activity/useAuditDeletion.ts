import { api } from "../../shared/api/client";
import { useAction } from "../../shared/hooks/useAction";

export function useAuditDeletion(reload: () => void) {
  const action = useAction();
  const remove = (id?: string) => {
    if (action.busy || !window.confirm(id
      ? "Xóa nhật ký này? Thao tác không thể hoàn tác."
      : "Xóa tất cả nhật ký bạn có quyền xóa trên mọi trang? Thao tác không thể hoàn tác.")) return;
    return action.run(async () => {
      await api.request(id ? `/audit-logs/${encodeURIComponent(id)}` : "/audit-logs", { method: "DELETE" });
      reload();
    }, "Đã xóa nhật ký.");
  };
  return { busy: action.busy, remove };
}
