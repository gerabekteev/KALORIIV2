"""
Fast, zero-Docker updater for KaloriiAI Android APK (kalorii-ai.apk).
Replaces `assets/public/*` inside the APK with the latest compiled Vite/Capacitor bundle,
enforces Android `zipalign -p 4` alignment (4096-byte page alignment for `.so`, 4-byte for `resources.arsc` and stored assets),
and signs the APK with v1 + v2 + v3 signatures via `scripts/tools/apksigner.jar`.
"""
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BASE_APK = ROOT_DIR / "kalorii-ai.apk"
STATIC_APK = ROOT_DIR / "backend" / "static" / "kalorii-ai.apk"
PUBLIC_ASSETS_DIR = ROOT_DIR / "frontend" / "android" / "app" / "src" / "main" / "assets" / "public"
KEYSTORE_PATH = ROOT_DIR / "frontend" / "android" / "app" / "kalorii-release-key.jks"
APKSIGNER_JAR = ROOT_DIR / "scripts" / "tools" / "apksigner.jar"


def _write_entry_aligned(
    zf_out: zipfile.ZipFile,
    arcname: str,
    data: bytes,
    compress_type: int,
    date_time: tuple = (2026, 1, 1, 0, 0, 0),
    external_attr: int = 0o644 << 16,
) -> None:
    info = zipfile.ZipInfo(filename=arcname, date_time=date_time)
    info.compress_type = compress_type
    info.external_attr = external_attr
    info.create_system = 3

    if compress_type == zipfile.ZIP_STORED:
        alignment = 4096 if arcname.endswith(".so") else 4
        header_pos = zf_out.fp.tell()
        filename_len = len(arcname.encode("utf-8"))
        base_header_len = 30 + filename_len
        pad_len = (alignment - ((header_pos + base_header_len) % alignment)) % alignment
        info.extra = b"\x00" * pad_len
    else:
        info.extra = b""

    zf_out.writestr(info, data, compress_type=compress_type)


def main() -> None:
    if not BASE_APK.exists():
        raise FileNotFoundError(f"Base APK not found: {BASE_APK}")
    if not PUBLIC_ASSETS_DIR.exists():
        raise FileNotFoundError(
            f"Synced public assets not found: {PUBLIC_ASSETS_DIR}. Run `npx cap sync android` first."
        )
    if not KEYSTORE_PATH.exists():
        raise FileNotFoundError(f"Release keystore not found: {KEYSTORE_PATH}")
    if not APKSIGNER_JAR.exists():
        raise FileNotFoundError(f"apksigner.jar not found: {APKSIGNER_JAR}")

    with tempfile.TemporaryDirectory() as tmpdir:
        unsigned_apk = Path(tmpdir) / "unsigned-aligned.apk"
        signed_apk = Path(tmpdir) / "signed.apk"

        print("[1/4] Updating assets/public/* and aligning ZIP entries...")
        with zipfile.ZipFile(BASE_APK, "r") as zf_in, zipfile.ZipFile(unsigned_apk, "w") as zf_out:
            # 1. Copy all non-public, non-signature entries from base APK
            for item in zf_in.infolist():
                fn = item.filename
                if fn.startswith("assets/public/"):
                    continue
                if fn in ("META-INF/MANIFEST.MF", "META-INF/CERT.SF", "META-INF/CERT.RSA") or fn.endswith((".SF", ".RSA", ".DSA")):
                    continue

                raw_data = zf_in.read(fn)
                _write_entry_aligned(
                    zf_out=zf_out,
                    arcname=fn,
                    data=raw_data,
                    compress_type=item.compress_type,
                    date_time=item.date_time,
                    external_attr=item.external_attr,
                )

            # 2. Add fresh assets/public/* files
            for root, _, files in os.walk(PUBLIC_ASSETS_DIR):
                for file in sorted(files):
                    full_path = Path(root) / file
                    rel_path = full_path.relative_to(PUBLIC_ASSETS_DIR).as_posix()
                    arcname = f"assets/public/{rel_path}"
                    raw_data = full_path.read_bytes()
                    # Keep PNG icons uncompressed (aligned to 4 bytes), compress text/JS/CSS bundles
                    compress_type = (
                        zipfile.ZIP_STORED
                        if file.lower().endswith(".png")
                        else zipfile.ZIP_DEFLATED
                    )
                    _write_entry_aligned(
                        zf_out=zf_out,
                        arcname=arcname,
                        data=raw_data,
                        compress_type=compress_type,
                    )

        # Verify alignment of all ZIP_STORED entries
        with zipfile.ZipFile(unsigned_apk, "r") as zf_check:
            with open(unsigned_apk, "rb") as fp:
                for item in zf_check.infolist():
                    if item.compress_type == zipfile.ZIP_STORED:
                        fp.seek(item.header_offset + 26)
                        fn_len = int.from_bytes(fp.read(2), "little")
                        extra_len = int.from_bytes(fp.read(2), "little")
                        data_offset = item.header_offset + 30 + fn_len + extra_len
                        align = 4096 if item.filename.endswith(".so") else 4
                        if data_offset % align != 0:
                            raise RuntimeError(
                                f"Alignment check failed for {item.filename}: offset {data_offset} not divisible by {align}"
                            )

        print("[2/4] Signing APK (v1 + v2 + v3 schemes) via apksigner...")
        sign_cmd = [
            "java",
            "-jar",
            str(APKSIGNER_JAR),
            "sign",
            "--ks",
            str(KEYSTORE_PATH),
            "--ks-key-alias",
            "kaloriiai",
            "--ks-pass",
            "pass:kaloriiai2026",
            "--key-pass",
            "pass:kaloriiai2026",
            "--v1-signing-enabled",
            "true",
            "--v2-signing-enabled",
            "true",
            "--v3-signing-enabled",
            "true",
            "--out",
            str(signed_apk),
            str(unsigned_apk),
        ]
        subprocess.run(sign_cmd, check=True)

        print("[3/4] Verifying APK cryptographic signatures...")
        verify_cmd = [
            "java",
            "-jar",
            str(APKSIGNER_JAR),
            "verify",
            "--verbose",
            str(signed_apk),
        ]
        res = subprocess.run(verify_cmd, check=True, capture_output=True, text=True)
        for line in res.stdout.splitlines():
            if "Verified using" in line or "Verifies" in line:
                print("  ", line)

        print("[4/4] Saving signed APK to root and backend/static...")
        shutil.copy2(signed_apk, BASE_APK)
        shutil.copy2(signed_apk, STATIC_APK)
        print(f"SUCCESS: Updated {BASE_APK.name} ({BASE_APK.stat().st_size / (1024*1024):.2f} MB)")


if __name__ == "__main__":
    main()
