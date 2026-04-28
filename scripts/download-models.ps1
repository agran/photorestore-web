# Download ONNX models for PhotoRestore Web
# ==========================================
# HuggingFace requires authentication for model downloads.
#
# Option 1: HuggingFace CLI (recommended)
#   1. Install:  pip install huggingface_hub
#   2. Login:    huggingface-cli login
#   3. Run:      pwsh scripts/download-models.ps1 -UseHfCli
#
# Option 2: Manual browser download
#   Open the URLs below in a browser where you're logged into HuggingFace,
#   then save each file to public/models/ with the target filename.
#
#   realesrgan-x4plus.onnx
#     → https://huggingface.co/TheGuy444/Real-ESRGAN-ONNX/resolve/main/onnx/model.onnx
#   realesrgan-x4plus-anime.onnx
#     → https://huggingface.co/TheGuy444/Real-ESRGAN-ONNX/resolve/main/onnx/model.onnx
#   gfpgan-v1.4.onnx
#     → (search: huggingface.co gfpgan onnx)
#   codeformer.onnx
#     → (search: huggingface.co codeformer onnx)
#   lama.onnx
#     → (search: huggingface.co lama onnx)
#   scunet.onnx
#     → (search: huggingface.co scunet onnx)

param([switch]$UseHfCli)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$ModelsDir = Join-Path $ProjectDir "public" "models"

Write-Host "=== PhotoRestore Web — Model Download ===" -ForegroundColor Cyan
Write-Host "Models will be saved to: $ModelsDir" -ForegroundColor Gray
Write-Host ""

$models = @(
    @{
        Id       = "realesrgan-x4plus"
        Repo     = "TheGuy444/Real-ESRGAN-ONNX"
        File     = "onnx/model.onnx"
        Size     = "~64 MB"
    }
    @{
        Id       = "realesrgan-x4plus-anime"
        Repo     = "TheGuy444/Real-ESRGAN-ONNX"
        File     = "onnx/model.onnx"
        Size     = "~64 MB"
    }
)

if ($UseHfCli) {
    Write-Host "Using huggingface-cli" -ForegroundColor Yellow
    Write-Host ""
    foreach ($model in $models) {
        $outFile = Join-Path $ModelsDir "$($model.Id).onnx"
        if (Test-Path $outFile) {
            $fileSize = (Get-Item $outFile).Length
            Write-Host "[SKIP] $($model.Id).onnx — already exists ($([math]::Round($fileSize/1MB, 1)) MB)" -ForegroundColor Yellow
            continue
        }
        Write-Host "[DOWNLOAD] $($model.Id) ($($model.Size))" -ForegroundColor Green
        Write-Host "  repo: $($model.Repo)  file: $($model.File)" -ForegroundColor Gray
        huggingface-cli download $model.Repo $model.File --local-dir $ModelsDir --local-dir-use-symlinks False
        $downloadedFile = Join-Path $ModelsDir $model.File
        if (Test-Path $downloadedFile) {
            Rename-Item $downloadedFile $outFile -Force
            Write-Host "  saved as: $($model.Id).onnx" -ForegroundColor Green
        }
    }
} else {
    Write-Host "No download method selected." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Options:" -ForegroundColor White
    Write-Host "  1. CLI:  pwsh scripts/download-models.ps1 -UseHfCli" -ForegroundColor Gray
    Write-Host "     (requires: pip install huggingface_hub && huggingface-cli login)" -ForegroundColor DarkGray
    Write-Host "  2. Manual browser download — see URLs in script header" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Required for v0.2: realesrgan-x4plus.onnx (64 MB)" -ForegroundColor Cyan
    Write-Host "URL: https://huggingface.co/TheGuy444/Real-ESRGAN-ONNX/resolve/main/onnx/model.onnx" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
