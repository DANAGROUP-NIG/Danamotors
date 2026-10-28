using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Danamotors.Hhdc;
using Danamotors.Hhdc.Link;

/// <summary>A stand-in for the server's /handheld/station endpoints.</summary>
public sealed class FakeStationApi : IStationApi
{
    public string DeviceId = "dev-1";
    public string DeviceName = "MC3190-1";
    public int Deliver;
    public List<StationJob> Jobs = new List<StationJob>();
    public Dictionary<string, string> Actions = new Dictionary<string, string>();
    public string ConfirmStatus = "SENT";
    public ResultReply Reply = new ResultReply { Status = "RECEIVED", Clear = true };
    public Exception SubmitFails;

    public List<Dictionary<string, object>> Heartbeats = new List<Dictionary<string, object>>();
    public List<string> Confirmed = new List<string>();
    public List<string> Released = new List<string>();
    public List<string> ClearedIds = new List<string>();
    public List<Dictionary<string, object>> Results = new List<Dictionary<string, object>>();

    public HeartbeatReply Heartbeat(Dictionary<string, object> body)
    {
        Heartbeats.Add(body);
        HeartbeatReply r = new HeartbeatReply();
        if (body["docked"] == null) return r;
        r.DeviceId = DeviceId;
        r.DeviceName = DeviceName;
        r.Deliver = Deliver;
        foreach (Dictionary<string, object> f in (List<Dictionary<string, object>>)((Dictionary<string, object>)body["docked"])["files"])
        {
            string id = (string)f["id"];
            r.Files.Add(new FileOrder { Kind = (string)f["kind"], Id = id, Action = Actions.ContainsKey(id) ? Actions[id] : "KEEP" });
        }
        return r;
    }

    public List<StationJob> Claim(string deviceId, DateTime nowUtc) { List<StationJob> j = Jobs; Jobs = new List<StationJob>(); return j; }
    public string Confirm(string jobId, string deviceId) { Confirmed.Add(jobId); return ConfirmStatus; }
    public void Release(string jobId, string reason) { Released.Add(jobId + ": " + reason); }

    public ResultReply SubmitResult(string kind, string id, string deviceId, Dictionary<string, object> result)
    {
        if (SubmitFails != null) throw SubmitFails;
        Dictionary<string, object> r = new Dictionary<string, object>(result);
        r["_kind"] = kind; r["_id"] = id;
        Results.Add(r);
        return Reply;
    }

    public void Cleared(string deviceId, List<string> removed, List<string> kept) { ClearedIds.AddRange(removed); }
}

public static class StationTests
{
    static DateTime now = new DateTime(2026, 10, 28, 9, 0, 0, DateTimeKind.Utc);
    const string Root = "\\Application\\Danamotors";

    sealed class Rig
    {
        public string Folder = DeviceTests.Temp();
        public FolderDevice Device;
        public FakeStationApi Api = new FakeStationApi();
        public StationLog Log;

        public Rig()
        {
            Directory.CreateDirectory(Path.Combine(Folder, "Application"));
            Device = new FolderDevice(Folder);
            Log = new StationLog("", delegate { return now; });
        }

        public StationReport Run() { return Run(null); }

        public StationReport Run(byte[] app)
        {
            StationCycle c = new StationCycle(Api, Device, delegate { return now; }, Log);
            c.BundledApp = app;
            return c.Run("test");
        }

        public void Put(string path, string text) { Device.WriteFile(path, new UTF8Encoding(false).GetBytes(text)); }
        public bool Has(string path) { return Device.FileExists(path); }

        public void PutDoc(HandheldDoc d, params string[] log)
        {
            Put(DeviceLayout.DocPath(Root, d.FileStem), d.Serialize());
            if (log.Length > 0) Put(DeviceLayout.PicksPath(Root, d.FileStem), string.Join("\n", log) + "\n");
        }

        public void PutSheet(CountSheet s, params string[] log)
        {
            Put(DeviceLayout.SheetPath(Root, s.FileStem), s.Serialize());
            if (log.Length > 0) Put(DeviceLayout.CountsPath(Root, s.FileStem), string.Join("\n", log) + "\n");
        }
    }

    static string Picked(string lineId, int qty, string reason)
    {
        return PickLog.Line(new LineResult { LineId = lineId, Quantity = qty, Reason = reason, AtUtc = new DateTime(2009, 1, 1, 0, 0, 0, DateTimeKind.Utc) });
    }

    static Dictionary<string, object> Docked(FakeStationApi api, int i) { return (Dictionary<string, object>)api.Heartbeats[i]["docked"]; }

    public static void TestNamesANewHandheldAndRemembersIt()
    {
        Rig r = new Rig();
        StationReport rep = r.Run();
        Check.Equal("MC3190-1", rep.DeviceName, "name from the server");
        Check.True(!Docked(r.Api, 0).ContainsKey("deviceId"), "a new handheld has no id yet");
        string[] id = DeviceIdentity.Read(r.Device, Root);
        Check.Equal("dev-1", id[0], "id written to device.txt");
        Check.Equal("MC3190-1", id[1], "name written to device.txt");
        r.Run();
        Check.Equal("dev-1", (string)Docked(r.Api, 1)["deviceId"], "the id is sent next time");
    }

    public static void TestDeliversAQueuedDocumentAndConfirmsIt()
    {
        Rig r = new Rig();
        r.Api.Deliver = 1;
        r.Api.Jobs.Add(new StationJob { Id = "doc-1", Type = DocTypes.IndentPick, DocumentNumber = "2026000001", Doc = DocTests.Indent() });
        StationReport rep = r.Run();
        Check.Equal(1, rep.Delivered, "delivered");
        Check.True(r.Has(DeviceLayout.DocPath(Root, "D2026000001")), "document on the device");
        Check.Equal("doc-1", r.Api.Confirmed[0], "confirmed after reading it back");
        Check.Equal(now, HandheldDoc.Parse(new UTF8Encoding(false).GetString(r.Device.ReadFile(DeviceLayout.DocPath(Root, "D2026000001")))).SentAtUtc, "PC time of delivery");
    }

    public static void TestNeverOverwritesADocumentWithEntries()
    {
        Rig r = new Rig();
        HandheldDoc doc = DocTests.Indent();
        r.PutDoc(doc, Picked("l2", 7, "LESS_IN_BIN"));
        r.Api.Deliver = 1;
        r.Api.Jobs.Add(new StationJob { Id = "doc-1", Type = DocTypes.IndentPick, DocumentNumber = doc.DocumentNumber, Doc = DocTests.Indent() });
        StationReport rep = r.Run();
        Check.Equal(0, rep.Delivered, "not delivered");
        Check.Equal(1, r.Api.Released.Count, "released back to the queue");
        Check.True(r.Api.Released[0].Contains("already on the device with results"), "with the reason");
        Check.Equal(0, r.Api.Confirmed.Count, "not confirmed");
        Check.True(r.Has(DeviceLayout.PicksPath(Root, doc.FileStem)), "the picker's entries are still there");
    }

    public static void TestRemovesAJobCancelledWhileItWasWritten()
    {
        Rig r = new Rig();
        r.Api.Deliver = 1;
        r.Api.ConfirmStatus = "CANCELLED";
        r.Api.Jobs.Add(new StationJob { Id = "doc-1", Type = DocTypes.IndentPick, DocumentNumber = "2026000001", Doc = DocTests.Indent() });
        r.Run();
        Check.True(!r.Has(DeviceLayout.DocPath(Root, "D2026000001")), "removed again");
    }

    public static void TestReportsStartedAndFinishedFiles()
    {
        Rig r = new Rig();
        HandheldDoc a = DocTests.Indent();
        HandheldDoc b = DocTests.Mit();
        r.PutDoc(a);
        r.PutDoc(b, Picked("m1", 1, ""));
        CountSheet s = SharedTests.Sample(false);
        r.PutSheet(s, CountLog.Finish(now));
        r.Run();
        List<Dictionary<string, object>> files = (List<Dictionary<string, object>>)Docked(r.Api, 0)["files"];
        Check.Equal(3, files.Count, "two documents and a sheet");
        Check.Equal("doc-1|False|False", files[0]["id"] + "|" + files[0]["started"] + "|" + files[0]["finished"], "untouched");
        Check.Equal("doc-2|True|False", files[1]["id"] + "|" + files[1]["started"] + "|" + files[1]["finished"], "in progress");
        Check.Equal("SHEET|sheet-1|True", files[2]["kind"] + "|" + files[2]["id"] + "|" + files[2]["finished"], "finished sheet");
    }

    public static void TestCollectsAFinishedDocumentAndClearsItOnlyWhenTheServerHasIt()
    {
        Rig r = new Rig();
        HandheldDoc doc = DocTests.Indent();
        r.PutDoc(doc, Picked("l2", 7, "LESS_IN_BIN"), PickLog.Finish(now));
        r.Api.Actions["doc-1"] = "COLLECT";
        r.Api.Reply = new ResultReply { Status = "CANCELLED", Clear = false, Message = "Cancelled: Dispatched on STN" };
        StationReport rep = r.Run();
        Check.Equal(0, rep.Collected, "not counted as collected");
        Check.True(r.Has(DeviceLayout.PicksPath(Root, doc.FileStem)), "kept: the server does not have it");

        r.Api.Reply = new ResultReply { Status = "RECEIVED", Clear = true };
        rep = r.Run();
        Check.Equal(1, rep.Collected, "collected");
        Dictionary<string, object> sent = r.Api.Results[1];
        Check.Equal("DOC|doc-1", sent["_kind"] + "|" + sent["_id"], "by job id");
        Check.True(!sent.ContainsKey("unreportedReason"), "the store chooses the reason for unreported lines on the web");
        Check.Equal(1, ((List<Dictionary<string, object>>)sent["lines"]).Count, "the line the picker saved");
        Check.True(!r.Has(DeviceLayout.DocPath(Root, doc.FileStem)) && !r.Has(DeviceLayout.PicksPath(Root, doc.FileStem)), "removed from the device");
    }

    public static void TestKeepsTheResultWhenTheServerRefusesIt()
    {
        Rig r = new Rig();
        HandheldDoc doc = DocTests.Indent();
        r.PutDoc(doc, Picked("l1", 1, ""), PickLog.Finish(now));
        r.Api.Actions["doc-1"] = "COLLECT";
        r.Api.SubmitFails = new ApiException(409, "A different result was already received for this job");
        StationReport rep = r.Run();
        Check.Equal(1, rep.Problems.Count, "a problem is reported");
        Check.True(r.Has(DeviceLayout.PicksPath(Root, doc.FileStem)), "the device copy is kept");
    }

    public static void TestAServerErrorKeepsTheResultForTheNextPass()
    {
        Rig r = new Rig();
        HandheldDoc doc = DocTests.Indent();
        r.PutDoc(doc, Picked("l1", 1, ""), PickLog.Finish(now));
        r.Api.Actions["doc-1"] = "COLLECT";
        r.Api.SubmitFails = new ApiException(502, "Bad gateway");
        StationReport rep = r.Run();
        Check.Equal(1, rep.Problems.Count, "reported");
        Check.True(r.Has(DeviceLayout.PicksPath(Root, doc.FileStem)), "the device copy is kept");
        r.Api.SubmitFails = null;
        Check.Equal(1, r.Run().Collected, "collected at the next pass");
    }

    public static void TestRemovesOnlyWhatTheServerSays()
    {
        Rig r = new Rig();
        HandheldDoc gone = DocTests.Indent();
        HandheldDoc busy = DocTests.Mit();
        r.PutDoc(gone);
        r.PutDoc(busy, Picked("m1", 1, ""));
        r.Api.Actions["doc-1"] = "REMOVE";
        StationReport rep = r.Run();
        Check.Equal(1, rep.Removed, "one removed");
        Check.True(!r.Has(DeviceLayout.DocPath(Root, gone.FileStem)), "the untouched cancelled job is gone");
        Check.True(r.Has(DeviceLayout.PicksPath(Root, busy.FileStem)), "the one in progress stays");
        Check.Equal("doc-1", r.Api.ClearedIds[0], "the server is told");
    }

    public static void TestCollectsACountSheetAsUploadEntries()
    {
        Rig r = new Rig();
        CountSheet s = SharedTests.Sample(false);
        CountEntry e = new CountEntry { Id = 1, Bin = "N-3A1", PartNumber = "1864421058N", Quantity = 55, AtUtc = new DateTime(2009, 1, 1, 0, 0, 0, DateTimeKind.Utc) };
        r.PutSheet(s, CountLog.Entry(e, false), CountLog.Finish(now));
        r.Api.Actions["sheet-1"] = "COLLECT";
        StationReport rep = r.Run();
        Check.Equal(1, rep.Collected, "collected");
        List<Dictionary<string, object>> entries = (List<Dictionary<string, object>>)r.Api.Results[0]["entries"];
        Check.Equal("SHEET|sheet-1", r.Api.Results[0]["_kind"] + "|" + r.Api.Results[0]["_id"], "by sheet id");
        Check.Equal(55, (int)entries[0]["quantity"], "the count");
        Check.Equal(Iso.Utc(now), (string)entries[0]["countedAt"], "the 2009 device clock is replaced by the PC time");
        Check.True(!r.Has(DeviceLayout.SheetPath(Root, s.FileStem)), "removed from the device");
    }

    public static void TestInstallsTheAppOnlyWhenItDiffers()
    {
        Rig r = new Rig();
        byte[] app = Encoding.ASCII.GetBytes("app v2");
        StationReport rep = r.Run(app);
        Check.Equal("UPDATED", rep.AppStatus, "installed");
        Check.Equal("UPDATED", (string)Docked(r.Api, 0)["appStatus"], "reported");
        Check.True(((string)Docked(r.Api, 0)["appVersion"]).StartsWith("sha-"), "version reported");
        Check.Equal("OK", r.Run(app).AppStatus, "same app: left alone");
    }

    public static void TestRunnerHeartbeatsWithoutAHandheldAndPassesWhenOneDocks()
    {
        Rig r = new Rig();
        string missing = Path.Combine(DeviceTests.Temp(), "not-docked");
        string folder = missing;
        DateTime t = now;
        StationRunner runner = new StationRunner(r.Api, delegate { return new FolderDevice(folder); }, delegate { return t; }, r.Log, "test", null);
        runner.Tick();
        Check.True(r.Api.Heartbeats[0]["docked"] == null, "online, nothing docked");
        Check.Equal("Online, no handheld docked", runner.Status, "status");
        runner.Tick();
        Check.Equal(1, r.Api.Heartbeats.Count, "no second heartbeat within 20 s");
        folder = r.Folder;
        runner.Tick();
        Check.Equal(2, r.Api.Heartbeats.Count, "a pass at once when a handheld docks");
        Check.True(runner.Status.StartsWith("Handheld MC3190-1 docked"), "status names the handheld (" + runner.Status + ")");
        t = t.AddSeconds(25);
        runner.Tick();
        Check.Equal(3, r.Api.Heartbeats.Count, "another pass after 20 s");
        folder = missing;
        runner.Tick();
        Check.Equal(4, r.Api.Heartbeats.Count, "undocking is reported at once");
        Check.True(r.Api.Heartbeats[3]["docked"] == null, "nothing docked");
    }

    public static void TestRunnerKeepsGoingWhenTheServerIsDown()
    {
        Rig r = new Rig();
        DateTime t = now;
        StationRunner runner = new StationRunner(new DownApi(), delegate { return new FolderDevice(r.Folder); }, delegate { return t; }, r.Log, "test", null);
        runner.Tick();
        Check.True(runner.Status.StartsWith("Problem: Cannot reach"), "the problem is shown (" + runner.Status + ")");
    }

    sealed class DownApi : IStationApi
    {
        public HeartbeatReply Heartbeat(Dictionary<string, object> body) { throw new LinkException("Cannot reach the server"); }
        public List<StationJob> Claim(string deviceId, DateTime nowUtc) { throw new NotSupportedException(); }
        public string Confirm(string jobId, string deviceId) { throw new NotSupportedException(); }
        public void Release(string jobId, string reason) { throw new NotSupportedException(); }
        public ResultReply SubmitResult(string kind, string id, string deviceId, Dictionary<string, object> result) { throw new NotSupportedException(); }
        public void Cleared(string deviceId, List<string> removed, List<string> kept) { throw new NotSupportedException(); }
    }
}
