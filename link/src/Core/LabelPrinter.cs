using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace Danamotors.Hhdc.Link
{
    /// <summary>The label printer as the station reports it: READY, PAUSED, PAPER_OUT, HEAD_OPEN or ERROR.</summary>
    public sealed class PrinterState
    {
        public string Model = "";
        public string Status = "";
        public string Detail = "";

        public bool Ready { get { return Status == "READY"; } }

        public Dictionary<string, object> ToJson()
        {
            Dictionary<string, object> d = new Dictionary<string, object>();
            // The server's limits: 80 and 200 characters.
            d["model"] = Model.Length > 80 ? Model.Substring(0, 80) : Model;
            d["status"] = Status;
            if (Detail.Length > 0) d["detail"] = Detail.Length > 200 ? Detail.Substring(0, 200) : Detail;
            return d;
        }

        public string Describe()
        {
            return Model + ": " + Status.Replace('_', ' ').ToLowerInvariant() + (Detail.Length > 0 ? " (" + Detail + ")" : "");
        }
    }

    /// <summary>A barcode label printer on this PC. The real one is ZebraUsbPrinter; tests use a fake.</summary>
    public interface ILabelPrinter
    {
        /// <summary>The printer's state, or null when none is attached.</summary>
        PrinterState Check();
        /// <summary>Sends raw ZPL; a LinkException when the printer cannot take it.</summary>
        void Print(byte[] zpl);
    }

    /// <summary>
    /// Reads a Zebra's answers. ~HS returns three framed lines (STX ... ETX):
    ///   1: aaa,b,c,dddd,eee,f,g,h,iii,j,k,l   b paper out, c paused, j RAM corrupt, k under / l over temperature
    ///   2: mmm,n,o,p,q,r,s,t,uuuuuuuu,v,www    o head up, p ribbon out, q thermal transfer mode
    ///   3: xxxx,y                              password, static RAM
    /// ~HI returns one: model,firmware,dots/mm,memory, e.g. "ZTC S4M-200dpi ZPL,V53.17.11Z,8,2752KB".
    /// </summary>
    public static class ZebraReply
    {
        public static List<string> Frames(string raw)
        {
            List<string> frames = new List<string>();
            int i = 0;
            while ((i = raw.IndexOf('\x02', i)) >= 0)
            {
                int end = raw.IndexOf('\x03', i + 1);
                if (end < 0) break;
                frames.Add(raw.Substring(i + 1, end - i - 1).Trim());
                i = end + 1;
            }
            return frames;
        }

        /// <summary>The state from a ~HI~HS reply; null if the reply is incomplete.</summary>
        public static PrinterState Parse(string raw)
        {
            List<string> frames = Frames(raw);
            string model = "";
            string[] one = null, two = null;
            for (int i = 0; i < frames.Count; i++)
            {
                string[] f = frames[i].Split(',');
                if (f.Length == 4 && f[0].Length > 0 && !char.IsDigit(f[0][0])) model = f[0].Trim();
                // The last complete ~HS wins (an older reply may still sit in the printer's buffer).
                if (f.Length == 12 && i + 1 < frames.Count)
                {
                    string[] next = frames[i + 1].Split(',');
                    if (next.Length == 11) { one = f; two = next; }
                }
            }
            if (one == null) return null;
            PrinterState s = new PrinterState();
            s.Model = model.Length > 0 ? model : "Zebra label printer";
            bool thermalTransfer = two[4] == "1";
            if (two[2] == "1") s.Status = "HEAD_OPEN";
            else if (one[1] == "1") s.Status = "PAPER_OUT";
            else if (thermalTransfer && two[3] == "1") { s.Status = "ERROR"; s.Detail = "ribbon out"; }
            else if (one[2] == "1") s.Status = "PAUSED";
            else if (one[10] == "1" || one[11] == "1") { s.Status = "ERROR"; s.Detail = one[10] == "1" ? "head too cold" : "head too hot"; }
            else if (one[9] == "1") { s.Status = "ERROR"; s.Detail = "memory corrupt"; }
            else s.Status = "READY";
            return s;
        }
    }

    /// <summary>
    /// A Zebra on USB, through the USB printer interface: no Windows print queue, driver or admin rights
    /// needed (proven on the store's ZTC S4M 2026-10-28). Each call opens the port and closes it again,
    /// so unplugging the printer between calls is harmless.
    /// </summary>
    public sealed class ZebraUsbPrinter : ILabelPrinter
    {
        static readonly Guid UsbPrintInterface = new Guid("28d78fad-5a12-11d1-ae5b-0000f803a8c2");
        const string ZebraVendor = "vid_0a5f";

        public PrinterState Check()
        {
            string path = Find();
            if (path == null) return null;
            try
            {
                using (FileStream port = Open(path))
                {
                    PortReader reader = new PortReader(port);
                    // Throw away answers to earlier requests still in the printer's buffer.
                    while (reader.Read(150) != null) { }
                    byte[] ask = Encoding.ASCII.GetBytes("~HI~HS");
                    port.Write(ask, 0, ask.Length);
                    port.Flush();
                    StringBuilder reply = new StringBuilder();
                    DateTime until = DateTime.UtcNow.AddMilliseconds(2500);
                    while (DateTime.UtcNow < until)
                    {
                        string chunk = reader.Read((int)Math.Max(50, (until - DateTime.UtcNow).TotalMilliseconds));
                        if (chunk == null) break;
                        reply.Append(chunk);
                        PrinterState s = ZebraReply.Parse(reply.ToString());
                        if (s != null && ZebraReply.Frames(reply.ToString()).Count >= 4) return s;
                    }
                    PrinterState partial = ZebraReply.Parse(reply.ToString());
                    if (partial != null) return partial;
                    PrinterState silent = new PrinterState();
                    silent.Model = "Zebra label printer";
                    silent.Status = "ERROR";
                    silent.Detail = "no answer to a status request (switched off or busy?)";
                    return silent;
                }
            }
            catch (IOException e) { return Broken(e.Message); }
            catch (LinkException e) { return Broken(e.Message); }
        }

        public void Print(byte[] zpl)
        {
            string path = Find();
            if (path == null) throw new LinkException("The label printer is not connected.");
            try
            {
                using (FileStream port = Open(path))
                {
                    port.Write(zpl, 0, zpl.Length);
                    port.Flush();
                }
            }
            catch (IOException e) { throw new LinkException("The label printer did not take the labels: " + e.Message, e); }
        }

        static PrinterState Broken(string why)
        {
            PrinterState s = new PrinterState();
            s.Model = "Zebra label printer";
            s.Status = "ERROR";
            s.Detail = why.Length > 150 ? why.Substring(0, 150) : why;
            return s;
        }

        /// <summary>
        /// Reads with a time limit, keeping one read outstanding: a read that times out stays pending and
        /// its data comes back on the next call instead of being lost. It dies with the port's handle.
        /// </summary>
        sealed class PortReader
        {
            readonly FileStream port;
            readonly byte[] buf = new byte[4096];
            IAsyncResult pending;

            public PortReader(FileStream port) { this.port = port; }

            /// <summary>What arrives within the time, or null for nothing.</summary>
            public string Read(int ms)
            {
                if (pending == null) pending = port.BeginRead(buf, 0, buf.Length, null, null);
                if (!pending.AsyncWaitHandle.WaitOne(ms)) return null;
                int n = port.EndRead(pending);
                pending = null;
                return n <= 0 ? null : Encoding.ASCII.GetString(buf, 0, n);
            }
        }

        static FileStream Open(string path)
        {
            SafeFileHandle h = CreateFile(path, 0xC0000000, 3, IntPtr.Zero, 3, 0x40000000, IntPtr.Zero);
            if (h.IsInvalid) throw new LinkException("The label printer could not be opened (Windows error " + Marshal.GetLastWin32Error() + ").");
            return new FileStream(h, FileAccess.ReadWrite, 4096, true);
        }

        /// <summary>The first Zebra on a USB printer interface, or null.</summary>
        static string Find()
        {
            Guid g = UsbPrintInterface;
            IntPtr set = SetupDiGetClassDevs(ref g, IntPtr.Zero, IntPtr.Zero, 0x12);
            if (set == new IntPtr(-1)) return null;
            try
            {
                for (int i = 0; ; i++)
                {
                    SP_DEVICE_INTERFACE_DATA d = new SP_DEVICE_INTERFACE_DATA();
                    d.cbSize = Marshal.SizeOf(d);
                    if (!SetupDiEnumDeviceInterfaces(set, IntPtr.Zero, ref g, i, ref d)) return null;
                    int size;
                    SetupDiGetDeviceInterfaceDetail(set, ref d, IntPtr.Zero, 0, out size, IntPtr.Zero);
                    IntPtr buf = Marshal.AllocHGlobal(size);
                    try
                    {
                        Marshal.WriteInt32(buf, IntPtr.Size == 8 ? 8 : 6);
                        if (!SetupDiGetDeviceInterfaceDetail(set, ref d, buf, size, out size, IntPtr.Zero)) continue;
                        string path = Marshal.PtrToStringUni(new IntPtr(buf.ToInt64() + 4));
                        if (path != null && path.ToLowerInvariant().Contains(ZebraVendor)) return path;
                    }
                    finally { Marshal.FreeHGlobal(buf); }
                }
            }
            finally { SetupDiDestroyDeviceInfoList(set); }
        }

        [StructLayout(LayoutKind.Sequential)]
        struct SP_DEVICE_INTERFACE_DATA { public int cbSize; public Guid InterfaceClassGuid; public int Flags; public IntPtr Reserved; }

        [DllImport("setupapi.dll", SetLastError = true)]
        static extern IntPtr SetupDiGetClassDevs(ref Guid classGuid, IntPtr enumerator, IntPtr parent, int flags);
        [DllImport("setupapi.dll", SetLastError = true)]
        static extern bool SetupDiEnumDeviceInterfaces(IntPtr set, IntPtr info, ref Guid classGuid, int index, ref SP_DEVICE_INTERFACE_DATA data);
        [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr set, ref SP_DEVICE_INTERFACE_DATA data, IntPtr detail, int size, out int required, IntPtr info);
        [DllImport("setupapi.dll")]
        static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
    }

    /// <summary>A stand-in printer that writes each job's ZPL to a file in a folder (tests and IT checks without a printer).</summary>
    public sealed class FolderPrinter : ILabelPrinter
    {
        readonly string dir;
        int count;

        public FolderPrinter(string dir)
        {
            this.dir = dir;
            Directory.CreateDirectory(dir);
        }

        public PrinterState Check()
        {
            PrinterState s = new PrinterState();
            s.Model = "Folder printer";
            s.Status = "READY";
            s.Detail = dir;
            return s;
        }

        public void Print(byte[] zpl)
        {
            count++;
            File.WriteAllBytes(Path.Combine(dir, "labels-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + count + ".zpl"), zpl);
        }
    }

    /// <summary>A label job the station took: the ZPL to send as it is.</summary>
    public sealed class PrintJob
    {
        public string Id = "";
        public int LabelCount;
        public string Zpl = "";
    }

    /// <summary>The label-printing endpoints (/handheld/station/prints/*).</summary>
    public interface IPrintApi
    {
        List<PrintJob> ClaimPrints(PrinterState printer);
        string PrintDone(string jobId, bool ok, string error);
    }

    public sealed partial class ApiClient : IPrintApi
    {
        public List<PrintJob> ClaimPrints(PrinterState printer)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["printer"] = printer.ToJson();
            List<PrintJob> jobs = new List<PrintJob>();
            foreach (object j in Json.List(Send("POST", "/handheld/station/prints/claim", body, 30000, true), "data", "jobs"))
            {
                PrintJob job = new PrintJob();
                job.Id = Json.Str(j, "id");
                job.LabelCount = Json.Int(j, "labelCount") ?? 0;
                job.Zpl = Json.Str(j, "zpl");
                jobs.Add(job);
            }
            return jobs;
        }

        public string PrintDone(string jobId, bool ok, string error)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["ok"] = ok;
            if (!ok) body["error"] = error.Length > 500 ? error.Substring(0, 500) : error;
            return Json.Str(Send("POST", "/handheld/station/prints/" + jobId + "/done", body, 30000, true), "data", "status");
        }
    }

    /// <summary>
    /// The station's label printing, one pass per tick: look at the printer, and while it is ready take
    /// the branch's waiting label jobs and print them. A job is printed once only: if the server cannot be
    /// told, the answer is kept and sent again on the next pass, and a job taken again is not reprinted.
    /// </summary>
    public sealed class LabelStation
    {
        readonly IPrintApi api;
        readonly ILabelPrinter printer;
        readonly StationLog log;
        // Job id -> "" (printed) or the error, until the server has the answer.
        readonly Dictionary<string, string> unreported = new Dictionary<string, string>();
        string lastState = "";

        public LabelStation(IPrintApi api, ILabelPrinter printer, StationLog log)
        {
            this.api = api;
            this.printer = printer;
            this.log = log;
        }

        /// <summary>The state at the last pass (null: no printer), for the heartbeat and the tray.</summary>
        public PrinterState Last;

        public int Run()
        {
            PrinterState state = printer.Check();
            Last = state;
            string describe = state == null ? "No label printer attached" : "Label printer " + state.Describe();
            if (describe != lastState) { log.Write(describe); lastState = describe; }

            ReportPending();
            if (state == null || !state.Ready) return 0;

            int printed = 0;
            foreach (PrintJob job in api.ClaimPrints(state))
            {
                if (unreported.ContainsKey(job.Id)) continue; // printed already; only the answer was lost
                string error = "";
                try { printer.Print(new UTF8Encoding(false).GetBytes(job.Zpl)); }
                catch (LinkException e) { error = e.Message; }
                unreported[job.Id] = error;
                if (error.Length == 0) { printed++; log.Write("Printed " + job.LabelCount + " label(s) (job " + job.Id + ")"); }
                else log.Write("Label job " + job.Id + " not printed: " + error);
            }
            ReportPending();
            return printed;
        }

        void ReportPending()
        {
            foreach (string id in new List<string>(unreported.Keys))
            {
                string error = unreported[id];
                try { api.PrintDone(id, error.Length == 0, error); }
                catch (ApiException e)
                {
                    // The server will never take it (another station's lease, a removed job): drop it.
                    if (e.StatusCode >= 500) return;
                    log.Write("Label job " + id + ": " + e.Message);
                }
                unreported.Remove(id);
            }
        }

        public int Unreported { get { return unreported.Count; } }
    }
}
