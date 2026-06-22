<#
Deletes Supabase Storage objects referenced by legacy HomeOS file rows.

Default mode is dry-run. This script queries database metadata first and only
acts on individual bucket/path pairs referenced by rows included in the
legacy cleanup scope.

Required environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Examples:
  pwsh ./000_Project_Docs/551_Delete_Legacy_HomeOS_Storage_Cleanup.ps1
  pwsh ./000_Project_Docs/551_Delete_Legacy_HomeOS_Storage_Cleanup.ps1 -Execute
#>

param(
    [switch] $Execute
)

$ErrorActionPreference = 'Stop'

$LegacyUserIds = @(
    '05a8532f-de7c-4a92-bcd0-dcfaf09b0048',
    'aadf895f-92f1-40ce-893a-a5676cc9dbdb'
)

$SupabaseUrl = [string]$env:SUPABASE_URL
$SupabaseUrl = $SupabaseUrl.TrimEnd('/')
$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY

if ([string]::IsNullOrWhiteSpace($SupabaseUrl)) {
    throw 'SUPABASE_URL is required.'
}

if ([string]::IsNullOrWhiteSpace($ServiceRoleKey)) {
    throw 'SUPABASE_SERVICE_ROLE_KEY is required.'
}

$Headers = @{
    apikey        = $ServiceRoleKey
    Authorization = "Bearer $ServiceRoleKey"
}

function Invoke-SupabaseRest {
    param(
        [Parameter(Mandatory = $true)][string] $Path
    )

    Invoke-RestMethod -Method Get -Uri "$SupabaseUrl/rest/v1/$Path" -Headers $Headers
}

function Escape-PathSegment {
    param([Parameter(Mandatory = $true)][string] $Segment)
    [System.Uri]::EscapeDataString($Segment)
}

function Get-StorageDeleteUri {
    param(
        [Parameter(Mandatory = $true)][string] $Bucket,
        [Parameter(Mandatory = $true)][string] $Path
    )

    $encodedBucket = Escape-PathSegment $Bucket
    $encodedPath = ($Path -split '/' | ForEach-Object { Escape-PathSegment $_ }) -join '/'
    "$SupabaseUrl/storage/v1/object/$encodedBucket/$encodedPath"
}

function Remove-StorageObject {
    param(
        [Parameter(Mandatory = $true)][string] $Bucket,
        [Parameter(Mandatory = $true)][string] $Path
    )

    $deleteUri = Get-StorageDeleteUri -Bucket $Bucket -Path $Path

    try {
        Invoke-RestMethod -Method Delete -Uri $deleteUri -Headers $Headers | Out-Null
        [pscustomobject]@{
            Bucket = $Bucket
            Path = $Path
            Status = 'deleted'
        }
    } catch {
        $statusCode = $null
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }

        if ($statusCode -eq 404) {
            [pscustomobject]@{
                Bucket = $Bucket
                Path = $Path
                Status = 'missing'
            }
        } else {
            [pscustomobject]@{
                Bucket = $Bucket
                Path = $Path
                Status = "failed: $($_.Exception.Message)"
            }
        }
    }
}

$legacyFilter = $LegacyUserIds -join ','
$homeItems = @(Invoke-SupabaseRest "home_items?select=id,user_id,item_slug&user_id=in.($legacyFilter)")

if ($homeItems.Count -ne 61) {
    throw "Expected exactly 61 legacy home_items, found $($homeItems.Count). Storage cleanup aborted."
}

$targetItemIds = @($homeItems | ForEach-Object { $_.id } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
$targetItemSlugs = @($homeItems | ForEach-Object { $_.item_slug } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)

$fileRowsByHomeItem = @()
for ($i = 0; $i -lt $targetItemIds.Count; $i += 25) {
    $batch = $targetItemIds[$i..([Math]::Min($i + 24, $targetItemIds.Count - 1))]
    $idFilter = $batch -join ','
    $fileRowsByHomeItem += @(Invoke-SupabaseRest "home_item_files?select=id,user_id,home_item_id,item_slug,storage_bucket,storage_path&home_item_id=in.($idFilter)")
}

$legacyFileRows = @(Invoke-SupabaseRest "home_item_files?select=id,user_id,home_item_id,item_slug,storage_bucket,storage_path&user_id=in.($legacyFilter)")

$targetItemIdSet = [System.Collections.Generic.HashSet[string]]::new()
$targetItemIds | ForEach-Object { [void]$targetItemIdSet.Add([string]$_) }

$targetSlugSet = [System.Collections.Generic.HashSet[string]]::new()
$targetItemSlugs | ForEach-Object { [void]$targetSlugSet.Add([string]$_) }

$candidateRows = @{}

foreach ($row in @($fileRowsByHomeItem + $legacyFileRows)) {
    if (-not $row.id) {
        continue
    }

    $isLinkedTargetItem = $row.home_item_id -and $targetItemIdSet.Contains([string]$row.home_item_id)
    $isLegacyMissingHomeItem = $LegacyUserIds -contains ([string]$row.user_id) -and [string]::IsNullOrWhiteSpace([string]$row.home_item_id)
    $isLegacySlugMatch = $LegacyUserIds -contains ([string]$row.user_id) -and $row.item_slug -and $targetSlugSet.Contains([string]$row.item_slug)

    if ($isLinkedTargetItem -or $isLegacyMissingHomeItem -or $isLegacySlugMatch) {
        $candidateRows[[string]$row.id] = $row
    }
}

$crossUserRows = @($candidateRows.Values | Where-Object {
    $_.home_item_id -and $targetItemIdSet.Contains([string]$_.home_item_id) -and $_.user_id -and -not ($LegacyUserIds -contains ([string]$_.user_id))
})

if ($crossUserRows.Count -gt 0) {
    throw "Found $($crossUserRows.Count) non-legacy file rows linked to targeted home_items. Storage cleanup aborted."
}

$objects = @($candidateRows.Values | Where-Object {
    -not [string]::IsNullOrWhiteSpace([string]$_.storage_bucket) -and
    -not [string]::IsNullOrWhiteSpace([string]$_.storage_path)
} | Sort-Object storage_bucket, storage_path -Unique)

Write-Host "Mode: $(if ($Execute) { 'EXECUTE' } else { 'DRY RUN' })"
Write-Host "Target home_items: $($homeItems.Count)"
Write-Host "Target file rows: $($candidateRows.Count)"
Write-Host "Target storage objects: $($objects.Count)"

$results = @()

foreach ($object in $objects) {
    $bucket = [string]$object.storage_bucket
    $path = [string]$object.storage_path
    Write-Host "Storage object: bucket=$bucket path=$path"

    if ($Execute) {
        $results += Remove-StorageObject -Bucket $bucket -Path $path
    } else {
        $results += [pscustomobject]@{
            Bucket = $bucket
            Path = $path
            Status = 'dry-run'
        }
    }
}

$results |
    Group-Object Status |
    Sort-Object Name |
    Select-Object Name,Count |
    Format-Table -AutoSize
