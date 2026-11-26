param([Parameter(Mandatory = $true)][string]$TestDirectory)
$ErrorActionPreference = 'Stop'
$qaDirectory = Join-Path $TestDirectory 'same-target-id'
$links = @(Get-ChildItem -LiteralPath $qaDirectory -Filter '*.lnk' -Recurse)
if ($links.Count -ne 2) { throw 'Не найдены оба тестовых ярлыка' }
$shell = New-Object -ComObject Shell.Application
foreach ($link in $links) {
  $item = $shell.Namespace($link.DirectoryName).ParseName($link.Name)
  if ($item.ExtendedProperty('System.AppUserModel.ID') -ne 'ru.pksep.chat.shortcutqa') {
    throw 'Идентификатор уведомлений ярлыка не восстановлен'
  }
}
