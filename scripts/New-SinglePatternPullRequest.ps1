#----------------------------------------------------------------------
# Script: New-SinglePatternPullRequest.ps1
# Description: Opens the Azure DevOps pull request(s) for one SDLC work item,
#              driven by its sdlc/<work-item>/pr-summary.md. Previews the title
#              and description, then creates one PR per repository.
#----------------------------------------------------------------------

# ConfirmImpact High so each PR creation prompts for confirmation by default (the preview is
# printed first); bypass non-interactively with -Confirm:$false, or preview only with -WhatIf.
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    # Work item number, e.g. '9104'. The sdlc/<work-item>-*/pr-summary.md is resolved from it.
    [Parameter(Mandatory)]
    [string] $WorkItem,

    [string] $AdoOrganization = 'https://dev.azure.com/gemeente-den-haag',

    [string] $AdoProject = 'Azure Control Plane',

    [string] $TargetBranch = 'main',

    # Source branch. Resolved from Azure DevOps refs when omitted; required when the work item
    # has more than one matching feature/wcamargo/<work-item>-* branch.
    [string] $SourceBranch,

    # Repositories to open PRs in. Defaults to both control-plane repositories.
    [string[]] $Repository = @('azure-control-plane-orchestration', 'azure-control-plane-configuration'),

    # Create as a draft PR.
    [switch] $Draft,

    # Keep the '## Notes for reviewers' section in the PR body. Omitted by default because those
    # notes are internal draft flags rather than reviewer-facing PR content.
    [switch] $IncludeReviewerNotes,

    # When an active PR already exists for the branch, update its title, description, and work-item
    # link instead of skipping it.
    [switch] $UpdateExisting
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

# On Windows, az's Python process inherits the console's legacy codepage (often cp1252) as its
# stdout encoding unless told otherwise, and crashes with UnicodeEncodeError if any response body
# contains a character outside that codepage. PYTHONUTF8 additionally forces open() (used by az's
# '@<file>' argument loader) to read the description file as UTF-8 rather than the cp1252 default.
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'

function Get-OptionalProperty {
    <#
    .SYNOPSIS
        Reads a property that may be absent on a ConvertFrom-Json object, returning a default
        instead of throwing under Set-StrictMode -Version Latest.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $InputObject,
        [Parameter(Mandatory)] [string] $Name,
        $Default = $null
    )

    if ($null -ne $InputObject -and $InputObject.PSObject.Properties.Name -contains $Name) {
        return $InputObject.$Name
    }
    return $Default
}

function Get-PrSummaryPath {
    <#
    .SYNOPSIS
        Resolves the pr-summary.md path for a work item under the sdlc directory.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)] [string] $SdlcRoot,
        [Parameter(Mandatory)] [string] $WorkItem
    )

    $storyFolder = Get-ChildItem -Path $SdlcRoot -Directory -Filter "$WorkItem-*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $storyFolder) {
        throw "No sdlc/$WorkItem-* directory found under $SdlcRoot."
    }

    $summaryPath = Join-Path $storyFolder.FullName 'pr-summary.md'
    if (-not (Test-Path $summaryPath)) {
        throw "No pr-summary.md in $($storyFolder.FullName). Run the sdlc-create-pull-request skill first."
    }
    return $summaryPath
}

function ConvertFrom-PrSummary {
    <#
    .SYNOPSIS
        Splits a pr-summary.md into its PR title and description body.
    #>
    [CmdletBinding()]
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)] [string] $Path,
        [switch] $IncludeReviewerNotes
    )

    $lines = @(Get-Content -Path $Path)
    if ($lines.Count -eq 0) {
        throw "pr-summary.md at $Path is empty."
    }

    $title = $lines[0] -replace '^#\s*PR:\s*', ''

    # Extract the work-item id from an 'AB#<id>' reference anywhere in the file (used for the
    # --work-items link), then drop the 'Work item: AB#<id>' line from the description body: the
    # association is made through the API call, so the line is redundant in the PR text.
    $workItemId = $null
    if (($lines -join "`n") -match 'AB#(?<id>\d+)') {
        $workItemId = $Matches.id
    }

    $bodyLines = @($lines | Select-Object -Skip 1 | Where-Object { $_ -notmatch '^\s*Work item:\s*AB#' })

    if (-not $IncludeReviewerNotes) {
        $notesIndex = -1
        for ($i = 0; $i -lt $bodyLines.Count; $i++) {
            if ($bodyLines[$i] -match '^##\s*Notes for reviewers') {
                $notesIndex = $i
                break
            }
        }
        if ($notesIndex -ge 0) {
            $bodyLines = @($bodyLines[0..($notesIndex - 1)])
        }
    }

    $body = ($bodyLines -join [System.Environment]::NewLine).Trim()

    return @{
        Title      = $title.Trim()
        Body       = $body
        WorkItemId = $workItemId
    }
}

function Resolve-SourceBranch {
    <#
    .SYNOPSIS
        Finds the single feature/wcamargo/<work-item>-* branch in a repository, or reports ambiguity.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)] [string] $Repository,
        [Parameter(Mandatory)] [string] $WorkItem,
        [Parameter(Mandatory)] [string] $Organization,
        [Parameter(Mandatory)] [string] $Project
    )

    $refs = @(az repos ref list --repository $Repository --filter "heads/feature/wcamargo/$WorkItem-" `
            --organization $Organization --project $Project --detect false -o json | ConvertFrom-Json | Where-Object { $null -ne $_ })
    $branches = @($refs | ForEach-Object { $_.name -replace '^refs/heads/', '' })

    if ($branches.Count -eq 0) {
        throw "No feature/wcamargo/$WorkItem-* branch found in $Repository. Pass -SourceBranch explicitly."
    }
    if ($branches.Count -gt 1) {
        throw "Multiple branches match $WorkItem in ${Repository}: $($branches -join ', '). Pass -SourceBranch explicitly."
    }
    return $branches[0]
}

function Get-AdoActivePullRequest {
    <#
    .SYNOPSIS
        Returns an active pull request for the source branch, when one exists.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $Repository,
        [Parameter(Mandatory)] [string] $SourceBranch,
        [Parameter(Mandatory)] [string] $Organization,
        [Parameter(Mandatory)] [string] $Project
    )

    $pullRequests = @(az repos pr list --repository $Repository --source-branch $SourceBranch --status active `
            --organization $Organization --project $Project --detect false -o json | ConvertFrom-Json | Where-Object { $null -ne $_ })

    if ($pullRequests.Count -eq 0) {
        return $null
    }
    return $pullRequests[0]
}

function Add-PullRequestLink {
    <#
    .SYNOPSIS
        Records a created pull-request URL in the work item's pr-summary.md.
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)] [string] $SummaryPath,
        [Parameter(Mandatory)] [string] $Repository,
        [Parameter(Mandatory)] [string] $Url
    )

    if (-not $PSCmdlet.ShouldProcess($SummaryPath, "Record PR link for $Repository")) {
        return
    }

    $lines = @(Get-Content -Path $SummaryPath)
    if ($lines -notcontains '## Pull requests') {
        $lines += ''
        $lines += '## Pull requests'
    }

    $entry = "- ${Repository}: $Url"
    # Replace an existing line for this repo (idempotent across re-runs/updates) rather than appending.
    $existingIndex = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -like "- ${Repository}: *") {
            $existingIndex = $i
            break
        }
    }
    if ($existingIndex -ge 0) {
        $lines[$existingIndex] = $entry
    } else {
        $lines += $entry
    }
    Set-Content -Path $SummaryPath -Value $lines
}

try {
    $sdlcRoot = Join-Path (Split-Path -Parent $PSScriptRoot) 'sdlc'

    Write-Host 'Checking Azure CLI login...'
    try {
        $account = az account show --output json | ConvertFrom-Json
    } catch {
        throw "Not logged in. Run 'az login' against the tenant that owns $AdoOrganization first."
    }
    Write-Host "Logged in as $($account.user.name)"

    $summaryPath = Get-PrSummaryPath -SdlcRoot $sdlcRoot -WorkItem $WorkItem
    $pr = ConvertFrom-PrSummary -Path $summaryPath -IncludeReviewerNotes:$IncludeReviewerNotes

    if (-not $SourceBranch) {
        $SourceBranch = Resolve-SourceBranch -Repository $Repository[0] -WorkItem $WorkItem -Organization $AdoOrganization -Project $AdoProject
    }

    # Work item to link on the create call. Prefer the AB#<id> parsed from the summary; fall back to
    # the -WorkItem argument. The '#'-only text in the description does not create the association.
    $workItemId = if ($pr.WorkItemId) { $pr.WorkItemId } else { $WorkItem }

    # Mandatory preview before any creation.
    Write-Host ''
    Write-Host '===== PR preview =====' -ForegroundColor Cyan
    Write-Host "Title    : $($pr.Title)"
    Write-Host "Source   : $SourceBranch"
    Write-Host "Target   : $TargetBranch"
    Write-Host "Repos    : $($Repository -join ', ')"
    Write-Host "Work item: AB#$workItemId (linked via --work-items)"
    Write-Host "Draft    : $($Draft.IsPresent)"
    Write-Host '----- description -----'
    Write-Host $pr.Body
    Write-Host '======================='
    Write-Host ''

    $processedPullRequests = @()

    # Write the multi-line description to a temp file once and pass it via az's '@<file>' loader in
    # every create/update below. Passing the body directly as --description breaks on Windows: az is
    # az.cmd, and newlines in a single argument terminate the batch command line, silently dropping
    # every argument after --description (including --project and --detect). The '@<file>' token
    # carries no newlines.
    # Use the .NET temp-file API rather than New-TemporaryFile / Remove-Item: those honor -WhatIf and
    # would return nothing under a preview run, leaving $descriptionFile null. This temp file is an
    # internal detail, not a user-facing side effect, so it must be created regardless of -WhatIf.
    $descriptionFile = [System.IO.Path]::GetTempFileName()
    try {
        [System.IO.File]::WriteAllText($descriptionFile, $pr.Body, [System.Text.UTF8Encoding]::new($false))
        $descriptionArg = "@$descriptionFile"

        foreach ($repo in $Repository) {
            $existing = Get-AdoActivePullRequest -Repository $repo -SourceBranch $SourceBranch -Organization $AdoOrganization -Project $AdoProject

            if ($null -ne $existing) {
                if (-not $UpdateExisting) {
                    Write-Host "  $repo already has active PR !$($existing.pullRequestId). Skipping (use -UpdateExisting to update it)." -ForegroundColor Yellow
                    continue
                }
                if (-not $PSCmdlet.ShouldProcess("$repo PR !$($existing.pullRequestId)", 'Update pull request')) {
                    continue
                }

                # PR-by-id operations resolve within the organization, so --project is not required.
                az repos pr update --id $existing.pullRequestId --title $pr.Title --description $descriptionArg `
                    --organization $AdoOrganization --detect false --output json | Out-Null
                if ($workItemId) {
                    az repos pr work-item add --id $existing.pullRequestId --work-items $workItemId `
                        --organization $AdoOrganization --detect false --output json | Out-Null
                }

                $url = "$AdoOrganization/$([uri]::EscapeDataString($AdoProject))/_git/$repo/pullrequest/$($existing.pullRequestId)"
                Write-Host "  Updated PR !$($existing.pullRequestId): $url" -ForegroundColor Green
                Add-PullRequestLink -SummaryPath $summaryPath -Repository $repo -Url $url
                $processedPullRequests += $existing
                continue
            }

            if (-not $PSCmdlet.ShouldProcess("$repo : $SourceBranch -> $TargetBranch", 'Create pull request')) {
                continue
            }

            $createArguments = @(
                'repos', 'pr', 'create',
                '--repository', $repo,
                '--source-branch', $SourceBranch,
                '--target-branch', $TargetBranch,
                '--title', $pr.Title,
                '--description', $descriptionArg,
                '--organization', $AdoOrganization,
                '--project', $AdoProject,
                '--detect', 'false',
                '--output', 'json'
            )
            if ($workItemId) {
                # Links the work item as part of the create API call (pr.work_item_refs). The AB#<id>
                # text in the description alone does not create this association.
                $createArguments += @('--work-items', $workItemId)
            }
            if ($Draft) {
                $createArguments += '--draft'
            }

            $created = az @createArguments | ConvertFrom-Json
            $url = "$AdoOrganization/$([uri]::EscapeDataString($AdoProject))/_git/$repo/pullrequest/$($created.pullRequestId)"
            Write-Host "  Created PR !$($created.pullRequestId): $url" -ForegroundColor Green
            Add-PullRequestLink -SummaryPath $summaryPath -Repository $repo -Url $url
            $processedPullRequests += $created
        }
    } finally {
        if (Test-Path $descriptionFile) {
            [System.IO.File]::Delete($descriptionFile)
        }
    }

    Write-Host "Processed $($processedPullRequests.Count) pull request(s) for $WorkItem."
} catch {
    Write-Error "Script failed: $_"
    exit 1
}
