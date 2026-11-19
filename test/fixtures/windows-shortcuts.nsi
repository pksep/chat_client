Unicode true
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
OutFile "${QA_ROOT}\shortcuts.exe"

!include MUI2.nsh
!include FileFunc.nsh
!include x64.nsh
!include "Win\COM.nsh"
!include "Win\Propkey.nsh"
!include "Win\RestartManager.nsh"
!include "${QA_UTILS}\utils.nsh"

!define PRODUCTNAME "СЭП Чат"
!define MAINBINARYNAME "sep-chat"
!define BUNDLEID "ru.pksep.chat.shortcutqa"
!define MANUPRODUCTKEY "Software\pksep\${QA_KEY}"
!define STARTMENUFOLDER "${QA_STARTMENU}"
!include "${QA_HOOK}"

Var UpdateMode
Var NoShortcutMode
Var AppStartMenuFolder
Var MenuPath

!macro QA_FAIL message
  FileOpen $R0 "$EXEDIR\failure.txt" w
  FileWriteUTF16LE $R0 "${message}"
  FileClose $R0
  DeleteRegKey SHCTX "${MANUPRODUCTKEY}"
  SetErrorLevel 1
  Quit
!macroend

!macro QA_TARGET shortcut target
  !insertmacro IsShortcutTarget "${shortcut}" "${target}"
  Pop $R0
  ${If} $R0 != 1
    !insertmacro QA_FAIL "Неверная цель: ${shortcut}"
  ${EndIf}
!macroend

!macro QA_ABSENT file
  ${If} ${FileExists} "${file}"
    !insertmacro QA_FAIL "Файл должен отсутствовать: ${file}"
  ${EndIf}
!macroend

!macro QA_MARKER expected
  ReadRegDWORD $R0 SHCTX "${MANUPRODUCTKEY}" "ShortcutMigrationVersion"
  ${If} $R0 != ${expected}
    !insertmacro QA_FAIL "Неверный маркер миграции в $INSTDIR"
  ${EndIf}
!macroend

!macro QA_BEGIN name
  StrCpy $INSTDIR "$EXEDIR\${name}"
  SetOutPath $INSTDIR
  FileOpen $R0 "$INSTDIR\sep-chat.exe" w
  FileClose $R0
  !insertmacro NSIS_HOOK_PREINSTALL
  CreateDirectory "$INSTDIR\desktop"
  CreateDirectory "$INSTDIR\programs\SEP Chat"
  StrCpy $AppStartMenuFolder ""
  StrCpy $UpdateMode 1
  StrCpy $NoShortcutMode 0
  StrCpy $SepLegacyInstall ""
  DeleteRegValue SHCTX "${MANUPRODUCTKEY}" "ShortcutMigrationVersion"
  !if "${STARTMENUFOLDER}" != ""
    StrCpy $MenuPath "$INSTDIR\programs\${STARTMENUFOLDER}"
  !else
    StrCpy $MenuPath "$INSTDIR\programs"
  !endif
!macroend

!macro QA_LEGACY
  CreateShortcut "$INSTDIR\desktop\SEP Chat.lnk" "$INSTDIR\sep-chat.exe"
  CreateShortcut "$INSTDIR\programs\SEP Chat.lnk" "$INSTDIR\sep-chat.exe"
  CreateShortcut "$INSTDIR\programs\SEP Chat\SEP Chat.lnk" "$INSTDIR\sep-chat.exe"
  CreateShortcut "$INSTDIR\programs\SEP Chat\Uninstall.lnk" "$INSTDIR\uninstall.exe"
!macroend

!macro QA_REPAIR
  !insertmacro SEP_MIGRATE_SHORTCUTS "$INSTDIR\desktop" "$INSTDIR\programs"
!macroend

!macro QA_REPAIRED
  !insertmacro QA_TARGET "$INSTDIR\desktop\${PRODUCTNAME}.lnk" "$INSTDIR\sep-chat.exe"
  !insertmacro QA_TARGET "$MenuPath\${PRODUCTNAME}.lnk" "$INSTDIR\sep-chat.exe"
  !insertmacro QA_MARKER 1
!macroend

Section
  SetShellVarContext current

  ; Переход со старого имени при /UPDATE.
  !insertmacro QA_BEGIN legacy-update
  StrCpy $SepLegacyInstall $INSTDIR
  !insertmacro QA_LEGACY
  !insertmacro QA_REPAIR
  !insertmacro QA_REPAIRED
  !insertmacro QA_ABSENT "$INSTDIR\desktop\SEP Chat.lnk"
  !insertmacro QA_ABSENT "$INSTDIR\programs\SEP Chat.lnk"
  !insertmacro QA_ABSENT "$INSTDIR\programs\SEP Chat\SEP Chat.lnk"
  !insertmacro QA_ABSENT "$INSTDIR\programs\SEP Chat\Uninstall.lnk"

  ; Установка уже переименована, но оба ярлыка потеряны.
  !insertmacro QA_BEGIN damaged-update
  !insertmacro QA_REPAIR
  !insertmacro QA_REPAIRED

  ; После восстановления пользователь сам удалил ярлыки.
  Delete "$INSTDIR\desktop\${PRODUCTNAME}.lnk"
  Delete "$MenuPath\${PRODUCTNAME}.lnk"
  !insertmacro QA_REPAIR
  !insertmacro QA_ABSENT "$INSTDIR\desktop\${PRODUCTNAME}.lnk"
  !insertmacro QA_ABSENT "$MenuPath\${PRODUCTNAME}.lnk"

  ; Явный /NS сохраняет старые ярлыки и не мешает последующему восстановлению.
  !insertmacro QA_BEGIN no-shortcuts
  !insertmacro QA_LEGACY
  StrCpy $NoShortcutMode 1
  !insertmacro QA_REPAIR
  !insertmacro QA_ABSENT "$INSTDIR\desktop\${PRODUCTNAME}.lnk"
  !insertmacro QA_ABSENT "$MenuPath\${PRODUCTNAME}.lnk"
  !insertmacro QA_TARGET "$INSTDIR\desktop\SEP Chat.lnk" "$INSTDIR\sep-chat.exe"
  !insertmacro QA_TARGET "$INSTDIR\programs\SEP Chat.lnk" "$INSTDIR\sep-chat.exe"
  ReadRegDWORD $R0 SHCTX "${MANUPRODUCTKEY}" "ShortcutMigrationVersion"
  ${If} $R0 = 1
    !insertmacro QA_FAIL "Миграция не должна завершаться при /NS"
  ${EndIf}
  StrCpy $NoShortcutMode 0
  !insertmacro QA_REPAIR
  !insertmacro QA_REPAIRED

  ; Ошибка создания нового ярлыка не удаляет старый и допускает повтор.
  !insertmacro QA_BEGIN failed-shortcut
  !insertmacro QA_LEGACY
  CreateDirectory "$INSTDIR\desktop\${PRODUCTNAME}.lnk"
  !insertmacro QA_REPAIR
  !insertmacro QA_TARGET "$INSTDIR\desktop\SEP Chat.lnk" "$INSTDIR\sep-chat.exe"
  ReadRegDWORD $R0 SHCTX "${MANUPRODUCTKEY}" "ShortcutMigrationVersion"
  ${If} $R0 = 1
    !insertmacro QA_FAIL "Ошибка создания не должна завершать миграцию"
  ${EndIf}
  RMDir "$INSTDIR\desktop\${PRODUCTNAME}.lnk"
  !insertmacro QA_REPAIR
  !insertmacro QA_REPAIRED

  ; При новой установке сохраняется выбор на штатной странице установщика.
  !insertmacro QA_BEGIN fresh-install
  StrCpy $UpdateMode 0
  !insertmacro QA_REPAIR
  !insertmacro QA_ABSENT "$INSTDIR\desktop\${PRODUCTNAME}.lnk"
  !insertmacro QA_ABSENT "$MenuPath\${PRODUCTNAME}.lnk"
  !insertmacro QA_MARKER 1

  ; Чужие ярлыки с тем же старым именем не удаляются.
  !insertmacro QA_BEGIN foreign-target
  CreateShortcut "$INSTDIR\desktop\SEP Chat.lnk" "$INSTDIR\other.exe"
  CreateShortcut "$INSTDIR\programs\SEP Chat\Uninstall.lnk" "$INSTDIR\other.exe"
  !insertmacro QA_REPAIR
  !insertmacro QA_REPAIRED
  !insertmacro QA_TARGET "$INSTDIR\desktop\SEP Chat.lnk" "$INSTDIR\other.exe"
  !insertmacro QA_TARGET "$INSTDIR\programs\SEP Chat\Uninstall.lnk" "$INSTDIR\other.exe"

  DeleteRegKey SHCTX "${MANUPRODUCTKEY}"
  FileOpen $R0 "$EXEDIR\passed.txt" w
  FileWrite $R0 "7"
  FileClose $R0
SectionEnd
