# KaloriiAI Docker-based Android APK Build Script for Windows
$ErrorActionPreference = "Stop"

$RootDir = (Get-Item $PSScriptRoot\..).FullName
$FrontendDir = Join-Path $RootDir "frontend"
$AndroidDir = Join-Path $FrontendDir "android"
$BackendStaticDir = Join-Path $RootDir "backend\static"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " KaloriiAI — Сборка Web SPA + APK через Docker    " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Build Frontend
Write-Host "[1/5] Сборка фронтенда (TypeScript + Vite)..." -ForegroundColor Yellow
Set-Location $FrontendDir
npm run build

# 2. Sync Web Assets to backend/static
Write-Host "[2/5] Синхронизация статики для веб-сервера..." -ForegroundColor Yellow
if (Test-Path "$BackendStaticDir\assets") {
    Remove-Item -Recurse -Force "$BackendStaticDir\assets"
}
Copy-Item -Recurse -Force "$FrontendDir\dist\*" "$BackendStaticDir\"

# 3. Capacitor Sync & Android Icons
Write-Host "[3/5] Синхронизация Capacitor Android и иконок..." -ForegroundColor Yellow
npx cap sync android
& "$RootDir\backend\.venv\Scripts\python.exe" "$RootDir\scripts\generate_android_icons.py"

# 4. Keystore verification
$KeystorePath = Join-Path $AndroidDir "app\kalorii-release-key.jks"
if (-not (Test-Path $KeystorePath)) {
    Write-Host "[4/5] Генерация ключа подписи Android APK (kalorii-release-key.jks)..." -ForegroundColor Yellow
    & "keytool" -genkeypair -v `
        -keystore $KeystorePath `
        -alias kaloriiai `
        -keyalg RSA `
        -keysize 2048 `
        -validity 10000 `
        -storepass kaloriiai2026 `
        -keypass kaloriiai2026 `
        -dname "CN=KaloriiAI, OU=Mobile, O=KaloriiAI, L=Stockholm, S=Stockholm, C=SE"
} else {
    Write-Host "[4/5] Ключ подписи найден: $KeystorePath" -ForegroundColor Green
}

# 5. Compile Signed Release APK in Docker container
Write-Host "[5/5] Компиляция подписанного Release APK через Docker (ghcr.io/cirruslabs/android-sdk:35)..." -ForegroundColor Yellow

$DockerMount = "${FrontendDir}:/frontend"
docker run --rm -v $DockerMount -v kalorii-gradle-cache:/root/.gradle -w /frontend/android ghcr.io/cirruslabs/android-sdk:35 sh -c 'sed -i "s/\r$//" ./gradlew; yes | sdkmanager --licenses > /dev/null 2>&1; sdkmanager "platforms;android-36" > /dev/null 2>&1; chmod +x ./gradlew; ./gradlew assembleRelease'

$ApkSource = Join-Path $AndroidDir "app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $ApkSource)) {
    $ApkSource = Join-Path $AndroidDir "app\build\outputs\apk\release\app-release-unsigned.apk"
}

if (Test-Path $ApkSource) {
    Copy-Item -Force $ApkSource "$RootDir\kalorii-ai.apk"
    Copy-Item -Force $ApkSource "$BackendStaticDir\kalorii-ai.apk"

    Write-Host "==================================================" -ForegroundColor Green
    Write-Host " УСПЕШНО! Готовый APK сохранён в:" -ForegroundColor Green
    Write-Host " 1) $RootDir\kalorii-ai.apk" -ForegroundColor Green
    Write-Host " 2) $BackendStaticDir\kalorii-ai.apk" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Green
} else {
    Write-Error "Ошибка: Файл APK не найден в $ApkSource"
}
