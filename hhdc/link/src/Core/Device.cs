using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace Danamotors.Hhdc.Link
{
    /// <summary>A problem to show to the storekeeper as is.</summary>
    public class LinkException : Exception
    {
        public LinkException(string message) : base(message) { }
        public LinkException(string message, Exception inner) : base(message, inner) { }
    }

    public sealed class DeviceNotFoundException : LinkException
    {
        public DeviceNotFoundException(string message) : base(message) { }
    }

    /// <summary>
    /// The handheld's file system, as the device sees it: paths like \Application\Danamotors\sheets\X.sheet.
    /// Two implementations: RapiDevice (a docked MC3190 through Windows Mobile Device Center) and
    /// FolderDevice (a PC folder standing in for it, used for all testing).
    /// </summary>
    public interface IDeviceStorage : IDisposable
    {
        string Describe();
        /// <summary>Throws DeviceNotFoundException with a message saying what to do.</summary>
        void Connect();
        bool DirectoryExists(string path);
        bool FileExists(string path);
        /// <summary>File names (not folders) directly in the folder; empty if the folder does not exist.</summary>
        List<string> ListFiles(string dir);
        byte[] ReadFile(string path);
        /// <summary>Creates missing folders.</summary>
        void WriteFile(string path, byte[] data);
        void DeleteFile(string path);
    }

    public sealed class FolderDevice : IDeviceStorage
    {
        readonly string root;

        public FolderDevice(string root)
        {
            this.root = root;
        }

        public string Describe() { return "Folder " + root + " (stands in for the device)"; }

        public void Connect()
        {
            if (!Directory.Exists(root))
                throw new DeviceNotFoundException("The folder that stands in for the device does not exist: " + root);
        }

        string Map(string devicePath)
        {
            string p = root;
            foreach (string part in devicePath.Split('\\'))
            {
                if (part.Length == 0) continue;
                if (part == ".." || part.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0) throw new LinkException("Bad device path " + devicePath);
                p = Path.Combine(p, part);
            }
            return p;
        }

        public bool DirectoryExists(string path) { return Directory.Exists(Map(path)); }
        public bool FileExists(string path) { return File.Exists(Map(path)); }

        public List<string> ListFiles(string dir)
        {
            List<string> names = new List<string>();
            string d = Map(dir);
            if (Directory.Exists(d)) foreach (string f in Directory.GetFiles(d)) names.Add(Path.GetFileName(f));
            return names;
        }

        public byte[] ReadFile(string path) { return File.ReadAllBytes(Map(path)); }

        public void WriteFile(string path, byte[] data)
        {
            string f = Map(path);
            Directory.CreateDirectory(Path.GetDirectoryName(f));
            File.WriteAllBytes(f, data);
        }

        public void DeleteFile(string path)
        {
            string f = Map(path);
            if (File.Exists(f)) File.Delete(f);
        }

        public void Dispose() { }
    }

    /// <summary>
    /// A docked Windows CE device through rapi.dll (installed with Windows Mobile Device Center).
    /// The P/Invoke is the one proven on the MC3190 with tools\rapitool.cs. Build this program as x86:
    /// WMDC installs a 32-bit rapi.dll.
    /// </summary>
    public sealed class RapiDevice : IDeviceStorage
    {
        [StructLayout(LayoutKind.Sequential)]
        struct RAPIINIT { public int cbSize; public IntPtr heRapiInit; public int hrRapiInit; }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode, Pack = 4)]
        struct CE_FIND_DATA
        {
            public uint dwFileAttributes; public long ftCreationTime; public long ftLastAccessTime; public long ftLastWriteTime;
            public uint nFileSizeHigh; public uint nFileSizeLow; public uint dwOID;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string cFileName;
        }

        [DllImport("rapi.dll")] static extern int CeRapiInitEx(ref RAPIINIT p);
        [DllImport("rapi.dll")] static extern int CeRapiUninit();
        [DllImport("rapi.dll")] static extern int CeGetLastError();
        [DllImport("rapi.dll", CharSet = CharSet.Unicode)] static extern IntPtr CeFindFirstFile(string name, ref CE_FIND_DATA d);
        [DllImport("rapi.dll", CharSet = CharSet.Unicode)] static extern bool CeFindNextFile(IntPtr h, ref CE_FIND_DATA d);
        [DllImport("rapi.dll")] static extern bool CeFindClose(IntPtr h);
        [DllImport("rapi.dll", CharSet = CharSet.Unicode)] static extern IntPtr CeCreateFile(string name, uint access, uint share, IntPtr sec, uint creation, uint flags, IntPtr template);
        [DllImport("rapi.dll")] static extern bool CeReadFile(IntPtr h, byte[] buf, int n, out int read, IntPtr ov);
        [DllImport("rapi.dll")] static extern bool CeWriteFile(IntPtr h, byte[] buf, int n, out int written, IntPtr ov);
        [DllImport("rapi.dll")] static extern bool CeCloseHandle(IntPtr h);
        [DllImport("rapi.dll", CharSet = CharSet.Unicode)] static extern bool CeDeleteFile(string name);
        [DllImport("rapi.dll", CharSet = CharSet.Unicode)] static extern bool CeCreateDirectory(string name, IntPtr sec);
        [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);

        const uint GENERIC_READ = 0x80000000, GENERIC_WRITE = 0x40000000, OPEN_EXISTING = 3, CREATE_ALWAYS = 2;
        const uint DIRECTORY = 16;
        static readonly IntPtr Invalid = new IntPtr(-1);

        bool connected;

        public string Describe() { return "Handheld in the USB cradle"; }

        public void Connect()
        {
            if (connected) return;
            RAPIINIT init = new RAPIINIT();
            init.cbSize = Marshal.SizeOf(init);
            try
            {
                if (CeRapiInitEx(ref init) != 0 || WaitForSingleObject(init.heRapiInit, 10000) != 0 || init.hrRapiInit != 0)
                {
                    try { CeRapiUninit(); } catch { }
                    throw new DeviceNotFoundException(
                        "No handheld found. Put it in the USB cradle, press its power button to wake it, and wait until " +
                        "Windows Mobile Device Center shows \"Connected\". Then try again.");
                }
            }
            catch (DllNotFoundException)
            {
                throw new DeviceNotFoundException("Windows Mobile Device Center is not installed on this PC (rapi.dll is missing). Ask IT to run pc_setup\\setup_wmdc.ps1.");
            }
            catch (BadImageFormatException)
            {
                throw new DeviceNotFoundException("HHDC Link must run as a 32-bit program to talk to the handheld (rapi.dll is 32-bit).");
            }
            connected = true;
        }

        public void Dispose()
        {
            if (!connected) return;
            connected = false;
            try { CeRapiUninit(); } catch { }
        }

        void Need()
        {
            if (!connected) Connect();
        }

        bool Find(string path, uint wantDirectory, out CE_FIND_DATA d)
        {
            d = new CE_FIND_DATA();
            IntPtr h = CeFindFirstFile(path, ref d);
            if (h == Invalid) return false;
            CeFindClose(h);
            return (d.dwFileAttributes & DIRECTORY) == wantDirectory;
        }

        public bool DirectoryExists(string path)
        {
            Need();
            CE_FIND_DATA d;
            return Find(path.TrimEnd('\\'), DIRECTORY, out d);
        }

        public bool FileExists(string path)
        {
            Need();
            CE_FIND_DATA d;
            return Find(path, 0, out d);
        }

        public List<string> ListFiles(string dir)
        {
            Need();
            List<string> names = new List<string>();
            CE_FIND_DATA d = new CE_FIND_DATA();
            IntPtr h = CeFindFirstFile(dir.TrimEnd('\\') + "\\*", ref d);
            if (h == Invalid) return names;
            do
            {
                if ((d.dwFileAttributes & DIRECTORY) == 0) names.Add(d.cFileName);
            } while (CeFindNextFile(h, ref d));
            CeFindClose(h);
            return names;
        }

        public byte[] ReadFile(string path)
        {
            Need();
            IntPtr h = CeCreateFile(path, GENERIC_READ, 1, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
            if (h == Invalid) throw new LinkException("Cannot read " + path + " on the handheld (error " + CeGetLastError() + ")");
            try
            {
                using (MemoryStream ms = new MemoryStream())
                {
                    byte[] buf = new byte[65536];
                    int n;
                    while (CeReadFile(h, buf, buf.Length, out n, IntPtr.Zero) && n > 0) ms.Write(buf, 0, n);
                    return ms.ToArray();
                }
            }
            finally { CeCloseHandle(h); }
        }

        public void WriteFile(string path, byte[] data)
        {
            Need();
            MakeFolders(path.Substring(0, path.LastIndexOf('\\')));
            IntPtr h = CeCreateFile(path, GENERIC_WRITE, 0, IntPtr.Zero, CREATE_ALWAYS, 0x80, IntPtr.Zero);
            if (h == Invalid)
                throw new LinkException("Cannot write " + path + " on the handheld (error " + CeGetLastError() + "). If Kia Motors Handheld is open on it, close the app first.");
            try
            {
                int off = 0;
                while (off < data.Length)
                {
                    int n = Math.Min(65536, data.Length - off), written;
                    byte[] chunk = new byte[n];
                    Buffer.BlockCopy(data, off, chunk, 0, n);
                    if (!CeWriteFile(h, chunk, n, out written, IntPtr.Zero) || written <= 0)
                        throw new LinkException("Writing to the handheld failed (error " + CeGetLastError() + "). Is its storage full?");
                    off += written;
                }
            }
            finally { CeCloseHandle(h); }
        }

        void MakeFolders(string dir)
        {
            if (dir.Length <= 1 || DirectoryExists(dir)) return;
            int cut = dir.LastIndexOf('\\');
            if (cut > 0) MakeFolders(dir.Substring(0, cut));
            CeCreateDirectory(dir, IntPtr.Zero);
        }

        public void DeleteFile(string path)
        {
            Need();
            if (!FileExists(path)) return;
            if (!CeDeleteFile(path)) throw new LinkException("Cannot delete " + path + " on the handheld (error " + CeGetLastError() + ")");
        }
    }
}
