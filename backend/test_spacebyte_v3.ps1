# Run this in PowerShell from anywhere. Replace YOUR_TOKEN_HERE with your real SpaceByte token.
# v3: adds browser-like headers, since SpaceByte appears to sit behind Cloudflare
# bot protection that blocks bare non-browser requests.

$token = "10762|r3LFugKDncTNtL9rJVCApsvMZkghq7u4qLkWtcZA31594f09"

$bytes = [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
$testFile = "$env:TEMP\test-pixel.png"
[System.IO.File]::WriteAllBytes($testFile, $bytes)

Add-Type -AssemblyName System.Net.Http

$client = New-Object System.Net.Http.HttpClient
$client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)
$client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
$client.DefaultRequestHeaders.Accept.ParseAdd("application/json")

$content = New-Object System.Net.Http.MultipartFormDataContent

$fileBytes = [System.IO.File]::ReadAllBytes($testFile)
$fileContent = New-Object System.Net.Http.ByteArrayContent($fileBytes)
$fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("image/png")
$content.Add($fileContent, "file", "test-pixel.png")

$parentIdContent = New-Object System.Net.Http.StringContent("11828444")
$content.Add($parentIdContent, "parentId")

try {
    $response = $client.PostAsync("https://spacebyte.in/api/v1/uploads", $content).GetAwaiter().GetResult()
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    Write-Host "STATUS CODE:" $response.StatusCode
    Write-Host "CONTENT TYPE:" $response.Content.Headers.ContentType
    Write-Host "RESPONSE BODY (first 1000 chars):"
    Write-Host $body.Substring(0, [Math]::Min(1000, $body.Length))
} catch {
    Write-Host "REQUEST ERROR:" $_.Exception.Message
} finally {
    $client.Dispose()
}
