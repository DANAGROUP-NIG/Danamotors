# Handheld integration (HHDC)

- `device/` Kia Motors Handheld (KMHH, `KMHH.exe`; "Danamotors Count" before 2026-11-10): the app for the MC3190 (.NET Compact Framework 3.5, WinForms). `src/Core` is plain logic (scan detection, counting rules, files), `src/Ui` the forms.
- `link/` HHDC Link: the PC tool (.NET Framework 4.8, x86). `src/Core` is the logic (API, device access, upload record), `src/Ui` the window, `cli/` the command-line twin.
- `shared/` the file formats, compiled into both (`.sheet` PC to device, `.counts` device to PC). Compact Framework lacks `int.TryParse`, `Func<>`, `MethodInvoker`, LINQ: build the device app to find out what else.
- Picking and MIT checking (indent, CPO, Mobis MIT; server side in Danamotors `doc/handheld.md`): `shared/HandheldDoc.cs` (`.hdoc` PC to device, `.hlog` device to PC, same append-only rules as `.counts`), `device/src/Core/DocSession.cs` (rules), `device/src/Ui/DocForm.cs` (screen), `link/src/Core/Documents.cs` (API, device files, send, receive once). The device lists documents after the count sheets; HHDC Link's "Show" box switches between sheets and the three document types. CLI: `sources TYPE`, `senddoc TYPE NUMBER PICKERCODE`, `receivedoc NUMBER`.
- Station mode (since 2026-10-28; server side in Danamotors `doc/handheld.md`): the store sends and posts every job on the web; `HhdcLink.exe --station` runs in the tray (started at sign-in from `HKCU\...\Run`, set in the window's **Station...** dialog) and, while a handheld is docked, delivers the branch's waiting jobs and collects finished ones. Logic in `link/src/Core/Station.cs` (`StationCycle` one pass, `StationRunner` the loop, `DeviceIdentity` = `\Application\Danamotors\device.txt`, `StationLog` = `%APPDATA%\Danamotors\HHDC Link\logs`); tray in `link/src/Ui/StationTray.cs`. The station key is stored with DPAPI in settings.txt. CLI: `station key KEY`, `station once [--app EXE]`, `station run`. The window stays as the IT tool.
- Label printing (2026-10-28; server side in Danamotors `doc/barcode-labels.md`): the station also prints the branch's barcode labels on a Zebra on the PC's USB, through the USB printer interface (no print queue or driver). Logic in `link/src/Core/LabelPrinter.cs` (`ZebraUsbPrinter`, `ZebraReply` parses `~HI~HS`, `LabelStation` claims and prints each tick). CLI: `printer status`, `printer test`, and `station once|run --printer-file DIR` (ZPL to files instead of a printer).
- Look (2026-11-10): Kia midnight and white like the web dashboard. `device/src/Ui/Theme.cs` (colours, fonts, the embedded Kia logo `res/kia-logo.png`), `device/src/Ui/Widgets.cs` (`HeaderBar`, `KeyBar` = the screen's keys along the bottom, tappable with the stylus, `ItemList` = painted lists, tap to select and tap again to open). Home lists the jobs by kind (count, indent, CPO, MIT) like the legacy main menu; a kind with one job opens it straight away. `res/kmhh.ico` is the icon of `KMHH.exe` and `HhdcLink.exe` (so also the tray), made from the dashboard's `client/public/logo.webp`. Lists hold the focus in a hidden text box (`ItemList.Sink`): a painted control gives the arrow keys away on a PC and the Compact Framework has no `IsInputKey`.
- `setup/` HHDC Station Setup (2026-11-18): the one-window installer for a store PC, packed by `make_station_kit.ps1` into `build\HHDC_Station_Setup.zip` (setup exe, `setup.ini` with the server, `payload\` = HhdcLink.exe, KMHH.exe, WMDC msi + drivers). It checks the key with the server before changing anything (a heartbeat with nothing docked), then asks for an administrator only if Program Files (`Program Files (x86)\Danamotors\HHDC Link`) or WMDC need it (`--elevated FILE --files --wmdc`, progress lines through FILE), saves server + key for the signed-in user (DPAPI, as before), sets the HKCU Run start, removes the old per-user copy, starts the station and shows its log. The key is filled in from the clipboard. WMDC: the MSI, `pnputil` drivers, and the Windows 10/11 `SvcHostSplitDisable` fix, which waits for the first dock when the services do not exist yet. No scripts and no antivirus changes: Avast removed the earlier .bat/.ps1 installer and the exes as IDP.Generic. All exes now carry version information and an asInvoker manifest (`respp.manifest`); `make_station_kit.ps1 -CertThumbprint` signs them, the real cure.
- `tests/` unit tests (own tiny runner), `uitest/` drives the real device exe on a PC.
- `build.ps1` builds everything with the free compiler. `-UiTest` runs the three UI sessions (counting, scan modes, picking document); screenshots go to `build/ui-shots*`.

C# 5 only (the compiler is the one in `C:\Windows\Microsoft.NET\Framework`): no `?.`, `$""`, `nameof`.

Device access in HHDC Link is behind `IDeviceStorage`: `RapiDevice` (a docked device through WMDC's rapi.dll) and `FolderDevice` (a PC folder, for testing). The folder must contain an `Application` folder, as the device does.

Try it without a device:

```powershell
$dev = "$env:TEMP\standin"; mkdir "$dev\Application"
build\link\HhdcLink.exe --folder $dev            # sign in, send, receive (IT tool)
build\link\HhdcLinkCli.exe station key <key from Settings > HHDC>
build\link\HhdcLinkCli.exe station once --folder $dev --app build\device\KMHH.exe   # one station pass
build\device\KMHH.exe --data "$dev\Application\Danamotors"   # the "device"
```

Antivirus: freshly compiled unsigned exes can be quarantined. Exclude `hhdc\build`; do not switch the antivirus off.
