#!/usr/bin/env pwsh
# =============================================================================
# 05-trigger-and-watch.ps1 — Trigger the CI pipeline and stream the result
# =============================================================================
#
# WHAT:  Triggers a manual run of _phoenix-one-ci and polls until it completes.
#        The integration pipeline auto-triggers via its pipeline resource trigger
#        when CI succeeds on the master branch.
#
# WHEN:  Run after all setup scripts (01–04) have completed successfully and
#        the 'ai-agents-spn' service connection has been permitted in the ADO UI.
#
# REQUIRES:
#   - `az login` + azure-devops CLI extension
#   - "Queue builds" permission on the pipeline
#
# COST NOTE:
#   The _phoenix-one pattern deploys resource groups only (free Azure resource).
#   After validation, clean up with:
#     az group delete --name azd-ppl-can-rg-001 `
#       --subscription bf464f0e-1ec2-40f4-b033-b13f71a85729 --yes --no-wait
#
# USAGE:  pwsh scripts/05-trigger-and-watch.ps1
# =============================================================================

$ErrorActionPreference = 'Stop'

$AdoOrg          = 'https://dev.azure.com/ai-experiments'
$AdoProject      = 'Pipelines'
$CiPipeline      = '_phoenix-one-ci'
$PollIntervalSec = 30
# Use the self-hosted pool registered by 06-setup-self-hosted-agent.ps1.
# Set to empty string to use Microsoft-hosted ubuntu-latest (requires paid parallelism).
$AgentPool       = 'AI-Pool'

Write-Host "Triggering '${CiPipeline}' (pool: ${AgentPool})..."
$Run = az pipelines run `
    --name $CiPipeline `
    --org $AdoOrg `
    --project $AdoProject `
    --parameters "agentPool=${AgentPool}" `
    --output json | ConvertFrom-Json

$RunId  = $Run.id
$RunUrl = $Run._links.web.href

Write-Host "Run started: id=${RunId}"
Write-Host "URL: ${RunUrl}"
Write-Host ''
Write-Host "Polling every ${PollIntervalSec}s..."

while ($true) {
    $Status = az pipelines runs show `
        --id $RunId `
        --org $AdoOrg `
        --project $AdoProject `
        --output json | ConvertFrom-Json

    $State  = $Status.status
    $Result = if ($Status.result) { $Status.result } else { 'pending' }

    Write-Host "  [$(Get-Date -Format 'HH:mm:ss')] status=${State}  result=${Result}"

    if ($State -eq 'completed') {
        Write-Host ''
        if ($Result -eq 'succeeded') {
            Write-Host 'CI pipeline SUCCEEDED.'
            Write-Host 'The integration pipeline will auto-trigger and deploy resource groups to the Sandbox subscription.'
        } else {
            Write-Host "CI pipeline finished with result: ${Result}"
            Write-Host "Check the run at: ${RunUrl}"
            exit 1
        }
        break
    }

    Start-Sleep -Seconds $PollIntervalSec
}
