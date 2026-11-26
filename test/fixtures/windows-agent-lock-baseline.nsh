; Поведение до исправления: preinstall нормализует путь, не завершает агент.
!macro NSIS_HOOK_PREINSTALL
  GetFullPathName $INSTDIR $INSTDIR
  System::Call 'kernel32::GetLongPathNameW(w "$INSTDIR", w .r0, i ${NSIS_MAX_STRLEN}) i .r1'
  ${If} $1 > 0
  ${AndIf} $1 < ${NSIS_MAX_STRLEN}
    StrCpy $INSTDIR $0
  ${EndIf}
  SetOutPath $INSTDIR
!macroend
