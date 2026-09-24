#!/usr/bin/env pwsh
# =============================================================================
# azdo-create-pull-requests.ps1
# =============================================================================
#
# WHAT: Opens one pull request per repository (orchestration + configuration)
#       for each deployment-pattern story branch listed below, targeting
#       'main'. Every branch here has its build-artifacts and release-canary
#       pipelines validated green; release-production is intentionally not
#       part of this - Production runs only after these merge to main.
#
#       Idempotent - skips a branch/repository pair that already has an
#       active PR open from that source branch.
#
#       Every pattern's description also credits tests/ci.yml and
#       tests/integration.yml (the shared CI and What-If Integration
#       quality-check pipelines). As of this writing those files are only
#       committed and pushed for platform-network-dns,
#       platform-network-control-plane, and platform-observability; commit
#       and push the tests/ folder in the other five orchestration
#       worktrees first, or their PRs will not actually contain those files
#       despite the description mentioning them.
#
# REQUIRES:
#   - az login (against the tenant that owns dev.azure.com/gemeente-den-haag)
#   - az extension add --name azure-devops
#   - "Contribute" + "Create branch"/"PR create" permission on both repos
#
# USAGE:
#   pwsh ./azdo-create-pull-requests.ps1
#   pwsh ./azdo-create-pull-requests.ps1 -Draft
#   pwsh ./azdo-create-pull-requests.ps1 -WhatIf
# =============================================================================

[CmdletBinding(SupportsShouldProcess)]
param(
    [string] $AdoOrganization = 'https://dev.azure.com/gemeente-den-haag',

    [string] $AdoProject = 'Azure Control Plane',

    [string] $TargetBranch = 'main',

    [switch] $Draft
)

$ErrorActionPreference = 'Stop'

function Get-PatternPrBody {
    <#
    .SYNOPSIS
        Builds a PR description from a bullet list plus a trailing story reference.
    #>
    param(
        [Parameter(Mandatory)] [string] $Summary,
        [Parameter(Mandatory)] [string[]] $Bullets,
        [Parameter(Mandatory)] [int] $Story
    )

    $bulletLines = ($Bullets | ForEach-Object { "- $_" }) -join "`n"
    return "$Summary`n`n$bulletLines`n`nStory: $Story"
}

$commonBullets = @(
    'Adds build-artifacts.yml, release-canary.yml, and release-production.yml wired to the shared orchestration templates.'
    'Adds README.md documenting pipeline registration and usage.'
    'Adds tests/ci.yml and tests/integration.yml, wiring this pattern into the shared CI and What-If Integration quality-check pipelines.'
    'Build and Canary are validated end to end on the registered pipelines. Production is intentionally not run before this merge; it follows after main is updated.'
)

$Patterns = @(
    [pscustomobject]@{
        Story   = 9104
        Pattern = 'platform-network-dns'
        Branch  = 'feature/wcamargo/9104-platform-network-dns-pipeline-configuration'
        Title   = 'Migrate Platform Network DNS to the shared pipeline model'
        Description = Get-PatternPrBody -Story 9104 -Bullets $commonBullets `
            -Summary 'Migrates Platform Network DNS to the shared build/Canary/Production pipeline model.'
    }
    [pscustomobject]@{
        Story   = 9121
        Pattern = 'landing-zone-firewall-rules'
        Branch  = 'feature/wcamargo/9121-landing-zone-firewall-rules-pipeline-configuration'
        Title   = 'Migrate Landing Zone Firewall Rules to the shared pipeline model'
        Description = Get-PatternPrBody -Story 9121 -Bullets (
            @('Adds build-artifacts.yml, release-canary.yml, and release-production.yml wired to the shared orchestration templates.') +
            @('Renames the base parameter input and generates numbered, alphabetically-discovered parameter files (production before non-production).') +
            $commonBullets[1..3]
        ) -Summary 'Migrates Landing Zone Firewall Rules to the shared build/Canary/Production pipeline model.'
    }
    [pscustomobject]@{
        Story   = 9123
        Pattern = 'platform-network-control-plane'
        Branch  = 'feature/wcamargo/9123-platform-network-control-plane-configuration'
        Title   = 'Migrate Platform Network Control Plane to the shared pipeline model'
        Description = Get-PatternPrBody -Story 9123 -Bullets $commonBullets `
            -Summary 'Migrates Platform Network Control Plane to the shared build/Canary/Production pipeline model.'
    }
    [pscustomobject]@{
        Story   = 9124
        Pattern = 'platform-network-hub'
        Branch  = 'feature/wcamargo/9124-platform-network-hub-pipeline-configuration'
        Title   = 'Migrate Platform Network Hub to the shared pipeline model'
        Description = Get-PatternPrBody -Story 9124 -Bullets $commonBullets `
            -Summary 'Migrates Platform Network Hub to the shared build/Canary/Production pipeline model.'
    }
    [pscustomobject]@{
        Story   = 9125
        Pattern = 'platform-observability'
        Branch  = 'feature/wcamargo/9125-platform-observability-pipeline-configuration'
        Title   = 'Migrate Platform Observability to the shared pipeline model'
        Description = Get-PatternPrBody -Story 9125 -Bullets $commonBullets `
            -Summary 'Migrates Platform Observability to the shared build/Canary/Production pipeline model.'
    }
    [pscustomobject]@{
        Story   = 9126
        Pattern = 'tenant-control-plane'
        Branch  = 'feature/wcamargo/9126-tenant-control-plane-pipeline-configuration'
        Title   = 'Migrate Tenant Control Plane to the shared pipeline model'
        Description = Get-PatternPrBody -Story 9126 -Bullets (
            @(
                'Adds build-artifacts.yml and release.yml/release-canary.yml/release-production.yml wired to ' +
                'the shared orchestration templates, preserving the hierarchy -> role-assignment -> compliance/remediation job order.'
            ) +
            @('Retires the legacy azure-pipelines.yml / tenant-control-plane.yml single-entry-point composition.') +
            $commonBullets[1..3]
        ) -Summary 'Migrates Tenant Control Plane to the shared build/Canary/Production pipeline model.'
    }
    [pscustomobject]@{
        Story   = 9127
        Pattern = 'tenant-iam-vending'
        Branch  = 'feature/wcamargo/9127-tenant-iam-vending-pipeline-configuration'
        Title   = 'Migrate Tenant IAM Vending to the shared pipeline model'
        Description = Get-PatternPrBody -Story 9127 -Bullets (
            @(
                'Adds build-artifacts.yml, release-canary.yml, and release-production.yml wired to the shared ' +
                "orchestration templates. Configuration is read from Tenant Control Plane's tree by design; see README's 'Configuration dependency' section."
            ) +
            @('Retires the legacy azure-pipelines.yml / tenant-iam-vending.yml single-entry-point composition.') +
            $commonBullets[1..3]
        ) -Summary 'Migrates Tenant IAM Vending to the shared build/Canary/Production pipeline model.'
    }
    [pscustomobject]@{
        Story   = 9338
        Pattern = 'platform-network-data-plane'
        Branch  = 'feature/wcamargo/9338-platform-network-data-plane-pipeline-configuration'
        Title   = 'Migrate Platform Network Data Plane to the shared pipeline model'
        Description = Get-PatternPrBody -Story 9338 -Bullets (
            @(
                'Adds build-artifacts.yml, release-canary.yml, and release-production.yml wired to the shared ' +
                'orchestration templates, with explicit preSteps artifact downloads for the deployment and commit/verify jobs.'
            ) +
            $commonBullets[1..3]
        ) -Summary 'Migrates Platform Network Data Plane to the shared build/Canary/Production pipeline model.'
    }
    [pscustomobject]@{
        Story   = 8933
        Pattern = 'shared-pipeline-baseline (enable pipelines to run independently)'
        Branch  = 'feature/wcamargo/8933-enable-pipelines-to-run-independently'
        Title   = 'Enable deployment-pattern pipelines to run independently'
        Description = Get-PatternPrBody -Story 8933 -Bullets @(
            'Adds the orchestrationRepositoryRef parameter to pipeline configurations for dynamic branch referencing.'
            'Updates pipeline configurations so each pattern can run independently, and adjusts schedules accordingly.'
            'Pins the build-artifacts resource to main for scheduled Canary resolution.'
            'Runs the Canary drift-control schedule even when there are no changes.'
        ) -Summary 'Foundational change enabling each deployment pattern to build and release independently, ahead of the per-pattern shared-pipeline-model migrations.'
    }
    [pscustomobject]@{
        Story   = 8935
        Pattern = 'shared-pipeline-baseline (multiple configuration files)'
        Branch  = 'feature/wcamargo/8935-enable-multiple-configuration-files'
        Title   = 'Enable multiple configuration files per deployment pattern'
        Description = Get-PatternPrBody -Story 8935 -Bullets @(
            'Adds support for multiple configuration files per deployment pattern and enhances the deployment scripts.'
            'Updates bicep-build-stage.yml to filter for JSONC files and exclude test/examples directories.'
            'Documents the shared pipeline model and Phoenix One usage.'
            'Includes the persistCredentials fix for the orchestration repository checkout in bicep-build-stage.yml.'
            'Builds on feature/wcamargo/8933-enable-pipelines-to-run-independently, already merged into this branch.'
        ) -Summary 'Foundational change enabling multiple configuration files per deployment pattern, the shared-interface baseline every pattern migration below branches from.'
    }
)

# Deliberately excluded:
# - phoenix-one (9117): source branch tracks a different upstream
#   (origin/feature/wcamargo/8935-enable-multiple-configuration-files-merge)
#   instead of its own name - resolve that mismatch before opening a PR.
# - landing-zone-vending (9117): still on the pre-migration baseline, no
#   pipelines registered yet.

$Repositories = @('azure-control-plane-orchestration', 'azure-control-plane-configuration')

function Get-AdoActivePullRequest {
    <#
    .SYNOPSIS
        Returns an existing active PR from the given source branch, or $null.
    #>
    param(
        [Parameter(Mandatory)] [string] $Repository,
        [Parameter(Mandatory)] [string] $SourceBranch,
        [Parameter(Mandatory)] [string] $Organization,
        [Parameter(Mandatory)] [string] $Project
    )

    $listArgs = @(
        'repos', 'pr', 'list',
        '--repository', $Repository,
        '--source-branch', $SourceBranch,
        '--status', 'active',
        '--organization', $Organization,
        '--project', $Project,
        '--detect', 'false',
        '--output', 'json'
    )
    $prs = az @listArgs | ConvertFrom-Json
    if ($null -eq $prs -or $prs.Count -eq 0) {
        return $null
    }
    return $prs[0]
}

Write-Host "Checking Azure CLI login..."
$account = az account show --output json 2>$null | ConvertFrom-Json
if ($null -eq $account) {
    throw "Not logged in. Run 'az login' against the tenant that owns ${AdoOrganization} first."
}
Write-Host "Logged in as $($account.user.name)"

$createdPrs = @()

foreach ($item in $Patterns) {
    Write-Host ""
    Write-Host "=== $($item.Pattern) (story $($item.Story)) ===" -ForegroundColor Cyan

    foreach ($repository in $Repositories) {
        Write-Host "  --- $repository"

        $existing = Get-AdoActivePullRequest -Repository $repository -SourceBranch $item.Branch -Organization $AdoOrganization -Project $AdoProject
        if ($existing) {
            Write-Host "    Already has an active PR: !$($existing.pullRequestId). Skipping."
            continue
        }

        if (-not $PSCmdlet.ShouldProcess("$repository : $($item.Branch) -> $TargetBranch", 'Create pull request')) {
            continue
        }

        $createArgs = @(
            'repos', 'pr', 'create',
            '--repository', $repository,
            '--source-branch', $item.Branch,
            '--target-branch', $TargetBranch,
            '--title', $item.Title,
            '--description', $item.Description,
            '--organization', $AdoOrganization,
            '--project', $AdoProject,
            '--detect', 'false',
            '--output', 'json'
        )
        if ($Draft) {
            $createArgs += '--draft'
        }

        $created = az @createArgs | ConvertFrom-Json
        $prUrl = "$AdoOrganization/$([uri]::EscapeDataString($AdoProject))/_git/$repository/pullrequest/$($created.pullRequestId)"
        Write-Host "    Created PR !$($created.pullRequestId): $prUrl" -ForegroundColor Green
        $createdPrs += [pscustomobject]@{
            pattern    = $item.Pattern
            repository = $repository
            prId       = $created.pullRequestId
            url        = $prUrl
        }
    }
}

Write-Host ""
Write-Host "Created $($createdPrs.Count) pull request(s)."
