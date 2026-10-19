<#
Read-only, related AutoEnhancer export for issue #79. Columns/table names were
verified against kia-plaza-monthly-source.json supplied by the user. No source
or target database writes. Run in the PowerShell extension on the Kia Plaza LAN.
#>
param(
    [string]$Server = '10.1.172.133',
    [string]$Database = 'AutoEnhancer',
    [string]$FromDate = '',
    [string]$ToDate = '',
    [ValidateRange(1, 500)][int]$MaxJobs = 100,
    [ValidateRange(1, 500)][int]$MaxBookings = 100,
    [ValidateRange(0, 30)][int]$GraceDays = 7,
    [string]$OutputPath = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'kia-plaza-monthly-cohort.json')
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data
$taskConnection = New-Object System.Data.SqlClient.SqlConnection
$taskBuilder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
if ($env:ISSUE79_SOURCE_CONNECTION) { $taskBuilder.ConnectionString = $env:ISSUE79_SOURCE_CONNECTION }
else {
    $taskCredential = Get-Credential -UserName 'SA' -Message 'Kia Plaza SQL Server credentials (read-only export)'
    $taskBuilder.DataSource = $Server
    $taskBuilder.InitialCatalog = $Database
    $taskBuilder.UserID = $taskCredential.UserName
    $taskBuilder.Password = $taskCredential.GetNetworkCredential().Password
}
$taskBuilder.TrustServerCertificate = $true
$taskBuilder.Encrypt = $true
$taskBuilder.ConnectTimeout = 15
$taskBuilder.ApplicationIntent = 'ReadOnly'
$taskConnection.ConnectionString = $taskBuilder.ConnectionString

function Read-Source([string]$Query) {
    if ($Query -notmatch '^\s*SELECT\b') { throw 'Only SELECT statements are permitted' }
    $taskCommand = $taskConnection.CreateCommand()
    $taskCommand.CommandText = $Query
    $taskCommand.CommandTimeout = 60
    $taskRows = New-Object System.Collections.Generic.List[object]
    try {
        $taskReader = $taskCommand.ExecuteReader()
        try {
            while ($taskReader.Read()) {
                $taskRow = [ordered]@{}
                for ($taskIndex = 0; $taskIndex -lt $taskReader.FieldCount; $taskIndex++) {
                    $taskValue = $taskReader.GetValue($taskIndex)
                    $taskRow[$taskReader.GetName($taskIndex)] = if ($taskValue -is [DBNull]) { $null } elseif ($taskValue -is [DateTime]) { $taskValue.ToString('yyyy-MM-ddTHH:mm:ss.fff') } elseif ($taskValue -is [byte[]]) { '[binary omitted]' } else { $taskValue }
                }
                $taskRows.Add([pscustomobject]$taskRow)
                if ($taskRows.Count -gt 25000) { throw 'More than 25,000 related rows in one table. Narrow the job/booking limits; no partial export saved.' }
            }
        } finally { $taskReader.Dispose() }
    } finally { $taskCommand.Dispose() }
    return $taskRows.ToArray()
}
function Sql-Text($Value) { return "N'" + ([string]$Value).Trim().Replace("'", "''") + "'" }
function Values-Where([string]$Column, [object[]]$Values) {
    $taskValues = @($Values | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -ne '' } | Sort-Object -Unique)
    if ($taskValues.Count -eq 0) { return '1=0' }
    return $Column + ' IN (' + (($taskValues | ForEach-Object { Sql-Text $_ }) -join ',') + ')'
}
function Keys-Where([object[]]$Rows, [string[]]$Columns, [string]$Alias = 'r') {
    $taskClauses = @($Rows | ForEach-Object {
        $taskItem = $_
        '(' + (($Columns | ForEach-Object { $Alias + '.[' + $_ + ']=' + (Sql-Text $taskItem.$_) }) -join ' AND ') + ')'
    } | Sort-Object -Unique)
    if ($taskClauses.Count -eq 0) { return '1=0' }
    return '(' + ($taskClauses -join ' OR ') + ')'
}
function Read-Related([string]$Table, [string]$Predicate) {
    # Table identifiers only come from the fixed, metadata-verified names below.
    return @(Read-Source "SELECT r.* FROM dbo.[$Table] r WHERE $Predicate")
}
try {
    $taskConnection.Open()
    if (($FromDate -eq '') -ne ($ToDate -eq '')) { throw 'Supply both FromDate and ToDate, or leave both empty.' }
    if ($FromDate -eq '') {
        $taskLatest = @(Read-Source 'SELECT MAX(jobdate) AS latestDate FROM dbo.[Job] WHERE jobdate IS NOT NULL')[0].latestDate
        if (-not $taskLatest) { throw 'No job date exists in the source.' }
        $taskLatestDate = [DateTime]::ParseExact($taskLatest, 'yyyy-MM-ddTHH:mm:ss.fff', [Globalization.CultureInfo]::InvariantCulture)
        $FromDate = $taskLatestDate.ToString('yyyy-MM-01')
        $ToDate = ([DateTime]::new($taskLatestDate.Year, $taskLatestDate.Month, 1).AddMonths(1).AddDays(-1)).ToString('yyyy-MM-dd')
    }
    $taskFrom = [DateTime]::ParseExact($FromDate, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    $taskTo = [DateTime]::ParseExact($ToDate, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    if ($taskFrom -gt $taskTo -or ($taskTo - $taskFrom).TotalDays -gt 365) { throw 'Choose an ordered range of at most 366 days.' }
    $taskEnd = $taskTo.AddDays(1).ToString('yyyyMMdd')
    $taskStart = $taskFrom.ToString('yyyyMMdd')
    $taskGraceEnd = $taskTo.AddDays(1 + $GraceDays).ToString('yyyyMMdd')
    $taskPeriod = "((j.jobdate >= '$taskStart' AND j.jobdate < '$taskEnd') OR (j.deliverydate >= '$taskStart' AND j.deliverydate < '$taskEnd') OR (j.billdt >= '$taskStart' AND j.billdt < '$taskEnd'))"
    $taskMatchingJobs = @(Read-Source "SELECT COUNT_BIG(*) AS n FROM dbo.[Job] j WHERE $taskPeriod")[0].n
    $taskJobs = @(Read-Source "SELECT TOP ($MaxJobs) j.* FROM dbo.[Job] j WHERE $taskPeriod ORDER BY j.jobdate DESC,j.trantype,j.job")
    $taskMatchingBookings = @(Read-Source "SELECT COUNT_BIG(*) AS n FROM dbo.servbook r WHERE r.bookedfordate >= '$taskStart' AND r.bookedfordate < '$taskEnd'")[0].n
    $taskBookings = @(Read-Source "SELECT TOP ($MaxBookings) r.* FROM dbo.servbook r WHERE r.bookedfordate >= '$taskStart' AND r.bookedfordate < '$taskEnd' ORDER BY r.bookedfordate,r.booking")
    $taskBookingLinks = Values-Where 'r.[booking]' @($taskJobs | ForEach-Object { $_.booking })
    $taskBookings += @(Read-Related 'servbook' $taskBookingLinks)
    $taskBookings = @($taskBookings | Group-Object booking | ForEach-Object { $_.Group[0] })
    # Include jobs linked to selected bookings and same-vehicle candidates in the
    # configured grace window, even if opened just beyond the chosen end date.
    $taskBookingJobs = Values-Where 'j.[booking]' @($taskBookings | ForEach-Object { $_.booking })
    $taskExplicitJobs = Keys-Where @($taskBookings | Where-Object { $_.job -and $_.trantype }) @('trantype', 'job') 'j'
    $taskBookingVins = Values-Where 'j.[ChassisNo]' @($taskBookings | ForEach-Object { $_.ChassisNo })
    $taskLinkedJobs = @(Read-Source "SELECT TOP (2001) j.* FROM dbo.[Job] j WHERE $taskBookingJobs OR $taskExplicitJobs OR (($taskBookingVins) AND j.jobdate >= '$taskStart' AND j.jobdate < '$taskGraceEnd')")
    if ($taskLinkedJobs.Count -gt 2000) { throw 'More than 2,000 booking-related jobs. Reduce MaxBookings; no partial export saved.' }
    $taskJobs = @(@($taskJobs) + @($taskLinkedJobs) | Group-Object trantype,job | ForEach-Object { $_.Group[0] })
    $taskData = [ordered]@{}
    $taskData['Job'] = $taskJobs
    $taskData['servbook'] = $taskBookings
    $taskJobKeys = Keys-Where $taskJobs @('trantype', 'job')
    $taskData['jobbill'] = @(Read-Related 'jobbill' $taskJobKeys)
    $taskData['jobfatax'] = @(Read-Related 'jobfatax' (Keys-Where $taskData['jobbill'] @('trantype', 'cashinv', 'bill', 'billtype')))
    $taskData['requisitionpartheader'] = @(Read-Related 'requisitionpartheader' $taskJobKeys)
    $taskRequisitionKeys = Keys-Where $taskData['requisitionpartheader'] @('trantype', 'storelocation', 'series', 'requisition')
    $taskData['requisitionpartdetail'] = @(Read-Related 'requisitionpartdetail' $taskRequisitionKeys)
    $taskData['requisitionreturndetail'] = @(Read-Related 'requisitionreturndetail' $taskRequisitionKeys)
    $taskData['requisitionreturnheader'] = @(Read-Related 'requisitionreturnheader' (Keys-Where $taskData['requisitionreturndetail'] @('trantype', 'storelocation', 'series', 'reqreturn')))
    $taskData['joblaborhead'] = @(Read-Related 'joblaborhead' $taskJobKeys)
    $taskData['joblabordetail'] = @(Read-Related 'joblabordetail' (Keys-Where $taskData['joblaborhead'] @('trantype', 'labourslip')))
    $taskData['JOBLABOR'] = @(Read-Related 'JOBLABOR' $taskJobKeys)
    $taskData['JobTrouble'] = @(Read-Related 'JobTrouble' $taskJobKeys)
    $taskEstimates = Values-Where 'r.[estimate]' @($taskJobs | ForEach-Object { @($_.estimate, $_.EstimateNo) })
    $taskData['estimate'] = @(Read-Related 'estimate' "($taskJobKeys) OR ($taskEstimates) OR (r.estimatedate >= '$taskStart' AND r.estimatedate < '$taskEnd' AND (r.job IS NULL OR LTRIM(RTRIM(CONVERT(nvarchar(100),r.job)))=''))")
    # Standalone estimates are still bounded: narrow the date range rather than
    # silently truncating their related lines.
    if ($taskData['estimate'].Count -gt 2000) { throw 'More than 2,000 estimates. Narrow dates; no partial export saved.' }
    $taskEstimateKeys = Keys-Where $taskData['estimate'] @('estimate')
    foreach ($taskTable in @('estimateparts','estimatelabour','estimatetrouble')) { $taskData[$taskTable] = @(Read-Related $taskTable $taskEstimateKeys) }
    $taskVins = @($taskJobs | ForEach-Object { $_.ChassisNo }) + @($taskBookings | ForEach-Object { $_.ChassisNo }) + @($taskData['estimate'] | ForEach-Object { @($_.chassisno, $_.chassis) })
    $taskVinPredicate = Values-Where 'r.[ChassisNo]' $taskVins
    $taskData['vehiclemaster'] = @(Read-Related 'vehiclemaster' $taskVinPredicate)
    $taskData['CorporateCustomerVins'] = @(Read-Related 'CorporateCustomerVins' $taskVinPredicate)
    $taskCustomerKeys = @($taskJobs | Where-Object { $_.customer } | ForEach-Object { [pscustomobject]@{customer=$_.customer;custtype=$_.custtype} }) + @($taskBookings | Where-Object { $_.Customer } | ForEach-Object { [pscustomobject]@{customer=$_.Customer;custtype=$_.CustType} }) + @($taskData['vehiclemaster'] | Where-Object { $_.custcode } | ForEach-Object { [pscustomobject]@{customer=$_.custcode;custtype=$_.CustType} })
    $taskData['Customer'] = @(Read-Related 'Customer' (Keys-Where $taskCustomerKeys @('customer','custtype')))
    $taskVehicleDimensions = @($taskJobs) + @($taskBookings) + @($taskData['vehiclemaster']) + @($taskData['estimate'])
    $taskData['model'] = @(Read-Related 'model' (Keys-Where $taskVehicleDimensions @('make','model')))
    $taskData['variant'] = @(Read-Related 'variant' (Keys-Where $taskVehicleDimensions @('make','model','Variant')))
    $taskServiceCodes = @($taskJobs | ForEach-Object { $_.service }) + @($taskBookings | ForEach-Object { $_.service })
    $taskData['servhead'] = @(Read-Related 'servhead' (Values-Where 'r.[service]' $taskServiceCodes))
    $taskPartKeys = @($taskData['requisitionpartdetail']) + @($taskData['estimateparts'])
    $taskData['partmast'] = @(Read-Related 'partmast' (Keys-Where $taskPartKeys @('make','part','partflag')))
    $taskLabourCodes = @($taskData['joblabordetail'] | ForEach-Object { $_.labour }) + @($taskData['JOBLABOR'] | ForEach-Object { $_.labour }) + @($taskData['estimatelabour'] | ForEach-Object { $_.labour })
    $taskData['labourhead'] = @(Read-Related 'labourhead' (Values-Where 'r.[labour]' $taskLabourCodes))
    $taskStaffCodes = @($taskJobs | ForEach-Object { @($_.supervisoratt,$_.supervisordel,$_.mainmechanic) }) + @($taskData['joblabordetail'] | ForEach-Object { @($_.mechanic,$_.mechanic2,$_.mechanic3) })
    $taskStaffPredicate = Values-Where 'r.[employee]' $taskStaffCodes
    $taskData['Employee'] = @(Read-Source "SELECT r.employee,r.designation,r.name,r.empgroup,r.department FROM dbo.[Employee] r WHERE $taskStaffPredicate")
    $taskData['WarrantyHead'] = @(Read-Related 'WarrantyHead' $taskJobKeys)
    $taskData['WarrantyDetails'] = @(Read-Related 'WarrantyDetails' (Keys-Where $taskData['WarrantyHead'] @('WCNO')))
    $taskCounts = [ordered]@{}
    foreach ($taskKey in $taskData.Keys) { $taskCounts[$taskKey] = @($taskData[$taskKey]).Count }
    $taskExport = [ordered]@{
        format = 'danamotors-kia-plaza-cohort-v1'
        source = @{server=$taskBuilder.DataSource;database=$taskBuilder.InitialCatalog;branch='Kia Plaza';readOnly=$true;timeZone='Africa/Lagos'}
        capturedAt = [DateTime]::UtcNow.ToString('o')
        selection = @{from=$FromDate;to=$ToDate;maxJobs=$MaxJobs;maxBookings=$MaxBookings;graceDays=$GraceDays;matchingPeriodJobs=$taskMatchingJobs;matchingPeriodBookings=$taskMatchingBookings;completePeriodJobSelection=($taskMatchingJobs -le $MaxJobs);completePeriodBookingSelection=($taskMatchingBookings -le $MaxBookings);historyScope='Selected cohort only, not full lifetime history'}
        counts = $taskCounts
        tables = $taskData
    }
    $taskExport | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
    Write-Output "Related export saved to $OutputPath"
    Write-Output "Report dates: $FromDate to $ToDate. No database records changed."
    $taskCounts | ConvertTo-Json
} finally {
    $taskConnection.Dispose()
    $taskBuilder.Password = ''
}
