# Puxa da VPS os backups do banco do PersonaFlow que ainda não estão no PC: é a cópia fora da VPS.
# Confere o SHA-256 de cada um e mantém os 30 mais novos, numa pasta do perfil do usuário.
#
#   powershell -ExecutionPolicy Bypass -File deploy\puxar-backup.ps1            (puxa agora)
#   powershell -ExecutionPolicy Bypass -File deploy\puxar-backup.ps1 -Agendar   (copia pra pasta e agenda às 10h e às 20h)
#   powershell -ExecutionPolicy Bypass -File deploy\puxar-backup.ps1 -Remover   (tira do Agendador)
#
# Roda só com o usuário logado (usa a chave SSH dele). Se o PC estiver desligado na hora,
# roda assim que ligar (StartWhenAvailable). O log fica em <pasta>\puxar.log.
param(
  [string]$Servidor = "kyber-vps",
  [string]$Remoto = "backups/personaflow",
  [string]$Local = (Join-Path $env:USERPROFILE "Backups\personaflow"),
  [int]$Manter = 30,
  [switch]$Agendar,
  [switch]$Remover
)
$ErrorActionPreference = "Stop"
$tarefa = "PersonaFlow - puxar backup do banco"

if ($Remover) {
  Unregister-ScheduledTask -TaskName $tarefa -Confirm:$false
  Write-Output "tarefa removida: $tarefa"
  return
}

New-Item -ItemType Directory -Force $Local | Out-Null

if ($Agendar) {
  # A cópia instalada não depende de qual branch está no checkout.
  $instalado = Join-Path $Local "puxar-backup.ps1"
  Copy-Item -Force $PSCommandPath $instalado
  $vbs = Join-Path $Local "puxar-backup.vbs"
  $linha = "CreateObject(""WScript.Shell"").Run ""powershell.exe -NoProfile -ExecutionPolicy Bypass -File """"$instalado"""""", 0, True"
  Set-Content -Path $vbs -Value $linha -Encoding ASCII
  $acao = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "//B //Nologo `"$vbs`""
  $quando = @((New-ScheduledTaskTrigger -Daily -At "10:00"), (New-ScheduledTaskTrigger -Daily -At "20:00"))
  $config = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
  $descricao = "Copia pro PC os backups diários do banco do PersonaFlow que ficam na VPS (scp, confere SHA-256, guarda os $Manter mais novos em $Local)."
  Register-ScheduledTask -TaskName $tarefa -Action $acao -Trigger $quando -Settings $config -Description $descricao -Force | Out-Null
  $info = Get-ScheduledTask -TaskName $tarefa | Get-ScheduledTaskInfo
  Write-Output "agendada: $tarefa, às 10h e às 20h. Próxima: $($info.NextRunTime)"
  return
}

# O Agendador não herda o PATH do Git Bash: usa o ssh do Git se existir, senão o do Windows.
$git = Join-Path $env:ProgramFiles "Git\usr\bin"
$ssh = if (Test-Path (Join-Path $git "ssh.exe")) { Join-Path $git "ssh.exe" } else { "ssh" }
$scp = if (Test-Path (Join-Path $git "scp.exe")) { Join-Path $git "scp.exe" } else { "scp" }
$log = Join-Path $Local "puxar.log"
function Anotar([string]$texto) {
  Add-Content -Path $log -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $texto) -Encoding UTF8
}

try {
  $lista = & $ssh -o BatchMode=yes -o ConnectTimeout=20 $Servidor "cd $Remoto && ls -1 personaflow-*.dump"
  if ($LASTEXITCODE -ne 0) { throw "não consegui listar os backups na VPS (${Servidor}:$Remoto)" }
  $novos = 0
  foreach ($nome in ($lista | Where-Object { $_ -match '^personaflow-[0-9TZ-]+\.dump$' })) {
    $alvo = Join-Path $Local $nome
    if (Test-Path $alvo) { continue }
    $parcial = "$alvo.parcial"
    & $scp -q -o BatchMode=yes "${Servidor}:$Remoto/$nome" $parcial
    if ($LASTEXITCODE -ne 0) { throw "a cópia de $nome falhou" }
    $esperado = ((& $ssh -o BatchMode=yes $Servidor "cat $Remoto/$nome.sha256") -split '\s+')[0]
    $real = (Get-FileHash -Algorithm SHA256 $parcial).Hash.ToLower()
    if ($esperado -ne $real) {
      Remove-Item $parcial
      throw "o SHA-256 de $nome não confere"
    }
    Move-Item $parcial $alvo
    $novos++
  }
  $todos = @(Get-ChildItem $Local -Filter "personaflow-*.dump" | Sort-Object Name -Descending)
  $todos | Select-Object -Skip $Manter | Remove-Item
  $guardados = [math]::Min($todos.Count, $Manter)
  $ultimo = if ($todos.Count) { $todos[0].Name } else { "nenhum" }
  Anotar "ok: $novos novo(s), $guardados guardado(s), o mais novo é $ultimo"
  Write-Output "ok: $novos novo(s), $guardados guardado(s), o mais novo é $ultimo"
} catch {
  Anotar "erro: $($_.Exception.Message)"
  Write-Error $_.Exception.Message
  exit 1
}
