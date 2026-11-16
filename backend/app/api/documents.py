from datetime import date
import hashlib
import json
from typing import Literal
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
    return {**row,'media_file_id':source['media_file_id'],
        'topics':all_rows(conn,'SELECT * FROM minutes_topic WHERE minutes_id=%s ORDER BY topic_no',(row['minutes_id'],)),
        'decisions':all_rows(conn,'SELECT * FROM minutes_decision WHERE minutes_id=%s ORDER BY decision_no',(row['minutes_id'],)),
        'action_items':all_rows(conn,'SELECT * FROM action_item WHERE minutes_id=%s ORDER BY action_item_id',(row['minutes_id'],))}


def insert_minutes(conn,pid,tid,title,body,model='local-extractive',meeting_date=None):
    conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(pid,))
    version=one(conn,'SELECT COALESCE(max(version_no),0)+1 AS n FROM minutes WHERE project_id=%s',(pid,))['n']
    row=one(conn,'''INSERT INTO minutes(project_id,transcript_id,version_no,meeting_title,meeting_date,summary_text,llm_model_name)
        VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *''',(pid,tid,version,title,meeting_date,body.get('summary_text',''),model))
    mid=row['minutes_id']
    for i,t in enumerate(body.get('topics',[]),1):
        conn.execute('INSERT INTO minutes_topic(minutes_id,topic_no,topic_title,topic_summary,source_start_ms) VALUES (%s,%s,%s,%s,%s)',
                     (mid,i,t['topic_title'],t.get('topic_summary',''),t.get('source_start_ms')))
    for i,d in enumerate(body.get('decisions',[]),1):
        conn.execute('INSERT INTO minutes_decision(minutes_id,decision_no,decision_text,source_start_ms) VALUES (%s,%s,%s,%s)',
                     (mid,i,d['decision_text'],d.get('source_start_ms')))
    for a in body.get('action_items',[]):
        conn.execute('''INSERT INTO action_item(minutes_id,item_description,assignee_name,due_date,action_item_status_code,source_start_ms)
            VALUES (%s,%s,%s,%s,%s,%s)''',(mid,a['item_description'],a.get('assignee_name'),a.get('due_date'),a.get('action_item_status_code','OPEN'),a.get('source_start_ms')))
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
        current=one(conn,'SELECT transcript_id FROM transcript WHERE project_id=%s AND media_file_id IS NOT DISTINCT FROM %s AND is_current',(project_id,t['media_file_id']))
        if not current or current['transcript_id']!=t['transcript_id']:
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
    item_description:str=Field(min_length=1,max_length=10000)
    assignee_name:str|None=Field(default=None,max_length=200)
    due_date:date|None=None
    action_item_status_code:Literal['OPEN','IN_PROGRESS','DONE','CANCELED']='OPEN'
    source_start_ms:int|None=Field(default=None,ge=0)


class MinutesBody(StrictBody):
    meeting_title:str=Field(min_length=1,max_length=300)
    meeting_date:date|None=None
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

