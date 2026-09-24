#----------------------------------------------------------------------
# Script: New-AdoWorktreePullRequests.ps1
# Description: Creates missing Azure DevOps pull requests for feature branches, discovered entirely
#              through Azure DevOps APIs (no local git checkout or worktree required).
#----------------------------------------------------------------------

[CmdletBinding(SupportsShouldProcess)]
param(
    [string] $AdoOrganization = 'https://dev.azure.com/gemeente-den-haag',

    [string] $AdoProject = 'Azure Control Plane',

    [string] $TargetBranch = 'main',

    [switch] $Draft,

    # Explicit branch allow-list, one entry per user story in scope for this PR batch. A number
    # prefix match is not enough to select these: several story numbers have multiple candidate
    # branches (backups, superseded baselines, naming-drift duplicates), so each entry here was
    # picked deliberately rather than derived from the feature/wcamargo/<id>-* pattern.
    [string[]] $FeatureBranch = @(
        'feature/wcamargo/8933-enable-pipelines-to-run-independently'
        'feature/wcamargo/8935-enable-multiple-configuration-files'
        'feature/wcamargo/9104-platform-network-dns-pipeline-configuration'
        'feature/wcamargo/9117-phoenix-one-ci-integration-configuration'
        'feature/wcamargo/9118-spike-enable-centralized-reusable-pipeline-templates'
        'feature/wcamargo/9121-landing-zone-firewall-rules-pipeline-configuration'
        'feature/wcamargo/9123-platform-network-control-plane-configuration'
        'feature/wcamargo/9124-platform-network-hub-pipeline-configuration'
        'feature/wcamargo/9125-platform-observability-pipeline-configuration'
        'feature/wcamargo/9126-tenant-control-plane-pipeline-configuration'
        'feature/wcamargo/9127-tenant-iam-vending-pipeline-configuration'
        'feature/wcamargo/9338-platform-network-data-plane-pipeline-configuration'
        'feature/wcamargo/6545-pipeline-refactoring-2'
    )
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

# On Windows, az's Python process inherits the console's legacy codepage (often cp1252) as its
# stdout encoding unless told otherwise, and crashes with UnicodeEncodeError if any response body
# contains a character outside that codepage.
$env:PYTHONIOENCODING = 'utf-8'

function Invoke-AdoApi {
    <#
    .SYNOPSIS
        Invokes an Azure DevOps REST API route via 'az rest' and returns the parsed response.
    .DESCRIPTION
        Uses 'az rest' rather than 'az devops invoke' for two reasons:

        1. 'az devops invoke' resolves --area/--resource to a location ID through a server-side
           resource-location catalog match on resourceName. Some git-area routes (notably the diffs
           API, route 'diffs/commits') do not resolve through that lookup and fail with
           "--resource and --api-version combination is not correct" even though the endpoint exists.

        2. The query string must not be assembled with '&' into a single --url argument: on Windows
           'az' is 'az.cmd' (a batch file), and an unescaped '&' is a command separator, so cmd.exe
           splits the URL and reports "'<param>' is not recognized as an internal or external
           command". Instead the URL is passed query-less and each parameter is a separate
           --uri-parameters token (nargs='+', parsed as key=value by az core); az URL-encodes and
           appends them, so no '&' ever appears in any single argument or in the URL.

        The caller-side $env:PYTHONIOENCODING='utf-8' additionally prevents az's Windows stdout from
        crashing (UnicodeEncodeError) on response characters outside the console's legacy codepage.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Organization,

        [Parameter(Mandatory)]
        [string] $Project,

        [Parameter(Mandatory)]
        [string] $Path,

        [hashtable] $QueryParameters = @{},

        [string] $ApiVersion = '7.1'
    )

    # Well-known Azure AD application ID for Azure DevOps; makes 'az rest' request an access token
    # for the Azure DevOps audience rather than Azure Resource Manager's.
    $adoResourceId = '499b84ac-1321-427f-aa17-267ca6975798'

    $encodedProject = [uri]::EscapeDataString($Project)
    $url = "$($Organization.TrimEnd('/'))/$encodedProject/_apis/$Path"

    $uriParameters = @()
    foreach ($key in $QueryParameters.Keys) {
        $uriParameters += "$key=$($QueryParameters[$key])"
    }
    $uriParameters += "api-version=$ApiVersion"

    $restArguments = @(
        'rest',
        '--method', 'get',
        '--url', $url,
        '--resource', $adoResourceId,
        '--uri-parameters'
    )
    $restArguments += $uriParameters
    $restArguments += @('--output', 'json')

    return az @restArguments | ConvertFrom-Json
}

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

function Get-AdoFeatureBranch {
    <#
    .SYNOPSIS
        Returns the branches from AllowedBranch that exist in an Azure DevOps repository.
    #>
    [CmdletBinding()]
    [OutputType([string], [object[]])]
    param(
        [Parameter(Mandatory)]
        [string] $Repository,

        [Parameter(Mandatory)]
        [string] $Organization,

        [Parameter(Mandatory)]
        [string] $Project,

        [Parameter(Mandatory)]
        [string[]] $AllowedBranch
    )

    $listArguments = @(
        'repos', 'ref', 'list',
        '--repository', $Repository,
        '--filter', 'heads/feature/wcamargo/',
        '--organization', $Organization,
        '--project', $Project,
        '--detect', 'false',
        '--output', 'json'
    )
    $refs = @(az @listArguments | ConvertFrom-Json | Where-Object { $null -ne $_ })
    $allowedSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$AllowedBranch, [System.StringComparer]::Ordinal)

    return @(
        $refs | ForEach-Object { $_.name -replace '^refs/heads/', '' } | Where-Object {
            $allowedSet.Contains($_)
        }
    )
}

function Get-AdoBranchDiff {
    <#
    .SYNOPSIS
        Returns the changed-file summary between a branch and the target branch.
    #>
    [CmdletBinding()]
    [OutputType([string], [object[]])]
    param(
        [Parameter(Mandatory)]
        [string] $Repository,

        [Parameter(Mandatory)]
        [string] $SourceBranch,

        [Parameter(Mandatory)]
        [string] $TargetBranch,

        [Parameter(Mandatory)]
        [string] $Organization,

        [Parameter(Mandatory)]
        [string] $Project
    )

    $response = Invoke-AdoApi -Organization $Organization -Project $Project -Path "git/repositories/$Repository/diffs/commits" -QueryParameters @{
        baseVersion       = $TargetBranch
        baseVersionType   = 'branch'
        targetVersion     = $SourceBranch
        targetVersionType = 'branch'
    }

    $changes = @(Get-OptionalProperty -InputObject $response -Name 'changes' -Default @())

    return @(
        $changes | Where-Object {
            $null -ne $_.item -and -not (Get-OptionalProperty -InputObject $_.item -Name 'isFolder' -Default $false) -and $_.changeType -ne 'none'
        } | ForEach-Object {
            "$($_.changeType)`t$($_.item.path)"
        }
    )
}

function Get-AdoBranchCommit {
    <#
    .SYNOPSIS
        Returns commit summaries present on a branch but not on the target branch.
    #>
    [CmdletBinding()]
    [OutputType([string], [object[]])]
    param(
        [Parameter(Mandatory)]
        [string] $Repository,

        [Parameter(Mandatory)]
        [string] $SourceBranch,

        [Parameter(Mandatory)]
        [string] $TargetBranch,

        [Parameter(Mandatory)]
        [string] $Organization,

        [Parameter(Mandatory)]
        [string] $Project
    )

    $response = Invoke-AdoApi -Organization $Organization -Project $Project -Path "git/repositories/$Repository/commits" -QueryParameters @{
        'searchCriteria.itemVersion.version'        = $SourceBranch
        'searchCriteria.itemVersion.versionType'    = 'branch'
        'searchCriteria.compareVersion.version'     = $TargetBranch
        'searchCriteria.compareVersion.versionType' = 'branch'
    }

    $commits = @(Get-OptionalProperty -InputObject $response -Name 'value' -Default @())

    return @(
        $commits | ForEach-Object {
            $subject = ([string](Get-OptionalProperty -InputObject $_ -Name 'comment' -Default '') -split "`n")[0]
            "$($_.commitId.Substring(0, 8)) $subject"
        }
    )
}

function Get-AdoActivePullRequest {
    <#
    .SYNOPSIS
        Returns an active pull request for the source branch, when one exists.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Repository,

        [Parameter(Mandatory)]
        [string] $SourceBranch,

        [Parameter(Mandatory)]
        [string] $Organization,

        [Parameter(Mandatory)]
        [string] $Project
    )

    $listArguments = @(
        'repos', 'pr', 'list',
        '--repository', $Repository,
        '--source-branch', $SourceBranch,
        '--status', 'active',
        '--organization', $Organization,
        '--project', $Project,
        '--detect', 'false',
        '--output', 'json'
    )
    $pullRequests = @(az @listArguments | ConvertFrom-Json | Where-Object { $null -ne $_ })

    if ($pullRequests.Count -eq 0) {
        return $null
    }

    return $pullRequests[0]
}

function Get-SdlcContext {
    <#
    .SYNOPSIS
        Returns a one-line intent title + problem summary for a work item's SDLC folder, if it exists.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)]
        [string] $SdlcPath,

        [Parameter(Mandatory)]
        [string] $WorkItemId
    )

    if (-not (Test-Path $SdlcPath)) {
        return ''
    }

    $storyFolder = Get-ChildItem -Path $SdlcPath -Directory -Filter "$WorkItemId-*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $storyFolder) {
        return ''
    }

    $intentPath = Join-Path $storyFolder.FullName 'intent.md'
    if (-not (Test-Path $intentPath)) {
        return ''
    }

    $content = @(Get-Content -Path $intentPath)
    $title = if ($content.Count -gt 0) { $content[0] -replace '^#\s*Intent:\s*', '' } else { '' }

    $problemHeading = Select-String -Path $intentPath -Pattern '^##\s*Problem' | Select-Object -First 1
    $summary = ''
    if ($null -ne $problemHeading -and $problemHeading.LineNumber -lt $content.Count) {
        $problemBody = $content[$problemHeading.LineNumber..($content.Count - 1)]
        $paragraphLines = @()
        $hasStartedParagraph = $false
        foreach ($problemLine in $problemBody) {
            if (-not $problemLine.Trim()) {
                if ($hasStartedParagraph) {
                    break
                }
                continue
            }
            $hasStartedParagraph = $true
            $paragraphLines += $problemLine.Trim()
        }
        $summary = $paragraphLines -join ' '
        if ($summary.Length -gt 220) {
            $summary = $summary.Substring(0, 217) + '...'
        }
    }

    $artifacts = @('intent.md', 'spec.md', 'plan.md') | Where-Object { Test-Path (Join-Path $storyFolder.FullName $_) }
    $line = "- **$title**"
    if (-not [string]::IsNullOrWhiteSpace($summary)) {
        $line += " -- $summary"
    }
    $line += " (see $($artifacts -join ', ') under sdlc/$($storyFolder.Name)/)"
    return $line
}

function Format-PullRequestDescription {
    <#
    .SYNOPSIS
        Creates a markdown pull-request description from committed work.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Branch,

        [Parameter(Mandatory)]
        [string[]] $CommitMessages,

        [Parameter(Mandatory)]
        [string[]] $ChangedFiles,

        [string] $SdlcContext = ''
    )

    $description = @(
        '## Branch summary'
        "- Source branch: ``$Branch``"
    )

    if ($Branch -match '^feature/wcamargo/(?<workItemId>\d+)-') {
        $description += "- Work item: AB#$($Matches.workItemId)"
    }

    if (-not [string]::IsNullOrWhiteSpace($SdlcContext)) {
        $description += ''
        $description += '## Intent / spec / plan'
        $description += $SdlcContext
    }

    $description += ''
    $description += '## Completed commits'
    $description += @($CommitMessages | ForEach-Object { "- $_" })
    $description += ''
    $description += '## Changed files'
    foreach ($group in @($ChangedFiles | Group-Object { ($_ -split "`t")[0] } | Sort-Object Name)) {
        $description += "**$($group.Name)** ($($group.Count))"
        $description += @($group.Group | ForEach-Object { "- $(($_ -split "`t")[1])" })
    }

    return $description -join [System.Environment]::NewLine
}

function Get-PullRequestTitle {
    <#
    .SYNOPSIS
        Creates a concise pull-request title from a feature branch.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Branch
    )

    $title = $Branch -replace '^feature/wcamargo/', '' -replace '^(\d+)-', '$1: ' -replace '-', ' '
    return $title
}

try {
    $repositories = @('azure-control-plane-orchestration', 'azure-control-plane-configuration')
    $sdlcPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'sdlc'

    Write-Host 'Checking Azure CLI login...'
    try {
        $account = az account show --output json | ConvertFrom-Json
    } catch {
        throw "Not logged in. Run 'az login' against the tenant that owns $AdoOrganization first."
    }
    Write-Host "Logged in as $($account.user.name)"

    $createdPullRequests = @()

    foreach ($repository in $repositories) {
        $branches = Get-AdoFeatureBranch -Repository $repository -Organization $AdoOrganization -Project $AdoProject -AllowedBranch $FeatureBranch

        foreach ($missingBranch in @($FeatureBranch | Where-Object { $_ -notin $branches })) {
            Write-Warning "$repository does not have branch $missingBranch."
        }

        foreach ($branch in $branches) {
            Write-Host "Processing $repository : $branch"

            $existingPullRequest = Get-AdoActivePullRequest -Repository $repository -SourceBranch $branch -Organization $AdoOrganization -Project $AdoProject
            if ($null -ne $existingPullRequest) {
                Write-Host "  Active PR !$($existingPullRequest.pullRequestId) already exists. Skipping."
                continue
            }

            $changedFiles = @(Get-AdoBranchDiff -Repository $repository -SourceBranch $branch -TargetBranch $TargetBranch -Organization $AdoOrganization -Project $AdoProject)
            if ($changedFiles.Count -eq 0) {
                Write-Warning "Skipping $repository : $branch : no changes relative to $TargetBranch."
                continue
            }

            $commitMessages = @(Get-AdoBranchCommit -Repository $repository -SourceBranch $branch -TargetBranch $TargetBranch -Organization $AdoOrganization -Project $AdoProject)
            $sdlcContext = if ($branch -match '^feature/wcamargo/(?<workItemId>\d+)-') {
                Get-SdlcContext -SdlcPath $sdlcPath -WorkItemId $Matches.workItemId
            } else {
                ''
            }
            $description = Format-PullRequestDescription -Branch $branch -CommitMessages $commitMessages -ChangedFiles $changedFiles -SdlcContext $sdlcContext
            $title = Get-PullRequestTitle -Branch $branch

            if (-not $PSCmdlet.ShouldProcess("$repository : $branch -> $TargetBranch", 'Create pull request')) {
                continue
            }

            $createArguments = @(
                'repos', 'pr', 'create',
                '--repository', $repository,
                '--source-branch', $branch,
                '--target-branch', $TargetBranch,
                '--title', $title,
                '--description', $description,
                '--organization', $AdoOrganization,
                '--project', $AdoProject,
                '--detect', 'false',
                '--output', 'json'
            )
            if ($Draft) {
                $createArguments += '--draft'
            }

            $createdPullRequest = az @createArguments | ConvertFrom-Json
            $pullRequestUrl = "$AdoOrganization/$([uri]::EscapeDataString($AdoProject))/_git/$repository/pullrequest/$($createdPullRequest.pullRequestId)"
            Write-Host "  Created PR !$($createdPullRequest.pullRequestId): $pullRequestUrl" -ForegroundColor Green
            $createdPullRequests += $createdPullRequest
        }
    }

    Write-Host "Created $($createdPullRequests.Count) pull request(s)."
} catch {
    Write-Error "Script failed: $_"
    exit 1
}
