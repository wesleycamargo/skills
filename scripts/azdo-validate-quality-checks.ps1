#!/usr/bin/env pwsh
# =============================================================================
# azdo-validate-quality-checks.ps1
# =============================================================================
#
# WHAT: Same idea as azdo-validate.ps1, but for the quality-check pipelines
#       (tests/ci.yml, tests/integration.yml) instead of the release
#       pipelines (build-artifacts, release-canary, release-production).
#       Reports, per pattern, whether '<pattern>-ci' and
#       '<pattern>-integration' are registered under
#       \azure-control-plane\quality-checks (not the pattern's own folder -
#       tests/integration.yml's own pipeline resource points there), and if
#       so the latest run's status/result/branch/commit. Writes a single
#       JSON report.
#
# REQUIRES:
#   - az login (against the tenant that owns dev.azure.com/gemeente-den-haag)
#   - az extension add --name azure-devops
#   - "View builds" / "View pipeline runs" permission on the folder
#     \azure-control-plane\quality-checks
#
# USAGE:
#   pwsh ./azdo-validate-quality-checks.ps1
#   pwsh ./azdo-validate-quality-checks.ps1 -Patterns tenant-control-plane,tenant-iam-vending
# =============================================================================

[CmdletBinding()]
param(
    [string] $AdoOrganization = 'https://dev.azure.com/gemeente-den-haag',

    [string] $AdoProject = 'Azure Control Plane',

    [string[]] $Patterns = @(
        'platform-network-dns',
        'platform-network-control-plane',
        'platform-network-hub',
        'platform-network-data-plane',
        'platform-observability',
        'tenant-control-plane',
        'tenant-iam-vending',
        'landing-zone-firewall-rules',
        'phoenix-one'
    ),

    [string[]] $PipelineSuffixes = @('ci', 'integration'),

    [string] $OutputPath = (Join-Path -Path $PSScriptRoot -ChildPath 'quality-checks-report.json')
)

$ErrorActionPreference = 'Stop'

function Get-AdoPipelineId {
    <#
    .SYNOPSIS
        Resolves the pipeline definition ID for a folder-qualified pipeline name.
    .DESCRIPTION
        Looks up every pipeline registered under the given ADO folder and returns
        the ID whose name matches, or $null if the pipeline is not registered.
    #>
    param(
        [Parameter(Mandatory)] [string] $FolderPath,
        [Parameter(Mandatory)] [string] $PipelineName,
        [Parameter(Mandatory)] [string] $Organization,
        [Parameter(Mandatory)] [string] $Project
    )

    $listArgs = @(
        'pipelines', 'list',
        '--folder-path', $FolderPath,
        '--organization', $Organization,
        '--project', $Project,
        '--detect', 'false',
        '--output', 'json'
    )
    $pipelines = az @listArgs | ConvertFrom-Json
    $match = $pipelines | Where-Object { $_.name -eq $PipelineName }
    if ($null -eq $match) {
        return $null
    }
    return $match.id
}

function Get-AdoLatestRun {
    <#
    .SYNOPSIS
        Returns the most recent run for a pipeline definition ID, or $null if none exist.
    #>
    param(
        [Parameter(Mandatory)] [int] $PipelineId,
        [Parameter(Mandatory)] [string] $Organization,
        [Parameter(Mandatory)] [string] $Project
    )

    $listArgs = @(
        'pipelines', 'runs', 'list',
        '--pipeline-ids', $PipelineId,
        '--organization', $Organization,
        '--project', $Project,
        '--top', '1',
        '--detect', 'false',
        '--output', 'json'
    )
    $runs = az @listArgs | ConvertFrom-Json
    if ($null -eq $runs -or $runs.Count -eq 0) {
        return $null
    }
    return $runs[0]
}

function Get-AdoRunDetail {
    <#
    .SYNOPSIS
        Returns full run detail (source branch/version, requester, timestamps).
    #>
    param(
        [Parameter(Mandatory)] [int] $RunId,
        [Parameter(Mandatory)] [string] $Organization,
        [Parameter(Mandatory)] [string] $Project
    )

    $showArgs = @(
        'pipelines', 'runs', 'show',
        '--id', $RunId,
        '--organization', $Organization,
        '--project', $Project,
        '--detect', 'false',
        '--output', 'json'
    )
    return (az @showArgs | ConvertFrom-Json)
}

Write-Host "Checking Azure CLI login..."
$account = az account show --output json 2>$null | ConvertFrom-Json
if ($null -eq $account) {
    throw "Not logged in. Run 'az login' against the tenant that owns ${AdoOrganization} first."
}
Write-Host "Logged in as $($account.user.name)"

$report = @()

foreach ($pattern in $Patterns) {
    $folderPath = '\azure-control-plane\quality-checks'
    Write-Host ""
    Write-Host "=== $pattern ($folderPath) ===" -ForegroundColor Cyan

    foreach ($suffix in $PipelineSuffixes) {
        $pipelineName = "$pattern-$suffix"
        Write-Host "  Checking $pipelineName..."

        $entry = [ordered]@{
            pattern       = $pattern
            pipelineName  = $pipelineName
            folderPath    = $folderPath
            registered    = $false
            runId         = $null
            status        = $null
            result        = $null
            sourceBranch  = $null
            sourceVersion = $null
            finishTime    = $null
            webUrl        = $null
        }

        $pipelineId = Get-AdoPipelineId -FolderPath $folderPath -PipelineName $pipelineName -Organization $AdoOrganization -Project $AdoProject
        if ($null -eq $pipelineId) {
            Write-Host "    NOT REGISTERED" -ForegroundColor Yellow
            $report += [pscustomobject]$entry
            continue
        }
        $entry.registered = $true

        $latestRun = Get-AdoLatestRun -PipelineId $pipelineId -Organization $AdoOrganization -Project $AdoProject
        if ($null -eq $latestRun) {
            Write-Host "    Registered, but no runs yet" -ForegroundColor Yellow
            $report += [pscustomobject]$entry
            continue
        }

        $detail = Get-AdoRunDetail -RunId $latestRun.id -Organization $AdoOrganization -Project $AdoProject

        $entry.runId         = $detail.id
        $entry.status        = $detail.status
        $entry.result        = $detail.result
        $entry.sourceBranch  = $detail.sourceBranch
        $entry.sourceVersion = $detail.sourceVersion
        $entry.finishTime    = $detail.finishTime
        $entry.webUrl        = "$AdoOrganization/$([uri]::EscapeDataString($AdoProject))/_build?definitionId=$pipelineId"

        $color = switch ($detail.result) {
            'succeeded' { 'Green' }
            'failed'    { 'Red' }
            default     { 'Yellow' }
        }
        Write-Host "    status=$($detail.status) result=$($detail.result) branch=$($detail.sourceBranch)" -ForegroundColor $color

        $report += [pscustomobject]$entry
    }
}

$report | ConvertTo-Json -Depth 6 | Out-File -FilePath $OutputPath -Encoding utf8
Write-Host ""
Write-Host "Report written to $OutputPath" -ForegroundColor Cyan
$report | Format-Table -Property pattern, pipelineName, registered, status, result, sourceBranch -AutoSize

$missing = $report | Where-Object { -not $_.registered }
Write-Host ""
if ($missing.Count -eq 0) {
    Write-Host "All quality-check pipelines are registered." -ForegroundColor Green
} else {
    Write-Host "Missing quality-check pipelines ($($missing.Count)):" -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host "  - $($_.pipelineName)" -ForegroundColor Yellow }
}
