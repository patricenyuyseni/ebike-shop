"""Image validation + Cloudinary upload. Credentials stay on the server."""
import io

import cloudinary
import cloudinary.uploader
from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from app.core.config import settings

ALLOWED = {"JPEG": ("image/jpeg", "jpg"), "PNG": ("image/png", "png"), "WEBP": ("image/webp", "webp")}
Image.MAX_IMAGE_PIXELS = 40_000_000  # blocks "decompression bomb" images


class StorageNotConfigured(Exception):
    pass


def validate_and_clean(raw: bytes) -> tuple[bytes, str]:
    """Check the REAL file content (not the file name / declared type) and strip metadata (EXIF, GPS)."""
    try:
        img = Image.open(io.BytesIO(raw))
        fmt = img.format
        img.verify()
        img = Image.open(io.BytesIO(raw))  # verify() invalidates the object; reopen
        img.load()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError, ValueError):
        raise HTTPException(400, "This file is not a valid image. Please upload a JPEG, PNG or WebP picture.")
    if fmt not in ALLOWED:
        raise HTTPException(400, "Only JPEG, PNG and WebP images are allowed.")
    out = io.BytesIO()
    save_kwargs = {"quality": 90} if fmt in ("JPEG", "WEBP") else {}
    if fmt == "JPEG" and img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.save(out, format=fmt, **save_kwargs)  # re-encoding drops metadata
    return out.getvalue(), ALLOWED[fmt][1]


async def read_limited(file: UploadFile) -> bytes:
    limit = settings.max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"Image is too large. Maximum size is {settings.max_upload_mb} MB.")
    if not data:
        raise HTTPException(400, "The uploaded file is empty.")
    return data


def _configure():
    if not settings.cloudinary_configured:
        raise StorageNotConfigured()
    cloudinary.config(cloud_name=settings.cloudinary_cloud_name, api_key=settings.cloudinary_api_key,
                      api_secret=settings.cloudinary_api_secret, secure=True)


def upload_image(data: bytes) -> tuple[str, str]:
    """Returns (secure_url, public_id). Raises StorageNotConfigured if keys are missing."""
    _configure()
    res = cloudinary.uploader.upload(io.BytesIO(data), folder="ebike/products", resource_type="image",
                                     unique_filename=True, overwrite=False)
    return res["secure_url"], res["public_id"]


def delete_image(public_id: str) -> None:
    try:
        _configure()
        cloudinary.uploader.destroy(public_id, resource_type="image", invalidate=True)
    except Exception:
        from app.services.common import log
        log.warning("Could not delete Cloudinary image %s (it may need manual cleanup)", public_id)
