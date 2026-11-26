using System;
using System.Threading;
using System.Windows.Forms;

namespace Danamotors.Hhdc.Link
{
    public static class Program
    {
        /// <summary>
        /// HHDC Link.exe [--data FOLDER] [--folder DEVICE_FOLDER] [--server URL] [--station]
        /// --station: no window, a tray icon only; delivers and collects handheld jobs (started at Windows sign-in).
        /// </summary>
        [STAThread]
        public static void Main(string[] args)
        {
            string dataDir = LinkSettings.DefaultDataDir();
            bool station = false;
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--data" && i + 1 < args.Length) dataDir = args[i + 1];
                if (args[i] == "--station") station = true;
            }
            LinkSettings s = LinkSettings.Load(dataDir);
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "--folder") s.DeviceFolder = args[i + 1];
                if (args[i] == "--server") s.Server = args[i + 1];
            }
            System.Net.ServicePointManager.SecurityProtocol |= System.Net.SecurityProtocolType.Tls12;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            if (!station)
            {
                Application.Run(new MainForm(dataDir, s));
                return;
            }
            // One station per Windows user: a second start (the Run key and a manual start) just leaves.
            bool first;
            using (Mutex single = new Mutex(true, "Local\\DanamotorsHhdcStation", out first))
            {
                if (!first) return;
                Application.Run(new StationTray(dataDir, s));
            }
        }
    }
}
