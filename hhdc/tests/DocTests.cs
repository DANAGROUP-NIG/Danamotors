using System;
using System.Collections.Generic;
using System.IO;
using Danamotors.Hhdc;
using Danamotors.Hhdc.Device;
using Danamotors.Hhdc.Link;

/// <summary>A stand-in for the server's /handheld endpoints.</summary>
public sealed class FakeHandheldApi : IHandheldApi
{
    public string Status = "SENT";
    public string CancelRemark = "";
    public int UploadCalls, CancelCalls;
    public Dictionary<string, object> LastBody;
    public Exception UploadFails;
    public bool UploadAppliesThenFails;
    public HandheldDoc Doc;

    public FakeHandheldApi(HandheldDoc doc) { Doc = doc; }

    public string UserName { get { return "Test User"; } }
    public List<DocSource> ListSources(string type) { return new List<DocSource>(); }
    public List<Picker> ListPickers() { return new List<Picker>(); }

    public FetchedDoc CreateDocument(string type, string sourceId, string pickerId)
    {
        FetchedDoc f = new FetchedDoc();
        f.Doc = HandheldDoc.Parse(Doc.Serialize()); // a fresh copy, as from the wire
        f.Status = "SENT";
        return f;
    }

    public FetchedDoc GetDocument(string id)
    {
        FetchedDoc f = new FetchedDoc();
        f.Doc = Doc;
        f.Status = Status;
        f.CancelRemark = CancelRemark;
        return f;
    }

    public void UploadDocument(string id, Dictionary<string, object> body)
    {
        UploadCalls++;
        if (UploadAppliesThenFails) { Status = "UPLOADED"; throw new LinkException("connection lost"); }
        if (UploadFails != null) throw UploadFails;
        Status = "UPLOADED";
        LastBody = body;
    }

    public void CancelDocument(string id, string remark)
    {
        CancelCalls++;
        Status = "CANCELLED";
        CancelRemark = remark;
    }
}

public static class DocTests
{
    static DateTime now = new DateTime(2026, 10, 27, 12, 0, 0, DateTimeKind.Utc);
    static DateTime Now() { return now; }

    /// <summary>Legacy BI 2026000009 for KP: 8659028000 x10 in 59A3 and one more line; the device clock reads 2009.</summary>
    public static HandheldDoc Indent()
    {
        HandheldDoc d = new HandheldDoc();
        d.DocumentId = "doc-1"; d.DocumentNumber = "2026000001"; d.Type = DocTypes.IndentPick;
        d.Reference = "2026000009"; d.Party = "Kia Plaza"; d.Branch = "CPD"; d.Picker = "Picker 00015";
        d.SentAtUtc = now;
        d.Lines.Add(Line("l1", 1, "1D3/1D2", "96611P2700", "HORN ASSY", "", 1));
        d.Lines.Add(Line("l2", 2, "59A3", "8659028000", "RETAINE ASSY-BUMPER", "", 10));
        return d;
    }

    /// <summary>Legacy MIT 2026000005, case SPD2APD00183.</summary>
    public static HandheldDoc Mit()
    {
        HandheldDoc d = new HandheldDoc();
        d.DocumentId = "doc-2"; d.DocumentNumber = "2026000002"; d.Type = DocTypes.MitReceive;
        d.Reference = "2026000005"; d.Party = "MOBIS inv A6DA0514"; d.Branch = "CPD"; d.Picker = "Picker 00015";
        d.SentAtUtc = now;
        d.Lines.Add(Line("m1", 1, "AUTO", "98360F2500", "", "SPD2APD00183", 1));
        d.Lines.Add(Line("m2", 2, "", "97701Q6300", "", "SPD2APD00183", 2));
        d.Lines.Add(Line("m3", 3, "22B1", "97701H9000", "", "SPD2APD00184", 1));
        return d;
    }

    static DocLine Line(string id, int n, string bin, string part, string desc, string caseNo, int expected)
    {
        DocLine l = new DocLine();
        l.Id = id; l.Number = n; l.Bin = bin; l.PartNumber = part; l.Description = desc; l.Case = caseNo; l.Expected = expected;
        return l;
    }

    static DocSession Session(HandheldDoc doc, out string log)
    {
        log = Path.Combine(DeviceTests.Temp(), "d.hlog");
        return new DocSession(doc, new CountStore(log), delegate { return new DateTime(2009, 1, 1, 0, 0, 0, DateTimeKind.Utc); });
    }

    static void Rule(Action a, string contains, string what)
    {
        string msg = null;
        try { a(); } catch (CountException e) { msg = e.Message; }
        Check.True(msg != null && msg.Contains(contains), what + " (got: " + (msg ?? "no error") + ")");
    }

    // ── File formats ──

    public static void TestDocRoundTrip()
    {
        HandheldDoc d = Indent();
        d.Lines[0].Description = "tab\there";
        HandheldDoc back = HandheldDoc.Parse(d.Serialize());
        Check.Equal("2026000009", back.Reference, "reference");
        Check.Equal(2, back.Lines.Count, "lines");
        Check.Equal("tab\there", back.Lines[0].Description, "escaped text");
        Check.Equal(10, back.Lines[1].Expected, "expected");
        Check.Equal(now, back.SentAtUtc, "sent time");
        Check.Equal("D2026000001", d.FileStem, "file stem");
    }

    public static void TestDocCutShortIsRefused()
    {
        string text = Indent().Serialize();
        string cut = text.Substring(0, text.IndexOf("END", StringComparison.Ordinal));
        Check.Throws<SheetFormatException>(delegate { HandheldDoc.Parse(cut); }, "a file without END");
    }

    public static void TestPickLogLatestWinsAndCutRecordIgnored()
    {
        LineResult r = new LineResult();
        r.LineId = "l2"; r.Quantity = 3; r.AtUtc = now;
        string first = PickLog.Line(r);
        r.Quantity = 7; r.Reason = "LESS_IN_BIN";
        string second = PickLog.Line(r);
        PickState s = PickLog.Replay(new string[] { first, second, "P\tl1\t1\t0", PickLog.Finish(now), PickLog.Line(r) });
        Check.Equal(7, s.Result("l2").Quantity, "latest record wins");
        Check.Equal("LESS_IN_BIN", s.Result("l2").Reason, "reason kept");
        Check.True(s.Result("l1") == null, "a record cut off by a battery pull is ignored");
        Check.Equal(1, s.Skipped, "one record skipped");
        Check.True(s.Finished, "finished");
    }

    // ── Device rules: picking ──

    public static void TestPickScansAndLimit()
    {
        string log;
        DocSession s = Session(Indent(), out log);
        ScanMatch m = s.Match("8659028000        KL22", 0);
        Check.Equal(ScanKind.Part, m.Kind, "a Kia label matches the part");
        Check.Equal(1, m.Lines[0], "line 2");
        for (int i = 0; i < 10; i++) s.Scan(1, 1, false);
        Check.True(s.Done(1), "picked in full");
        Rule(delegate { s.Scan(1, 1, false); }, "Only 10 reserved", "cannot pick more than reserved");
        Rule(delegate { s.Set(0, 0, 1); }, "only when checking an MIT", "no damaged on a pick");
        Check.Equal(10, new DocSession(Indent(), new CountStore(log), Now).Quantity(1), "saved to the results file");
    }

    public static void TestMatchByBinAndCurrentLineFirst()
    {
        string log;
        DocSession s = Session(Indent(), out log);
        ScanMatch m = s.Match("1D2", 1);
        Check.Equal(ScanKind.Bin, m.Kind, "one of a part's bins");
        Check.Equal(0, m.Lines[0], "the line in that bin");
        Check.Equal(ScanKind.Unknown, s.Match("503103E102", 0).Kind, "unknown part");
    }

    public static void TestShortNeedsReasonBeforeFinish()
    {
        string log;
        DocSession s = Session(Indent(), out log);
        s.Set(1, 7, 0);
        Rule(delegate { s.Finish(); }, "short with no reason", "finish blocked");
        Check.Equal(2, s.ShortWithoutReason().Count, "the short line and the untouched one");
        s.SetReason(1, "LESS_IN_BIN");
        s.SetReason(0, "NOT_FOUND");
        Rule(delegate { s.SetReason(1, "WHATEVER"); }, "Choose a reason", "unknown reason refused");
        s.Finish();
        Check.True(s.Finished, "finished");
        Rule(delegate { s.Scan(1, 1, false); }, "locked", "locked after finish");
    }

    public static void TestCompletingALineClearsItsReason()
    {
        string log;
        DocSession s = Session(Indent(), out log);
        s.Set(0, 0, 0);
        s.SetReason(0, "NOT_FOUND");
        s.Scan(0, 1, false);
        Check.Equal("", s.Reason(0), "reason cleared once picked in full");
        Rule(delegate { s.SetReason(0, "OTHER"); }, "picked in full", "no reason for a full line");
    }

    public static void TestSubstituteIsRecordedNotPicked()
    {
        string log;
        DocSession s = Session(Indent(), out log);
        s.SetSubstitute(0, "96611p2710");
        Check.Equal("96611P2710", s.Result(0).Scanned, "kept in upper case");
        Check.Equal(0, s.Quantity(0), "nothing picked");
        Rule(delegate { s.ScanExtra("X", 1, false); }, "Only an MIT", "no extra parts on a pick");
    }

    // ── Device rules: MIT ──

    public static void TestMitReceivedPlusDamagedWithinInvoice()
    {
        string log;
        DocSession s = Session(Mit(), out log);
        s.Scan(1, 1, false);
        s.Scan(1, 1, true);
        Check.Equal(1, s.Quantity(1), "good");
        Check.Equal(1, s.Damaged(1), "damaged");
        Rule(delegate { s.Scan(1, 1, false); }, "The invoice has 2", "no more than invoiced");
        Check.Equal(ScanKind.Bin, s.Match("SPD2APD00184", 0).Kind, "a case label moves to its lines");
        Check.Equal(2, s.UncheckedLines, "two lines not checked");
        s.Finish(); // unchecked lines are allowed: the store checks them on the MRN
    }

    public static void TestMitExtraPartsAddUpAndCanBeRemoved()
    {
        string log;
        DocSession s = Session(Mit(), out log);
        s.ScanExtra("96621P2600  KL22", 1, false);
        ExtraPart e = s.ScanExtra("96621P2600", 1, false);
        Check.Equal(2, e.Quantity, "one entry per part");
        s.ScanExtra("96621P2600", -1, false);
        s.ScanExtra("96621P2600", -1, false);
        Check.Equal(0, s.Extras.Count, "removed at zero");
        Check.Equal(0, new DocSession(Mit(), new CountStore(log), Now).Extras.Count, "and in the file");
    }

    // ── HHDC Link ──

    sealed class Rig
    {
        public string Root = DeviceTests.Temp();
        public FolderDevice Device;
        public FakeHandheldApi Api;
        public UploadLedger Ledger;
        public DocLinkService Service;

        public Rig(HandheldDoc doc)
        {
            Directory.CreateDirectory(Path.Combine(Root, "Application"));
            Device = new FolderDevice(Root);
            Api = new FakeHandheldApi(doc);
            Ledger = new UploadLedger(Path.Combine(DeviceTests.Temp(), "uploads.log"));
            Service = new DocLinkService(Api, Device, Ledger, Now);
        }

        public DocSource Source()
        {
            DocSource s = new DocSource();
            s.Type = Api.Doc.Type; s.SourceId = "src"; s.Number = Api.Doc.Reference;
            return s;
        }

        public Picker Picker()
        {
            Picker p = new Picker();
            p.Id = "emp-1"; p.Name = "Picker 00015"; p.Code = "00015";
            return p;
        }

        public DocSession OnDevice()
        {
            DeviceDoc d = new DeviceDocs(Device).List()[0];
            return new DocSession(d.Doc, new CountStore(Path.Combine(Root, "Application", "Danamotors", "sheets", d.Stem + ".hlog")), Now);
        }

        public DeviceDoc Read() { return new DeviceDocs(Device).List()[0]; }
    }

    public static void TestSendWritesTheDocumentWithPcTime()
    {
        Rig r = new Rig(Indent());
        r.Service.Send(r.Source(), r.Picker());
        DeviceDoc d = r.Read();
        Check.Equal("", d.Error, "readable");
        Check.Equal(2, d.Doc.Lines.Count, "lines");
        Check.True(File.Exists(Path.Combine(r.Root, "Application", "Danamotors", "sheets", "D2026000001.hdoc")), "in the sheets folder");
    }

    public static void TestPickUploadsOnceWithReasonsAndSubstitute()
    {
        Rig r = new Rig(Indent());
        r.Service.Send(r.Source(), r.Picker());
        DocSession s = r.OnDevice();
        s.Set(1, 7, 0);
        s.SetReason(1, "LESS_IN_BIN");
        s.SetSubstitute(0, "96611P2710");
        s.SetReason(0, "OTHER");
        s.Finish();

        DocSummary sum = r.Service.Check(r.Read());
        Check.Equal(2, sum.Short.Count, "two short lines");
        Check.Equal(1, sum.Substitutes.Count, "the substitute is shown");

        ReceiveResult res = r.Service.Receive(r.Read());
        Check.True(res.Uploaded && res.Cleared, "uploaded and cleared");
        List<Dictionary<string, object>> lines = (List<Dictionary<string, object>>)r.Api.LastBody["lines"];
        Check.Equal(2, lines.Count, "both lines sent");
        Check.Equal("96611P2710", (string)lines[0]["scannedPartNumber"], "substitute sent");
        Check.Equal(7, (int)lines[1]["quantity"], "picked");
        Check.Equal("LESS_IN_BIN", (string)lines[1]["shortReason"], "reason sent");
        Check.Equal("NOT_FOUND", (string)r.Api.LastBody["unreportedReason"], "default for unsaved lines");
        Check.True(!r.Api.LastBody.ContainsKey("extras"), "no extras on a pick");
        Check.Equal(0, new DeviceDocs(r.Device).List().Count, "removed from the device");
    }

    public static void TestUnfinishedDocumentIsNotReceived()
    {
        Rig r = new Rig(Indent());
        r.Service.Send(r.Source(), r.Picker());
        r.OnDevice().Set(1, 10, 0);
        LinkException e = null;
        try { r.Service.Receive(r.Read()); } catch (LinkException x) { e = x; }
        Check.True(e != null && e.Message.Contains("not finished"), "refused until finished");
        Check.Equal(0, r.Api.UploadCalls, "nothing uploaded");
    }

    public static void TestCancelledOnServerIsNotUploaded()
    {
        Rig r = new Rig(Indent());
        r.Service.Send(r.Source(), r.Picker());
        DocSession s = r.OnDevice();
        s.Set(0, 1, 0); s.Set(1, 10, 0); s.Finish();
        r.Api.Status = "CANCELLED"; r.Api.CancelRemark = "Dispatched on STN 2026000101 before the handheld result was uploaded";
        Check.Throws<DocCancelledException>(delegate { r.Service.Receive(r.Read()); }, "cancelled document");
        Check.Equal(0, r.Api.UploadCalls, "nothing uploaded");
        r.Service.ClearDone(r.Read());
        Check.Equal(0, new DeviceDocs(r.Device).List().Count, "can be cleared");
    }

    public static void TestLostAnswerIsNotUploadedTwice()
    {
        Rig r = new Rig(Mit());
        r.Service.Send(r.Source(), r.Picker());
        DocSession s = r.OnDevice();
        s.Scan(0, 1, false);
        s.ScanExtra("96621P2600", 1, false);
        s.Finish();
        r.Api.UploadAppliesThenFails = true;
        Check.Throws<LinkException>(delegate { r.Service.Receive(r.Read()); }, "connection lost");
        r.Api.UploadAppliesThenFails = false;
        ReceiveResult res = r.Service.Receive(r.Read());
        Check.True(res.WasAlreadyUploaded, "found uploaded by the earlier attempt");
        Check.Equal(1, r.Api.UploadCalls, "sent once");
    }

    public static void TestMitBodyHasDamagedAndExtras()
    {
        HandheldDoc doc = Mit();
        PickState st = new PickState();
        LineResult a = new LineResult(); a.LineId = "m2"; a.Quantity = 1; a.Damaged = 1; st.Lines["m2"] = a;
        ExtraPart x = new ExtraPart(); x.Id = 1; x.PartNumber = "96621P2600"; x.Quantity = 1; st.Extras.Add(x);
        Dictionary<string, object> body = DocUploadBuilder.Build(doc, st);
        List<Dictionary<string, object>> lines = (List<Dictionary<string, object>>)body["lines"];
        Check.Equal(1, lines.Count, "only the checked line");
        Check.Equal(1, (int)lines[0]["damagedQuantity"], "damaged");
        Check.Equal(1, ((List<Dictionary<string, object>>)body["extras"]).Count, "extra part");
        Check.True(!body.ContainsKey("unreportedReason"), "no reason for an MIT");
    }

    public static void TestDeviceWriteFailureCancelsOnServer()
    {
        Rig r = new Rig(Indent());
        r.Service.Send(r.Source(), r.Picker());
        r.OnDevice().Set(1, 3, 0); // results on the device: a second copy must not overwrite them
        Check.Throws<LinkException>(delegate { r.Service.Send(r.Source(), r.Picker()); }, "refused");
        Check.Equal(1, r.Api.CancelCalls, "the new server copy is cancelled again");
        Check.Equal(3, r.OnDevice().Quantity(1), "device results untouched");
    }
}
