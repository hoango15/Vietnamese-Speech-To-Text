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


@router.get('/jobs')
def jobs(q: str = '', status: JobStatus | None = None, kind: JobKind | None = None,
         page: int = 1, page_size: int = 20, user=Depends(admin)):
    limit, offset = pagination(page, page_size)
    where = 'p.organization_id=%s AND p.deleted_at IS NULL AND (p.project_title ILIKE %s OR j.job_id::text ILIKE %s)'
    params = [user['organization_id'], '%' + q[:200] + '%', '%' + q[:200] + '%']
    if status:
        where += ' AND j.job_status_code=%s'; params.append(status)
    if kind:
        where += ' AND j.job_kind=%s'; params.append(kind)
    source = ' FROM processing_job j JOIN project p USING(project_id) WHERE ' + where
    with connection() as conn:
        total = one(conn, 'SELECT count(*) AS n' + source, params)['n']
        rows = all_rows(conn, 'SELECT j.*,p.project_title' + source + ' ORDER BY j.created_at DESC,j.job_id LIMIT %s OFFSET %s', (*params, limit, offset))
        return {'items': [job_data(conn, row) for row in rows], 'total': total}


@router.get('/uploads')
def uploads(q: str = '', status: UploadStatus | None = None, page: int = 1, page_size: int = 20, user=Depends(admin)):
    limit, offset = pagination(page, page_size)
    where = 'p.organization_id=%s AND p.deleted_at IS NULL AND (p.project_title ILIKE %s OR s.file_name ILIKE %s)'
    params = [user['organization_id'], '%' + q[:200] + '%', '%' + q[:200] + '%']
    if status:
        where += ' AND s.upload_status_code=%s'; params.append(status)
    source = ' FROM upload_session s JOIN project p USING(project_id) JOIN app_user u ON u.user_id=s.user_id WHERE ' + where
    with connection() as conn:
        total = one(conn, 'SELECT count(*) AS n' + source, params)['n']
        rows = all_rows(conn, '''SELECT s.upload_id,s.project_id,s.file_name,s.upload_status_code,s.expected_size_bytes,
            s.uploaded_size_bytes,s.created_at,s.expires_at,p.project_title,u.full_name''' + source +
            ' ORDER BY s.created_at DESC,s.upload_id LIMIT %s OFFSET %s', (*params, limit, offset))
        return {'items': rows, 'total': total}


