# Cursor rules — Design Authority

Canonical Cursor rules derived from the Design Authority wiki.

## Rules

| File | Scope | Source docs |
| --- | --- | --- |
| **`engineering.mdc`** | SOLID, naming, ADO pipelines, enterprise IaC, **KQL**, policy-as-code (Bicep), testing | Engineering-guidelines, Commit-messages, Pipeline-coding-guidelines |
| **`control-plane-repos.mdc`** | Orchestration vs configuration split, folder to pipeline mapping, when a new pipeline is justified | Azure Control Plane `main` trees + ADO `\production` |
| **`bicep.mdc`** | Bicep templates, AVM, MCSB defaults, diagnostics, policy assignments | Bicep-style-guide, MCSB, NL BIO Cloud Theme V2 |
| **`powershell.mdc`** | PowerShell scripts, Az/Graph automation, idempotent RBAC, Pester | Powershell-style-guide, Powershell-best-practices |
| **`architecture.mdc`** | HLD/LLTD, ADRs, CAF landing zone, network, observability, AI LZ | Templates, design areas, Azure WAF/CAF |
| **`security.mdc`** | BIO 2.0/BIV, MCSB v2 (incl. AI), NL BIO Policy caveats, Zero Trust, Sentinel | Security docs, LLTD §4, [MCSB](https://learn.microsoft.com/security/benchmark/azure/overview) |
| **`ado-user-stories.mdc`** | Create/refine Azure DevOps User Stories, PBIs, and Tasks via MCP | Definition of Ready, Definition of Done, backlog item checklists |
| **`da-wiki-as-code.mdc`** | Wiki publish-as-code: folder placement, PR policy, `.order`, scope vs other repos | Documentation-creation-guidelines, Design-areas, root README |
| **`da-adr-lifecycle.mdc`** | ADR INBOX, numbering, promotion, index, supersede, citation paths | Architecture-decision-log, INBOX, ADR templates |
| **`da-security-gap-review.mdc`** | Always-on pointer to the 10 Sep 2026 DA/Phoenix One security gap snapshot (workspace only if present) | `.cursor/da-security-architecture-gap-review.md` |

**Priority for code generation:** `engineering.mdc` + `bicep.mdc` or `powershell.mdc` (by file type). **MCSB/BIO compliance:** `security.mdc` + Bicep MCSB defaults section. **Backlog items via Azure DevOps MCP:** `ado-user-stories.mdc`.

**All rules:** comment logical code blocks for humans; no `--` or em dashes in generated code (see each `.mdc`).

## Use in this repo

Cursor loads `.cursor/rules/` automatically when this repository is open.

## Use across other repositories

Cursor does **not** load `%USERPROFILE%\.cursor\rules\*.mdc` as global project rules by itself.

On this PC the files are installed globally as follows:

1. Canonical copies: `%USERPROFILE%\.cursor\rules\*.mdc`
2. Cursor **User Rule** "GDH Design Authority standards" (Settings → Rules) — always on for Agent chat
3. User hook `%USERPROFILE%\.cursor\hooks.json` copies the `.mdc` files into `<workspace>/.cursor/rules/` on workspace open and session start (glob-based and agent-requestable project rules)

To refresh the canonical copies from this repo:

```powershell
$src = "<path-to-Design-Authority>\Design Authority\.cursor\rules"
$dst = "$env:USERPROFILE\.cursor\rules"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item "$src\*.mdc" $dst -Force
```

## Updating

Edit `.mdc` files here when wiki standards change, then re-copy to `%USERPROFILE%\.cursor\rules\`. The hook updates other repos the next time they are opened.

## Source folder (coding standards)

`wiki/Design-Authority/Processes/code-style-and-best-practices-guide/`
