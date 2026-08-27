# Full Firebase project backup (Firestore + Storage + Auth)
# Automated: Vercel cron runs every 5 days at 04:00 UTC via /api/full-firebase-backup
# Requires FIREBASE_BACKUP_BUCKET + CRON_SECRET in Vercel env.
#
# Manual run (same logic as the automated job):
# Safer than /database-backup — exports EVERY Firestore collection via Google Cloud.
#
# Prerequisites (one-time):
#   1. Blaze billing enabled on the Firebase project
#   2. Google Cloud SDK installed: https://cloud.google.com/sdk/docs/install
#   3. Firebase CLI installed: npm install -g firebase-tools
#   4. Log in: gcloud auth login && firebase login
#   5. Create a backup bucket (pick a unique name):
#        gsutil mb -p bestrest-portal-system-43108 -l europe-west1 gs://infinity-home-full-backups
#
# Usage:
#   .\scripts\fullFirebaseBackup.ps1
#   .\scripts\fullFirebaseBackup.ps1 -BackupBucket "my-other-backup-bucket"

param(
  [string]$ProjectId = "bestrest-portal-system-43108",
  [string]$StorageBucket = "bestrest-portal-system-43108.firebasestorage.app",
  [string]$BackupBucket = "infinity-home-full-backups",
  [string]$LocalDir = "backups\gcp-full"
)

$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$gcsRoot = "gs://$BackupBucket/full-backups/$stamp"
$localRoot = Join-Path $LocalDir $stamp

Write-Host ""
Write-Host "=== Infinity Home — full Firebase backup ===" -ForegroundColor Cyan
Write-Host "Project:  $ProjectId"
Write-Host "GCS dest: $gcsRoot"
Write-Host "Local:    $localRoot"
Write-Host ""

function Require-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $name"
  }
}

Require-Command "gcloud"
Require-Command "gsutil"
Require-Command "firebase"

New-Item -ItemType Directory -Force -Path $localRoot | Out-Null

Write-Host "[1/3] Firestore export (all collections, all documents)..." -ForegroundColor Yellow
gcloud firestore export "$gcsRoot/firestore" --project=$ProjectId
if ($LASTEXITCODE -ne 0) { throw "Firestore export failed" }
Write-Host "      Done. Export path: $gcsRoot/firestore" -ForegroundColor Green

Write-Host "[2/3] Storage mirror (product images, PDFs, labels)..." -ForegroundColor Yellow
gsutil -m cp -r "gs://$StorageBucket" "$gcsRoot/storage/"
if ($LASTEXITCODE -ne 0) { throw "Storage backup failed" }
Write-Host "      Done. Storage path: $gcsRoot/storage/" -ForegroundColor Green

Write-Host "[3/3] Auth users export..." -ForegroundColor Yellow
$authFile = Join-Path $localRoot "auth-users.json"
firebase auth:export $authFile --project $ProjectId
if ($LASTEXITCODE -ne 0) { throw "Auth export failed" }
Write-Host "      Done. Local file: $authFile" -ForegroundColor Green
Write-Host "      (Keep auth-users.json private — it contains password hashes.)" -ForegroundColor DarkYellow

$manifest = @{
  projectId = $ProjectId
  createdAt = (Get-Date).ToUniversalTime().ToString("o")
  firestoreExport = "$gcsRoot/firestore"
  storageBackup = "$gcsRoot/storage/"
  authExportLocal = (Resolve-Path $authFile).Path
  restoreNotes = @(
    "Firestore: gcloud firestore import $gcsRoot/firestore --project=TARGET_PROJECT"
    "Storage:   gsutil -m cp -r $gcsRoot/storage/* gs://TARGET_STORAGE_BUCKET/"
    "Auth:      firebase auth:import auth-users.json --project TARGET_PROJECT"
  )
} | ConvertTo-Json -Depth 4

$manifestPath = Join-Path $localRoot "manifest.json"
$manifest | Set-Content -Path $manifestPath -Encoding UTF8

Write-Host ""
Write-Host "=== Backup complete ===" -ForegroundColor Cyan
Write-Host "Manifest: $manifestPath"
Write-Host ""
Write-Host "Tip: In Firebase Console → Firestore → Backups, enable scheduled daily exports" -ForegroundColor DarkGray
Write-Host "     and Point-in-time recovery for automatic protection." -ForegroundColor DarkGray
Write-Host ""
