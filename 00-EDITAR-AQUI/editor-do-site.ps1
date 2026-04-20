param(
  [switch]$SmokeTest
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:projectDir = Split-Path -Parent $script:baseDir
$script:avatarsDir = Join-Path $script:projectDir "assets\avatars"
$script:backupDir = Join-Path $script:baseDir "_backups"
$script:utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$script:tabControl = $null
$script:statusLabel = $null
$script:tabStates = New-Object System.Collections.Generic.List[object]

function ConvertTo-EditorPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FileName
  )

  return Join-Path $script:baseDir $FileName
}

function Ensure-Directory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Read-EditorFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return ""
  }

  return Get-Content -LiteralPath $Path -Raw -Encoding UTF8
}

function Backup-EditorFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  Ensure-Directory -Path $script:backupDir
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupName = "{0}.{1}.bak" -f ([System.IO.Path]::GetFileName($Path)), $timestamp
  $backupPath = Join-Path $script:backupDir $backupName
  Copy-Item -LiteralPath $Path -Destination $backupPath -Force
}

function Write-EditorFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Content
  )

  Ensure-Directory -Path (Split-Path -Parent $Path)
  Backup-EditorFile -Path $Path
  [System.IO.File]::WriteAllText($Path, $Content, $script:utf8NoBom)
}

function Set-EditorStatus {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  if ($script:statusLabel) {
    $script:statusLabel.Text = $Message
  }
}

function Escape-JsString {
  param(
    [AllowNull()]
    [string]$Value
  )

  $safeValue = [string]$Value
  $safeValue = $safeValue.Replace('\', '\\')
  $safeValue = $safeValue.Replace('"', '\"')
  $safeValue = $safeValue.Replace("`r`n", '\n')
  $safeValue = $safeValue.Replace("`n", '\n')
  $safeValue = $safeValue.Replace("`r", '')
  return $safeValue
}

function Unescape-JsString {
  param(
    [AllowNull()]
    [string]$Value
  )

  $safeValue = [string]$Value
  $safeValue = $safeValue -replace '\\n', "`r`n"
  $safeValue = $safeValue -replace '\\"', '"'
  $safeValue = $safeValue -replace '\\\\', '\'
  return $safeValue
}

function ConvertTo-BoolLiteral {
  param(
    [bool]$Value
  )

  if ($Value) {
    return "true"
  }

  return "false"
}

function Get-RegexString {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Text,

    [Parameter(Mandatory = $true)]
    [string]$Pattern,

    [string]$Default = ""
  )

  $match = [regex]::Match($Text, $Pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($match.Success) {
    return Unescape-JsString -Value $match.Groups[1].Value
  }

  return $Default
}

function Get-RegexBool {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Text,

    [Parameter(Mandatory = $true)]
    [string]$Pattern,

    [bool]$Default = $false
  )

  $match = [regex]::Match($Text, $Pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($match.Success) {
    return $match.Groups[1].Value -eq "true"
  }

  return $Default
}

function Get-RegexInt {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Text,

    [Parameter(Mandatory = $true)]
    [string]$Pattern,

    [int]$Default = 0
  )

  $match = [regex]::Match($Text, $Pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($match.Success) {
    return [int]$match.Groups[1].Value
  }

  return $Default
}

function Get-FrozenBlock {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Text,

    [Parameter(Mandatory = $true)]
    [string]$BlockName
  )

  $pattern = [regex]::Escape($BlockName) + ':\s*Object\.freeze\(\s*\{(?<body>[\s\S]*?)\}\s*\)'
  $match = [regex]::Match($Text, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($match.Success) {
    return $match.Groups["body"].Value
  }

  return ""
}

function ConvertFrom-RelaxedJson {
  param(
    [Parameter(Mandatory = $true)]
    [string]$JsonText
  )

  $sanitized = $JsonText -replace ",(\s*[}\]])", '$1'
  return ConvertFrom-Json -InputObject $sanitized
}

function ConvertTo-ArrayList {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$Items
  )

  $list = New-Object System.Collections.ArrayList
  foreach ($item in $Items) {
    [void]$list.Add($item)
  }

  Write-Output -NoEnumerate $list
}

function Format-CalendarKey {
  param(
    [Parameter(Mandatory = $true)]
    $Entry
  )

  $stableId = Normalize-EditorText -Value ([string]$Entry.id)
  if (-not [string]::IsNullOrWhiteSpace($stableId)) {
    return $stableId
  }

  return "{0}|{1}|{2}" -f $Entry.title, $Entry.date, $Entry.time
}

function ConvertTo-CalendarIdPart {
  param(
    [AllowNull()]
    [string]$Value
  )

  $text = Normalize-EditorText -Value $Value
  if ([string]::IsNullOrWhiteSpace($text)) {
    return ""
  }

  $decomposed = $text.Normalize([System.Text.NormalizationForm]::FormD)
  $builder = New-Object System.Text.StringBuilder

  foreach ($char in $decomposed.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($char) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($char)
    }
  }

  $normalized = $builder.ToString().ToLowerInvariant()
  return ([regex]::Replace($normalized, "[^a-z0-9]+", "-")).Trim("-")
}

function Get-CalendarGeneratedId {
  param(
    [Parameter(Mandatory = $true)]
    $Entry
  )

  $parts = @(
    ConvertTo-CalendarIdPart -Value ([string]$Entry.date),
    ConvertTo-CalendarIdPart -Value ([string]$Entry.title),
    ConvertTo-CalendarIdPart -Value ([string]$Entry.location)
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  return ($parts -join "-")
}

function Normalize-CalendarLegacyIds {
  param(
    [AllowNull()]
    [object[]]$Ids,

    [string]$CurrentId = ""
  )

  $seen = @{}
  $normalizedCurrentId = Normalize-EditorText -Value $CurrentId
  $result = New-Object System.Collections.Generic.List[string]

  foreach ($item in @($Ids)) {
    $candidate = Normalize-EditorText -Value ([string]$item)
    if (
      [string]::IsNullOrWhiteSpace($candidate) -or
      $candidate -eq $normalizedCurrentId -or
      $seen.ContainsKey($candidate)
    ) {
      continue
    }

    $seen[$candidate] = $true
    [void]$result.Add($candidate)
  }

  return @($result.ToArray())
}

function Get-CalendarStableId {
  param(
    [Parameter(Mandatory = $true)]
    $Entry
  )

  $existingId = Normalize-EditorText -Value ([string]$Entry.id)
  if (-not [string]::IsNullOrWhiteSpace($existingId)) {
    return $existingId
  }

  $generatedId = Get-CalendarGeneratedId -Entry $Entry
  if (-not [string]::IsNullOrWhiteSpace($generatedId)) {
    return $generatedId
  }

  return ""
}

function Sort-CalendarEntries {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$Entries
  )

  return @(
    $Entries |
      Sort-Object @{
        Expression = {
          $datePart = [string]$_.date
          $timePart = if ([string]::IsNullOrWhiteSpace([string]$_.time)) { "99:99" } else { [string]$_.time }
          "{0}|{1}|{2}" -f $datePart, $timePart, ([string]$_.title)
        }
      }
  )
}

function Sort-AthleteNames {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Names
  )

  return @(
    $Names |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      ForEach-Object { $_.Trim() } |
      Sort-Object -Unique
  )
}

function Normalize-EditorText {
  param(
    [AllowNull()]
    [string]$Value
  )

  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text)) {
    return ""
  }

  $normalized = $text.Normalize([System.Text.NormalizationForm]::FormD)
  $builder = New-Object System.Text.StringBuilder

  foreach ($char in $normalized.ToCharArray()) {
    $category = [System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($char)
    if ($category -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($char)
    }
  }

  $plainText = $builder.ToString().Normalize([System.Text.NormalizationForm]::FormC).ToLowerInvariant()
  $plainText = [regex]::Replace($plainText, '[^a-z0-9]+', ' ')
  return ([regex]::Replace($plainText, '\s+', ' ')).Trim()
}

function Split-CsvLine {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Line,

    [string]$Delimiter = ";"
  )

  $fields = New-Object System.Collections.Generic.List[string]
  $current = New-Object System.Text.StringBuilder
  $inQuotes = $false
  $delimiterChar = if ([string]::IsNullOrEmpty($Delimiter)) { ';' } else { $Delimiter[0] }

  for ($index = 0; $index -lt $Line.Length; $index += 1) {
    $char = $Line[$index]

    if ($char -eq '"') {
      if ($inQuotes -and ($index + 1) -lt $Line.Length -and $Line[$index + 1] -eq '"') {
        [void]$current.Append('"')
        $index += 1
      } else {
        $inQuotes = -not $inQuotes
      }

      continue
    }

    if ((-not $inQuotes) -and $char -eq $delimiterChar) {
      [void]$fields.Add($current.ToString())
      [void]$current.Clear()
      continue
    }

    [void]$current.Append($char)
  }

  [void]$fields.Add($current.ToString())
  return @($fields.ToArray())
}

function Get-DetectedCsvDelimiter {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Lines
  )

  $sampleLines = @(
    $Lines |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      Select-Object -First 5
  )

  if ($sampleLines.Count -eq 0) {
    return ";"
  }

  $bestDelimiter = ";"
  $bestScore = -1

  foreach ($candidate in @(";", ",", "`t")) {
    $score = 0
    foreach ($line in $sampleLines) {
      $score += ([regex]::Matches($line, [regex]::Escape($candidate))).Count
    }

    if ($score -gt $bestScore) {
      $bestDelimiter = $candidate
      $bestScore = $score
    }
  }

  return $bestDelimiter
}

function Import-AthleteNamesFromCsvFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Arquivo CSV nao encontrado."
  }

  $content = Get-Content -LiteralPath $Path -Raw
  if ([string]::IsNullOrWhiteSpace($content)) {
    return @()
  }

  $lines = @(
    $content -split "\r?\n" |
      ForEach-Object { $_.TrimEnd("`r") } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  )

  if ($lines.Count -eq 0) {
    return @()
  }

  $delimiter = Get-DetectedCsvDelimiter -Lines $lines
  $headerFields = @(Split-CsvLine -Line $lines[0] -Delimiter $delimiter)
  $normalizedHeaders = @(
    $headerFields |
      ForEach-Object { Normalize-EditorText -Value ([string]$_).TrimStart([char]0xFEFF) }
  )

  $nameColumnIndex = -1
  for ($index = 0; $index -lt $normalizedHeaders.Count; $index += 1) {
    if ($normalizedHeaders[$index] -match '(^| )(nome|atleta|corredor|competidor)( |$)') {
      $nameColumnIndex = $index
      break
    }
  }

  $startIndex = 1
  if ($nameColumnIndex -lt 0) {
    $nameColumnIndex = 0

    if ($headerFields.Count -eq 1) {
      $firstHeader = if ($normalizedHeaders.Count -gt 0) { [string]$normalizedHeaders[0] } else { "" }
      if ($firstHeader -notmatch '(^| )(nome|atleta|corredor|competidor)( |$)') {
        $startIndex = 0
      }
    }
  }

  $names = New-Object System.Collections.Generic.List[string]
  for ($lineIndex = $startIndex; $lineIndex -lt $lines.Count; $lineIndex += 1) {
    $fields = @(Split-CsvLine -Line $lines[$lineIndex] -Delimiter $delimiter)
    if ($fields.Count -le $nameColumnIndex) {
      continue
    }

    $name = ([string]$fields[$nameColumnIndex]).Trim().TrimStart([char]0xFEFF)
    if (-not [string]::IsNullOrWhiteSpace($name)) {
      [void]$names.Add($name)
    }
  }

  return @(Sort-AthleteNames -Names $names.ToArray())
}

function Sort-AvatarEntries {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$Entries
  )

  $typeOrder = @{
    "ID" = 0
    "E-mail" = 1
    "Nome" = 2
  }

  return @(
    $Entries |
      Sort-Object @{
        Expression = {
          if ($typeOrder.ContainsKey([string]$_.LookupType)) {
            $typeOrder[[string]$_.LookupType]
          } else {
            99
          }
        }
      }, @{
        Expression = { [string]$_.Identifier }
      }
  )
}

function ConvertTo-DateTimeValue {
  param(
    [string]$Value,
    [datetime]$Fallback = (Get-Date)
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $Fallback
  }

  try {
    return ([datetimeoffset]::Parse($Value)).DateTime
  } catch {
    return $Fallback
  }
}

function ConvertTo-IsoWithProjectOffset {
  param(
    [Parameter(Mandatory = $true)]
    [datetime]$Value
  )

  return $Value.ToString("yyyy-MM-ddTHH:mm:ss") + "-03:00"
}

function New-TabState {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseTitle,

    [Parameter(Mandatory = $true)]
    [string]$FileName,

    [Parameter(Mandatory = $true)]
    [System.Windows.Forms.TabPage]$TabPage
  )

  $state = [PSCustomObject]@{
    BaseTitle = $BaseTitle
    FileName = $FileName
    Path = ConvertTo-EditorPath -FileName $FileName
    TabPage = $TabPage
    Dirty = $false
    Loading = $false
    SaveAction = $null
    ReloadAction = $null
    Model = $null
    CurrentKey = ""
    PendingAvatarSourcePath = ""
  }

  $TabPage.Tag = $state
  $script:tabStates.Add($state) | Out-Null
  return $state
}

function Set-TabDirty {
  param(
    [Parameter(Mandatory = $true)]
    $State,

    [bool]$Dirty
  )

  $State.Dirty = $Dirty
  $prefix = if ($Dirty) { "* " } else { "" }
  $State.TabPage.Text = "{0}{1}" -f $prefix, $State.BaseTitle
}

function Register-DirtyEvents {
  param(
    [Parameter(Mandatory = $true)]
    $State,

    [Parameter(Mandatory = $true)]
    [System.Windows.Forms.Control[]]$Controls
  )

  foreach ($control in $Controls) {
    if ($null -eq $control) {
      continue
    }

    if ($control -is [System.Windows.Forms.TextBox]) {
      $control.Add_TextChanged({
        if (-not $State.Loading) {
          Set-TabDirty -State $State -Dirty $true
          Set-EditorStatus -Message ("Alteracoes pendentes em: {0}" -f $State.FileName)
        }
      }.GetNewClosure())
      continue
    }

    if ($control -is [System.Windows.Forms.CheckBox]) {
      $control.Add_CheckedChanged({
        if (-not $State.Loading) {
          Set-TabDirty -State $State -Dirty $true
          Set-EditorStatus -Message ("Alteracoes pendentes em: {0}" -f $State.FileName)
        }
      }.GetNewClosure())
      continue
    }

    if ($control -is [System.Windows.Forms.NumericUpDown]) {
      $control.Add_ValueChanged({
        if (-not $State.Loading) {
          Set-TabDirty -State $State -Dirty $true
          Set-EditorStatus -Message ("Alteracoes pendentes em: {0}" -f $State.FileName)
        }
      }.GetNewClosure())
      continue
    }

    if ($control -is [System.Windows.Forms.DateTimePicker]) {
      $control.Add_ValueChanged({
        if (-not $State.Loading) {
          Set-TabDirty -State $State -Dirty $true
          Set-EditorStatus -Message ("Alteracoes pendentes em: {0}" -f $State.FileName)
        }
      }.GetNewClosure())
      continue
    }

    if ($control -is [System.Windows.Forms.ComboBox]) {
      $control.Add_SelectedIndexChanged({
        if (-not $State.Loading) {
          Set-TabDirty -State $State -Dirty $true
          Set-EditorStatus -Message ("Alteracoes pendentes em: {0}" -f $State.FileName)
        }
      }.GetNewClosure())
    }
  }
}

function Get-CurrentTabState {
  if (-not $script:tabControl -or -not $script:tabControl.SelectedTab) {
    return $null
  }

  return $script:tabControl.SelectedTab.Tag
}

function Save-CurrentTab {
  $state = Get-CurrentTabState
  if ($state -and $state.SaveAction) {
    return & $state.SaveAction
  }

  return $true
}

function Reload-CurrentTab {
  $state = Get-CurrentTabState
  if ($state -and $state.ReloadAction) {
    & $state.ReloadAction
  }
}

function Save-AllDirtyTabs {
  foreach ($state in $script:tabStates) {
    if (-not $state.Dirty) {
      continue
    }

    if ($state.SaveAction) {
      $saved = & $state.SaveAction
      if (-not $saved) {
        return $false
      }
    }
  }

  return $true
}

function Confirm-CloseEditor {
  $dirtyTabs = @($script:tabStates | Where-Object { $_.Dirty })
  if ($dirtyTabs.Count -eq 0) {
    return $true
  }

  $result = [System.Windows.Forms.MessageBox]::Show(
    "Existem alteracoes nao salvas. Deseja salvar tudo antes de fechar?",
    "Fechar editor",
    [System.Windows.Forms.MessageBoxButtons]::YesNoCancel,
    [System.Windows.Forms.MessageBoxIcon]::Question
  )

  if ($result -eq [System.Windows.Forms.DialogResult]::Cancel) {
    return $false
  }

  if ($result -eq [System.Windows.Forms.DialogResult]::Yes) {
    return Save-AllDirtyTabs
  }

  return $true
}

function Load-SystemConfigModel {
  $path = ConvertTo-EditorPath -FileName "01-sistema-config.js"
  $content = Read-EditorFile -Path $path
  $googleBlock = Get-FrozenBlock -Text $content -BlockName "googleAppsScript"
  $kitBlock = Get-FrozenBlock -Text $content -BlockName "kitWithdrawal"
  $rpBlock = Get-FrozenBlock -Text $content -BlockName "momentoRp"
  $rankingBlock = Get-FrozenBlock -Text $content -BlockName "rankingPerformance"
  $collectiveBlock = Get-FrozenBlock -Text $content -BlockName "collectiveTraining"

  return [PSCustomObject]@{
    GoogleAppsScriptUrl = Get-RegexString -Text $googleBlock -Pattern 'url:\s*"((?:\\.|[^"\\])*)"' -Default ""
    KitGoogleSheetsOnlyMode = Get-RegexBool -Text $kitBlock -Pattern 'googleSheetsOnlyMode:\s*(true|false)' -Default $true
    MomentoRpGoogleSheetsOnlyMode = Get-RegexBool -Text $rpBlock -Pattern 'googleSheetsOnlyMode:\s*(true|false)' -Default $true
    MomentoRpResource = Get-RegexString -Text $rpBlock -Pattern 'resource:\s*"((?:\\.|[^"\\])*)"' -Default "rp"
    MomentoRpListAction = Get-RegexString -Text $rpBlock -Pattern 'listAction:\s*"((?:\\.|[^"\\])*)"' -Default "rp-list"
    RankingListAction = Get-RegexString -Text $rankingBlock -Pattern 'listAction:\s*"((?:\\.|[^"\\])*)"' -Default "rp-list"
    CollectiveGoogleSheetsOnlyMode = Get-RegexBool -Text $collectiveBlock -Pattern 'googleSheetsOnlyMode:\s*(true|false)' -Default $true
    CollectiveListAction = Get-RegexString -Text $collectiveBlock -Pattern 'listAction:\s*"((?:\\.|[^"\\])*)"' -Default "collective-training-list"
    CollectiveResource = Get-RegexString -Text $collectiveBlock -Pattern 'resource:\s*"((?:\\.|[^"\\])*)"' -Default "collectiveTraining"
  }
}

function ConvertTo-SystemConfigContent {
  param(
    [Parameter(Mandatory = $true)]
    $Model
  )

  return @"
window.VIDA_CORRIDA_SYSTEM_CONFIG = Object.freeze({
  googleAppsScript: Object.freeze({
    // Cole aqui a URL publicada do Apps Script principal.
    // Formato esperado: https://script.google.com/macros/s/.../exec
    url: "$(Escape-JsString -Value $Model.GoogleAppsScriptUrl)"
  }),

  kitWithdrawal: Object.freeze({
    // true = mostra somente os dados online da planilha
    // false = permite funcionamento local no navegador
    googleSheetsOnlyMode: $(ConvertTo-BoolLiteral -Value $Model.KitGoogleSheetsOnlyMode)
  }),

  momentoRp: Object.freeze({
    // true = mostra somente os registros online da planilha
    // false = permite funcionamento local no navegador
    googleSheetsOnlyMode: $(ConvertTo-BoolLiteral -Value $Model.MomentoRpGoogleSheetsOnlyMode),
    resource: "$(Escape-JsString -Value $Model.MomentoRpResource)",
    listAction: "$(Escape-JsString -Value $Model.MomentoRpListAction)"
  }),

  rankingPerformance: Object.freeze({
    listAction: "$(Escape-JsString -Value $Model.RankingListAction)"
  }),

  collectiveTraining: Object.freeze({
    // true = usa somente a lista online da planilha
    // false = permite funcionamento local no navegador
    googleSheetsOnlyMode: $(ConvertTo-BoolLiteral -Value $Model.CollectiveGoogleSheetsOnlyMode),
    listAction: "$(Escape-JsString -Value $Model.CollectiveListAction)",
    resource: "$(Escape-JsString -Value $Model.CollectiveResource)"
  })
});
"@
}

function Load-AccessConfigModel {
  $path = ConvertTo-EditorPath -FileName "02-acesso-site.js"
  $content = Read-EditorFile -Path $path
  $block = Get-FrozenBlock -Text $content -BlockName "kitWithdrawal"

  return [PSCustomObject]@{
    Locked = Get-RegexBool -Text $block -Pattern 'locked:\s*(true|false)' -Default $false
    SubmitLocked = Get-RegexBool -Text $block -Pattern 'submitLocked:\s*(true|false)' -Default $true
    EventName = Get-RegexString -Text $block -Pattern 'eventName:\s*"((?:\\.|[^"\\])*)"' -Default "PRIME HAUS RUNNING"
    HomeNotice = Get-RegexString -Text $block -Pattern 'homeNotice:\s*"((?:\\.|[^"\\])*)"' -Default ""
    HomeLinkText = Get-RegexString -Text $block -Pattern 'homeLinkText:\s*"((?:\\.|[^"\\])*)"' -Default ""
    PageTitle = Get-RegexString -Text $block -Pattern 'pageTitle:\s*"((?:\\.|[^"\\])*)"' -Default ""
    PageMessage = Get-RegexString -Text $block -Pattern 'pageMessage:\s*"((?:\\.|[^"\\])*)"' -Default ""
    PageSupport = Get-RegexString -Text $block -Pattern 'pageSupport:\s*"((?:\\.|[^"\\])*)"' -Default ""
    PickupTip = Get-RegexString -Text $block -Pattern 'pickupTip:\s*"((?:\\.|[^"\\])*)"' -Default "Celebre sua conquista ao final."
    SubmitButtonText = Get-RegexString -Text $block -Pattern 'submitButtonText:\s*"((?:\\.|[^"\\])*)"' -Default ""
    SubmitMessage = Get-RegexString -Text $block -Pattern 'submitMessage:\s*"((?:\\.|[^"\\])*)"' -Default ""
  }
}

function ConvertTo-AccessConfigContent {
  param(
    [Parameter(Mandatory = $true)]
    $Model
  )

  return @"
// Arquivo editavel pelo administrador do site.
// Use este arquivo para trancar ou liberar areas sem mexer na logica.
window.SITE_ACCESS_CONFIG = Object.freeze({
  kitWithdrawal: Object.freeze({
    // Para trancar a area: true
    // Para reabrir a area: false
    locked: $(ConvertTo-BoolLiteral -Value $Model.Locked),

    // Para deixar a pagina aberta e bloquear apenas o envio: true
    // Para liberar o envio novamente: false
    submitLocked: $(ConvertTo-BoolLiteral -Value $Model.SubmitLocked),

    eventName: "$(Escape-JsString -Value $Model.EventName)",
    homeNotice: "$(Escape-JsString -Value $Model.HomeNotice)",
    homeLinkText: "$(Escape-JsString -Value $Model.HomeLinkText)",
    pageTitle: "$(Escape-JsString -Value $Model.PageTitle)",
    pageMessage: "$(Escape-JsString -Value $Model.PageMessage)",
    pageSupport: "$(Escape-JsString -Value $Model.PageSupport)",
    pickupTip: "$(Escape-JsString -Value $Model.PickupTip)",
    submitButtonText: "$(Escape-JsString -Value $Model.SubmitButtonText)",
    submitMessage: "$(Escape-JsString -Value $Model.SubmitMessage)"
  })
});
"@
}

function Load-CollectiveConfigModel {
  $path = ConvertTo-EditorPath -FileName "03-treino-coletivo-config.js"
  $content = Read-EditorFile -Path $path

  return [PSCustomObject]@{
    Enabled = Get-RegexBool -Text $content -Pattern 'enabled:\s*(true|false)' -Default $false
    SessionId = Get-RegexString -Text $content -Pattern 'id:\s*"((?:\\.|[^"\\])*)"' -Default ""
    Title = Get-RegexString -Text $content -Pattern 'title:\s*"((?:\\.|[^"\\])*)"' -Default ""
    Description = Get-RegexString -Text $content -Pattern 'description:\s*"((?:\\.|[^"\\])*)"' -Default ""
    StartsAt = ConvertTo-DateTimeValue -Value (Get-RegexString -Text $content -Pattern 'startsAtIso:\s*"((?:\\.|[^"\\])*)"' -Default "")
    DecisionDeadline = ConvertTo-DateTimeValue -Value (Get-RegexString -Text $content -Pattern 'decisionDeadlineIso:\s*"((?:\\.|[^"\\])*)"' -Default "")
    Location = Get-RegexString -Text $content -Pattern 'location:\s*"((?:\\.|[^"\\])*)"' -Default ""
    MinimumParticipants = Get-RegexInt -Text $content -Pattern 'minimumParticipants:\s*([0-9]+)' -Default 5
    ManualCancellation = (Get-RegexString -Text $content -Pattern 'statusMode:\s*"((?:\\.|[^"\\])*)"' -Default "automatic") -eq "cancelled"
    CancellationReason = Get-RegexString -Text $content -Pattern 'statusReason:\s*"((?:\\.|[^"\\])*)"' -Default ""
  }
}

function ConvertTo-CollectiveConfigContent {
  param(
    [Parameter(Mandatory = $true)]
    $Model
  )

  return @"
// Arquivo editavel pelo administrador do site.
// Use este arquivo para abrir, fechar e configurar o treino coletivo atual.
const collectiveSystemConfig = window.VIDA_CORRIDA_SYSTEM_CONFIG || {};
const collectiveSharedGoogleScriptUrl = String(
  ((collectiveSystemConfig.googleAppsScript || {}).url) ||
  "https://script.google.com/macros/s/AKfycbwLuQlpLIMw2j0s4sc0Ytjwt3WAQEjqfM4Avgrwtr8baNuh1nXZLphqFbiz18BCMhHR/exec"
).trim();
const collectiveSharedConfig = collectiveSystemConfig.collectiveTraining || {};

window.COLLECTIVE_TRAINING_CONFIG = {
  // Coloque true para exibir o card na home e liberar a pagina do treino coletivo.
  // Coloque false quando nao houver treino aberto.
  enabled: $(ConvertTo-BoolLiteral -Value $Model.Enabled),

  // A URL principal do Apps Script fica em 01-sistema-config.js.
  googleScriptUrl: collectiveSharedGoogleScriptUrl,

  // Mantenha true para a lista mostrar apenas o que estiver salvo online na planilha.
  // Troque para false apenas se quiser permitir funcionamento local no navegador.
  googleSheetsOnlyMode: collectiveSharedConfig.googleSheetsOnlyMode !== false,

  // Nao precisa alterar estas duas linhas, a menos que o backend do Apps Script mude.
  listAction: String(collectiveSharedConfig.listAction || "collective-training-list").trim(),
  resource: String(collectiveSharedConfig.resource || "collectiveTraining").trim(),
  session: {
    // Atualize os campos abaixo sempre que abrir uma nova lista de presenca.

    // Identificador unico da sessao.
    // Sugestao de formato: treino-coletivo-AAAA-MM-DD-HHMM
    id: "$(Escape-JsString -Value $Model.SessionId)",

    // Titulo exibido na pagina e usado no resumo enviado ao Telegram.
    title: "$(Escape-JsString -Value $Model.Title)",

    // Texto curto de apoio exibido abaixo do titulo da pagina.
    description: "$(Escape-JsString -Value $Model.Description)",

    // Data e horario do treino no formato ISO com fuso.
    // Exemplo: 2026-04-22T18:30:00-03:00
    startsAtIso: "$(ConvertTo-IsoWithProjectOffset -Value $Model.StartsAt)",

    // Prazo final para decidir se o treino vai acontecer.
    // Se nao atingir o minimo ate este horario, a pagina mostra treino cancelado.
    decisionDeadlineIso: "$(ConvertTo-IsoWithProjectOffset -Value $Model.DecisionDeadline)",

    // Local que aparecera na pagina e na mensagem do Telegram.
    location: "$(Escape-JsString -Value $Model.Location)",

    // Quantidade minima de confirmacoes para o treino ser considerado confirmado.
    minimumParticipants: $($Model.MinimumParticipants),

    // Deixe automatic para usar a regra normal do minimo de atletas.
    // Troque para cancelled quando precisar cancelar manualmente por clima ou outro motivo.
    statusMode: "$(if ($Model.ManualCancellation) { 'cancelled' } else { 'automatic' })",

    // Motivo opcional para aparecer no site e no Telegram quando statusMode estiver como cancelled.
    statusReason: "$(Escape-JsString -Value $(if ($Model.ManualCancellation) { $Model.CancellationReason } else { '' }))"
  }
};
"@
}

function Load-ConsultaConfigModel {
  $path = ConvertTo-EditorPath -FileName "04-planilhas-consulta.js"
  $content = Read-EditorFile -Path $path
  $tabsBlock = Get-FrozenBlock -Text $content -BlockName "sharedTabs"

  return [PSCustomObject]@{
    SharedSheetUrl = Get-RegexString -Text $content -Pattern 'sharedSheetUrl:\s*"((?:\\.|[^"\\])*)"' -Default ""
    HighlightsTab = Get-RegexString -Text $tabsBlock -Pattern 'highlights:\s*"((?:\\.|[^"\\])*)"' -Default "Destaques"
    RankingTab = Get-RegexString -Text $tabsBlock -Pattern 'ranking:\s*"((?:\\.|[^"\\])*)"' -Default "Ranking"
    FidelityTab = Get-RegexString -Text $tabsBlock -Pattern 'fidelity:\s*"((?:\\.|[^"\\])*)"' -Default "Fidelizacao"
    ReferralTab = Get-RegexString -Text $tabsBlock -Pattern 'referral:\s*"((?:\\.|[^"\\])*)"' -Default "Indicacao"
  }
}

function ConvertTo-ConsultaConfigContent {
  param(
    [Parameter(Mandatory = $true)]
    $Model
  )

  return @"
// Arquivo editavel pelo administrador do site.
// Use este arquivo para informar a planilha principal das paginas de consulta.
window.CONSULTA_SHEETS_CONFIG = Object.freeze({
  // Cole aqui o link da planilha unica usada pelas paginas de consulta.
  sharedSheetUrl: "$(Escape-JsString -Value $Model.SharedSheetUrl)",

  // Nomes das abas dentro da planilha unica de consultas.
  // A retirada de kits continua separada no 01-sistema-config.js e no Apps Script principal.
  sharedTabs: Object.freeze({
    highlights: "$(Escape-JsString -Value $Model.HighlightsTab)",
    ranking: "$(Escape-JsString -Value $Model.RankingTab)",
    fidelity: "$(Escape-JsString -Value $Model.FidelityTab)",
    referral: "$(Escape-JsString -Value $Model.ReferralTab)"
  })
});

window.getConsultaSheetSource = function getConsultaSheetSource(key) {
  const config = window.CONSULTA_SHEETS_CONFIG || {};
  const sharedSheetUrl = String(config.sharedSheetUrl || "").trim();
  const sharedTabs = config.sharedTabs || {};
  const sharedTabName = String(sharedTabs[key] || "").trim();

  return {
    url: sharedSheetUrl,
    sheetName: sharedTabName,
    mode: "shared"
  };
};

window.buildGoogleSheetCsvUrl = function buildGoogleSheetCsvUrl(sheetUrl, sheetName) {
  const safeUrl = String(sheetUrl || "").trim();
  const safeSheetName = String(sheetName || "").trim();

  if (!safeUrl) {
    return "";
  }

  if (/export\?format=csv/i.test(safeUrl) || /tqx=out:csv/i.test(safeUrl)) {
    return safeUrl;
  }

  const match = safeUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (!match) {
    return safeUrl;
  }

  const sheetId = match[1];

  if (safeSheetName) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(safeSheetName)}`;
  }

  const gidMatch = safeUrl.match(/[?&#]gid=([0-9]+)/i);
  const gid = gidMatch ? gidMatch[1] : "0";

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
};
"@
}

function Load-CalendarEntriesModel {
  $path = ConvertTo-EditorPath -FileName "05-calendario-provas.js"
  $content = Read-EditorFile -Path $path
  $match = [regex]::Match($content, 'window\.RACE_CALENDAR_ENTRIES\s*=\s*(\[[\s\S]*\])\s*;', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  $entries = @()

  if ($match.Success) {
    $rawEntries = ConvertFrom-RelaxedJson -JsonText $match.Groups[1].Value
    foreach ($entry in @($rawEntries)) {
      $stableId = Get-CalendarStableId -Entry $entry
      $entries += [PSCustomObject]@{
        id = $stableId
        title = [string]$entry.title
        date = [string]$entry.date
        endDate = [string]$entry.endDate
        time = [string]$entry.time
        location = [string]$entry.location
        distances = @($entry.distances | ForEach-Object { [string]$_ })
        circuito = [string]$entry.circuito
        signupUrl = [string]$entry.signupUrl
        signupLabel = [string]$entry.signupLabel
        notes = [string]$entry.notes
        legacyIds = Normalize-CalendarLegacyIds -Ids @($entry.legacyIds | ForEach-Object { [string]$_ }) -CurrentId $stableId
      }
    }
  }

  return [PSCustomObject]@{
    Entries = ConvertTo-ArrayList -Items (Sort-CalendarEntries -Entries $entries)
  }
}

function ConvertTo-CalendarContent {
  param(
    [Parameter(Mandatory = $true)]
    $Model
  )

  $items = @()
  foreach ($entry in $Model.Entries) {
    $stableId = Get-CalendarStableId -Entry $entry
    $legacyIds = Normalize-CalendarLegacyIds -Ids @($entry.legacyIds) -CurrentId $stableId
    $item = [ordered]@{
      id = [string]$stableId
      title = [string]$entry.title
      date = [string]$entry.date
    }

    if (-not [string]::IsNullOrWhiteSpace([string]$entry.endDate)) {
      $item.endDate = [string]$entry.endDate
    }

    $item.time = [string]$entry.time
    $item.location = [string]$entry.location
    $item.distances = @($entry.distances | ForEach-Object { [string]$_ })
    $item.circuito = [string]$entry.circuito
    $item.signupUrl = [string]$entry.signupUrl
    $item.signupLabel = [string]$entry.signupLabel
    $item.notes = [string]$entry.notes

    if ($legacyIds.Count -gt 0) {
      $item.legacyIds = @($legacyIds)
    }

    $items += $item
  }

  $json = ConvertTo-Json -InputObject @($items) -Depth 6

  return @"
// Arquivo editavel pelo administrador do site.
// Use este arquivo para cadastrar, alterar ou remover provas do calendario.
window.RACE_CALENDAR_ENTRIES = $json;
"@
}

function Load-AthleteNamesModel {
  $path = ConvertTo-EditorPath -FileName "06-lista-atletas.js"
  $content = Read-EditorFile -Path $path
  $matches = [regex]::Matches($content, '"((?:\\.|[^"\\])*)"', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  $names = @()

  foreach ($match in $matches) {
    $names += Unescape-JsString -Value $match.Groups[1].Value
  }

  return [PSCustomObject]@{
    Names = ConvertTo-ArrayList -Items (Sort-AthleteNames -Names $names)
  }
}

function ConvertTo-AthleteNamesContent {
  param(
    [Parameter(Mandatory = $true)]
    $Model
  )

  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("// Arquivo editavel pelo administrador do site.")
  $lines.Add("// Use este arquivo para manter a lista de nomes sugeridos nos formularios.")
  $lines.Add("window.KIT_ATHLETE_NAMES = [")

  foreach ($name in Sort-AthleteNames -Names @($Model.Names)) {
    $lines.Add(('  "{0}",' -f (Escape-JsString -Value $name)))
  }

  $lines.Add("];")
  return ($lines -join "`r`n")
}

function Load-AvatarEntriesModel {
  $path = ConvertTo-EditorPath -FileName "07-avatares.js"
  $content = Read-EditorFile -Path $path
  $match = [regex]::Match($content, 'window\.VIDA_CORRIDA_AVATAR_DATA\s*=\s*(\{[\s\S]*\})\s*;', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  $entries = @()

  if ($match.Success) {
    $avatarData = ConvertFrom-RelaxedJson -JsonText $match.Groups[1].Value
    foreach ($property in @($avatarData.byId.PSObject.Properties)) {
      $entries += [PSCustomObject]@{
        LookupType = "ID"
        Identifier = [string]$property.Name
        FileName = [string]$property.Value
      }
    }

    foreach ($property in @($avatarData.byEmail.PSObject.Properties)) {
      $entries += [PSCustomObject]@{
        LookupType = "E-mail"
        Identifier = [string]$property.Name
        FileName = [string]$property.Value
      }
    }

    foreach ($property in @($avatarData.byName.PSObject.Properties)) {
      $entries += [PSCustomObject]@{
        LookupType = "Nome"
        Identifier = [string]$property.Name
        FileName = [string]$property.Value
      }
    }
  }

  return [PSCustomObject]@{
    Entries = ConvertTo-ArrayList -Items (Sort-AvatarEntries -Entries $entries)
  }
}

function ConvertTo-AvatarEntriesContent {
  param(
    [Parameter(Mandatory = $true)]
    $Model
  )

  $byId = [ordered]@{}
  $byEmail = [ordered]@{}
  $byName = [ordered]@{}

  foreach ($entry in Sort-AvatarEntries -Entries @($Model.Entries)) {
    switch ($entry.LookupType) {
      "ID" { $byId[[string]$entry.Identifier] = [string]$entry.FileName }
      "E-mail" { $byEmail[[string]$entry.Identifier] = [string]$entry.FileName }
      default { $byName[[string]$entry.Identifier] = [string]$entry.FileName }
    }
  }

  $json = ConvertTo-Json -InputObject ([ordered]@{
      byId = $byId
      byEmail = $byEmail
      byName = $byName
    }) -Depth 6

  return @"
// Arquivo editavel pelo administrador do site.
// Use este arquivo para relacionar nomes, ids ou e-mails com as fotos dos atletas.
window.VIDA_CORRIDA_AVATAR_DATA = $json;
"@
}

function Get-PublicationReferencePattern {
  return '(?<prefix>(?:src|href)\s*=\s*["''])(?<asset>(?!https?:\/\/|\/\/|mailto:|#)[^"''?#>]+\.(?:js|css))(?:\?v=(?<token>[^"''#>]+))?(?<suffix>["''])'
}

function Get-PublicationManagedHtmlFiles {
  return @(
    Get-ChildItem -LiteralPath $script:projectDir -Filter *.html -File |
      Sort-Object Name
  )
}

function Get-PublicationReferenceScan {
  $pattern = Get-PublicationReferencePattern
  $references = New-Object System.Collections.Generic.List[object]

  foreach ($file in Get-PublicationManagedHtmlFiles) {
    $content = Read-EditorFile -Path $file.FullName
    foreach ($match in [regex]::Matches($content, $pattern)) {
      $references.Add([PSCustomObject]@{
          HtmlFile = $file.Name
          HtmlPath = $file.FullName
          Asset = [string]$match.Groups["asset"].Value
          Token = [string]$match.Groups["token"].Value
        }) | Out-Null
    }
  }

  return $references.ToArray()
}

function Get-PublicationSuggestedToken {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$References
  )

  $tokenGroups = @(
    $References |
      ForEach-Object { [string]$_.Token } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      Group-Object |
      Sort-Object -Property @(
        @{ Expression = "Count"; Descending = $true },
        @{ Expression = "Name"; Descending = $false }
      )
  )

  if ($tokenGroups.Count -gt 0) {
    return [string]$tokenGroups[0].Name
  }

  return Get-Date -Format "yyyyMMdd-HHmmss"
}

function Format-PublicationSummary {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$References
  )

  if ($References.Count -eq 0) {
    return @(
      "Nenhuma referencia local de CSS ou JS foi encontrada nas paginas HTML da raiz do projeto.",
      "",
      "Quando houver links locais com src/href, esta aba passa a atualizar o token automaticamente."
    ) -join "`r`n"
  }

  $fileLines = @(
    $References |
      Group-Object HtmlFile |
      Sort-Object Name |
      ForEach-Object { "- {0}: {1} referencia(s)" -f $_.Name, $_.Count }
  )

  $assetLines = @(
    $References |
      Group-Object Asset |
      Sort-Object Name |
      ForEach-Object { "- {0}" -f $_.Name }
  )

  $tokenLines = @(
    $References |
      ForEach-Object { [string]$_.Token } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      Group-Object |
      Sort-Object Name |
      ForEach-Object { "- {0}: {1} referencia(s)" -f $_.Name, $_.Count }
  )

  if ($tokenLines.Count -eq 0) {
    $tokenLines = @("- Nenhum token aplicado ainda.")
  }

  return (@(
      "Ao salvar esta aba, o editor atualiza automaticamente todas as referencias locais de CSS e JS nas paginas HTML do site.",
      "",
      "Paginas controladas:"
    ) + $fileLines + @(
      "",
      "Arquivos locais controlados:"
    ) + $assetLines + @(
      "",
      "Tokens encontrados agora:"
    ) + $tokenLines) -join "`r`n"
}

function Test-PublicationToken {
  param(
    [AllowNull()]
    [string]$Token
  )

  $safeToken = [string]$Token
  if ([string]::IsNullOrWhiteSpace($safeToken)) {
    return $false
  }

  return $safeToken -match '^[A-Za-z0-9._-]+$'
}

function Apply-PublicationTokenToHtmlFiles {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Token
  )

  $pattern = Get-PublicationReferencePattern
  $changedFiles = New-Object System.Collections.Generic.List[string]
  $matchedFiles = New-Object System.Collections.Generic.List[string]
  $totalReferences = 0

  foreach ($file in Get-PublicationManagedHtmlFiles) {
    $content = Read-EditorFile -Path $file.FullName
    $matches = [regex]::Matches($content, $pattern)

    if ($matches.Count -eq 0) {
      continue
    }

    $matchedFiles.Add($file.Name) | Out-Null
    $totalReferences += $matches.Count

    $updatedContent = [regex]::Replace($content, $pattern, {
        param($match)

        return "{0}{1}?v={2}{3}" -f `
          $match.Groups["prefix"].Value, `
          $match.Groups["asset"].Value, `
          $Token, `
          $match.Groups["suffix"].Value
      })

    if ($updatedContent -ne $content) {
      Write-EditorFile -Path $file.FullName -Content $updatedContent
      $changedFiles.Add($file.Name) | Out-Null
    }
  }

  return [PSCustomObject]@{
    MatchedFiles = $matchedFiles.ToArray()
    ChangedFiles = $changedFiles.ToArray()
    ReferenceCount = $totalReferences
  }
}

function Load-PublicationVersionModel {
  $path = ConvertTo-EditorPath -FileName "08-versao-publicacao.json"
  $content = Read-EditorFile -Path $path
  $references = Get-PublicationReferenceScan
  $storedToken = ""

  if (-not [string]::IsNullOrWhiteSpace($content)) {
    try {
      $parsed = ConvertFrom-Json -InputObject $content
      $storedToken = [string]$parsed.token
    } catch {
      $storedToken = [string]$content.Trim()
    }
  }

  if ([string]::IsNullOrWhiteSpace($storedToken)) {
    $storedToken = Get-PublicationSuggestedToken -References $references
  }

  return [PSCustomObject]@{
    Token = $storedToken
  }
}

function ConvertTo-PublicationVersionContent {
  param(
    [Parameter(Mandatory = $true)]
    $Model
  )

  return ConvertTo-Json -InputObject ([ordered]@{
      token = [string]$Model.Token
    }) -Depth 3
}

function Format-CalendarListItem {
  param(
    [Parameter(Mandatory = $true)]
    $Entry
  )

  $timePart = if ([string]::IsNullOrWhiteSpace([string]$Entry.time)) { "sem horario" } else { [string]$Entry.time }
  $datePart = [string]$Entry.date
  if (-not [string]::IsNullOrWhiteSpace([string]$Entry.endDate)) {
    $datePart = "{0} a {1}" -f $Entry.date, $Entry.endDate
  }

  return "{0} {1} - {2}" -f $datePart, $timePart, $Entry.title
}

function Format-AvatarListItem {
  param(
    [Parameter(Mandatory = $true)]
    $Entry
  )

  return "[{0}] {1} -> {2}" -f $Entry.LookupType, $Entry.Identifier, $Entry.FileName
}

function Resolve-AvatarTargetFileName {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RequestedFileName,

    [string]$SelectedSourcePath = ""
  )

  $fileName = [System.IO.Path]::GetFileName($RequestedFileName.Trim())
  if ([string]::IsNullOrWhiteSpace($fileName)) {
    throw "Informe o nome do arquivo do avatar."
  }

  if ($fileName -ne $RequestedFileName.Trim()) {
    throw "Informe somente o nome do arquivo, sem pasta."
  }

  if ([string]::IsNullOrWhiteSpace($SelectedSourcePath)) {
    return $fileName
  }

  Ensure-Directory -Path $script:avatarsDir
  $targetPath = Join-Path $script:avatarsDir $fileName
  $sourcePath = $SelectedSourcePath

  if ((Test-Path -LiteralPath $targetPath) -and ((Resolve-Path -LiteralPath $sourcePath).Path -ne (Resolve-Path -LiteralPath $targetPath).Path)) {
    $result = [System.Windows.Forms.MessageBox]::Show(
      "Ja existe um arquivo com esse nome em assets/avatars. Deseja substituir?",
      "Substituir imagem",
      [System.Windows.Forms.MessageBoxButtons]::YesNo,
      [System.Windows.Forms.MessageBoxIcon]::Question
    )

    if ($result -ne [System.Windows.Forms.DialogResult]::Yes) {
      throw "Copiar avatar cancelado."
    }
  }

  Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
  return $fileName
}

function New-SectionGroup {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Title,

    [int]$Left,
    [int]$Top,
    [int]$Width,
    [int]$Height
  )

  $group = New-Object System.Windows.Forms.GroupBox
  $group.Text = $Title
  $group.Left = $Left
  $group.Top = $Top
  $group.Width = $Width
  $group.Height = $Height
  return $group
}

function Add-LabeledTextBox {
  param(
    [Parameter(Mandatory = $true)]
    [System.Windows.Forms.Control]$Parent,

    [Parameter(Mandatory = $true)]
    [string]$Label,

    [Parameter(Mandatory = $true)]
    [int]$Left,

    [Parameter(Mandatory = $true)]
    [int]$Top,

    [Parameter(Mandatory = $true)]
    [int]$Width,

    [int]$Height = 24,

    [switch]$Multiline,

    [string]$HelpText = ""
  )

  $labelControl = New-Object System.Windows.Forms.Label
  $labelControl.Left = $Left
  $labelControl.Top = $Top
  $labelControl.Width = $Width
  $labelControl.Text = $Label

  $textBox = New-Object System.Windows.Forms.TextBox
  $textBox.Left = $Left
  $textBox.Top = $Top + 20
  $textBox.Width = $Width
  $textBox.Height = $Height
  $textBox.Multiline = $Multiline.IsPresent
  if ($Multiline) {
    $textBox.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
  }

  $Parent.Controls.Add($labelControl)
  $Parent.Controls.Add($textBox)

  if (-not [string]::IsNullOrWhiteSpace($HelpText)) {
    $help = New-Object System.Windows.Forms.Label
    $help.Left = $Left
    $help.Top = $textBox.Bottom + 4
    $help.Width = $Width
    $help.Height = 30
    $help.ForeColor = [System.Drawing.Color]::FromArgb(96, 96, 96)
    $help.Text = $HelpText
    $Parent.Controls.Add($help)
  }

  return $textBox
}

function Add-LabeledCheckBox {
  param(
    [Parameter(Mandatory = $true)]
    [System.Windows.Forms.Control]$Parent,

    [Parameter(Mandatory = $true)]
    [string]$Text,

    [Parameter(Mandatory = $true)]
    [int]$Left,

    [Parameter(Mandatory = $true)]
    [int]$Top,

    [int]$Width = 420
  )

  $checkbox = New-Object System.Windows.Forms.CheckBox
  $checkbox.Left = $Left
  $checkbox.Top = $Top
  $checkbox.Width = $Width
  $checkbox.Text = $Text
  $Parent.Controls.Add($checkbox)
  return $checkbox
}

function Add-LabeledDateTimePicker {
  param(
    [Parameter(Mandatory = $true)]
    [System.Windows.Forms.Control]$Parent,

    [Parameter(Mandatory = $true)]
    [string]$Label,

    [Parameter(Mandatory = $true)]
    [int]$Left,

    [Parameter(Mandatory = $true)]
    [int]$Top,

    [int]$Width = 220
  )

  $labelControl = New-Object System.Windows.Forms.Label
  $labelControl.Left = $Left
  $labelControl.Top = $Top
  $labelControl.Width = $Width
  $labelControl.Text = $Label

  $picker = New-Object System.Windows.Forms.DateTimePicker
  $picker.Left = $Left
  $picker.Top = $Top + 20
  $picker.Width = $Width
  $picker.Format = [System.Windows.Forms.DateTimePickerFormat]::Custom
  $picker.CustomFormat = "dd/MM/yyyy HH:mm"
  $picker.ShowUpDown = $true

  $Parent.Controls.Add($labelControl)
  $Parent.Controls.Add($picker)
  return $picker
}

function Add-LabeledNumericUpDown {
  param(
    [Parameter(Mandatory = $true)]
    [System.Windows.Forms.Control]$Parent,

    [Parameter(Mandatory = $true)]
    [string]$Label,

    [Parameter(Mandatory = $true)]
    [int]$Left,

    [Parameter(Mandatory = $true)]
    [int]$Top,

    [int]$Width = 120,

    [int]$Minimum = 1,

    [int]$Maximum = 100
  )

  $labelControl = New-Object System.Windows.Forms.Label
  $labelControl.Left = $Left
  $labelControl.Top = $Top
  $labelControl.Width = $Width
  $labelControl.Text = $Label

  $numeric = New-Object System.Windows.Forms.NumericUpDown
  $numeric.Left = $Left
  $numeric.Top = $Top + 20
  $numeric.Width = $Width
  $numeric.Minimum = $Minimum
  $numeric.Maximum = $Maximum

  $Parent.Controls.Add($labelControl)
  $Parent.Controls.Add($numeric)
  return $numeric
}

function Add-TabFooterButtons {
  param(
    [Parameter(Mandatory = $true)]
    [System.Windows.Forms.Control]$Parent,

    [Parameter(Mandatory = $true)]
    [System.Windows.Forms.Button[]]$Buttons
  )

  $panel = New-Object System.Windows.Forms.FlowLayoutPanel
  $panel.Dock = [System.Windows.Forms.DockStyle]::Bottom
  $panel.Height = 46
  $panel.Padding = New-Object System.Windows.Forms.Padding(8, 6, 8, 6)
  $panel.WrapContents = $false

  foreach ($button in $Buttons) {
    $button.Height = 28
    $button.Width = if ($button.Width -gt 0) { $button.Width } else { 130 }
    $button.Margin = New-Object System.Windows.Forms.Padding(0, 0, 8, 0)
    $panel.Controls.Add($button)
  }

  $Parent.Controls.Add($panel)
  return $panel
}

function New-ActionButton {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Text,

    [int]$Width = 130
  )

  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.Width = $Width
  return $button
}

function Build-SystemTab {
  $tabPage = New-Object System.Windows.Forms.TabPage
  $state = New-TabState -BaseTitle "Sistema" -FileName "01-sistema-config.js" -TabPage $tabPage
  Set-TabDirty -State $state -Dirty $false
  $state.Model = Load-SystemConfigModel

  $panel = New-Object System.Windows.Forms.Panel
  $panel.Dock = [System.Windows.Forms.DockStyle]::Fill
  $panel.AutoScroll = $true
  $tabPage.Controls.Add($panel)

  $intro = New-Object System.Windows.Forms.Label
  $intro.Left = 12
  $intro.Top = 12
  $intro.Width = 1080
  $intro.Height = 36
  $intro.Text = "Central de sistema. Aqui ficam a URL principal do Apps Script e os modos online/local que alimentam outras areas do projeto."
  $panel.Controls.Add($intro)

  $group1 = New-SectionGroup -Title "Apps Script principal" -Left 12 -Top 52 -Width 1080 -Height 95
  $scriptUrlBox = Add-LabeledTextBox -Parent $group1 -Label "URL do Apps Script" -Left 16 -Top 24 -Width 1020 -HelpText "Troque aqui quando publicar uma nova URL do aplicativo da web."
  $panel.Controls.Add($group1)

  $group2 = New-SectionGroup -Title "Modos e acoes do sistema" -Left 12 -Top 160 -Width 1080 -Height 270
  $kitOnlyCheck = Add-LabeledCheckBox -Parent $group2 -Text "Retirada de Kits: usar somente dados online da planilha" -Left 16 -Top 28 -Width 460
  $rpOnlyCheck = Add-LabeledCheckBox -Parent $group2 -Text "Momento RP: usar somente dados online da planilha" -Left 16 -Top 58 -Width 460
  $collectiveOnlyCheck = Add-LabeledCheckBox -Parent $group2 -Text "Treino Coletivo: usar somente dados online da planilha" -Left 16 -Top 88 -Width 460

  $rpResourceBox = Add-LabeledTextBox -Parent $group2 -Label "Momento RP - resource" -Left 520 -Top 24 -Width 180
  $rpListActionBox = Add-LabeledTextBox -Parent $group2 -Label "Momento RP - listAction" -Left 720 -Top 24 -Width 220
  $rankingListActionBox = Add-LabeledTextBox -Parent $group2 -Label "Ranking Performance - listAction" -Left 520 -Top 96 -Width 220
  $collectiveListActionBox = Add-LabeledTextBox -Parent $group2 -Label "Treino Coletivo - listAction" -Left 520 -Top 168 -Width 220
  $collectiveResourceBox = Add-LabeledTextBox -Parent $group2 -Label "Treino Coletivo - resource" -Left 760 -Top 168 -Width 180
  $panel.Controls.Add($group2)

  $saveButton = New-ActionButton -Text "Salvar arquivo"
  $reloadButton = New-ActionButton -Text "Recarregar"
  Add-TabFooterButtons -Parent $tabPage -Buttons @($saveButton, $reloadButton) | Out-Null

  $loadControls = {
    $state.Loading = $true
    $state.Model = Load-SystemConfigModel
    $scriptUrlBox.Text = $state.Model.GoogleAppsScriptUrl
    $kitOnlyCheck.Checked = $state.Model.KitGoogleSheetsOnlyMode
    $rpOnlyCheck.Checked = $state.Model.MomentoRpGoogleSheetsOnlyMode
    $collectiveOnlyCheck.Checked = $state.Model.CollectiveGoogleSheetsOnlyMode
    $rpResourceBox.Text = $state.Model.MomentoRpResource
    $rpListActionBox.Text = $state.Model.MomentoRpListAction
    $rankingListActionBox.Text = $state.Model.RankingListAction
    $collectiveListActionBox.Text = $state.Model.CollectiveListAction
    $collectiveResourceBox.Text = $state.Model.CollectiveResource
    $state.Loading = $false
    Set-TabDirty -State $state -Dirty $false
    Set-EditorStatus -Message "Arquivo de sistema carregado."
  }.GetNewClosure()

  $state.SaveAction = {
    try {
      $state.Model.GoogleAppsScriptUrl = $scriptUrlBox.Text.Trim()
      $state.Model.KitGoogleSheetsOnlyMode = $kitOnlyCheck.Checked
      $state.Model.MomentoRpGoogleSheetsOnlyMode = $rpOnlyCheck.Checked
      $state.Model.CollectiveGoogleSheetsOnlyMode = $collectiveOnlyCheck.Checked
      $state.Model.MomentoRpResource = $rpResourceBox.Text.Trim()
      $state.Model.MomentoRpListAction = $rpListActionBox.Text.Trim()
      $state.Model.RankingListAction = $rankingListActionBox.Text.Trim()
      $state.Model.CollectiveListAction = $collectiveListActionBox.Text.Trim()
      $state.Model.CollectiveResource = $collectiveResourceBox.Text.Trim()

      Write-EditorFile -Path $state.Path -Content (ConvertTo-SystemConfigContent -Model $state.Model)
      Set-TabDirty -State $state -Dirty $false
      Set-EditorStatus -Message "Arquivo de sistema salvo."
      return $true
    } catch {
      [System.Windows.Forms.MessageBox]::Show(
        "Nao foi possivel salvar o arquivo de sistema.`n`n$($_.Exception.Message)",
        "Erro ao salvar",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
      ) | Out-Null
      return $false
    }
  }.GetNewClosure()

  $state.ReloadAction = {
    if ($state.Dirty) {
      $answer = [System.Windows.Forms.MessageBox]::Show(
        "Existem alteracoes nao salvas. Deseja recarregar mesmo assim?",
        "Recarregar arquivo",
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      )
      if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) {
        return
      }
    }
    & $loadControls
  }.GetNewClosure()

  Register-DirtyEvents -State $state -Controls @(
    $scriptUrlBox,
    $kitOnlyCheck,
    $rpOnlyCheck,
    $collectiveOnlyCheck,
    $rpResourceBox,
    $rpListActionBox,
    $rankingListActionBox,
    $collectiveListActionBox,
    $collectiveResourceBox
  )

  $saveButton.Add_Click({ [void](& $state.SaveAction) }.GetNewClosure())
  $reloadButton.Add_Click({ & $state.ReloadAction }.GetNewClosure())
  & $loadControls
  return $tabPage
}

function Build-PublicationTab {
  $tabPage = New-Object System.Windows.Forms.TabPage
  $state = New-TabState -BaseTitle "Publicacao" -FileName "08-versao-publicacao.json" -TabPage $tabPage
  Set-TabDirty -State $state -Dirty $false
  $state.Model = Load-PublicationVersionModel

  $panel = New-Object System.Windows.Forms.Panel
  $panel.Dock = [System.Windows.Forms.DockStyle]::Fill
  $panel.AutoScroll = $true
  $tabPage.Controls.Add($panel)

  $intro = New-Object System.Windows.Forms.Label
  $intro.Left = 12
  $intro.Top = 12
  $intro.Width = 1080
  $intro.Height = 44
  $intro.Text = "Use esta aba sempre que concluir mudancas de front-end e for publicar o site. Ao salvar, o token fica registrado em 08-versao-publicacao.json e todas as referencias locais de CSS e JS nas paginas HTML recebem a nova versao automaticamente."
  $panel.Controls.Add($intro)

  $group1 = New-SectionGroup -Title "Token de publicacao" -Left 12 -Top 64 -Width 1080 -Height 150
  $tokenBox = Add-LabeledTextBox -Parent $group1 -Label "Token unico usado nas paginas do site" -Left 16 -Top 28 -Width 260 -HelpText "Use apenas letras, numeros, ponto, underline ou hifen. Exemplo: 20260416-6"

  $generateButton = New-ActionButton -Text "Usar data e hora atual" -Width 170
  $generateButton.Left = 300
  $generateButton.Top = 48
  $group1.Controls.Add($generateButton)

  $tokenHelp = New-Object System.Windows.Forms.Label
  $tokenHelp.Left = 300
  $tokenHelp.Top = 84
  $tokenHelp.Width = 740
  $tokenHelp.Height = 52
  $tokenHelp.ForeColor = [System.Drawing.Color]::FromArgb(96, 96, 96)
  $tokenHelp.Text = "Fluxo recomendado: terminou as mudancas visuais ou nos scripts do site, clique em 'Usar data e hora atual' e depois em 'Salvar arquivo'. Se mexeu apenas na planilha ou no Apps Script, normalmente nao precisa trocar o token."
  $group1.Controls.Add($tokenHelp)
  $panel.Controls.Add($group1)

  $group2 = New-SectionGroup -Title "Paginas e arquivos atualizados automaticamente" -Left 12 -Top 228 -Width 1080 -Height 420
  $summaryBox = New-Object System.Windows.Forms.TextBox
  $summaryBox.Left = 16
  $summaryBox.Top = 28
  $summaryBox.Width = 1040
  $summaryBox.Height = 370
  $summaryBox.Multiline = $true
  $summaryBox.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
  $summaryBox.ReadOnly = $true
  $summaryBox.BackColor = [System.Drawing.Color]::White
  $group2.Controls.Add($summaryBox)
  $panel.Controls.Add($group2)

  $saveButton = New-ActionButton -Text "Salvar arquivo" -Width 150
  $reloadButton = New-ActionButton -Text "Recarregar" -Width 130
  Add-TabFooterButtons -Parent $tabPage -Buttons @($saveButton, $reloadButton) | Out-Null

  $refreshSummary = {
    $references = Get-PublicationReferenceScan
    $summaryBox.Text = Format-PublicationSummary -References $references
  }.GetNewClosure()

  $loadControls = {
    $state.Loading = $true
    $state.Model = Load-PublicationVersionModel
    $tokenBox.Text = $state.Model.Token
    & $refreshSummary
    $state.Loading = $false
    Set-TabDirty -State $state -Dirty $false
    Set-EditorStatus -Message "Arquivo de publicacao carregado."
  }.GetNewClosure()

  $state.SaveAction = {
    try {
      $nextToken = $tokenBox.Text.Trim()
      if (-not (Test-PublicationToken -Token $nextToken)) {
        [System.Windows.Forms.MessageBox]::Show(
          "Informe um token valido para publicacao.`n`nUse apenas letras, numeros, ponto, underline ou hifen.",
          "Token invalido",
          [System.Windows.Forms.MessageBoxButtons]::OK,
          [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        return $false
      }

      $state.Model.Token = $nextToken
      $applyResult = Apply-PublicationTokenToHtmlFiles -Token $nextToken
      Write-EditorFile -Path $state.Path -Content (ConvertTo-PublicationVersionContent -Model $state.Model)
      Set-TabDirty -State $state -Dirty $false
      & $refreshSummary

      if ($applyResult.ChangedFiles.Count -gt 0) {
        Set-EditorStatus -Message ("Token de publicacao salvo e aplicado em {0} pagina(s)." -f $applyResult.ChangedFiles.Count)
      } else {
        Set-EditorStatus -Message "Token de publicacao salvo. As paginas ja estavam com essa versao."
      }

      return $true
    } catch {
      [System.Windows.Forms.MessageBox]::Show(
        "Nao foi possivel salvar o token de publicacao.`n`n$($_.Exception.Message)",
        "Erro ao salvar",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
      ) | Out-Null
      return $false
    }
  }.GetNewClosure()

  $state.ReloadAction = {
    if ($state.Dirty) {
      $answer = [System.Windows.Forms.MessageBox]::Show(
        "Existem alteracoes nao salvas. Deseja recarregar mesmo assim?",
        "Recarregar arquivo",
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      )
      if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) {
        return
      }
    }
    & $loadControls
  }.GetNewClosure()

  Register-DirtyEvents -State $state -Controls @($tokenBox)

  $generateButton.Add_Click({
    $tokenBox.Text = Get-Date -Format "yyyyMMdd-HHmmss"
    Set-EditorStatus -Message "Novo token gerado. Salve a aba para aplicar nas paginas."
  }.GetNewClosure())
  $saveButton.Add_Click({ [void](& $state.SaveAction) }.GetNewClosure())
  $reloadButton.Add_Click({ & $state.ReloadAction }.GetNewClosure())
  & $loadControls
  return $tabPage
}

function Build-AccessTab {
  $tabPage = New-Object System.Windows.Forms.TabPage
  $state = New-TabState -BaseTitle "Acesso Site" -FileName "02-acesso-site.js" -TabPage $tabPage
  Set-TabDirty -State $state -Dirty $false
  $state.Model = Load-AccessConfigModel

  $panel = New-Object System.Windows.Forms.Panel
  $panel.Dock = [System.Windows.Forms.DockStyle]::Fill
  $panel.AutoScroll = $true
  $tabPage.Controls.Add($panel)

  $intro = New-Object System.Windows.Forms.Label
  $intro.Left = 12
  $intro.Top = 12
  $intro.Width = 1080
  $intro.Height = 36
  $intro.Text = "Controle rapido da retirada de kits. Use os campos abaixo para trancar a area ou apenas bloquear o envio."
  $panel.Controls.Add($intro)

  $group = New-SectionGroup -Title "Configuracao da retirada de kits" -Left 12 -Top 52 -Width 1080 -Height 430
  $lockedCheck = Add-LabeledCheckBox -Parent $group -Text "Trancar completamente a area de retirada de kits" -Left 16 -Top 28 -Width 420
  $submitLockedCheck = Add-LabeledCheckBox -Parent $group -Text "Manter a pagina aberta, mas bloquear o envio" -Left 16 -Top 58 -Width 420
  $homeNoticeBox = Add-LabeledTextBox -Parent $group -Label "Mensagem no card da home" -Left 16 -Top 96 -Width 500 -Multiline -Height 56
  $homeLinkBox = Add-LabeledTextBox -Parent $group -Label "Texto do link na home" -Left 540 -Top 96 -Width 250
  $pageTitleBox = Add-LabeledTextBox -Parent $group -Label "Titulo da pagina bloqueada" -Left 16 -Top 188 -Width 500
  $pageSupportBox = Add-LabeledTextBox -Parent $group -Label "Texto de apoio" -Left 540 -Top 188 -Width 500
  $pageMessageBox = Add-LabeledTextBox -Parent $group -Label "Mensagem principal da pagina" -Left 16 -Top 260 -Width 1024 -Multiline -Height 68
  $submitButtonBox = Add-LabeledTextBox -Parent $group -Label "Texto do botao bloqueado" -Left 16 -Top 348 -Width 240
  $submitMessageBox = Add-LabeledTextBox -Parent $group -Label "Mensagem ao bloquear envio" -Left 280 -Top 348 -Width 760
  $panel.Controls.Add($group)

  $saveButton = New-ActionButton -Text "Salvar arquivo"
  $reloadButton = New-ActionButton -Text "Recarregar"
  Add-TabFooterButtons -Parent $tabPage -Buttons @($saveButton, $reloadButton) | Out-Null

  $loadControls = {
    $state.Loading = $true
    $state.Model = Load-AccessConfigModel
    $lockedCheck.Checked = $state.Model.Locked
    $submitLockedCheck.Checked = $state.Model.SubmitLocked
    $homeNoticeBox.Text = $state.Model.HomeNotice
    $homeLinkBox.Text = $state.Model.HomeLinkText
    $pageTitleBox.Text = $state.Model.PageTitle
    $pageSupportBox.Text = $state.Model.PageSupport
    $pageMessageBox.Text = $state.Model.PageMessage
    $submitButtonBox.Text = $state.Model.SubmitButtonText
    $submitMessageBox.Text = $state.Model.SubmitMessage
    $state.Loading = $false
    Set-TabDirty -State $state -Dirty $false
    Set-EditorStatus -Message "Arquivo de acesso carregado."
  }.GetNewClosure()

  $state.SaveAction = {
    try {
      $state.Model.Locked = $lockedCheck.Checked
      $state.Model.SubmitLocked = $submitLockedCheck.Checked
      $state.Model.HomeNotice = $homeNoticeBox.Text
      $state.Model.HomeLinkText = $homeLinkBox.Text
      $state.Model.PageTitle = $pageTitleBox.Text
      $state.Model.PageSupport = $pageSupportBox.Text
      $state.Model.PageMessage = $pageMessageBox.Text
      $state.Model.SubmitButtonText = $submitButtonBox.Text
      $state.Model.SubmitMessage = $submitMessageBox.Text

      Write-EditorFile -Path $state.Path -Content (ConvertTo-AccessConfigContent -Model $state.Model)
      Set-TabDirty -State $state -Dirty $false
      Set-EditorStatus -Message "Arquivo de acesso salvo."
      return $true
    } catch {
      [System.Windows.Forms.MessageBox]::Show(
        "Nao foi possivel salvar o arquivo de acesso.`n`n$($_.Exception.Message)",
        "Erro ao salvar",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
      ) | Out-Null
      return $false
    }
  }.GetNewClosure()

  $state.ReloadAction = {
    if ($state.Dirty) {
      $answer = [System.Windows.Forms.MessageBox]::Show(
        "Existem alteracoes nao salvas. Deseja recarregar mesmo assim?",
        "Recarregar arquivo",
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      )
      if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) {
        return
      }
    }
    & $loadControls
  }.GetNewClosure()

  Register-DirtyEvents -State $state -Controls @(
    $lockedCheck,
    $submitLockedCheck,
    $homeNoticeBox,
    $homeLinkBox,
    $pageTitleBox,
    $pageSupportBox,
    $pageMessageBox,
    $submitButtonBox,
    $submitMessageBox
  )

  $saveButton.Add_Click({ [void](& $state.SaveAction) }.GetNewClosure())
  $reloadButton.Add_Click({ & $state.ReloadAction }.GetNewClosure())
  & $loadControls
  return $tabPage
}

function Build-CollectiveTab {
  $tabPage = New-Object System.Windows.Forms.TabPage
  $state = New-TabState -BaseTitle "Treino Coletivo" -FileName "03-treino-coletivo-config.js" -TabPage $tabPage
  Set-TabDirty -State $state -Dirty $false
  $state.Model = Load-CollectiveConfigModel

  $panel = New-Object System.Windows.Forms.Panel
  $panel.Dock = [System.Windows.Forms.DockStyle]::Fill
  $panel.AutoScroll = $true
  $tabPage.Controls.Add($panel)

  $intro = New-Object System.Windows.Forms.Label
  $intro.Left = 12
  $intro.Top = 12
  $intro.Width = 1080
  $intro.Height = 36
  $intro.Text = "Edicao do treino coletivo atual. Aqui voce liga ou desliga a pagina e preenche os dados da sessao que vai aparecer no site."
  $panel.Controls.Add($intro)

  $group = New-SectionGroup -Title "Sessao atual" -Left 12 -Top 52 -Width 1080 -Height 470
  $enabledCheck = Add-LabeledCheckBox -Parent $group -Text "Exibir treino coletivo na home e liberar a pagina" -Left 16 -Top 28 -Width 420
  $sessionIdBox = Add-LabeledTextBox -Parent $group -Label "ID da sessao" -Left 16 -Top 62 -Width 340 -HelpText "Sugestao: treino-coletivo-AAAA-MM-DD-HHMM"
  $generateIdButton = New-ActionButton -Text "Gerar ID" -Width 110
  $generateIdButton.Left = 372
  $generateIdButton.Top = 82
  $group.Controls.Add($generateIdButton)
  $titleBox = Add-LabeledTextBox -Parent $group -Label "Titulo" -Left 16 -Top 136 -Width 500
  $locationBox = Add-LabeledTextBox -Parent $group -Label "Local" -Left 540 -Top 136 -Width 500
  $descriptionBox = Add-LabeledTextBox -Parent $group -Label "Descricao curta" -Left 16 -Top 208 -Width 1024 -Multiline -Height 60
  $startPicker = Add-LabeledDateTimePicker -Parent $group -Label "Data e horario do treino" -Left 16 -Top 290 -Width 220
  $deadlinePicker = Add-LabeledDateTimePicker -Parent $group -Label "Confirmacao ate" -Left 260 -Top 290 -Width 220
  $minimumNumeric = Add-LabeledNumericUpDown -Parent $group -Label "Minimo de atletas" -Left 504 -Top 290 -Width 140 -Minimum 1 -Maximum 200
  $manualCancellationCheck = Add-LabeledCheckBox -Parent $group -Text "Cancelar manualmente este treino" -Left 16 -Top 362 -Width 340
  $cancellationReasonBox = Add-LabeledTextBox -Parent $group -Label "Motivo do cancelamento" -Left 16 -Top 392 -Width 1024 -Multiline -Height 52 -HelpText "Use para clima, seguranca ou qualquer outro motivo. Este texto aparece no site e no Telegram."

  $systemNote = New-Object System.Windows.Forms.Label
  $systemNote.Left = 680
  $systemNote.Top = 312
  $systemNote.Width = 360
  $systemNote.Height = 44
  $systemNote.ForeColor = [System.Drawing.Color]::FromArgb(96, 96, 96)
  $systemNote.Text = "A URL do Apps Script e o modo online/local continuam centralizados na aba Sistema."
  $group.Controls.Add($systemNote)
  $panel.Controls.Add($group)

  $saveButton = New-ActionButton -Text "Salvar arquivo"
  $reloadButton = New-ActionButton -Text "Recarregar"
  Add-TabFooterButtons -Parent $tabPage -Buttons @($saveButton, $reloadButton) | Out-Null

  $toggleManualCancellationUi = {
    $cancellationReasonBox.Enabled = $manualCancellationCheck.Checked
    if (-not $manualCancellationCheck.Checked) {
      $cancellationReasonBox.Text = ""
    }
  }.GetNewClosure()

  $loadControls = {
    $state.Loading = $true
    $state.Model = Load-CollectiveConfigModel
    $enabledCheck.Checked = $state.Model.Enabled
    $sessionIdBox.Text = $state.Model.SessionId
    $titleBox.Text = $state.Model.Title
    $locationBox.Text = $state.Model.Location
    $descriptionBox.Text = $state.Model.Description
    $startPicker.Value = $state.Model.StartsAt
    $deadlinePicker.Value = $state.Model.DecisionDeadline
    $minimumNumeric.Value = [decimal]$state.Model.MinimumParticipants
    $manualCancellationCheck.Checked = $state.Model.ManualCancellation
    $cancellationReasonBox.Text = $state.Model.CancellationReason
    & $toggleManualCancellationUi
    $state.Loading = $false
    Set-TabDirty -State $state -Dirty $false
    Set-EditorStatus -Message "Configuracao do treino coletivo carregada."
  }.GetNewClosure()

  $state.SaveAction = {
    try {
      $state.Model.Enabled = $enabledCheck.Checked
      $state.Model.SessionId = $sessionIdBox.Text.Trim()
      $state.Model.Title = $titleBox.Text.Trim()
      $state.Model.Location = $locationBox.Text.Trim()
      $state.Model.Description = $descriptionBox.Text.Trim()
      $state.Model.StartsAt = $startPicker.Value
      $state.Model.DecisionDeadline = $deadlinePicker.Value
      $state.Model.MinimumParticipants = [int]$minimumNumeric.Value
      $state.Model.ManualCancellation = $manualCancellationCheck.Checked
      $state.Model.CancellationReason = if ($manualCancellationCheck.Checked) { $cancellationReasonBox.Text.Trim() } else { "" }

      if ([string]::IsNullOrWhiteSpace($state.Model.SessionId)) {
        throw "Informe o ID da sessao."
      }

      Write-EditorFile -Path $state.Path -Content (ConvertTo-CollectiveConfigContent -Model $state.Model)
      Set-TabDirty -State $state -Dirty $false
      Set-EditorStatus -Message "Configuracao do treino coletivo salva."
      return $true
    } catch {
      [System.Windows.Forms.MessageBox]::Show(
        "Nao foi possivel salvar o treino coletivo.`n`n$($_.Exception.Message)",
        "Erro ao salvar",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
      ) | Out-Null
      return $false
    }
  }.GetNewClosure()

  $state.ReloadAction = {
    if ($state.Dirty) {
      $answer = [System.Windows.Forms.MessageBox]::Show(
        "Existem alteracoes nao salvas. Deseja recarregar mesmo assim?",
        "Recarregar arquivo",
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      )
      if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) {
        return
      }
    }
    & $loadControls
  }.GetNewClosure()

  Register-DirtyEvents -State $state -Controls @(
    $enabledCheck,
    $sessionIdBox,
    $titleBox,
    $locationBox,
    $descriptionBox,
    $startPicker,
    $deadlinePicker,
    $minimumNumeric,
    $manualCancellationCheck,
    $cancellationReasonBox
  )

  $generateIdButton.Add_Click({
    $sessionIdBox.Text = ("treino-coletivo-{0}" -f $startPicker.Value.ToString("yyyy-MM-dd-HHmm"))
  }.GetNewClosure())
  $manualCancellationCheck.Add_CheckedChanged({ & $toggleManualCancellationUi }.GetNewClosure())

  $saveButton.Add_Click({ [void](& $state.SaveAction) }.GetNewClosure())
  $reloadButton.Add_Click({ & $state.ReloadAction }.GetNewClosure())
  & $loadControls
  return $tabPage
}

function Build-ConsultaTab {
  $tabPage = New-Object System.Windows.Forms.TabPage
  $state = New-TabState -BaseTitle "Planilhas" -FileName "04-planilhas-consulta.js" -TabPage $tabPage
  Set-TabDirty -State $state -Dirty $false
  $state.Model = Load-ConsultaConfigModel

  $panel = New-Object System.Windows.Forms.Panel
  $panel.Dock = [System.Windows.Forms.DockStyle]::Fill
  $panel.AutoScroll = $true
  $tabPage.Controls.Add($panel)

  $intro = New-Object System.Windows.Forms.Label
  $intro.Left = 12
  $intro.Top = 12
  $intro.Width = 1080
  $intro.Height = 36
  $intro.Text = "Planilha principal usada nas paginas de consulta. Basta trocar a URL e os nomes das abas."
  $panel.Controls.Add($intro)

  $group = New-SectionGroup -Title "Planilha compartilhada" -Left 12 -Top 52 -Width 1080 -Height 250
  $sheetUrlBox = Add-LabeledTextBox -Parent $group -Label "URL da planilha" -Left 16 -Top 28 -Width 1024 -HelpText "Cole aqui o link do Google Sheets usado nas paginas de consulta."
  $highlightsBox = Add-LabeledTextBox -Parent $group -Label "Aba - Destaques" -Left 16 -Top 104 -Width 220
  $rankingBox = Add-LabeledTextBox -Parent $group -Label "Aba - Ranking" -Left 260 -Top 104 -Width 220
  $fidelityBox = Add-LabeledTextBox -Parent $group -Label "Aba - Fidelizacao" -Left 504 -Top 104 -Width 220
  $referralBox = Add-LabeledTextBox -Parent $group -Label "Aba - Indicacao" -Left 748 -Top 104 -Width 220
  $panel.Controls.Add($group)

  $saveButton = New-ActionButton -Text "Salvar arquivo"
  $reloadButton = New-ActionButton -Text "Recarregar"
  Add-TabFooterButtons -Parent $tabPage -Buttons @($saveButton, $reloadButton) | Out-Null

  $loadControls = {
    $state.Loading = $true
    $state.Model = Load-ConsultaConfigModel
    $sheetUrlBox.Text = $state.Model.SharedSheetUrl
    $highlightsBox.Text = $state.Model.HighlightsTab
    $rankingBox.Text = $state.Model.RankingTab
    $fidelityBox.Text = $state.Model.FidelityTab
    $referralBox.Text = $state.Model.ReferralTab
    $state.Loading = $false
    Set-TabDirty -State $state -Dirty $false
    Set-EditorStatus -Message "Configuracao das planilhas carregada."
  }.GetNewClosure()

  $state.SaveAction = {
    try {
      $state.Model.SharedSheetUrl = $sheetUrlBox.Text.Trim()
      $state.Model.HighlightsTab = $highlightsBox.Text.Trim()
      $state.Model.RankingTab = $rankingBox.Text.Trim()
      $state.Model.FidelityTab = $fidelityBox.Text.Trim()
      $state.Model.ReferralTab = $referralBox.Text.Trim()

      Write-EditorFile -Path $state.Path -Content (ConvertTo-ConsultaConfigContent -Model $state.Model)
      Set-TabDirty -State $state -Dirty $false
      Set-EditorStatus -Message "Configuracao das planilhas salva."
      return $true
    } catch {
      [System.Windows.Forms.MessageBox]::Show(
        "Nao foi possivel salvar a configuracao das planilhas.`n`n$($_.Exception.Message)",
        "Erro ao salvar",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
      ) | Out-Null
      return $false
    }
  }.GetNewClosure()

  $state.ReloadAction = {
    if ($state.Dirty) {
      $answer = [System.Windows.Forms.MessageBox]::Show(
        "Existem alteracoes nao salvas. Deseja recarregar mesmo assim?",
        "Recarregar arquivo",
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      )
      if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) {
        return
      }
    }
    & $loadControls
  }.GetNewClosure()

  Register-DirtyEvents -State $state -Controls @(
    $sheetUrlBox,
    $highlightsBox,
    $rankingBox,
    $fidelityBox,
    $referralBox
  )

  $saveButton.Add_Click({ [void](& $state.SaveAction) }.GetNewClosure())
  $reloadButton.Add_Click({ & $state.ReloadAction }.GetNewClosure())
  & $loadControls
  return $tabPage
}

function Build-CalendarTab {
  $tabPage = New-Object System.Windows.Forms.TabPage
  $state = New-TabState -BaseTitle "Calendario" -FileName "05-calendario-provas.js" -TabPage $tabPage
  Set-TabDirty -State $state -Dirty $false
  $state.Model = Load-CalendarEntriesModel
  $state.CurrentKey = ""

  $intro = New-Object System.Windows.Forms.Label
  $intro.Dock = [System.Windows.Forms.DockStyle]::Top
  $intro.Height = 42
  $intro.Padding = New-Object System.Windows.Forms.Padding(12, 10, 12, 0)
  $intro.Text = "Cadastre as provas do calendario. Selecione uma prova na lista para editar ou use Novo para comecar um cadastro do zero."
  $tabPage.Controls.Add($intro)

  $split = New-Object System.Windows.Forms.SplitContainer
  $split.Dock = [System.Windows.Forms.DockStyle]::Fill
  $split.SplitterDistance = 420
  $tabPage.Controls.Add($split)
  $split.BringToFront()

  $listBox = New-Object System.Windows.Forms.ListBox
  $listBox.Dock = [System.Windows.Forms.DockStyle]::Fill
  $split.Panel1.Controls.Add($listBox)

  $formPanel = New-Object System.Windows.Forms.Panel
  $formPanel.Dock = [System.Windows.Forms.DockStyle]::Fill
  $formPanel.AutoScroll = $true
  $split.Panel2.Controls.Add($formPanel)

  $entryTitleBox = Add-LabeledTextBox -Parent $formPanel -Label "Titulo da prova" -Left 16 -Top 16 -Width 620
  $entryDatePicker = Add-LabeledDateTimePicker -Parent $formPanel -Label "Data da prova" -Left 16 -Top 88 -Width 220
  $entryDatePicker.CustomFormat = "dd/MM/yyyy"
  $entryDatePicker.ShowUpDown = $false
  $entryEndDatePicker = Add-LabeledDateTimePicker -Parent $formPanel -Label "Data final (opcional)" -Left 260 -Top 88 -Width 220
  $entryEndDatePicker.CustomFormat = "dd/MM/yyyy"
  $entryEndDatePicker.ShowUpDown = $false
  $entryEndDatePicker.ShowCheckBox = $true
  $entryTimeBox = Add-LabeledTextBox -Parent $formPanel -Label "Horario" -Left 500 -Top 88 -Width 136 -HelpText "Use HH:mm ou deixe em branco."
  $entryLocationBox = Add-LabeledTextBox -Parent $formPanel -Label "Local" -Left 16 -Top 160 -Width 620
  $entryDistancesBox = Add-LabeledTextBox -Parent $formPanel -Label "Distancias" -Left 16 -Top 232 -Width 620 -HelpText "Separe por virgula. Exemplo: 3KM, 5KM, 10KM"
  $entryCircuitCheck = Add-LabeledCheckBox -Parent $formPanel -Text "Essa prova faz parte do circuito" -Left 16 -Top 304 -Width 300
  $entrySignupUrlBox = Add-LabeledTextBox -Parent $formPanel -Label "Link de inscricao" -Left 16 -Top 340 -Width 620
  $entrySignupLabelBox = Add-LabeledTextBox -Parent $formPanel -Label "Texto do botao/link" -Left 16 -Top 412 -Width 300
  $entryNotesBox = Add-LabeledTextBox -Parent $formPanel -Label "Observacoes" -Left 16 -Top 484 -Width 620 -Multiline -Height 90

  $newButton = New-ActionButton -Text "Novo" -Width 100
  $addButton = New-ActionButton -Text "Adicionar item"
  $updateButton = New-ActionButton -Text "Atualizar item"
  $removeButton = New-ActionButton -Text "Remover item"
  $saveButton = New-ActionButton -Text "Salvar arquivo"
  $openButton = New-ActionButton -Text "Abrir pasta"
  Add-TabFooterButtons -Parent $tabPage -Buttons @($newButton, $addButton, $updateButton, $removeButton, $saveButton, $openButton) | Out-Null

  $clearForm = {
    $listBox.ClearSelected()
    $state.CurrentKey = ""
    $entryTitleBox.Text = ""
    $entryDatePicker.Value = Get-Date
    $entryEndDatePicker.Value = $entryDatePicker.Value
    $entryEndDatePicker.Checked = $false
    $entryTimeBox.Text = ""
    $entryLocationBox.Text = ""
    $entryDistancesBox.Text = ""
    $entryCircuitCheck.Checked = $false
    $entrySignupUrlBox.Text = ""
    $entrySignupLabelBox.Text = ""
    $entryNotesBox.Text = ""
    Set-EditorStatus -Message "Formulario do calendario pronto para novo cadastro."
  }.GetNewClosure()

  $rebuildList = {
    $listBox.Items.Clear()
    foreach ($entry in $state.Model.Entries) {
      [void]$listBox.Items.Add((Format-CalendarListItem -Entry $entry))
    }
  }.GetNewClosure()

  $selectByKey = {
    param([string]$Key)
    if ([string]::IsNullOrWhiteSpace($Key)) {
      return
    }

    for ($index = 0; $index -lt $state.Model.Entries.Count; $index += 1) {
      if ((Format-CalendarKey -Entry $state.Model.Entries[$index]) -eq $Key) {
        $listBox.SelectedIndex = $index
        return
      }
    }
  }.GetNewClosure()

  $loadSelection = {
    if ($listBox.SelectedIndex -lt 0) {
      return
    }

    $entry = $state.Model.Entries[$listBox.SelectedIndex]
    $state.CurrentKey = Format-CalendarKey -Entry $entry
    $entryTitleBox.Text = $entry.title
    $entryDatePicker.Value = ConvertTo-DateTimeValue -Value $entry.date
    if ([string]::IsNullOrWhiteSpace([string]$entry.endDate)) {
      $entryEndDatePicker.Value = $entryDatePicker.Value
      $entryEndDatePicker.Checked = $false
    } else {
      $entryEndDatePicker.Value = ConvertTo-DateTimeValue -Value $entry.endDate
      $entryEndDatePicker.Checked = $true
    }
    $entryTimeBox.Text = $entry.time
    $entryLocationBox.Text = $entry.location
    $entryDistancesBox.Text = ($entry.distances -join ", ")
    $entryCircuitCheck.Checked = (([string]$entry.circuito).Trim().ToLowerInvariant() -eq "sim")
    $entrySignupUrlBox.Text = $entry.signupUrl
    $entrySignupLabelBox.Text = $entry.signupLabel
    $entryNotesBox.Text = $entry.notes
    Set-EditorStatus -Message ("Prova selecionada: {0}" -f $entry.title)
  }.GetNewClosure()

  $buildEntryFromForm = {
    $title = $entryTitleBox.Text.Trim()
    $time = $entryTimeBox.Text.Trim()
    $location = $entryLocationBox.Text.Trim()
    $startDateValue = $entryDatePicker.Value.Date
    $endDateValue = ""
    $distances = @(
      ($entryDistancesBox.Text -split "[,`r`n]+" |
        ForEach-Object { $_.Trim() } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    )

    if ([string]::IsNullOrWhiteSpace($title)) {
      throw "Informe o titulo da prova."
    }

    if ($time -and $time -notmatch '^\d{2}:\d{2}$') {
      throw "Use o horario no formato HH:mm."
    }

    if ($entryEndDatePicker.Checked) {
      if ($entryEndDatePicker.Value.Date -lt $startDateValue) {
        throw "A data final nao pode ser anterior a data inicial."
      }

      if ($entryEndDatePicker.Value.Date -gt $startDateValue) {
        $endDateValue = $entryEndDatePicker.Value.ToString("yyyy-MM-dd")
      }
    }

    if ($distances.Count -eq 0) {
      throw "Informe pelo menos uma distancia."
    }

    $existingEntry = $null
    if ($listBox.SelectedIndex -ge 0 -and $listBox.SelectedIndex -lt $state.Model.Entries.Count) {
      $existingEntry = $state.Model.Entries[$listBox.SelectedIndex]
    }

    $stableId = if ($null -ne $existingEntry) {
      Get-CalendarStableId -Entry $existingEntry
    } else {
      Get-CalendarStableId -Entry ([PSCustomObject]@{
          title = $title
          date = $startDateValue.ToString("yyyy-MM-dd")
          location = $location
        })
    }

    $legacyIds = if ($null -ne $existingEntry) {
      Normalize-CalendarLegacyIds -Ids @($existingEntry.legacyIds) -CurrentId $stableId
    } else {
      @()
    }

    return [PSCustomObject]@{
      id = $stableId
      title = $title
      date = $startDateValue.ToString("yyyy-MM-dd")
      endDate = $endDateValue
      time = $time
      location = $location
      distances = $distances
      circuito = if ($entryCircuitCheck.Checked) { "sim" } else { "" }
      signupUrl = $entrySignupUrlBox.Text.Trim()
      signupLabel = $entrySignupLabelBox.Text.Trim()
      notes = $entryNotesBox.Text.Trim()
      legacyIds = $legacyIds
    }
  }.GetNewClosure()

  $state.SaveAction = {
    try {
      $state.Model.Entries = ConvertTo-ArrayList -Items (Sort-CalendarEntries -Entries @($state.Model.Entries))
      Write-EditorFile -Path $state.Path -Content (ConvertTo-CalendarContent -Model $state.Model)
      Set-TabDirty -State $state -Dirty $false
      Set-EditorStatus -Message "Arquivo do calendario salvo."
      return $true
    } catch {
      [System.Windows.Forms.MessageBox]::Show(
        "Nao foi possivel salvar o calendario.`n`n$($_.Exception.Message)",
        "Erro ao salvar",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
      ) | Out-Null
      return $false
    }
  }.GetNewClosure()

  $state.ReloadAction = {
    if ($state.Dirty) {
      $answer = [System.Windows.Forms.MessageBox]::Show(
        "Existem alteracoes nao salvas. Deseja recarregar mesmo assim?",
        "Recarregar arquivo",
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      )
      if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) {
        return
      }
    }

    $state.Model = Load-CalendarEntriesModel
    & $rebuildList
    & $clearForm
    Set-TabDirty -State $state -Dirty $false
    Set-EditorStatus -Message "Calendario recarregado."
  }.GetNewClosure()

  $newButton.Add_Click({ & $clearForm }.GetNewClosure())
  $addButton.Add_Click({
    try {
      $entry = & $buildEntryFromForm
      [void]$state.Model.Entries.Add($entry)
      $state.Model.Entries = ConvertTo-ArrayList -Items (Sort-CalendarEntries -Entries @($state.Model.Entries))
      & $rebuildList
      & $selectByKey (Format-CalendarKey -Entry $entry)
      Set-TabDirty -State $state -Dirty $true
      Set-EditorStatus -Message "Prova adicionada na lista."
    } catch {
      [System.Windows.Forms.MessageBox]::Show(
        $_.Exception.Message,
        "Adicionar prova",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      ) | Out-Null
    }
  }.GetNewClosure())
  $updateButton.Add_Click({
    if ($listBox.SelectedIndex -lt 0) {
      [System.Windows.Forms.MessageBox]::Show(
        "Selecione uma prova na lista para atualizar.",
        "Atualizar prova",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
      ) | Out-Null
      return
    }

    try {
      $entry = & $buildEntryFromForm
      $state.Model.Entries[$listBox.SelectedIndex] = $entry
      $state.Model.Entries = ConvertTo-ArrayList -Items (Sort-CalendarEntries -Entries @($state.Model.Entries))
      & $rebuildList
      & $selectByKey (Format-CalendarKey -Entry $entry)
      Set-TabDirty -State $state -Dirty $true
      Set-EditorStatus -Message "Prova atualizada na lista."
    } catch {
      [System.Windows.Forms.MessageBox]::Show(
        $_.Exception.Message,
        "Atualizar prova",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      ) | Out-Null
    }
  }.GetNewClosure())
  $removeButton.Add_Click({
    if ($listBox.SelectedIndex -lt 0) {
      [System.Windows.Forms.MessageBox]::Show(
        "Selecione uma prova na lista para remover.",
        "Remover prova",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
      ) | Out-Null
      return
    }

    $entry = $state.Model.Entries[$listBox.SelectedIndex]
    $confirm = [System.Windows.Forms.MessageBox]::Show(
      ("Deseja remover a prova `"{0}`"?" -f $entry.title),
      "Remover prova",
      [System.Windows.Forms.MessageBoxButtons]::YesNo,
      [System.Windows.Forms.MessageBoxIcon]::Question
    )

    if ($confirm -ne [System.Windows.Forms.DialogResult]::Yes) {
      return
    }

    $state.Model.Entries.RemoveAt($listBox.SelectedIndex)
    & $rebuildList
    & $clearForm
    Set-TabDirty -State $state -Dirty $true
    Set-EditorStatus -Message "Prova removida da lista."
  }.GetNewClosure())
  $saveButton.Add_Click({ [void](& $state.SaveAction) }.GetNewClosure())
  $openButton.Add_Click({
    Start-Process explorer.exe $script:baseDir
    Set-EditorStatus -Message "Pasta 00-EDITAR-AQUI aberta."
  })
  $listBox.Add_SelectedIndexChanged({ & $loadSelection }.GetNewClosure())

  & $rebuildList
  & $clearForm
  return $tabPage
}

function Build-AthletesTab {
  $tabPage = New-Object System.Windows.Forms.TabPage
  $state = New-TabState -BaseTitle "Atletas" -FileName "06-lista-atletas.js" -TabPage $tabPage
  Set-TabDirty -State $state -Dirty $false
  $state.Model = Load-AthleteNamesModel

  $intro = New-Object System.Windows.Forms.Label
  $intro.Dock = [System.Windows.Forms.DockStyle]::Top
  $intro.Height = 42
  $intro.Padding = New-Object System.Windows.Forms.Padding(12, 10, 12, 0)
  $intro.Text = "Lista de nomes usada nas sugestoes dos formularios. Voce pode importar um CSV para substituir a lista inteira ou ajustar nomes manualmente."
  $tabPage.Controls.Add($intro)

  $split = New-Object System.Windows.Forms.SplitContainer
  $split.Dock = [System.Windows.Forms.DockStyle]::Fill
  $split.SplitterDistance = 420
  $tabPage.Controls.Add($split)
  $split.BringToFront()

  $listBox = New-Object System.Windows.Forms.ListBox
  $listBox.Dock = [System.Windows.Forms.DockStyle]::Fill
  $split.Panel1.Controls.Add($listBox)

  $formPanel = New-Object System.Windows.Forms.Panel
  $formPanel.Dock = [System.Windows.Forms.DockStyle]::Fill
  $split.Panel2.Controls.Add($formPanel)

  $importInfoLabel = New-Object System.Windows.Forms.Label
  $importInfoLabel.Left = 16
  $importInfoLabel.Top = 16
  $importInfoLabel.Width = 640
  $importInfoLabel.Height = 56
  $importInfoLabel.ForeColor = [System.Drawing.Color]::FromArgb(96, 96, 96)
  $importInfoLabel.Text = "Importacao por CSV: substitui a lista inteira atual. Depois da importacao, voce ainda pode ajustar nomes manualmente antes de salvar."
  $formPanel.Controls.Add($importInfoLabel)

  $nameBox = Add-LabeledTextBox -Parent $formPanel -Label "Nome do atleta" -Left 16 -Top 88 -Width 620 -HelpText "Use este campo para ajustes manuais ou para cadastrar um nome novo."

  $newButton = New-ActionButton -Text "Novo" -Width 100
  $addButton = New-ActionButton -Text "Adicionar item"
  $updateButton = New-ActionButton -Text "Atualizar item"
  $removeButton = New-ActionButton -Text "Remover item"
  $sortButton = New-ActionButton -Text "Ordenar A-Z"
  $importButton = New-ActionButton -Text "Importar CSV"
  $saveButton = New-ActionButton -Text "Salvar arquivo"
  $openButton = New-ActionButton -Text "Abrir pasta"
  Add-TabFooterButtons -Parent $tabPage -Buttons @($newButton, $addButton, $updateButton, $removeButton, $sortButton, $importButton, $saveButton, $openButton) | Out-Null

  $rebuildList = {
    $listBox.Items.Clear()
    foreach ($name in $state.Model.Names) {
      [void]$listBox.Items.Add($name)
    }
  }.GetNewClosure()

  $clearForm = {
    $listBox.ClearSelected()
    $nameBox.Text = ""
    Set-EditorStatus -Message "Formulario de atletas pronto para novo cadastro."
  }.GetNewClosure()

  $state.SaveAction = {
    try {
      $state.Model.Names = ConvertTo-ArrayList -Items (Sort-AthleteNames -Names @($state.Model.Names))
      Write-EditorFile -Path $state.Path -Content (ConvertTo-AthleteNamesContent -Model $state.Model)
      Set-TabDirty -State $state -Dirty $false
      Set-EditorStatus -Message "Lista de atletas salva."
      return $true
    } catch {
      [System.Windows.Forms.MessageBox]::Show(
        "Nao foi possivel salvar a lista de atletas.`n`n$($_.Exception.Message)",
        "Erro ao salvar",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
      ) | Out-Null
      return $false
    }
  }.GetNewClosure()

  $state.ReloadAction = {
    if ($state.Dirty) {
      $answer = [System.Windows.Forms.MessageBox]::Show(
        "Existem alteracoes nao salvas. Deseja recarregar mesmo assim?",
        "Recarregar arquivo",
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      )
      if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) {
        return
      }
    }

    $state.Model = Load-AthleteNamesModel
    & $rebuildList
    & $clearForm
    Set-TabDirty -State $state -Dirty $false
    Set-EditorStatus -Message "Lista de atletas recarregada."
  }.GetNewClosure()

  $newButton.Add_Click({ & $clearForm }.GetNewClosure())
  $addButton.Add_Click({
    $name = $nameBox.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($name)) {
      [System.Windows.Forms.MessageBox]::Show(
        "Digite o nome do atleta para adicionar.",
        "Adicionar atleta",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      ) | Out-Null
      return
    }

    if (@($state.Model.Names).Contains($name)) {
      [System.Windows.Forms.MessageBox]::Show(
        "Esse nome ja existe na lista.",
        "Adicionar atleta",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
      ) | Out-Null
      return
    }

    [void]$state.Model.Names.Add($name)
    $state.Model.Names = ConvertTo-ArrayList -Items (Sort-AthleteNames -Names @($state.Model.Names))
    & $rebuildList
    $listBox.SelectedItem = $name
    Set-TabDirty -State $state -Dirty $true
    Set-EditorStatus -Message "Atleta adicionado na lista."
  }.GetNewClosure())
  $updateButton.Add_Click({
    if ($listBox.SelectedIndex -lt 0) {
      [System.Windows.Forms.MessageBox]::Show(
        "Selecione um nome da lista para atualizar.",
        "Atualizar atleta",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
      ) | Out-Null
      return
    }

    $name = $nameBox.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($name)) {
      [System.Windows.Forms.MessageBox]::Show(
        "Digite o nome atualizado do atleta.",
        "Atualizar atleta",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      ) | Out-Null
      return
    }

    $state.Model.Names[$listBox.SelectedIndex] = $name
    $state.Model.Names = ConvertTo-ArrayList -Items (Sort-AthleteNames -Names @($state.Model.Names))
    & $rebuildList
    $listBox.SelectedItem = $name
    Set-TabDirty -State $state -Dirty $true
    Set-EditorStatus -Message "Atleta atualizado na lista."
  }.GetNewClosure())
  $removeButton.Add_Click({
    if ($listBox.SelectedIndex -lt 0) {
      [System.Windows.Forms.MessageBox]::Show(
        "Selecione um nome da lista para remover.",
        "Remover atleta",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
      ) | Out-Null
      return
    }

    $name = [string]$state.Model.Names[$listBox.SelectedIndex]
    $confirm = [System.Windows.Forms.MessageBox]::Show(
      ("Deseja remover `"{0}`"?" -f $name),
      "Remover atleta",
      [System.Windows.Forms.MessageBoxButtons]::YesNo,
      [System.Windows.Forms.MessageBoxIcon]::Question
    )

    if ($confirm -ne [System.Windows.Forms.DialogResult]::Yes) {
      return
    }

    $state.Model.Names.RemoveAt($listBox.SelectedIndex)
    & $rebuildList
    & $clearForm
    Set-TabDirty -State $state -Dirty $true
    Set-EditorStatus -Message "Atleta removido da lista."
  }.GetNewClosure())
  $sortButton.Add_Click({
    $state.Model.Names = ConvertTo-ArrayList -Items (Sort-AthleteNames -Names @($state.Model.Names))
    & $rebuildList
    Set-TabDirty -State $state -Dirty $true
    Set-EditorStatus -Message "Lista ordenada em ordem alfabetica."
  }.GetNewClosure())
  $importButton.Add_Click({
    $confirmMessage = if ($state.Dirty) {
      "A importacao por CSV vai substituir a lista atual, inclusive alteracoes ainda nao salvas. Deseja continuar?"
    } else {
      "A importacao por CSV vai substituir a lista atual inteira. Deseja continuar?"
    }

    $confirmImport = [System.Windows.Forms.MessageBox]::Show(
      $confirmMessage,
      "Importar CSV de atletas",
      [System.Windows.Forms.MessageBoxButtons]::YesNo,
      [System.Windows.Forms.MessageBoxIcon]::Question
    )

    if ($confirmImport -ne [System.Windows.Forms.DialogResult]::Yes) {
      return
    }

    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Filter = "Arquivos CSV (*.csv)|*.csv|Arquivos de texto (*.txt)|*.txt|Todos os arquivos (*.*)|*.*"
    $dialog.InitialDirectory = $script:baseDir

    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
      return
    }

    try {
      $importedNames = @(Import-AthleteNamesFromCsvFile -Path $dialog.FileName)
      if ($importedNames.Count -eq 0) {
        throw "Nenhum nome valido foi encontrado no arquivo selecionado."
      }

      $state.Model.Names = ConvertTo-ArrayList -Items $importedNames
      & $rebuildList
      & $clearForm

      if ($listBox.Items.Count -gt 0) {
        $listBox.SelectedIndex = 0
      }

      Set-TabDirty -State $state -Dirty $true
      Set-EditorStatus -Message ("CSV importado com {0} atletas. Revise e salve o arquivo." -f $importedNames.Count)
    } catch {
      [System.Windows.Forms.MessageBox]::Show(
        "Nao foi possivel importar o CSV.`n`n$($_.Exception.Message)",
        "Erro ao importar CSV",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
      ) | Out-Null
    }
  }.GetNewClosure())
  $saveButton.Add_Click({ [void](& $state.SaveAction) }.GetNewClosure())
  $openButton.Add_Click({
    Start-Process explorer.exe $script:baseDir
    Set-EditorStatus -Message "Pasta 00-EDITAR-AQUI aberta."
  })
  $listBox.Add_SelectedIndexChanged({
    if ($listBox.SelectedIndex -ge 0) {
      $nameBox.Text = [string]$state.Model.Names[$listBox.SelectedIndex]
      Set-EditorStatus -Message ("Atleta selecionado: {0}" -f $nameBox.Text)
    }
  }.GetNewClosure())

  & $rebuildList
  & $clearForm
  return $tabPage
}

function Build-AvatarsTab {
  $tabPage = New-Object System.Windows.Forms.TabPage
  $state = New-TabState -BaseTitle "Avatares" -FileName "07-avatares.js" -TabPage $tabPage
  Set-TabDirty -State $state -Dirty $false
  $state.Model = Load-AvatarEntriesModel
  $state.PendingAvatarSourcePath = ""

  $intro = New-Object System.Windows.Forms.Label
  $intro.Dock = [System.Windows.Forms.DockStyle]::Top
  $intro.Height = 42
  $intro.Padding = New-Object System.Windows.Forms.Padding(12, 10, 12, 0)
  $intro.Text = "Editor de avatares. Cadastre o mapeamento por ID, E-mail ou Nome e informe somente o nome do arquivo em assets/avatars."
  $tabPage.Controls.Add($intro)

  $split = New-Object System.Windows.Forms.SplitContainer
  $split.Dock = [System.Windows.Forms.DockStyle]::Fill
  $split.SplitterDistance = 430
  $tabPage.Controls.Add($split)
  $split.BringToFront()

  $listBox = New-Object System.Windows.Forms.ListBox
  $listBox.Dock = [System.Windows.Forms.DockStyle]::Fill
  $split.Panel1.Controls.Add($listBox)

  $formPanel = New-Object System.Windows.Forms.Panel
  $formPanel.Dock = [System.Windows.Forms.DockStyle]::Fill
  $formPanel.AutoScroll = $true
  $split.Panel2.Controls.Add($formPanel)

  $lookupTypeLabel = New-Object System.Windows.Forms.Label
  $lookupTypeLabel.Left = 16
  $lookupTypeLabel.Top = 16
  $lookupTypeLabel.Width = 150
  $lookupTypeLabel.Text = "Tipo de busca"
  $formPanel.Controls.Add($lookupTypeLabel)

  $lookupTypeCombo = New-Object System.Windows.Forms.ComboBox
  $lookupTypeCombo.Left = 16
  $lookupTypeCombo.Top = 36
  $lookupTypeCombo.Width = 180
  $lookupTypeCombo.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList
  [void]$lookupTypeCombo.Items.AddRange(@("Nome", "E-mail", "ID"))
  $formPanel.Controls.Add($lookupTypeCombo)

  $identifierBox = Add-LabeledTextBox -Parent $formPanel -Label "Identificador" -Left 220 -Top 16 -Width 420 -HelpText "Use ID ou E-mail sempre que possivel. Nome funciona como fallback."
  $avatarFileBox = Add-LabeledTextBox -Parent $formPanel -Label "Nome do arquivo do avatar" -Left 16 -Top 104 -Width 500 -HelpText "Digite apenas o nome do arquivo. Exemplo: paulo-paz.jpg"

  $chooseImageButton = New-ActionButton -Text "Escolher imagem..." -Width 130
  $chooseImageButton.Left = 530
  $chooseImageButton.Top = 124
  $formPanel.Controls.Add($chooseImageButton)

  $selectedImageLabel = New-Object System.Windows.Forms.Label
  $selectedImageLabel.Left = 16
  $selectedImageLabel.Top = 180
  $selectedImageLabel.Width = 640
  $selectedImageLabel.Height = 34
  $selectedImageLabel.ForeColor = [System.Drawing.Color]::FromArgb(96, 96, 96)
  $selectedImageLabel.Text = "Nenhuma imagem externa selecionada."
  $formPanel.Controls.Add($selectedImageLabel)

  $examplesBox = Add-LabeledTextBox -Parent $formPanel -Label "Exemplos" -Left 16 -Top 224 -Width 640 -Multiline -Height 100
  $examplesBox.ReadOnly = $true
  $examplesBox.Text = "Tipo: ID`r`nIdentificador: 12345`r`nArquivo: paulo-paz.jpg`r`n`r`nTipo: E-mail`r`nIdentificador: atleta@exemplo.com`r`nArquivo: joana-ribeiro.jpg`r`n`r`nTipo: Nome`r`nIdentificador: Paulo Paz`r`nArquivo: paulo-paz.jpg"

  $observationLabel = New-Object System.Windows.Forms.Label
  $observationLabel.Left = 16
  $observationLabel.Top = 344
  $observationLabel.Width = 640
  $observationLabel.Height = 44
  $observationLabel.ForeColor = [System.Drawing.Color]::FromArgb(96, 96, 96)
  $observationLabel.Text = "Se voce escolher uma imagem fora da pasta, o editor copia o arquivo para assets/avatars e grava somente o nome."
  $formPanel.Controls.Add($observationLabel)

  $newButton = New-ActionButton -Text "Novo" -Width 100
  $addButton = New-ActionButton -Text "Adicionar item"
  $updateButton = New-ActionButton -Text "Atualizar item"
  $removeButton = New-ActionButton -Text "Remover item"
  $saveButton = New-ActionButton -Text "Salvar arquivo"
  $openFolderButton = New-ActionButton -Text "Abrir pasta"
  $openAvatarsButton = New-ActionButton -Text "Abrir avatares"
  Add-TabFooterButtons -Parent $tabPage -Buttons @($newButton, $addButton, $updateButton, $removeButton, $saveButton, $openFolderButton, $openAvatarsButton) | Out-Null

  $clearForm = {
    $listBox.ClearSelected()
    $lookupTypeCombo.SelectedItem = "Nome"
    $identifierBox.Text = ""
    $avatarFileBox.Text = ""
    $state.PendingAvatarSourcePath = ""
    $selectedImageLabel.Text = "Nenhuma imagem externa selecionada."
    Set-EditorStatus -Message "Formulario de avatares pronto para novo cadastro."
  }.GetNewClosure()

  $rebuildList = {
    $listBox.Items.Clear()
    foreach ($entry in $state.Model.Entries) {
      [void]$listBox.Items.Add((Format-AvatarListItem -Entry $entry))
    }
  }.GetNewClosure()

  $findAvatarIndex = {
    param([string]$LookupType, [string]$Identifier)
    for ($index = 0; $index -lt $state.Model.Entries.Count; $index += 1) {
      $entry = $state.Model.Entries[$index]
      if ($entry.LookupType -eq $LookupType -and $entry.Identifier -eq $Identifier) {
        return $index
      }
    }
    return -1
  }.GetNewClosure()

  $buildEntryFromForm = {
    $lookupType = [string]$lookupTypeCombo.SelectedItem
    $identifier = $identifierBox.Text.Trim()
    $requestedFileName = $avatarFileBox.Text.Trim()

    if ([string]::IsNullOrWhiteSpace($lookupType)) {
      throw "Escolha o tipo de busca."
    }

    if ([string]::IsNullOrWhiteSpace($identifier)) {
      throw "Informe o identificador."
    }

    $finalFileName = Resolve-AvatarTargetFileName -RequestedFileName $requestedFileName -SelectedSourcePath $state.PendingAvatarSourcePath
    $state.PendingAvatarSourcePath = ""
    $selectedImageLabel.Text = "Nenhuma imagem externa selecionada."

    return [PSCustomObject]@{
      LookupType = $lookupType
      Identifier = $identifier
      FileName = $finalFileName
    }
  }.GetNewClosure()

  $state.SaveAction = {
    try {
      $state.Model.Entries = ConvertTo-ArrayList -Items (Sort-AvatarEntries -Entries @($state.Model.Entries))
      Write-EditorFile -Path $state.Path -Content (ConvertTo-AvatarEntriesContent -Model $state.Model)
      Set-TabDirty -State $state -Dirty $false
      Set-EditorStatus -Message "Mapa de avatares salvo."
      return $true
    } catch {
      [System.Windows.Forms.MessageBox]::Show(
        "Nao foi possivel salvar o mapa de avatares.`n`n$($_.Exception.Message)",
        "Erro ao salvar",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
      ) | Out-Null
      return $false
    }
  }.GetNewClosure()

  $state.ReloadAction = {
    if ($state.Dirty) {
      $answer = [System.Windows.Forms.MessageBox]::Show(
        "Existem alteracoes nao salvas. Deseja recarregar mesmo assim?",
        "Recarregar arquivo",
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      )
      if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) {
        return
      }
    }

    $state.Model = Load-AvatarEntriesModel
    & $rebuildList
    & $clearForm
    Set-TabDirty -State $state -Dirty $false
    Set-EditorStatus -Message "Mapa de avatares recarregado."
  }.GetNewClosure()

  $newButton.Add_Click({ & $clearForm }.GetNewClosure())
  $addButton.Add_Click({
    try {
      $entry = & $buildEntryFromForm
      $existingIndex = & $findAvatarIndex $entry.LookupType $entry.Identifier
      if ($existingIndex -ge 0) {
        throw "Ja existe um item com esse tipo e identificador."
      }

      [void]$state.Model.Entries.Add($entry)
      $state.Model.Entries = ConvertTo-ArrayList -Items (Sort-AvatarEntries -Entries @($state.Model.Entries))
      & $rebuildList
      $listBox.SelectedItem = (Format-AvatarListItem -Entry $entry)
      Set-TabDirty -State $state -Dirty $true
      Set-EditorStatus -Message "Avatar adicionado na lista."
    } catch {
      [System.Windows.Forms.MessageBox]::Show(
        $_.Exception.Message,
        "Adicionar avatar",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      ) | Out-Null
    }
  }.GetNewClosure())
  $updateButton.Add_Click({
    if ($listBox.SelectedIndex -lt 0) {
      [System.Windows.Forms.MessageBox]::Show(
        "Selecione um item na lista para atualizar.",
        "Atualizar avatar",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
      ) | Out-Null
      return
    }

    try {
      $entry = & $buildEntryFromForm
      $state.Model.Entries[$listBox.SelectedIndex] = $entry
      $state.Model.Entries = ConvertTo-ArrayList -Items (Sort-AvatarEntries -Entries @($state.Model.Entries))
      & $rebuildList
      $listBox.SelectedItem = (Format-AvatarListItem -Entry $entry)
      Set-TabDirty -State $state -Dirty $true
      Set-EditorStatus -Message "Avatar atualizado na lista."
    } catch {
      [System.Windows.Forms.MessageBox]::Show(
        $_.Exception.Message,
        "Atualizar avatar",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      ) | Out-Null
    }
  }.GetNewClosure())
  $removeButton.Add_Click({
    if ($listBox.SelectedIndex -lt 0) {
      [System.Windows.Forms.MessageBox]::Show(
        "Selecione um item na lista para remover.",
        "Remover avatar",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
      ) | Out-Null
      return
    }

    $entry = $state.Model.Entries[$listBox.SelectedIndex]
    $confirm = [System.Windows.Forms.MessageBox]::Show(
      ("Deseja remover o mapeamento `"{0}`"?" -f (Format-AvatarListItem -Entry $entry)),
      "Remover avatar",
      [System.Windows.Forms.MessageBoxButtons]::YesNo,
      [System.Windows.Forms.MessageBoxIcon]::Question
    )

    if ($confirm -ne [System.Windows.Forms.DialogResult]::Yes) {
      return
    }

    $state.Model.Entries.RemoveAt($listBox.SelectedIndex)
    & $rebuildList
    & $clearForm
    Set-TabDirty -State $state -Dirty $true
    Set-EditorStatus -Message "Avatar removido da lista."
  }.GetNewClosure())
  $saveButton.Add_Click({ [void](& $state.SaveAction) }.GetNewClosure())
  $openFolderButton.Add_Click({
    Start-Process explorer.exe $script:baseDir
    Set-EditorStatus -Message "Pasta 00-EDITAR-AQUI aberta."
  })
  $openAvatarsButton.Add_Click({
    Ensure-Directory -Path $script:avatarsDir
    Start-Process explorer.exe $script:avatarsDir
    Set-EditorStatus -Message "Pasta assets/avatars aberta."
  })
  $chooseImageButton.Add_Click({
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Filter = "Imagens (*.jpg;*.jpeg;*.png;*.gif)|*.jpg;*.jpeg;*.png;*.gif|Todos os arquivos (*.*)|*.*"
    $dialog.InitialDirectory = if (Test-Path -LiteralPath $script:avatarsDir) { $script:avatarsDir } else { $script:baseDir }

    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
      return
    }

    $selectedPath = $dialog.FileName
    $selectedName = [System.IO.Path]::GetFileName($selectedPath)
    $avatarFileBox.Text = $selectedName

    if ((Split-Path -Parent $selectedPath).TrimEnd('\') -ieq $script:avatarsDir.TrimEnd('\')) {
      $state.PendingAvatarSourcePath = ""
      $selectedImageLabel.Text = "Imagem escolhida na pasta de avatares: $selectedName"
    } else {
      $state.PendingAvatarSourcePath = $selectedPath
      $selectedImageLabel.Text = "Imagem externa selecionada: $selectedName (sera copiada ao adicionar/atualizar)"
    }
  }.GetNewClosure())
  $listBox.Add_SelectedIndexChanged({
    if ($listBox.SelectedIndex -lt 0) {
      return
    }

    $entry = $state.Model.Entries[$listBox.SelectedIndex]
    $lookupTypeCombo.SelectedItem = $entry.LookupType
    $identifierBox.Text = $entry.Identifier
    $avatarFileBox.Text = $entry.FileName
    $state.PendingAvatarSourcePath = ""
    $selectedImageLabel.Text = "Nenhuma imagem externa selecionada."
    Set-EditorStatus -Message ("Avatar selecionado: {0}" -f $entry.Identifier)
  }.GetNewClosure())

  & $rebuildList
  & $clearForm
  return $tabPage
}

if ($SmokeTest) {
  [void](ConvertTo-SystemConfigContent -Model (Load-SystemConfigModel))
  [void](ConvertTo-AccessConfigContent -Model (Load-AccessConfigModel))
  [void](ConvertTo-CollectiveConfigContent -Model (Load-CollectiveConfigModel))
  [void](ConvertTo-ConsultaConfigContent -Model (Load-ConsultaConfigModel))
  [void](ConvertTo-CalendarContent -Model (Load-CalendarEntriesModel))
  [void](ConvertTo-AthleteNamesContent -Model (Load-AthleteNamesModel))
  [void](ConvertTo-AvatarEntriesContent -Model (Load-AvatarEntriesModel))
  [void](ConvertTo-PublicationVersionContent -Model (Load-PublicationVersionModel))
  "OK"
  return
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "Projeto 5 - Painel de Edicao"
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.Width = 1360
$form.Height = 900
$form.MinimumSize = New-Object System.Drawing.Size(1100, 760)
$form.KeyPreview = $true

$headerPanel = New-Object System.Windows.Forms.Panel
$headerPanel.Dock = [System.Windows.Forms.DockStyle]::Top
$headerPanel.Height = 74
$headerPanel.Padding = New-Object System.Windows.Forms.Padding(12, 12, 12, 10)
$headerPanel.BackColor = [System.Drawing.Color]::FromArgb(246, 247, 249)

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Dock = [System.Windows.Forms.DockStyle]::Top
$titleLabel.Height = 26
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$titleLabel.Text = "Editor do Site - Projeto 5"

$subtitleLabel = New-Object System.Windows.Forms.Label
$subtitleLabel.Dock = [System.Windows.Forms.DockStyle]::Fill
$subtitleLabel.ForeColor = [System.Drawing.Color]::FromArgb(80, 80, 80)
$subtitleLabel.Text = "Cada aba foi convertida em um formulario especifico. Use Ctrl+S para salvar a aba atual. Todo salvamento cria backup automatico em _backups."

$headerPanel.Controls.Add($subtitleLabel)
$headerPanel.Controls.Add($titleLabel)

$toolbar = New-Object System.Windows.Forms.FlowLayoutPanel
$toolbar.Dock = [System.Windows.Forms.DockStyle]::Top
$toolbar.Height = 48
$toolbar.Padding = New-Object System.Windows.Forms.Padding(12, 8, 12, 8)
$toolbar.WrapContents = $false

$saveCurrentButton = New-ActionButton -Text "Salvar aba atual" -Width 140
$reloadCurrentButton = New-ActionButton -Text "Recarregar aba" -Width 140
$openFolderButton = New-ActionButton -Text "Abrir 00-EDITAR-AQUI" -Width 170
$openBackupsButton = New-ActionButton -Text "Abrir backups" -Width 130
$closeButton = New-ActionButton -Text "Fechar" -Width 100

$toolbar.Controls.AddRange(@(
  $saveCurrentButton,
  $reloadCurrentButton,
  $openFolderButton,
  $openBackupsButton,
  $closeButton
))

$script:tabControl = New-Object System.Windows.Forms.TabControl
$script:tabControl.Dock = [System.Windows.Forms.DockStyle]::Fill
$script:tabControl.Multiline = $true

$statusStrip = New-Object System.Windows.Forms.StatusStrip
$script:statusLabel = New-Object System.Windows.Forms.ToolStripStatusLabel
$script:statusLabel.Spring = $true
$script:statusLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
$script:statusLabel.Text = "Pronto."
$statusStrip.Items.Add($script:statusLabel) | Out-Null

foreach ($builder in @(
    ${function:Build-SystemTab},
    ${function:Build-AccessTab},
    ${function:Build-CollectiveTab},
    ${function:Build-ConsultaTab},
    ${function:Build-CalendarTab},
    ${function:Build-AthletesTab},
    ${function:Build-AvatarsTab},
    ${function:Build-PublicationTab}
  )) {
  $tabPage = & $builder
  [void]$script:tabControl.TabPages.Add($tabPage)
}

$saveCurrentButton.Add_Click({ [void](Save-CurrentTab) })
$reloadCurrentButton.Add_Click({ Reload-CurrentTab })
$openFolderButton.Add_Click({
  Start-Process explorer.exe $script:baseDir
  Set-EditorStatus -Message "Pasta 00-EDITAR-AQUI aberta."
})
$openBackupsButton.Add_Click({
  Ensure-Directory -Path $script:backupDir
  Start-Process explorer.exe $script:backupDir
  Set-EditorStatus -Message "Pasta de backups aberta."
})
$closeButton.Add_Click({ $form.Close() })

$script:tabControl.Add_SelectedIndexChanged({
  $state = Get-CurrentTabState
  if ($state) {
    Set-EditorStatus -Message ("Aba atual: {0}" -f $state.FileName)
  }
})

$form.Add_FormClosing({
  if (-not (Confirm-CloseEditor)) {
    $_.Cancel = $true
  }
})

$form.Add_KeyDown({
  if ($_.Control -and -not $_.Shift -and $_.KeyCode -eq [System.Windows.Forms.Keys]::S) {
    [void](Save-CurrentTab)
    $_.SuppressKeyPress = $true
    return
  }

  if ($_.Control -and $_.Shift -and $_.KeyCode -eq [System.Windows.Forms.Keys]::S) {
    [void](Save-AllDirtyTabs)
    $_.SuppressKeyPress = $true
  }
})

$form.Controls.Add($script:tabControl)
$form.Controls.Add($toolbar)
$form.Controls.Add($headerPanel)
$form.Controls.Add($statusStrip)

[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::Run($form)
