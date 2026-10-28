using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

namespace Danamotors.Hhdc.Link
{
    /// <summary>A job file on the docked handheld, as the station reports it to the server.</summary>
    public sealed class StationFile
    {
        /// <summary>DOC: picking or MIT document (Id = job id). SHEET: count sheet (Id = sheet id).</summary>
        public string Kind = "";
        public string Id = "";
        public string Stem = "";
        public string Label = "";
        public bool Started;
        public bool Finished;
    }

    /// <summary>The server's answer for one file: COLLECT, REMOVE or KEEP.</summary>
    public sealed class FileOrder
    {
        public string Kind = "";
        public string Id = "";
        public string Action = "";
        public string Reason = "";
    }

    public sealed class HeartbeatReply
    {
        public string DeviceId = "";
        public string DeviceName = "";
        public int Deliver;
        public List<FileOrder> Files = new List<FileOrder>();
    }

    /// <summary>A job the station took for the docked handheld: a document or a count sheet to write.</summary>
    public sealed class StationJob
    {
        public string Id = "";
        public string Type = "";
        public string DocumentNumber = "";
        public HandheldDoc Doc;
        public CountSheet Sheet;
    }

    public sealed class ResultReply
    {
        public string Status = "";
        /// <summary>The server has the result (now or before): the device copy may be deleted.</summary>
        public bool Clear;
        public string Message = "";
    }

    /// <summary>The station endpoints (/handheld/station/*). The real one is ApiClient.ForStation; tests use a fake.</summary>
    public interface IStationApi
    {
        HeartbeatReply Heartbeat(Dictionary<string, object> body);
        List<StationJob> Claim(string deviceId, DateTime nowUtc);
        string Confirm(string jobId, string deviceId);
        void Release(string jobId, string reason);
        ResultReply SubmitResult(string kind, string id, string deviceId, Dictionary<string, object> result);
        void Cleared(string deviceId, List<string> removed, List<string> kept);
    }

    public sealed partial class ApiClient : IStationApi
    {
        public HeartbeatReply Heartbeat(Dictionary<string, object> body)
        {
            object d = Json.At(Send("POST", "/handheld/station/heartbeat", body, 30000, true), "data");
            HeartbeatReply r = new HeartbeatReply();
            r.DeviceId = Json.Str(d, "device", "id");
            r.DeviceName = Json.Str(d, "device", "name");
            r.Deliver = Json.Int(d, "deliver") ?? 0;
            foreach (object f in Json.List(d, "files"))
            {
                FileOrder o = new FileOrder();
                o.Kind = Json.Str(f, "kind");
                o.Id = Json.Str(f, "id");
                o.Action = Json.Str(f, "action");
                o.Reason = Json.Str(f, "reason");
                r.Files.Add(o);
            }
            return r;
        }

        public List<StationJob> Claim(string deviceId, DateTime nowUtc)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["deviceId"] = deviceId;
            List<StationJob> jobs = new List<StationJob>();
            foreach (object j in Json.List(Send("POST", "/handheld/station/deliveries/claim", body, 120000, true), "data", "jobs"))
            {
                StationJob job = new StationJob();
                job.Id = Json.Str(j, "id");
                job.Type = Json.Str(j, "type");
                job.DocumentNumber = Json.Str(j, "documentNumber");
                if (job.Type == "COUNT_SHEET") job.Sheet = SheetFromJson(Json.At(j, "sheet"), "", nowUtc).Sheet;
                else job.Doc = DocFromJson(Json.At(j, "document")).Doc;
                jobs.Add(job);
            }
            return jobs;
        }

        public string Confirm(string jobId, string deviceId)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["deviceId"] = deviceId;
            return Json.Str(Send("POST", "/handheld/station/deliveries/" + jobId + "/confirm", body, 30000, true), "data", "status");
        }

        public void Release(string jobId, string reason)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["reason"] = reason.Length > 500 ? reason.Substring(0, 500) : reason;
            Send("POST", "/handheld/station/deliveries/" + jobId + "/release", body, 30000, true);
        }

        public ResultReply SubmitResult(string kind, string id, string deviceId, Dictionary<string, object> result)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["kind"] = kind;
            body["id"] = id;
            body["deviceId"] = deviceId;
            body["result"] = result;
            object d = Json.At(Send("POST", "/handheld/station/results", body, 300000, true), "data");
            ResultReply r = new ResultReply();
            r.Status = Json.Str(d, "status");
            r.Clear = Json.Bool(d, "clear");
            r.Message = Json.Str(d, "message");
            return r;
        }

        public void Cleared(string deviceId, List<string> removed, List<string> kept)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["removed"] = removed;
            body["kept"] = kept;
            Send("POST", "/handheld/station/devices/" + deviceId + "/cleared", body, 30000, true);
        }
    }

    /// <summary>
    /// Each handheld's id and name, kept in device.txt in the app folder (the two MC3190s look alike). The
    /// server issues both on first contact; the app itself does not read the file.
    /// </summary>
    public static class DeviceIdentity
    {
        public const string FileName = "device.txt";

        public static string[] Read(IDeviceStorage dev, string root)
        {
            string id = "", name = "";
            string path = root + "\\" + FileName;
            if (dev.FileExists(path))
            {
                foreach (string line in new UTF8Encoding(false).GetString(dev.ReadFile(path)).Split('\n'))
                {
                    int eq = line.IndexOf('=');
                    if (eq <= 0) continue;
                    string k = line.Substring(0, eq).Trim(), v = line.Substring(eq + 1).Trim();
                    if (k == "id") id = v;
                    else if (k == "name") name = v;
                }
            }
            return new string[] { id, name };
        }

        public static void Write(IDeviceStorage dev, string root, string id, string name)
        {
            dev.WriteFile(root + "\\" + FileName, new UTF8Encoding(false).GetBytes("id=" + id + "\r\nname=" + name + "\r\n"));
        }
    }

    /// <summary>The daily station log (kept 30 days), and the last lines for the IT window.</summary>
    public sealed class StationLog
    {
        readonly string dir;
        readonly Clock clock;
        readonly List<string> recent = new List<string>();
        readonly object gate = new object();

        public StationLog(string dir, Clock clock)
        {
            this.dir = dir;
            this.clock = clock;
            if (dir.Length == 0) return;
            Directory.CreateDirectory(dir);
            foreach (string f in Directory.GetFiles(dir, "station-*.log"))
                if (File.GetLastWriteTimeUtc(f) < clock().ToUniversalTime().AddDays(-30)) { try { File.Delete(f); } catch (IOException) { } }
        }

        /// <summary>Also print each line (the CLI's "station run").</summary>
        public bool Echo;

        public void Write(string text)
        {
            DateTime now = clock().ToLocalTime();
            string line = now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + text;
            if (Echo) Console.WriteLine(line);
            lock (gate)
            {
                recent.Add(line);
                if (recent.Count > 50) recent.RemoveAt(0);
                if (dir.Length == 0) return;
                try { File.AppendAllText(Path.Combine(dir, "station-" + now.ToString("yyyyMMdd") + ".log"), line + "\r\n", new UTF8Encoding(false)); }
                catch (IOException) { }
            }
        }

        public List<string> Recent()
        {
            lock (gate) return new List<string>(recent);
        }
    }

    /// <summary>What one pass with a docked handheld did, for the log and the tray.</summary>
    public sealed class StationReport
    {
        public string DeviceName = "";
        public int Delivered, Collected, Removed, Kept;
        public string AppStatus = "";
        public List<string> Problems = new List<string>();

        public string Describe()
        {
            string s = "Handheld " + DeviceName + " docked";
            if (Delivered + Collected + Removed > 0) s += ": " + Delivered + " delivered, " + Collected + " collected, " + Removed + " removed";
            if (Problems.Count > 0) s += " (" + Problems.Count + " problem(s))";
            return s;
        }
    }

    /// <summary>
    /// One station pass while a handheld is docked (the store never touches HHDC Link):
    /// identify the handheld, keep its app current, report its job files, then do what the server says:
    /// collect finished results, remove untouched cancelled jobs, and write the branch's waiting jobs.
    /// Device files with entries are never overwritten, and results are deleted only when the server has them.
    /// </summary>
    public sealed class StationCycle
    {
        readonly IStationApi api;
        readonly IDeviceStorage dev;
        readonly Clock clock;
        readonly StationLog log;
        readonly string root;

        public StationCycle(IStationApi api, IDeviceStorage dev, Clock clock, StationLog log)
        {
            this.api = api;
            this.dev = dev;
            this.clock = clock;
            this.log = log;
            root = DeviceLayout.ResolveRoot(delegate(string p) { return dev.DirectoryExists(p); });
        }

        /// <summary>The bundled device app to install when the handheld's copy differs; null = do not check.</summary>
        public byte[] BundledApp;

        public StationReport Run(string linkVersion)
        {
            StationReport report = new StationReport();
            string[] identity = DeviceIdentity.Read(dev, root);
            string appError = "";
            report.AppStatus = BundledApp == null ? "" : EnsureApp(out appError);
            List<StationFile> files = ListFiles();

            Dictionary<string, object> docked = new Dictionary<string, object>();
            if (identity[0].Length > 0) docked["deviceId"] = identity[0];
            string appVersion = AppVersion();
            if (appVersion.Length > 0) docked["appVersion"] = appVersion;
            if (report.AppStatus.Length > 0) docked["appStatus"] = report.AppStatus;
            if (appError.Length > 0) docked["appError"] = appError;
            List<Dictionary<string, object>> listed = new List<Dictionary<string, object>>();
            foreach (StationFile f in files)
            {
                Dictionary<string, object> x = new Dictionary<string, object>();
                x["kind"] = f.Kind;
                x["id"] = f.Id;
                x["started"] = f.Started;
                x["finished"] = f.Finished;
                listed.Add(x);
            }
            docked["files"] = listed;
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["linkVersion"] = linkVersion;
            body["docked"] = docked;
            HeartbeatReply reply = api.Heartbeat(body);
            if (reply.DeviceId.Length == 0) throw new LinkException("The server did not identify the handheld.");
            if (reply.DeviceId != identity[0] || reply.DeviceName != identity[1])
            {
                DeviceIdentity.Write(dev, root, reply.DeviceId, reply.DeviceName);
                log.Write("Handheld named " + reply.DeviceName + " (" + reply.DeviceId + ")");
            }
            report.DeviceName = reply.DeviceName;

            List<string> removed = new List<string>();
            foreach (FileOrder order in reply.Files)
            {
                StationFile f = Find(files, order);
                if (f == null) continue;
                try
                {
                    if (order.Action == "COLLECT") { if (Collect(f, reply.DeviceId, report)) report.Collected++; }
                    else if (order.Action == "REMOVE")
                    {
                        Clear(f);
                        report.Removed++;
                        if (f.Kind == "DOC") removed.Add(f.Id);
                        log.Write(f.Label + ": removed from " + reply.DeviceName + " (cancelled or closed, never started)");
                    }
                    else report.Kept++;
                }
                catch (LinkException e)
                {
                    report.Problems.Add(f.Label + ": " + e.Message);
                    log.Write(f.Label + ": " + e.Message);
                }
            }
            if (removed.Count > 0) api.Cleared(reply.DeviceId, removed, new List<string>());

            if (reply.Deliver > 0) Deliver(reply.DeviceId, report);
            return report;
        }

        /// <summary>The job files on the handheld (documents and count sheets) and how far each has got.</summary>
        public List<StationFile> ListFiles()
        {
            List<StationFile> files = new List<StationFile>();
            foreach (DeviceDoc d in new DeviceDocs(dev).List())
            {
                if (d.Doc == null || d.Doc.DocumentId.Length == 0) continue;
                StationFile f = new StationFile();
                f.Kind = "DOC";
                f.Id = d.Doc.DocumentId;
                f.Stem = d.Stem;
                f.Label = DocTypes.Short(d.Doc.Type) + " " + d.Doc.Reference + " (job " + d.Doc.DocumentNumber + ")";
                f.Finished = d.Finished;
                f.Started = d.Finished || d.State.Lines.Count > 0 || d.State.Extras.Count > 0;
                files.Add(f);
            }
            foreach (DeviceSheet s in new DeviceSheets(dev).List())
            {
                if (s.Sheet == null || s.Sheet.SheetId.Length == 0) continue;
                StationFile f = new StationFile();
                f.Kind = "SHEET";
                f.Id = s.Sheet.SheetId;
                f.Stem = s.Stem;
                f.Label = "Sheet " + s.Sheet.SheetNumber;
                f.Finished = s.Finished;
                f.Started = s.Finished || s.State.Entries.Count > 0;
                files.Add(f);
            }
            return files;
        }

        static StationFile Find(List<StationFile> files, FileOrder order)
        {
            foreach (StationFile f in files) if (f.Kind == order.Kind && string.Equals(f.Id, order.Id, StringComparison.OrdinalIgnoreCase)) return f;
            return null;
        }

        /// <summary>Send a finished result. The device copy is deleted only when the server says it has it.</summary>
        bool Collect(StationFile f, string deviceId, StationReport report)
        {
            Dictionary<string, object> result = new Dictionary<string, object>();
            if (f.Kind == "DOC")
            {
                DeviceDoc d = new DeviceDocs(dev).Read(f.Stem);
                if (d.Error.Length > 0) throw new LinkException("cannot be read on the handheld: " + d.Error);
                if (!d.Finished) return false;
                result = DocUploadBuilder.Build(d.Doc, d.State);
                // The store chooses the reason for unreported lines when posting on the web.
                result.Remove("unreportedReason");
            }
            else
            {
                DeviceSheet s = new DeviceSheets(dev).Read(f.Stem);
                if (s.Error.Length > 0) throw new LinkException("cannot be read on the handheld: " + s.Error);
                if (!s.Finished) return false;
                result["entries"] = UploadBuilder.Build(s.Sheet, s.State, clock().ToUniversalTime());
            }
            ResultReply r;
            try { r = api.SubmitResult(f.Kind, f.Id, deviceId, result); }
            catch (ApiException e)
            {
                if (e.StatusCode >= 500) throw;
                throw new LinkException("the server refused the result, so it was kept on the handheld: " + e.Message);
            }
            if (!r.Clear)
            {
                log.Write(f.Label + ": kept on the handheld (" + r.Status.ToLowerInvariant() + (r.Message.Length > 0 ? ": " + r.Message : "") + ")");
                return false;
            }
            Clear(f);
            log.Write(f.Label + ": result collected (" + r.Status.ToLowerInvariant() + ") and removed from the handheld");
            return true;
        }

        void Clear(StationFile f)
        {
            if (f.Kind == "DOC") new DeviceDocs(dev).Clear(f.Stem);
            else new DeviceSheets(dev).Clear(f.Stem);
        }

        /// <summary>Take the branch's waiting jobs, write each, read it back, then confirm (or release it to the queue).</summary>
        void Deliver(string deviceId, StationReport report)
        {
            DateTime now = clock().ToUniversalTime();
            foreach (StationJob job in api.Claim(deviceId, now))
            {
                string label = (job.Sheet != null ? "Sheet " + job.Sheet.SheetNumber : DocTypes.Short(job.Type) + " " + job.Doc.Reference) + " (job " + job.DocumentNumber + ")";
                try
                {
                    if (job.Sheet != null) new DeviceSheets(dev).Send(job.Sheet, now);
                    else
                    {
                        job.Doc.SentAtUtc = now;
                        new DeviceDocs(dev).Write(job.Doc);
                    }
                }
                catch (LinkException e)
                {
                    report.Problems.Add(label + ": " + e.Message);
                    log.Write(label + ": not delivered, back to the queue: " + e.Message);
                    api.Release(job.Id, e.Message);
                    continue;
                }
                string status = api.Confirm(job.Id, deviceId);
                if (status == "SENT")
                {
                    report.Delivered++;
                    log.Write(label + ": delivered to " + report.DeviceName);
                }
                else
                {
                    // Cancelled while it was being written: nothing was entered, so it goes.
                    if (job.Sheet != null) new DeviceSheets(dev).Clear(job.Sheet.FileStem);
                    else new DeviceDocs(dev).Clear(job.Doc.FileStem);
                    log.Write(label + ": " + status.ToLowerInvariant() + " meanwhile; removed again");
                }
            }
        }

        /// <summary>Installs the bundled app when the handheld's copy is missing or differs. OK, UPDATED or INSTALL_FAILED.</summary>
        string EnsureApp(out string error)
        {
            error = "";
            string target = root + "\\" + DeviceLayout.AppFileName;
            if (dev.FileExists(target) && Hash(dev.ReadFile(target)) == Hash(BundledApp)) return "OK";
            try
            {
                log.Write(new DeviceSheets(dev).InstallApp(BundledApp));
                return "UPDATED";
            }
            catch (Exception e)
            {
                // Most often the app is open on the handheld (its exe is locked); tried again at the next dock.
                if (!(e is LinkException) && !(e is IOException) && !(e is UnauthorizedAccessException)) throw;
                error = e.Message;
                log.Write("App not installed on the handheld: " + e.Message);
                return "INSTALL_FAILED";
            }
        }

        /// <summary>The handheld app's version: the first characters of its file hash ("" if missing).</summary>
        string AppVersion()
        {
            string target = root + "\\" + DeviceLayout.AppFileName;
            return dev.FileExists(target) ? "sha-" + Hash(dev.ReadFile(target)).Substring(0, 8) : "";
        }

        public static string Hash(byte[] data)
        {
            using (SHA256 sha = SHA256.Create())
            {
                StringBuilder sb = new StringBuilder();
                foreach (byte b in sha.ComputeHash(data)) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }
    }

    public delegate IDeviceStorage DeviceOpener();

    /// <summary>
    /// The station loop: every few seconds, look for a docked handheld. Heartbeat every 20 s; while a
    /// handheld is docked, a full pass at once and then every 20 s. Runs on its own thread (tray or CLI).
    /// </summary>
    public sealed class StationRunner
    {
        public const int PollMs = 5000;
        public const int HeartbeatMs = 20000;

        readonly IStationApi api;
        readonly DeviceOpener openDevice;
        readonly Clock clock;
        readonly StationLog log;
        readonly string linkVersion;
        readonly byte[] bundledApp;
        readonly ManualResetEvent stop = new ManualResetEvent(false);
        bool wasDocked;
        bool installTried;
        DateTime lastBeat = DateTime.MinValue;
        string status = "Starting";
        string lastProblem = "";

        public StationRunner(IStationApi api, DeviceOpener openDevice, Clock clock, StationLog log, string linkVersion, byte[] bundledApp)
        {
            this.api = api;
            this.openDevice = openDevice;
            this.clock = clock;
            this.log = log;
            this.linkVersion = linkVersion;
            this.bundledApp = bundledApp;
        }

        public string Status { get { lock (stop) return status; } }
        public string LastProblem { get { lock (stop) return lastProblem; } }

        void Set(string s, string problem)
        {
            lock (stop) { status = s; if (problem != null) lastProblem = problem; }
        }

        public void Run()
        {
            log.Write("Station started (HHDC Link " + linkVersion + ")");
            while (!stop.WaitOne(0))
            {
                try { Tick(); }
                catch (Exception e)
                {
                    // Never let the station die quietly: log it and look again at the next tick.
                    log.Write("Unexpected problem: " + e);
                    Set("Problem: " + e.Message, e.Message);
                }
                stop.WaitOne(PollMs);
            }
            log.Write("Station stopped");
        }

        public void Stop() { stop.Set(); }

        /// <summary>One look at the cradle; public for the CLI's "station once" and tests.</summary>
        public void Tick()
        {
            DateTime now = clock().ToUniversalTime();
            try
            {
                using (IDeviceStorage dev = openDevice())
                {
                    bool docked = false;
                    try { dev.Connect(); docked = true; }
                    catch (DeviceNotFoundException) { }

                    bool changed = docked != wasDocked;
                    if (changed) log.Write(docked ? "Handheld docked" : "Handheld undocked");
                    wasDocked = docked;
                    if (!changed && (now - lastBeat).TotalMilliseconds < HeartbeatMs) return;
                    lastBeat = now;

                    if (docked)
                    {
                        StationCycle cycle = new StationCycle(api, dev, clock, log);
                        // The app is checked once per dock (a locked exe is tried again at the next dock).
                        cycle.BundledApp = installTried ? null : bundledApp;
                        installTried = true;
                        StationReport r = cycle.Run(linkVersion);
                        Set(r.Describe(), r.Problems.Count > 0 ? r.Problems[0] : null);
                        return;
                    }
                    installTried = false;
                    Dictionary<string, object> body = new Dictionary<string, object>();
                    body["linkVersion"] = linkVersion;
                    body["docked"] = null;
                    api.Heartbeat(body);
                    Set("Online, no handheld docked", null);
                }
            }
            catch (LinkException e)
            {
                // Server unreachable, key refused, device dropped mid-transfer: logged, tried again at the next heartbeat.
                if (e.Message != LastProblem) log.Write("Problem: " + e.Message);
                Set("Problem: " + e.Message, e.Message);
            }
        }
    }
}
