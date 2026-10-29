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
