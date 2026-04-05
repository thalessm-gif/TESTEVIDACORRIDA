Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$workspacePath = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataFilePath = Join-Path $workspacePath "calendar-data.js"

function Read-CalendarEntries {
  param(
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return [System.Collections.ArrayList]::new()
  }

  $rawContent = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  $jsonText = $rawContent -replace '^\s*window\.RACE_CALENDAR_ENTRIES\s*=\s*', ''
  $jsonText = $jsonText -replace ';\s*$', ''

  if ([string]::IsNullOrWhiteSpace($jsonText)) {
    return [System.Collections.ArrayList]::new()
  }

  $items = $jsonText | ConvertFrom-Json
  $list = [System.Collections.ArrayList]::new()

  foreach ($item in @($items)) {
    $entry = [ordered]@{
      title = [string]$item.title
      date = [string]$item.date
      time = [string]$item.time
      location = [string]$item.location
      distances = @($item.distances | ForEach-Object { [string]$_ })
      circuito = [string]$item.circuito
      signupUrl = [string]$item.signupUrl
      signupLabel = [string]$item.signupLabel
      notes = [string]$item.notes
    }
    [void]$list.Add($entry)
  }

  return $list
}

function Write-CalendarEntries {
  param(
    [string]$Path,
    [System.Collections.ArrayList]$Entries
  )

  $json = $Entries | ConvertTo-Json -Depth 5
  $content = "window.RACE_CALENDAR_ENTRIES = $json;`r`n"
  $utf8 = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($Path, $content, $utf8)
}

function Get-DisplayText {
  param(
    [hashtable]$Entry
  )

  $title = if ([string]::IsNullOrWhiteSpace($Entry.title)) { "Nova prova" } else { $Entry.title }
  $date = if ([string]::IsNullOrWhiteSpace($Entry.date)) { "sem data" } else { $Entry.date }
  return "$date | $title"
}

function New-Label {
  param(
    [string]$Text,
    [int]$X,
    [int]$Y,
    [int]$Width = 120
  )

  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Text
  $label.Location = New-Object System.Drawing.Point($X, $Y)
  $label.Size = New-Object System.Drawing.Size($Width, 22)
  return $label
}

$entries = Read-CalendarEntries -Path $dataFilePath
$selectedIndex = -1

$form = New-Object System.Windows.Forms.Form
$form.Text = "Editor do Calendario"
$form.StartPosition = "CenterScreen"
$form.ClientSize = New-Object System.Drawing.Size(1120, 680)
$form.MinimumSize = New-Object System.Drawing.Size(1120, 680)
$form.BackColor = [System.Drawing.Color]::FromArgb(248, 244, 239)

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = "Editor do Calendario de Provas"
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$titleLabel.Location = New-Object System.Drawing.Point(24, 18)
$titleLabel.Size = New-Object System.Drawing.Size(420, 34)
$form.Controls.Add($titleLabel)

$subtitleLabel = New-Object System.Windows.Forms.Label
$subtitleLabel.Text = "Preencha os campos, salve o item e depois clique em Salvar arquivo."
$subtitleLabel.Location = New-Object System.Drawing.Point(26, 54)
$subtitleLabel.Size = New-Object System.Drawing.Size(520, 24)
$form.Controls.Add($subtitleLabel)

$listBox = New-Object System.Windows.Forms.ListBox
$listBox.Location = New-Object System.Drawing.Point(24, 98)
$listBox.Size = New-Object System.Drawing.Size(360, 500)
$listBox.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$form.Controls.Add($listBox)

$buttonPanel = New-Object System.Windows.Forms.FlowLayoutPanel
$buttonPanel.Location = New-Object System.Drawing.Point(24, 612)
$buttonPanel.Size = New-Object System.Drawing.Size(1060, 42)
$buttonPanel.WrapContents = $false
$buttonPanel.AutoSize = $false
$form.Controls.Add($buttonPanel)

$editorPanel = New-Object System.Windows.Forms.Panel
$editorPanel.Location = New-Object System.Drawing.Point(410, 98)
$editorPanel.Size = New-Object System.Drawing.Size(674, 500)
$editorPanel.BorderStyle = "FixedSingle"
$editorPanel.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($editorPanel)

$editorPanel.Controls.Add((New-Label -Text "Nome da prova" -X 18 -Y 20))
$titleTextBox = New-Object System.Windows.Forms.TextBox
$titleTextBox.Location = New-Object System.Drawing.Point(18, 44)
$titleTextBox.Size = New-Object System.Drawing.Size(620, 28)
$editorPanel.Controls.Add($titleTextBox)

$editorPanel.Controls.Add((New-Label -Text "Data (AAAA-MM-DD)" -X 18 -Y 84 -Width 180))
$dateTextBox = New-Object System.Windows.Forms.TextBox
$dateTextBox.Location = New-Object System.Drawing.Point(18, 108)
$dateTextBox.Size = New-Object System.Drawing.Size(180, 28)
$editorPanel.Controls.Add($dateTextBox)

$editorPanel.Controls.Add((New-Label -Text "Horario" -X 222 -Y 84))
$timeTextBox = New-Object System.Windows.Forms.TextBox
$timeTextBox.Location = New-Object System.Drawing.Point(222, 108)
$timeTextBox.Size = New-Object System.Drawing.Size(120, 28)
$editorPanel.Controls.Add($timeTextBox)

$editorPanel.Controls.Add((New-Label -Text "Circuito Riograndino" -X 370 -Y 84 -Width 170))
$circuitCheckBox = New-Object System.Windows.Forms.CheckBox
$circuitCheckBox.Location = New-Object System.Drawing.Point(370, 110)
$circuitCheckBox.Size = New-Object System.Drawing.Size(180, 24)
$circuitCheckBox.Text = "Exibir selo do circuito"
$editorPanel.Controls.Add($circuitCheckBox)

$editorPanel.Controls.Add((New-Label -Text "Cidade / local" -X 18 -Y 148))
$locationTextBox = New-Object System.Windows.Forms.TextBox
$locationTextBox.Location = New-Object System.Drawing.Point(18, 172)
$locationTextBox.Size = New-Object System.Drawing.Size(620, 28)
$editorPanel.Controls.Add($locationTextBox)

$editorPanel.Controls.Add((New-Label -Text "Distancias (separadas por virgula)" -X 18 -Y 212 -Width 240))
$distancesTextBox = New-Object System.Windows.Forms.TextBox
$distancesTextBox.Location = New-Object System.Drawing.Point(18, 236)
$distancesTextBox.Size = New-Object System.Drawing.Size(620, 28)
$editorPanel.Controls.Add($distancesTextBox)

$editorPanel.Controls.Add((New-Label -Text "Link de inscricao" -X 18 -Y 276 -Width 140))
$signupUrlTextBox = New-Object System.Windows.Forms.TextBox
$signupUrlTextBox.Location = New-Object System.Drawing.Point(18, 300)
$signupUrlTextBox.Size = New-Object System.Drawing.Size(620, 28)
$editorPanel.Controls.Add($signupUrlTextBox)

$editorPanel.Controls.Add((New-Label -Text "Rotulo do link" -X 18 -Y 340 -Width 120))
$signupLabelTextBox = New-Object System.Windows.Forms.TextBox
$signupLabelTextBox.Location = New-Object System.Drawing.Point(18, 364)
$signupLabelTextBox.Size = New-Object System.Drawing.Size(240, 28)
$signupLabelTextBox.Text = "Inscrições abertas"
$editorPanel.Controls.Add($signupLabelTextBox)

$editorPanel.Controls.Add((New-Label -Text "Observacoes" -X 18 -Y 404 -Width 120))
$notesTextBox = New-Object System.Windows.Forms.TextBox
$notesTextBox.Location = New-Object System.Drawing.Point(18, 428)
$notesTextBox.Size = New-Object System.Drawing.Size(620, 48)
$notesTextBox.Multiline = $true
$editorPanel.Controls.Add($notesTextBox)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = "Arquivo de dados: calendar-data.js"
$statusLabel.Location = New-Object System.Drawing.Point(410, 72)
$statusLabel.Size = New-Object System.Drawing.Size(430, 20)
$form.Controls.Add($statusLabel)

function Refresh-ListBox {
  $listBox.Items.Clear()
  for ($index = 0; $index -lt $entries.Count; $index++) {
    [void]$listBox.Items.Add((Get-DisplayText -Entry $entries[$index]))
  }
}

function Clear-Form {
  $script:selectedIndex = -1
  $listBox.ClearSelected()
  $titleTextBox.Text = ""
  $dateTextBox.Text = ""
  $timeTextBox.Text = ""
  $locationTextBox.Text = ""
  $distancesTextBox.Text = ""
  $signupUrlTextBox.Text = ""
  $signupLabelTextBox.Text = "Inscrições abertas"
  $notesTextBox.Text = ""
  $circuitCheckBox.Checked = $false
  $statusLabel.Text = "Novo cadastro pronto para preenchimento."
}

function Load-EntryIntoForm {
  param(
    [int]$Index
  )

  if ($Index -lt 0 -or $Index -ge $entries.Count) {
    return
  }

  $entry = $entries[$Index]
  $script:selectedIndex = $Index
  $titleTextBox.Text = [string]$entry.title
  $dateTextBox.Text = [string]$entry.date
  $timeTextBox.Text = [string]$entry.time
  $locationTextBox.Text = [string]$entry.location
  $distancesTextBox.Text = (@($entry.distances) -join ", ")
  $signupUrlTextBox.Text = [string]$entry.signupUrl
  $signupLabelTextBox.Text = [string]$entry.signupLabel
  $notesTextBox.Text = [string]$entry.notes
  $circuitCheckBox.Checked = ([string]$entry.circuito).Trim().ToLower() -eq "sim"
  $statusLabel.Text = "Editando item selecionado."
}

function Build-EntryFromForm {
  $distances = @(
    ($distancesTextBox.Text -split ",") |
      ForEach-Object { $_.Trim() } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  )

  return [ordered]@{
    title = $titleTextBox.Text.Trim()
    date = $dateTextBox.Text.Trim()
    time = $timeTextBox.Text.Trim()
    location = $locationTextBox.Text.Trim()
    distances = $distances
    circuito = $(if ($circuitCheckBox.Checked) { "sim" } else { "" })
    signupUrl = $signupUrlTextBox.Text.Trim()
    signupLabel = $signupLabelTextBox.Text.Trim()
    notes = $notesTextBox.Text.Trim()
  }
}

$newButton = New-Object System.Windows.Forms.Button
$newButton.Text = "Novo"
$newButton.Size = New-Object System.Drawing.Size(110, 34)
$newButton.Add_Click({
  Clear-Form
})
$buttonPanel.Controls.Add($newButton)

$saveItemButton = New-Object System.Windows.Forms.Button
$saveItemButton.Text = "Salvar item"
$saveItemButton.Size = New-Object System.Drawing.Size(120, 34)
$saveItemButton.Add_Click({
  $entry = Build-EntryFromForm

  if ([string]::IsNullOrWhiteSpace($entry.title)) {
    [System.Windows.Forms.MessageBox]::Show("Preencha pelo menos o nome da prova.", "Campo obrigatório")
    return
  }

  if ($script:selectedIndex -ge 0 -and $script:selectedIndex -lt $entries.Count) {
    $entries[$script:selectedIndex] = $entry
    $statusLabel.Text = "Item atualizado na lista. Falta salvar o arquivo."
  } else {
    [void]$entries.Add($entry)
    $script:selectedIndex = $entries.Count - 1
    $statusLabel.Text = "Novo item adicionado. Falta salvar o arquivo."
  }

  Refresh-ListBox
  $listBox.SelectedIndex = $script:selectedIndex
})
$buttonPanel.Controls.Add($saveItemButton)

$removeButton = New-Object System.Windows.Forms.Button
$removeButton.Text = "Remover item"
$removeButton.Size = New-Object System.Drawing.Size(130, 34)
$removeButton.Add_Click({
  if ($listBox.SelectedIndex -lt 0) {
    [System.Windows.Forms.MessageBox]::Show("Selecione um item para remover.", "Remover item")
    return
  }

  $confirmation = [System.Windows.Forms.MessageBox]::Show(
    "Deseja remover a prova selecionada?",
    "Confirmar remoção",
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Question
  )

  if ($confirmation -ne [System.Windows.Forms.DialogResult]::Yes) {
    return
  }

  $entries.RemoveAt($listBox.SelectedIndex)
  Refresh-ListBox
  Clear-Form
  $statusLabel.Text = "Item removido da lista. Falta salvar o arquivo."
})
$buttonPanel.Controls.Add($removeButton)

$saveFileButton = New-Object System.Windows.Forms.Button
$saveFileButton.Text = "Salvar arquivo"
$saveFileButton.Size = New-Object System.Drawing.Size(140, 34)
$saveFileButton.Add_Click({
  try {
    Write-CalendarEntries -Path $dataFilePath -Entries $entries
    $statusLabel.Text = "calendar-data.js atualizado com sucesso."
    [System.Windows.Forms.MessageBox]::Show("Arquivo salvo com sucesso.", "Calendário")
  } catch {
    [System.Windows.Forms.MessageBox]::Show("Não foi possível salvar o arquivo.`r`n$($_.Exception.Message)", "Erro ao salvar")
  }
})
$buttonPanel.Controls.Add($saveFileButton)

$openFileButton = New-Object System.Windows.Forms.Button
$openFileButton.Text = "Abrir pasta"
$openFileButton.Size = New-Object System.Drawing.Size(120, 34)
$openFileButton.Add_Click({
  Start-Process explorer.exe $workspacePath
})
$buttonPanel.Controls.Add($openFileButton)

$closeButton = New-Object System.Windows.Forms.Button
$closeButton.Text = "Fechar"
$closeButton.Size = New-Object System.Drawing.Size(110, 34)
$closeButton.Add_Click({
  $form.Close()
})
$buttonPanel.Controls.Add($closeButton)

$listBox.Add_SelectedIndexChanged({
  if ($listBox.SelectedIndex -ge 0) {
    Load-EntryIntoForm -Index $listBox.SelectedIndex
  }
})

Refresh-ListBox
Clear-Form

[void]$form.ShowDialog()
