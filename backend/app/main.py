import logging
import time
from collections import defaultdict,deque
from contextlib import asynccontextmanager
from fastapi import FastAPI,Request,HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
import psycopg
from .core import config
from .core.db import connection
from .api.auth import router as auth_router
from .projects import router as projects_router
from .api.admin import router as admin_router
from .api.management import router as management_router
from .api.media import router as media_router
from .api.transcripts import router as transcript_router
from .api.documents import router as document_router
from .api.jobs import router as job_router
from .api.listening import router as listening_router
from .companies import router as company_router
from .api.payments import router as payment_router


@asynccontextmanager
async def lifespan(app):
    if len(config.JWT_SECRET)<32:raise RuntimeError('JWT_SECRET phải có ít nhất 32 ký tự')
    config.STORAGE_ROOT.mkdir(parents=True,exist_ok=True)
    yield


app=FastAPI(title='Thanh Âm API',version='1.0.0',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=config.ALLOWED_ORIGINS,allow_credentials=True,
                   allow_methods=['GET','POST','PATCH','PUT','DELETE'],allow_headers=['Authorization','Content-Type','Upload-Offset'])
attempts=defaultdict(deque)


@app.middleware('http')
async def limits(request:Request,call_next):
    if request.url.path in ('/api/auth/login','/api/auth/register'):
        key=(request.client.host if request.client else 'unknown',request.url.path)
        allowed=True
        try:
            import redis
            client=redis.Redis.from_url(config.REDIS_URL,socket_connect_timeout=0.15,socket_timeout=0.15)
            bucket='rate:'+':'.join(key)+':'+str(int(time.time())//60)
            allowed=client.incr(bucket)<=30;client.expire(bucket,65);client.close()
        except redis.RedisError:
            # shortcut: process-local limit without Redis; use Compose Redis for shared production limits.
            now=time.monotonic();queue=attempts[key]
            while queue and queue[0]<now-60:queue.popleft()
            allowed=len(queue)<30
            if allowed:queue.append(now)
            if len(attempts)>10000:
                for old in list(attempts):
                    if not attempts[old] or attempts[old][-1]<now-60:del attempts[old]
        if not allowed:return JSONResponse({'detail':'Bạn thử quá nhiều lần. Vui lòng chờ một phút.'},status_code=429)
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='same-origin'
    response.headers['Cache-Control']='no-store'
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request,exc):
    messages=[]
    for err in exc.errors():
        field='.'.join(str(k) for k in err['loc'] if k!='body')
        messages.append(f"{field}: {err['msg']}")
    return JSONResponse({'detail':'; '.join(messages)},status_code=422)


@app.exception_handler(psycopg.IntegrityError)
async def integrity_error(request,exc):
    return JSONResponse({'detail':'Dữ liệu xung đột hoặc không hợp lệ. Hãy tải lại và thử lại.'},status_code=409)


@app.exception_handler(psycopg.OperationalError)
async def db_error(request,exc):
    logging.getLogger(__name__).error('Database unavailable: %s',type(exc).__name__)
    return JSONResponse({'detail':'Không kết nối được cơ sở dữ liệu. Vui lòng thử lại sau.'},status_code=503)


@app.exception_handler(ValueError)
async def input_error(request,exc):
    return JSONResponse({'detail':str(exc)},status_code=422)


@app.exception_handler(RuntimeError)
async def runtime_error(request,exc):
    return JSONResponse({'detail':str(exc)},status_code=503)


for router in (auth_router,projects_router,admin_router,management_router,media_router,transcript_router,document_router,job_router,listening_router,company_router,payment_router):app.include_router(router,prefix='/api')


@app.get('/api/health')
def health():return {'status':'ok'}


@app.get('/api/health/database')
def db_health():
    with connection() as conn:conn.execute('SELECT 1')
    return {'status':'ok'}


@app.get('/api/system/capabilities')
def capabilities():
    from .services.processors import capabilities as processor_capabilities
    return {**processor_capabilities(),'max_upload_bytes':config.MAX_UPLOAD_BYTES}
