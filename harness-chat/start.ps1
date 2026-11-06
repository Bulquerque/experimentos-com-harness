$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Arquivo .env criado. Informe NVIDIA_API_KEY para executar tarefas reais.' -ForegroundColor Yellow
}
$envFile = Join-Path $PSScriptRoot '.env'
$envText = [System.IO.File]::ReadAllText($envFile)
if ($envText -notmatch '(?m)^RUNNER_TOKEN=[a-fA-F0-9]{64}$') {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $token = [System.BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
  if ($envText -match '(?m)^RUNNER_TOKEN=') {
    $envText = [regex]::Replace($envText, '(?m)^RUNNER_TOKEN=.*$', ('RUNNER_TOKEN=' + $token))
  } else {
    $envText += [Environment]::NewLine + 'RUNNER_TOKEN=' + $token + [Environment]::NewLine
  }
  [System.IO.File]::WriteAllText($envFile, $envText, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host 'Token seguro gerado para o executor Docker.' -ForegroundColor Yellow
}
if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host 'Docker Desktop não encontrado. Instale Docker Desktop e ative WSL2.' -ForegroundColor Red
  exit 1
}
docker compose version | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Error 'Docker Compose indisponível'; exit 1 }
docker compose up --build -d
if ($LASTEXITCODE -ne 0) { Write-Error 'Falha ao iniciar Docker Compose'; exit 1 }
Write-Host 'Abra http://127.0.0.1:8787' -ForegroundColor Green
Start-Process 'http://127.0.0.1:8787'
