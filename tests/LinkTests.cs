using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Danamotors.Hhdc;
using Danamotors.Hhdc.Device;
using Danamotors.Hhdc.Link;

/// <summary>A stand-in for the Danamotors server.</summary>
public sealed class FakeApi : IStockTakeApi
{
    public bool Uploaded, Cancelled, TakeClosed;
    public int UploadCalls;
    public string LastUncounted;
    public List<Dictionary<string, object>> LastEntries;
    public Exception UploadFails;
    public bool UploadAppliesThenFails; // the server records the counts but the answer is lost

    public string UserName { get { return "Test User"; } }
    public List<WorkItem> ListOpenSheets(bool all) { return new List<WorkItem>(); }

    public FetchedSheet GetSheet(string takeId, string sheetId, DateTime nowUtc)
    {
        FetchedSheet f = new FetchedSheet();
        f.Sheet = SharedTests.Sample(true);
        f.Sheet.SentAtUtc = nowUtc;
        f.Uploaded = Uploaded;
        f.Closed = Uploaded || Cancelled || TakeClosed;
        f.ClosedReason = Uploaded ? "was already uploaded" : Cancelled ? "was cancelled" : TakeClosed ? "belongs to a stock taking that is completed" : "";
        return f;
    }

    public void Upload(string takeId, string sheetId, string uncounted, List<Dictionary<string, object>> entries)
    {
        UploadCalls++;
        if (UploadAppliesThenFails) { Uploaded = true; throw new LinkException("connection lost"); }
        if (UploadFails != null) throw UploadFails;
        Uploaded = true;
        LastUncounted = uncounted;
        LastEntries = entries;
    }
}

public static class LinkTests
{
    static DateTime now = new DateTime(2026, 10, 17, 12, 0, 0, DateTimeKind.Utc);
    static DateTime Now() { return now; }

    sealed class Rig
    {
        public string Root = DeviceTests.Temp();
        public string Data = DeviceTests.Temp();
        public FakeApi Api = new FakeApi();
        public FolderDevice Device;
        public UploadLedger Ledger;
        public LinkService Service;
        public DeviceSheets Sheets;

        public Rig()
        {
            Directory.CreateDirectory(Path.Combine(Root, "Application"));
            Device = new FolderDevice(Root);
            Ledger = new UploadLedger(Path.Combine(Data, "uploads.log"));
            Service = new LinkService(Api, Device, Ledger, Now);
            Sheets = new DeviceSheets(Device);
        }

        public WorkItem Item()
        {
            WorkItem w = new WorkItem();
            w.StockTakeId = "take-1"; w.SheetId = "sheet-1"; w.SheetNumber = "SHT-000001";
            return w;
        }

        /// <summary>Send the sheet, count some on the "device", and optionally finish.</summary>
        public DeviceSheet CountAndFinish(bool finish)
        {
            Service.Send(Item());
            DeviceSheet d = Sheets.List()[0];
            CountSession s = new CountSession(d.Sheet, new CountStore(Path.Combine(Root, "Application", "Danamotors", "sheets", d.Stem + ".counts")), delegate { return new DateTime(2009, 1, 1, 0, 0, 0, DateTimeKind.Utc); });
            s.Add("N-3A1", s.Lookup("1864421058N"), 18, 1, "Box torn");
            s.Add("QSB", s.Lookup("1864421058N"), 2, 0, "");
            s.Add("QSB", s.Lookup("ZZ-9"), 4, 0, "");
            if (finish) s.Finish();
            return Sheets.List()[0];
        }
    }

    // ── Sending ──

    public static void TestSendWritesSheetWithPcTime()
    {
        Rig r = new Rig();
        r.Service.Send(r.Item());
        List<DeviceSheet> list = r.Sheets.List();
        Check.Equal(1, list.Count, "one sheet on the device");
        Check.Equal(now, list[0].Sheet.SentAtUtc, "the PC's time is on the sheet");
        Check.Equal(3, list[0].Sheet.Lines.Count, "lines");
        Check.True(File.Exists(Path.Combine(r.Root, "Application", "Danamotors", "sheets", "SHT-000001.sheet")), "in the persistent folder");
    }

    public static void TestSendRefusesToOverwriteCounts()
    {
        Rig r = new Rig();
        r.CountAndFinish(false);
        LinkException e = null;
        try { r.Service.Send(r.Item()); } catch (LinkException x) { e = x; }
        Check.True(e != null && e.Message.Contains("already on the device"), "refused with a clear message");
        Check.Equal(3, r.Sheets.List()[0].State.Entries.Count, "counts untouched");
    }

    public static void TestSendRefusesClosedSheet()
    {
        Rig r = new Rig();
        r.Api.Cancelled = true;
        Check.Throws<LinkException>(delegate { r.Service.Send(r.Item()); }, "cancelled sheet");
        Check.Equal(0, r.Sheets.List().Count, "nothing sent");
    }

    public static void TestSendAgainBeforeCountingReplacesTheCopy()
    {
        Rig r = new Rig();
        r.Service.Send(r.Item());
        now = now.AddMinutes(5);
        r.Service.Send(r.Item());
        Check.Equal(1, r.Sheets.List().Count, "still one");
        Check.Equal(now, r.Sheets.List()[0].Sheet.SentAtUtc, "newer send time");
        now = now.AddMinutes(-5);
    }

    public static void TestNoDeviceGivesClearMessage()
    {
        FolderDevice missing = new FolderDevice(Path.Combine(DeviceTests.Temp(), "nope"));
        DeviceNotFoundException e = null;
        try { missing.Connect(); } catch (DeviceNotFoundException x) { e = x; }
        Check.True(e != null && e.Message.Contains("does not exist"), "message");
        Rig r = new Rig();
        LinkService svc = new LinkService(r.Api, missing, r.Ledger, Now);
        Check.Throws<DeviceNotFoundException>(delegate { svc.Send(r.Item()); }, "send with nothing docked");
    }

    // ── Receiving ──

    public static void TestSummaryCountsStrayPartsAndUncounted()
    {
        Rig r = new Rig();
        ReceiveSummary s = r.Service.Check(r.CountAndFinish(true));
        Check.Equal(3, s.Entries, "entries");
        Check.Equal(24, s.Quantity, "quantity");
        Check.Equal(1, s.Damaged, "damaged");
        Check.Equal(2, s.PartsCounted, "different parts");
        Check.Equal(2, s.UncountedLines, "two sheet lines never counted");
        Check.Equal(1, s.NotOnSheet.Count, "one stray part");
        Check.Equal("ZZ-9", s.NotOnSheet[0], "which");
    }

    public static void TestUnfinishedSheetCannotBeReceived()
    {
        Rig r = new Rig();
        DeviceSheet d = r.CountAndFinish(false);
        LinkException e = null;
        try { r.Service.Receive(d, "ZERO"); } catch (LinkException x) { e = x; }
        Check.True(e != null && e.Message.Contains("not finished"), "message");
        Check.Equal(0, r.Api.UploadCalls, "nothing uploaded");
    }

    public static void TestReceiveUploadsOnceThenClearsDevice()
    {
        Rig r = new Rig();
        DeviceSheet d = r.CountAndFinish(true);
        ReceiveResult res = r.Service.Receive(d, "RELEASE");
        Check.True(res.Uploaded && res.Cleared, "uploaded and cleared");
        Check.Equal(1, r.Api.UploadCalls, "one upload");
        Check.Equal("RELEASE", r.Api.LastUncounted, "uncounted choice passed on");
        Check.Equal(0, r.Sheets.List().Count, "device cleared");
        Check.Equal(UploadState.Uploaded, r.Ledger.StateOf("sheet-1"), "recorded");
        Check.Equal(3, r.Api.LastEntries.Count, "one entry per part per bin");
    }

    public static void TestSecondUploadFromSameSheetIsRefused()
    {
        Rig r = new Rig();
        DeviceSheet d = r.CountAndFinish(true);
        r.Service.Receive(d, "ZERO");
        // The sheet comes back (e.g. a copy kept elsewhere): this PC must not upload it again.
        r.Api.Uploaded = false;
        Check.Throws<AlreadyUploadedException>(delegate { r.Service.Receive(d, "ZERO"); }, "second upload");
        Check.Equal(1, r.Api.UploadCalls, "still one upload");
    }

    public static void TestUploadedButNotClearedCanBeClearedLater()
    {
        Rig r = new Rig();
        DeviceSheet d = r.CountAndFinish(true);
        r.Ledger.Add(now, "sheet-1", "SHT-000001", UploadState.Uploaded, 3, 24, "x", "");
        Check.Throws<AlreadyUploadedException>(delegate { r.Service.Receive(d, "ZERO"); }, "refused");
        r.Service.ClearUploaded(d);
        Check.Equal(0, r.Sheets.List().Count, "cleared without uploading");
        Check.Equal(0, r.Api.UploadCalls, "nothing uploaded");
    }

    public static void TestUploadLostInTransitIsNotRepeated()
    {
        Rig r = new Rig();
        DeviceSheet d = r.CountAndFinish(true);
        r.Api.UploadAppliesThenFails = true;
        Check.Throws<LinkException>(delegate { r.Service.Receive(d, "ZERO"); }, "answer lost");
        Check.Equal(UploadState.Uploading, r.Ledger.StateOf("sheet-1"), "outcome unknown");
        r.Api.UploadAppliesThenFails = false;
        ReceiveResult res = r.Service.Receive(d, "ZERO");
        Check.True(res.Uploaded && res.WasAlreadyUploaded, "found already uploaded");
        Check.Equal(1, r.Api.UploadCalls, "never sent twice");
        Check.Equal(0, r.Sheets.List().Count, "cleared");
    }

    public static void TestRefusedUploadMayBeRetried()
    {
        Rig r = new Rig();
        DeviceSheet d = r.CountAndFinish(true);
        r.Api.UploadFails = new ApiException(409, "Part is being counted in another stock taking");
        Check.Throws<ApiException>(delegate { r.Service.Receive(d, "ZERO"); }, "refused");
        Check.Equal(UploadState.Failed, r.Ledger.StateOf("sheet-1"), "recorded as failed");
        Check.Equal(1, r.Sheets.List().Count, "counts stay on the device");
        r.Api.UploadFails = null;
        Check.True(r.Service.Receive(d, "ZERO").Uploaded, "second try works");
    }

    public static void TestServerSideProblemsStayUnknown()
    {
        Rig r = new Rig();
        DeviceSheet d = r.CountAndFinish(true);
        r.Api.UploadFails = new ApiException(502, "Bad gateway");
        Check.Throws<ApiException>(delegate { r.Service.Receive(d, "ZERO"); }, "gateway error");
        Check.Equal(UploadState.Uploading, r.Ledger.StateOf("sheet-1"), "a 5xx may have been applied");
    }

    public static void TestSheetUploadedElsewhereIsNotUploadedAgain()
    {
        Rig r = new Rig();
        DeviceSheet d = r.CountAndFinish(true);
        r.Api.Uploaded = true;
        LinkException e = null;
        try { r.Service.Receive(d, "ZERO"); } catch (LinkException x) { e = x; }
        Check.True(e != null && e.Message.Contains("already uploaded"), "message");
        Check.Equal(0, r.Api.UploadCalls, "nothing sent");
        Check.Equal(1, r.Sheets.List().Count, "device copy kept");
    }

    public static void TestCancelledOrClosedSheetIsNotUploaded()
    {
        Rig r = new Rig();
        DeviceSheet d = r.CountAndFinish(true);
        r.Api.TakeClosed = true;
        Check.Throws<LinkException>(delegate { r.Service.Receive(d, "ZERO"); }, "closed");
        Check.Equal(0, r.Api.UploadCalls, "nothing sent");
    }

    public static void TestUncountedChoiceIsRequired()
    {
        Rig r = new Rig();
        DeviceSheet d = r.CountAndFinish(true);
        Check.Throws<LinkException>(delegate { r.Service.Receive(d, ""); }, "blank");
        Check.Throws<LinkException>(delegate { r.Service.Receive(d, "REMOVE"); }, "not an allowed value");
    }

    // ── Building the upload ──

    public static void TestDeviceClockOf2009IsNotTrusted()
    {
        DateTime sent = new DateTime(2026, 10, 17, 9, 0, 0, DateTimeKind.Utc), got = new DateTime(2026, 10, 17, 11, 0, 0, DateTimeKind.Utc);
        Check.Equal(got, UploadBuilder.ResolveTime(new DateTime(2009, 1, 1, 0, 3, 0, DateTimeKind.Utc), sent, got), "2009 -> PC time");
        DateTime ok = new DateTime(2026, 10, 17, 10, 0, 0, DateTimeKind.Utc);
        Check.Equal(ok, UploadBuilder.ResolveTime(ok, sent, got), "plausible device time kept");
        Check.Equal(got, UploadBuilder.ResolveTime(got.AddHours(3), sent, got), "future -> PC time");
        Check.Equal(got, UploadBuilder.ResolveTime(got.AddMinutes(2), sent, got), "slightly ahead is clamped to now");
    }

    public static void TestUploadEntriesAreOnePerPartPerBin()
    {
        CountSheet sheet = SharedTests.Sample(true);
        CountState st = new CountState();
        DateTime t = new DateTime(2009, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        st.Entries.Add(new CountEntry { Id = 1, Bin = "N-3A1", PartNumber = "1864421058N", Quantity = 10, Damaged = 1, Remarks = "torn", AtUtc = t });
        st.Entries.Add(new CountEntry { Id = 2, Bin = "N3A1", PartNumber = "1864421058N", Quantity = 5, Damaged = 0, Remarks = "torn", AtUtc = t });
        st.Entries.Add(new CountEntry { Id = 3, Bin = "QSB", PartNumber = "1864421058N", Quantity = 2, Damaged = 0, AtUtc = t });
        st.Entries.Add(new CountEntry { Id = 4, Bin = "", PartNumber = "0K20133065A", Quantity = 0, Damaged = 0, AtUtc = t });
        List<Dictionary<string, object>> rows = UploadBuilder.Build(sheet, st, now);
        Check.Equal(3, rows.Count, "duplicates in one bin merge; other bins stay apart");
        Check.Equal(15, (int)rows[0]["quantity"], "merged quantity");
        Check.Equal(1, (int)rows[0]["damagedQuantity"], "merged damaged");
        Check.Equal("torn", (string)rows[0]["remarks"], "same remark not repeated");
        Check.Equal("QSB", (string)rows[1]["binLocation"], "second bin");
        Check.True(!rows[2].ContainsKey("binLocation"), "no bin: omitted");
        Check.Equal(0, (int)rows[2]["quantity"], "an explicit zero count is sent");
        Check.Equal(Iso.Utc(now), (string)rows[0]["countedAt"], "bad device time replaced by PC time");
        string json = Json.Write(rows);
        Check.True(json.Contains("\"partNumber\":\"1864421058N\""), "serialises as the upload expects");
    }

    // ── Ledger, device, API helpers ──

    public static void TestLedgerKeepsLastStateAndSurvivesJunk()
    {
        string path = Path.Combine(DeviceTests.Temp(), "u.log");
        UploadLedger l = new UploadLedger(path);
        l.Add(now, "s1", "SHT-1", UploadState.Uploading, 3, 24, "u", "");
        l.Add(now, "s1", "SHT-1", UploadState.Uploaded, 3, 24, "u", "ZERO");
        File.AppendAllText(path, "garbage line\n");
        Check.Equal(UploadState.Uploaded, new UploadLedger(path).StateOf("s1"), "last wins");
        Check.Equal(UploadState.None, new UploadLedger(path).StateOf("other"), "unknown sheet");
        Check.Equal(2, new UploadLedger(path).ReadAll().Count, "junk skipped");
    }

    public static void TestFolderDeviceKeepsInsideItsRoot()
    {
        FolderDevice d = new FolderDevice(DeviceTests.Temp());
        Check.Throws<LinkException>(delegate { d.WriteFile("\\..\\evil.txt", new byte[1]); }, "no escaping the folder");
        d.WriteFile("\\a\\b\\c.txt", Encoding.ASCII.GetBytes("hi"));
        Check.True(d.FileExists("\\a\\b\\c.txt") && d.DirectoryExists("\\a\\b"), "nested write");
        Check.Equal("c.txt", d.ListFiles("\\a\\b")[0], "list");
        d.DeleteFile("\\a\\b\\c.txt");
        Check.True(!d.FileExists("\\a\\b\\c.txt"), "deleted");
    }

    public static void TestInstallPutsExeAndShortcutOnDevice()
    {
        Rig r = new Rig();
        byte[] exe = new byte[] { 1, 2, 3, 4, 5 };
        string msg = r.Sheets.InstallApp(exe);
        Check.True(msg.Contains("Installed"), "message");
        Check.Equal(5, r.Device.ReadFile("\\Application\\Danamotors\\KMHH.exe").Length, "exe copied");
        foreach (string folder in new string[] { "\\Windows\\Programs", "\\Windows\\Desktop" })
        {
            string lnk = Encoding.ASCII.GetString(r.Device.ReadFile(folder + "\\Kia Motors Handheld.lnk"));
            Check.True(lnk.EndsWith("KMHH.exe\""), "shortcut in " + folder + " points at the exe: " + lnk);
        }
        Check.True(!r.Device.FileExists("\\Application\\StartUpCtl\\OnReset\\OnReset_KMHH.txt"), "no restore script on a device without StartUpCtl");
    }

    public static void TestInstallLeavesAColdBootRestoreScriptWhereStartUpCtlExists()
    {
        Rig r = new Rig();
        r.Device.WriteFile("\\Application\\StartUpCtl\\StartUpCtlConfig.txt", new byte[] { 1 });
        string msg = r.Sheets.InstallApp(new byte[] { 1, 2, 3 });
        Check.True(msg.Contains("after a cold boot"), "message: " + msg);
        Check.True(r.Device.FileExists("\\Application\\Danamotors\\Kia Motors Handheld.lnk"), "a copy of the shortcut in flash");
        string script = Encoding.ASCII.GetString(r.Device.ReadFile("\\Application\\StartUpCtl\\OnReset\\OnReset_KMHH.txt"));
        Check.True(script.Contains("copy \"\\Application\\Danamotors\\Kia Motors Handheld.lnk\" \\Windows\\Desktop"), "copies to the desktop: " + script);
        Check.True(script.Contains("copy \"\\Application\\Danamotors\\Kia Motors Handheld.lnk\" \\Windows\\Programs"), "copies to Start > Programs");
    }

    public static void TestInstallRemovesTheOldDanamotorsCountApp()
    {
        Rig r = new Rig();
        string[] old = {
            "\\Application\\Danamotors\\DanamotorsCount.exe", "\\Windows\\Programs\\Danamotors Count.lnk",
            "\\Windows\\Desktop\\Danamotors Count.lnk", "\\Application\\Danamotors\\Danamotors Count.lnk",
            "\\Application\\StartUpCtl\\OnReset\\OnReset_Danamotors.txt" };
        foreach (string f in old) r.Device.WriteFile(f, new byte[] { 1 });
        r.Device.WriteFile("\\Application\\Danamotors\\sheets\\S1.sheet", new byte[] { 7 });
        string msg = r.Sheets.InstallApp(new byte[] { 1, 2, 3 });
        Check.True(msg.Contains("Removed the old Danamotors Count app (5 file(s))"), "message: " + msg);
        foreach (string f in old) Check.True(!r.Device.FileExists(f), f + " removed");
        Check.True(r.Device.FileExists("\\Application\\Danamotors\\sheets\\S1.sheet"), "the sheets in the data folder are kept");
        Check.Equal("", r.Sheets.RemoveOldNames(), "nothing left to remove the second time");
    }

    public static void TestServerAddressNormalising()
    {
        Check.Equal("http://localhost:8000/api", ApiClient.NormalizeUrl("localhost:8000"), "bare host");
        Check.Equal("https://x.example.com/api", ApiClient.NormalizeUrl("https://x.example.com/api/"), "already api");
        Check.Throws<LinkException>(delegate { ApiClient.NormalizeUrl("  "); }, "blank");
    }

    public static void TestJsonHelpers()
    {
        object o = Json.Parse("{\"data\":{\"a\":[{\"n\":1},{\"n\":2}],\"s\":\"x\",\"b\":true,\"z\":null}}");
        Check.Equal(2, Json.List(o, "data", "a").Count, "list");
        Check.Equal(2, Json.Int(Json.List(o, "data", "a")[1], "n").Value, "int");
        Check.Equal("x", Json.Str(o, "data", "s"), "string");
        Check.True(Json.Bool(o, "data", "b"), "bool");
        Check.Equal("", Json.Str(o, "data", "z"), "null is empty");
        Check.Equal("", Json.Str(o, "nope", "deeper"), "missing path is empty");
    }
}
