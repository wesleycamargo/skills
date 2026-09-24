#!/usr/bin/env pwsh
# =============================================================================
# 03-register-pipelines.ps1 — Register CI and integration pipelines in ADO
# =============================================================================
#
# WHAT:  Creates two pipeline definitions in ADO under the folder
#        \azure-control-plane\quality-checks:
#
#          _phoenix-one-ci          → deployment-patterns/_phoenix-one/tests/ci.yml
#          _phoenix-one-integration → deployment-patterns/_phoenix-one/tests/integration.yml
#
#        The CI pipeline name MUST be '_phoenix-one-ci' — the integration pipeline's
#        resources.pipelines[0].source references that exact folder+name path.
#        Idempotent — skips pipelines that already exist.
#
# WHEN:  Run once after 01-push-to-ado.ps1 has succeeded and the ADO repo has content.
#
# REQUIRES:
#   - `az login` + azure-devops CLI extension
#   - "Edit build pipeline" permission in the ADO project.
#     If you get 403: ADO → Project Settings → Pipelines → Security →
#     grant your account "Edit build pipeline" = Allow.
#
# USAGE:  pwsh scripts/03-register-pipelines.ps1
# =============================================================================

$ErrorActionPreference = 'Stop'

$AdoOrg     = 'https://dev.azure.com/ai-experiments'
$AdoProject = 'Pipelines'
$AdoRepo    = 'deployment-patterns'
$Branch     = 'master'
$Folder     = '\azure-control-plane\quality-checks'

function New-PipelineIfNotExists {
    param(
        [string] $Name,
        [string] $YmlPath
    )

    Write-Host "---`nPipeline: ${Name}"

    $All = az pipelines list `
        --org $AdoOrg `
        --project $AdoProject `
        --folder-path $Folder `
        --output json | ConvertFrom-Json

    $Existing = $All | Where-Object { $_.name -eq $Name }
    if ($Existing) {
        Write-Host "  Already exists (id=$($Existing.id)). Skipping."
        return
    }

    $Result = az pipelines create `
        --name $Name `
        --folder-path $Folder `
        --yml-path $YmlPath `
        --repository $AdoRepo `
        --repository-type tfsgit `
        --branch $Branch `
        --org $AdoOrg `
        --project $AdoProject `
        --skip-first-run `
        --output json | ConvertFrom-Json

    Write-Host "  Created pipeline id=$($Result.id)"
}

New-PipelineIfNotExists -Name '_phoenix-one-ci'          -YmlPath 'deployment-patterns/_phoenix-one/tests/ci.yml'
New-PipelineIfNotExists -Name '_phoenix-one-integration' -YmlPath 'deployment-patterns/_phoenix-one/tests/integration.yml'

Write-Host "---`nDone. Both pipelines registered under ${Folder}."
Write-Host ""
Write-Host "Authorizing resources (service connection, repository, environment)..."
& "$PSScriptRoot/03b-authorize-resources.ps1"
