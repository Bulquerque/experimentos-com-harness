$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'scripts/check.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
