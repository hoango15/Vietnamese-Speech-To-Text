from contextlib import contextmanager
import psycopg
from psycopg.rows import dict_row
from . import config


@contextmanager
def connection():
    with psycopg.connect(config.DATABASE_URL, row_factory=dict_row) as conn:
        conn.execute('SET LOCAL ROLE role_app_api')
        conn.execute("SELECT set_config('app.current_organization_id', %s, true)", (config.ORGANIZATION_ID,))
        yield conn


def one(conn, sql, params=()):
    return conn.execute(sql, params).fetchone()


def all_rows(conn, sql, params=()):
    return conn.execute(sql, params).fetchall()


def audit(conn, user_id, action, entity, entity_id, detail=None, company_id=None):
    from psycopg.types.json import Jsonb
    if company_id is None and entity == 'project':
        row = one(conn, 'SELECT company_id FROM project WHERE project_id=%s', (entity_id,))
        company_id = row['company_id'] if row else None
    conn.execute('INSERT INTO audit_log(user_id,action_name,entity_name,entity_id,change_detail,company_id) VALUES (%s,%s,%s,%s,%s,%s)',
                 (user_id, action, entity, str(entity_id), Jsonb(detail or {}), company_id))

