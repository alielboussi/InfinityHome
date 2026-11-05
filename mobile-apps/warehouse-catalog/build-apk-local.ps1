# Build Factory (warehouse-catalog) APK locally (no EAS). Requires Android SDK + JDK 17.
# If configureCMake fails with "WARNING: A restricted method in java.lang.System has been called",
# Gradle is using JDK 21+ — this script forces JDK 17 (same as customer-credit).
# Long paths: enable Windows Developer Mode or build from a short path like C:\factory.

$ErrorActionPreference = "Stop"

$jdkCandidates = @(
    "C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot",
    "C:\Program Files\Eclipse Adoptium\jdk-17.0.13.11-hotspot",
    "C:\Program Files\Java\jdk-17"
)
$jdk = $null
foreach ($candidate in $jdkCandidates) {
    if (Test-Path "$candidate\bin\java.exe") {
        $jdk = $candidate
        break
    }
}
if (-not $jdk -and $env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
    $ver = & "$env:JAVA_HOME\bin\java.exe" -version 2>&1 | Out-String
    if ($ver -match 'version "17') {
        $jdk = $env:JAVA_HOME
    }
}
if (-not $jdk) {
    Write-Error @"
JDK 17 not found. Install Eclipse Temurin 17, or set JAVA_HOME to a JDK 17 install.
OpenJDK 21+ breaks react-native-worklets CMake/prefab with:
  WARNING: A restricted method in java.lang.System has been called
"@
}

$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$env:GRADLE_USER_HOME = if ($env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME } else { "C:\gradle" }
$env:NODE_ENV = "production"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

& "$jdk\bin\java.exe" -version

if (-not (Test-Path "android\gradlew.bat")) {
    Write-Host "Running expo prebuild..."
    npx expo prebuild --platform android
}

function Ensure-GradleNativeAccessJvmArgs {
    param([string]$GradlePropsPath)
    if (-not (Test-Path $GradlePropsPath)) { return }
    $lines = Get-Content $GradlePropsPath
    $out = @()
    $patched = $false
    foreach ($line in $lines) {
        if ($line -match '^org\.gradle\.jvmargs=' -and $line -notmatch 'enable-native-access') {
            $out += ($line.TrimEnd() + ' --enable-native-access=ALL-UNNAMED')
            $patched = $true
        } else {
            $out += $line
        }
    }
    if (-not $patched) {
        $out += 'org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m --enable-native-access=ALL-UNNAMED'
    }
    Set-Content -Path $GradlePropsPath -Value $out -Encoding utf8
}

Ensure-GradleNativeAccessJvmArgs (Join-Path $root "android\gradle.properties")

Set-Location android
Write-Host "Building release APK (JAVA_HOME=$jdk)..."
.\gradlew.bat assembleRelease --no-daemon

$apk = "app\build\outputs\apk\release\app-release.apk"
if (Test-Path $apk) {
    $full = (Resolve-Path $apk).Path
    Write-Host ""
    Write-Host "APK ready: $full"
} else {
    Write-Error "Build finished but APK not found at $apk"
}
