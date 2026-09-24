#!/usr/bin/env pwsh
# =============================================================================
# 03b-authorize-resources.ps1 — Pre-authorize service connection and repository
#                               for the registered pipelines
# =============================================================================
#
# WHAT:  Grants pipelines permission to use 'ai-agents-spn' and the
#        'deployment-patterns' repository without requiring a manual "Permit"
#        click in the ADO UI on the first run.  Sets allPipelines=true on
#        both resources so every pipeline in the project can use them.
#
# WHEN:  Run once after 03-register-pipelines.ps1.  Safe to re-run.
#
# REQUIRES:
#   - `az login` + azure-devops CLI extension
#   - "Administrator" on the service connection security settings (read by
#     03-register-pipelines.ps1 already)
#
# HOW IT WORKS:
#   Uses the ADO pipelinePermissions REST API (api-version 7.1-preview.1) via
#   Invoke-RestMethod with a bearer token obtained from `az account get-access-token`.
#   This is equivalent to clicking "Grant access permission to all pipelines" in
#   ADO → Project Settings → Service connections → <name> → Security.
#
# USAGE:  pwsh scripts/03b-authorize-resources.ps1
# =============================================================================

$ErrorActionPreference = 'Stop'

$AdoOrg     = 'https://dev.azure.com/ai-experiments'
$AdoProject = 'Pipelines'
$ServiceConn = 'ai-agents-spn'
$RepoName    = 'deployment-patterns'
$EnvName     = 'canary'

# ---------------------------------------------------------------------------
# Acquire bearer token for ADO REST API
# ---------------------------------------------------------------------------
Write-Host "Acquiring ADO access token..."
$Token = az account get-access-token `
    --resource 499b84ac-1321-427f-aa17-267ca6975798 `
    --query accessToken -o tsv
$Headers = @{
    Authorization  = "Bearer $Token"
    'Content-Type' = 'application/json'
}

# ---------------------------------------------------------------------------
# Resolve IDs
# ---------------------------------------------------------------------------
Write-Host "Resolving resource IDs..."

$ProjectId = (az devops project show `
    --project $AdoProject `
    --org $AdoOrg `
    --output json | ConvertFrom-Json).id
Write-Host "  Project id : $ProjectId"

$EndpointId = (az devops service-endpoint list `
    --org $AdoOrg `
    --project $AdoProject `
    --output json | ConvertFrom-Json |
    Where-Object { $_.name -eq $ServiceConn }).id
if (-not $EndpointId) {
    Write-Error "Service connection '$ServiceConn' not found in project '$AdoProject'."
    exit 1
}
Write-Host "  Endpoint id: $EndpointId"

$RepoId = (az repos list `
    --org $AdoOrg `
    --project $AdoProject `
    --output json | ConvertFrom-Json |
    Where-Object { $_.name -eq $RepoName }).id
if (-not $RepoId) {
    Write-Error "Repository '$RepoName' not found in project '$AdoProject'."
    exit 1
}
$RepoResourceId = "${ProjectId}.${RepoId}"
Write-Host "  Repo id    : $RepoId  (resource id: $RepoResourceId)"

$EnvId = (az devops invoke `
    --area distributedtask `
    --resource environments `
    --route-parameters project=$AdoProject `
    --org $AdoOrg `
    --output json | ConvertFrom-Json).value |
    Where-Object { $_.name -eq $EnvName } |
    Select-Object -ExpandProperty id
if (-not $EnvId) {
    Write-Warning "Environment '$EnvName' not found — skipping environment authorization."
}
else {
    Write-Host "  Env id     : $EnvId"
}

# ---------------------------------------------------------------------------
# Helper: PATCH pipelinePermissions to allPipelines=true
# ---------------------------------------------------------------------------
function Set-AllPipelinesAuthorized {
    param(
        [string] $ResourceType,
        [string] $ResourceId,
        [string] $Label
    )

    $Url = "https://dev.azure.com/ai-experiments/${AdoProject}/_apis/pipelines/pipelinePermissions/${ResourceType}/${ResourceId}?api-version=7.1-preview.1"

    $Body = @{
        allPipelines = @{ authorized = $true }
        resource     = @{ id = $ResourceId; type = $ResourceType }
    } | ConvertTo-Json -Depth 5 -Compress

    Write-Host "---"
    Write-Host "Authorizing $Label..."
    $Response = Invoke-RestMethod -Uri $Url -Method Patch -Body $Body -Headers $Headers
    $Authorized = $Response.allPipelines.authorized
    Write-Host "  allPipelines.authorized = $Authorized"
}

# ---------------------------------------------------------------------------
# Authorize resources
# ---------------------------------------------------------------------------
Set-AllPipelinesAuthorized -ResourceType 'endpoint'    -ResourceId $EndpointId    -Label "service connection '$ServiceConn'"
Set-AllPipelinesAuthorized -ResourceType 'repository'  -ResourceId $RepoResourceId -Label "repository '$RepoName'"

if ($EnvId) {
    try {
        Set-AllPipelinesAuthorized -ResourceType 'environment' -ResourceId $EnvId -Label "environment '$EnvName'"
    }
    catch {
        Write-Warning "Could not pre-authorize environment '$EnvName' via API (requires Admin role on the environment)."
        Write-Warning "If the integration pipeline prompts for environment authorization, go to:"
        Write-Warning "  ADO → Pipelines → Environments → $EnvName → Security → grant 'User' to the pipeline."
        Write-Warning "Alternatively, if the environment has no approval gates, the pipeline may run without this step."
    }
}

Write-Host "---"
Write-Host "Done. All resources pre-authorized — no manual 'Permit' click required."
