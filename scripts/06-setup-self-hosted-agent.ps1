#!/usr/bin/env pwsh
# =============================================================================
# 06-setup-self-hosted-agent.ps1 — Install and start an ADO self-hosted Linux agent
# =============================================================================
#
# WHAT:  Creates a pool named 'self-hosted' in the ai-experiments ADO org,
#        downloads the latest Linux agent binary, configures it, and starts
#        it in the background. The devcontainer then acts as a free build agent
#        with no Microsoft-hosted parallelism required.
#
# WHEN:  Run once per devcontainer session (the agent process stops when the
#        container stops).  Safe to re-run — replaces the existing agent
#        registration with the same name.
#
# PREREQUISITES (one-time manual steps):
#   1. Create agent pool in ADO (requires organization admin or pool admin):
#        ADO → Organization Settings → Agent pools → Add agent pool
#        Type: Self-hosted   Name: self-hosted   [x] Grant access to all pipelines
#
#   2. Create a PAT for agent configuration (requires a USER account, not SPN):
#        ADO → User Settings (top-right) → Personal access tokens → New Token
#        Name: devcontainer-agent   Scope: Agent Pools (Read & Manage)
#        Copy the token and pass it with -Pat
#
#   Alternatively, log in as your personal account first:
#        ! az login
#      Then run this script without -Pat and it will create both automatically.
#
# USAGE:
#   pwsh scripts/06-setup-self-hosted-agent.ps1 [-Pat <your-PAT>]
#
# =============================================================================

param(
    [Parameter()]
    [string] $Pat = ''
)

$ErrorActionPreference = 'Stop'

$AdoOrgUrl  = 'https://dev.azure.com/ai-experiments'
$AdoProject = 'Pipelines'
$PoolName   = 'AI-Pool'
$AgentName  = 'devcontainer-agent'
$AgentDir   = "$HOME/azp-agent"
$LogFile    = '/tmp/azp-agent.log'
$PidFile    = '/tmp/azp-agent.pid'

# ---------------------------------------------------------------------------
# 1. Bearer token for ADO REST API
# ---------------------------------------------------------------------------
Write-Host "Acquiring ADO bearer token..."
$Token = az account get-access-token `
    --resource 499b84ac-1321-427f-aa17-267ca6975798 `
    --query accessToken -o tsv
$Headers = @{ Authorization = "Bearer $Token"; 'Content-Type' = 'application/json' }

$CurrentUser = (az account show --query 'user' -o json | ConvertFrom-Json)
if ($CurrentUser.type -eq 'servicePrincipal') {
    Write-Warning "Current az session is a service principal ($($CurrentUser.name))."
    Write-Warning "Pool creation and PAT generation require a user account."
    Write-Warning "If the pool does not exist yet, create it manually:"
    Write-Warning "  ADO → Organization Settings → Agent pools → Add agent pool"
    Write-Warning "  Name: $PoolName   Type: Self-hosted   [x] Grant access to all pipelines"
    Write-Warning ""
    Write-Warning "Or re-login as yourself: ! az login"
    Write-Warning ""
}

# ---------------------------------------------------------------------------
# 2. Create agent pool (idempotent — skip gracefully if no permission)
# ---------------------------------------------------------------------------
Write-Host "---"
Write-Host "Creating/verifying agent pool '$PoolName'..."
try {
    $ExistingPools = (Invoke-RestMethod `
        -Uri "$AdoOrgUrl/_apis/distributedtask/pools?api-version=7.1" `
        -Method Get -Headers $Headers).value
    $Pool = $ExistingPools | Where-Object { $_.name -eq $PoolName }

    if ($Pool) {
        Write-Host "  Pool '$PoolName' already exists (id=$($Pool.id)) ✓"
    } else {
        $PoolBody = @{
            name          = $PoolName
            isHosted      = $false
            autoProvision = $true
            poolType      = 'automation'
        } | ConvertTo-Json
        $Pool = Invoke-RestMethod `
            -Uri "$AdoOrgUrl/_apis/distributedtask/pools?api-version=7.1" `
            -Method Post -Body $PoolBody -Headers $Headers
        Write-Host "  Created pool '$PoolName' (id=$($Pool.id)) ✓"
    }
} catch {
    Write-Warning "Could not create/verify pool: $_"
    Write-Warning "Please create the pool manually (see script header for instructions)."
    Write-Warning "Continuing with agent setup — configure it into '$PoolName' once the pool exists."
}

# ---------------------------------------------------------------------------
# 3. Get/create PAT for agent configuration
# ---------------------------------------------------------------------------
Write-Host "---"
if ($Pat) {
    Write-Host "Using PAT provided via -Pat parameter."
} else {
    Write-Host "Trying to create agent PAT automatically..."
    try {
        $PATBody = @{
            displayName = "$AgentName-$(Get-Date -Format 'yyyyMMdd')"
            scope       = 'vso.agentpools_manage'
            validTo     = (Get-Date).AddDays(90).ToString('o')
            allOrgs     = $false
        } | ConvertTo-Json
        $PATResponse = Invoke-RestMethod `
            -Uri "https://vssps.dev.azure.com/ai-experiments/_apis/tokens/pats?api-version=7.1-preview.1" `
            -Method Post -Body $PATBody -Headers $Headers
        $Pat = $PATResponse.patToken.token
        Write-Host "  PAT created (expires in 90 days) ✓"
    } catch {
        Write-Warning "Could not create PAT automatically: $_"
        Write-Host ""
        Write-Host "Create a PAT manually:"
        Write-Host "  ADO → User Settings (top-right avatar) → Personal access tokens → New Token"
        Write-Host "  Scope: Agent Pools (Read & Manage)"
        $Pat = Read-Host -Prompt "Paste PAT here"
    }
}

# ---------------------------------------------------------------------------
# 4. Download and extract the ADO Linux agent (skip if already present)
# ---------------------------------------------------------------------------
Write-Host "---"
if (Test-Path "$AgentDir/run.sh") {
    Write-Host "Agent binary already present at $AgentDir — skipping download."
} else {
    Write-Host "Getting latest ADO agent package URL..."
    $AgentPkgs = (Invoke-RestMethod `
        -Uri "$AdoOrgUrl/_apis/distributedtask/packages/agent?platform=linux-x64&`$top=1&api-version=7.1" `
        -Method Get -Headers $Headers).value
    $AgentUrl     = $AgentPkgs[0].downloadUrl
    $AgentVersion = "$($AgentPkgs[0].version.major).$($AgentPkgs[0].version.minor).$($AgentPkgs[0].version.patch)"
    Write-Host "  Downloading agent v$AgentVersion..."
    Invoke-WebRequest -Uri $AgentUrl -OutFile /tmp/azp-agent.tar.gz -UseBasicParsing
    New-Item -ItemType Directory -Path $AgentDir -Force | Out-Null
    tar xzf /tmp/azp-agent.tar.gz -C $AgentDir
    Write-Host "  Extracted to $AgentDir ✓"
}

# ---------------------------------------------------------------------------
# 5. Ensure Bicep CLI is installed (needed for integration pipeline deployments)
# ---------------------------------------------------------------------------
Write-Host "---"
Write-Host "Installing/verifying Bicep CLI..."
az bicep install 2>&1 | ForEach-Object { Write-Host "  $_" }
$BicepBin = "$HOME/.azure/bin"
if ($env:PATH -notlike "*$BicepBin*") {
    $env:PATH = "${BicepBin}:$env:PATH"
    [System.Environment]::SetEnvironmentVariable('PATH', $env:PATH, 'Process')
}
$BicepPath = (Get-Command bicep -ErrorAction SilentlyContinue)?.Source
Write-Host "  Bicep: $($BicepPath ?? 'available via az bicep')"

# ---------------------------------------------------------------------------
# 6. Configure the agent
# ---------------------------------------------------------------------------
Write-Host "---"
Write-Host "Configuring agent '$AgentName' in pool '$PoolName'..."
Push-Location $AgentDir
bash ./config.sh --unattended `
    --url $AdoOrgUrl `
    --auth pat `
    --token $Pat `
    --pool $PoolName `
    --agent $AgentName `
    --replace `
    --acceptTeeEula 2>&1
Pop-Location

# ---------------------------------------------------------------------------
# 7. Kill any existing agent process, start fresh
# ---------------------------------------------------------------------------
Write-Host "---"
if (Test-Path $PidFile) {
    $OldPid = (Get-Content $PidFile -Raw).Trim()
    bash -c "kill $OldPid 2>/dev/null || true"
    Remove-Item $PidFile -Force
}

Write-Host "Starting agent (log → $LogFile)..."
bash -c "nohup $AgentDir/run.sh > $LogFile 2>&1 & echo `$! | tee $PidFile"

# Brief pause then confirm
Start-Sleep -Seconds 3
$AgentPid = if (Test-Path $PidFile) { (Get-Content $PidFile -Raw).Trim() } else { '?' }
Write-Host ""
Write-Host "Self-hosted agent '$AgentName' started (PID $AgentPid) in pool '$PoolName'."
Write-Host "  Log : tail -f $LogFile"
Write-Host "  Stop: kill $AgentPid"
Write-Host ""
Write-Host "Next: trigger the CI pipeline:"
Write-Host "  pwsh scripts/05-trigger-and-watch.ps1"
