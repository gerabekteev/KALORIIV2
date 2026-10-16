import asyncio
import io
import uuid
from pathlib import Path
from typing import Tuple
from PIL import Image, ImageOps
from fastapi import UploadFile, HTTPException, status

from app.config import settings

Image.MAX_IMAGE_PIXELS = 25_000_000
MAX_DIMENSION_HARD_LIMIT = 8000

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}

MAX_IMAGE_DIMENSION = 900
JPEG_QUALITY = 85


def process_image(image_bytes: bytes) -> Tuple[bytes, str]:
    """
    Process, normalize, resize, and compress image for AI processing.
    - Handles EXIF orientation
    - Converts RGBA/paletted images to RGB
    - Scales down to max dimension of 900px maintaining aspect ratio
    - Compresses as JPEG with quality 85
    Returns (compressed_bytes, 'image/jpeg')
    """
    try:
        image = Image.open(io.BytesIO(image_bytes))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Невозможно прочитать файл изображения. Файл повреждён или имеет неподдерживаемый формат.",
        )

    if image.width > MAX_DIMENSION_HARD_LIMIT or image.height > MAX_DIMENSION_HARD_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Разрешение изображения слишком велико ({image.width}x{image.height}). Максимум {MAX_DIMENSION_HARD_LIMIT}px.",
        )

    # Correct orientation based on EXIF tag
    try:
        image = ImageOps.exif_transpose(image)
    except Exception:
        pass

    # Convert to RGB (composite transparent/RGBA/paletted onto clean white background)
    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        bg = Image.new("RGB", image.size, (255, 255, 255))
        rgba_image = image.convert("RGBA")
        bg.paste(rgba_image, mask=rgba_image.split()[3])
        image = bg
    elif image.mode != "RGB":
        image = image.convert("RGB")

    # Resize if larger than max dimensions
    orig_w, orig_h = image.size
    if orig_w > MAX_IMAGE_DIMENSION or orig_h > MAX_IMAGE_DIMENSION:
        if orig_w >= orig_h:
            new_w = MAX_IMAGE_DIMENSION
            new_h = max(1, int((orig_h * MAX_IMAGE_DIMENSION) / orig_w))
        else:
            new_h = MAX_IMAGE_DIMENSION
            new_w = max(1, int((orig_w * MAX_IMAGE_DIMENSION) / orig_h))
        image = image.resize((new_w, new_h), Image.Resampling.LANCZOS)

    output = io.BytesIO()
    image.save(output, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    compressed_bytes = output.getvalue()

    return compressed_bytes, "image/jpeg"


async def save_uploaded_file(file: UploadFile) -> Tuple[Path, str]:
    """
    Validate, process, and save uploaded meal image to uploads directory.
    Returns (dest_path: Path, relative_url_path: str).
    """
    valid_mime = bool(file.content_type and file.content_type.lower() in ALLOWED_MIME_TYPES)
    ext = Path(file.filename or "").suffix.lower()
    valid_ext = ext in {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}

    if not (valid_mime or valid_ext):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Поддерживаются только изображения формата JPEG, PNG, WebP или HEIC",
        )

    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Размер файла превышает лимит {settings.MAX_UPLOAD_SIZE_BYTES // (1024*1024)} МБ",
        )

    # Process and compress in thread pool to prevent blocking event loop
    compressed_bytes, _ = await asyncio.to_thread(process_image, content)

    # Unique filename
    filename = f"{uuid.uuid4().hex}.jpg"
    dest_path = settings.UPLOAD_DIR / filename

    await asyncio.to_thread(dest_path.write_bytes, compressed_bytes)

    # Return relative URL path for frontend serving (e.g. /uploads/filename.jpg)
    relative_path = f"/uploads/{filename}"
    return dest_path, relative_path


async def cleanup_orphan_uploads(db, max_age_hours: int = 24) -> int:
    """
    Remove files in settings.UPLOAD_DIR older than max_age_hours that are not referenced
    by any Meal.photo_path or Product.image_url.
    """
    import time
    from sqlalchemy import select
    from app.models.meal import Meal
    from app.models.product import Product

    try:
        upload_dir = settings.UPLOAD_DIR
        if not upload_dir.exists():
            return 0

        # Query all referenced photo paths
        meal_photos = await db.execute(select(Meal.photo_path).where(Meal.photo_path.is_not(None)))
        referenced_paths = set(p for p in meal_photos.scalars().all() if p)

        product_images = await db.execute(select(Product.image_url).where(Product.image_url.is_not(None)))
        referenced_paths.update(p for p in product_images.scalars().all() if p)

        now = time.time()
        max_age_seconds = max_age_hours * 3600
        deleted_count = 0

        for file_path in upload_dir.iterdir():
            if not file_path.is_file():
                continue
            if file_path.name.startswith("."):
                continue
            relative_url = f"/uploads/{file_path.name}"
            if relative_url in referenced_paths:
                continue

            try:
                mtime = file_path.stat().st_mtime
                if now - mtime > max_age_seconds:
                    file_path.unlink()
                    deleted_count += 1
            except Exception:
                pass

        return deleted_count
    except Exception:
        return 0
