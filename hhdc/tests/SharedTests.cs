using System;
using System.Collections.Generic;
using Danamotors.Hhdc;

public static class SharedTests
{
    public static CountSheet Sample(bool showStock)
    {
        CountSheet s = new CountSheet();
        s.StockTakeId = "take-1"; s.SheetId = "sheet-1"; s.SheetNumber = "SHT-000001"; s.BatchNumber = "2026000001";
        s.Branch = "Lagos"; s.Checker = "Ada Obi"; s.Criteria = "Bins N-3A1 to N-3B9"; s.ShowSystemStock = showStock;
        s.SentAtUtc = new DateTime(2026, 10, 17, 9, 12, 0, DateTimeKind.Utc);
        s.Lines.Add(new SheetLine { Bin = "N-3A1", PartNumber = "1864421058N", Description = "Oil filter", SystemStock = 57 });
        s.Lines.Add(new SheetLine { Bin = "QSB", PartNumber = "86110-2T000", Description = "Tab\there", SystemStock = 4 });
        s.Lines.Add(new SheetLine { Bin = "", PartNumber = "0K20133065A", Description = "Spark plug", SystemStock = 0 });
        return s;
    }

    public static void TestEscapeRoundTrip()
    {
        string raw = "a\tb\r\nc\\d\\n";
        Check.Equal(raw, Esc.Unescape(Esc.Escape(raw)), "round trip");
        Check.True(Esc.Escape(raw).IndexOf('\t') < 0 && Esc.Escape(raw).IndexOf('\n') < 0, "no raw tab or newline left");
    }

    public static void TestNumTryInt()
    {
        int v;
        Check.True(Num.TryInt("42", out v) && v == 42, "42");
        Check.True(Num.TryInt("-7", out v) && v == -7, "-7");
        Check.True(!Num.TryInt("", out v), "blank");
        Check.True(!Num.TryInt("4a", out v), "letters");
        Check.True(!Num.TryInt("1234567890", out v), "too long");
        Check.True(!Num.TryInt("-", out v), "minus only");
    }

    public static void TestIsoRoundTrip()
    {
        DateTime t = new DateTime(2026, 10, 17, 9, 12, 5, DateTimeKind.Utc), back;
        Check.Equal("2026-10-17T09:12:05Z", Iso.Utc(t), "format");
        Check.True(Iso.TryParse("2026-10-17T09:12:05Z", out back) && back == t, "parse");
        Check.True(!Iso.TryParse("garbage", out back), "garbage");
    }

    public static void TestNormalisation()
    {
        Check.Equal("86110-2T000", Norm.Code(" 86110-2t000 "), "code");
        Check.Equal("861102T000", Norm.Key("86110-2t 000"), "key");
        Check.True(Norm.SameBin("n-3a1", "N3A1"), "bins match ignoring dashes");
        Check.True(!Norm.SameBin("", ""), "blank bins never match");
        Check.True(Norm.BinListHas("1D3/1D2/41F2", "1d2"), "one bin of a list");
        Check.True(!Norm.BinListHas("1D3/1D2", "1D31D2"), "not the list run together");
        Check.True(!Norm.BinListHas("1D3//", ""), "a blank bin is never in the list");
    }

    public static void TestSheetRoundTrip()
    {
        CountSheet s = Sample(true);
        CountSheet b = CountSheet.Parse(s.Serialize());
        Check.Equal(3, b.Lines.Count, "lines");
        Check.Equal("SHT-000001", b.SheetNumber, "number");
        Check.Equal("Tab\there", b.Lines[1].Description, "escaped text");
        Check.Equal(57, b.Lines[0].SystemStock.Value, "stock");
        Check.Equal(s.SentAtUtc, b.SentAtUtc, "sent time");
        Check.True(b.ShowSystemStock, "show stock flag");
    }

    public static void TestBlindSheetNeverCarriesStock()
    {
        CountSheet b = CountSheet.Parse(Sample(false).Serialize());
        Check.True(!b.Lines[0].SystemStock.HasValue, "no stock on a blind sheet even though the lines had it");
    }

    public static void TestCutShortSheetIsRejected()
    {
        string text = Sample(false).Serialize();
        Check.Throws<SheetFormatException>(delegate { CountSheet.Parse(text.Substring(0, text.Length - 20)); }, "truncated");
        Check.Throws<SheetFormatException>(delegate { CountSheet.Parse(text.Replace("L\tQSB", "X\tQSB")); }, "line missing");
        Check.Throws<SheetFormatException>(delegate { CountSheet.Parse(""); }, "empty");
        Check.Throws<SheetFormatException>(delegate { CountSheet.Parse("DMSHEET\t2\n"); }, "future version");
    }

    public static void TestFileStemIsSafe()
    {
        CountSheet s = new CountSheet { SheetNumber = "A/B:1" };
        Check.Equal("A_B_1", s.FileStem, "stem");
    }

    static CountEntry E(int id, string bin, string part, int q, int d)
    {
        return new CountEntry { Id = id, Bin = bin, PartNumber = part, Quantity = q, Damaged = d, Remarks = "r", AtUtc = new DateTime(2026, 10, 17, 10, 0, 0, DateTimeKind.Utc) };
    }

    public static void TestLogReplay()
    {
        List<string> lines = new List<string>();
        DateTime at = new DateTime(2026, 10, 17, 10, 0, 0, DateTimeKind.Utc);
        lines.Add(CountLog.Entry(E(1, "A", "P1", 5, 0), false));
        lines.Add(CountLog.Entry(E(2, "B", "P2", 3, 1), false));
        lines.Add(CountLog.Entry(E(1, "A", "P1", 9, 0), true));
        lines.Add(CountLog.Delete(2, at));
        CountState s = CountLog.Replay(lines);
        Check.Equal(1, s.Entries.Count, "one entry left");
        Check.Equal(9, s.Entries[0].Quantity, "update applied");
        Check.Equal(2, s.MaxId, "max id counts deleted entries so ids are never reused");
        Check.True(!s.Finished, "not finished");
    }

    public static void TestLogIgnoresRecordCutByBatteryPull()
    {
        string good = CountLog.Entry(E(1, "A", "P1", 5, 0), false);
        string torn = CountLog.Entry(E(2, "B", "P2", 3, 0), false);
        torn = torn.Substring(0, torn.Length - 12);
        CountState s = CountLog.Replay(new string[] { good, torn });
        Check.Equal(1, s.Entries.Count, "torn record ignored");
        Check.Equal(1, s.Skipped, "counted as skipped");
    }

    public static void TestLogLocksAfterFinish()
    {
        DateTime at = new DateTime(2026, 10, 17, 11, 0, 0, DateTimeKind.Utc);
        CountState s = CountLog.Replay(new string[] {
            CountLog.Entry(E(1, "A", "P1", 5, 0), false), CountLog.Finish(at),
            CountLog.Entry(E(2, "A", "P2", 5, 0), false), CountLog.Delete(1, at) });
        Check.True(s.Finished, "finished");
        Check.Equal(1, s.Entries.Count, "records after Finish are ignored");
        Check.Equal(5, s.Entries[0].Quantity, "entry untouched");
    }

    public static void TestLogTotals()
    {
        CountState s = CountLog.Replay(new string[] { CountLog.Entry(E(1, "A", "P1", 5, 1), false), CountLog.Entry(E(2, "B", "P1", 7, 2), false) });
        Check.Equal(12, s.TotalQuantity, "quantity");
        Check.Equal(3, s.TotalDamaged, "damaged");
    }

    public static void TestLayoutRoot()
    {
        Check.Equal(DeviceLayout.PrimaryRoot, DeviceLayout.ResolveRoot(delegate(string p) { return true; }), "persistent folder present");
        Check.Equal(DeviceLayout.FallbackRoot, DeviceLayout.ResolveRoot(delegate(string p) { return false; }), "no persistent folder");
        string exe = "\\Application\\Danamotors\\KMHH.exe";
        Check.Equal((exe.Length + 2) + "#\"" + exe + "\"", DeviceLayout.ShortcutText(exe), "shortcut text");
    }
}
