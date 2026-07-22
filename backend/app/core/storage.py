import asyncio
from functools import lru_cache

import boto3

from app.core.config import get_settings


@lru_cache
def _client():
    """Used for operations this process performs itself (put/get/list) --
    endpoint_url is only ever resolved from inside this container/VPS, so the
    internal (Docker-network) hostname is correct here."""
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.object_storage_endpoint_url,
        aws_access_key_id=settings.object_storage_access_key,
        aws_secret_access_key=settings.object_storage_secret_key,
        region_name=settings.object_storage_region,
    )


@lru_cache
def _presigned_client():
    """Used ONLY for generating presigned URLs, which are handed to an
    external browser -- must use a browser-reachable endpoint, not
    necessarily the same host this process itself uses internally (see
    Settings.object_storage_public_endpoint_url's docstring for the bug this
    fixes: presigned URLs previously embedded the internal Docker hostname
    "minio", unreachable from outside the container network)."""
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.object_storage_public_endpoint_url or settings.object_storage_endpoint_url,
        aws_access_key_id=settings.object_storage_access_key,
        aws_secret_access_key=settings.object_storage_secret_key,
        region_name=settings.object_storage_region,
    )


def _put_object_sync(key: str, data: bytes, content_type: str) -> None:
    _client().put_object(Bucket=get_settings().object_storage_bucket, Key=key, Body=data, ContentType=content_type)


def _presigned_get_url_sync(key: str, expires_in: int) -> str:
    return _presigned_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": get_settings().object_storage_bucket, "Key": key},
        ExpiresIn=expires_in,
    )


async def put_object(key: str, data: bytes, content_type: str = "audio/mpeg") -> None:
    """boto3 is synchronous, so this runs in a thread -- same reasoning as
    hash_password/verify_password in core/security.py for bcrypt."""
    await asyncio.to_thread(_put_object_sync, key, data, content_type)


async def presigned_get_url(key: str, expires_in: int = 3600) -> str:
    return await asyncio.to_thread(_presigned_get_url_sync, key, expires_in)


def _get_object_sync(key: str) -> bytes:
    return _client().get_object(Bucket=get_settings().object_storage_bucket, Key=key)["Body"].read()


async def get_object(key: str) -> bytes:
    """Downloads an object's bytes directly -- used by the notifications
    worker to re-fetch a generated PDF report before forwarding it to
    Telegram (as opposed to presigned_get_url, which hands a URL to an
    external caller instead of reading the bytes ourselves)."""
    return await asyncio.to_thread(_get_object_sync, key)


def _prefix_total_bytes_sync(prefix: str) -> int:
    total = 0
    paginator = _client().get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=get_settings().object_storage_bucket, Prefix=prefix):
        total += sum(obj["Size"] for obj in page.get("Contents", []))
    return total


async def get_prefix_total_bytes(prefix: str) -> int:
    """Sums object sizes under a key prefix -- used by billing's storage-usage
    calculation (e.g. prefix=f"recordings/{tenant_id}/")."""
    return await asyncio.to_thread(_prefix_total_bytes_sync, prefix)
