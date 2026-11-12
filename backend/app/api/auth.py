import re
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from ..core import config
from ..core.db import connection, one, audit
from ..core.security import current_user, hash_password, verify_password, issue_session, public_user, token_hash

router = APIRouter()


class StrictBody(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


def valid_password(value):
    if len(value) < 10 or len(value) > 128 or not re.search(r'[A-Za-z]', value) or not re.search(r'\d', value):
        raise ValueError('Mật khẩu cần 10–128 ký tự, gồm chữ và số')
    return value


class RegisterBody(StrictBody):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=200)
    password: str
    _password = field_validator('password')(valid_password)


class LoginBody(StrictBody):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


def check_origin(request: Request):
    origin = request.headers.get('origin')
    if origin and origin not in config.ALLOWED_ORIGINS:
        raise HTTPException(403, 'Nguồn yêu cầu không hợp lệ')
    if request.headers.get('sec-fetch-site') == 'cross-site':
        raise HTTPException(403, 'Yêu cầu xác thực khác trang không được phép')


def set_refresh(response, token):
    response.set_cookie('refresh_token', token, max_age=7*86400, httponly=True,
                        secure=config.COOKIE_SECURE, samesite='lax', path='/api/auth')


@router.post('/auth/register', status_code=201)
def register(body: RegisterBody):
    from psycopg.errors import UniqueViolation
    try:
        with connection() as conn:
            user = one(conn, '''INSERT INTO app_user(organization_id,email,full_name,password_hash,user_role_code)
                VALUES (%s,%s,%s,%s,'MEMBER') RETURNING *''',
                (config.ORGANIZATION_ID, str(body.email).lower(), body.full_name, hash_password(body.password)))
            audit(conn, user['user_id'], 'REGISTER', 'user', user['user_id'])
            return public_user(user)
    except UniqueViolation:
        raise HTTPException(409, 'Email đã được đăng ký') from None


@router.post('/auth/login')
def login(body: LoginBody, response: Response, request: Request):
    check_origin(request)
    with connection() as conn:
        user = one(conn, 'SELECT * FROM app_user WHERE email=%s FOR UPDATE', (str(body.email).lower(),))
        # Constant-cost verification also for an unknown email.
        password_hash = user['password_hash'] if user else hash_password('dummy-password-123')
        if not verify_password(body.password, password_hash) or not user or not user['is_active']:
            raise HTTPException(401, 'Email hoặc mật khẩu không đúng, hoặc tài khoản đã khóa')
        result, refresh = issue_session(conn, user)
        audit(conn, user['user_id'], 'LOGIN', 'user', user['user_id'])
        set_refresh(response, refresh)
        return result


@router.post('/auth/refresh')
def refresh(request: Request, response: Response):
    check_origin(request)
    raw = request.cookies.get('refresh_token', '')
    with connection() as conn:
        candidate=one(conn,'SELECT user_id FROM refresh_token WHERE token_hash=%s',(token_hash(raw),))
        if not candidate:raise HTTPException(401,'Phiên đăng nhập đã hết hạn')
        # All issuance and revocation locks the account before touching any token row.
        user=one(conn,'SELECT * FROM app_user WHERE user_id=%s FOR UPDATE',(candidate['user_id'],))
        row = one(conn, '''SELECT * FROM refresh_token
            WHERE token_hash=%s AND revoked_at IS NULL AND expires_at>now() FOR UPDATE''', (token_hash(raw),))
        if not row or not user or not user['is_active']:
            raise HTTPException(401, 'Phiên đăng nhập đã hết hạn')
        conn.execute('UPDATE refresh_token SET revoked_at=GREATEST(now(),created_at) WHERE refresh_token_id=%s', (row['refresh_token_id'],))
        result, replacement = issue_session(conn, user,row['session_family_id'])
        set_refresh(response, replacement)
        return result


@router.post('/auth/logout')
def logout(request: Request, response: Response, user=Depends(current_user)):
    check_origin(request)
    with connection() as conn:
        conn.execute('SELECT user_id FROM app_user WHERE user_id=%s FOR UPDATE',(user['user_id'],))
        conn.execute('''UPDATE refresh_token SET revoked_at=GREATEST(now(),created_at) WHERE session_family_id=(
            SELECT session_family_id FROM refresh_token WHERE refresh_token_id=%s AND user_id=%s) AND revoked_at IS NULL''', (user['session_id'],user['user_id']))
    response.delete_cookie('refresh_token', path='/api/auth', secure=config.COOKIE_SECURE, httponly=True, samesite='lax')
    return {'ok': True}


@router.get('/auth/me')
def me(user=Depends(current_user)):
    return public_user(user)


class ProfileBody(StrictBody):
    full_name: str = Field(min_length=1, max_length=200)


@router.patch('/users/me')
def profile(body: ProfileBody, user=Depends(current_user)):
    with connection() as conn:
        return public_user(one(conn, 'UPDATE app_user SET full_name=%s WHERE user_id=%s RETURNING *', (body.full_name, user['user_id'])), conn)


class PasswordBody(StrictBody):
    current_password: str = Field(max_length=128)
    new_password: str
    _password = field_validator('new_password')(valid_password)


@router.patch('/users/me/password')
def password(body: PasswordBody, user=Depends(current_user)):
    with connection() as conn:
        fresh=one(conn,'SELECT * FROM app_user WHERE user_id=%s FOR UPDATE',(user['user_id'],))
        if not fresh or not fresh['is_active'] or not verify_password(body.current_password,fresh['password_hash']):
            raise HTTPException(400, 'Mật khẩu hiện tại không đúng')
        conn.execute('UPDATE app_user SET password_hash=%s WHERE user_id=%s', (hash_password(body.new_password), user['user_id']))
        conn.execute('UPDATE refresh_token SET revoked_at=GREATEST(now(),created_at) WHERE user_id=%s AND revoked_at IS NULL', (user['user_id'],))
        audit(conn, user['user_id'], 'PASSWORD_CHANGE', 'user', user['user_id'])
    return {'ok': True}
