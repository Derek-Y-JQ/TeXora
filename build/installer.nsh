!macro customInit
  ; Close a running TeXora so locked files can be replaced.
  nsExec::ExecToLog 'taskkill /F /IM "TeXora.exe" /T'
  Sleep 300

  ; Remove an older per-user ("just me") installation before installing for
  ; all users. electron-builder's uninstaller routine handles silent mode,
  ; /currentuser context, retries and keeping user data.
  InitPluginsDir
  Push "HKEY_CURRENT_USER"
  Call uninstallOldVersion
!macroend
