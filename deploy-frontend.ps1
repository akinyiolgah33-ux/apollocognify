param(
    [string]$FtpHost,
    [string]$FtpUser,
    [string]$FtpPassString
)

# Cognify Frontend Deployer for InfinityFree
# Automatically uploads compiled React assets to your InfinityFree host via FTP.

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "🚀 Cognify Frontend Deployer for InfinityFree" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Build the frontend
Write-Host "📦 Building production frontend assets..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\frontend"
try {
    cmd.exe /c "npm run build"
} catch {
    Write-Error "Failed to build the React application. Make sure Node.js is installed."
    Pop-Location
    exit 1
}
Pop-Location

# 2. Get FTP credentials
Write-Host ""
Write-Host "🔐 Please enter your InfinityFree FTP Credentials:" -ForegroundColor Yellow

if ([string]::IsNullOrEmpty($FtpHost)) {
    $FtpHost = Read-Host "FTP Host (default: ftpupload.net)"
}
if ([string]::IsNullOrEmpty($FtpHost)) { $FtpHost = "ftpupload.net" }

if ([string]::IsNullOrEmpty($FtpUser)) {
    $FtpUser = Read-Host "FTP Username (e.g. if0_3xxxxxx)"
}
if ([string]::IsNullOrEmpty($FtpUser)) {
    Write-Error "FTP Username is required."
    exit 1
}

if ([string]::IsNullOrEmpty($FtpPassString)) {
    $FtpPass = Read-Host -AsSecureString "FTP Password"
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($FtpPass)
    $PlainPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
} else {
    $PlainPass = $FtpPassString
}

# Ensure FTP URL starts with ftp://
if (-not $FtpHost.StartsWith("ftp://")) {
    $FtpUrl = "ftp://$FtpHost"
} else {
    $FtpUrl = $FtpHost
}

Write-Host ""
Write-Host "📡 Connecting to FTP Server ($FtpHost) and uploading to /htdocs..." -ForegroundColor Yellow

$DistFolder = "$PSScriptRoot\frontend\dist"

function Upload-File ($localPath, $ftpPath) {
    $uri = [URI]("$FtpUrl/htdocs/$ftpPath")
    Write-Host "⬆️ Uploading: /$ftpPath" -ForegroundColor Gray
    
    $webClient = New-Object System.Net.WebClient
    $webClient.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $PlainPass)
    
    try {
        $webClient.UploadFile($uri, $localPath)
    } catch {
        Write-Host "❌ Failed to upload $ftpPath : $_" -ForegroundColor Red
    }
}

function Create-FtpDirectory ($dirPath) {
    $uri = [URI]("$FtpUrl/htdocs/$dirPath")
    $request = [System.Net.FtpWebRequest]::Create($uri)
    $request.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $PlainPass)
    $request.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
    try {
        $response = $request.GetResponse()
        $response.Close()
        Write-Host "📁 Created directory: /$dirPath" -ForegroundColor DarkCyan
    } catch {
        # Directory might already exist, ignore error
    }
}

function Upload-DirectoryRecurse ($srcDir, $destRelPath) {
    if (-not [string]::IsNullOrEmpty($destRelPath)) {
        Create-FtpDirectory $destRelPath
    }
    
    $items = Get-ChildItem -Path $srcDir
    foreach ($item in $items) {
        $relPath = if ([string]::IsNullOrEmpty($destRelPath)) { $item.Name } else { "$destRelPath/$($item.Name)" }
        if ($item.PSIsContainer) {
            Upload-DirectoryRecurse $item.FullName $relPath
        } else {
            Upload-File $item.FullName $relPath
        }
    }
}

# Run the upload
try {
    Upload-DirectoryRecurse $DistFolder ""
    Write-Host ""
    Write-Host "🎉 Deployment completed successfully! Your site is live on InfinityFree." -ForegroundColor Green
} catch {
    Write-Host "❌ Deployment failed: $_" -ForegroundColor Red
}
