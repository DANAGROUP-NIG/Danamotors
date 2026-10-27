# Handheld integration (HHDC)

- `device/` Danamotors Count: the app for the MC3190 (.NET Compact Framework 3.5, WinForms). `src/Core` is plain logic (scan detection, counting rules, files), `src/Ui` the forms.
- `link/` HHDC Link: the PC tool (.NET Framework 4.8, x86). `src/Core` is the logic (API, device access, upload record), `src/Ui` the window, `cli/` the command-line twin.
- `shared/` the file formats, compiled into both (`.sheet` PC to device, `.counts` device to PC). Compact Framework lacks `int.TryParse`, `Func<>`, LINQ: build the device app to find out what else.
- `tests/` unit tests (own tiny runner), `uitest/` drives the real device exe on a PC.
- `build.ps1` builds everything with the free compiler. `-UiTest` runs the UI session; screenshots go to `build/ui-shots`.

C# 5 only (the compiler is the one in `C:\Windows\Microsoft.NET\Framework`): no `?.`, `$""`, `nameof`.

Device access in HHDC Link is behind `IDeviceStorage`: `RapiDevice` (a docked device through WMDC's rapi.dll) and `FolderDevice` (a PC folder, for testing). The folder must contain an `Application` folder, as the device does.

Try it without a device:

```powershell
$dev = "$env:TEMP\standin"; mkdir "$dev\Application"
build\link\HhdcLink.exe --folder $dev            # sign in, send, receive
build\device\DanamotorsCount.exe --data "$dev\Application\Danamotors"   # the "device"
```

Antivirus: freshly compiled unsigned exes can be quarantined. Exclude `hhdc\build`; do not switch the antivirus off.
