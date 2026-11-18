from fastapi import HTTPException
from .db import one


def source_id(conn, project_id, media_file_id=None):
    if media_file_id is not None:
        row=one(conn,"SELECT media_file_id FROM media_file WHERE project_id=%s AND media_file_id=%s AND media_kind_code LIKE 'ORIGINAL_%%'",(project_id,media_file_id))
        if not row:raise HTTPException(422,'Tệp nguồn không thuộc dự án')
    else:
        row=one(conn,'SELECT media_file_id FROM media_file WHERE project_id=%s AND is_current',(project_id,))
    return row['media_file_id'] if row else None


def project_status(conn, project_id, fallback):
    conn.execute('''UPDATE project SET project_status_code=CASE WHEN EXISTS(
        SELECT 1 FROM processing_job WHERE project_id=%s AND job_status_code IN ('QUEUED','RUNNING'))
        THEN 'PROCESSING' ELSE %s END WHERE project_id=%s''',(project_id,fallback,project_id))
