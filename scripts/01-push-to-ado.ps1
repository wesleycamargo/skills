#!/usr/bin/env pwsh
# =============================================================================
# 01-push-to-ado.ps1 — Push the orchestration subtree to the ADO repo
# =============================================================================
#
# WHAT:  Pushes only azure-control-plane-orchestration/ to the root of the
#        'deployment-patterns' ADO repo so that common/ and deployment-patterns/
#        are at the top level (required by the pipeline template path resolution).
#
# WHEN:  Run once per code change cycle, before triggering pipelines.
#        Re-running is safe — git subtree push is incremental.
#
# REQUIRES:
#   - `az login` completed in the current session
#   - "Contribute" on dev.azure.com/ai-experiments/Pipelines/_git/deployment-patterns
#     If you get 403: ADO → Project Settings → Repositories → deployment-patterns
#     → Security → your user → Contribute = Allow
#
# USAGE:  pwsh scripts/01-push-to-ado.ps1
# =============================================================================

$ErrorActionPreference = 'Stop'

$AdoProject  = 'Pipelines'
$AdoRepo     = 'deployment-patterns'
$Prefix      = 'azure-control-plane-orchestration'
$Branch      = 'master'
$RepoBaseUrl = "https://dev.azure.com/ai-experiments/${AdoProject}/_git/${AdoRepo}"

Write-Host 'Acquiring ADO OAuth token via az CLI...'
$Token = az account get-access-token `
    --resource 499b84ac-1321-427f-aa17-267ca6975798 `
    --query accessToken -o tsv

$RemoteUrl = "https://pat:${Token}@dev.azure.com/ai-experiments/${AdoProject}/_git/${AdoRepo}"

Write-Host "Configuring 'ado' remote → ${RepoBaseUrl}"
git remote remove ado 2>$null
git remote add ado $RemoteUrl

Write-Host "Pushing ${Prefix}/ subtree to branch '${Branch}'..."
git subtree push --prefix $Prefix ado $Branch

Write-Host 'Cleaning up token-bearing remote...'
git remote remove ado

Write-Host "Done. ADO repo now has common/ and deployment-patterns/ at the root."
