using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using Microsoft.Win32;

namespace Danamotors.Hhdc.Setup
{
    /// <summary>
    /// Windows Mobile Device Center 6.1 on Windows 10/11, as hhdc_integration\pc_setup\setup_wmdc.ps1 did it (files
    /// copied 2026-10-16 from the working store PC): the MSI, the cradle drivers, and the Windows 10/11 fix that runs
    /// RapiMgr and WcesComm in their own process as Local System. Windows only creates those two services when a
    /// handheld is first docked, so the fix may have to wait for the dock.
    /// </summary>
    public static class Wmdc
    {
        public static readonly string[] Services = { "RapiMgr", "WcesComm" };
        static readonly string[] Drivers = { @"Serial\wceusbsh.inf", @"RNDIS\wcerndis.inf", @"WPD\wpdrapi.inf" };

        public static bool Installed
        {
            get { return File.Exists(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), @"WindowsMobile\wmdc.exe")); }
        }

        public static bool ServiceExists(string name)
        {
            try
            {
                using (ServiceController sc = new ServiceController(name)) { ServiceControllerStatus s = sc.Status; return true; }
            }
            catch (InvalidOperationException) { return false; }
        }

        public static bool ServicesExist { get { return ServiceExists(Services[0]) && ServiceExists(Services[1]); } }

        public static bool ServiceFixed(string name)
        {
            using (RegistryKey k = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\" + name))
            {
                if (k == null) return false;
                // The split is the fix that matters: working PCs run these as LocalService or LocalSystem.
                object split = k.GetValue("SvcHostSplitDisable");
                return split is int && (int)split == 1;
            }
        }

        /// <summary>
        /// The service fix is for Windows 10/11, where the sync services share one svchost and stop working. Windows 7
        /// (still on some store PCs, 2026-11-24) runs WMDC as it was made to: install it and the drivers, nothing more.
        /// </summary>
        public static bool SplitFixNeeded { get { return Environment.OSVersion.Version.Major >= 10; } }

        static bool Windows10Drivers { get { return Environment.OSVersion.Version.Major >= 10; } }

        /// <summary>
        /// The WMDC in the kit (wmupdate.msi and the drivers) is the 64-bit one, from the Windows 10 store PC. On 32-bit
        /// Windows (some Windows 7 PCs) Windows Update installs WMDC when a handheld is first docked with internet on.
        /// </summary>
        public static bool CanInstall { get { return Environment.Is64BitOperatingSystem; } }

        public const string Install32BitHelp = "This is 32-bit Windows and the WMDC in this setup is 64-bit. Dock the handheld " +
            "with the internet on: Windows 7 installs Windows Mobile Device Center from Windows Update by itself. Or ask IT for " +
            "WMDC 6.1 for 32-bit Windows (drvupdate-x86). Then run this setup again.";

        /// <summary>Anything left to do (and possible here): not installed, services not created yet, or not fixed.</summary>
        public static bool NeedsWork
        {
            get
            {
                if (!Installed) return CanInstall;
                if (!SplitFixNeeded) return false;
                if (!ServicesExist) return true;
                foreach (string s in Services) if (!ServiceFixed(s)) return true;
                return false;
            }
        }

        // ---- the administrator half ----

        public static void Install(Progress p, string skipFile)
        {
            bool fresh = false;
            if (!Installed && !CanInstall)
            {
                p.Warn(Install32BitHelp);
                return;
            }
            if (!Installed)
            {
                string msi = Path.Combine(Kit.WmdcPayload, "wmupdate.msi");
                if (!File.Exists(msi)) throw new InvalidOperationException("payload\\wmdc\\wmupdate.msi is missing from the kit.");
                p.Step("Installing Windows Mobile Device Center (about a minute)");
                int code = Run("msiexec.exe", "/i \"" + msi + "\" /qb! /norestart");
                if (code != 0 && code != 3010 && code != 1641) throw new InvalidOperationException("Windows Mobile Device Center did not install (msiexec " + code + ").");
                p.Ok("Windows Mobile Device Center installed");
                fresh = true;
            }
            if (fresh || !ServicesExist)
            {
                p.Step("Adding the cradle drivers");
                string pnputil = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),
                    (Environment.Is64BitOperatingSystem && !Environment.Is64BitProcess ? "Sysnative" : "System32") + "\\pnputil.exe");
                foreach (string inf in Drivers)
                {
                    string path = Path.Combine(Path.Combine(Kit.WmdcPayload, "Drivers"), inf);
                    if (!File.Exists(path)) { p.Warn("Driver " + inf + " is missing from the kit"); continue; }
                    // Windows 7 and 8 know only the old syntax. Non-zero when already installed: fine.
                    Run(pnputil, Windows10Drivers ? "/add-driver \"" + path + "\" /install" : "-i -a \"" + path + "\"");
                }
                p.Ok("Drivers added");
            }
            if (!SplitFixNeeded)
            {
                p.Ok("WMDC ready (Windows " + Environment.OSVersion.Version.Major + "." + Environment.OSVersion.Version.Minor + ": no service fix needed)");
                return;
            }
            if (!ServicesExist)
            {
                p.Wait("Dock the handheld in the cradle and wake it. Windows finishes setting up WMDC at the first dock.");
                DateTime until = DateTime.UtcNow.AddMinutes(10);
                while (!ServicesExist)
                {
                    if (File.Exists(skipFile) || DateTime.UtcNow > until)
                    {
                        p.Warn("WMDC is not finished: dock the handheld once, then run this setup again.");
                        return;
                    }
                    System.Threading.Thread.Sleep(2000);
                }
                p.Ok("Handheld recognised by Windows");
                System.Threading.Thread.Sleep(5000);   // let Windows finish installing the device
            }
            bool changed = false;
            foreach (string name in Services)
            {
                if (ServiceFixed(name)) continue;
                using (RegistryKey k = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\" + name, true))
                {
                    k.SetValue("SvcHostSplitDisable", 1, RegistryValueKind.DWord);
                    k.SetValue("ObjectName", "LocalSystem", RegistryValueKind.String);
                    k.SetValue("Start", 2, RegistryValueKind.DWord);   // automatic
                }
                changed = true;
            }
            if (changed)
            {
                p.Step("Restarting the WMDC services");
                Restart();
            }
            p.Ok("WMDC ready");
        }

        static void Restart()
        {
            foreach (string name in new string[] { "WcesComm", "RapiMgr" })
            {
                using (ServiceController sc = new ServiceController(name))
                {
                    try { if (sc.Status != ServiceControllerStatus.Stopped) { sc.Stop(); sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(20)); } }
                    catch (Exception) { }
                }
            }
            foreach (string name in Services)
            {
                using (ServiceController sc = new ServiceController(name))
                {
                    try { sc.Start(); sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(20)); }
                    catch (Exception) { }
                }
            }
        }

        static int Run(string exe, string arguments)
        {
            ProcessStartInfo psi = new ProcessStartInfo(exe, arguments);
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            using (Process proc = Process.Start(psi))
            {
                proc.WaitForExit();
                return proc.ExitCode;
            }
        }
    }
}
