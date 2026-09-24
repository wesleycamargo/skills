#!/usr/bin/env pwsh
# =============================================================================
# azdo-rerun-stale-pipelines.ps1
# =============================================================================
#
# WHAT: Re-queues the pipeline runs flagged by the latest azdo-validate.ps1
#       report as stale or broken:
#
#         platform-network-data-plane-build-artifacts  (still failing - see
#             NOTE below, this one will likely fail again until the root
#             cause in the linked log is fixed and committed)
#         platform-observability-release-canary        (stale vs. latest build)
#         tenant-control-plane-release-canary           (stale vs. latest build)
#         tenant-iam-vending-release-canary             (stale vs. latest build)
#
#       Each pipeline is queued on the branch tip of its own story branch.
#       Production pipelines are intentionally NOT included - by direction,
#       Production does not run until after the main merge.
#
# REQUIRES:
#   - az login (against the tenant that owns dev.azure.com/gemeente-den-haag)
#   - az extension add --name azure-devops
#   - "Queue builds" permission on each pattern's folder
#
# USAGE:
#   pwsh ./azdo-rerun-stale-pipelines.ps1
#   pwsh ./azdo-rerun-stale-pipelines.ps1 -IncludePhoenixOneSanityCheck
#   pwsh ./azdo-rerun-stale-pipelines.ps1 -WhatIf
# =============================================================================

[CmdletBinding(SupportsShouldProcess)]
param(
    [string] $AdoOrganization = 'https://dev.azure.com/gemeente-den-haag',

    [string] $AdoProject = 'Azure Control Plane',

    [switch] $IncludePhoenixOneSanityCheck
)

$ErrorActionPreference = 'Stop'

$RunsToQueue = @(
    [pscustomobject]@{
        PipelineName          = 'platform-network-data-plane-build-artifacts'
        FolderPath             = '\azure-control-plane\platform-network-data-plane'
        Branch                 = 'feature/wcamargo/9338-platform-network-data-plane-pipeline-configuration'
        Reason                 = 'Still failing on the last run (180955) - diagnose the log before expecting this to go green'
        UpstreamBuildPattern   = $null
    }
    [pscustomobject]@{
        PipelineName          = 'platform-observability-release-canary'
        FolderPath             = '\azure-control-plane\platform-observability'
        Branch                 = 'feature/wcamargo/9125-platform-observability-pipeline-configuration'
        Reason                 = 'Last Canary run predates the latest build commit'
        UpstreamBuildPattern   = 'platform-observability'
    }
    [pscustomobject]@{
        PipelineName          = 'tenant-control-plane-release-canary'
        FolderPath             = '\azure-control-plane\tenant-control-plane'
        Branch                 = 'feature/wcamargo/9126-tenant-control-plane-pipeline-configuration'
        Reason                 = 'Last Canary run predates the latest build commit'
        UpstreamBuildPattern   = 'tenant-control-plane'
    }
    [pscustomobject]@{
        PipelineName          = 'tenant-iam-vending-release-canary'
        FolderPath             = '\azure-control-plane\tenant-iam-vending'
        Branch                 = 'feature/wcamargo/9127-tenant-iam-vending-pipeline-configuration'
        Reason                 = 'Last Canary run predates the latest build commit'
        UpstreamBuildPattern   = 'tenant-iam-vending'
    }
)

# if ($IncludePhoenixOneSanityCheck) {
#     $RunsToQueue += [pscustomobject]@{
#         PipelineName = 'phoenix-one-build-artifacts'
#         FolderPath   = '\azure-control-plane\phoenix-one'
#         Branch       = 'main'
#         Reason       = 'Last run was queued against a different pattern''s feature branch; re-verify on its own branch'
#     }
# }

function Get-AdoPipelineByName {
    <#
    .SYNOPSIS
        Resolves a pipeline definition object by name within an ADO folder.
    #>
    param(
        [Parameter(Mandatory)] [string] $PipelineName,
        [Parameter(Mandatory)] [string] $FolderPath,
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
    return ($pipelines | Where-Object { $_.name -eq $PipelineName })
}

function Get-LatestSucceededRunId {
    <#
    .SYNOPSIS
        Returns the run ID of the most recent succeeded run for a pipeline, or $null.
    .DESCRIPTION
        Used to pin a release pipeline's 'build-artifacts' resource explicitly.
        The YAML's own resource filter defaults to 'branch: main', which none of
        these patterns have ever built on - triggering without an explicit
        --resources override leaves ADO unable to resolve that resource and the
        run fails instantly at queue/validation time.
    #>
    param(
        [Parameter(Mandatory)] [int] $PipelineId,
        [Parameter(Mandatory)] [string] $Organization,
        [Parameter(Mandatory)] [string] $Project
    )

    $runsArgs = @(
        'pipelines', 'runs', 'list',
        '--pipeline-ids', $PipelineId,
        '--result', 'succeeded',
        '--organization', $Organization,
        '--project', $Project,
        '--top', '1',
        '--detect', 'false',
        '--output', 'json'
    )
    $runs = az @runsArgs | ConvertFrom-Json
    if ($null -eq $runs -or $runs.Count -eq 0) {
        return $null
    }
    return $runs[0].id
}

function Start-AdoPipelineRun {
    <#
    .SYNOPSIS
        Queues a run for a folder-qualified pipeline on a specific branch.
    .DESCRIPTION
        Resolves the pipeline by name within its folder, then calls
        'az pipelines run' on the requested branch. When $UpstreamBuildPattern
        is supplied, first resolves that pattern's latest succeeded
        '<pattern>-build-artifacts' run and pins the release pipeline's
        'build-artifacts' resource to it via --resources, instead of letting
        ADO fall back to the YAML's 'branch: main' default (which never has a
        matching build for these patterns). Returns the created run object, or
        $null if the pipeline could not be found or queuing was skipped.
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)] [string] $PipelineName,
        [Parameter(Mandatory)] [string] $FolderPath,
        [Parameter(Mandatory)] [string] $Branch,
        [string] $UpstreamBuildPattern,
        [Parameter(Mandatory)] [string] $Organization,
        [Parameter(Mandatory)] [string] $Project
    )

    $match = Get-AdoPipelineByName -PipelineName $PipelineName -FolderPath $FolderPath -Organization $Organization -Project $Project
    if ($null -eq $match) {
        Write-Host "  NOT FOUND under $FolderPath - skipping" -ForegroundColor Yellow
        return $null
    }

    $runArgs = @(
        'pipelines', 'run',
        '--id', $match.id,
        '--branch', $Branch,
        '--organization', $Organization,
        '--project', $Project,
        '--detect', 'false',
        '--output', 'json'
    )

    if ($UpstreamBuildPattern) {
        $buildPipelineName = "$UpstreamBuildPattern-build-artifacts"
        $buildPipeline = Get-AdoPipelineByName -PipelineName $buildPipelineName -FolderPath $FolderPath -Organization $Organization -Project $Project
        if ($null -eq $buildPipeline) {
            Write-Host "  Upstream pipeline '$buildPipelineName' not found - skipping" -ForegroundColor Yellow
            return $null
        }

        $upstreamRunId = Get-LatestSucceededRunId -PipelineId $buildPipeline.id -Organization $Organization -Project $Project
        if ($null -eq $upstreamRunId) {
            Write-Host "  No succeeded run of '$buildPipelineName' found to pin - skipping" -ForegroundColor Yellow
            return $null
        }

        Write-Host "  Pinning build-artifacts resource to run $upstreamRunId ($buildPipelineName)"
        $resources = @{ pipelines = @{ 'build-artifacts' = @{ version = "$upstreamRunId" } } } | ConvertTo-Json -Depth 5 -Compress
        $runArgs += @('--resources', $resources)
    }

    if (-not $PSCmdlet.ShouldProcess($PipelineName, "Queue run on branch $Branch")) {
        return $null
    }

    return (az @runArgs | ConvertFrom-Json)
}

Write-Host "Checking Azure CLI login..."
$account = az account show --output json 2>$null | ConvertFrom-Json
if ($null -eq $account) {
    throw "Not logged in. Run 'az login' against the tenant that owns ${AdoOrganization} first."
}
Write-Host "Logged in as $($account.user.name)"
Write-Host ""

$queuedRuns = @()

foreach ($item in $RunsToQueue) {
    Write-Host "--- $($item.PipelineName)"
    Write-Host "    Reason: $($item.Reason)"
    Write-Host "    Branch: $($item.Branch)"

    $startArgs = @{
        PipelineName         = $item.PipelineName
        FolderPath           = $item.FolderPath
        Branch               = $item.Branch
        UpstreamBuildPattern = $item.UpstreamBuildPattern
        Organization         = $AdoOrganization
        Project              = $AdoProject
    }
    $run = Start-AdoPipelineRun @startArgs
    if ($null -eq $run) {
        continue
    }

    $webUrl = "$AdoOrganization/$([uri]::EscapeDataString($AdoProject))/_build/results?buildId=$($run.id)"
    Write-Host "    Queued: runId=$($run.id)  $webUrl" -ForegroundColor Cyan
    $queuedRuns += [pscustomobject]@{
        pipelineName = $item.PipelineName
        runId        = $run.id
        webUrl       = $webUrl
    }
    Write-Host ""
}

Write-Host "Queued $($queuedRuns.Count) run(s)."
Write-Host "Re-run azdo-validate.ps1 once these finish to pick up the new results."
