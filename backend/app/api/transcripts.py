from uuid import UUID
from fastapi import APIRouter,Depends,HTTPException
from pydantic import Field,model_validator
from psycopg.types.json import Jsonb
from .auth import StrictBody
from ..core.db import connection,one,all_rows,audit
from ..core.security import current_user
from ..core.access import project,resource
from ..core.sources import source_id

router=APIRouter()


class GrammarBody(StrictBody):
    text:str=Field(min_length=1,max_length=50000)


@router.post('/projects/{project_id}/fix-grammar')
def fix_grammar(project_id:UUID,body:GrammarBody,user=Depends(current_user)):
    from ..services.colab import process_text
    with connection() as conn:project(conn,user,project_id,write=True)
    if not body.text.strip():raise HTTPException(422,'Văn bản cần có nội dung')
    text=process_text(body.text,'fix_grammar')
    return {'text':text}


def transcript_data(conn,transcript):
    return {**transcript,'segments':all_rows(conn,'SELECT * FROM transcript_segment WHERE transcript_id=%s ORDER BY segment_no',(transcript['transcript_id'],)),
            'speakers':all_rows(conn,'''SELECT * FROM speaker WHERE project_id=%s
                AND (media_file_id IS NOT DISTINCT FROM %s OR speaker_id IN
                    (SELECT speaker_id FROM transcript_segment WHERE transcript_id=%s))
                ORDER BY speaker_label''',(transcript['project_id'],transcript['media_file_id'],transcript['transcript_id']))}


@router.get('/projects/{project_id}/transcripts')
def versions(project_id:UUID,media_file_id:UUID|None=None,user=Depends(current_user)):
    with connection() as conn:
        project(conn,user,project_id)
        mid=source_id(conn,project_id,media_file_id)
        rows=all_rows(conn,'SELECT * FROM transcript WHERE project_id=%s AND (media_file_id IS NOT DISTINCT FROM %s OR media_file_id IS NULL) ORDER BY version_no DESC',(project_id,mid))
        return {'items':rows,'total':len(rows)}


@router.get('/projects/{project_id}/transcripts/current')
def current(project_id:UUID,media_file_id:UUID|None=None,user=Depends(current_user)):
    with connection() as conn:
        project(conn,user,project_id)
        mid=source_id(conn,project_id,media_file_id)
        t=one(conn,'SELECT * FROM transcript WHERE project_id=%s AND media_file_id IS NOT DISTINCT FROM %s AND is_current',(project_id,mid))
        if not t:raise HTTPException(404,'Chưa có transcript cho nguồn hiện tại')
        return transcript_data(conn,t)


@router.get('/transcripts/{transcript_id}')
def get_transcript(transcript_id:UUID,user=Depends(current_user)):
    with connection() as conn:return transcript_data(conn,resource(conn,user,'transcript','transcript_id',transcript_id))


class SegmentBody(StrictBody):
    segment_id:UUID|None=None
    start_ms:int=Field(ge=0,le=2147483647)
    end_ms:int=Field(gt=0,le=2147483647)
    segment_text:str=Field(min_length=1,max_length=50000)
    speaker_id:UUID|None=None

    @model_validator(mode='after')
    def times(self):
        if self.end_ms<=self.start_ms:raise ValueError('Thời điểm kết thúc phải sau thời điểm bắt đầu')
        return self


class SaveTranscript(StrictBody):
    revision:int=Field(ge=1)
    segments:list[SegmentBody]=Field(max_length=20000)


def save_transcript(conn,user,transcript_id,body):
    old=resource(conn,user,'transcript','transcript_id',transcript_id,write=True)
    pid=old['project_id']
    conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(pid,))
    old=one(conn,'SELECT * FROM transcript WHERE transcript_id=%s FOR UPDATE',(transcript_id,))
    if old['revision']!=body.revision or not old['is_current']:
        raise HTTPException(409,'Transcript đã thay đổi. Hãy tải lại trước khi lưu để tránh ghi đè.')
    speakers={str(s['speaker_id']) for s in transcript_data(conn,old)['speakers']}
    duration=one(conn,'SELECT duration_ms FROM media_file WHERE project_id=%s AND media_file_id=%s',(pid,old['media_file_id']))
    for segment in body.segments:
        if segment.speaker_id and str(segment.speaker_id) not in speakers:raise HTTPException(422,'Người nói không thuộc dự án')
        if duration and duration['duration_ms'] and segment.end_ms>duration['duration_ms']+1000:
            raise HTTPException(422,'Timestamp vượt quá thời lượng media')
    version=one(conn,'SELECT COALESCE(max(version_no),0)+1 AS n FROM transcript WHERE project_id=%s',(pid,))['n']
    conn.execute('UPDATE transcript SET is_current=false WHERE project_id=%s AND media_file_id IS NOT DISTINCT FROM %s AND is_current',(pid,old['media_file_id']))
    row=one(conn,'''INSERT INTO transcript(project_id,job_id,media_file_id,version_no,transcript_source_code,revision,created_by_user_id)
        VALUES (%s,%s,%s,%s,'EDITED',%s,%s) RETURNING *''',(pid,old['job_id'],old['media_file_id'],version,old['revision']+1,user['user_id']))
    for i,s in enumerate(body.segments,1):
        conn.execute('''INSERT INTO transcript_segment(transcript_id,segment_no,speaker_id,start_ms,end_ms,segment_text,is_edited)
            VALUES (%s,%s,%s,%s,%s,%s,true)''',(row['transcript_id'],i,s.speaker_id,s.start_ms,s.end_ms,s.segment_text))
    audit(conn,user['user_id'],'EDIT_TRANSCRIPT','project',pid,{'version':version})
    return transcript_data(conn,row)


@router.put('/transcripts/{transcript_id}')
def save(transcript_id:UUID,body:SaveTranscript,user=Depends(current_user)):
    with connection() as conn:return save_transcript(conn,user,transcript_id,body)


@router.post('/transcripts/{transcript_id}/set-current')
def set_current(transcript_id:UUID,user=Depends(current_user)):
    with connection() as conn:
        t=resource(conn,user,'transcript','transcript_id',transcript_id,write=True)
        conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(t['project_id'],))
        conn.execute('UPDATE transcript SET is_current=false WHERE project_id=%s AND media_file_id IS NOT DISTINCT FROM %s AND is_current',(t['project_id'],t['media_file_id']))
        t=one(conn,'UPDATE transcript SET is_current=true,revision=revision+1 WHERE transcript_id=%s RETURNING *',(transcript_id,))
        audit(conn,user['user_id'],'RESTORE_TRANSCRIPT','project',t['project_id'])
        return transcript_data(conn,t)


@router.get('/transcripts/{transcript_id}/segments')
def segments(transcript_id:UUID,user=Depends(current_user)):
    with connection() as conn:
        t=resource(conn,user,'transcript','transcript_id',transcript_id)
        rows=transcript_data(conn,t)['segments'];return {'items':rows,'total':len(rows)}


@router.get('/transcripts/{transcript_id}/words')
def words(transcript_id:UUID,user=Depends(current_user)):
    with connection() as conn:
        resource(conn,user,'transcript','transcript_id',transcript_id)
        rows=all_rows(conn,'''SELECT w.* FROM transcript_word w JOIN transcript_segment s ON s.segment_id=w.segment_id
            WHERE s.transcript_id=%s ORDER BY s.segment_no,w.word_no''',(transcript_id,))
        return {'items':rows,'total':len(rows)}


@router.get('/projects/{project_id}/transcripts/search')
def search(project_id:UUID,q:str='',media_file_id:UUID|None=None,user=Depends(current_user)):
    with connection() as conn:
        project(conn,user,project_id)
        mid=source_id(conn,project_id,media_file_id)
        rows=all_rows(conn,'''SELECT s.* FROM transcript_segment s JOIN transcript t ON t.transcript_id=s.transcript_id
            WHERE t.project_id=%s AND t.media_file_id IS NOT DISTINCT FROM %s AND t.is_current AND s.segment_text ILIKE %s ORDER BY s.segment_no LIMIT 100''',(project_id,mid,'%'+q[:300]+'%'))
        return {'items':rows,'total':len(rows)}


class SpeakerBody(StrictBody):
    display_name:str=Field(min_length=1,max_length=200)
    color_hex:str=Field(default='#0d9488',pattern=r'^#[0-9a-fA-F]{6}$')


@router.get('/projects/{project_id}/speakers')
def speakers(project_id:UUID,media_file_id:UUID|None=None,user=Depends(current_user)):
    with connection() as conn:
        project(conn,user,project_id)
        mid=source_id(conn,project_id,media_file_id)
        rows=all_rows(conn,'''SELECT * FROM speaker WHERE project_id=%s AND
            (media_file_id IS NOT DISTINCT FROM %s OR speaker_id IN (
                SELECT s.speaker_id FROM transcript_segment s JOIN transcript t USING(transcript_id)
                WHERE t.project_id=%s AND t.media_file_id IS NOT DISTINCT FROM %s))
            ORDER BY speaker_label''',(project_id,mid,project_id,mid))
        return {'items':rows,'total':len(rows)}


@router.post('/projects/{project_id}/speakers',status_code=201)
def add_speaker(project_id:UUID,body:SpeakerBody,media_file_id:UUID|None=None,user=Depends(current_user)):
    with connection() as conn:
        project(conn,user,project_id,write=True)
        conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(project_id,))
        mid=source_id(conn,project_id,media_file_id)
        from uuid import uuid4
        return one(conn,'''INSERT INTO speaker(project_id,media_file_id,speaker_label,display_name,color_hex) VALUES (%s,%s,%s,%s,%s) RETURNING *''',
                   (project_id,mid,'SPEAKER_'+uuid4().hex[:12],body.display_name,body.color_hex))


@router.get('/speakers/{speaker_id}')
def get_speaker(speaker_id:UUID,user=Depends(current_user)):
    with connection() as conn:return resource(conn,user,'speaker','speaker_id',speaker_id)


@router.patch('/speakers/{speaker_id}')
def edit_speaker(speaker_id:UUID,body:SpeakerBody,user=Depends(current_user)):
    with connection() as conn:
        row=resource(conn,user,'speaker','speaker_id',speaker_id,write=True)
        conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(row['project_id'],))
        return one(conn,'UPDATE speaker SET display_name=%s,color_hex=%s WHERE speaker_id=%s RETURNING *',(body.display_name,body.color_hex,speaker_id))


@router.delete('/speakers/{speaker_id}')
def delete_speaker(speaker_id:UUID,user=Depends(current_user)):
    with connection() as conn:
        row=resource(conn,user,'speaker','speaker_id',speaker_id,write=True)
        conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(row['project_id'],))
        conn.execute('DELETE FROM speaker WHERE speaker_id=%s',(speaker_id,))
    return {'ok':True}


class MergeSpeaker(StrictBody):target_speaker_id:UUID


@router.post('/speakers/{speaker_id}/merge')
def merge_speaker(speaker_id:UUID,body:MergeSpeaker,user=Depends(current_user)):
    with connection() as conn:
        source=resource(conn,user,'speaker','speaker_id',speaker_id,write=True)
        target=resource(conn,user,'speaker','speaker_id',body.target_speaker_id,write=True)
        if source['project_id']!=target['project_id'] or source['media_file_id']!=target['media_file_id'] or speaker_id==body.target_speaker_id:raise HTTPException(422,'Hai người nói phải khác nhau và thuộc cùng tệp')
        conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(source['project_id'],))
        conn.execute('UPDATE transcript_segment SET speaker_id=%s WHERE speaker_id=%s',(body.target_speaker_id,speaker_id))
        conn.execute('UPDATE action_item SET assignee_speaker_id=%s WHERE assignee_speaker_id=%s',(body.target_speaker_id,speaker_id))
        conn.execute('DELETE FROM speaker WHERE speaker_id=%s',(speaker_id,))
        return target
