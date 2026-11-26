using System;
using System.Collections.Generic;
using System.Text;
using Danamotors.Hhdc;
using Danamotors.Hhdc.Link;

/// <summary>A stand-in for /handheld/station/prints/*.</summary>
public sealed class FakePrintApi : IPrintApi
{
    public List<PrintJob> Waiting = new List<PrintJob>();
    public List<string> Claims = new List<string>();
    public List<string> Done = new List<string>();
    public Exception DoneFails;

    public List<PrintJob> ClaimPrints(PrinterState printer)
    {
        Claims.Add(printer.Status);
        return new List<PrintJob>(Waiting);
    }

    public string PrintDone(string jobId, bool ok, string error)
    {
        if (DoneFails != null) throw DoneFails;
        Waiting.RemoveAll(delegate(PrintJob j) { return j.Id == jobId; });
        Done.Add(jobId + (ok ? ": ok" : ": " + error));
        return ok ? "PRINTED" : "FAILED";
    }
}

public sealed class FakePrinter : ILabelPrinter
{
    public PrinterState State;
    public List<string> Printed = new List<string>();
    public string Fails = "";

    public PrinterState Check() { return State; }

    public void Print(byte[] zpl)
    {
        if (Fails.Length > 0) throw new LinkException(Fails);
        Printed.Add(Encoding.UTF8.GetString(zpl));
    }
}

public static class LabelTests
{
    const char STX = '\x02', ETX = '\x03';

    static string Frame(params string[] lines)
    {
        StringBuilder b = new StringBuilder();
        foreach (string l in lines) b.Append(STX).Append(l).Append(ETX).Append("\r\n");
        return b.ToString();
    }

    // The store's ZTC S4M on 2026-10-28: direct thermal, no ribbon (so "ribbon out" is set), 2" labels.
    static readonly string Hi = Frame("ZTC S4M-200dpi ZPL,V53.17.11Z,8,2752KB");
    static string Hs(string paperOut, string paused, string headUp)
    {
        return Frame("014," + paperOut + "," + paused + ",0402,000,0,0,0,000,0,0,0", "000,0," + headUp + ",1,0,2,3,0,00000000,1,000", "1234,0");
    }

    static FakePrinter Ready()
    {
        FakePrinter p = new FakePrinter();
        p.State = new PrinterState { Model = "ZTC S4M-200dpi ZPL", Status = "READY" };
        return p;
    }

    static PrintJob Job(string id) { return new PrintJob { Id = id, LabelCount = 2, Zpl = "^XA^FD" + id + "^FS^XZ" }; }

    public static void TestReadsTheStoresPrinterAsReady()
    {
        PrinterState s = ZebraReply.Parse(Hi + Hs("0", "0", "0"));
        Check.Equal("ZTC S4M-200dpi ZPL", s.Model, "model");
        Check.Equal("READY", s.Status, "ribbon out does not matter in direct thermal");
    }

    public static void TestReadsPaperOutPausedAndHeadOpen()
    {
        Check.Equal("PAPER_OUT", ZebraReply.Parse(Hi + Hs("1", "1", "0")).Status, "paper out first");
        Check.Equal("PAUSED", ZebraReply.Parse(Hi + Hs("0", "1", "0")).Status, "paused");
        Check.Equal("HEAD_OPEN", ZebraReply.Parse(Hi + Hs("1", "0", "1")).Status, "head open");
        PrinterState tt = ZebraReply.Parse(Hi + Frame("014,0,0,0402,000,0,0,0,000,0,0,0", "000,0,0,1,1,2,3,0,00000000,1,000", "1234,0"));
        Check.Equal("ERROR", tt.Status, "thermal transfer without ribbon");
        Check.Equal("ribbon out", tt.Detail, "detail");
    }

    public static void TestTheNewestStatusWinsOverAnOldBufferedOne()
    {
        // An answer to an earlier request can still sit in the printer's buffer.
        PrinterState s = ZebraReply.Parse(Hs("1", "0", "0") + Hi + Hs("0", "0", "0"));
        Check.Equal("READY", s.Status, "newest");
        Check.True(ZebraReply.Parse(Hi) == null, "no status, no state");
        Check.True(ZebraReply.Parse(Frame("014,0,0,0402,000,0,0,0,000,0,0,0")) == null, "half a status");
    }

    public static void TestPrintsWaitingJobsAndReportsEach()
    {
        FakePrintApi api = new FakePrintApi();
        api.Waiting.Add(Job("a"));
        api.Waiting.Add(Job("b"));
        FakePrinter printer = Ready();
        LabelStation st = new LabelStation(api, printer, new StationLog("", delegate { return DateTime.UtcNow; }));
        Check.Equal(2, st.Run(), "printed");
        Check.Equal(2, printer.Printed.Count, "sent to the printer");
        Check.True(printer.Printed[0].Contains("^FDa^FS"), "the job's ZPL as it came");
        Check.Equal("a: ok|b: ok", string.Join("|", api.Done.ToArray()), "reported");
        Check.Equal(0, st.Run(), "nothing left");
    }

    public static void TestDoesNotClaimWhileThePrinterIsNotReady()
    {
        FakePrintApi api = new FakePrintApi();
        api.Waiting.Add(Job("a"));
        FakePrinter printer = Ready();
        printer.State.Status = "PAPER_OUT";
        LabelStation st = new LabelStation(api, printer, new StationLog("", delegate { return DateTime.UtcNow; }));
        st.Run();
        Check.Equal(0, api.Claims.Count, "no claim");
        printer.State = null;
        st.Run();
        Check.Equal(0, api.Claims.Count, "no printer, no claim");
        Check.True(st.Last == null, "reported as none attached");
    }

    public static void TestReportsAFailedPrint()
    {
        FakePrintApi api = new FakePrintApi();
        api.Waiting.Add(Job("a"));
        FakePrinter printer = Ready();
        printer.Fails = "The label printer did not take the labels: device gone";
        LabelStation st = new LabelStation(api, printer, new StationLog("", delegate { return DateTime.UtcNow; }));
        Check.Equal(0, st.Run(), "nothing printed");
        Check.Equal("a: The label printer did not take the labels: device gone", api.Done[0], "failure sent");
    }

    public static void TestNeverReprintsWhenOnlyTheAnswerWasLost()
    {
        FakePrintApi api = new FakePrintApi();
        api.Waiting.Add(Job("a"));
        FakePrinter printer = Ready();
        LabelStation st = new LabelStation(api, printer, new StationLog("", delegate { return DateTime.UtcNow; }));
        api.DoneFails = new LinkException("Cannot reach the server");
        Check.Throws<LinkException>(delegate { st.Run(); }, "server down after printing");
        Check.Equal(1, printer.Printed.Count, "printed once");
        Check.Equal(1, st.Unreported, "answer kept");

        api.DoneFails = null;
        st.Run();
        Check.Equal(1, printer.Printed.Count, "not printed again");
        Check.Equal("a: ok", string.Join("|", api.Done.ToArray()), "answer sent on the next pass");
        Check.Equal(0, st.Unreported, "nothing pending");
    }

    public static void TestDropsAnAnswerTheServerRefuses()
    {
        FakePrintApi api = new FakePrintApi();
        api.Waiting.Add(Job("a"));
        LabelStation st = new LabelStation(api, Ready(), new StationLog("", delegate { return DateTime.UtcNow; }));
        api.DoneFails = new ApiException(409, "This job is not claimed by this station");
        st.Run();
        Check.Equal(0, st.Unreported, "a refused answer is not sent forever");
    }

    public static void TestTheHeartbeatCarriesThePrinter()
    {
        FakeStationApi api = new FakeStationApi();
        string folder = DeviceTests.Temp();
        DateTime t = new DateTime(2026, 10, 28, 9, 0, 0, DateTimeKind.Utc);
        StationRunner runner = new StationRunner(api, delegate { return new FolderDevice(folder); }, delegate { return t; },
                                                 new StationLog("", delegate { return t; }), "test", null);
        FakePrinter printer = Ready();
        runner.Labels = new LabelStation(new FakePrintApi(), printer, new StationLog("", delegate { return t; }));
        runner.Tick();
        Dictionary<string, object> p = (Dictionary<string, object>)api.Heartbeats[0]["printer"];
        Check.Equal("READY", (string)p["status"], "printer in the heartbeat");
        Check.True(runner.Status.EndsWith("label printer ready"), "tray shows it: " + runner.Status);

        printer.State = null;
        t = t.AddMinutes(1);
        runner.Tick();
        Check.True(api.Heartbeats[1].ContainsKey("printer") && api.Heartbeats[1]["printer"] == null, "unplugged: null");
    }
}
