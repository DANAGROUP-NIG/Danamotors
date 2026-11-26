using System;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Danamotors.Hhdc.Setup
{
    /// <summary>
    /// HHDC Station Setup.exe: sets up a store PC as a handheld station in one window.
    ///   (no arguments)           the window, run as the Windows user who works at the cradle
    ///   --elevated FILE [--files] [--wmdc]   the administrator half, started by the window (UAC); progress lines go to FILE
    /// Never ends in "has stopped working": a missing .NET is explained, any other error is shown and written to
    /// %TEMP%\HHDC Station Setup error.txt (Windows 7 store PC, 2026-11-24).
    /// </summary>
    public static class Program
    {
        /// <summary>.NET 4.5 is the first that speaks TLS 1.2 (the server's); HHDC Link is tested on 4.8.</summary>
        const int Net45 = 378389;
        const int Net48 = 528040;

        [STAThread]
        public static int Main(string[] args)
        {
            bool elevated = args.Length >= 2 && args[0] == "--elevated";
            AppDomain.CurrentDomain.UnhandledException += delegate(object s, UnhandledExceptionEventArgs e) { Crash(e.ExceptionObject as Exception, elevated); };
            if (!elevated)
            {
                Application.ThreadException += delegate(object s, System.Threading.ThreadExceptionEventArgs e) { Crash(e.Exception, false); };
                Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                if (!NetReady()) return 1;
            }
            // TLS 1.2 by number: the name needs .NET 4.5 to compile against, the value needs it to run.
            try { System.Net.ServicePointManager.SecurityProtocol |= (System.Net.SecurityProtocolType)3072; }
            catch (NotSupportedException) { if (!elevated) { NetMissing(NetRelease()); return 1; } }
            if (elevated) return ElevatedPart.Run(args);
            Application.Run(new SetupForm());
            return 0;
        }

        static int NetRelease()
        {
            try
            {
                using (RegistryKey k = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full"))
                {
                    object v = k == null ? null : k.GetValue("Release");
                    return v is int ? (int)v : 0;
                }
            }
            catch (Exception) { return 0; }
        }

        static bool NetReady()
        {
            int release = NetRelease();
            if (release >= Net45) return true;
            NetMissing(release);
            return false;
        }

        static void NetMissing(int release)
        {
            MessageBox.Show(
                "This PC has .NET Framework 4.0" + (release > 0 ? "" : " (or an early 4.x)") + ". The station needs .NET Framework 4.8 " +
                "to talk to the server securely.\n\n" +
                "Close this and double-click \"Windows 7 - Start here\" in the same folder: it installs .NET Framework 4.8 " +
                "(Windows asks for an administrator), restarts the PC if needed, and opens this setup again.\n\n" +
                "Nothing has been changed on this PC.",
                "Kia Motors Handheld - station setup", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        static void Crash(Exception e, bool elevated)
        {
            string detail = (e == null ? "Unknown error" : e.ToString());
            string file = Path.Combine(Path.GetTempPath(), "HHDC Station Setup error.txt");
            try
            {
                File.WriteAllText(file, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + Environment.OSVersion + ", .NET release " + NetRelease() +
                    (elevated ? ", administrator part" : "") + "\r\n" + detail + "\r\n");
            }
            catch (Exception) { }
            if (elevated) return;   // the window reports the administrator part's failure
            try
            {
                MessageBox.Show("The setup hit a problem and stopped:\n\n" + (e == null ? "Unknown error" : e.Message) +
                    "\n\nThe details are in:\n" + file + "\nSend that file to IT.",
                    "Kia Motors Handheld - station setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            catch (Exception) { }
            Environment.Exit(1);
        }
    }
}
