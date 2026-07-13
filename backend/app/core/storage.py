import asyncio
import logging
import mimetypes
import uuid
from functools import lru_cache

import boto3
from botocore.exceptions import ClientError

from app.core.config import get_settings

logger = logging.getLogger("dashboarduz.storage")

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"}
_ALLOWED_DOC_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "text/plain",
}
_ALLOWED_AUDIO_TYPES = {"audio/mpeg", "audio/wav", "audio/ogg", "audio/webm"}
_ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}

ALLOWED_CONTENT_TYPES = _ALLOWED_IMAGE_TYPES | _ALLOWED_DOC_TYPES | _ALLOWED_AUDIO_TYPES | _ALLOWED_VIDEO_TYPES

MAX_UPLOAD_SIZE = 50 * 1024 * 1024


@lru_cache
def _client():
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.object_storage_endpoint_url,
        aws_access_key_id=settings.object_storage_access_key,
        aws_secret_access_key=settings.object_storage_secret_key,
        region_name=settings.object_storage_region,
    )


def _bucket() -> str:
    return get_settings().object_storage_bucket


def guess_content_type(filename: str) -> str:
    ct, _ = mimetypes.guess_type(filename)
    return ct or "application/octet-stream"


def _put_object_sync(key: str, data: bytes, content_type: str) -> None:
    _client().put_object(Bucket=_bucket(), Key=key, Body=data, ContentType=content_type)


def _presigned_get_url_sync(key: str, expires_in: int) -> str:
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": _bucket(), "Key": key},
        ExpiresIn=expires_in,
    )


def _presigned_put_url_sync(key: str, content_type: str, expires_in: int) -> str:
    return _client().generate_presigned_url(
        "put_object",
        Params={"Bucket": _bucket(), "Key": key, "ContentType": content_type},
        ExpiresIn=expires_in,
    )


def _get_object_sync(key: str) -> bytes:
    return _client().get_object(Bucket=_bucket(), Key=key)["Body"].read()


def _delete_object_sync(key: str) -> None:
    _client().delete_object(Bucket=_bucket(), Key=key)


def _head_object_sync(key: str) -> dict | None:
    try:
        resp = _client().head_object(Bucket=_bucket(), Key=key)
        return {
            "content_type": resp.get("ContentType"),
            "content_length": resp.get("ContentLength"),
            "last_modified": resp.get("LastModified"),
            "etag": resp.get("ETag"),
        }
    except ClientError as e:
        if e.response["Error"]["Code"] == "404":
            return None
        raise


def _list_objects_sync(prefix: str, max_keys: int = 1000) -> list[dict]:
    paginator = _client().get_paginator("list_objects_v2")
    objects = []
    for page in paginator.paginate(Bucket=_bucket(), Prefix=prefix, MaxKeys=min(max_keys, 1000)):
        for obj in page.get("Contents", []):
            objects.append({
                "key": obj["Key"],
                "size": obj["Size"],
                "last_modified": obj["LastModified"],
            })
            if len(objects) >= max_keys:
                break
        if len(objects) >= max_keys:
            break
    return objects


def _prefix_total_bytes_sync(prefix: str) -> int:
    total = 0
    paginator = _client().get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=_bucket(), Prefix=prefix):
        total += sum(obj["Size"] for obj in page.get("Contents", []))
    return total


def _delete_prefix_sync(prefix: str) -> int:
    objects = _list_objects_sync(prefix, max_keys=10000)
    if not objects:
        return 0
    delete_keys = [{"Key": obj["key"]} for obj in objects]
    _client().delete_objects(Bucket=_bucket(), Delete={"Objects": delete_keys})
    return len(delete_keys)


async def put_object(key: str, data: bytes, content_type: str = "audio/mpeg") -> None:
    await asyncio.to_thread(_put_object_sync, key, data, content_type)


async def presigned_get_url(key: str, expires_in: int = 3600) -> str:
    return await asyncio.to_thread(_presigned_get_url_sync, key, expires_in)


async def presigned_put_url(key: str, content_type: str, expires_in: int = 3600) -> str:
    return await asyncio.to_thread(_presigned_put_url_sync, key, content_type, expires_in)


async def get_object(key: str) -> bytes:
    return await asyncio.to_thread(_get_object_sync, key)


async def delete_object(key: str) -> None:
    await asyncio.to_thread(_delete_object_sync, key)


async def head_object(key: str) -> dict | None:
    return await asyncio.to_thread(_head_object_sync, key)


async def list_objects(prefix: str, max_keys: int = 1000) -> list[dict]:
    return await asyncio.to_thread(_list_objects_sync, prefix, max_keys)


async def get_prefix_total_bytes(prefix: str) -> int:
    return await asyncio.to_thread(_prefix_total_bytes_sync, prefix)


async def delete_prefix(prefix: str) -> int:
    return await asyncio.to_thread(_delete_prefix_sync, prefix)


def media_key(tenant_id: str, category: str, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    unique = uuid.uuid4().hex[:12]
    return f"media/{tenant_id}/{category}/{unique}.{ext}"


def avatar_key(tenant_id: str, user_id: str, ext: str = "jpg") -> str:
    return f"avatars/{tenant_id}/{user_id}.{ext}"


def recording_key(tenant_id: str, call_id: str) -> str:
    return f"recordings/{tenant_id}/{call_id}.mp3"


def report_key(tenant_id: str, report_id: str) -> str:
    return f"reports/{tenant_id}/{report_id}.pdf"


def validate_content_type(content_type: str) -> bool:
    return content_type in ALLOWED_CONTENT_TYPES


def validate_size(size: int) -> bool:
    return 0 < size <= MAX_UPLOAD_SIZE
