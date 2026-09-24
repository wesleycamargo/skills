#!/usr/bin/env pwsh
# =============================================================================
# 04-configure-pipelines.ps1 — Set pipeline variables
# =============================================================================
#
# WHAT:  Sets SkipSemVerTagging=true on the CI pipeline so the semver-tag step
#        does not attempt to push a git tag on the first run (the pipeline agent
#        identity needs repo "Contribute" for that — enable it once the basic
#        flow is proven clean).
#
# WHEN:  Run once after 03-register-pipelines.ps1.  Safe to re-run.
#
# REQUIRES:
#   - `az login` + azure-devops CLI extension
#   - "Edit build pipeline" permission (same as step 03)
#
# SERVICE CONNECTION NOTE:
#   On the first pipeline run ADO will show a resource-authorization prompt for
#   'ai-agents-spn'.  Click "Permit" in the ADO UI, or pre-authorize via:
#     ADO → Project Settings → Service connections → ai-agents-spn
#     → Security → "Grant access permission to all pipelines"
#
# USAGE:  pwsh scripts/04-configure-pipelines.ps1
# =============================================================================

$ErrorActionPreference = 'Stop'

$AdoOrg    = 'https://dev.azure.com/ai-experiments'
$AdoProject = 'Pipelines'
$CiPipeline = '_phoenix-one-ci'
$VarName    = 'SkipSemVerTagging'
$VarValue   = 'true'

Write-Host "Setting ${VarName}=${VarValue} on pipeline '${CiPipeline}'..."

$Existing = az pipelines variable list `
    --pipeline-name $CiPipeline `
    --org $AdoOrg `
    --project $AdoProject `
    --output json | ConvertFrom-Json

if ($Existing.PSObject.Properties.Name -contains $VarName) {
    az pipelines variable update `
        --name $VarName `
        --value $VarValue `
        --allow-override `
        --pipeline-name $CiPipeline `
        --org $AdoOrg `
        --project $AdoProject `
        --output none
    Write-Host "  Updated existing variable."
} else {
    az pipelines variable create `
        --name $VarName `
        --value $VarValue `
        --allow-override `
        --pipeline-name $CiPipeline `
        --org $AdoOrg `
        --project $AdoProject `
        --output none
    Write-Host "  Created variable."
}

Write-Host ''
Write-Host 'Next: on the first pipeline run, ADO will prompt to authorize the'
Write-Host "'ai-agents-spn' service connection. Click 'Permit' in the ADO UI."
