import hashlib
import secrets
from datetime import datetime, timedelta, timezone
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import Header, HTTPException
from . import config
from .db import connection, one

hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def encode_access(user_id: str, session_id: str, lifetime: int = config.ACCESS_SECONDS) -> str:
    if len(config.JWT_SECRET) < 32:
        raise RuntimeError('JWT_SECRET phải có ít nhất 32 ký tự. Hãy cấu hình .env.')
    now = datetime.now(timezone.utc)
    return jwt.encode({'sub': str(user_id), 'sid': str(session_id), 'iat': now,
                       'exp': now + timedelta(seconds=lifetime), 'iss': 'thanh-am', 'aud': 'thanh-am-web'},
                      config.JWT_SECRET, algorithm='HS256')


def decode_access(token: str, audience: str = 'thanh-am-web') -> dict:
    payload = jwt.decode(token, config.JWT_SECRET, algorithms=['HS256'], issuer='thanh-am', audience=audience,
                         options={'require': ['sub', 'sid', 'exp', 'iat'], 'verify_iat': False})
    try:
        issued_at = int(payload['iat'])
    except (TypeError, ValueError, OverflowError):
        raise jwt.InvalidIssuedAtError('Invalid issued-at claim') from None
    # Docker/host clock correction can move backwards; expiry and nbf remain strict.
    if issued_at > datetime.now(timezone.utc).timestamp() + 5:
        raise jwt.ImmatureSignatureError('Issued-at claim is in the future')
    return payload


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def public_user(user, conn=None):
    result = {k: user[k] for k in ('user_id', 'email', 'full_name', 'user_role_code', 'is_active', 'created_at', 'company_id', 'company_projects_enabled')}
    company = one(conn, 'SELECT company_name FROM company WHERE company_id=%s', (user['company_id'],)) if conn and user['company_id'] else None
    result['company_name'] = company['company_name'] if company else user.get('company_name')
    return result


def issue_session(conn, user, family_id=None):
    raw = secrets.token_urlsafe(48)
    from uuid import uuid4
    row = one(conn, '''INSERT INTO refresh_token(user_id,token_hash,expires_at,session_family_id)
        VALUES (%s,%s,now()+interval '7 days',%s) RETURNING refresh_token_id''', (user['user_id'], token_hash(raw),family_id or uuid4()))
    return {'access_token': encode_access(str(user['user_id']), str(row['refresh_token_id'])), 'user': public_user(user, conn)}, raw


def current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(401, 'Vui lòng đăng nhập')
    try:
        payload = decode_access(authorization[7:])
        return session_user(payload)
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn') from None


def session_user(payload):
    from uuid import UUID
    user_id, session_id = UUID(payload['sub']), UUID(payload['sid'])
    with connection() as conn:
        user = one(conn, '''SELECT u.*,c.company_name FROM app_user u LEFT JOIN company c ON c.company_id=u.company_id JOIN refresh_token r ON r.user_id=u.user_id
            WHERE u.user_id=%s AND r.refresh_token_id=%s AND u.is_active
            AND r.revoked_at IS NULL AND r.expires_at>now()''', (user_id, session_id))
    if not user:
        raise HTTPException(401, 'Phiên đăng nhập đã bị thu hồi')
    user['session_id'] = payload['sid']
    return user


def encode_playback(user, media_id):
    now = datetime.now(timezone.utc)
    return jwt.encode({'sub': str(user['user_id']), 'sid': str(user['session_id']), 'mid': str(media_id),
                       'iat': now, 'exp': now + timedelta(seconds=300),
                       'iss': 'thanh-am', 'aud': 'thanh-am-playback'}, config.JWT_SECRET, algorithm='HS256')


def playback_user(token, media_id):
    try:
        payload = decode_access(token, audience='thanh-am-playback')
        if payload.get('mid') != str(media_id):
            raise jwt.InvalidTokenError('Wrong media')
        from uuid import UUID
        user_id, session_id = UUID(payload['sub']), UUID(payload['sid'])
        with connection() as conn:
            # Refresh rotates rows; playback stays valid until the session family ends.
            user = one(conn, '''SELECT u.*,c.company_name FROM app_user u
                LEFT JOIN company c ON c.company_id=u.company_id
                JOIN refresh_token issued ON issued.user_id=u.user_id
                WHERE u.user_id=%s AND issued.refresh_token_id=%s AND u.is_active
                AND EXISTS (SELECT 1 FROM refresh_token live
                    WHERE live.user_id=u.user_id AND live.session_family_id=issued.session_family_id
                    AND live.revoked_at IS NULL AND live.expires_at>now())''', (user_id, session_id))
        if not user:
            raise HTTPException(401, 'Phiên đăng nhập đã bị thu hồi')
        user['session_id'] = payload['sid']
        return user
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(401, 'Phiên phát không hợp lệ hoặc đã hết hạn') from None


def require_role(user, *roles):
    if user['user_role_code'] not in roles:
        raise HTTPException(403, 'Bạn không có quyền thực hiện thao tác này')


def management_actor(conn, user):
    actor=one(conn,'SELECT * FROM app_user WHERE user_id=%s AND organization_id=%s FOR SHARE',
              (user['user_id'],user['organization_id']))
    if not actor or not actor['is_active']:raise HTTPException(403,'Tài khoản không còn hoạt động')
    require_role(actor,'ADMIN','COMPANY_OWNER')
    return actor


def owned_company_id(conn, user):
    """Company-wide access follows current ownership, not account role alone."""
    if user['user_role_code'] != 'COMPANY_OWNER':
        return None
    row = one(conn, '''SELECT c.company_id FROM company c JOIN app_user a
        ON a.user_id=c.owner_user_id AND a.company_id=c.company_id AND a.organization_id=c.organization_id
        WHERE a.user_id=%s AND a.organization_id=%s AND a.is_active
        AND a.user_role_code='COMPANY_OWNER' AND a.company_projects_enabled''',
        (user['user_id'], user['organization_id']))
    return row['company_id'] if row else None

