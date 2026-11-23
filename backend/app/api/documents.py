from datetime import date
import hashlib
import json
from typing import Annotated,Literal
from uuid import UUID,uuid4
from fastapi import APIRouter,Depends,HTTPException,Query
from fastapi.responses import FileResponse,Response
from pydantic import Field
from ..core import config
from .auth import StrictBody
from ..core.db import connection,one,all_rows,audit
from ..core.security import current_user,require_role
from ..core.access import project,resource,pagination,visible_project_ids
from .transcripts import transcript_data

from ..core.sources import source_id

router=APIRouter()


def minutes_data(conn,row):
    source=one(conn,'SELECT media_file_id FROM transcript WHERE transcript_id=%s',(row['transcript_id'],))
    return {**row,'meeting_time':row['meeting_time'].strftime('%H:%M') if row['meeting_time'] else None,
        'media_file_id':source['media_file_id'],
        'topics':all_rows(conn,'SELECT * FROM minutes_topic WHERE minutes_id=%s ORDER BY topic_no',(row['minutes_id'],)),
        'decisions':all_rows(conn,'SELECT * FROM minutes_decision WHERE minutes_id=%s ORDER BY decision_no',(row['minutes_id'],)),
        'action_items':all_rows(conn,'SELECT * FROM action_item WHERE minutes_id=%s ORDER BY action_item_id',(row['minutes_id'],))}


def insert_minutes(conn,pid,tid,title,body,model='local-extractive',meeting_date=None):
    conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(pid,))
    version=one(conn,'SELECT COALESCE(max(version_no),0)+1 AS n FROM minutes WHERE project_id=%s',(pid,))['n']
    row=one(conn,'''INSERT INTO minutes(project_id,transcript_id,version_no,meeting_title,meeting_date,meeting_time,
        participants,notes_text,summary_text,llm_model_name)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *''',
        (pid,tid,version,body.get('meeting_title') or title,meeting_date if meeting_date is not None else body.get('meeting_date'),
         body.get('meeting_time'),body.get('participants') or [],body.get('notes_text') or '',body.get('summary_text',''),model))
    mid=row['minutes_id']
    for i,t in enumerate(body.get('topics',[]),1):
        conn.execute('INSERT INTO minutes_topic(minutes_id,topic_no,topic_title,topic_summary,source_start_ms) VALUES (%s,%s,%s,%s,%s)',
                     (mid,i,t['topic_title'],t.get('topic_summary',''),t.get('source_start_ms')))
    for i,d in enumerate(body.get('decisions',[]),1):
        conn.execute('INSERT INTO minutes_decision(minutes_id,decision_no,decision_text,source_start_ms) VALUES (%s,%s,%s,%s)',
                     (mid,i,d['decision_text'],d.get('source_start_ms')))
    for a in body.get('action_items',[]):
        conn.execute('''INSERT INTO action_item(minutes_id,item_title,item_description,assignee_name,due_date,action_item_status_code,source_start_ms)
            VALUES (%s,%s,%s,%s,%s,%s,%s)''',(mid,a.get('item_title'),a['item_description'],a.get('assignee_name'),a.get('due_date'),a.get('action_item_status_code'),a.get('source_start_ms')))
    return minutes_data(conn,row)


@router.get('/projects/{project_id}/minutes')
def minutes_list(project_id:UUID,media_file_id:UUID|None=None,user=Depends(current_user)):
    with connection() as conn:
        project(conn,user,project_id)
        mid=source_id(conn,project_id,media_file_id)
        rows=all_rows(conn,'SELECT m.* FROM minutes m JOIN transcript t USING(transcript_id) WHERE m.project_id=%s AND (t.media_file_id IS NOT DISTINCT FROM %s OR t.media_file_id IS NULL) ORDER BY m.version_no DESC',(project_id,mid))
        return {'items':[minutes_data(conn,r) for r in rows],'total':len(rows)}


@router.get('/projects/{project_id}/minutes/latest')
def latest(project_id:UUID,media_file_id:UUID|None=None,user=Depends(current_user)):
    with connection() as conn:
        project(conn,user,project_id)
        row=one(conn,'''SELECT m.* FROM minutes m JOIN transcript t ON t.transcript_id=m.transcript_id
            WHERE m.project_id=%s AND t.media_file_id IS NOT DISTINCT FROM %s AND t.is_current ORDER BY m.version_no DESC LIMIT 1''',(project_id,source_id(conn,project_id,media_file_id)))
        if not row:raise HTTPException(404,'Chưa có biên bản cho transcript hiện tại')
        return minutes_data(conn,row)


@router.get('/minutes/{minutes_id}')
def detail(minutes_id:UUID,user=Depends(current_user)):
    with connection() as conn:return minutes_data(conn,resource(conn,user,'minutes','minutes_id',minutes_id))


@router.post('/projects/{project_id}/minutes/generate',status_code=201)
def generate(project_id:UUID,media_file_id:UUID|None=None,user=Depends(current_user)):
    from ..services.processors import extract_minutes,minutes_model
    with connection() as conn:
        p=project(conn,user,project_id,write=True)
        t=one(conn,'SELECT * FROM transcript WHERE project_id=%s AND media_file_id IS NOT DISTINCT FROM %s AND is_current',(project_id,source_id(conn,project_id,media_file_id)))
        if not t:raise HTTPException(409,'Cần transcript trước khi tạo biên bản')
        segments=all_rows(conn,'SELECT * FROM transcript_segment WHERE transcript_id=%s ORDER BY segment_no',(t['transcript_id'],))
    body=extract_minutes(segments)
    model=minutes_model()
    with connection() as conn:
        p=project(conn,user,project_id,write=True)
        conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(project_id,))
        current=one(conn,'SELECT transcript_id,revision FROM transcript WHERE project_id=%s AND media_file_id IS NOT DISTINCT FROM %s AND is_current',(project_id,t['media_file_id']))
        if not current or current['transcript_id']!=t['transcript_id'] or current['revision']!=t['revision']:
            raise HTTPException(409,'Transcript đã thay đổi trong khi tạo biên bản. Hãy tải lại và thử lại.')
        out=insert_minutes(conn,project_id,t['transcript_id'],p['project_title'],body,model=model)
        audit(conn,user['user_id'],'GENERATE_MINUTES','project',project_id)
        return out


class TopicBody(StrictBody):
    topic_title:str=Field(min_length=1,max_length=300)
    topic_summary:str=Field(default='',max_length=100000)
    source_start_ms:int|None=Field(default=None,ge=0)


class DecisionBody(StrictBody):
    decision_text:str=Field(min_length=1,max_length=100000)
    source_start_ms:int|None=Field(default=None,ge=0)


class ActionBody(StrictBody):
    item_title:str|None=Field(default=None,max_length=300)
    item_description:str=Field(min_length=1,max_length=10000)
    assignee_name:str|None=Field(default=None,max_length=200)
    due_date:date|None=None
    action_item_status_code:Literal['OPEN','IN_PROGRESS','DONE','CANCELED']|None=None
    source_start_ms:int|None=Field(default=None,ge=0)


class MinutesBody(StrictBody):
    meeting_title:str=Field(min_length=1,max_length=300)
    meeting_date:date|None=None
    meeting_time:str|None=Field(default=None,pattern=r'^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
    participants:list[Annotated[str,Field(min_length=1,max_length=200)]]=Field(default_factory=list,max_length=1000)
    notes_text:str=Field(default='',max_length=1000000)
    summary_text:str=Field(default='',max_length=1000000)
    topics:list[TopicBody]=Field(default_factory=list,max_length=100)
    decisions:list[DecisionBody]=Field(default_factory=list,max_length=20000)
    action_items:list[ActionBody]=Field(default_factory=list,max_length=20000)


@router.patch('/minutes/{minutes_id}')
def edit(minutes_id:UUID,body:MinutesBody,user=Depends(current_user)):
    with connection() as conn:
        row=resource(conn,user,'minutes','minutes_id',minutes_id,write=True)
        out=insert_minutes(conn,row['project_id'],row['transcript_id'],body.meeting_title,body.model_dump(),model='edited',meeting_date=body.meeting_date)
        audit(conn,user['user_id'],'EDIT_MINUTES','project',row['project_id'])
        return out


class GlossaryBody(StrictBody):glossary_name:str=Field(min_length=1,max_length=200)
class TermBody(StrictBody):
    canonical_text:str=Field(min_length=1,max_length=300)
    aliases:list[str]=Field(default_factory=list,max_length=50)


def glossary(conn,glossary_id):
    row=one(conn,'SELECT * FROM glossary WHERE glossary_id=%s',(glossary_id,))
    if not row:raise HTTPException(404,'Không tìm thấy từ điển')
    terms=all_rows(conn,'SELECT glossary_term_id,term_text AS canonical_text FROM glossary_term WHERE glossary_id=%s ORDER BY term_text',(glossary_id,))
    for term in terms:
        term['aliases']=[a['alias_text'] for a in all_rows(conn,'SELECT alias_text FROM glossary_term_alias WHERE glossary_term_id=%s ORDER BY alias_text',(term['glossary_term_id'],))]
    row['terms']=terms;return row


@router.get('/glossaries')
def glossaries(q:str='',page:int=1,page_size:int=20,user=Depends(current_user)):
    with connection() as conn:
        limit,offset=pagination(page,page_size)
        ids=all_rows(conn,'SELECT glossary_id FROM glossary WHERE glossary_name ILIKE %s ORDER BY glossary_name LIMIT %s OFFSET %s',('%'+q[:300]+'%',limit,offset))
        total=one(conn,'SELECT count(*) AS n FROM glossary WHERE glossary_name ILIKE %s',('%'+q[:300]+'%',))['n']
        return {'items':[glossary(conn,r['glossary_id']) for r in ids],'total':total}


@router.post('/glossaries',status_code=201)
def create_glossary(body:GlossaryBody,user=Depends(current_user)):
    require_role(user,'ADMIN')
    with connection() as conn:
        row=one(conn,'INSERT INTO glossary(organization_id,glossary_name) VALUES (%s,%s) RETURNING glossary_id',(user['organization_id'],body.glossary_name))
        return glossary(conn,row['glossary_id'])


@router.get('/glossaries/{glossary_id}')
def get_glossary(glossary_id:UUID,user=Depends(current_user)):
    with connection() as conn:return glossary(conn,glossary_id)


@router.patch('/glossaries/{glossary_id}')
def edit_glossary(glossary_id:UUID,body:GlossaryBody,user=Depends(current_user)):
    require_role(user,'ADMIN')
    with connection() as conn:
        glossary(conn,glossary_id)
        conn.execute('UPDATE glossary SET glossary_name=%s WHERE glossary_id=%s',(body.glossary_name,glossary_id))
        return glossary(conn,glossary_id)


@router.delete('/glossaries/{glossary_id}')
def delete_glossary(glossary_id:UUID,user=Depends(current_user)):
    require_role(user,'ADMIN')
    with connection() as conn:
        glossary(conn,glossary_id);conn.execute('DELETE FROM glossary WHERE glossary_id=%s',(glossary_id,))
    return {'ok':True}


def aliases(conn,term_id,values):
    conn.execute('DELETE FROM glossary_term_alias WHERE glossary_term_id=%s',(term_id,))
    for alias in dict.fromkeys(a.strip() for a in values if a.strip()):
        if len(alias)>300:raise HTTPException(422,'Mỗi biến thể tối đa 300 ký tự')
        conn.execute('INSERT INTO glossary_term_alias(glossary_term_id,alias_text) VALUES (%s,%s)',(term_id,alias))


@router.post('/glossaries/{glossary_id}/terms',status_code=201)
def add_term(glossary_id:UUID,body:TermBody,user=Depends(current_user)):
    require_role(user,'ADMIN')
    with connection() as conn:
        glossary(conn,glossary_id)
        row=one(conn,'INSERT INTO glossary_term(glossary_id,term_text) VALUES (%s,%s) RETURNING glossary_term_id,term_text AS canonical_text',(glossary_id,body.canonical_text))
        aliases(conn,row['glossary_term_id'],body.aliases);row['aliases']=body.aliases;return row


def term(conn,term_id):
    row=one(conn,'SELECT t.* FROM glossary_term t JOIN glossary g ON g.glossary_id=t.glossary_id WHERE t.glossary_term_id=%s',(term_id,))
    if not row:raise HTTPException(404,'Không tìm thấy thuật ngữ')
    return row


@router.patch('/glossary-terms/{term_id}')
def edit_term(term_id:UUID,body:TermBody,user=Depends(current_user)):
    require_role(user,'ADMIN')
    with connection() as conn:
        term(conn,term_id)
        row=one(conn,'UPDATE glossary_term SET term_text=%s WHERE glossary_term_id=%s RETURNING glossary_term_id,term_text AS canonical_text',(body.canonical_text,term_id))
        aliases(conn,term_id,body.aliases);row['aliases']=body.aliases;return row


@router.delete('/glossary-terms/{term_id}')
def delete_term(term_id:UUID,user=Depends(current_user)):
    require_role(user,'ADMIN')
    with connection() as conn:term(conn,term_id);conn.execute('DELETE FROM glossary_term WHERE glossary_term_id=%s',(term_id,))
    return {'ok':True}


class ExportBody(StrictBody):
    media_file_id:UUID|None=None
    kind:Literal['TXT','SRT','VTT','DOCX','PDF']
    source:Literal['transcript','minutes','ocr']='transcript'
    max_chars_per_line:int=Field(default=42,ge=10,le=120)
    includes_speaker_label:bool=False


def source_data(conn,pid,source,transcript_id=None,media_file_id=None):
    mid=source_id(conn,pid,media_file_id) if not transcript_id else media_file_id
    t=(one(conn,'SELECT * FROM transcript WHERE project_id=%s AND transcript_id=%s',(pid,transcript_id))
       if transcript_id else one(conn,'SELECT * FROM transcript WHERE project_id=%s AND media_file_id IS NOT DISTINCT FROM %s AND is_current',(pid,mid)))
    if transcript_id and media_file_id and t and t['media_file_id']!=media_file_id:
        raise HTTPException(422,'Transcript không thuộc tệp đã chọn')
    if source=='ocr':
        o=one(conn,'SELECT * FROM ocr_document WHERE project_id=%s AND media_file_id=%s AND is_current',(pid,mid))
        if not o:raise HTTPException(409,'Chưa có kết quả OCR')
        return None,o['document_text'],[],[]
    if not t:raise HTTPException(409,'Chưa có transcript')
    td=transcript_data(conn,t)
    if source=='transcript':return t['transcript_id'],'\n'.join(s['segment_text'] for s in td['segments']),td['segments'],td['speakers']
    m=one(conn,'SELECT * FROM minutes WHERE project_id=%s AND transcript_id=%s ORDER BY version_no DESC LIMIT 1',(pid,t['transcript_id']))
    if not m:raise HTTPException(409,'Chưa có biên bản cho transcript hiện tại')
    m=minutes_data(conn,m)
    text=(m['meeting_title'] or '')+'\n'+str(m['meeting_date'] or '')+'\nGiờ: '+(m['meeting_time'] or '')
    text+='\nThành phần: '+', '.join(m['participants'])+'\n\n'+(m['summary_text'] or '')
    for top in m['topics']:text+='\n\n'+top['topic_title']+'\n'+(top['topic_summary'] or '')
    text+='\n\nQUYẾT ĐỊNH\n'+('\n'.join('- '+d['decision_text'] for d in m['decisions']) or 'Chưa xác định')
    text+='\n\nCÔNG VIỆC\n'+('\n'.join('- '+(a['item_title'] or '')+' | '+a['item_description']+' | '+(a['assignee_name'] or '')+' | '+str(a['due_date'] or '')+' | '+(a['action_item_status_code'] or '') for a in m['action_items']) or 'Chưa xác định')
    text+='\n\nGHI CHÚ\n'+m['notes_text']
    return t['transcript_id'],text,[],[]


@router.get('/projects/{project_id}/subtitles/preview')
def preview_subtitles(project_id:UUID,max_chars_per_line:int=Query(default=42,ge=10,le=120),
                      includes_speaker_label:bool=False,transcript_id:UUID|None=None,
                      media_file_id:UUID|None=None,user=Depends(current_user)):
    from ..services.processors import render_export
    with connection() as conn:
        p=project(conn,user,project_id)
        conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR SHARE',(project_id,))
        mid=source_id(conn,project_id,media_file_id)
        media=one(conn,"SELECT media_file_id FROM media_file WHERE media_file_id=%s AND media_kind_code='ORIGINAL_VIDEO'",(mid,))
        if not media:
            raise HTTPException(409,'Cần video nguồn để xem phụ đề')
        tid,_,segments,speakers=source_data(conn,project_id,'transcript',media_file_id=mid)
        if (media_file_id and media_file_id!=media['media_file_id']) or (transcript_id and transcript_id!=tid):
            raise HTTPException(409,'Video hoặc bản ghi đã thay đổi. Hãy tải lại trước khi xem phụ đề.')
        content,mime,_=render_export('VTT',p['project_title'],segments=segments,speakers=speakers,
                                     max_chars_per_line=max_chars_per_line,includes_speaker_label=includes_speaker_label)
    return Response(content,media_type=mime,headers={'Cache-Control':'no-store'})


def speaker_fingerprint(conn,tid,labels=None):
    if labels is None:
        rows=all_rows(conn,'''SELECT ts.segment_id,COALESCE(NULLIF(s.display_name,''),s.speaker_label) AS label
            FROM transcript_segment ts JOIN speaker s USING(speaker_id) WHERE ts.transcript_id=%s''',(tid,))
        labels={str(row['segment_id']):row['label'] for row in rows if row['label']}
    return hashlib.sha256(json.dumps(labels,sort_keys=True).encode()).hexdigest()


def record_export(conn,p,user_id,row,labels=None):
    detail={'kind':row['export_kind_code'],'source':row['source'],'export_file_id':str(row['export_file_id'])}
    if row['includes_speaker_label']:
        detail['speaker_fingerprint']=speaker_fingerprint(conn,row['transcript_id'],labels)
    if row['source']=='ocr':
        ocr=one(conn,'SELECT ocr_document_id,revision FROM ocr_document WHERE project_id=%s AND media_file_id=%s AND is_current',(p['project_id'],row['media_file_id']))
        detail.update(ocr_document_id=str(ocr['ocr_document_id']),ocr_revision=ocr['revision'])
        job=one(conn,'''SELECT v.job_id FROM job_event v JOIN processing_job j USING(job_id)
            WHERE j.project_id=%s AND v.event_type='RESULT' AND v.event_payload->>'ocr_document_id'=%s
            ORDER BY v.job_event_id DESC LIMIT 1''',(p['project_id'],detail['ocr_document_id']))
        if job:
            from .jobs import event
            event(conn,job['job_id'],'EXPORT',{'export_file_id':detail['export_file_id']})
    elif row['source']=='minutes':
        minutes=one(conn,'SELECT minutes_id FROM minutes WHERE transcript_id=%s ORDER BY version_no DESC LIMIT 1',(row['transcript_id'],))
        detail['minutes_id']=str(minutes['minutes_id'])
    audit(conn,user_id,'EXPORT','project',p['project_id'],detail)


def persist_export(conn,p,user_id,body,unpublished_paths):
    if body.kind in ('SRT','VTT') and body.source!='transcript':raise HTTPException(422,'Phụ đề cần transcript có timestamp; OCR/biên bản không có timestamp')
    from ..services.processors import render_export
    project_id=p['project_id']
    conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR SHARE',(project_id,))
    mid=source_id(conn,project_id,body.media_file_id)
    tid,text,segments,speakers=source_data(conn,project_id,body.source,media_file_id=mid)
    content,mime,ext=render_export(body.kind,p['project_title'],text,segments,speakers,body.max_chars_per_line,body.includes_speaker_label)
    key=f'exports/{uuid4().hex}.{ext}';path=config.storage_path(key);path.parent.mkdir(parents=True,exist_ok=True)
    unpublished_paths.append(path)
    path.write_bytes(content)
    row=one(conn,'''INSERT INTO export_file(project_id,media_file_id,transcript_id,export_kind_code,storage_key,file_name,file_size_bytes,
        source,created_by_user_id,max_chars_per_line,includes_speaker_label) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *''',
        (project_id,mid,tid,body.kind,key,f'{body.source}-{mid or project_id}.{ext}',len(content),body.source,user_id,body.max_chars_per_line,body.includes_speaker_label))
    record_export(conn,p,user_id,row)
    return row


@router.post('/projects/{project_id}/exports',status_code=201)
def create_export(project_id:UUID,body:ExportBody,user=Depends(current_user)):
    unpublished=[]
    try:
        with connection() as conn:
            row=persist_export(conn,project(conn,user,project_id,write=True),user['user_id'],body,unpublished)
        return row
    except Exception:
        for path in unpublished:path.unlink(missing_ok=True)
        raise


@router.get('/projects/{project_id}/exports')
def exports(project_id:UUID,media_file_id:UUID|None=None,user=Depends(current_user)):
    with connection() as conn:
        project(conn,user,project_id)
        mid=source_id(conn,project_id,media_file_id)
        rows=all_rows(conn,'''SELECT e.*,CASE WHEN e.source='ocr' THEN false ELSE
            NOT EXISTS(SELECT 1 FROM transcript t WHERE t.transcript_id=e.transcript_id AND t.is_current)
            OR (e.source='minutes' AND EXISTS(SELECT 1 FROM minutes m WHERE m.transcript_id=e.transcript_id AND m.created_at>e.created_at))
            END AS is_stale FROM export_file e WHERE e.project_id=%s AND (e.media_file_id IS NOT DISTINCT FROM %s OR e.media_file_id IS NULL) ORDER BY e.created_at DESC,e.export_file_id''',(project_id,mid))
        metadata={row['change_detail'].get('export_file_id'):row['change_detail'] for row in all_rows(conn,
            "SELECT change_detail FROM audit_log WHERE entity_name='project' AND entity_id=%s AND action_name='EXPORT' ORDER BY audit_log_id",(str(project_id),))}
        fingerprints={}
        for row in rows:
            saved=metadata.get(str(row['export_file_id']),{})
            if row['includes_speaker_label'] and row['source']=='transcript':
                tid=row['transcript_id']
                if tid not in fingerprints:fingerprints[tid]=speaker_fingerprint(conn,tid)
                row['is_stale']=row['is_stale'] or saved.get('speaker_fingerprint')!=fingerprints[tid]
            if row['source']=='ocr' and saved.get('ocr_document_id'):
                current=one(conn,'SELECT ocr_document_id,revision FROM ocr_document WHERE project_id=%s AND media_file_id IS NOT DISTINCT FROM %s AND is_current',(project_id,row['media_file_id']))
                row['is_stale']=not current or str(current['ocr_document_id'])!=saved['ocr_document_id'] or current['revision']!=saved['ocr_revision']
            elif row['source']=='minutes' and saved.get('minutes_id'):
                latest=one(conn,'SELECT minutes_id FROM minutes WHERE transcript_id=%s ORDER BY version_no DESC LIMIT 1',(row['transcript_id'],))
                row['is_stale']=row['is_stale'] or not latest or str(latest['minutes_id'])!=saved['minutes_id']
        return {'items':rows,'total':len(rows)}


@router.get('/exports/{export_id}/download')
def download_export(export_id:UUID,user=Depends(current_user)):
    with connection() as conn:row=resource(conn,user,'export_file','export_file_id',export_id)
    path=config.storage_path(row['storage_key'])
    if not path.is_file():raise HTTPException(404,'Tệp xuất không còn trong kho')
    mime={'TXT':'text/plain','SRT':'application/x-subrip','VTT':'text/vtt','PDF':'application/pdf','DOCX':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','BURNED_VIDEO':'video/mp4'}[row['export_kind_code']]
    return FileResponse(path,media_type=mime,filename=row['file_name'])


@router.delete('/exports/{export_id}')
def delete_export(export_id:UUID,user=Depends(current_user)):
    with connection() as conn:
        row=resource(conn,user,'export_file','export_file_id',export_id,manage=True)
        conn.execute('DELETE FROM export_file WHERE export_file_id=%s',(export_id,))
    config.storage_path(row['storage_key']).unlink(missing_ok=True)
    return {'ok':True}


def permitted_ids(conn,user):
    return visible_project_ids(conn,user)


@router.get('/library/minutes')
def minutes_library(q:str='',page:int=1,page_size:int=20,user=Depends(current_user)):
    with connection() as conn:
        ids=permitted_ids(conn,user)
        limit,offset=pagination(page,page_size)
        where='m.project_id=ANY(%s::uuid[]) AND (m.meeting_title ILIKE %s OR p.project_title ILIKE %s)'
        params=(ids,'%'+q[:300]+'%','%'+q[:300]+'%')
        rows=all_rows(conn,'SELECT m.*,p.project_title FROM minutes m JOIN project p ON p.project_id=m.project_id WHERE '+where+' ORDER BY m.created_at DESC LIMIT %s OFFSET %s',(*params,limit,offset))
        total=one(conn,'SELECT count(*) AS n FROM minutes m JOIN project p ON p.project_id=m.project_id WHERE '+where,params)['n']
        return {'items':[minutes_data(conn,r) for r in rows],'total':total}


@router.get('/library/subtitles')
def subtitles_library(q:str='',page:int=1,page_size:int=20,user=Depends(current_user)):
    with connection() as conn:
        ids=permitted_ids(conn,user)
        limit,offset=pagination(page,page_size)
        where="e.project_id=ANY(%s::uuid[]) AND e.export_kind_code IN ('SRT','VTT','BURNED_VIDEO') AND (e.file_name ILIKE %s OR p.project_title ILIKE %s)"
        params=(ids,'%'+q[:300]+'%','%'+q[:300]+'%')
        rows=all_rows(conn,'SELECT e.*,p.project_title FROM export_file e JOIN project p ON p.project_id=e.project_id WHERE '+where+' ORDER BY e.created_at DESC LIMIT %s OFFSET %s',(*params,limit,offset))
        total=one(conn,'SELECT count(*) AS n FROM export_file e JOIN project p ON p.project_id=e.project_id WHERE '+where,params)['n']
        return {'items':rows,'total':total}


@router.get('/files')
def files(kind:str='',q:str='',page:int=1,page_size:int=20,user=Depends(current_user)):
    with connection() as conn:
        source='''WITH permitted AS (SELECT p.project_id,p.project_title FROM project p WHERE p.project_id=ANY(%s::uuid[])),
            files AS (SELECT m.media_file_id AS id,m.project_id,p.project_title,m.file_name,m.media_kind_code AS kind,
            m.file_size_bytes AS size,m.created_at,'/api/media/'||m.media_file_id||'/download' AS download_url,
            CASE WHEN m.media_kind_code IN ('ORIGINAL_AUDIO','ORIGINAL_VIDEO','ORIGINAL_IMAGE') THEN m.media_file_id ELSE
                (SELECT (array_agg(DISTINCT j.media_file_id))[1] FROM job_stage s JOIN processing_job j USING(job_id)
                 JOIN media_file original ON original.media_file_id=j.media_file_id AND original.project_id=m.project_id
                 WHERE s.output_storage_key=m.storage_key AND original.media_kind_code IN ('ORIGINAL_AUDIO','ORIGINAL_VIDEO','ORIGINAL_IMAGE')
                 HAVING count(DISTINCT j.media_file_id)=1) END AS media_file_id
            FROM media_file m JOIN permitted p USING(project_id)
            UNION ALL SELECT e.export_file_id AS id,e.project_id,p.project_title,e.file_name,e.export_kind_code AS kind,
            e.file_size_bytes AS size,e.created_at,'/api/exports/'||e.export_file_id||'/download' AS download_url,e.media_file_id
            FROM export_file e JOIN permitted p USING(project_id)) '''
        pattern='%'+q.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
        where=" FROM files WHERE (%s='' OR kind=%s) AND (file_name ILIKE %s OR project_title ILIKE %s)"
        params=(visible_project_ids(conn,user),kind,kind,pattern,pattern)
        limit,offset=pagination(page,page_size)
        rows=all_rows(conn,source+'SELECT *'+where+' ORDER BY created_at DESC,id DESC LIMIT %s OFFSET %s',(*params,limit,offset))
        total=one(conn,source+'SELECT count(*) AS n'+where,params)['n']
        return {'items':rows,'total':total}
