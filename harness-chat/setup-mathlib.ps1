$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker Desktop não encontrado.' }
Write-Host 'Configurando Mathlib em um contêiner separado, sem chave NVIDIA. Pode consumir vários GB.' -ForegroundColor Cyan
docker compose --profile mathlib run --rm --build mathlib-setup
if ($LASTEXITCODE -ne 0) { throw 'A instalação da Mathlib falhou; Lean Core permanece disponível.' }
Write-Host 'Mathlib pronta em workspace/proofs/mathlib.' -ForegroundColor Green
