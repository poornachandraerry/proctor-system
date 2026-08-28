# Run this in PowerShell from anywhere. Replace YOUR_TOKEN_HERE with your real SpaceByte token.
# Creates a tiny test image and uploads it directly to SpaceByte, printing the exact response.

$token = "10762|r3LFugKDncTNtL9rJVCApsvMZkghq7u4qLkWtcZA31594f09"

$bytes = [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
$testFile = "$env:TEMP\test-pixel.png"
[System.IO.File]::WriteAllBytes($testFile, $bytes)

try {
    $response = Invoke-WebRequest -Uri "https://spacebyte.in/api/v1/uploads" `
        -Method Post `
        -Headers @{ Authorization = "Bearer $token" } `
        -Form @{ file = Get-Item $testFile; parentId = "11828444" }
    Write-Host "SUCCESS:" $response.StatusCode
    Write-Host $response.Content
} catch {
    Write-Host "FAILED:" $_.Exception.Message
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host "Response body:" $reader.ReadToEnd()
    }
}