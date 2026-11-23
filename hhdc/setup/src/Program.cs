using System;
using System.Windows.Forms;

namespace Danamotors.Hhdc.Setup
{
    /// <summary>
    /// HHDC Station Setup.exe: sets up a store PC as a handheld station in one window.
    ///   (no arguments)           the window, run as the Windows user who works at the cradle
    ///   --elevated FILE [--files] [--wmdc]   the administrator half, started by the window (UAC); progress lines go to FILE
    /// </summary>
    public static class Program
    {
        [STAThread]
        public static int Main(string[] args)
        {
            System.Net.ServicePointManager.SecurityProtocol |= System.Net.SecurityProtocolType.Tls12;
            if (args.Length >= 2 && args[0] == "--elevated") return ElevatedPart.Run(args);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
            return 0;
        }
    }
}
