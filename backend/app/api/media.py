import hashlib
import json
import math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from uuid import UUID,uuid4
from fastapi import APIRouter,Depends,HTTPException,Request,Header,Response
from fastapi.responses import FileResponse
from pydantic import Field
from ..core import config
from .auth import StrictBody,check_origin
from ..core.db import connection,one,all_rows,audit
from ..core.security import current_user,encode_playback,playback_user
from ..core.access import project,resource
from ..core.project_rules import validate_source
from ..core.sources import project_status

router=APIRouter()
IMAGE={'.png','.jpg','.jpeg','.webp','.tif','.tiff','.bmp'}
AUDIO={'.mp3','.wav','.m4a','.ogg','.flac','.weba'}
VIDEO={'.mp4','.mov','.mkv','.webm','.avi'}
CHUNK_BYTES=5*1024*1024


class UploadBody(StrictBody):
    project_id:UUID
    file_name:str=Field(min_length=1,max_length=512)
    mime_type:str=Field(default='application/octet-stream',max_length=100)
    expected_size_bytes:int=Field(gt=0)


def source_kind(name):
    ext=Path(name).suffix.lower()
    if ext in IMAGE:return 'ORIGINAL_IMAGE'
    if ext in AUDIO:return 'ORIGINAL_AUDIO'
    if ext in VIDEO:return 'ORIGINAL_VIDEO'
    raise HTTPException(422,'Định dạng chưa hỗ trợ. Chọn video, audio hoặc ảnh PNG/JPG/WebP/TIFF/BMP.')


def upload_public(row):
    return {k:row[k] for k in ('upload_id','uploaded_size_bytes','expected_size_bytes','upload_status_code')}


@router.post('/uploads/init',status_code=201)
def init(body:UploadBody,user=Depends(current_user)):
    kind=source_kind(body.file_name)
    if any(c in body.file_name for c in ('/','\\','\0',':')) or body.file_name in ('.','..'):
        raise HTTPException(422,'Tên tệp không hợp lệ')
    if body.expected_size_bytes>config.MAX_UPLOAD_BYTES:raise HTTPException(413,'Tệp vượt quá giới hạn dung lượng')
    with connection() as conn:
        p=project(conn,user,body.project_id,write=True)
        validate_source(p['project_type'],kind)
        key=f'uploads/{uuid4().hex}{Path(body.file_name).suffix.lower()}'
        row=one(conn,'''INSERT INTO upload_session(project_id,user_id,file_name,mime_type,expected_size_bytes,storage_key,expires_at)
            VALUES (%s,%s,%s,%s,%s,%s,now()+interval '1 day') RETURNING *''',
            (body.project_id,user['user_id'],body.file_name,body.mime_type,body.expected_size_bytes,key))
        path=config.storage_path(key);path.parent.mkdir(parents=True,exist_ok=True);path.touch(exist_ok=False)
        return upload_public(row)


def get_upload(conn,user,upload_id,write=False):
    row=resource(conn,user,'upload_session','upload_id',upload_id,write=write)
    if row['user_id']!=user['user_id']:raise HTTPException(403,'Chỉ người tải tệp được tiếp tục phiên upload này')
    return row


@router.get('/uploads/{upload_id}')
def status(upload_id:UUID,user=Depends(current_user)):
    with connection() as conn:return upload_public(get_upload(conn,user,upload_id))


@router.patch('/uploads/{upload_id}')
async def chunk(upload_id:UUID,request:Request,upload_offset:int=Header(alias='Upload-Offset'),user=Depends(current_user)):
    parts=[];size=0
    async for part in request.stream():
        size+=len(part)
        if size>CHUNK_BYTES:raise HTTPException(413,'Mỗi phần upload tối đa 5 MiB')
        parts.append(part)
    data=b''.join(parts)
    if not data:raise HTTPException(422,'Phần tải lên không có dữ liệu')
    with connection() as conn:
        get_upload(conn,user,upload_id,write=True)
        row=one(conn,'SELECT *,expires_at>now() AS valid FROM upload_session WHERE upload_id=%s FOR UPDATE',(upload_id,))
        if row['upload_status_code'] not in ('INITIATED','UPLOADING') or not row['valid']:
            raise HTTPException(409,'Phiên upload đã đóng hoặc hết hạn. Hãy tạo phiên mới.')
        if upload_offset!=row['uploaded_size_bytes']:raise HTTPException(409,f"Offset hiện tại: {row['uploaded_size_bytes']}")
        if upload_offset+len(data)>row['expected_size_bytes']:raise HTTPException(413,'Dữ liệu vượt quá dung lượng tệp đã khai báo')
        path=config.storage_path(row['storage_key'])
        with path.open('r+b') as f:
            if path.stat().st_size<upload_offset:raise HTTPException(409,'Dữ liệu upload không đủ. Hãy tải lại tệp.')
            f.truncate(upload_offset);f.seek(upload_offset);f.write(data);f.flush();os.fsync(f.fileno())
        result=one(conn,"UPDATE upload_session SET uploaded_size_bytes=%s,upload_status_code='UPLOADING' WHERE upload_id=%s RETURNING *",(upload_offset+len(data),upload_id))
        return upload_public(result)


def verify_file(path,kind):
    header=path.read_bytes()[:32] if path.stat().st_size<32 else b''
    if not header:
        with path.open('rb') as f:header=f.read(32)
    ext=path.suffix.lower()
    if kind=='ORIGINAL_IMAGE':
        try:
            from PIL import Image
            with Image.open(path) as im:
                if im.width*im.height>40_000_000:raise ValueError('Ảnh quá lớn')
                im.verify()
        except Exception:raise HTTPException(422,'Tệp không phải ảnh hợp lệ hoặc ảnh quá lớn') from None
    else:
        valid=(header[:4]==b'RIFF' and ((ext=='.wav' and header[8:12]==b'WAVE') or (ext=='.avi' and header[8:12]==b'AVI ')))
        valid=valid or (ext in {'.mp4','.m4a','.mov'} and header[4:8]==b'ftyp')
        valid=valid or (ext in {'.webm','.mkv','.weba'} and header.startswith(b'\x1aE\xdf\xa3'))
        valid=valid or (ext=='.flac' and header.startswith(b'fLaC')) or (ext=='.ogg' and header.startswith(b'OggS'))
        valid=valid or (ext=='.mp3' and (header.startswith(b'ID3') or (len(header)>1 and header[0]==255 and header[1]&224==224)))
        if not valid:raise HTTPException(422,'Nội dung tệp không khớp định dạng media đã chọn')
        executable=shutil.which('ffprobe')
        if not executable:raise HTTPException(503,'Thiếu FFprobe trên máy chủ. Cài FFmpeg theo README rồi tải lại.')
        try:
            reply=subprocess.run([executable,'-v','error','-protocol_whitelist','file,pipe',
                '-probesize','10485760','-analyzeduration','10000000',
                '-show_entries','format=duration:stream=codec_type,codec_name:stream_disposition=attached_pic',
                '-of','json',str(path)],capture_output=True,check=True,text=True,encoding='utf-8',
                timeout=int(os.getenv('MEDIA_PROBE_TIMEOUT_SECONDS','30')))
            metadata=json.loads(reply.stdout)
            streams=metadata.get('streams',[])
            audio=any(s.get('codec_type')=='audio' and s.get('codec_name') for s in streams)
            video=any(s.get('codec_type')=='video' and s.get('codec_name') and
                      not s.get('disposition',{}).get('attached_pic') for s in streams)
            duration=float(metadata.get('format',{}).get('duration',0))
            if not audio or (kind=='ORIGINAL_VIDEO' and not video) or (kind=='ORIGINAL_AUDIO' and video):
                raise HTTPException(422,'Tệp phải chứa luồng âm thanh hợp lệ và đúng loại audio/video đã chọn.')
            if not math.isfinite(duration) or duration<=0:
                raise HTTPException(422,'Không xác định được thời lượng media hợp lệ. Hãy chuyển đổi tệp rồi tải lại.')
            maximum=int(os.getenv('MAX_MEDIA_DURATION_SECONDS','14400'))
            if duration>maximum:raise HTTPException(422,f'Tệp vượt giới hạn thời lượng {maximum} giây. Chia nhỏ tệp rồi tải lại.')
            return {'duration_ms':max(1,round(duration*1000))}
        except subprocess.TimeoutExpired:
            raise HTTPException(422,'Kiểm tra media vượt thời gian cho phép. Chuyển đổi hoặc chia nhỏ tệp rồi tải lại.') from None
        except OSError:
            raise HTTPException(503,'Không chạy được FFprobe. Kiểm tra cài đặt FFmpeg trên máy chủ.') from None
        except (subprocess.CalledProcessError,ValueError,TypeError,AttributeError):
            raise HTTPException(422,'Tệp media hỏng hoặc không có nội dung audio/video hợp lệ. Chuyển đổi tệp rồi tải lại.') from None
    return {}


def normalize_web_audio(path):
    # MediaRecorder WebM is non-seekable and often has no duration metadata.
    with path.open('rb') as source:
        if source.read(4)!=b'\x1aE\xdf\xa3':
            raise HTTPException(422,'Nội dung tệp không khớp định dạng audio WebM')
    executable=shutil.which('ffmpeg')
    if not executable:raise HTTPException(503,'Thiếu FFmpeg trên máy chủ. Cài FFmpeg theo README rồi tải lại.')
    with tempfile.NamedTemporaryFile(dir=path.parent,prefix='recording-',suffix='.weba',delete=False) as temporary:
        normalized=Path(temporary.name)
    try:
        subprocess.run([executable,'-v','error','-nostdin','-y','-protocol_whitelist','file,pipe',
            '-probesize','10485760','-analyzeduration','10000000','-i',str(path),
            '-map','0','-c','copy','-fs',str(config.MAX_UPLOAD_BYTES+1),'-f','webm',str(normalized)],
            capture_output=True,check=True,timeout=int(os.getenv('MEDIA_PROBE_TIMEOUT_SECONDS','30')))
        if normalized.stat().st_size>config.MAX_UPLOAD_BYTES:
            raise HTTPException(413,'Bản thu vượt giới hạn dung lượng sau khi chuẩn hóa. Hãy chia nhỏ bản thu.')
        metadata=verify_file(normalized,'ORIGINAL_AUDIO')
        return normalized,metadata
    except BaseException as error:
        normalized.unlink(missing_ok=True)
        if isinstance(error,subprocess.TimeoutExpired):
            raise HTTPException(422,'Chuẩn hóa bản thu vượt thời gian cho phép. Chia nhỏ bản thu rồi tải lại.') from None
        if isinstance(error,subprocess.CalledProcessError):
            raise HTTPException(422,'Không đọc được bản thu WebM hợp lệ. Hãy thu lại hoặc chuyển đổi tệp.') from None
        if isinstance(error,OSError):
            raise HTTPException(503,'Không chuẩn hóa được bản thu. Kiểm tra FFmpeg và dung lượng máy chủ.') from None
        raise


@router.post('/uploads/{upload_id}/complete')
def complete(upload_id:UUID,user=Depends(current_user)):
    normalized=None
    original=None
    try:
        with connection() as conn:
            get_upload(conn,user,upload_id,write=True)
            row=one(conn,'SELECT *,expires_at>now() AS valid FROM upload_session WHERE upload_id=%s FOR UPDATE',(upload_id,))
            if row['upload_status_code']=='COMPLETED':return one(conn,'SELECT * FROM media_file WHERE storage_key=%s',(row['storage_key'],))
            if row['upload_status_code'] not in ('INITIATED','UPLOADING') or not row['valid']:
                raise HTTPException(409,'Phiên upload đã đóng hoặc hết hạn')
            if row['uploaded_size_bytes']!=row['expected_size_bytes']:raise HTTPException(409,'Tệp chưa tải xong')
            pid=row['project_id']
            p=one(conn,'SELECT * FROM project WHERE project_id=%s FOR UPDATE',(pid,))
            project(conn,user,pid,write=True)
            path=config.storage_path(row['storage_key']);kind=source_kind(row['file_name'])
            validate_source(p['project_type'],kind)
            if path.stat().st_size!=row['expected_size_bytes']:raise HTTPException(409,'Dung lượng thực tế không khớp')
            if path.suffix.lower()=='.weba':
                original=path
                normalized,metadata=normalize_web_audio(path)
                path=normalized
            else:
                metadata=verify_file(path,kind)
            storage_key=path.relative_to(config.STORAGE_ROOT).as_posix()
            size=path.stat().st_size
            sha=hashlib.sha256()
            with path.open('rb') as f:
                for block in iter(lambda:f.read(1024*1024),b''):sha.update(block)
            conn.execute('UPDATE media_file SET is_current=false WHERE project_id=%s AND is_current',(pid,))
            # Each source retains its own current results.
            mime={'.wav':'audio/wav','.mp3':'audio/mpeg','.mp4':'video/mp4','.mov':'video/quicktime','.m4a':'audio/mp4',
                  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ogg':'audio/ogg',
                  '.webm':'video/webm','.weba':'audio/webm','.flac':'audio/flac','.mkv':'video/x-matroska','.avi':'video/x-msvideo',
                  '.tif':'image/tiff','.tiff':'image/tiff','.bmp':'image/bmp'}[path.suffix.lower()]
            media=one(conn,'''INSERT INTO media_file(project_id,media_kind_code,storage_key,mime_type,file_name,file_size_bytes,checksum_sha256,is_current,duration_ms)
                VALUES (%s,%s,%s,%s,%s,%s,%s,true,%s) RETURNING *''',(pid,kind,storage_key,mime,row['file_name'],size,sha.hexdigest(),metadata.get('duration_ms')))
            conn.execute("UPDATE upload_session SET upload_status_code='COMPLETED',storage_key=%s,expected_size_bytes=%s,uploaded_size_bytes=%s WHERE upload_id=%s",(storage_key,size,size,upload_id))
            project_status(conn,pid,'DRAFT')
            audit(conn,user['user_id'],'UPLOAD','project',pid,{'file_name':row['file_name']})
    except BaseException:
        if normalized:normalized.unlink(missing_ok=True)
        raise
    if original:
        # Commit the new storage reference before removing the raw temporary upload.
        try:original.unlink(missing_ok=True)
        except OSError:pass
    return media


@router.delete('/uploads/{upload_id}')
def cancel(upload_id:UUID,user=Depends(current_user)):
    with connection() as conn:
        get_upload(conn,user,upload_id,write=True)
        row=one(conn,'SELECT * FROM upload_session WHERE upload_id=%s FOR UPDATE',(upload_id,))
        if row['upload_status_code']=='COMPLETED':raise HTTPException(409,'Tệp đã hoàn tất, hãy xóa trong kho media')
        conn.execute("UPDATE upload_session SET upload_status_code='CANCELED' WHERE upload_id=%s",(upload_id,))
        config.storage_path(row['storage_key']).unlink(missing_ok=True)
    return {'ok':True}


@router.get('/projects/{project_id}/media')
def media_list(project_id:UUID,user=Depends(current_user)):
    with connection() as conn:
        project(conn,user,project_id)
        rows=all_rows(conn,'SELECT * FROM media_file WHERE project_id=%s ORDER BY created_at DESC',(project_id,))
        return {'items':rows,'total':len(rows)}


@router.get('/media/{media_id}')
def detail(media_id:UUID,user=Depends(current_user)):
    with connection() as conn:return resource(conn,user,'media_file','media_file_id',media_id)


@router.get('/media/{media_id}/download')
def download(media_id:UUID,user=Depends(current_user)):
    with connection() as conn:row=resource(conn,user,'media_file','media_file_id',media_id)
    path=config.storage_path(row['storage_key'])
    if not path.is_file():raise HTTPException(404,'Tệp không còn trong kho lưu trữ')
    return FileResponse(path,media_type=row['mime_type'],filename=row['file_name'])


@router.post('/media/{media_id}/playback')
def playback(media_id:UUID,request:Request,response:Response,user=Depends(current_user)):
    check_origin(request)
    with connection() as conn:resource(conn,user,'media_file','media_file_id',media_id)
    url=f'/api/media/{media_id}/stream'
    response.set_cookie('media_playback',encode_playback(user,media_id),max_age=300,httponly=True,
                        secure=config.COOKIE_SECURE,samesite='lax',path=url)
    return {'url':url,'expires_in':300}


@router.get('/media/{media_id}/stream')
def stream(media_id:UUID,request:Request):
    check_origin(request)
    user=playback_user(request.cookies.get('media_playback',''),media_id)
    with connection() as conn:row=resource(conn,user,'media_file','media_file_id',media_id)
    path=config.storage_path(row['storage_key'])
    if not path.is_file():raise HTTPException(404,'Tệp không còn trong kho lưu trữ')
    return FileResponse(path,media_type=row['mime_type'],headers={'Cache-Control':'private, no-store'})


@router.delete('/media/{media_id}')
def delete_media(media_id:UUID,user=Depends(current_user)):
    with connection() as conn:
        row=resource(conn,user,'media_file','media_file_id',media_id,manage=True)
        conn.execute('SELECT project_id FROM project WHERE project_id=%s FOR UPDATE',(row['project_id'],))
        if one(conn,'SELECT 1 FROM processing_job WHERE media_file_id=%s LIMIT 1',(media_id,)) or one(conn,'SELECT 1 FROM ocr_document WHERE media_file_id=%s LIMIT 1',(media_id,)):
            raise HTTPException(409,'Tệp đã có lịch sử xử lý. Hãy đưa dự án vào thùng rác để giữ lịch sử nhất quán.')
        conn.execute('DELETE FROM media_file WHERE media_file_id=%s',(media_id,))
        if row['is_current']:
            conn.execute('''UPDATE media_file SET is_current=true WHERE media_file_id=(
                SELECT media_file_id FROM media_file WHERE project_id=%s AND media_kind_code LIKE 'ORIGINAL_%%'
                ORDER BY created_at DESC,media_file_id DESC LIMIT 1)''',(row['project_id'],))
        audit(conn,user['user_id'],'DELETE_MEDIA','project',row['project_id'])
    config.storage_path(row['storage_key']).unlink(missing_ok=True)
    return {'ok':True}
