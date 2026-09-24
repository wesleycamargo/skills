#!/usr/bin/env pwsh
#----------------------------------------------------------------------
# Script:      Update-AdoWorkItemBranchLinks.ps1
# Description: Updates the 9117 quality-gate work items and links their branches.
# Author:      Azure Control Plane team
# Created:     2026-09-23
#
# Examples:
#   .\Update-AdoWorkItemBranchLinks.ps1 -WhatIf
#   .\Update-AdoWorkItemBranchLinks.ps1
#
# Notes:
#   Requires az login, the azure-devops Azure CLI extension, and permission
#   to edit Azure Boards work items and add hyperlinks.
#----------------------------------------------------------------------

[CmdletBinding(SupportsShouldProcess)]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

$organization = "https://dev.azure.com/gemeente-den-haag"
$project = "Azure Control Plane"
$repositories = @(
    "azure-control-plane-orchestration",
    "azure-control-plane-configuration"
)

$items = @(
    [pscustomobject]@{
        Id                 = 9117
        Branch             = "feature/wcamargo/9117-phoenix-one-ci-integration-configuration"
        Description        = "<p>As a platform engineer, I want one quality-gate pipeline that runs CI and Canary Integration for each in-scope deployment pattern, so that I have one trustworthy pass/fail result before approving shared pipeline-model changes.</p>"
        AcceptanceCriteria = "<ul><li>The harness runs CI before Integration for Phoenix One, Platform Observability, Platform Network DNS, Platform Network Control Plane, Tenant Control Plane, and Tenant IAM Vending.</li><li>It reports one aggregate pass/fail result.</li><li>Landing Zone Firewall Rules and Platform Network Hub have documented exclusions.</li><li>Platform Network Governance has no independent harness entry.</li></ul>"
    }
    [pscustomobject]@{
        Id                 = 9104
        Branch             = "feature/wcamargo/9104-platform-network-dns-pipeline-configuration"
        Description        = "<p>Add Platform Network DNS CI and Canary Integration quality checks to the shared Phoenix V2 pipeline model.</p>"
        AcceptanceCriteria = "<ul><li>CI builds Platform Network DNS test configuration.</li><li>Integration consumes the CI build and deploys the DNS templates with test-scoped configuration.</li><li>The pattern participates in the quality-gate harness.</li></ul>"
    }
    [pscustomobject]@{
        Id                 = 9123
        Branch             = "feature/wcamargo/9123-platform-network-control-plane-configuration"
        Description        = "<p>Add Platform Network Control Plane CI and Canary Integration quality checks to the shared Phoenix V2 pipeline model.</p>"
        AcceptanceCriteria = "<ul><li>CI builds Platform Network Control Plane test configuration.</li><li>Integration consumes the CI build and preserves the control-plane and governance dependency order.</li><li>The pattern participates in the quality-gate harness.</li></ul>"
    }
    [pscustomobject]@{
        Id                 = 9125
        Branch             = "feature/wcamargo/9125-platform-observability-pipeline-configuration"
        Description        = "<p>Add Platform Observability CI and Canary Integration quality checks to the shared Phoenix V2 pipeline model.</p>"
        AcceptanceCriteria = "<ul><li>CI builds only Platform Observability test configuration.</li><li>Integration consumes the CI build and deploys the Platform Observability template with test-scoped configuration.</li><li>The pattern participates in the quality-gate harness.</li></ul>"
    }
    [pscustomobject]@{
        Id                 = 9126
        Branch             = "feature/wcamargo/9126-tenant-control-plane-pipeline-configuration"
        Description        = "<p>Add Tenant Control Plane CI and Canary Integration quality checks to the shared Phoenix V2 pipeline model.</p>"
        AcceptanceCriteria = "<ul><li>CI builds Tenant Control Plane test configuration.</li><li>Integration consumes the CI build and preserves hierarchy, governance, and PowerShell dependency order.</li><li>The pattern participates in the quality-gate harness.</li></ul>"
    }
    [pscustomobject]@{
        Id                 = 9127
        Branch             = "feature/wcamargo/9127-tenant-iam-vending-pipeline-configuration"
        Description        = "<p>Add Tenant IAM Vending CI and Canary Integration quality checks to the shared Phoenix V2 pipeline model.</p>"
        AcceptanceCriteria = "<ul><li>CI builds Tenant IAM Vending test configuration.</li><li>Integration consumes the CI build and runs the existing PowerShell deployment graph with test-scoped configuration.</li><li>The pattern participates in the quality-gate harness.</li></ul>"
    }
)

try {
    az account show --output none

    foreach ($item in $items) {
        Write-Host "Updating work item $($item.Id)" -ForegroundColor Cyan

        if ($PSCmdlet.ShouldProcess("work item $($item.Id)", "Update description and acceptance criteria")) {
            az boards work-item update `
                --id $item.Id `
                --fields "System.Description=$($item.Description)" "Microsoft.VSTS.Common.AcceptanceCriteria=$($item.AcceptanceCriteria)" `
                --organization $organization `
                --detect false `
                --output none
        }

        $workItem = az boards work-item show `
            --id $item.Id `
            --expand relations `
            --organization $organization `
            --detect false `
            --output json | ConvertFrom-Json

        $relationsProperty = $workItem.PSObject.Properties['relations']

        foreach ($repository in $repositories) {
            $branchUrl = (
                '{0}/{1}/_git/{2}?version={3}' -f
                $organization,
                [uri]::EscapeDataString($project),
                [uri]::EscapeDataString($repository),
                [uri]::EscapeDataString("GB$($item.Branch)")
            )
            $linkExists = $false
            if ($null -ne $relationsProperty) {
                foreach ($relation in @($relationsProperty.Value)) {
                    if ($relation.rel -eq "Hyperlink" -and $relation.url -eq $branchUrl) {
                        $linkExists = $true
                        break
                    }
                }
            }

            if (-not $linkExists -and $PSCmdlet.ShouldProcess("work item $($item.Id)", "Link $repository branch")) {
                az boards work-item relation add `
                    --id $item.Id `
                    --relation-type Hyperlink `
                    --target-url $branchUrl `
                    --organization $organization `
                    --detect false `
                    --output none
            }
        }
    }
}
catch {
    Write-Error "Script failed: $_"
    exit 1
}
