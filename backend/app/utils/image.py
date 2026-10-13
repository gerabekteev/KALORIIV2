import io
import uuid
from pathlib import Path
from typing import Tuple
from PIL import Image, ImageOps
from fastapi import UploadFile, HTTPException, status

from app.config import settings

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}

MAX_IMAGE_DIMENSION = 1280
JPEG_QUALITY = 85


def process_image(image_bytes: bytes) -> Tuple[bytes, str]:
    """
    Process, normalize, resize, and compress image for AI processing.
    - Handles EXIF orientation
    - Converts RGBA/paletted images to RGB
    - Scales down to max dimension of 1280px maintaining aspect ratio
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

    # Correct orientation based on EXIF tag
    try:
        image = ImageOps.exif_transpose(image)
    except Exception:
        pass

    # Convert to RGB (dropping alpha channel or palette)
    if image.mode != "RGB":
        image = image.convert("RGB")

    # Resize if larger than max dimensions
    orig_w, orig_h = image.size
    if orig_w > MAX_IMAGE_DIMENSION or orig_h > MAX_IMAGE_DIMENSION:
        if orig_w >= orig_h:
            new_w = MAX_IMAGE_DIMENSION
            new_h = int((orig_h * MAX_IMAGE_DIMENSION) / orig_w)
        else:
            new_h = MAX_IMAGE_DIMENSION
            new_w = int((orig_w * MAX_IMAGE_DIMENSION) / orig_h)
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

    # Process and compress
    compressed_bytes, _ = process_image(content)

    # Unique filename
    filename = f"{uuid.uuid4().hex}.jpg"
    dest_path = settings.UPLOAD_DIR / filename

    with open(dest_path, "wb") as f:
        f.write(compressed_bytes)

    # Return relative URL path for frontend serving (e.g. /uploads/filename.jpg)
    relative_path = f"/uploads/{filename}"
    return dest_path, relative_path
