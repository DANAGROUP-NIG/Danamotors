using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace Danamotors.Hhdc.Device
{
    /// <summary>
    /// DataWedge turns the trigger into keystrokes. On the MC3190 it is meant to start from \Windows\StartUp, but after a
    /// warm reset it was found not running (2026-10-27): the trigger did nothing, not even the red beam, until it was
    /// started by hand. So the app checks for it and starts it when it is missing. On a PC this does nothing.
    /// </summary>
    public static class Scanner
    {
        public const string DataWedgeExe = "\\Program Files\\DataWedge\\DataWedge.exe";

        const uint TH32CS_SNAPPROCESS = 0x2, TH32CS_SNAPNOHEAPS = 0x40000000;
        const int EntrySize = 564, NameOffset = 36, NameBytes = 520; // PROCESSENTRY32 on Windows CE

        [DllImport("toolhelp.dll")]
        static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);

        [DllImport("toolhelp.dll")]
        static extern bool Process32First(IntPtr snapshot, byte[] entry);

        [DllImport("toolhelp.dll")]
        static extern bool Process32Next(IntPtr snapshot, byte[] entry);

        [DllImport("toolhelp.dll")]
        static extern bool CloseToolhelp32Snapshot(IntPtr snapshot);

        /// <summary>Starts DataWedge if it is installed and not running. Returns what happened, for the log.</summary>
        public static string EnsureRunning()
        {
            if (Environment.OSVersion.Platform != PlatformID.WinCE) return "";
            try
            {
                if (!File.Exists(DataWedgeExe)) return "scanner: DataWedge not installed";
                if (IsRunning("DataWedge.exe")) return "scanner: DataWedge running";
                Process.Start(DataWedgeExe, "");
                return "scanner: DataWedge was not running, started it";
            }
            catch (Exception ex)
            {
                return "scanner: could not check DataWedge (" + ex.Message + ")";
            }
        }

        static bool IsRunning(string exeName)
        {
            IntPtr snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS | TH32CS_SNAPNOHEAPS, 0);
            if (snap == IntPtr.Zero || snap == new IntPtr(-1)) throw new IOException("no process list");
            try
            {
                byte[] entry = new byte[EntrySize];
                BitConverter.GetBytes(EntrySize).CopyTo(entry, 0);
                for (bool ok = Process32First(snap, entry); ok; ok = Process32Next(snap, entry))
                {
                    string name = Encoding.Unicode.GetString(entry, NameOffset, NameBytes);
                    int end = name.IndexOf('\0');
                    if (end >= 0) name = name.Substring(0, end);
                    if (string.Compare(Path.GetFileName(name), exeName, true) == 0) return true;
                }
                return false;
            }
            finally { CloseToolhelp32Snapshot(snap); }
        }
    }
}
