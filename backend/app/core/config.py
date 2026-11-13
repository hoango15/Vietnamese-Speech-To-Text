import os
from pathlib import Path, PureWindowsPath

DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://thanh_am:thanh_am@localhost:5432/thanh_am')
MIGRATION_DATABASE_URL = os.getenv('MIGRATION_DATABASE_URL', DATABASE_URL)
ORGANIZATION_ID = os.getenv('ORGANIZATION_ID', '01900000-0000-7000-8000-000000000001')
JWT_SECRET = os.getenv('JWT_SECRET', '')
STORAGE_ROOT = Path(os.getenv('STORAGE_ROOT', './data')).resolve()
ALLOWED_ORIGINS = [s.strip() for s in os.getenv('ALLOWED_ORIGINS', 'http://localhost:5173,http://localhost:8080').split(',') if s.strip()]
COOKIE_SECURE = os.getenv('COOKIE_SECURE', 'false').lower() == 'true'
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
MAX_UPLOAD_BYTES = int(os.getenv('MAX_UPLOAD_BYTES', str(1024 * 1024 * 1024)))
ACCESS_SECONDS = 900
REFRESH_DAYS = 7

VNPAY_ENABLED = os.getenv('VNPAY_ENABLED', 'false').lower() == 'true'
VNPAY_TMN_CODE = os.getenv('VNPAY_TMN_CODE', '')
VNPAY_HASH_SECRET = os.getenv('VNPAY_HASH_SECRET', '')
VNPAY_URL = os.getenv('VNPAY_URL', 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html')
VNPAY_RETURN_URL = os.getenv('VNPAY_RETURN_URL', '')
VNPAY_IPN_URL = os.getenv('VNPAY_IPN_URL', '')
VNPAY_TRANSCRIBE_VND_PER_MINUTE = int(os.getenv('VNPAY_TRANSCRIBE_VND_PER_MINUTE', '1000'))
VNPAY_MINUTES_VND_PER_MINUTE = int(os.getenv('VNPAY_MINUTES_VND_PER_MINUTE', '500'))


def storage_path(key: str, root: Path | None = None) -> Path:
    base = (root or STORAGE_ROOT).resolve()
    if not key or Path(key).is_absolute() or PureWindowsPath(key).is_absolute() or '\\' in key:
        raise ValueError('Đường dẫn tệp không hợp lệ')
    path = (base / key).resolve()
    if not path.is_relative_to(base) or path == base:
        raise ValueError('Đường dẫn tệp không hợp lệ')
    return path

