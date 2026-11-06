# Smoke test after Docker Compose is running. No NVIDIA tokens are spent.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Write-Host '[1/5] Checking Docker services...' -ForegroundColor Cyan
docker compose ps --status running
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed.' }
Write-Host '[2/5] Checking API and runner...' -ForegroundColor Cyan
$health = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:8787/api/health' -TimeoutSec 15
if (-not $health.ok) { throw 'Backend healthcheck failed.' }
if (-not $health.runner.available) { throw "Runner unavailable: $($health.runner.detail)" }
Write-Host '[3/5] Checking real Lean 4 compiler...' -ForegroundColor Cyan
$lean = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/api/lean/check' -ContentType 'application/json' -Body '{"source":"theorem test_identity (p : Prop) : p -> p := by\n  intro h\n  exact h"}' -TimeoutSec 90
if (-not $lean.passed) { throw "Lean proof failed: $($lean.output)" }
Write-Host '[4/5] Checking refusal of admitted proofs...' -ForegroundColor Cyan
$bad = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8787/api/lean/check' -ContentType 'application/json' -Body '{"source":"axiom bad : False"}' -TimeoutSec 15
if ($bad.passed) { throw 'Security regression: axiom was accepted.' }
Write-Host '[5/5] Running Python tests inside isolated runner...' -ForegroundColor Cyan
docker compose exec -T runner sh -lc 'cd /workspace && python3 -m unittest discover -v'
if ($LASTEXITCODE -ne 0) { throw 'Python workspace tests failed.' }
Write-Host 'PASS: Docker, API, runner, Lean proof, rejection policy and Python tests.' -ForegroundColor Green
Write-Host 'To test NVIDIA API separately, click Testar conexão NVIDIA in Configuração.'
