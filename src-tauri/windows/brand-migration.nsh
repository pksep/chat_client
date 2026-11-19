; Имя продукта меняется, каталог старой установки и данные пользователя сохраняются.
Var SepLegacyInstall

!macro SEP_ENSURE_SHORTCUT shortcut
  !insertmacro IsShortcutTarget "${shortcut}" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $R7
  ${If} $R7 != 1
    CreateShortcut "${shortcut}" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "${shortcut}"
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
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro SEP_MIGRATE_SHORTCUTS "$DESKTOP" "$SMPROGRAMS"
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
