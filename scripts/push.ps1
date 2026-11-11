# 推送 kuaidi-intel 到 GitHub。
# 背景：本机网络下 github.com 的默认解析 IP（20.205.243.16x）经常连不通，
# 但其它 GitHub 边缘 IP 可达。因此先直连，失败后逐个用 curloptResolve 换 IP 重试。
param(
    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path $PSScriptRoot -Parent
Set-Location $repo
$env:GIT_TERMINAL_PROMPT = "0"

$ips = @(
    "140.82.113.3",
    "140.82.114.3",
    "140.82.112.3",
    "140.82.116.3",
    "20.27.177.113",
    "20.205.243.168",
    "4.237.22.38"
)

function Invoke-Push([string]$ip) {
    if ([string]::IsNullOrEmpty($ip)) {
        git -c http.version=HTTP/1.1 push origin $Branch 2>&1 | Out-String | Write-Verbose
        return $LASTEXITCODE
    }
    git -c "http.curloptResolve=github.com:443:$ip" -c http.version=HTTP/1.1 push origin $Branch 2>&1 | Out-String | Write-Verbose
    return $LASTEXITCODE
}

$rc = Invoke-Push $null
if ($rc -eq 0) {
    Write-Output "push ok (direct)"
    exit 0
}

foreach ($ip in $ips) {
    $rc = Invoke-Push $ip
    if ($rc -eq 0) {
        Write-Output "push ok (pinned $ip)"
        exit 0
    }
}

Write-Output "push failed: all endpoints unreachable"
exit 1
