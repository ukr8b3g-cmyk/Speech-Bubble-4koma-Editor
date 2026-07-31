#ifndef MyAppVersion
  #define MyAppVersion "0.1.1"
#endif
#ifndef MySourceDir
  #define MySourceDir "..\dist\SpeechBubble4komaEditor"
#endif

#define MyAppName "Speech Bubble 4koma Editor"
#define MyAppExeName "SpeechBubble4komaEditor.exe"

[Setup]
AppId={{92DFBD37-CA51-4F1B-B890-7CC15D830FCE}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=ukr8b3g-cmyk
AppPublisherURL=https://github.com/ukr8b3g-cmyk/Speech-Bubble-4koma-Editor
AppSupportURL=https://github.com/ukr8b3g-cmyk/Speech-Bubble-4koma-Editor/issues
DefaultDirName={localappdata}\Programs\Speech Bubble 4koma Editor
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist\release
OutputBaseFilename=SpeechBubble4komaEditor-v{#MyAppVersion}-win-x64-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExeName}
SetupLogging=yes

[Languages]
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#MySourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
