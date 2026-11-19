import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Clock3, FileSearch, Search } from "lucide-react";
import { api } from "../../shared/api/client";
import type { List } from "../../shared/types";
import { Empty, ErrorBox, Loading, PageTitle, Pagination } from "../../shared/ui/components";
import { useResource } from "../../shared/hooks/useResource";
import { highlightText } from "./highlight";
import "./search.css";

interface SearchHit { project_id: string; project_title: string; media_file_id: string; segment_id?: string; segment_no: number; start_ms: number; end_ms: number; segment_text: string; speaker_name?: string | null }
function timestamp(ms: number) { const seconds = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }

export function SearchPage() {
  const [params, setParams] = useSearchParams(), q = params.get("q") ?? "", rawPage = Number(params.get("page") ?? 1), page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);
  const resource = useResource<List<SearchHit>>(q.trim() ? `/search/transcripts?q=${encodeURIComponent(q.trim())}&page=${page}&page_size=20` : null);
  function search(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const next = new URLSearchParams(); if (draft.trim()) next.set("q", draft.trim()); setParams(next); }
  return <>
    <PageTitle title="Tìm kiếm nội dung" subtitle="Tìm từ hoặc cụm từ trong bản chép lời bạn có quyền xem." />
    <section className="card panel transcript-search-page">
      <form className="transcript-search-form" role="search" onSubmit={search}><Search size={19} /><label className="sr-only" htmlFor="transcript-query">Tìm trong bản chép lời</label><input id="transcript-query" value={draft} maxLength={300} onChange={e => setDraft(e.target.value)} placeholder="Nhập nội dung cần tìm…" /><button className="button" type="submit">Tìm kiếm</button></form>
      {!q.trim() ? <Empty title="Tìm trong bản chép lời" description="Nhập từ khóa để tìm đoạn nội dung trong các dự án bạn được phép truy cập." /> : resource.loading && !resource.data ? <Loading /> : resource.error ? <ErrorBox error={resource.error} retry={resource.reload} /> : resource.data?.items.length ? <>
        <p className="search-count">Tìm thấy {resource.data.total} kết quả cho “{q}”</p><div className="search-results">{resource.data.items.map((hit, index) => <article className="search-result" key={hit.segment_id ?? `${hit.media_file_id}-${hit.segment_no}-${index}`}>
          <div className="search-result-icon"><FileSearch size={19} /></div><div className="search-result-body"><Link to={`/projects/${encodeURIComponent(hit.project_id)}?tab=content&media=${encodeURIComponent(hit.media_file_id)}&t=${hit.start_ms}`}><strong>{hit.project_title}</strong></Link><p>{highlightText(hit.segment_text, q).map((part, partIndex) => part.match ? <mark key={partIndex}>{part.text}</mark> : <span key={partIndex}>{part.text}</span>)}</p><small>{hit.speaker_name ? `${hit.speaker_name} · ` : ""}<Clock3 size={13} />{timestamp(hit.start_ms)}{hit.end_ms > hit.start_ms ? `–${timestamp(hit.end_ms)}` : ""}</small></div>
        </article>)}</div><Pagination page={page} total={resource.data.total} onChange={value => { const next = new URLSearchParams(params); next.set("page", String(value)); setParams(next); }} />
      </> : <Empty title="Không có kết quả" description="Thử từ khóa khác. Kết quả chỉ gồm nội dung thuộc dự án bạn có quyền xem." />}
    </section>
  </>;
}
