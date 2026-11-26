; Имя продукта меняется, каталог старой установки и данные пользователя сохраняются.
Var SepLegacyInstall
Var SepAgentStopResult

; Restart Manager освобождает только конкретный бинарник этой установки.
; Это также восстанавливает обновление со старых версий с оставшимся агентом.
Function SepStopInstalledAgent
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  StrCpy $SepAgentStopResult 0
  ${If} ${FileExists} "$INSTDIR\sep-pi-agent.exe"
    System::Alloc 66
    Pop $1
    System::Call 'rstrtmgr::RmStartSession(*i .r0, i 0, p r1) i .r2'
    ${If} $2 = 0
      System::Call '*(&w${NSIS_MAX_STRLEN} "$INSTDIR\sep-pi-agent.exe") p .r3'
      System::Call '*(p r3) p .r4'
      System::Call 'rstrtmgr::RmRegisterResources(i r0, i 1, p r4, i 0, p 0, i 0, p 0) i .r2'
      ${If} $2 = 0
        System::Call 'rstrtmgr::RmShutdown(i r0, i 1, p 0) i .r2'
      ${EndIf}
      StrCpy $SepAgentStopResult $2
      System::Call 'rstrtmgr::RmEndSession(i r0) i .r5'
      System::Free $4
      System::Free $3
    ${Else}
      StrCpy $SepAgentStopResult $2
    ${EndIf}
    System::Free $1
  ${EndIf}
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

!macro SEP_ENSURE_SHORTCUT shortcut
  !insertmacro IsShortcutTarget "${shortcut}" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $R7
  ${If} $R7 != 1
    CreateShortcut "${shortcut}" "$INSTDIR\${MAINBINARYNAME}.exe"
  ${EndIf}
  !insertmacro SetLnkAppUserModelId "${shortcut}"
!macroend

!macro SEP_REFRESH_SHORTCUT_ID shortcut
  !insertmacro IsShortcutTarget "${shortcut}" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $R7
  ${If} $R7 = 1
    !insertmacro SetLnkAppUserModelId "${shortcut}"
  ${EndIf}
!macroend

!macro SEP_REFRESH_SHORTCUT_IDS desktop programs
  !insertmacro SEP_REFRESH_SHORTCUT_ID "${desktop}\${PRODUCTNAME}.lnk"
  !insertmacro SEP_REFRESH_SHORTCUT_ID "${programs}\${PRODUCTNAME}.lnk"
  ${If} $AppStartMenuFolder != ""
    !insertmacro SEP_REFRESH_SHORTCUT_ID "${programs}\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
  ${Else}
    !if "${STARTMENUFOLDER}" != ""
      !insertmacro SEP_REFRESH_SHORTCUT_ID "${programs}\${STARTMENUFOLDER}\${PRODUCTNAME}.lnk"
    !endif
  ${EndIf}
!macroend

!macro SEP_REMOVE_OLD_SHORTCUT shortcut target
  !insertmacro IsShortcutTarget "${shortcut}" "${target}"
  Pop $R7
  ${If} $R7 = 1
    Delete "${shortcut}"
  ${EndIf}
!macroend

; В режиме /UPDATE Tauri не создаёт новые ярлыки при смене PRODUCTNAME.
; Маркер позволяет один раз восстановить и уже пострадавшие установки,
; а в следующих обновлениях сохранить ручное удаление ярлыков пользователем.
!macro SEP_MIGRATE_SHORTCUTS desktop programs
  ${If} $UpdateMode = 1
  ${OrIf} $SepLegacyInstall != ""
    ReadRegDWORD $R8 SHCTX "${MANUPRODUCTKEY}" "ShortcutMigrationVersion"
    ${If} $R8 != 1
    ${AndIf} $NoShortcutMode != 1
      !insertmacro SEP_ENSURE_SHORTCUT "${desktop}\${PRODUCTNAME}.lnk"
      !insertmacro IsShortcutTarget "${desktop}\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      Pop $R6
      ${If} $R6 = 1
        !insertmacro SEP_REMOVE_OLD_SHORTCUT "${desktop}\SEP Chat.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      ${EndIf}

      !if "${STARTMENUFOLDER}" != ""
        ${If} $AppStartMenuFolder == ""
          StrCpy $AppStartMenuFolder "${STARTMENUFOLDER}"
        ${EndIf}
        StrCpy $R9 "${programs}\$AppStartMenuFolder"
      !else
        StrCpy $R9 "${programs}"
      !endif
      CreateDirectory "$R9"
      !insertmacro SEP_ENSURE_SHORTCUT "$R9\${PRODUCTNAME}.lnk"
      !insertmacro IsShortcutTarget "$R9\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      Pop $R8
      ${If} $R8 = 1
        !insertmacro SEP_REMOVE_OLD_SHORTCUT "${programs}\SEP Chat.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
        !insertmacro SEP_REMOVE_OLD_SHORTCUT "${programs}\SEP Chat\SEP Chat.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
        !insertmacro SEP_REMOVE_OLD_SHORTCUT "${programs}\SEP Chat\Uninstall.lnk" "$INSTDIR\uninstall.exe"
        RMDir "${programs}\SEP Chat"
      ${EndIf}
      ${If} $R6 = 1
      ${AndIf} $R8 = 1
        WriteRegDWORD SHCTX "${MANUPRODUCTKEY}" "ShortcutMigrationVersion" 1
      ${EndIf}
    ${EndIf}
  ${Else}
    ; При новой установке выбор ярлыков обрабатывают штатные страницы Tauri.
    WriteRegDWORD SHCTX "${MANUPRODUCTKEY}" "ShortcutMigrationVersion" 1
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  StrCpy $SepLegacyInstall ""
!if "${BUNDLEID}" == "ru.pksep.chat"
  ReadRegStr $R8 SHCTX "${MANUPRODUCTKEY}" ""
  ${If} $R8 == ""
    ReadRegStr $R8 SHCTX "Software\${MANUFACTURER}\SEP Chat" ""
    ${If} $R8 != ""
    ${AndIf} ${FileExists} "$R8\${MAINBINARYNAME}.exe"
      StrCpy $SepLegacyInstall $R8
      StrCpy $INSTDIR $R8
      SetOutPath $INSTDIR
    ${EndIf}
  ${EndIf}
!endif
  ; ShellLink возвращает длинный путь даже при установке через имя 8.3.
  GetFullPathName $INSTDIR $INSTDIR
  System::Call 'kernel32::GetLongPathNameW(w "$INSTDIR", w .r0, i ${NSIS_MAX_STRLEN}) i .r1'
  ${If} $1 > 0
  ${AndIf} $1 < ${NSIS_MAX_STRLEN}
    StrCpy $INSTDIR $0
  ${EndIf}
  SetOutPath $INSTDIR
  ; В ручной установке сначала используем штатное подтверждение закрытия Чата.
  !ifmacrodef CheckIfAppIsRunning
    !insertmacro CheckIfAppIsRunning "$INSTDIR\${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
  !endif
  Call SepStopInstalledAgent
  ${If} $SepAgentStopResult != 0
    MessageBox MB_ICONSTOP|MB_OK "Не удалось завершить локальный агент. Закройте СЭП Чат и повторите установку. Код: $SepAgentStopResult" /SD IDOK
    SetErrorLevel 5
    Abort
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $UpdateMode = 1
    WriteRegStr SHCTX "Software\${BUNDLEID}\Updater" "PendingForegroundVersion" "${VERSION}"
  ${EndIf}
  !insertmacro SEP_MIGRATE_SHORTCUTS "$DESKTOP" "$SMPROGRAMS"
  ; Путь мог быть правильным при потерянном AppUserModelId. Исправляем и после миграции.
  !insertmacro SEP_REFRESH_SHORTCUT_IDS "$DESKTOP" "$SMPROGRAMS"
  ${If} $SepLegacyInstall != ""
    ReadRegStr $R8 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\SEP Chat" "InstallLocation"
    ${If} $R8 == $SepLegacyInstall
    ${OrIf} $R8 == '$\"$SepLegacyInstall$\"'
      DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\SEP Chat"
    ${EndIf}
    ReadRegStr $R8 SHCTX "Software\${MANUFACTURER}\SEP Chat" ""
    ${If} $R8 == $SepLegacyInstall
      DeleteRegKey SHCTX "Software\${MANUFACTURER}\SEP Chat"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey SHCTX "Software\${BUNDLEID}\Updater"
!macroend
