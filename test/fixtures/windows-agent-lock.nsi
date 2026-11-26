Unicode true
RequestExecutionLevel user
SilentInstall silent
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!define BUNDLEID "ru.pksep.chat.agentlockqa"
!define PRODUCTNAME "SEP Chat Agent Lock QA"
!define MAINBINARYNAME "agent-lock-qa"
!define MANUFACTURER "PKSEP"
!define MANUPRODUCTKEY "Software\PKSEP\AgentLockQA"
!define STARTMENUFOLDER ""
!define VERSION "1.6.102"
Var UpdateMode
Var NoShortcutMode
Var AppStartMenuFolder
!include "${QA_HOOK}"
Name "SEP Chat Agent Lock QA"
OutFile "${QA_OUTPUT}"
Section
  StrCpy $INSTDIR "${QA_INSTALL}"
  StrCpy $UpdateMode 1
  !insertmacro NSIS_HOOK_PREINSTALL
  SetOverwrite try
  File /oname=sep-pi-agent.exe "${QA_REPLACEMENT}"
SectionEnd
