from uuid import UUID
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field
from .api.auth import StrictBody
from .core.db import connection, one, all_rows, audit
from .core.security import current_user, require_role, management_actor, owned_company_id
from .core.access import project, pagination, visible_project_ids
from .core.project_rules import ProjectScope, ProjectType, owner_roles, validate_source

router=APIRouter()


class ProjectBody(StrictBody):
    project_title: str=Field(min_length=1,max_length=300)
    project_description: str=Field(default='',max_length=10000)
    language_code: Literal['vi','en','auto']='vi'
    project_scope: ProjectScope|None=None
    project_type: ProjectType|None=None
    company_id: UUID|None=None


class ProjectPatch(StrictBody):
    project_title: str|None=Field(default=None,min_length=1,max_length=300)
    project_description: str|None=Field(default=None,max_length=10000)
    language_code: Literal['vi','en','auto']|None=None
    project_type: ProjectType|None=None


def project_list(conn,user,q='',status='',deleted=False,page=1,page_size=20,scope=None,project_type=None,owned=False,company_id=None):
    limit,offset=pagination(page,page_size)
    where='''p.organization_id=%s AND (p.deleted_at IS NOT NULL)=%s
        AND p.project_id=ANY(%s::uuid[])
        AND (%s='' OR p.project_title ILIKE %s) AND (%s='' OR p.project_status_code=%s)'''
    params=[user['organization_id'],deleted,visible_project_ids(conn,user,deleted=deleted),q,'%'+q+'%',status,status]
    if scope:
        where+=' AND p.project_scope=%s';params.append(scope)
    if project_type:
        where+=' AND p.project_type=%s';params.append(project_type)
    if owned:
        where+=' AND p.owner_user_id=%s';params.append(user['user_id'])
    if company_id:
        where+=' AND p.company_id=%s';params.append(company_id)
    rows=all_rows(conn,'''SELECT p.project_id,source.media_kind_code AS media_kind,
        COALESCE(j.progress_percent,0) AS progress_percent FROM project p
        LEFT JOIN LATERAL (SELECT media_kind_code FROM media_file WHERE project_id=p.project_id AND is_current LIMIT 1) source ON true
        LEFT JOIN LATERAL (SELECT progress_percent FROM processing_job WHERE project_id=p.project_id ORDER BY created_at DESC LIMIT 1) j ON true
        WHERE '''+where+' ORDER BY p.updated_at DESC LIMIT %s OFFSET %s',(*params,limit,offset))
    items=[]
    for row in rows:
        item=project(conn,user,row['project_id'],deleted=deleted)
        item.update(row);items.append(item)
    total=one(conn,'SELECT count(*) AS n FROM project p WHERE '+where,params)['n']
    return {'items':items,'total':total}


@router.get('/projects')
def list_projects(q:str='',status:str='',deleted:bool=False,page:int=1,page_size:int=20,
                  scope:ProjectScope|None=None,project_type:ProjectType|None=None,owned:bool=False,company_id:UUID|None=None,user=Depends(current_user)):
    with connection() as conn:
        return project_list(conn,user,q,status,deleted,page,page_size,scope,project_type,owned,company_id)


@router.post('/projects',status_code=201)
def create(body:ProjectBody,user=Depends(current_user)):
    with connection() as conn:
        return create_project(conn,user,body)


def lock_project_creation(conn):
    conn.execute('SELECT pg_advisory_xact_lock(72363412)')


def project_creation_values(conn,user,body,lock=False):
    scope=body.project_scope or ('TEAM' if user['user_role_code']=='COMPANY_OWNER' and user['company_id'] else 'PERSONAL')
    kind=body.project_type or ('VIDEO' if scope=='PERSONAL' else None)
    require_role(user,*owner_roles(scope))
    row_lock='FOR UPDATE' if lock else 'FOR SHARE'
    owner=one(conn,f'SELECT * FROM app_user WHERE user_id=%s {row_lock}',(user['user_id'],))
    if not owner or not owner['is_active']:raise HTTPException(403,'Tài khoản không còn hoạt động')
    require_role(owner,*owner_roles(scope))
    company_id=None
    if scope=='PERSONAL' and body.company_id is not None:raise HTTPException(422,'Dự án cá nhân không thuộc công ty')
    if scope=='TEAM':
        from .companies import company
        company_id=body.company_id or owner['company_id']
        if not company_id:raise HTTPException(422,'Hãy chọn công ty cho dự án')
        company(conn,owner,company_id,manage=True)
    return owner,scope,kind,company_id


def create_project(conn,user,body):
    lock_project_creation(conn)
    owner,scope,kind,company_id=project_creation_values(conn,user,body,lock=True)
    row=one(conn,'''INSERT INTO project(organization_id,owner_user_id,project_title,project_description,language_code,project_scope,project_type,company_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING project_id''',
        (owner['organization_id'],owner['user_id'],body.project_title,body.project_description,body.language_code,scope,kind,company_id))
    audit(conn,user['user_id'],'CREATE','project',row['project_id'])
    return project(conn,user,row['project_id'])


@router.get('/projects/{project_id}')
def get_project(project_id:UUID,user=Depends(current_user)):
    with connection() as conn:return project(conn,user,project_id)


@router.patch('/projects/{project_id}')
def update(project_id:UUID,body:ProjectPatch,user=Depends(current_user)):
    with connection() as conn:
        return update_project(conn,user,project_id,body)


def lock_project(conn,project_id):
    conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(project_id,))


def active_project_job(conn,project_id):
    return one(conn,"SELECT 1 FROM processing_job WHERE project_id=%s AND job_status_code IN ('QUEUED','RUNNING')",(project_id,))


def update_project(conn,user,project_id,body):
    lock_project(conn,project_id)
    p=project(conn,user,project_id,manage=True)
    values=body.model_dump(exclude_none=True)
    if 'project_type' in values and body.project_type!=p['project_type']:
        if active_project_job(conn,project_id):
            raise HTTPException(409,'Hãy đợi hoặc hủy tác vụ trước khi đổi loại dự án')
        for source in all_rows(conn,"SELECT media_kind_code FROM media_file WHERE project_id=%s AND media_kind_code LIKE 'ORIGINAL_%%'",(project_id,)):
            validate_source(body.project_type,source['media_kind_code'])
    if values:
        conn.execute('UPDATE project SET '+','.join(k+'=%s' for k in values)+' WHERE project_id=%s',(*values.values(),project_id))
    audit(conn,user['user_id'],'UPDATE','project',project_id)
    return project(conn,user,project_id)


@router.delete('/projects/{project_id}')
def delete(project_id:UUID,user=Depends(current_user)):
    with connection() as conn:
        return soft_delete_project(conn,user,project_id)


def check_project_deletion(conn,project_id):
    if active_project_job(conn,project_id):
        raise HTTPException(409,'Hãy hủy tác vụ đang chạy trước khi xóa dự án')


def soft_delete_project(conn,user,project_id):
    lock_project(conn,project_id)
    project(conn,user,project_id,manage=True)
    check_project_deletion(conn,project_id)
    conn.execute('UPDATE project SET deleted_at=now() WHERE project_id=%s',(project_id,))
    audit(conn,user['user_id'],'DELETE','project',project_id)
    return {'ok':True}


@router.post('/projects/{project_id}/restore')
def restore(project_id:UUID,user=Depends(current_user)):
    with connection() as conn:
        return restore_project(conn,user,project_id)


def check_project_restoration(conn,p):
    owner=one(conn,'SELECT * FROM app_user WHERE user_id=%s FOR SHARE',(p['owner_user_id'],))
    if not owner or not owner['is_active'] or owner['user_role_code'] not in owner_roles(p['project_scope']):
        raise HTTPException(409,'Hãy chuyển chủ dự án sang quản lý/admin hoạt động trước khi khôi phục')


def restore_project(conn,user,project_id):
    lock_project(conn,project_id)
    p=project(conn,user,project_id,manage=True,deleted=True)
    check_project_restoration(conn,p)
    conn.execute('UPDATE project SET deleted_at=NULL WHERE project_id=%s',(project_id,))
    audit(conn,user['user_id'],'RESTORE','project',project_id)
    return project(conn,user,project_id)


class MemberBody(StrictBody):
    email:str=Field(min_length=3,max_length=254)
    permission:Literal['EDITOR','VIEWER']='EDITOR'


@router.get('/projects/{project_id}/members')
def members(project_id:UUID,user=Depends(current_user)):
    with connection() as conn:
        p=project(conn,user,project_id)
        rows=all_rows(conn,'''SELECT u.user_id,u.email,u.full_name,u.is_active,u.user_role_code,m.permission FROM project_member m
            JOIN app_user u ON u.user_id=m.user_id WHERE m.project_id=%s
            AND (%s='TEAM' OR m.personal_access_granted) ORDER BY u.full_name''',(project_id,p['project_scope']))
        return {'items':rows,'total':len(rows)}


@router.post('/projects/{project_id}/members',status_code=201)
def add_member(project_id:UUID,body:MemberBody,user=Depends(current_user)):
    with connection() as conn:
        conn.execute('SELECT pg_advisory_xact_lock(72363412)')
        actor=management_actor(conn,user)
        p=project(conn,actor,project_id,manage=True)
        if not p['can_invite']:raise HTTPException(403,'Chỉ ADMIN được quản lý chia sẻ dự án cá nhân')
        target=one(conn,'SELECT * FROM app_user WHERE email=%s AND organization_id=%s AND is_active FOR SHARE',
                   (body.email.strip().lower(),p['organization_id']))
        if not target:raise HTTPException(404,'Email chưa đăng ký hoặc tài khoản đã bị khóa')
        if p['project_scope']=='TEAM' and (target['company_id']!=p['company_id'] or not target['company_projects_enabled']):
            raise HTTPException(403,'Thành viên phải thuộc công ty và được phép tham gia dự án')
        # Lock users before the project, matching ownership transfers and avoiding lock cycles.
        conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(project_id,))
        p=project(conn,actor,project_id,manage=True)
        if target['user_id']==p['owner_user_id']:raise HTTPException(400,'Chủ dự án đã có toàn quyền quản lý')
        conn.execute('''INSERT INTO project_member(project_id,user_id,permission,added_by_user_id,personal_access_granted) VALUES (%s,%s,%s,%s,%s)
            ON CONFLICT(project_id,user_id) DO UPDATE SET permission=EXCLUDED.permission,
            added_by_user_id=EXCLUDED.added_by_user_id,personal_access_granted=EXCLUDED.personal_access_granted''',
            (project_id,target['user_id'],body.permission,actor['user_id'],p['project_scope']=='PERSONAL'))
        conn.execute("INSERT INTO notification(user_id,project_id,title,body) VALUES (%s,%s,'Bạn được thêm vào dự án','Mở dự án để bắt đầu làm việc')",(target['user_id'],project_id))
        audit(conn,user['user_id'],'ADD_MEMBER','project',project_id,{'member_id':str(target['user_id']),'permission':body.permission})
        return {'user_id':target['user_id'],'email':target['email'],'full_name':target['full_name'],'permission':body.permission}


@router.delete('/projects/{project_id}/members/{user_id}')
def remove_member(project_id:UUID,user_id:UUID,user=Depends(current_user)):
    with connection() as conn:
        conn.execute('SELECT pg_advisory_xact_lock(72363412)')
        actor=management_actor(conn,user)
        conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(project_id,))
        p=project(conn,actor,project_id,manage=True)
        if not p['can_invite']:raise HTTPException(403,'Chỉ ADMIN được quản lý chia sẻ dự án cá nhân')
        if user_id==p['owner_user_id']:raise HTTPException(400,'Không thể gỡ chủ dự án')
        conn.execute('DELETE FROM project_member WHERE project_id=%s AND user_id=%s',(project_id,user_id))
        audit(conn,user['user_id'],'REMOVE_MEMBER','project',project_id,{'member_id':str(user_id)})
    return {'ok':True}


class OwnerBody(StrictBody):
    user_id:UUID


@router.patch('/projects/{project_id}/owner')
def owner(project_id:UUID,body:OwnerBody,user=Depends(current_user)):
    require_role(user,'ADMIN')
    with connection() as conn:
        conn.execute('SELECT pg_advisory_xact_lock(72363412)')
        actor=management_actor(conn,user)
        require_role(actor,'ADMIN')
        p=project(conn,user,project_id,manage=True,deleted=True)
        target=one(conn,'SELECT * FROM app_user WHERE user_id=%s FOR UPDATE',(body.user_id,))
        if not target or not target['is_active'] or target['user_role_code'] not in owner_roles(p['project_scope']):
            raise HTTPException(400,'Chủ dự án mới phải là quản lý hoặc admin đang hoạt động')
        if p['project_scope']=='TEAM' and target['user_role_code']!='ADMIN':
            if not one(conn,'SELECT 1 FROM company WHERE company_id=%s AND owner_user_id=%s',(p['company_id'],target['user_id'])):
                raise HTTPException(400,'Chủ dự án mới phải là chủ của công ty này hoặc admin')
        conn.execute('UPDATE project SET owner_user_id=%s WHERE project_id=%s',(body.user_id,project_id))
        audit(conn,user['user_id'],'TRANSFER_OWNER','project',project_id,{'owner_id':str(body.user_id)})
        return project(conn,user,project_id,deleted=True)


def audit_actor(conn,user):
    actor=one(conn,'SELECT * FROM app_user WHERE user_id=%s AND organization_id=%s FOR SHARE',
              (user['user_id'],user['organization_id']))
    if not actor or not actor['is_active']:raise HTTPException(403,'Tài khoản không còn hoạt động')
    return actor


def audit_source(conn,user,q='',entity='',action=''):
    company_id=owned_company_id(conn,user)
    is_admin=user['user_role_code']=='ADMIN'
    source=''' FROM (SELECT a.*,u.full_name,
        (%s OR a.user_id=%s OR COALESCE(a.company_id=%s,false)) AS can_delete
        FROM audit_log a JOIN app_user u ON u.user_id=a.user_id
        WHERE u.organization_id=%s AND (%s OR (a.entity_name<>'project' AND a.user_id=%s)
        OR (a.entity_name='project' AND a.entity_id=ANY(%s::text[])) OR a.company_id=%s)) scoped
        WHERE (full_name ILIKE %s OR action_name ILIKE %s OR entity_id ILIKE %s OR entity_name ILIKE %s)'''
    params=[is_admin,user['user_id'],company_id,user['organization_id'],is_admin,user['user_id'],
            [str(pid) for pid in visible_project_ids(conn,user)],company_id,*(['%'+q[:200]+'%']*4)]
    if entity:
        source+=' AND entity_name=%s';params.append(entity[:100])
    if action:
        source+=' AND action_name=%s';params.append(action[:50])
    return source,params


def audit_page(conn,user,q='',entity='',action='',page=1,page_size=20):
    limit,offset=pagination(page,page_size)
    source,params=audit_source(conn,user,q,entity,action)
    totals=one(conn,'SELECT count(*) AS total,count(*) FILTER(WHERE can_delete) AS deletable_total'+source,params)
    rows=all_rows(conn,'SELECT *'+source+' ORDER BY occurred_at DESC,audit_log_id DESC LIMIT %s OFFSET %s',(*params,limit,offset))
    return {'items':rows,**totals}


def activities(conn,user,limit=20):
    return audit_page(conn,audit_actor(conn,user),page_size=limit)['items']


@router.get('/audit-logs')
def logs(q:str='',entity:str='',action:str='',page:int=1,page_size:int=20,user=Depends(current_user)):
    with connection() as conn:
        return audit_page(conn,audit_actor(conn,user),q,entity,action,page,page_size)


@router.delete('/audit-logs/{audit_log_id}')
def delete_audit_log(audit_log_id:int,user=Depends(current_user)):
    with connection() as conn:
        # Use the same lock order as company ownership and account-role changes.
        conn.execute('SELECT pg_advisory_xact_lock(72363412)')
        actor=audit_actor(conn,user)
        source,params=audit_source(conn,actor)
        result=conn.execute('DELETE FROM audit_log WHERE audit_log_id IN (SELECT audit_log_id'+source+
                            ' AND can_delete AND audit_log_id=%s)',(*params,audit_log_id))
        if not result.rowcount:raise HTTPException(404,'Không tìm thấy hoạt động')
    return {'ok':True}


@router.delete('/audit-logs')
def clear_audit_logs(q:str='',entity:str='',action:str='',user=Depends(current_user)):
    with connection() as conn:
        conn.execute('SELECT pg_advisory_xact_lock(72363412)')
        actor=audit_actor(conn,user)
        source,params=audit_source(conn,actor,q,entity,action)
        result=conn.execute('DELETE FROM audit_log WHERE audit_log_id IN (SELECT audit_log_id'+source+' AND can_delete)',params)
        return {'ok':True,'deleted':result.rowcount}


@router.get('/projects/{project_id}/activities')
def project_activities(project_id:UUID,user=Depends(current_user)):
    with connection() as conn:
        project(conn,user,project_id)
        rows=all_rows(conn,'''SELECT a.*,u.full_name FROM audit_log a
            LEFT JOIN app_user u ON u.user_id=a.user_id
            WHERE a.entity_name='project' AND a.entity_id=%s
            ORDER BY a.occurred_at DESC,a.audit_log_id DESC LIMIT 100''',(str(project_id),))
        return {'items':rows,'total':len(rows)}


@router.get('/dashboard')
def dashboard(user=Depends(current_user)):
    with connection() as conn:
        data=project_list(conn,user,page_size=5)
        ids=visible_project_ids(conn,user)
        stats=one(conn,'''SELECT count(*) AS projects,count(*) FILTER(WHERE p.project_status_code='READY') AS ready,
            count(*) FILTER(WHERE p.project_status_code='PROCESSING') AS processing FROM project p
            WHERE p.deleted_at IS NULL AND p.project_id=ANY(%s::uuid[])''',(ids,))
        media=one(conn,'''SELECT COALESCE(sum(m.duration_ms),0) AS duration_ms,COALESCE(sum(m.file_size_bytes),0) AS storage_bytes
            FROM media_file m JOIN project p ON p.project_id=m.project_id WHERE p.deleted_at IS NULL AND m.media_kind_code LIKE 'ORIGINAL_%%'
            AND p.project_id=ANY(%s::uuid[])''',(ids,))
        stats.update(media)
        return {'stats':stats,'projects':data['items'],'activities':activities(conn,user,8)}
