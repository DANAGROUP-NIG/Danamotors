using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace Danamotors.Hhdc.Link
{
    /// <summary>Per-PC settings: the server, and whether the device is a real handheld or a stand-in folder.</summary>
    public sealed class LinkSettings
    {
        public string Server = "http://localhost:8000/api";
        /// <summary>Empty = the handheld in the USB cradle. A folder path = that folder stands in for the device (testing).</summary>
        public string DeviceFolder = "";
        public string Email = "";

        public static string DefaultDataDir()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), Path.Combine("Danamotors", "HHDC Link"));
        }

        public static LinkSettings Load(string dataDir)
        {
            LinkSettings s = new LinkSettings();
            string file = Path.Combine(dataDir, "settings.txt");
            if (!File.Exists(file)) return s;
            foreach (string line in File.ReadAllLines(file, Encoding.UTF8))
            {
                int eq = line.IndexOf('=');
                if (eq <= 0) continue;
                string k = line.Substring(0, eq).Trim(), v = line.Substring(eq + 1).Trim();
                if (k == "server" && v.Length > 0) s.Server = v;
                else if (k == "deviceFolder") s.DeviceFolder = v;
                else if (k == "email") s.Email = v;
            }
            return s;
        }

        public void Save(string dataDir)
        {
            Directory.CreateDirectory(dataDir);
            File.WriteAllText(Path.Combine(dataDir, "settings.txt"),
                "server=" + Server + "\r\ndeviceFolder=" + DeviceFolder + "\r\nemail=" + Email + "\r\n", new UTF8Encoding(false));
        }

        public IDeviceStorage OpenDevice()
        {
            return DeviceFolder.Length > 0 ? (IDeviceStorage)new FolderDevice(DeviceFolder) : new RapiDevice();
        }
    }
}
