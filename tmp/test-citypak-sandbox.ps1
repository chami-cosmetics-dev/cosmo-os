# Falcon / CityPak sandbox smoke test (API v0.2.5)
# Usage:
#   $env:CITYPAK_TOKEN = "<staging token for account 5218>"
#   .\tmp\test-citypak-sandbox.ps1
#
# Optional:
#   $env:CITYPAK_BASE_URL = "https://staging.citypak.lk"
#   $env:CITYPAK_REFERENCE = "COSMO-TEST-001"

param(
  [string]$Token = $env:CITYPAK_TOKEN,
  [string]$BaseUrl = $(if ($env:CITYPAK_BASE_URL) { $env:CITYPAK_BASE_URL } else { "https://staging.citypak.lk" }),
  [string]$Reference = $(if ($env:CITYPAK_REFERENCE) { $env:CITYPAK_REFERENCE } else { "COSMO-TEST-$(Get-Date -Format 'yyyyMMdd-HHmmss')" })
)

$ErrorActionPreference = "Stop"

if (-not $Token) {
  Write-Error "Set CITYPAK_TOKEN to the staging API token CityPak sent for one account (5218, 8592, or 8656)."
}

function Invoke-CityPakJson {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers = @{},
    [object]$Body
  )

  $params = @{
    Method      = $Method
    Uri         = $Url
    Headers     = $Headers
    ContentType = "application/json"
  }
  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 6 -Compress)
  }

  try {
    $response = Invoke-WebRequest @params -UseBasicParsing
    return @{
      StatusCode = [int]$response.StatusCode
      Body       = $response.Content
      Raw        = $response
    }
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $content = $reader.ReadToEnd()
      $reader.Close()
      return @{
        StatusCode = [int]$resp.StatusCode
        Body       = $content
        Raw        = $null
      }
    }
    throw
  }
}

Write-Host "=== CityPak sandbox test ===" -ForegroundColor Cyan
Write-Host "Base URL : $BaseUrl"
Write-Host "Reference: $Reference"
Write-Host ""

# 1) Create order (token in JSON body)
$createBody = @{
  token                   = $Token
  reference               = $Reference
  from_name               = "Cosmo OS Sandbox Test"
  from_address_line_1     = "123 Test Warehouse Lane"
  from_address_line_2     = ""
  from_address_line_3     = ""
  from_address_line_4     = "Colombo"
  from_contact_name       = "Warehouse"
  from_contact_1          = "0770000000"
  from_contact_2          = ""
  to_name                 = "Sandbox Test Customer"
  to_address_line_1       = "456 Test Delivery Road"
  to_address_line_2       = ""
  to_address_line_3       = ""
  to_address_line_4       = "Kandy"
  to_contact_name         = "Sandbox Test Customer"
  to_contact_1            = "0771111111"
  to_contact_2            = ""
  to_nic                  = ""
  description             = "Cosmo OS API sandbox test"
  weight_g                = 500
  cash_on_delivery_amount = 0
  number_of_pieces        = 1
}

Write-Host "1) Create order..." -ForegroundColor Yellow
$create = Invoke-CityPakJson -Method POST -Url "$BaseUrl/customer_api/v1/orders" -Body $createBody
Write-Host "   HTTP $($create.StatusCode)"
Write-Host "   $($create.Body)"

if ($create.StatusCode -ne 200) {
  Write-Error "Create order failed. Check token and mandatory fields."
}

$createJson = $create.Body | ConvertFrom-Json
if (-not $createJson.success) {
  Write-Error "Create order returned success=false: $($createJson.message)"
}

$orderId = $createJson.data.order_id
$trackingNumber = $createJson.data.items[0].tracking_number

Write-Host ""
Write-Host "   order_id        : $orderId"
Write-Host "   tracking_number : $trackingNumber"
Write-Host ""

# 2) Track order (Bearer token)
Write-Host "2) Track order..." -ForegroundColor Yellow
$track = Invoke-CityPakJson -Method GET `
  -Url "$BaseUrl/customer_api/v1/track?tracking_number=$trackingNumber" `
  -Headers @{ Authorization = "Bearer $Token" }
Write-Host "   HTTP $($track.StatusCode)"
Write-Host "   $($track.Body)"
Write-Host ""

# 3) Download waybill PDF by order id
Write-Host "3) Download waybill PDF..." -ForegroundColor Yellow
$pdfPath = Join-Path $PSScriptRoot "citypak-waybill-$Reference.pdf"
try {
  Invoke-WebRequest `
    -Method GET `
    -Uri "$BaseUrl/customer_api/v1/orders/$orderId/waybills?page_size=A4&per_page_waybill_count=1" `
    -Headers @{ Authorization = "Bearer $Token" } `
    -OutFile $pdfPath `
    -UseBasicParsing | Out-Null
  Write-Host "   Saved: $pdfPath"
} catch {
  Write-Warning "   Waybill download failed: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Send CityPak these for live creds:"
Write-Host "  reference       = $Reference"
Write-Host "  order_id        = $orderId"
Write-Host "  tracking_number = $trackingNumber"
