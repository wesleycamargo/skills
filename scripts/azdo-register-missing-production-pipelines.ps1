#!/usr/bin/env pwsh
# =============================================================================
# azdo-register-missing-production-pipelines.ps1
# =============================================================================
#
# WHAT: Registers the release-production pipelines that are missing in the
#       gemeente-den-haag / "Azure Control Plane" org, per the latest
#       azdo-validate.ps1 report:
#
#         platform-network-control-plane-release-production
#         platform-network-data-plane-release-production
#         landing-zone-firewall-rules-release-production
#
#       Each is created under \azure-control-plane\<pattern>, pointed at
#       release-production.yml in the azure-control-plane-configuration repo,
#       on that pattern's own story branch (matching how the pattern's
#       build-artifacts/release-canary pipelines were already registered).
#       Idempotent - skips any pipeline that already exists. Uses
#       --skip-first-run so registering does not trigger a Production
#       deployment by itself.
#
# REQUIRES:
#   - az login (against the tenant that owns dev.azure.com/gemeente-den-haag)
#   - az extension add --name azure-devops
#   - "Edit build pipeline" permission in the "Azure Control Plane" project
#
# USAGE:
#   pwsh ./azdo-register-missing-production-pipelines.ps1
#   pwsh ./azdo-register-missing-production-pipelines.ps1 -WhatIf
# =============================================================================

[CmdletBinding(SupportsShouldProcess)]
param(
    [string] $AdoOrganization = 'https://dev.azure.com/gemeente-den-haag',

    [string] $AdoProject = 'Azure Control Plane',

    [string] $AdoRepository = 'azure-control-plane-configuration'
)

$ErrorActionPreference = 'Stop'

$PipelinesToRegister = @(
    [pscustomobject]@{
        Pattern = 'platform-network-control-plane'
        Branch  = 'feature/wcamargo/9123-platform-network-control-plane-configuration'
        YmlPath = 'deployment-patterns/platform-network-control-plane/release-production.yml'
    }
    [pscustomobject]@{
        Pattern = 'platform-network-data-plane'
        Branch  = 'feature/wcamargo/9338-platform-network-data-plane-pipeline-configuration'
        YmlPath = 'deployment-patterns/platform-network-data-plane/release-production.yml'
    }
    [pscustomobject]@{
        Pattern = 'landing-zone-firewall-rules'
        Branch  = 'feature/wcamargo/9121-landing-zone-firewall-rules-pipeline-configuration'
        YmlPath = 'deployment-patterns/landing-zone-firewall-rules/release-production.yml'
    }
)

function Register-AdoPipelineIfMissing {
    <#
    .SYNOPSIS
        Creates a folder-qualified pipeline definition if one with that name does not already exist.
    .DESCRIPTION
        Looks up existing pipelines in the target folder, skips creation when a
        matching name is found, otherwise creates the pipeline with
        --skip-first-run so registration does not queue a run.
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)] [string] $Name,
        [Parameter(Mandatory)] [string] $FolderPath,
        [Parameter(Mandatory)] [string] $YmlPath,
        [Parameter(Mandatory)] [string] $Branch,
        [Parameter(Mandatory)] [string] $Organization,
        [Parameter(Mandatory)] [string] $Project,
        [Parameter(Mandatory)] [string] $Repository
    )

    Write-Host "--- Pipeline: $Name"

    $listArgs = @(
        'pipelines', 'list',
        '--folder-path', $FolderPath,
        '--organization', $Organization,
        '--project', $Project,
        '--detect', 'false',
        '--output', 'json'
    )
    $existingPipelines = az @listArgs | ConvertFrom-Json
    $existing = $existingPipelines | Where-Object { $_.name -eq $Name }
    if ($existing) {
        Write-Host "  Already registered (id=$($existing.id)). Skipping."
        return
    }

    if (-not $PSCmdlet.ShouldProcess($Name, "Create pipeline under $FolderPath from $Branch")) {
        return
    }

    $createArgs = @(
        'pipelines', 'create',
        '--name', $Name,
        '--folder-path', $FolderPath,
        '--yml-path', $YmlPath,
        '--repository', $Repository,
        '--repository-type', 'tfsgit',
        '--branch', $Branch,
        '--organization', $Organization,
        '--project', $Project,
        '--skip-first-run',
        '--detect', 'false',
        '--output', 'json'
    )
    $created = az @createArgs | ConvertFrom-Json
    Write-Host "  Created pipeline id=$($created.id)"
}

Write-Host "Checking Azure CLI login..."
$account = az account show --output json 2>$null | ConvertFrom-Json
if ($null -eq $account) {
    throw "Not logged in. Run 'az login' against the tenant that owns ${AdoOrganization} first."
}
Write-Host "Logged in as $($account.user.name)"
Write-Host ""

foreach ($item in $PipelinesToRegister) {
    $registerArgs = @{
        Name         = "$($item.Pattern)-release-production"
        FolderPath   = "\azure-control-plane\$($item.Pattern)"
        YmlPath      = $item.YmlPath
        Branch       = $item.Branch
        Organization = $AdoOrganization
        Project      = $AdoProject
        Repository   = $AdoRepository
    }
    Register-AdoPipelineIfMissing @registerArgs
}

Write-Host ""
Write-Host "Done. Re-run azdo-validate.ps1 to confirm all three now show 'registered = true'."
