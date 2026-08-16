# One-shot publish helper for dsh-plugin-focus.
#
# Usage:
#   $env:NPM_TOKEN = 'npm_...'    # or drop the token into npm-token.txt next to this script
#   pwsh -File scripts/publish-npm.ps1
#
# The token is written to a temporary, gitignored .npmrc for the duration of
# the publish and removed afterwards. The npm cache is kept inside the repo
# so the command works under the DSH file sandbox.
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) -Parent
$node = Join-Path $env:DSH_NODE_DIR 'node.exe'
$npmCli = Join-Path $env:DSH_NODE_DIR 'node_modules\npm\bin\npm-cli.js'
$token = $env:NPM_TOKEN
if (-not $token -and (Test-Path (Join-Path $root 'npm-token.txt'))) {
  $token = (Get-Content (Join-Path $root 'npm-token.txt') -Raw).Trim()
}
if (-not $token) { throw 'NPM_TOKEN not set and npm-token.txt missing' }
$npmrc = Join-Path $root '.npmrc'
try {
  Set-Content -Path $npmrc -Value ("//registry.npmjs.org/:_authToken=" + $token) -Encoding ascii
  & $node $npmCli publish --ignore-scripts --cache (Join-Path $root '.npm-cache') 2>&1
  if ($LASTEXITCODE -ne 0) { throw "npm publish failed (exit $LASTEXITCODE)" }
  Write-Host "published dsh-plugin-focus - check https://www.npmjs.com/package/dsh-plugin-focus"
} finally {
  Remove-Item -Force $npmrc -ErrorAction SilentlyContinue
  if (Test-Path (Join-Path $root 'npm-token.txt')) { Remove-Item -Force (Join-Path $root 'npm-token.txt') }
}
