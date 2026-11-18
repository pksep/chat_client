; Имя продукта меняется, каталог старой установки и данные пользователя сохраняются.
Var SepLegacyInstall

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
  ${If} $SepLegacyInstall != ""
    Delete "$DESKTOP\SEP Chat.lnk"
    Delete "$SMPROGRAMS\SEP Chat.lnk"
    Delete "$SMPROGRAMS\SEP Chat\SEP Chat.lnk"
    Delete "$SMPROGRAMS\SEP Chat\Uninstall.lnk"
    RMDir "$SMPROGRAMS\SEP Chat"
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
