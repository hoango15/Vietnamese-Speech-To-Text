import { useState } from "react";
import { BookOpen, Download, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api } from "../../shared/api/client";
import type { List } from "../../shared/types";
import { Empty, ErrorBox, Loading, PageTitle, Pagination } from "../../shared/ui/components";
import { useResource } from "../../shared/hooks/useResource";
import { useAction } from "../../shared/hooks/useAction";
import { message } from "../../shared/lib/errors";
import { glossaryToCsv, type GlossaryCsvEntry } from "./csv";
import { parseGlossaryCsv } from "./csv-import";
import "./glossary.css";

interface GlossaryTerm { term_id: string; term: string; definition: string; language_code: string; category?: string | null; updated_at: string }

export function GlossaryPage() {
  const [q, setQ] = useState(""), [draft, setDraft] = useState(""), [page, setPage] = useState(1), [language, setLanguage] = useState(""), [sort, setSort] = useState<"updated" | "term">("updated");
  const [editing, setEditing] = useState<GlossaryTerm | null>(null);
  const [importRows, setImportRows] = useState<GlossaryCsvEntry[]>([]), [importName, setImportName] = useState(""), [importError, setImportError] = useState("");
  const path = `/glossaries?q=${encodeURIComponent(q)}&page=${page}&page_size=20${language ? `&language_code=${encodeURIComponent(language)}` : ""}`;
  const resource = useResource<List<GlossaryTerm>>(path), action = useAction();
  const terms = [...(resource.data?.items ?? [])].sort((a, b) => sort === "term"
    ? a.term.localeCompare(b.term, "vi", { sensitivity: "base" })
    : b.updated_at.localeCompare(a.updated_at));
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([glossaryToCsv(terms)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "tu-dien-thuat-ngu.csv";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const chooseImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setImportName(file.name);
    setImportError("");
    setImportRows([]);
    try {
      if (file.size > 1024 * 1024) throw new Error("Tệp CSV không được lớn hơn 1 MB.");
      const rows = parseGlossaryCsv(await file.text());
      if (!rows.length) throw new Error("Tệp chưa có thuật ngữ để nhập.");
      setImportRows(rows);
    } catch (error) {
      setImportError(message(error));
    }
  };
  const importTerms = () => action.run(async () => {
    let imported = 0;
    for (const row of importRows) {
      try {
        await api.request("/glossaries", { method: "POST", body: row });
        imported++;
      } catch (error) {
        resource.reload();
        throw new Error(`Đã nhập ${imported}/${importRows.length} thuật ngữ trước khi gặp lỗi: ${message(error)}`);
      }
    }
    setImportRows([]); setImportName(""); setImportError(""); resource.reload();
  }, `Đã nhập ${importRows.length} thuật ngữ.`);
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { term: String(form.get("term")).trim(), definition: String(form.get("definition")).trim(), language_code: String(form.get("language_code")), category: String(form.get("category")).trim() || null };
    await action.run(async () => {
      if (editing) await api.request(`/glossaries/${editing.term_id}`, { method: "PATCH", body: payload });
      else await api.request("/glossaries", { method: "POST", body: payload });
      setEditing(null); setDraft(""); resource.reload();
    }, editing ? "Đã cập nhật thuật ngữ." : "Đã thêm thuật ngữ.");
  };
  return <>
    <PageTitle title="Từ điển thuật ngữ" subtitle="Lưu cách viết và giải thích thống nhất cho các thuật ngữ chuyên ngành.">
      <button className="button secondary" disabled={!terms.length} onClick={exportCsv}><Download size={16} />Xuất CSV trang này</button>
      <button className="button" onClick={() => { setEditing(null); setDraft("new"); }}><Plus size={17} />Thêm thuật ngữ</button>
    </PageTitle>
    <section className="card panel glossary-page">
      <form className="glossary-search" role="search" onSubmit={e => { e.preventDefault(); setQ(draft.trim()); setPage(1); }}>
        <label className="sr-only" htmlFor="glossary-query">Tìm thuật ngữ</label><Search size={18} />
        <input id="glossary-query" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Tìm thuật ngữ hoặc phần giải thích" />
        <button className="button secondary" type="submit">Tìm kiếm</button>
      </form>
      <label className="glossary-language-filter">Lọc ngôn ngữ<select aria-label="Lọc thuật ngữ theo ngôn ngữ" value={language} onChange={event => { setLanguage(event.target.value); setPage(1); }}><option value="">Tất cả ngôn ngữ</option><option value="vi">Tiếng Việt</option><option value="en">Tiếng Anh</option></select></label>
      <label className="glossary-sort-filter">Sắp xếp trong trang<select aria-label="Sắp xếp thuật ngữ" value={sort} onChange={event => setSort(event.target.value as "updated" | "term")}><option value="updated">Mới cập nhật</option><option value="term">Tên A–Z</option></select></label>
      <details className="glossary-import" open={Boolean(importRows.length || importError)}><summary>Nhập từ CSV</summary>
        <label>Chọn tệp CSV<input type="file" accept=".csv,text/csv" onChange={chooseImportFile} /></label>
        {importName && <p className="muted small-text">{importName}</p>}
        {importError && <p className="glossary-import-error" role="alert">{importError}</p>}
        {importRows.length > 0 && <><p className="muted small-text">Đã đọc {importRows.length} thuật ngữ. Xem trước tối đa 5 dòng:</p><ul className="glossary-import-preview">{importRows.slice(0, 5).map((row, index) => <li key={`${row.term}-${index}`}><strong>{row.term}</strong><span>{row.definition}</span></li>)}</ul><button className="button small" disabled={action.busy} onClick={importTerms}>Nhập {importRows.length} thuật ngữ</button></>}
      </details>
      {editing || draft === "new" ? <form className="glossary-form" onSubmit={save}>
        <h2>{editing ? "Sửa thuật ngữ" : "Thêm thuật ngữ"}</h2>
        <div className="glossary-fields"><label>Thuật ngữ<input name="term" required maxLength={160} defaultValue={editing?.term ?? ""} /></label>
          <label>Ngôn ngữ<select name="language_code" defaultValue={editing?.language_code ?? "vi"}><option value="vi">Tiếng Việt</option><option value="en">Tiếng Anh</option></select></label>
          <label className="glossary-wide">Giải thích<textarea name="definition" required maxLength={4000} rows={3} defaultValue={editing?.definition ?? ""} /></label>
          <label>Nhóm (không bắt buộc)<input name="category" maxLength={100} defaultValue={editing?.category ?? ""} /></label>
        </div><div className="form-actions"><button type="button" className="button secondary" onClick={() => { setEditing(null); setDraft(""); }}>Hủy</button><button className="button" disabled={action.busy}>Lưu thuật ngữ</button></div>
      </form> : null}
      {resource.loading && !resource.data ? <Loading /> : resource.error ? <ErrorBox error={resource.error} retry={resource.reload} /> : terms.length ? <>
        <div className="glossary-list">{terms.map(item => <article className="glossary-term" key={item.term_id}>
          <div><div className="glossary-term-title"><BookOpen size={17} /><h2>{item.term}</h2><span>{item.language_code.toUpperCase()}</span>{item.category && <small>{item.category}</small>}</div><p>{item.definition}</p></div>
          <div className="row-actions"><button className="icon-button" aria-label={`Sửa ${item.term}`} onClick={() => { setEditing(item); setDraft(""); }}><Pencil size={16} /></button><button className="icon-button danger" aria-label={`Xóa ${item.term}`} disabled={action.busy} onClick={() => { if (confirm(`Xóa thuật ngữ “${item.term}”?`)) action.run(async () => { await api.request(`/glossaries/${item.term_id}`, { method: "DELETE" }); resource.reload(); }, "Đã xóa thuật ngữ."); }}><Trash2 size={16} /></button></div>
        </article>)}</div><Pagination page={page} total={resource.data?.total ?? 0} onChange={setPage} />
      </> : <Empty title={q ? "Không tìm thấy thuật ngữ" : "Từ điển đang trống"} description={q ? "Thử từ khóa khác hoặc thêm thuật ngữ mới." : "Thêm thuật ngữ đầu tiên để nhóm thống nhất cách dùng."} />}
    </section>
  </>;
}
