from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import EmailStr, Field

from .api.auth import StrictBody
from .core.access import pagination
from .core.db import all_rows, audit, connection, one
from .core.security import current_user, management_actor, public_user, require_role

router = APIRouter(prefix='/companies')


def company(conn, user, company_id, manage=False):
    row = one(conn, '''SELECT c.*,u.full_name AS owner_name,u.email AS owner_email,
        (SELECT count(*) FROM app_user m WHERE m.company_id=c.company_id AND m.user_role_code IN ('MEMBER','VIEWER')) AS member_count,
        (SELECT count(*) FROM project p WHERE p.company_id=c.company_id AND p.deleted_at IS NULL) AS project_count
        FROM company c JOIN app_user u ON u.user_id=c.owner_user_id WHERE c.company_id=%s AND c.organization_id=%s''',
        (company_id, user['organization_id']))
    allowed = row and (user['user_role_code'] == 'ADMIN' or (
        user['user_role_code'] == 'COMPANY_OWNER' and row['owner_user_id'] == user['user_id']))
    if not allowed:
        raise HTTPException(404, 'Không tìm thấy công ty')
    return row


def lock_management(conn, user):
    # Company membership, owner and account-role mutations use one lock order.
    conn.execute('SELECT pg_advisory_xact_lock(72363412)')
    return management_actor(conn, user)


class CompanyName(StrictBody):
    company_name: str = Field(min_length=1, max_length=200)


class CompanyCreate(CompanyName):
    owner_user_id: UUID | None = None


class MemberBody(StrictBody):
    email: EmailStr


class ParticipationBody(StrictBody):
    company_projects_enabled: bool


class OwnerBody(StrictBody):
    owner_user_id: UUID


@router.get('')
def list_companies(q: str = '', page: int = 1, page_size: int = 20, user=Depends(current_user)):
    require_role(user, 'ADMIN', 'COMPANY_OWNER')
    limit, offset = pagination(page, page_size)
    where = 'organization_id=%s AND company_name ILIKE %s AND (%s OR owner_user_id=%s)'
    params = (user['organization_id'], '%' + q[:200] + '%', user['user_role_code'] == 'ADMIN', user['user_id'])
    with connection() as conn:
        rows = all_rows(conn, 'SELECT company_id FROM company WHERE ' + where + ' ORDER BY created_at DESC,company_id LIMIT %s OFFSET %s', (*params, limit, offset))
        return {'items': [company(conn, user, r['company_id']) for r in rows], 'total': one(conn, 'SELECT count(*) AS n FROM company WHERE ' + where, params)['n']}


@router.post('', status_code=201)
def create_company(body: CompanyCreate, user=Depends(current_user)):
    require_role(user, 'ADMIN', 'COMPANY_OWNER')
    with connection() as conn:
        actor = lock_management(conn, user)
        require_role(actor, 'ADMIN', 'COMPANY_OWNER')
        owner_id = body.owner_user_id or actor['user_id']
        if actor['user_role_code'] != 'ADMIN' and owner_id != actor['user_id']:
            raise HTTPException(403, 'Bạn chỉ được tạo công ty cho chính mình')
        owner = one(conn, 'SELECT * FROM app_user WHERE user_id=%s AND organization_id=%s FOR UPDATE', (owner_id, actor['organization_id']))
        if not owner or not owner['is_active'] or owner['user_role_code'] not in ('MEMBER', 'VIEWER', 'COMPANY_OWNER'):
            raise HTTPException(400, 'Chọn tài khoản đang hoạt động để làm chủ công ty; không chọn tài khoản admin')
        if actor['user_role_code'] != 'ADMIN' and owner['user_role_code'] != 'COMPANY_OWNER':
            raise HTTPException(403, 'Chỉ admin được chỉ định tài khoản thành chủ công ty')
        if owner['company_id'] or one(conn, 'SELECT 1 FROM company WHERE owner_user_id=%s', (owner_id,)):
            raise HTTPException(409, 'Chủ công ty đã thuộc một công ty')
        row = one(conn, '''INSERT INTO company(organization_id,company_name,owner_user_id)
            VALUES (%s,%s,%s) RETURNING company_id''', (actor['organization_id'], body.company_name, owner_id))
        conn.execute("UPDATE app_user SET company_id=%s,company_projects_enabled=true,user_role_code='COMPANY_OWNER' WHERE user_id=%s", (row['company_id'], owner_id))
        if owner['user_role_code'] != 'COMPANY_OWNER':
            conn.execute('UPDATE refresh_token SET revoked_at=GREATEST(now(),created_at) WHERE user_id=%s AND revoked_at IS NULL', (owner_id,))
            audit(conn, actor['user_id'], 'CHANGE_ROLE', 'user', owner_id,
                  {'role': 'COMPANY_OWNER'}, company_id=row['company_id'])
        audit(conn, actor['user_id'], 'CREATE_COMPANY', 'company', row['company_id'], company_id=row['company_id'])
        return company(conn, actor, row['company_id'])


@router.get('/{company_id}')
def detail(company_id: UUID, user=Depends(current_user)):
    with connection() as conn:
        return company(conn, user, company_id)


@router.patch('/{company_id}')
def rename(company_id: UUID, body: CompanyName, user=Depends(current_user)):
    with connection() as conn:
        actor = lock_management(conn, user)
        company(conn, actor, company_id, manage=True)
        conn.execute('UPDATE company SET company_name=%s WHERE company_id=%s', (body.company_name, company_id))
        audit(conn, actor['user_id'], 'RENAME_COMPANY', 'company', company_id, company_id=company_id)
        return company(conn, actor, company_id)


@router.get('/{company_id}/members')
def members(company_id: UUID, q: str = '', page: int = 1, page_size: int = 20, user=Depends(current_user)):
    limit, offset = pagination(page, page_size)
    with connection() as conn:
        company(conn, user, company_id)
        where = "company_id=%s AND user_role_code IN ('MEMBER','VIEWER') AND (email ILIKE %s OR full_name ILIKE %s)"
        params = (company_id, '%' + q[:200] + '%', '%' + q[:200] + '%')
        rows = all_rows(conn, 'SELECT * FROM app_user WHERE ' + where + ' ORDER BY full_name,user_id LIMIT %s OFFSET %s', (*params, limit, offset))
        return {'items': [public_user(row) for row in rows], 'total': one(conn, 'SELECT count(*) AS n FROM app_user WHERE ' + where, params)['n']}


@router.post('/{company_id}/members', status_code=201)
def add_member(company_id: UUID, body: MemberBody, user=Depends(current_user)):
    with connection() as conn:
        actor = lock_management(conn, user)
        company(conn, actor, company_id, manage=True)
        target = one(conn, 'SELECT * FROM app_user WHERE email=%s AND organization_id=%s FOR UPDATE', (str(body.email).lower(), actor['organization_id']))
        if not target or not target['is_active']:
            raise HTTPException(404, 'Email chưa có tài khoản đang hoạt động. Thành viên cần đăng ký trước khi được thêm vào công ty')
        if target['user_role_code'] != 'MEMBER':
            raise HTTPException(403, 'Chỉ được thêm tài khoản MEMBER')
        if target['company_id']:
            raise HTTPException(409, 'Thành viên đã thuộc một công ty')
        row = one(conn, 'UPDATE app_user SET company_id=%s,company_projects_enabled=true WHERE user_id=%s RETURNING *', (company_id, target['user_id']))
        audit(conn, actor['user_id'], 'JOIN_COMPANY', 'user', target['user_id'], company_id=company_id)
        return public_user(row, conn)


def member_target(conn, company_id, user_id):
    row = one(conn, 'SELECT * FROM app_user WHERE user_id=%s AND company_id=%s FOR UPDATE', (user_id, company_id))
    if not row:
        raise HTTPException(404, 'Không tìm thấy thành viên công ty')
    if row['user_role_code'] not in ('MEMBER', 'VIEWER'):
        raise HTTPException(403, 'Không được thay đổi tư cách của chủ công ty hoặc admin')
    return row


@router.patch('/{company_id}/members/{user_id}')
def participation(company_id: UUID, user_id: UUID, body: ParticipationBody, user=Depends(current_user)):
    with connection() as conn:
        actor = lock_management(conn, user)
        company(conn, actor, company_id, manage=True)
        member_target(conn, company_id, user_id)
        row = one(conn, 'UPDATE app_user SET company_projects_enabled=%s WHERE user_id=%s RETURNING *', (body.company_projects_enabled, user_id))
        audit(conn, actor['user_id'], 'COMPANY_PARTICIPATION', 'user', user_id, {'enabled': body.company_projects_enabled}, company_id=company_id)
        return public_user(row)


@router.delete('/{company_id}/members/{user_id}')
def remove_member(company_id: UUID, user_id: UUID, user=Depends(current_user)):
    with connection() as conn:
        actor = lock_management(conn, user)
        company(conn, actor, company_id, manage=True)
        member_target(conn, company_id, user_id)
        conn.execute('DELETE FROM project_member m USING project p WHERE m.project_id=p.project_id AND p.company_id=%s AND m.user_id=%s', (company_id, user_id))
        conn.execute('UPDATE app_user SET company_id=NULL,company_projects_enabled=true WHERE user_id=%s', (user_id,))
        audit(conn, actor['user_id'], 'LEAVE_COMPANY', 'user', user_id, company_id=company_id)
        return {'ok': True}


@router.patch('/{company_id}/owner')
def transfer_owner(company_id: UUID, body: OwnerBody, user=Depends(current_user)):
    require_role(user, 'ADMIN')
    with connection() as conn:
        actor = lock_management(conn, user)
        require_role(actor, 'ADMIN')
        row = company(conn, actor, company_id, manage=True)
        target = one(conn, 'SELECT * FROM app_user WHERE user_id=%s AND organization_id=%s FOR UPDATE', (body.owner_user_id, actor['organization_id']))
        if not target or not target['is_active'] or target['user_role_code'] != 'COMPANY_OWNER':
            raise HTTPException(400, 'Chủ mới phải là COMPANY_OWNER đang hoạt động')
        if target['company_id']:
            raise HTTPException(409, 'Chủ mới đã thuộc một công ty')
        conn.execute('UPDATE app_user SET company_id=%s,company_projects_enabled=true WHERE user_id=%s', (company_id, body.owner_user_id))
        conn.execute('UPDATE company SET owner_user_id=%s WHERE company_id=%s', (body.owner_user_id, company_id))
        conn.execute('UPDATE project SET owner_user_id=%s WHERE company_id=%s AND owner_user_id=%s', (body.owner_user_id, company_id, row['owner_user_id']))
        conn.execute('DELETE FROM project_member m USING project p WHERE m.project_id=p.project_id AND p.company_id=%s AND m.user_id=%s', (company_id, row['owner_user_id']))
        conn.execute('UPDATE app_user SET company_id=NULL WHERE user_id=%s', (row['owner_user_id'],))
        audit(conn, actor['user_id'], 'TRANSFER_COMPANY', 'company', company_id, {'owner_user_id': str(body.owner_user_id)}, company_id=company_id)
        return company(conn, actor, company_id)
