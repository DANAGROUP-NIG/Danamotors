using System;
using System.IO;

namespace Danamotors.Hhdc.Device
{
    /// <summary>How a scan of a part is counted.</summary>
    public enum ScanMode
    {
        /// <summary>The checker types the quantity (and damaged and note) for each part.</summary>
        Type,
        /// <summary>Every scan of a part adds 1 in the current bin.</summary>
        Add,
        /// <summary>Every scan of a part removes 1 (for a scan counted twice by mistake).</summary>
        Remove
    }

    /// <summary>
    /// What the checker chose last time, kept in settings.txt next to the sheets folder. Only "each scan adds 1" is
    /// remembered: removing is a correction, so the next start returns to typing the quantity.
    /// </summary>
    public sealed class DeviceSettings
    {
        readonly string path;
        public ScanMode Mode = ScanMode.Type;

        public DeviceSettings(string path)
        {
            this.path = path;
        }

        public static DeviceSettings Load(string path)
        {
            DeviceSettings s = new DeviceSettings(path);
            try
            {
                if (File.Exists(path))
                    using (StreamReader r = new StreamReader(path))
                    {
                        string line;
                        while ((line = r.ReadLine()) != null)
                            if (line.Trim() == "scanmode\tadd") s.Mode = ScanMode.Add;
                    }
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
            return s;
        }

        public void Save()
        {
            try
            {
                using (StreamWriter w = new StreamWriter(path, false))
                    w.Write("scanmode\t" + (Mode == ScanMode.Add ? "add" : "type") + "\n");
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }
}
