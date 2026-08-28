# Run this in PowerShell from anywhere. Replace YOUR_TOKEN_HERE with your real SpaceByte token.
# Compatible with Windows PowerShell 5.1 (built into Windows).

$token = "10762|r3LFugKDncTNtL9rJVCApsvMZkghq7u4qLkWtcZA31594f09"

$bytes = [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
$testFile = "$env:TEMP\test-pixel.png"
[System.IO.File]::WriteAllBytes($testFile, $bytes)

Add-Type -AssemblyName System.Net.Http

$client = New-Object System.Net.Http.HttpClient
$client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)

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
    Write-Host "RESPONSE BODY:"
    Write-Host $body
} catch {
    Write-Host "REQUEST ERROR:" $_.Exception.Message
} finally {
    $client.Dispose()
}