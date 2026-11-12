from uuid import UUID
from typing import Literal
from fastapi import APIRouter,Depends,HTTPException
from pydantic import Field,field_validator
from .auth import StrictBody,RegisterBody
from ..core.db import connection,one,all_rows,audit
from ..core.security import current_user,require_role,public_user,hash_password,management_actor,owned_company_id
from ..core.access import pagination,visible_project_ids

router=APIRouter()
Role=Literal['ADMIN','COMPANY_OWNER','MEMBER','VIEWER']


@router.get('/users/lookup')
def lookup(q:str='',company_id:UUID|None=None,user=Depends(current_user)):
    require_role(user,'ADMIN','COMPANY_OWNER')
    with connection() as conn:
        if user['user_role_code']=='COMPANY_OWNER':company_id=owned_company_id(conn,user)
        rows=all_rows(conn,'''SELECT user_id,email,full_name FROM app_user WHERE organization_id=%s AND is_active
            AND (%s OR (company_id=%s AND company_projects_enabled)) AND
            (email ILIKE %s OR full_name ILIKE %s) ORDER BY full_name LIMIT 20''',
            (user['organization_id'],user['user_role_code']=='ADMIN' and company_id is None,company_id,'%'+q[:200]+'%','%'+q[:200]+'%'))
        return {'items':rows,'total':len(rows)}


@router.get('/users')
def users(q:str='',page:int=1,page_size:int=20,role:Role|None=None,active:bool|None=None,company_id:UUID|None=None,available_company_owner:bool=False,user=Depends(current_user)):
    require_role(user,'ADMIN','COMPANY_OWNER');limit,offset=pagination(page,page_size)
    with connection() as conn:
        where='organization_id=%s AND (email ILIKE %s OR full_name ILIKE %s)'
        params=[user['organization_id'],'%'+q[:200]+'%','%'+q[:200]+'%']
        if user['user_role_code']=='COMPANY_OWNER':
            where+=" AND company_id=%s AND user_role_code IN ('MEMBER','VIEWER')";params.append(owned_company_id(conn,user))
        elif company_id is not None:
            where+=' AND company_id=%s';params.append(company_id)
        if role is not None:
            where+=' AND user_role_code=%s';params.append(role)
        if active is not None:
            where+=' AND is_active=%s';params.append(active)
        if available_company_owner:
            where+=" AND user_role_code='COMPANY_OWNER' AND is_active AND company_id IS NULL"
        rows=all_rows(conn,'SELECT *, (SELECT company_name FROM company c WHERE c.company_id=app_user.company_id) AS company_name FROM app_user WHERE '+where+' ORDER BY created_at DESC,user_id LIMIT %s OFFSET %s',(*params,limit,offset))
        return {'items':[public_user(u) for u in rows],'total':one(conn,'SELECT count(*) AS n FROM app_user WHERE '+where,params)['n']}


class CreateUser(RegisterBody):
    role:Role='MEMBER'


@router.post('/users',status_code=201)
def create_user(body:CreateUser,user=Depends(current_user)):
    require_role(user,'ADMIN')
    from psycopg.errors import UniqueViolation
    try:
        with connection() as conn:
            actor=management_actor(conn,user)
            require_role(actor,'ADMIN')
            target=one(conn,'''INSERT INTO app_user(organization_id,email,full_name,password_hash,user_role_code)
                VALUES (%s,%s,%s,%s,%s) RETURNING *''',(user['organization_id'],str(body.email).lower(),body.full_name,hash_password(body.password),body.role))
            audit(conn,user['user_id'],'CREATE_USER','user',target['user_id'],{'role':body.role})
            return public_user(target)
    except UniqueViolation:raise HTTPException(409,'Email đã được đăng ký') from None


class RoleBody(StrictBody):role:Role
class StatusBody(StrictBody):is_active:bool


def guard_admin(conn,user,target_id,new_role=None,active=None):
    # Serialize admin/role mutations and ownership checks without a count race.
    conn.execute('SELECT pg_advisory_xact_lock(72363412)')
    actor=management_actor(conn,user)
    require_role(actor,'ADMIN')
    target=one(conn,'SELECT * FROM app_user WHERE user_id=%s AND organization_id=%s FOR UPDATE',(target_id,user['organization_id']))
    if not target:raise HTTPException(404,'Không tìm thấy tài khoản')
    if (active is False or (new_role is not None and new_role!='COMPANY_OWNER')) and one(conn,'SELECT 1 FROM company WHERE owner_user_id=%s',(target_id,)):
        raise HTTPException(409,'Hãy chuyển chủ công ty trước khi hạ quyền hoặc khóa tài khoản')
    removing=active is False or (new_role is not None and new_role!='ADMIN')
    if target['user_role_code']=='ADMIN' and target['is_active'] and removing:
        if one(conn,"SELECT count(*) AS n FROM app_user WHERE user_role_code='ADMIN' AND is_active")['n']<=1:
            raise HTTPException(409,'Không thể khóa hoặc hạ quyền admin hoạt động cuối cùng')
    if new_role in ('MEMBER','VIEWER') or active is False:
        team_only=new_role=='MEMBER' and active is not False
        if one(conn,"SELECT 1 FROM project WHERE owner_user_id=%s AND deleted_at IS NULL AND (%s=false OR project_scope='TEAM') LIMIT 1",(target_id,team_only)):
            raise HTTPException(409,'Hãy chuyển chủ các dự án đang sở hữu trước khi hạ quyền hoặc khóa tài khoản')
    return target


@router.patch('/users/{user_id}/role')
def role(user_id:UUID,body:RoleBody,user=Depends(current_user)):
    require_role(user,'ADMIN')
    with connection() as conn:
        guard_admin(conn,user,user_id,new_role=body.role)
        row=one(conn,'UPDATE app_user SET user_role_code=%s WHERE user_id=%s RETURNING *',(body.role,user_id))
        conn.execute('UPDATE refresh_token SET revoked_at=GREATEST(now(),created_at) WHERE user_id=%s AND revoked_at IS NULL',(user_id,))
        audit(conn,user['user_id'],'CHANGE_ROLE','user',user_id,{'role':body.role})
        return public_user(row)


@router.patch('/users/{user_id}/status')
def status(user_id:UUID,body:StatusBody,user=Depends(current_user)):
    require_role(user,'ADMIN')
    with connection() as conn:
        guard_admin(conn,user,user_id,active=body.is_active)
        row=one(conn,'UPDATE app_user SET is_active=%s WHERE user_id=%s RETURNING *',(body.is_active,user_id))
        if not body.is_active:conn.execute('UPDATE refresh_token SET revoked_at=GREATEST(now(),created_at) WHERE user_id=%s AND revoked_at IS NULL',(user_id,))
        audit(conn,user['user_id'],'CHANGE_STATUS','user',user_id,{'is_active':body.is_active})
        return public_user(row)


@router.get('/users/{user_id}')
def user_detail(user_id:UUID,user=Depends(current_user)):
    require_role(user,'ADMIN')
    with connection() as conn:
        target=one(conn,'SELECT * FROM app_user WHERE user_id=%s',(user_id,))
        if not target:raise HTTPException(404,'Không tìm thấy tài khoản')
        return public_user(target)


@router.get('/organizations/current')
def organization(user=Depends(current_user)):
    with connection() as conn:return one(conn,'SELECT organization_id,organization_name FROM organization WHERE organization_id=%s',(user['organization_id'],))


class OrganizationBody(StrictBody):organization_name:str=Field(min_length=1,max_length=200)


@router.patch('/organizations/current')
def update_org(body:OrganizationBody,user=Depends(current_user)):
    require_role(user,'ADMIN')
    with connection() as conn:
        conn.execute('SELECT pg_advisory_xact_lock(72363412)')
        actor=management_actor(conn,user)
        require_role(actor,'ADMIN')
        row=one(conn,'UPDATE organization SET organization_name=%s WHERE organization_id=%s RETURNING organization_id,organization_name',(body.organization_name,actor['organization_id']))
        audit(conn,actor['user_id'],'UPDATE','organization',actor['organization_id'])
        return row


@router.get('/system/stats')
def stats(user=Depends(current_user)):
    require_role(user,'ADMIN')
    with connection() as conn:
        result=one(conn,'SELECT count(*) AS users,count(*) FILTER(WHERE is_active) AS active_users FROM app_user')
        result.update(one(conn,"SELECT count(*) AS projects,count(*) FILTER(WHERE project_status_code='READY') AS ready,count(*) FILTER(WHERE project_status_code='PROCESSING') AS processing FROM project WHERE deleted_at IS NULL"))
        result.update(one(conn,'SELECT COALESCE(sum(file_size_bytes),0) AS storage_bytes FROM media_file'))
        return result


@router.get('/management/stats')
def management_stats(user=Depends(current_user)):
    require_role(user,'ADMIN','COMPANY_OWNER')
    if user['user_role_code']=='ADMIN':return stats(user)
    with connection() as conn:
        company_id=owned_company_id(conn,user)
        result=one(conn,"""SELECT count(*) AS users,count(*) FILTER(WHERE is_active) AS active_users
            FROM app_user WHERE company_id=%s AND user_role_code IN ('MEMBER','VIEWER')""",(company_id,))
        result.update(one(conn,"""SELECT count(*) AS projects FROM project
            WHERE company_id=%s AND project_scope='TEAM' AND deleted_at IS NULL""",
            (company_id,)))
        result.update(one(conn,"""SELECT COALESCE(sum(m.file_size_bytes),0) AS storage_bytes FROM media_file m
            JOIN project p ON p.project_id=m.project_id WHERE p.company_id=%s
            AND p.project_scope='TEAM' AND p.deleted_at IS NULL""",(company_id,)))
        return result


@router.get('/notifications')
def notifications(user=Depends(current_user)):
    with connection() as conn:
        rows=all_rows(conn,'''SELECT n.* FROM notification n
            WHERE n.user_id=%s AND (n.project_id IS NULL OR n.project_id=ANY(%s::uuid[]))
            ORDER BY n.created_at DESC LIMIT 100''',(user['user_id'],visible_project_ids(conn,user)))
        return {'items':rows,'total':len(rows)}


class NotificationBody(StrictBody):is_read:bool=True


@router.patch('/notifications/{notification_id}')
def read_notification(notification_id:UUID,body:NotificationBody,user=Depends(current_user)):
    with connection() as conn:
        row=one(conn,'UPDATE notification SET is_read=%s WHERE notification_id=%s AND user_id=%s RETURNING notification_id',(body.is_read,notification_id,user['user_id']))
        if not row:raise HTTPException(404,'Không tìm thấy thông báo')
    return {'ok':True}
