from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field, model_validator

from ..core.access import project, visible_project_ids
from .auth import StrictBody
from ..core.db import all_rows, connection, one
from ..core.security import current_user

from ..core.sources import source_id

router=APIRouter()


@router.get('/search')
def search(q:str=Query(min_length=1,max_length=300),page:int=Query(default=1,ge=1,le=2147483647),
           page_size:int=Query(default=20,ge=1,le=100),user=Depends(current_user)):
    q=q.strip()
    if not q:raise HTTPException(422,'Nhập nội dung cần tìm')
    pattern='%'+q.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
    source='''FROM transcript_segment s JOIN transcript t ON t.transcript_id=s.transcript_id
        JOIN project p ON p.project_id=t.project_id
        JOIN media_file m ON m.project_id=p.project_id AND m.media_file_id=t.media_file_id
        LEFT JOIN processing_job j ON j.job_id=t.job_id
        LEFT JOIN speaker sp ON sp.speaker_id=s.speaker_id AND sp.project_id=p.project_id
        WHERE p.organization_id=%s AND p.deleted_at IS NULL AND t.is_current
        AND m.media_kind_code IN ('ORIGINAL_AUDIO','ORIGINAL_VIDEO')
        AND (t.job_id IS NULL OR j.media_file_id=m.media_file_id)
        AND p.project_id=ANY(%s::uuid[])
        AND s.segment_text COLLATE "und-x-icu" ILIKE %s ESCAPE E'\\\\' '''
    with connection() as conn:
        params=(user['organization_id'],visible_project_ids(conn,user),pattern)
        total=one(conn,'SELECT count(*) AS n '+source,params)['n']
        rows=all_rows(conn,'''SELECT p.project_id,p.project_title,p.project_type,m.media_file_id,
            t.transcript_id,s.segment_id,s.segment_no,s.segment_text,s.start_ms,s.end_ms,
            s.speaker_id,sp.speaker_label,COALESCE(sp.display_name,sp.speaker_label) AS speaker_name,
            substring(s.segment_text FROM GREATEST(strpos(lower(s.segment_text COLLATE "und-x-icu"),
                lower(%s COLLATE "und-x-icu"))-80,1)
                FOR char_length(%s)+160) AS snippet '''+source+'''
            ORDER BY p.updated_at DESC,p.project_id,s.segment_no LIMIT %s OFFSET %s''',
            (q,q,*params,page_size,(page-1)*page_size))
        return {'items':rows,'total':total}


class BookmarkBody(StrictBody):
    media_file_id:UUID
    timestamp_ms:int=Field(strict=True,ge=0,le=2147483647)
    note:str=Field(default='',max_length=2000)


class BookmarkPatch(StrictBody):
    timestamp_ms:int|None=Field(default=None,strict=True,ge=0,le=2147483647)
    note:str|None=Field(default=None,max_length=2000)

    @model_validator(mode='after')
    def nonempty(self):
        if not self.model_fields_set or any(getattr(self,key) is None for key in self.model_fields_set):
            raise ValueError('Cần thời điểm hoặc ghi chú hợp lệ')
        return self


def current_source(conn,project_id,media_file_id,timestamp_ms):
    media=one(conn,'SELECT * FROM media_file WHERE project_id=%s AND media_file_id=%s',(project_id,media_file_id))
    if not media or media['media_file_id']!=media_file_id or media['media_kind_code'] not in ('ORIGINAL_AUDIO','ORIGINAL_VIDEO'):
        raise HTTPException(409,'Nguồn media đã thay đổi hoặc không hỗ trợ dấu trang. Hãy tải lại dự án.')
    if media['duration_ms'] is not None and timestamp_ms>media['duration_ms']:
        raise HTTPException(422,'Thời điểm dấu trang vượt quá thời lượng media')


@router.get('/projects/{project_id}/bookmarks')
def bookmarks(project_id:UUID,media_file_id:UUID|None=None,user=Depends(current_user)):
    with connection() as conn:
        project(conn,user,project_id)
        rows=all_rows(conn,'''SELECT b.* FROM bookmark b JOIN media_file m ON m.media_file_id=b.media_file_id
            WHERE b.project_id=%s AND b.user_id=%s AND b.media_file_id=%s
            ORDER BY b.timestamp_ms,b.created_at,b.bookmark_id''',(project_id,user['user_id'],source_id(conn,project_id,media_file_id)))
        return {'items':rows,'total':len(rows)}


@router.post('/projects/{project_id}/bookmarks',status_code=201)
def add_bookmark(project_id:UUID,body:BookmarkBody,user=Depends(current_user)):
    with connection() as conn:
        # Source replacement takes the same lock, so notes cannot attach to a stale source.
        conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(project_id,))
        project(conn,user,project_id)
        current_source(conn,project_id,body.media_file_id,body.timestamp_ms)
        return one(conn,'''INSERT INTO bookmark(project_id,media_file_id,user_id,timestamp_ms,note)
            VALUES (%s,%s,%s,%s,%s) RETURNING *''',
            (project_id,body.media_file_id,user['user_id'],body.timestamp_ms,body.note))


@router.patch('/projects/{project_id}/bookmarks/{bookmark_id}')
def edit_bookmark(project_id:UUID,bookmark_id:UUID,body:BookmarkPatch,user=Depends(current_user)):
    with connection() as conn:
        conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(project_id,))
        project(conn,user,project_id)
        old=one(conn,'SELECT * FROM bookmark WHERE bookmark_id=%s AND project_id=%s AND user_id=%s FOR UPDATE',
                (bookmark_id,project_id,user['user_id']))
        if not old:raise HTTPException(404,'Không tìm thấy dấu trang')
        timestamp=body.timestamp_ms if 'timestamp_ms' in body.model_fields_set else old['timestamp_ms']
        note=body.note if 'note' in body.model_fields_set else old['note']
        current_source(conn,project_id,old['media_file_id'],timestamp)
        return one(conn,'UPDATE bookmark SET timestamp_ms=%s,note=%s,updated_at=now() WHERE bookmark_id=%s RETURNING *',
                   (timestamp,note,bookmark_id))


@router.delete('/projects/{project_id}/bookmarks/{bookmark_id}')
def delete_bookmark(project_id:UUID,bookmark_id:UUID,user=Depends(current_user)):
    with connection() as conn:
        project(conn,user,project_id)
        row=one(conn,'DELETE FROM bookmark WHERE bookmark_id=%s AND project_id=%s AND user_id=%s RETURNING bookmark_id',
                (bookmark_id,project_id,user['user_id']))
        if not row:raise HTTPException(404,'Không tìm thấy dấu trang')
        return {'ok':True}
