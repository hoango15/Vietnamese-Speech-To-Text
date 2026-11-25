from uuid import UUID
from fastapi import HTTPException
from .db import one, all_rows
from .project_rules import owner_roles


def visible_project_ids(conn, user, deleted=False):
    """One visibility rule for direct resources, searches, counts and lists."""
    return [r['project_id'] for r in all_rows(conn, '''SELECT p.project_id FROM project p
        JOIN app_user a ON a.user_id=%s AND a.organization_id=p.organization_id AND a.is_active
        LEFT JOIN company c ON c.company_id=p.company_id
        WHERE (%s OR p.deleted_at IS NULL) AND (
            a.user_role_code='ADMIN' OR
            (p.project_scope='PERSONAL' AND (
                (p.owner_user_id=a.user_id AND a.user_role_code IN ('MEMBER','COMPANY_OWNER')) OR EXISTS(
                    SELECT 1 FROM project_member m WHERE m.project_id=p.project_id AND m.user_id=a.user_id AND m.personal_access_granted))) OR
            (p.project_scope='TEAM' AND p.company_id=a.company_id AND a.company_projects_enabled AND (
                (a.user_role_code='COMPANY_OWNER' AND c.owner_user_id=a.user_id) OR EXISTS(
                    SELECT 1 FROM project_member m WHERE m.project_id=p.project_id AND m.user_id=a.user_id))))
        AND (p.deleted_at IS NULL OR a.user_role_code='ADMIN' OR
            (p.project_scope='PERSONAL' AND p.owner_user_id=a.user_id) OR
            (p.project_scope='TEAM' AND c.owner_user_id=a.user_id AND a.user_role_code='COMPANY_OWNER'))''',
        (user['user_id'], deleted))]


def project(conn, user, project_id, write=False, manage=False, deleted=False):
    project_id = UUID(str(project_id))
    actor = one(conn, 'SELECT * FROM app_user WHERE user_id=%s FOR SHARE', (user['user_id'],))
    if not actor or not actor['is_active'] or project_id not in visible_project_ids(conn, actor, deleted=deleted):
        raise HTTPException(404, 'Không tìm thấy dự án')
    row = one(conn, '''SELECT p.*,u.full_name AS owner_name,pm.permission,
        c.company_name,c.owner_user_id AS company_owner_user_id,
        (SELECT count(*) FROM project_member m WHERE m.project_id=p.project_id
         AND (p.project_scope='TEAM' OR m.personal_access_granted)) AS member_count
        FROM project p JOIN app_user u ON u.user_id=p.owner_user_id
        LEFT JOIN company c ON c.company_id=p.company_id
        LEFT JOIN project_member pm ON pm.project_id=p.project_id AND pm.user_id=%s
            AND (p.project_scope='TEAM' OR pm.personal_access_granted)
        WHERE p.project_id=%s AND p.organization_id=%s''', (user['user_id'], project_id,user['organization_id']))
    if not row or (row['deleted_at'] and not deleted):
        raise HTTPException(404, 'Không tìm thấy dự án')
    admin = actor['user_role_code'] == 'ADMIN'
    company_owner = row['project_scope']=='TEAM' and actor['user_role_code']=='COMPANY_OWNER' and row['company_owner_user_id']==actor['user_id']
    owner = (row['project_scope']=='PERSONAL' and row['owner_user_id']==actor['user_id'] and actor['user_role_code'] in owner_roles('PERSONAL')) or company_owner
    permission = row['permission']
    if not (admin or owner or permission):
        raise HTTPException(404, 'Không tìm thấy dự án')
    row['can_manage'] = admin or owner
    row['can_invite'] = admin or (owner and row['project_scope']=='TEAM')
    row['can_edit'] = actor['user_role_code'] != 'VIEWER' and (admin or owner or permission == 'EDITOR')
    if (write and not row['can_edit']) or (manage and not row['can_manage']):
        raise HTTPException(403, 'Bạn không có quyền thay đổi nội dung này')
    if row['deleted_at'] and not row['can_manage']:
        raise HTTPException(404, 'Không tìm thấy dự án')
    return row


def resource(conn, user, table, id_column, resource_id, write=False, manage=False):
    allowed = {'media_file':'media_file_id','processing_job':'job_id','transcript':'transcript_id',
               'speaker':'speaker_id','minutes':'minutes_id','export_file':'export_file_id','ocr_document':'ocr_document_id',
               'upload_session':'upload_id'}
    if allowed.get(table) != id_column:
        raise ValueError('Unknown resource table')
    row = one(conn, f'SELECT * FROM {table} WHERE {id_column}=%s', (resource_id,))
    if not row:
        raise HTTPException(404, 'Không tìm thấy dữ liệu')
    project(conn,user,row['project_id'],write=write,manage=manage)
    return row


def pagination(page=1, page_size=20):
    page=max(1,page);page_size=min(100,max(1,page_size))
    return page_size,(page-1)*page_size

