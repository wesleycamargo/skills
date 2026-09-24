#!/usr/bin/env pwsh
# =============================================================================
# azdo-get-pipeline-ids.ps1
# =============================================================================
#
# WHAT: Lists every pipeline registered under \azure-control-plane\<pattern>
#       for each pattern in -Patterns, with its definition ID and a direct
#       Azure DevOps link (https://.../_build?definitionId=<id>). Used to fill
#       in the "Pipeline registration" links in each deployment pattern's
#       README.md without guessing or inventing URLs.
#
# REQUIRES:
#   - az login (against the tenant that owns dev.azure.com/gemeente-den-haag)
#   - az extension add --name azure-devops
#
# USAGE:
#   pwsh ./azdo-get-pipeline-ids.ps1
#   pwsh ./azdo-get-pipeline-ids.ps1 -OutputPath ./pipeline-ids.json
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

    [string] $OutputPath = (Join-Path -Path $PSScriptRoot -ChildPath 'pipeline-ids.json')
)

$ErrorActionPreference = 'Stop'

Write-Host "Checking Azure CLI login..."
$account = az account show --output json 2>$null | ConvertFrom-Json
if ($null -eq $account) {
    throw "Not logged in. Run 'az login' against the tenant that owns ${AdoOrganization} first."
}
Write-Host "Logged in as $($account.user.name)"

$results = @()

foreach ($pattern in $Patterns) {
    $folderPath = "\azure-control-plane\$pattern"
    $listArgs = @(
        'pipelines', 'list',
        '--folder-path', $folderPath,
        '--organization', $AdoOrganization,
        '--project', $AdoProject,
        '--detect', 'false',
        '--output', 'json'
    )
    $pipelines = az @listArgs | ConvertFrom-Json

    foreach ($pipeline in $pipelines) {
        $webUrl = "$AdoOrganization/$([uri]::EscapeDataString($AdoProject))/_build?definitionId=$($pipeline.id)"
        Write-Host "$($pipeline.name): $webUrl"
        $results += [pscustomobject]@{
            pattern      = $pattern
            pipelineName = $pipeline.name
            id           = $pipeline.id
            url          = $webUrl
        }
    }
}

$results | ConvertTo-Json -Depth 4 | Out-File -FilePath $OutputPath -Encoding utf8
Write-Host ""
Write-Host "Written to $OutputPath"
