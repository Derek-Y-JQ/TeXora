!macro customInit
  ; Let the standard installer/uninstaller running-app checks prompt the user.
  ; Never terminate the editor before the user can save their documents.

  ; Remove an older per-user ("just me") installation before installing for
  ; all users. electron-builder's uninstaller routine handles silent mode,
  ; /currentuser context, retries and keeping user data.
  InitPluginsDir
  Push "HKEY_CURRENT_USER"
  Call uninstallOldVersion
!macroend

!macro customInstall
  WriteRegStr SHCTX "Software\Classes\Directory\shell\TeXora" "" "用 TeXora 打开"
  WriteRegStr SHCTX "Software\Classes\Directory\shell\TeXora" "Icon" '"$INSTDIR\TeXora.exe"'
  WriteRegStr SHCTX "Software\Classes\Directory\shell\TeXora\command" "" '"$INSTDIR\TeXora.exe" --project="%1"'
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\TeXora" "" "用 TeXora 打开"
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\TeXora" "Icon" '"$INSTDIR\TeXora.exe"'
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\TeXora\command" "" '"$INSTDIR\TeXora.exe" --project="%V"'
!macroend

!macro customUnInstall
  DeleteRegKey SHCTX "Software\Classes\Directory\shell\TeXora"
  DeleteRegKey SHCTX "Software\Classes\Directory\Background\shell\TeXora"
!macroend
