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

