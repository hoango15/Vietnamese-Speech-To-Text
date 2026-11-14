"""Company-scoped administration reads; mutations reuse the resource APIs."""
import shutil
import tempfile
from typing import Literal

from fastapi import APIRouter, Depends
from ..core import config
from ..core.access import pagination
from ..core.db import connection, one, all_rows
from .jobs import job_data
from ..core.security import current_user, require_role

router = APIRouter(prefix='/admin')
JobStatus = Literal['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED']
JobKind = Literal['TRANSCRIBE', 'OCR', 'BURN_IN']
UploadStatus = Literal['INITIATED', 'UPLOADING', 'COMPLETED', 'CANCELED', 'EXPIRED', 'FAILED']


def admin(user=Depends(current_user)):
    require_role(user, 'ADMIN')
    return user


@router.get('/overview')
def overview(user=Depends(admin)):
    org = user['organization_id']
    with connection() as conn:
        stats = one(conn, 'SELECT count(*) AS users,count(*) FILTER(WHERE is_active) AS active_users FROM app_user WHERE organization_id=%s', (org,))
        stats.update(one(conn, 'SELECT count(*) AS projects FROM project WHERE organization_id=%s AND deleted_at IS NULL', (org,)))
        stats.update(one(conn, '''SELECT count(*) AS files,COALESCE(sum(m.file_size_bytes),0) AS storage_bytes
            FROM media_file m JOIN project p USING(project_id) WHERE p.organization_id=%s AND p.deleted_at IS NULL''', (org,)))
        stats.update(one(conn, '''SELECT count(*) AS exports,COALESCE(sum(e.file_size_bytes),0) AS export_bytes
            FROM export_file e JOIN project p USING(project_id) WHERE p.organization_id=%s AND p.deleted_at IS NULL''', (org,)))
        statuses = all_rows(conn, '''SELECT j.job_status_code,count(*) AS total FROM processing_job j JOIN project p USING(project_id)
            WHERE p.organization_id=%s AND p.deleted_at IS NULL GROUP BY j.job_status_code''', (org,))
        daily = all_rows(conn, '''WITH scoped AS (SELECT j.* FROM processing_job j JOIN project p USING(project_id)
            WHERE p.organization_id=%s AND p.deleted_at IS NULL)
            SELECT d.day::date AS day,count(j.job_id) AS total,
                count(j.job_id) FILTER(WHERE j.job_status_code='SUCCEEDED') AS succeeded,
                count(j.job_id) FILTER(WHERE j.job_status_code='FAILED') AS failed
            FROM generate_series((now() AT TIME ZONE 'UTC')::date-6,(now() AT TIME ZONE 'UTC')::date,interval '1 day') AS d(day)
            LEFT JOIN scoped j ON (j.created_at AT TIME ZONE 'UTC')::date=d.day::date GROUP BY d.day ORDER BY d.day''', (org,))
        activities = all_rows(conn, '''SELECT a.*,u.full_name FROM audit_log a JOIN app_user u USING(user_id)
            WHERE u.organization_id=%s ORDER BY a.occurred_at DESC,a.audit_log_id DESC LIMIT 8''', (org,))
    return {'stats': stats, 'job_statuses': statuses, 'daily_jobs': daily, 'time_zone': 'UTC', 'activities': activities}


