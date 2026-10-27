using System;
using System.Windows.Forms;

namespace Danamotors.Hhdc.Link
{
    public static class Program
    {
        /// <summary>HHDC Link.exe [--data FOLDER] [--folder DEVICE_FOLDER] [--server URL]</summary>
        [STAThread]
        public static void Main(string[] args)
        {
            string dataDir = LinkSettings.DefaultDataDir();
            for (int i = 0; i < args.Length - 1; i++)
                if (args[i] == "--data") dataDir = args[i + 1];
            LinkSettings s = LinkSettings.Load(dataDir);
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "--folder") s.DeviceFolder = args[i + 1];
                if (args[i] == "--server") s.Server = args[i + 1];
            }
            System.Net.ServicePointManager.SecurityProtocol |= System.Net.SecurityProtocolType.Tls12;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm(dataDir, s));
        }
    }
}
