import os
from pathlib import Path
os.environ.setdefault('JWT_SECRET', 'test-only-secret-with-at-least-32-characters')

import pytest


@pytest.fixture(scope='session')
def api():
    if not os.getenv('TEST_DATABASE_URL'):
        pytest.skip('Set TEST_DATABASE_URL to a disposable PostgreSQL database to run integration tests')
    from app.core import config
    config.DATABASE_URL = os.environ['TEST_DATABASE_URL']
    config.MIGRATION_DATABASE_URL = config.DATABASE_URL
    config.STORAGE_ROOT = Path(os.getenv('TEST_STORAGE_ROOT', str(Path(__file__).resolve().parents[2] / '.runtime/test-storage'))).resolve()
    from app.bootstrap import migrate
    migrate()
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as client:
        yield client


def make_accounts(api, with_companies):
    import uuid
    from app.core.db import connection
    from app.core.security import hash_password
    from app.main import attempts
    attempts.clear()
    rows = {}
    with connection() as conn:
        for key, role in [('admin','ADMIN'),('manager','COMPANY_OWNER'),('other_manager','COMPANY_OWNER'),('member','MEMBER'),('viewer','VIEWER'),('outsider','MEMBER')]:
            email = f'{key}-{uuid.uuid4().hex[:10]}@example.com'
            user = conn.execute('''INSERT INTO app_user(organization_id,email,full_name,password_hash,user_role_code)
                VALUES (%s,%s,%s,%s,%s) RETURNING user_id''',
                ('01900000-0000-7000-8000-000000000001',email,key,hash_password('TestPassword123'),role)).fetchone()
            rows[key] = {'email':email, 'user_id':str(user['user_id'])}
        if with_companies:
            for key in ('manager', 'other_manager'):
                company = conn.execute('''INSERT INTO company(organization_id,company_name,owner_user_id)
                    VALUES (%s,%s,%s) RETURNING company_id''',
                    ('01900000-0000-7000-8000-000000000001', 'Fixture ' + uuid.uuid4().hex, rows[key]['user_id'])).fetchone()
                rows[key]['company_id'] = str(company['company_id'])
                conn.execute('UPDATE app_user SET company_id=%s WHERE user_id=%s', (company['company_id'], rows[key]['user_id']))
            for key in ('member', 'viewer', 'outsider'):
                rows[key]['company_id'] = rows['manager']['company_id']
                conn.execute('UPDATE app_user SET company_id=%s WHERE user_id=%s', (rows[key]['company_id'], rows[key]['user_id']))
    for key, row in rows.items():
        response = api.post('/api/auth/login',json={'email':row['email'],'password':'TestPassword123'})
        assert response.status_code == 200, response.text
        row['headers'] = {'Authorization':'Bearer '+response.json()['access_token']}
    return rows


@pytest.fixture
def accounts(api):
    return make_accounts(api, with_companies=True)


@pytest.fixture
def independent_accounts(api):
    return make_accounts(api, with_companies=False)
