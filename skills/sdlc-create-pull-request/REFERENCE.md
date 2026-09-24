# Azure DevOps PR mechanics

Organization `https://dev.azure.com/gemeente-den-haag`, project `Azure Control Plane`. Requires `az login` (AAD/MSA) and the `azure-devops` CLI extension. All commands below are read-only except `az repos pr create`.

## Preflight

Branch exists on origin:

```
az repos ref list --repository <repo> --filter heads/<branch> --organization <org> --project "<project>" --detect false -o json
```

Active PR already open for the branch (if any result, report it and stop):

```
az repos pr list --repository <repo> --source-branch <branch> --status active --organization <org> --project "<project>" --detect false -o json
```

## Diff and commits for the description (post-implementation mode)

Use `az rest` against the documented REST paths, not `az devops invoke` (its `--resource` catalog lookup does not resolve the `diffs/commits` route). Changed files:

```
az rest --method get \
  --url "<org>/<url-encoded-project>/_apis/git/repositories/<repo>/diffs/commits" \
  --resource 499b84ac-1321-427f-aa17-267ca6975798 \
  --uri-parameters baseVersion=<target> baseVersionType=branch targetVersion=<source> targetVersionType=branch api-version=7.1 \
  -o json
```

Commits on the branch not on target: same shape against `_apis/git/repositories/<repo>/commits` with `searchCriteria.itemVersion.*` = source and `searchCriteria.compareVersion.*` = target.

## Create the PR (after preview + confirmation)

```
az repos pr create --repository <repo> --source-branch <branch> --target-branch <target> \
  --title "<title>" --description "<body>" \
  --organization <org> --project "<project>" --detect false -o json
```

Add `--draft` when the user chose draft. The returned `pullRequestId` builds the URL:
`<org>/<url-encoded-project>/_git/<repo>/pullrequest/<id>`.

## Cross-platform gotchas (hard-won — do not regress)

- **`&` in a URL breaks on Windows.** `az` is `az.cmd` there; PowerShell routes it through cmd.exe, which treats `&` as a command separator. Never build a query string with `&` into a single `--url`. Pass a query-less `--url` and each parameter as a separate `--uri-parameters key=value` token (az URL-encodes and appends them).
- **Unicode crash on Windows.** az's Python inherits the console's legacy cp1252 codepage for stdout and throws `UnicodeEncodeError` on characters outside it. Set `$env:PYTHONIOENCODING = 'utf-8'` before the az calls.
- **StrictMode + optional JSON fields.** Under `Set-StrictMode -Version Latest`, reading an absent property throws. ADO responses omit optional fields (a file change item has no `isFolder`; only folders carry it; a commit may lack `comment`; an empty diff may lack `changes`). Read such fields defensively (guard with `PSObject.Properties.Name -contains`, as `Get-OptionalProperty` in the companion script does).
- **`az repos ref list --filter`** takes a `heads/...` prefix and matches by prefix only; it cannot disambiguate multiple branches sharing a work-item number. Resolve the exact branch from the pr-summary.md `Source branch:` line, not a number prefix.

## Repo conventions that shape the PR

- Source branch: `feature/wcamargo/<work-item>-<slug>`; target: `main` unless the user says otherwise.
- Title style follows commit-message guidelines: present-tense verb, short specific subject.
- Link the work item through the API call: `az repos pr create --work-items <id>` (or `az repos pr work-item add --id <prId> --work-items <id>` on an existing PR). An `AB#<id>` line in the description text does **not** create the association.
