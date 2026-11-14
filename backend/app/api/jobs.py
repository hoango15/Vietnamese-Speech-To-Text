import json
import time
from typing import Literal
from uuid import UUID
from fastapi import APIRouter,Depends,HTTPException,Header
from fastapi.responses import StreamingResponse
from pydantic import Field
from psycopg.types.json import Jsonb
from .auth import StrictBody
from ..core.db import connection,one,all_rows,audit
from ..core.security import current_user
from ..core.access import project,resource,pagination

from ..core.sources import source_id,project_status

router=APIRouter()


def job_data(conn,row):
    audio=None
    if row['started_at'] and row['job_status_code']!='QUEUED':
        latest=one(conn,"SELECT event_payload FROM job_event WHERE job_id=%s AND event_type='PROGRESS' AND occurred_at>=%s ORDER BY job_event_id DESC LIMIT 1",(row['job_id'],row['started_at']))
        if latest:
            audio={key:latest['event_payload'][key] for key in ('processed_audio_ms','total_audio_ms')}
    percent=100 if row['job_status_code']=='SUCCEEDED' else min(99,row['progress_percent'])
    options=one(conn,"SELECT event_payload FROM job_event WHERE job_id=%s AND event_type='OPTIONS' ORDER BY job_event_id DESC LIMIT 1",(row['job_id'],))
    requested=(options['event_payload'].get('requested_exports',[]) if options else [])
    return {**row,'progress_percent':percent,'asr_progress':audio,'requested_exports':requested,'stages':all_rows(conn,'''SELECT s.*,t.description FROM job_stage s JOIN ref.job_stage_type t USING(job_stage_type_code)
        WHERE s.job_id=%s ORDER BY t.stage_order''',(row['job_id'],))}


def event(conn,jid,event_type,payload):
    conn.execute('INSERT INTO job_event(job_id,event_type,event_payload) VALUES (%s,%s,%s)',(jid,event_type,Jsonb(payload)))


def enqueue(job_id):
    from ..worker import process_job
    try:
        process_job.apply_async(args=[str(job_id)],task_id=str(job_id),retry=False)
    except Exception:
        with connection() as conn:
            row=one(conn,'SELECT * FROM processing_job WHERE job_id=%s FOR UPDATE',(job_id,))
            if row and row['job_status_code']=='QUEUED':
                conn.execute("UPDATE processing_job SET job_status_code='RUNNING' WHERE job_id=%s",(job_id,))
                conn.execute("UPDATE processing_job SET job_status_code='FAILED',finished_at=GREATEST(now(),started_at),error_message=%s WHERE job_id=%s",('Không kết nối được hàng đợi Redis. Khởi động Redis/worker rồi chạy lại.',job_id))
                project_status(conn,row['project_id'],'FAILED')
                event(conn,job_id,'FAILED',{'error':'Không kết nối được Redis'})


class JobBody(StrictBody):
    media_file_id:UUID
    payment_id:UUID|None=None
    glossary_id:UUID|None=None
    is_minutes_requested:bool=True
    is_diarization_requested:bool=False
    expected_speaker_count:int|None=Field(default=None,ge=1,le=20)
    requested_exports:list[Literal['TXT','SRT','VTT']]=Field(default_factory=list,max_length=3)


def prepare_job(conn,user,pid,body,job_kind=None):
    conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(pid,))
    p=project(conn,user,pid,write=True)
    media=resource(conn,user,'media_file','media_file_id',body.media_file_id,write=True)
    if media['project_id']!=pid or not media['media_kind_code'].startswith('ORIGINAL_'):raise HTTPException(422,'Chọn tệp nguồn của dự án')
    if one(conn,"SELECT 1 FROM processing_job WHERE media_file_id=%s AND job_status_code IN ('QUEUED','RUNNING')",(body.media_file_id,)):
        raise HTTPException(409,'Dự án đã có tác vụ đang chạy')
    if body.glossary_id and not one(conn,'SELECT 1 FROM glossary WHERE glossary_id=%s',(body.glossary_id,)):
        raise HTTPException(404,'Không tìm thấy từ điển')
    import os
    from ..services.colab import provider
    model='colab-whisper' if provider('ASR_PROVIDER')=='colab' else os.getenv('WHISPER_MODEL','base')
    kind=job_kind or ('OCR' if media['media_kind_code']=='ORIGINAL_IMAGE' else 'TRANSCRIBE')
    if kind=='TRANSCRIBE' and not (body.is_minutes_requested or body.is_diarization_requested):
        raise HTTPException(422,'Chọn ít nhất một tùy chọn: phân biệt người nói hoặc tạo biên bản.')
    if kind!='TRANSCRIBE' and any(item in ('SRT','VTT') for item in body.requested_exports):
        raise HTTPException(422,'Phụ đề cần nguồn âm thanh hoặc video có timestamp')
    if body.is_diarization_requested:
        from ..services import diarization
        if kind!='TRANSCRIBE':raise HTTPException(422,'Phân người nói chỉ hỗ trợ nguồn âm thanh hoặc video')
        if not diarization.available():raise HTTPException(422,'Model phân người nói cục bộ chưa sẵn sàng. Kiểm tra phụ thuộc worker.')
    return media,kind,model


def create_job(conn,user,pid,body,job_kind=None):
    media,kind,model=prepare_job(conn,user,pid,body,job_kind)
    if kind=='TRANSCRIBE':
        from .payments import require_payment
        require_payment(conn,user,pid,body)
    row=one(conn,'''INSERT INTO processing_job(project_id,media_file_id,requested_by_user_id,glossary_id,asr_model_name,is_minutes_requested,job_kind,is_diarization_requested,expected_speaker_count)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *''',(pid,body.media_file_id,user['user_id'],body.glossary_id,model,body.is_minutes_requested and kind=='TRANSCRIBE',kind,body.is_diarization_requested,body.expected_speaker_count if body.is_diarization_requested else None))
    if kind=='TRANSCRIBE' and body.payment_id:
        conn.execute('UPDATE payment SET job_id=%s,updated_at=now() WHERE payment_id=%s',(row['job_id'],body.payment_id))
    conn.execute("UPDATE project SET project_status_code='PROCESSING' WHERE project_id=%s",(pid,))
    event(conn,row['job_id'],'QUEUED',{'kind':kind})
    if body.requested_exports:
        event(conn,row['job_id'],'OPTIONS',{'requested_exports':list(dict.fromkeys(body.requested_exports))})
    audit(conn,user['user_id'],'START_JOB','project',pid,{'job_id':str(row['job_id']),'kind':kind})
    return job_data(conn,row)


@router.post('/projects/{project_id}/jobs',status_code=201)
def start(project_id:UUID,body:JobBody,user=Depends(current_user)):
    with connection() as conn:row=create_job(conn,user,project_id,body)
    enqueue(row['job_id'])
    with connection() as conn:return job_data(conn,one(conn,'SELECT * FROM processing_job WHERE job_id=%s',(row['job_id'],)))
