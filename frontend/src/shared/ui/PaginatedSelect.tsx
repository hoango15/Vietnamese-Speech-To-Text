import { useEffect, useState } from "react";
import { useResource } from "../hooks/useResource";
import type { List } from "../types";
import { Loading } from "./components";

type Choice = { value: string; label: string };

export function PaginatedSelect<T>({ path, label, searchLabel, emptyLabel, name, required, value, onChange, option }: {
  path: string;
  label: string;
  searchLabel: string;
  emptyLabel: string;
  name?: string;
  required?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  option: (item: T) => Choice;
}) {
  const [q, setQ] = useState(""), [page, setPage] = useState(1);
  const [choice, setChoice] = useState<Choice>({ value: "", label: "" });
  const selected = value ?? choice.value;
  const resource = useResource<List<T>>(`${path}${path.includes("?") ? "&" : "?"}q=${encodeURIComponent(q)}&page=${page}&page_size=20`);
  const options = resource.data?.items.map(option) ?? [];
  useEffect(() => {
    const current = resource.data?.items.map(option).find(item => item.value === selected);
    if (current) setChoice(old => old.value === current.value && old.label === current.label ? old : current);
  }, [resource.data, option, selected]);
  return <div className="paginated-select">
    <div className="paginated-select-fields">
    <label>{searchLabel}<input aria-label={searchLabel} placeholder="Nhập từ khóa…" maxLength={200} value={q} onChange={event => { setQ(event.target.value); setPage(1); }} /></label>
    <label>{label}<select aria-label={label} name={name} required={required} value={selected} onChange={event => {
      const next = event.target.value;
      setChoice(options.find(item => item.value === next) ?? { value: next, label: next });
      onChange?.(next);
    }}>
      <option value="" disabled={required}>{emptyLabel}</option>
      {selected && !options.some(item => item.value === selected) && <option value={selected}>{choice.value === selected ? choice.label : selected}</option>}
      {options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select></label>
    </div>
    {resource.loading && <Loading />}
    {resource.error && <div className="error-box" role="alert"><span>{resource.error}</span><button type="button" className="button small secondary" onClick={resource.reload}>Thử lại</button></div>}
    {!resource.loading && !resource.error && <div className="paginated-select-pagination">
      <span>{resource.data?.total ?? 0} kết quả · Trang {page}/{Math.max(1, Math.ceil((resource.data?.total ?? 0) / 20))}</span>
      <div><button type="button" className="button small secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button><button type="button" className="button small secondary" disabled={page * 20 >= (resource.data?.total ?? 0)} onClick={() => setPage(page + 1)}>Sau</button></div>
    </div>}
  </div>;
}
