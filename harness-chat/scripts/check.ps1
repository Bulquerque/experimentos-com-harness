$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
Write-Host '1/3 - Harness Node'
node --disable-warning=ExperimentalWarning --experimental-strip-types --test --test-concurrency=1 apps/server/src/*.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Falha nos testes Node' }
Write-Host '2/3 - Frontend'
node --check apps/web/fallback/app.js
node --test qa/frontend-contract.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falha nos contratos do frontend' }
Write-Host '3/3 - Python'
$env:PYTHONPATH = 'workspace'
python -m unittest discover -s workspace/tests -v
if ($LASTEXITCODE -ne 0) { throw 'Falha nos testes Python' }
Write-Host 'PASS: testes locais. Docker, NVIDIA e Lean reais ainda nao verificados.' -ForegroundColor Green
