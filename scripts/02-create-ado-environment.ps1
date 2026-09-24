#!/usr/bin/env pwsh
# =============================================================================
# 02-create-ado-environment.ps1 — Create the 'canary' ADO deployment environment
# =============================================================================
#
# WHAT:  Creates the 'canary' environment in the Pipelines ADO project.
#        The integration pipeline deploys to this environment (bicep-deployment-stages.yml
#        maps environments: [Canary] to the lowercased name 'canary').
#        Idempotent — skips creation if the environment already exists.
#
# WHEN:  Run once before triggering the integration pipeline for the first time.
#
# REQUIRES:
#   - `az login` + azure-devops CLI extension installed
#   - "Manage" permission on Pipelines → Environments in the ADO project.
#     If you get 403: ADO → Project Settings → Pipelines → Security →
#     grant your account "Administrator" on Environments.
#
# USAGE:  pwsh scripts/02-create-ado-environment.ps1
# =============================================================================

$ErrorActionPreference = 'Stop'

$AdoOrg     = 'https://dev.azure.com/ai-experiments'
$AdoProject = 'Pipelines'
$EnvName    = 'canary'

Write-Host "Checking if environment '${EnvName}' already exists..."
$Existing = az devops invoke `
    --area distributedtask `
    --resource environments `
    --route-parameters project=$AdoProject `
    --org $AdoOrg `
    --output json | ConvertFrom-Json

$Match = $Existing.value | Where-Object { $_.name -eq $EnvName }
if ($Match) {
    Write-Host "Environment '${EnvName}' already exists (id=$($Match.id)). Nothing to do."
    exit 0
}

Write-Host "Creating environment '${EnvName}'..."
$BodyFile = [System.IO.Path]::GetTempFileName()
@{ name = $EnvName; description = 'Canary quality-check environment for _phoenix-one tests' } |
    ConvertTo-Json | Set-Content -Path $BodyFile

az devops invoke `
    --area distributedtask `
    --resource environments `
    --route-parameters project=$AdoProject `
    --http-method POST `
    --in-file $BodyFile `
    --org $AdoOrg `
    --output json | ConvertFrom-Json | Select-Object id, name, description

Remove-Item $BodyFile
Write-Host "Environment '${EnvName}' created."
