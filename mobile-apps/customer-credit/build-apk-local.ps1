# Build Ledger APK locally (no EAS). Requires Android SDK + JDK 17.
# If build fails with "Filename longer than 260 characters", enable Windows long paths
# (Settings > System > For developers > Developer Mode) and reboot, or copy this app to C:\ledger.

$ErrorActionPreference = "Stop"

$jdk = "C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot"
if (-not (Test-Path "$jdk\bin\java.exe")) {
    Write-Error "JDK 17 not found at $jdk. Install Eclipse Temurin 17 or set JAVA_HOME."
}

$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:GRADLE_USER_HOME = "C:\gradle"
$env:NODE_ENV = "production"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Path "android\gradlew.bat")) {
    Write-Host "Running expo prebuild..."
    npx expo prebuild --platform android
}

Set-Location android
Write-Host "Building release APK..."
.\gradlew.bat assembleRelease --no-daemon

$apk = "app\build\outputs\apk\release\app-release.apk"
if (Test-Path $apk) {
    $full = (Resolve-Path $apk).Path
    Write-Host ""
    Write-Host "APK ready: $full"
} else {
    Write-Error "Build finished but APK not found at $apk"
}
