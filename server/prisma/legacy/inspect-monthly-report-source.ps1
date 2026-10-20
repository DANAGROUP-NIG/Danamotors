<#!
Read-only SQL Server inspection for issue #79. Run on a Windows machine that can
reach Kia Plaza's LAN. No source records are changed. Credentials are prompted
securely or supplied through ISSUE79_SOURCE_CONNECTION; never written to output.
The output contains schema, counts and bounded sample rows, so keep it private.
!#>
param(
    [string]$Server = '10.1.172.133',
    [string]$Database = 'AutoEnhancer',
    [string]$OutputPath = (Join-Path $env:TEMP 'kia-plaza-monthly-source.json'),
    [ValidateRange(0, 10)][int]$SampleRows = 3
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data
$taskConnection = New-Object System.Data.SqlClient.SqlConnection
if ($env:ISSUE79_SOURCE_CONNECTION) {
    $taskBuilder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder $env:ISSUE79_SOURCE_CONNECTION
} else {
    $taskCredential = Get-Credential -UserName 'SA' -Message 'Kia Plaza SQL Server credentials (read-only inspection)'
    $taskBuilder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
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
    $taskCommand.CommandTimeout = 30
    try {
        $taskReader = $taskCommand.ExecuteReader()
        $taskRows = New-Object System.Collections.Generic.List[object]
        try {
            while ($taskReader.Read()) {
                $taskRow = [ordered]@{}
                for ($taskColumn = 0; $taskColumn -lt $taskReader.FieldCount; $taskColumn++) {
                    $taskValue = $taskReader.GetValue($taskColumn)
                    $taskRow[$taskReader.GetName($taskColumn)] = if ($taskValue -is [DBNull]) { $null } elseif ($taskValue -is [byte[]]) { '[binary omitted]' } else { $taskValue }
                }
                $taskRows.Add([pscustomobject]$taskRow)
            }
        } finally { $taskReader.Dispose() }
        return $taskRows.ToArray()
    } finally { $taskCommand.Dispose() }
}
try {
    $taskConnection.Open()
    $taskTables = @(Read-Source 'SELECT TABLE_SCHEMA,TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE=''BASE TABLE'' ORDER BY TABLE_NAME')
    $taskColumns = @(Read-Source 'SELECT TABLE_SCHEMA,TABLE_NAME,COLUMN_NAME,DATA_TYPE,IS_NULLABLE,ORDINAL_POSITION FROM INFORMATION_SCHEMA.COLUMNS ORDER BY TABLE_NAME,ORDINAL_POSITION')
    $taskForeignKeys = @(Read-Source 'SELECT fk.name AS constraint_name,OBJECT_SCHEMA_NAME(fk.parent_object_id) AS parent_schema,OBJECT_NAME(fk.parent_object_id) AS parent_table,COL_NAME(fkc.parent_object_id,fkc.parent_column_id) AS parent_column,OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS referenced_schema,OBJECT_NAME(fk.referenced_object_id) AS referenced_table,COL_NAME(fkc.referenced_object_id,fkc.referenced_column_id) AS referenced_column FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id')
    # Names are from the issue's legacy-storage inventory. Actual metadata decides
    # which exist; missing tables are reported rather than queried by assumption.
    $taskWanted = @('Job','jobbill','servbook','estimate','requisitionpartdetail','JOBLABOR','vehiclemaster','model','partmast','servhead','WarrantyHead','WarrantyDetails')
    $taskSamples = [ordered]@{}
    $taskCounts = [ordered]@{}
    foreach ($taskTable in $taskTables) {
        if ($taskWanted -notcontains $taskTable.TABLE_NAME) { continue }
        $taskSchemaName = $taskTable.TABLE_SCHEMA.Replace(']', ']]')
        $taskTableName = $taskTable.TABLE_NAME.Replace(']', ']]')
        $taskQualified = "[$taskSchemaName].[$taskTableName]"
        $taskKey = $taskTable.TABLE_SCHEMA + '.' + $taskTable.TABLE_NAME
        $taskCounts[$taskKey] = @(Read-Source "SELECT COUNT_BIG(*) AS record_count FROM $taskQualified")[0].record_count
        if ($SampleRows -gt 0) { $taskSamples[$taskKey] = @(Read-Source "SELECT TOP ($SampleRows) * FROM $taskQualified") }
    }
    $taskResult = [ordered]@{
        source = @{ server=$taskBuilder.DataSource;database=$taskBuilder.InitialCatalog;branch='Kia Plaza';readOnly=$true }
        capturedAt = [DateTime]::UtcNow.ToString('o')
        tables = $taskTables
        columns = $taskColumns
        foreignKeys = $taskForeignKeys
        requestedTablesMissing = @($taskWanted | Where-Object { $taskTables.TABLE_NAME -notcontains $_ })
        counts = $taskCounts
        samples = $taskSamples
    }
    $taskResult | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
    Write-Output "Read-only inspection saved to $OutputPath. No source or target records changed."
} finally {
    $taskConnection.Dispose()
    $taskBuilder.Password = ''
}
