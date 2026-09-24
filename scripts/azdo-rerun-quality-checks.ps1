#!/usr/bin/env pwsh
# =============================================================================
# azdo-rerun-quality-checks.ps1
# =============================================================================
#
# WHAT: Queues '<pattern>-ci' for every pattern in -Patterns first, waits for
#       all of them to complete (polling round-robin, not one at a time), then
#       queues '<pattern>-integration' for each pattern whose CI produced a
#       usable run - pinned via --resources to that CI run.
#
#       tests/integration.yml consumes a 'build-artifacts'-aliased pipeline
#       resource pointing at \azure-control-plane\quality-checks\<pattern>-ci
#       with no 'branch:' pin, the same shape that caused release-canary to
#       fail instantly when queued without an explicit resource. Pinning
#       --resources to the CI run just queued (or the latest succeeded CI
#       run, if the fresh one failed) avoids that here too.
#
# REQUIRES:
#   - az login (against the tenant that owns dev.azure.com/gemeente-den-haag)
#   - az extension add --name azure-devops
#   - "Queue builds" permission on \azure-control-plane\quality-checks
#
# USAGE:
#   pwsh ./azdo-rerun-quality-checks.ps1
#   pwsh ./azdo-rerun-quality-checks.ps1 -Patterns tenant-control-plane
#   pwsh ./azdo-rerun-quality-checks.ps1 -WhatIf
# =============================================================================

[CmdletBinding(SupportsShouldProcess)]
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

    [int] $PollIntervalSeconds = 15,

    [int] $TimeoutSeconds = 900
)

$ErrorActionPreference = 'Stop'

$FolderPath = '\azure-control-plane\quality-checks'

# Branch each pattern's story work lives on - queued explicitly rather than
# relying on a pipeline's own default branch.
$PatternBranches = @{
    'platform-network-dns'            = 'feature/wcamargo/9104-platform-network-dns-pipeline-configuration'
    'platform-network-control-plane'  = 'feature/wcamargo/9123-platform-network-control-plane-configuration'
    'platform-network-hub'            = 'feature/wcamargo/9124-platform-network-hub-pipeline-configuration'
    'platform-network-data-plane'     = 'feature/wcamargo/9338-platform-network-data-plane-pipeline-configuration'
    'platform-observability'          = 'feature/wcamargo/9125-platform-observability-pipeline-configuration'
    'tenant-control-plane'            = 'feature/wcamargo/9126-tenant-control-plane-pipeline-configuration'
    'tenant-iam-vending'              = 'feature/wcamargo/9127-tenant-iam-vending-pipeline-configuration'
    'landing-zone-firewall-rules'     = 'feature/wcamargo/9121-landing-zone-firewall-rules-pipeline-configuration'
    'phoenix-one'                     = 'feature/wcamargo/9117-phoenix-one-pipeline-configuration'
}

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

function Get-AdoRunStatus {
    <#
    .SYNOPSIS
        Returns the current status/result of a run.
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

function Start-AdoPipelineRun {
    <#
    .SYNOPSIS
        Queues a run for a folder-qualified pipeline on a specific branch,
        optionally pinning an upstream 'build-artifacts'-aliased resource to
        a specific run ID.
    .NOTES
        The 'azure-devops' CLI extension installed in this container (1.0.8)
        does not expose a --resources argument on 'az pipelines run' at all -
        its pipeline_run() only ever builds resources.repositories.self from
        --branch/--commit-id, so any --resources value is rejected as an
        unrecognized argument. Pinning a 'pipelines'-type resource (like
        build-artifacts) requires calling the Pipelines - Run Pipeline REST
        API directly via 'az devops invoke', which this reserves for the
        $UpstreamRunId case; the plain-branch case keeps using
        'az pipelines run' since that works fine and needs no JSON body.
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)] [string] $PipelineName,
        [Parameter(Mandatory)] [string] $FolderPath,
        [Parameter(Mandatory)] [string] $Branch,
        [int] $UpstreamRunId,
        [Parameter(Mandatory)] [string] $Organization,
        [Parameter(Mandatory)] [string] $Project
    )

    $match = Get-AdoPipelineByName -PipelineName $PipelineName -FolderPath $FolderPath -Organization $Organization -Project $Project
    if ($null -eq $match) {
        Write-Host "  NOT FOUND under $FolderPath - skipping" -ForegroundColor Yellow
        return $null
    }

    if (-not $PSCmdlet.ShouldProcess($PipelineName, "Queue run on branch $Branch")) {
        return $null
    }

    if (-not $UpstreamRunId) {
        $runArgs = @(
            'pipelines', 'run',
            '--id', $match.id,
            '--branch', $Branch,
            '--organization', $Organization,
            '--project', $Project,
            '--detect', 'false',
            '--output', 'json'
        )
        return (az @runArgs | ConvertFrom-Json)
    }

    Write-Host "    Pinning build-artifacts resource to run $UpstreamRunId"
    $refName = if ($Branch -like 'refs/*') { $Branch } else { "refs/heads/$Branch" }
    $body = @{
        resources = @{
            repositories = @{ self = @{ refName = $refName } }
            pipelines    = @{ 'build-artifacts' = @{ version = "$UpstreamRunId" } }
        }
    } | ConvertTo-Json -Depth 5

    $bodyFile = New-TemporaryFile
    try {
        Set-Content -Path $bodyFile -Value $body -NoNewline -Encoding utf8
        $invokeArgs = @(
            'devops', 'invoke',
            '--area', 'pipelines',
            '--resource', 'runs',
            '--route-parameters', "project=$Project", "pipelineId=$($match.id)",
            '--http-method', 'POST',
            '--api-version', '7.1',
            '--in-file', $bodyFile,
            '--organization', $Organization,
            '--detect', 'false',
            '--output', 'json'
        )
        return (az @invokeArgs | ConvertFrom-Json)
    } finally {
        Remove-Item -Path $bodyFile -ErrorAction SilentlyContinue
    }
}

Write-Host "Checking Azure CLI login..."
$account = az account show --output json 2>$null | ConvertFrom-Json
if ($null -eq $account) {
    throw "Not logged in. Run 'az login' against the tenant that owns ${AdoOrganization} first."
}
Write-Host "Logged in as $($account.user.name)"

# --- Phase 1: queue every pattern's CI run up front ---------------------
Write-Host ""
Write-Host "=== Phase 1: queuing all CI runs ===" -ForegroundColor Cyan

$ciRuns = @{}
foreach ($pattern in $Patterns) {
    $branch = $PatternBranches[$pattern]
    if (-not $branch) {
        Write-Host "  $pattern`: no known branch - skipping" -ForegroundColor Yellow
        continue
    }

    $ciPipelineName = "$pattern-ci"
    Write-Host "  --- $ciPipelineName"
    $ciStartArgs = @{
        PipelineName = $ciPipelineName
        FolderPath   = $FolderPath
        Branch       = $branch
        Organization = $AdoOrganization
        Project      = $AdoProject
    }
    $ciRun = Start-AdoPipelineRun @ciStartArgs
    if ($null -eq $ciRun) {
        continue
    }
    Write-Host "    Queued: runId=$($ciRun.id)" -ForegroundColor Cyan
    $ciRuns[$pattern] = [pscustomobject]@{
        RunId  = $ciRun.id
        Status = 'unknown'
        Result = $null
    }
}

if ($ciRuns.Count -eq 0) {
    Write-Host ""
    Write-Host "No CI runs were queued. Nothing to wait for." -ForegroundColor Yellow
    return
}

# --- Phase 2: wait for all CI runs to complete, round-robin -------------
Write-Host ""
Write-Host "=== Phase 2: waiting for $($ciRuns.Count) CI run(s) to complete ===" -ForegroundColor Cyan

$elapsed = 0
while ($elapsed -lt $TimeoutSeconds) {
    $pending = $ciRuns.GetEnumerator() | Where-Object { $_.Value.Status -ne 'completed' }
    if ($pending.Count -eq 0) {
        break
    }

    foreach ($entry in $pending) {
        $run = Get-AdoRunStatus -RunId $entry.Value.RunId -Organization $AdoOrganization -Project $AdoProject
        $entry.Value.Status = $run.status
        $entry.Value.Result = $run.result
        if ($run.status -eq 'completed') {
            $color = if ($run.result -eq 'succeeded') { 'Green' } else { 'Red' }
            Write-Host "  $($entry.Key): $($run.result)" -ForegroundColor $color
        }
    }

    $stillPending = $ciRuns.GetEnumerator() | Where-Object { $_.Value.Status -ne 'completed' }
    if ($stillPending.Count -gt 0) {
        Write-Host "  ...waiting on $($stillPending.Count) run(s) ($($elapsed)s elapsed)"
        Start-Sleep -Seconds $PollIntervalSeconds
        $elapsed += $PollIntervalSeconds
    }
}

$timedOut = $ciRuns.GetEnumerator() | Where-Object { $_.Value.Status -ne 'completed' }
foreach ($entry in $timedOut) {
    Write-Host "  $($entry.Key): timed out after ${TimeoutSeconds}s, still $($entry.Value.Status)" -ForegroundColor Yellow
}

# --- Phase 3: queue Integration, pinned to each pattern's CI run --------
Write-Host ""
Write-Host "=== Phase 3: queuing Integration runs ===" -ForegroundColor Cyan

foreach ($pattern in $ciRuns.Keys) {
    $ciEntry = $ciRuns[$pattern]
    $branch = $PatternBranches[$pattern]
    $integrationPipelineName = "$pattern-integration"
    Write-Host ""
    Write-Host "  --- $integrationPipelineName"

    $upstreamRunId = $ciEntry.RunId
    if ($ciEntry.Result -ne 'succeeded') {
        Write-Host "    CI result was '$($ciEntry.Status)/$($ciEntry.Result)' - falling back to the last succeeded CI run, if any" -ForegroundColor Yellow
        $ciPipeline = Get-AdoPipelineByName -PipelineName "$pattern-ci" -FolderPath $FolderPath -Organization $AdoOrganization -Project $AdoProject
        $fallbackId = Get-LatestSucceededRunId -PipelineId $ciPipeline.id -Organization $AdoOrganization -Project $AdoProject
        if ($null -eq $fallbackId) {
            Write-Host "    No succeeded CI run exists yet - skipping Integration for $pattern" -ForegroundColor Yellow
            continue
        }
        $upstreamRunId = $fallbackId
    }

    $integrationStartArgs = @{
        PipelineName  = $integrationPipelineName
        FolderPath    = $FolderPath
        Branch        = $branch
        UpstreamRunId = $upstreamRunId
        Organization  = $AdoOrganization
        Project       = $AdoProject
    }
    $integrationRun = Start-AdoPipelineRun @integrationStartArgs
    if ($integrationRun) {
        Write-Host "    Queued: runId=$($integrationRun.id)" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "Done. Run azdo-validate-quality-checks.ps1 to see the results."
