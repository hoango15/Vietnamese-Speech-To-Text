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
    
    
@router.get('/projects/{project_id}/jobs')
def list_jobs(project_id:UUID,q:str='',status:Literal['QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELED']|None=None,
              page:int=1,page_size:int=20,user=Depends(current_user)):
    with connection() as conn:
        project(conn,user,project_id)
        limit,offset=pagination(page,page_size)
        where='j.project_id=%s AND (m.file_name ILIKE %s OR j.job_id::text ILIKE %s)'
        params=[project_id,'%'+q[:200]+'%','%'+q[:200]+'%']
        if status:where+=' AND j.job_status_code=%s';params.append(status)
        source=' FROM processing_job j JOIN media_file m USING(media_file_id) WHERE '+where
        rows=all_rows(conn,'SELECT j.*,m.file_name'+source+' ORDER BY j.created_at DESC,j.job_id LIMIT %s OFFSET %s',(*params,limit,offset))
        total=one(conn,'SELECT count(*) AS n'+source,params)['n']
        return {'items':[job_data(conn,r) for r in rows],'total':total}


@router.get('/jobs/{job_id}')
def detail(job_id:UUID,user=Depends(current_user)):
    with connection() as conn:return job_data(conn,resource(conn,user,'processing_job','job_id',job_id))


@router.get('/jobs/{job_id}/progress')
def progress(job_id:UUID,user=Depends(current_user)):return detail(job_id,user)


@router.get('/jobs/{job_id}/results')
def results(job_id:UUID,user=Depends(current_user)):
    from .transcripts import transcript_data
    from .documents import minutes_data
    with connection() as conn:
        job=resource(conn,user,'processing_job','job_id',job_id)
        media=one(conn,'SELECT media_file_id,file_name FROM media_file WHERE media_file_id=%s',(job['media_file_id'],))
        transcript=one(conn,'SELECT * FROM transcript WHERE job_id=%s ORDER BY version_no DESC LIMIT 1',(job_id,))
        minutes=one(conn,'''SELECT m.* FROM minutes m JOIN transcript t USING(transcript_id)
            WHERE t.job_id=%s ORDER BY m.version_no DESC LIMIT 1''',(job_id,))
        files=all_rows(conn,'''SELECT e.export_file_id,e.file_name,e.export_kind_code,e.source,e.transcript_id
            FROM export_file e JOIN transcript t USING(transcript_id) WHERE t.job_id=%s
            AND e.export_kind_code<>'BURNED_VIDEO'
            ORDER BY e.created_at DESC,e.export_file_id''',(job_id,))
        saved=one(conn,"SELECT event_payload FROM job_event WHERE job_id=%s AND event_type='RESULT' ORDER BY job_event_id DESC LIMIT 1",(job_id,))
        saved=saved['event_payload'] if saved else {}
        ocr=None
        if job['job_kind']=='BURN_IN':
            if not saved:
                options=one(conn,"SELECT event_payload FROM job_event WHERE job_id=%s AND event_type='OPTIONS' ORDER BY job_event_id DESC LIMIT 1",(job_id,))
                saved=options['event_payload'] if options else {}
            transcript=one(conn,'SELECT * FROM transcript WHERE transcript_id=%s AND project_id=%s',(saved.get('transcript_id'),job['project_id']))
            files=all_rows(conn,'''SELECT export_file_id,file_name,export_kind_code,source,transcript_id FROM export_file
                WHERE project_id=%s AND (export_file_id=%s OR storage_key LIKE %s)''',
                (job['project_id'],saved.get('export_file_id'),f'exports/{job_id}-%'))
        elif job['job_kind']=='OCR':
            ocr=one(conn,'SELECT ocr_document_id,document_text FROM ocr_document WHERE ocr_document_id=%s AND project_id=%s',
                    (saved.get('ocr_document_id'),job['project_id']))
            files=all_rows(conn,'''SELECT e.export_file_id,e.file_name,e.export_kind_code,e.source,e.transcript_id
                FROM export_file e WHERE e.project_id=%s AND EXISTS(SELECT 1 FROM job_event v
                WHERE v.job_id=%s AND v.event_type='EXPORT' AND v.event_payload->>'export_file_id'=e.export_file_id::text)
                ORDER BY e.created_at DESC,e.export_file_id''',(job['project_id'],job_id))
        if minutes:
            minutes={**minutes,'transcript_version_no':one(conn,'SELECT version_no FROM transcript WHERE transcript_id=%s',(minutes['transcript_id'],))['version_no']}
        return {'media':media,'transcript':transcript_data(conn,transcript) if transcript else None,
                'minutes':minutes_data(conn,minutes) if minutes else None,'exports':files,'ocr':ocr}


@router.get('/jobs/{job_id}/stages')
def stages(job_id:UUID,user=Depends(current_user)):
    rows=detail(job_id,user)['stages'];return {'items':rows,'total':len(rows)}


@router.get('/jobs/{job_id}/logs')
def logs(job_id:UUID,user=Depends(current_user)):
    with connection() as conn:
        resource(conn,user,'processing_job','job_id',job_id)
        rows=all_rows(conn,'SELECT * FROM job_event WHERE job_id=%s ORDER BY job_event_id DESC LIMIT 100',(job_id,))
        return {'items':rows,'total':len(rows)}


@router.post('/jobs/{job_id}/cancel')
def cancel(job_id:UUID,user=Depends(current_user)):
    with connection() as conn:
        row=resource(conn,user,'processing_job','job_id',job_id,write=True)
        conn.execute('SELECT job_id FROM processing_job WHERE job_id=%s FOR UPDATE',(job_id,))
        current=one(conn,'SELECT * FROM processing_job WHERE job_id=%s',(job_id,))
        if current['job_status_code'] not in ('QUEUED','RUNNING'):raise HTTPException(409,'Chỉ hủy được tác vụ đang chờ hoặc đang chạy')
        row=one(conn,"UPDATE processing_job SET job_status_code='CANCELED',finished_at=GREATEST(now(),started_at) WHERE job_id=%s RETURNING *",(job_id,))
        project_status(conn,row['project_id'],'DRAFT')
        event(conn,job_id,'CANCELED',{})
        return job_data(conn,row)


@router.post('/jobs/{job_id}/retry')
def retry(job_id:UUID,user=Depends(current_user)):
    with connection() as conn:
        row=resource(conn,user,'processing_job','job_id',job_id,write=True)
        conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(row['project_id'],))
        project(conn,user,row['project_id'],write=True)
        row=one(conn,'SELECT * FROM processing_job WHERE job_id=%s FOR UPDATE',(job_id,))
        if row['job_status_code']!='FAILED':raise HTTPException(409,'Chỉ chạy lại được tác vụ thất bại')
        if row['job_kind']=='TRANSCRIBE' and not (row['is_minutes_requested'] or row['is_diarization_requested']):
            raise HTTPException(422,'Chọn phân biệt người nói hoặc tạo biên bản và tạo tác vụ mới cho tệp này.')
        if one(conn,"SELECT 1 FROM processing_job WHERE media_file_id=%s AND job_status_code IN ('QUEUED','RUNNING')",(row['media_file_id'],)):
            raise HTTPException(409,'Dự án đang có tác vụ khác')
        conn.execute("UPDATE processing_job SET job_status_code='QUEUED',progress_percent=0,started_at=NULL,finished_at=NULL WHERE job_id=%s",(job_id,))
        conn.execute("UPDATE project SET project_status_code='PROCESSING' WHERE project_id=%s",(row['project_id'],))
        event(conn,job_id,'RETRY',{})
    enqueue(job_id)
    return detail(job_id,user)


@router.get('/jobs/{job_id}/events')
def events(job_id:UUID,authorization:str=Header(),user=Depends(current_user)):
    detail(job_id,user)
    def stream():
        cursor=0
        while True:
            try:
                fresh=current_user(authorization)
                with connection() as conn:
                    job=resource(conn,fresh,'processing_job','job_id',job_id)
                    rows=all_rows(conn,'SELECT * FROM job_event WHERE job_id=%s AND job_event_id>%s ORDER BY job_event_id',(job_id,cursor))
                for row in rows:
                    cursor=row['job_event_id']
                    yield f'id: {cursor}\nevent: progress\ndata: {json.dumps(row,default=str,ensure_ascii=False)}\n\n'
                if job['job_status_code'] in ('SUCCEEDED','FAILED','CANCELED'):break
                yield ': heartbeat\n\n';time.sleep(2)
            except HTTPException:
                yield 'event: closed\ndata: {"detail":"Quyền truy cập hoặc phiên đã hết hạn"}\n\n';break
    return StreamingResponse(stream(),media_type='text/event-stream',headers={'X-Accel-Buffering':'no'})


class BurnBody(StrictBody):
    max_chars_per_line:int=Field(default=42,ge=10,le=120)
    includes_speaker_label:bool=False
    transcript_id:UUID|None=None
    media_file_id:UUID|None=None


@router.post('/projects/{project_id}/subtitles/burn-in',status_code=201)
def burn(project_id:UUID,body:BurnBody,user=Depends(current_user)):
    with connection() as conn:
        project(conn,user,project_id,write=True)
        conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(project_id,))
        mid=source_id(conn,project_id,body.media_file_id)
        source=one(conn,"SELECT * FROM media_file WHERE media_file_id=%s AND media_kind_code='ORIGINAL_VIDEO'",(mid,))
        if not source:raise HTTPException(409,'Cần video nguồn để gắn phụ đề')
        transcript=one(conn,'SELECT transcript_id FROM transcript WHERE project_id=%s AND media_file_id IS NOT DISTINCT FROM %s AND is_current',(project_id,mid))
        if not transcript:raise HTTPException(409,'Cần transcript trước khi gắn phụ đề')
        if (body.media_file_id and body.media_file_id!=source['media_file_id']) or (body.transcript_id and body.transcript_id!=transcript['transcript_id']):
            raise HTTPException(409,'Video hoặc bản ghi đã thay đổi. Hãy tải lại trước khi tạo Vietsub.')
        row=create_job(conn,user,project_id,JobBody(media_file_id=source['media_file_id'],is_minutes_requested=False),'BURN_IN')
        options={**body.model_dump(mode='json'),'transcript_id':str(transcript['transcript_id'])}
        if body.includes_speaker_label:
            labels=all_rows(conn,'''SELECT ts.segment_id,COALESCE(NULLIF(s.display_name,''),s.speaker_label) AS label
                FROM transcript_segment ts LEFT JOIN speaker s USING(speaker_id) WHERE ts.transcript_id=%s''',(transcript['transcript_id'],))
            options['segment_speaker_labels']={str(item['segment_id']):item['label'] for item in labels if item['label']}
        event(conn,row['job_id'],'OPTIONS',options)
    enqueue(row['job_id']);return detail(row['job_id'],user)
