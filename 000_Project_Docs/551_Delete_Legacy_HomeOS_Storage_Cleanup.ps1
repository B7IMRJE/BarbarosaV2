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
    [switch] $Execute,
    [ValidateRange(1, 1000)]
    [int] $PageSize = 100
)

$ErrorActionPreference = 'Stop'

$LegacyUserCounts = [ordered]@{
    '05a8532f-de7c-4a92-bcd0-dcfaf09b0048' = 58
    'aadf895f-92f1-40ce-893a-a5676cc9dbdb' = 3
}

$LegacyUserIds = @($LegacyUserCounts.Keys)
$ExpectedHomeItemCount = 61

$SupabaseUrl = [string]$env:SUPABASE_URL
$SupabaseUrl = $SupabaseUrl.TrimEnd('/')
$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY

if ([string]::IsNullOrWhiteSpace($SupabaseUrl)) {
    throw 'SUPABASE_URL is required.'
}

if ([string]::IsNullOrWhiteSpace($ServiceRoleKey)) {
    throw 'SUPABASE_SERVICE_ROLE_KEY is required.'
}

$AuthHeaders = @{
    apikey        = $ServiceRoleKey
    Authorization = "Bearer $ServiceRoleKey"
}

$RestHeaders = $AuthHeaders.Clone()
$RestHeaders['Accept'] = 'application/json'
$RestHeaders['Prefer'] = 'count=exact'

$RequestPaths = [System.Collections.Generic.List[string]]::new()

function ConvertTo-PostgrestInFilter {
    param(
        [Parameter(Mandatory = $true)][string[]] $Values
    )

    $quotedValues = @($Values | ForEach-Object {
        if ([string]::IsNullOrWhiteSpace([string]$_)) {
            throw 'PostgREST in filter received a blank value.'
        }

        '"' + ([string]$_).Replace('"', '\"') + '"'
    })

    'in.(' + ($quotedValues -join ',') + ')'
}

function New-PostgrestUri {
    param(
        [Parameter(Mandatory = $true)][string] $Table,
        [Parameter(Mandatory = $true)][hashtable] $Query
    )

    $queryParts = @()
    foreach ($entry in ($Query.GetEnumerator() | Sort-Object Name)) {
        $queryParts += '{0}={1}' -f
            [System.Uri]::EscapeDataString([string]$entry.Key),
            [System.Uri]::EscapeDataString([string]$entry.Value)
    }

    "$SupabaseUrl/rest/v1/$Table?$($queryParts -join '&')"
}

function Add-RequestPathLog {
    param(
        [Parameter(Mandatory = $true)][string] $Uri
    )

    $safePath = ([System.Uri]$Uri).PathAndQuery
    if (-not $RequestPaths.Contains($safePath)) {
        [void]$RequestPaths.Add($safePath)
    }
}

function Get-HeaderValue {
    param(
        [Parameter(Mandatory = $true)] $Headers,
        [Parameter(Mandatory = $true)][string] $Name
    )

    $value = $Headers[$Name]
    if ($null -eq $value) {
        return $null
    }

    if ($value -is [array]) {
        return [string]$value[0]
    }

    [string]$value
}

function Get-ExactCountFromContentRange {
    param([AllowNull()][string] $ContentRange)

    if ([string]::IsNullOrWhiteSpace($ContentRange)) {
        return $null
    }

    if ($ContentRange -match '/(\d+|\*)$' -and $Matches[1] -ne '*') {
        return [int]$Matches[1]
    }

    $null
}

function ConvertFrom-JsonArray {
    param([AllowNull()][string] $Content)

    if ([string]::IsNullOrWhiteSpace($Content)) {
        return @()
    }

    $parsed = $Content | ConvertFrom-Json
    if ($null -eq $parsed) {
        return @()
    }

    @($parsed)
}

function Invoke-SupabaseRestPage {
    param(
        [Parameter(Mandatory = $true)][string] $Table,
        [Parameter(Mandatory = $true)][hashtable] $Query,
        [Parameter(Mandatory = $true)][int] $From,
        [Parameter(Mandatory = $true)][int] $To
    )

    $uri = New-PostgrestUri -Table $Table -Query $Query
    Add-RequestPathLog -Uri $uri

    $headers = $RestHeaders.Clone()
    $headers['Range'] = "$From-$To"

    $response = Invoke-WebRequest -Method Get -Uri $uri -Headers $headers -UseBasicParsing
    $contentRange = Get-HeaderValue -Headers $response.Headers -Name 'Content-Range'

    [pscustomobject]@{
        Rows = @(ConvertFrom-JsonArray -Content $response.Content)
        ExactCount = Get-ExactCountFromContentRange -ContentRange $contentRange
        ContentRange = $contentRange
    }
}

function Invoke-SupabaseRestAll {
    param(
        [Parameter(Mandatory = $true)][string] $Table,
        [Parameter(Mandatory = $true)][hashtable] $Query
    )

    $allRows = @()
    $exactCount = $null
    $from = 0

    while ($true) {
        $to = $from + $PageSize - 1
        $page = Invoke-SupabaseRestPage -Table $Table -Query $Query -From $from -To $to
        $pageRows = @($page.Rows)

        if ($null -ne $page.ExactCount) {
            if ($null -ne $exactCount -and $exactCount -ne $page.ExactCount) {
                throw "Supabase returned inconsistent exact counts for public.$Table."
            }
            $exactCount = $page.ExactCount
        }

        $allRows += $pageRows

        if ($pageRows.Count -eq 0) {
            break
        }

        if ($null -ne $exactCount -and $allRows.Count -ge $exactCount) {
            break
        }

        if ($null -eq $exactCount -and $pageRows.Count -lt $PageSize) {
            break
        }

        $from += $pageRows.Count
    }

    [pscustomobject]@{
        Rows = @($allRows)
        ExactCount = $exactCount
    }
}

function Assert-ExpectedRestCount {
    param(
        [Parameter(Mandatory = $true)][string] $Label,
        [Parameter(Mandatory = $true)] $Result,
        [Parameter(Mandatory = $true)][int] $ExpectedCount
    )

    $rows = @($Result.Rows)

    if ($null -ne $Result.ExactCount -and $Result.ExactCount -ne $ExpectedCount) {
        throw "Expected $ExpectedCount $Label from Supabase count metadata, found $($Result.ExactCount). Storage cleanup aborted."
    }

    if ($null -eq $Result.ExactCount) {
        Write-Host "Exact count metadata unavailable for $Label; validating retrieved rows instead."
    }

    if ($rows.Count -ne $ExpectedCount) {
        throw "Expected $ExpectedCount $Label, found $($rows.Count). Storage cleanup aborted."
    }
}

function Invoke-BatchedInQuery {
    param(
        [Parameter(Mandatory = $true)][string] $Table,
        [Parameter(Mandatory = $true)][string] $Select,
        [Parameter(Mandatory = $true)][string] $Column,
        [Parameter(Mandatory = $true)][string[]] $Values,
        [int] $BatchSize = 25
    )

    $rows = @()

    for ($i = 0; $i -lt $Values.Count; $i += $BatchSize) {
        $end = [Math]::Min($i + $BatchSize - 1, $Values.Count - 1)
        $batch = @($Values[$i..$end])
        $query = @{
            select = $Select
            order = 'id.asc'
        }
        $query[$Column] = ConvertTo-PostgrestInFilter -Values $batch

        $result = Invoke-SupabaseRestAll -Table $Table -Query $query
        $rows += @($result.Rows)
    }

    @($rows)
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
        Invoke-RestMethod -Method Delete -Uri $deleteUri -Headers $AuthHeaders | Out-Null
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
                Status = if ($statusCode) { "failed: http-$statusCode" } else { 'failed' }
            }
        }
    }
}

$homeItems = @()
$homeItemCountsByUser = [ordered]@{}

foreach ($legacyUserId in $LegacyUserIds) {
    $expectedUserCount = [int]$LegacyUserCounts[$legacyUserId]
    $result = Invoke-SupabaseRestAll -Table 'home_items' -Query @{
        select = 'id,user_id,item_slug'
        user_id = "eq.$legacyUserId"
        order = 'id.asc'
    }

    Assert-ExpectedRestCount -Label "legacy home_items for user $legacyUserId" -Result $result -ExpectedCount $expectedUserCount
    $rows = @($result.Rows)
    $homeItemCountsByUser[$legacyUserId] = $rows.Count
    $homeItems += $rows
}

if ($homeItems.Count -ne $ExpectedHomeItemCount) {
    throw "Expected exactly $ExpectedHomeItemCount legacy home_items, found $($homeItems.Count). Storage cleanup aborted."
}

$homeItemsMissingIds = @($homeItems | Where-Object { [string]::IsNullOrWhiteSpace([string]$_.id) })
if ($homeItemsMissingIds.Count -gt 0) {
    throw "Found $($homeItemsMissingIds.Count) legacy home_items with blank ids. Storage cleanup aborted."
}

$unexpectedHomeItemUsers = @($homeItems | Where-Object { -not ($LegacyUserIds -contains ([string]$_.user_id)) })
if ($unexpectedHomeItemUsers.Count -gt 0) {
    throw "Found $($unexpectedHomeItemUsers.Count) home_items belonging to non-legacy users. Storage cleanup aborted."
}

$duplicateHomeItemIds = @($homeItems | Group-Object id | Where-Object { $_.Count -gt 1 })
if ($duplicateHomeItemIds.Count -gt 0) {
    throw "Found $($duplicateHomeItemIds.Count) duplicate home_item ids in REST results. Storage cleanup aborted."
}

$targetItemIds = @($homeItems | ForEach-Object { [string]$_.id } | Sort-Object -Unique)
if ($targetItemIds.Count -ne $ExpectedHomeItemCount) {
    throw "Expected $ExpectedHomeItemCount unique targeted home_item ids, found $($targetItemIds.Count). Storage cleanup aborted."
}

$targetItemSlugs = @($homeItems | ForEach-Object { $_.item_slug } | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | Sort-Object -Unique)

$fileRowsByHomeItem = @(Invoke-BatchedInQuery `
    -Table 'home_item_files' `
    -Select 'id,user_id,home_item_id,item_slug,storage_bucket,storage_path' `
    -Column 'home_item_id' `
    -Values $targetItemIds)

$legacyFileRows = @()
foreach ($legacyUserId in $LegacyUserIds) {
    $fileResult = Invoke-SupabaseRestAll -Table 'home_item_files' -Query @{
        select = 'id,user_id,home_item_id,item_slug,storage_bucket,storage_path'
        user_id = "eq.$legacyUserId"
        order = 'id.asc'
    }

    $legacyFileRows += @($fileResult.Rows)
}

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

$missingStorageMetadataRows = @($candidateRows.Values | Where-Object {
    [string]::IsNullOrWhiteSpace([string]$_.storage_bucket) -or
    [string]::IsNullOrWhiteSpace([string]$_.storage_path)
})

$objects = @($candidateRows.Values | Where-Object {
    -not [string]::IsNullOrWhiteSpace([string]$_.storage_bucket) -and
    -not [string]::IsNullOrWhiteSpace([string]$_.storage_path)
} | Sort-Object storage_bucket, storage_path -Unique)

Write-Host "Mode: $(if ($Execute) { 'EXECUTE' } else { 'DRY RUN' })"
Write-Host 'Home items found by legacy user:'
foreach ($legacyUserId in $LegacyUserIds) {
    Write-Host "  ${legacyUserId}: $($homeItemCountsByUser[$legacyUserId])"
}
Write-Host "Unique targeted item IDs: $($targetItemIds.Count)"
Write-Host "File rows found: $($candidateRows.Count)"
Write-Host "Unique storage objects: $($objects.Count)"
Write-Host "Missing bucket/path metadata: $($missingStorageMetadataRows.Count)"
Write-Host "Objects that would be deleted: $($objects.Count)"
Write-Host 'REST request paths reviewed without credentials:'
foreach ($requestPath in @($RequestPaths | Sort-Object -Unique)) {
    Write-Host "  $requestPath"
}

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

$failures = @($results | Where-Object { ([string]$_.Status).StartsWith('failed') })
Write-Host "Failures: $($failures.Count)"

$results |
    Group-Object Status |
    Sort-Object Name |
    Select-Object Name,Count |
    Format-Table -AutoSize
