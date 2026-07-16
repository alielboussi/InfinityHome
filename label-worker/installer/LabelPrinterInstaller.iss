[Setup]
AppName=Label Printer Worker
AppVersion=1.0.0
DefaultDirName={commonpf}\LabelPrinter
DefaultGroupName=Label Printer Worker
OutputDir=dist-installer
OutputBaseFilename=LabelPrinterInstaller
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\LabelPrinter.exe
AppId={{CBE2F1D9-BA1E-4C0A-B2A0-1D31E7ED8C8F}

[Files]
Source: "..\dist\LabelPrinter.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\nssm.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\.env"; DestDir: "{app}"; DestName: ".env"; Flags: onlyifdoesntexist
Source: "..\install-service.bat"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{app}\logs"

[UninstallRun]
Filename: "{app}\nssm.exe"; Parameters: "stop LabelPrinter"; Flags: runhidden; RunOnceId: "LabelPrinterStop"
Filename: "{app}\nssm.exe"; Parameters: "remove LabelPrinter confirm"; Flags: runhidden; RunOnceId: "LabelPrinterRemove"

[Code]
var
  PrinterPage: TInputQueryWizardPage;

function RunHiddenAndWait(const Filename: string; const Params: string): Integer;
var
  ResultCode: Integer;
begin
  if not Exec(Filename, Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then begin
    Result := -1;
    exit;
  end;
  Result := ResultCode;
end;

procedure InstallService;
var
  NssmPath: string;
  ExePath: string;
  AppDir: string;
  ExitCode: Integer;
begin
  NssmPath := ExpandConstant('{app}\nssm.exe');
  ExePath := ExpandConstant('{app}\LabelPrinter.exe');
  AppDir := ExpandConstant('{app}');

  ExitCode := RunHiddenAndWait(NssmPath, 'install LabelPrinter "' + ExePath + '"');
  if ExitCode <> 0 then begin
    MsgBox('Failed to install LabelPrinter service. (nssm install)', mbError, MB_OK);
    exit;
  end;

  RunHiddenAndWait(NssmPath, 'set LabelPrinter AppDirectory "' + AppDir + '"');
  RunHiddenAndWait(NssmPath, 'set LabelPrinter DisplayName "Label Printer Worker"');
  RunHiddenAndWait(NssmPath, 'set LabelPrinter Description "Polls label_print_jobs and prints labels on Godex EZ120"');
  RunHiddenAndWait(NssmPath, 'set LabelPrinter Start SERVICE_AUTO_START');
  RunHiddenAndWait(NssmPath, 'set LabelPrinter AppStdout "' + AppDir + '\logs\label-worker.log"');
  RunHiddenAndWait(NssmPath, 'set LabelPrinter AppStderr "' + AppDir + '\logs\label-worker.err.log"');

  ExitCode := RunHiddenAndWait(NssmPath, 'start LabelPrinter');
  if ExitCode <> 0 then begin
    Sleep(2000);
    ExitCode := RunHiddenAndWait(NssmPath, 'start LabelPrinter');
  end;
  if ExitCode <> 0 then begin
    ExitCode := RunHiddenAndWait(NssmPath, 'status LabelPrinter');
    if ExitCode <> 0 then begin
      MsgBox('LabelPrinter service installed. If it is not running yet, start it from Services.', mbInformation, MB_OK);
    end;
  end;
end;

procedure InitializeWizard;
begin
  PrinterPage := CreateInputQueryPage(
    wpSelectDir,
    'Printer Name',
    'Enter Windows printer name',
    'Enter the exact Windows printer name (e.g., XP-365B).'
  );
  PrinterPage.Add('Printer name:', False);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  PrinterName: string;
  ExitCode: Integer;
  Command: string;
begin
  Result := True;
  if CurPageID = PrinterPage.ID then begin
    PrinterName := Trim(PrinterPage.Values[0]);
    if PrinterName = '' then begin
      MsgBox('Please enter the printer name to continue.', mbError, MB_OK);
      Result := False;
      exit;
    end;
    Command := 'powershell -NoProfile -ExecutionPolicy Bypass -Command "' +
      '$name = ''' + PrinterName + '''; ' +
      '$match = Get-Printer | Where-Object { $_.Name -eq $name }; ' +
      'if ($null -eq $match) { exit 1 } else { exit 0 }"';
    if not Exec('cmd.exe', '/C ' + Command, '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then begin
      MsgBox('Unable to validate printer name. Please check the printer is installed.', mbError, MB_OK);
      Result := False;
      exit;
    end;
    if ExitCode <> 0 then begin
      MsgBox('Printer not found. Please enter the exact Windows printer name.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure UpdateEnvPrinterName;
var
  EnvPath: string;
  Lines: TStringList;
  I: Integer;
  PrinterName: string;
begin
  EnvPath := ExpandConstant('{app}\.env');
  if not FileExists(EnvPath) then exit;
  PrinterName := Trim(PrinterPage.Values[0]);
  if PrinterName = '' then exit;

  Lines := TStringList.Create;
  try
    Lines.LoadFromFile(EnvPath);
    for I := 0 to Lines.Count - 1 do begin
      if Pos('PRINTER_NAME=', Lines[I]) = 1 then begin
        Lines[I] := 'PRINTER_NAME=' + PrinterName;
      end;
    end;
    Lines.SaveToFile(EnvPath);
  finally
    Lines.Free;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then begin
    UpdateEnvPrinterName;
    InstallService;
  end;
end;
