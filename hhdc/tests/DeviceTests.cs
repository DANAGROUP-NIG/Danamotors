using System;
using System.Collections.Generic;
using System.IO;
using Danamotors.Hhdc;
using Danamotors.Hhdc.Device;

public static class DeviceTests
{
    public static string Temp()
    {
        string d = Path.Combine(Path.GetTempPath(), "hhdc-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(d);
        return d;
    }

    static DateTime clockNow = new DateTime(2009, 1, 1, 0, 0, 0, DateTimeKind.Utc); // the device clock reads 2009
    static DateTime Tick() { clockNow = clockNow.AddSeconds(1); return clockNow; }

    static CountSession Open(CountSheet sheet, string dir)
    {
        return new CountSession(sheet, new CountStore(Path.Combine(dir, "x.counts")), Tick);
    }

    // ── Scanning ──

    public static void TestScanEndsAfterFastBurstAndPause()
    {
        ScanDetector d = new ScanDetector();
        int t = 1000;
        foreach (char c in "86110") { d.Key(t); t += 10; }
        Check.True(!d.Poll(t + 100), "not yet: waiting for the pause");
        Check.True(d.Poll(t + 300), "ends after the pause");
        Check.True(!d.Poll(t + 600), "reports once");
    }

    public static void TestTypingDoesNotEndByItself()
    {
        ScanDetector d = new ScanDetector();
        int t = 1000;
        foreach (char c in "86110") { d.Key(t); t += 400; } // a person typing
        Check.True(!d.Poll(t + 2000), "typed text waits for Enter");
    }

    public static void TestShortBurstNeedsEnter()
    {
        ScanDetector d = new ScanDetector();
        d.Key(0); d.Key(10);
        Check.True(!d.Poll(1000), "two characters are not taken as a scan");
    }

    public static void TestScanSurvivesTickCounterWrap()
    {
        ScanDetector d = new ScanDetector();
        int t = int.MaxValue - 15;
        for (int i = 0; i < 5; i++) { d.Key(t); t = unchecked(t + 10); }
        Check.True(d.Poll(unchecked(t + 300)), "works across the wrap of Environment.TickCount");
    }

    // ── Matching ──

    public static void TestPartMatching()
    {
        CountSheet s = SharedTests.Sample(true);
        SheetIndex i = new SheetIndex(s);
        Check.Equal("1864421058N", i.Find("1864421058n").PartNumber, "case");
        Check.Equal("86110-2T000", i.Find("861102T000").PartNumber, "dashes ignored when unambiguous");
        Check.True(i.Find("NOPE") == null, "unknown");
        s.Lines.Add(new SheetLine { PartNumber = "861102-T000" });
        Check.True(new SheetIndex(s).Find("861102T000") == null, "ambiguous loose match is refused");
        Check.Equal("86110-2T000", new SheetIndex(s).Find("86110-2T000").PartNumber, "exact match still wins");
    }

    public static void TestKiaLabelWithModelCodeMatchesThePart()
    {
        CountSheet s = SharedTests.Sample(true);
        s.Lines.Add(new SheetLine { Bin = "A", PartNumber = "96611P2700", Description = "Panel" });
        s.Lines.Add(new SheetLine { Bin = "A", PartNumber = "0K081 33211", Description = "Has a single space" });
        SheetIndex i = new SheetIndex(s);
        Check.Equal("96611P2700", i.Find("96611P2700        KL22").PartNumber, "model code after the padding is ignored");
        Check.Equal("96611P2700", i.Find("96611p2700     001").PartNumber, "any suffix, any case");
        Check.Equal("0K081 33211", i.Find("0K081 33211").PartNumber, "a single space belongs to the part number");
        Check.Equal("0K081 33211", i.Find("0K081 33211      KH11").PartNumber, "single space kept, suffix dropped");
        CountSession c = Open(s, Temp());
        Check.Equal("256002E500", c.Lookup("256002E500        KH11").PartNumber, "off-sheet part is stored without the suffix");
        Check.True(!c.Lookup("256002E500        KH11").OnSheet, "off sheet");
    }

    // ── Compact sheet (the device's way of holding a 38,000-part sheet) ──

    static byte[] Bytes(string text) { return new System.Text.UTF8Encoding(false).GetBytes(text); }

    static CompactSheetLines Compact(CountSheet s)
    {
        return CompactSheetLines.Read(new MemoryStream(Bytes(s.Serialize())));
    }

    public static void TestCompactSheetFindsTheSamePartsAsTheIndex()
    {
        CountSheet s = SharedTests.Sample(true);
        s.Lines.Add(new SheetLine { Bin = "A", PartNumber = "96611P2700", Description = "Panel", SystemStock = 3 });
        s.Lines.Add(new SheetLine { Bin = "A", PartNumber = "0K081 33211", Description = "Has a single space" });
        s.Lines.Add(new SheetLine { Bin = "B", PartNumber = "861102-T000", Description = "Looks like the other one" });
        string[] probes = { "1864421058n", "  1864421058N ", "861102T000", "86110-2T000", "86110-2t000", "861102-T000", "NOPE", "",
                            "96611P2700        KL22", "96611p2700     001", "0K081 33211", "0K081 33211      KH11", "0K08133211", "0K20133065A" };
        ISheetLines list = new ListSheetLines(s), compact = Compact(s);
        Check.Equal(list.Count, compact.Count, "line count");
        foreach (string p in probes)
        {
            SheetLine a = list.Find(p), b = compact.Find(p);
            Check.Equal(a == null ? "(none)" : a.PartNumber + "|" + a.Bin + "|" + a.Description + "|" + a.SystemStock,
                        b == null ? "(none)" : b.PartNumber + "|" + b.Bin + "|" + b.Description + "|" + b.SystemStock, "same answer for '" + p + "'");
        }
        Check.Equal("Tab\there", compact.At(1).Description, "escaped text comes back");
        Check.Equal("96611P2700", compact.At(3).PartNumber, "lines in sheet order");
    }

    public static void TestCompactSheetKeepsHeaderAndRefusesDamagedFiles()
    {
        CountSheet s = SharedTests.Sample(false);
        CompactSheetLines c = Compact(s);
        Check.Equal(s.SheetNumber, c.Header.SheetNumber, "header");
        Check.Equal(s.Lines.Count, c.Header.DeclaredLines, "declared lines");
        Check.True(c.Find("1864421058N").SystemStock == null, "blind sheet carries no stock");
        string text = s.Serialize();
        string cut = text.Substring(0, text.LastIndexOf("END\t", StringComparison.Ordinal) - 5); // cut inside the last part line
        bool refused = false;
        try { CompactSheetLines.Read(new MemoryStream(Bytes(cut))); }
        catch (SheetFormatException) { refused = true; }
        Check.True(refused, "a file cut short is refused");
        refused = false;
        try { CompactSheetLines.Read(new MemoryStream(Bytes(text.Replace("END\t3", "END\t2")))); }
        catch (SheetFormatException) { refused = true; }
        Check.True(refused, "a wrong END count is refused");
    }

    public static void TestCompactSheetHandlesTheLegacyMaximum()
    {
        CountSheet s = SharedTests.Sample(false);
        s.Lines.Clear();
        for (int i = 1; i <= 38723; i++) s.Lines.Add(new SheetLine { Bin = "R" + (i % 40), PartNumber = "BT" + i.ToString("D7") + "A", Description = "Part " + i });
        CompactSheetLines c = Compact(s);
        Check.Equal(38723, c.Count, "all parts");
        Check.Equal("BT0038723A", c.Find("bt0038723a").PartNumber, "last part found");
        Check.Equal("BT0000001A", c.Find("BT0000001A      KL22").PartNumber, "first part found by label");
        Check.True(c.Find("BT0038724A") == null, "unknown part");
    }

    // Counting

    // ── Scan modes, parts left, find, last bin ──

    static CountSheet BinSheet()
    {
        CountSheet s = SharedTests.Sample(true);
        s.Lines.Clear();
        s.Lines.Add(new SheetLine { Bin = "A-1", PartNumber = "P100", Description = "First", SystemStock = 5 });
        s.Lines.Add(new SheetLine { Bin = "A-1", PartNumber = "P101-X", Description = "Second", SystemStock = 2 });
        s.Lines.Add(new SheetLine { Bin = "a1", PartNumber = "P102", Description = "Third (same bin, other spelling)" });
        s.Lines.Add(new SheetLine { Bin = "B-2", PartNumber = "Q200", Description = "Other bin" });
        s.Lines.Add(new SheetLine { Bin = "", PartNumber = "Q201", Description = "No bin" });
        return s;
    }

    public static void TestCountOneAddsOneAtATime()
    {
        CountSession s = Open(BinSheet(), Temp());
        PartInfo p = s.Lookup("p100");
        Check.Equal(1, s.CountOne("a-1", p, 1).Quantity, "first scan creates the entry with 1");
        Check.Equal(2, s.CountOne("A-1", p, 1).Quantity, "second scan makes 2");
        Check.Equal(1, s.Entries.Count, "one entry");
        Check.Equal(1, s.CountOne("A-1", p, -1).Quantity, "a removing scan takes one off");
        Check.Equal(0, s.CountOne("A-1", p, -1).Quantity, "down to zero");
        Check.Throws<CountException>(delegate { s.CountOne("A-1", p, -1); }, "not below zero");
        Check.Equal(1, s.Entries.Count, "the zero entry stays: it says none were found");
        Check.Equal(1, s.CountOne("B-2", p, 1).Quantity, "another bin is another entry");
    }

    public static void TestCountOneNeedsABinAndSomethingToRemove()
    {
        CountSession s = Open(BinSheet(), Temp());
        PartInfo p = s.Lookup("P100");
        Check.Throws<CountException>(delegate { s.CountOne("", p, 1); }, "no bin");
        Check.Throws<CountException>(delegate { s.CountOne("A-1", p, -1); }, "nothing to remove");
        Check.Equal(0, s.Entries.Count, "nothing saved");
        PartInfo off = s.Lookup("NOT-ON-SHEET");
        Check.True(s.CountOne("A-1", off, 1).Quantity == 1 && !s.Entries[0].OnSheet, "an off-sheet part is counted and marked");
    }

    public static void TestCountOneSurvivesARestart()
    {
        string dir = Temp();
        CountSession a = Open(BinSheet(), dir);
        PartInfo p = a.Lookup("P100");
        a.CountOne("A-1", p, 1); a.CountOne("A-1", p, 1); a.CountOne("A-1", p, 1);
        CountSession b = Open(BinSheet(), dir);
        Check.Equal(3, b.Entries[0].Quantity, "the count is saved with every scan");
        Check.Equal(1, b.Entries.Count, "still one entry");
    }

    public static void TestPartsLeftInBinListsOnlyUncountedParts()
    {
        CountSession s = Open(BinSheet(), Temp());
        int total;
        List<SheetHit> hits = s.PartsLeftInBin("A-1", 10, out total);
        Check.Equal(3, total, "three parts in the bin (the bin spelling a1 is the same bin)");
        Check.Equal("P100", hits[0].Line.PartNumber, "sheet order");
        Check.Equal(3, s.SheetPartsInBin("a1"), "parts the sheet lists for the bin");
        s.CountOne("A-1", s.Lookup("P101X"), 1); // found with the dash left out
        hits = s.PartsLeftInBin("A-1", 10, out total);
        Check.Equal(2, total, "counted part is gone from the list");
        Check.Equal("P100", hits[0].Line.PartNumber, "the others stay");
        s.Add("B-2", s.Lookup("P100"), 4, 0, ""); // counted in another bin still counts as counted
        hits = s.PartsLeftInBin("A-1", 1, out total);
        Check.Equal(1, total, "a part counted in any bin is not left");
        Check.Equal(1, hits.Count, "the list is capped, the total is not");
        Check.Equal(0, s.SheetPartsInBin("Z-9"), "a bin the sheet does not have");
        s.PartsLeftInBin("", 10, out total);
        Check.Equal(0, total, "no bin, nothing listed");
    }

    public static void TestFindPartsByStartOfPartNumber()
    {
        CountSession s = Open(BinSheet(), Temp());
        List<SheetHit> hits = s.FindParts("p10", 10);
        Check.Equal(3, hits.Count, "P100, P101-X, P102");
        s.Add("A-1", s.Lookup("P100"), 7, 0, "");
        hits = s.FindParts("P-100", 10);
        Check.Equal(1, hits.Count, "dashes in what was typed are ignored");
        Check.Equal(7, hits[0].CountedQty, "shows what is counted");
        Check.Equal(-1, s.FindParts("Q2", 10)[0].CountedQty, "not counted yet");
        Check.Equal(0, s.FindParts("ZZ", 10).Count, "none");
        Check.Equal(2, s.FindParts("P10", 2).Count, "capped");
    }

    public static void TestLastBinIsTheBinOfTheLastEntry()
    {
        string dir = Temp();
        CountSession a = Open(BinSheet(), dir);
        Check.Equal("", a.LastBin, "nothing counted yet");
        a.Add("A-1", a.Lookup("P100"), 1, 0, "");
        a.Add("B-2", a.Lookup("Q200"), 1, 0, "");
        a.Add("A-1", a.Lookup("P102"), 1, 0, "");
        Check.Equal("A-1", Open(BinSheet(), dir).LastBin, "after a restart, back in the last bin");
    }

    public static void TestUndefinedBinIsRefused()
    {
        CountSession s = Open(BinSheet(), Temp());
        Check.Throws<CountException>(delegate { s.Add("undefined", s.Lookup("P100"), 1, 0, ""); }, "UNDEFINED is not a bin");
        Check.Throws<CountException>(delegate { s.CountOne("UNDEFINED", s.Lookup("P100"), 1); }, "nor in scan mode");
        Check.Equal("The bin cannot be UNDEFINED", CountSession.BinRefusal(" undefined "), "refused as soon as the bin is entered");
        Check.Equal("", CountSession.BinRefusal("A-1"), "a real bin");
    }

    public static void TestPartLabelInTheBinBoxIsQuestioned()
    {
        CountSession s = Open(BinSheet(), Temp());
        Check.True(s.LooksLikePart("P100"), "a part on the sheet");
        Check.True(s.LooksLikePart("p-101-x"), "a part on the sheet, other spelling");
        Check.True(s.LooksLikePart("96611P2700        KL22"), "a Kia label with its model code");
        Check.True(!s.LooksLikePart("A-1"), "a bin");
        Check.True(!s.LooksLikePart("ZZ999"), "unknown text is taken as a bin");
        Check.True(!s.LooksLikePart(""), "blank");
    }

    public static void TestCompactSheetBinAndPartStartLookupsMatchTheList()
    {
        CountSheet s = BinSheet();
        ISheetLines list = new ListSheetLines(s), compact = Compact(s);
        foreach (string bin in new string[] { "A-1", "a1", "B-2", "Z-9", "", "  b2 " })
            Check.Equal(string.Join(",", Strings(list.LinesInBin(bin, 50))), string.Join(",", Strings(compact.LinesInBin(bin, 50))), "bin '" + bin + "'");
        foreach (string p in new string[] { "P", "p10", "P-101", "Q2", "ZZ", "", "P100", "P1000" })
            Check.Equal(string.Join(",", Strings(list.LinesWithPartStart(p, 50))), string.Join(",", Strings(compact.LinesWithPartStart(p, 50))), "part start '" + p + "'");
        Check.Equal(2, compact.LinesInBin("A-1", 2).Length, "capped");
    }

    // At CPD 38% of parts in stock list several bins in one field ("1D3/1D2/40A3"); each one is a real bin.
    static CountSheet MultiBinSheet()
    {
        CountSheet s = SharedTests.Sample(true);
        s.Lines.Clear();
        s.Lines.Add(new SheetLine { Bin = "1D3/1D2/40A3", PartNumber = "M100", Description = "Three bins" });
        s.Lines.Add(new SheetLine { Bin = "1D2", PartNumber = "M101", Description = "One bin" });
        s.Lines.Add(new SheetLine { Bin = "1D/ABJ-39", PartNumber = "M102", Description = "Prefix of another bin, other site" });
        s.Lines.Add(new SheetLine { Bin = "", PartNumber = "M103", Description = "No bin" });
        return s;
    }

    public static void TestPartWithSeveralBinsMatchesEachOfThem()
    {
        CountSession s = Open(MultiBinSheet(), Temp());
        PartInfo p = s.Lookup("M100");
        Check.Equal("", s.BinWarning("1D2", p), "middle bin of the list");
        Check.Equal("", s.BinWarning("40-a3", p), "last bin, other spelling");
        Check.Equal("Sheet bins are 1D3/1D2/40A3", s.BinWarning("1D", p), "a prefix of a bin is not the bin");
        Check.Equal("Sheet bins are 1D3/1D2/40A3", s.BinWarning("1D31D2", p), "the joined text is not a bin");
        Check.Equal("", s.BinWarning("ABJ39", s.Lookup("M102")), "bin from another site");

        CountSheet sheet = MultiBinSheet();
        ISheetLines list = new ListSheetLines(sheet), compact = Compact(sheet);
        foreach (string bin in new string[] { "1D2", "1d3", "40A3", "1D", "ABJ-39", "1D31D2", "", "/" })
            Check.Equal(string.Join(",", Strings(list.LinesInBin(bin, 50))), string.Join(",", Strings(compact.LinesInBin(bin, 50))), "bin '" + bin + "'");
        Check.Equal("0,1", string.Join(",", Strings(compact.LinesInBin("1D2", 50))), "F1 in 1D2 lists both parts");
        Check.Equal("2", string.Join(",", Strings(compact.LinesInBin("1D", 50))), "1D is only M102's bin");
        int left;
        s.PartsLeftInBin("40A3", 10, out left);
        Check.Equal(1, left, "parts left in the last bin of a list");
    }

    public static void TestBinListShowsEachBinWithPartsLeft()
    {
        CountSession s = Open(MultiBinSheet(), Temp());
        int noBin;
        List<BinSummary> bins = s.Bins(out noBin);
        Check.Equal("1D3,1D2,40A3,1D,ABJ-39", string.Join(",", BinNames(bins)), "each bin once, in sheet order, lists split");
        Check.Equal(1, noBin, "M103 has no bin");
        Check.Equal(2, bins[1].Parts, "1D2 holds M100 and M101");
        Check.Equal(2, bins[1].Left, "nothing counted yet");
        s.Add("1D2", s.Lookup("M100"), 3, 0, "");
        bins = s.Bins(out noBin);
        Check.Equal(1, bins[1].Left, "M100 counted");
        Check.Equal(0, bins[0].Left, "a part counted in one of its bins is done in the others too");

        CountSheet sheet = MultiBinSheet();
        ISheetLines list = new ListSheetLines(sheet), compact = Compact(sheet);
        for (int i = 0; i < list.Count; i++)
        {
            Check.Equal(list.BinText(i), compact.BinText(i), "bin text " + i);
            Check.Equal(list.PartText(i), compact.PartText(i), "part text " + i);
        }
    }

    public static void TestFastBinListMatchesTheSimpleOne()
    {
        CountSheet big = SharedTests.Sample(true);
        big.Lines.Clear();
        Random rnd = new Random(7);
        for (int i = 0; i < 38723; i++)
        {
            int n = rnd.Next(10) < 4 ? 1 + rnd.Next(4) : 1; // 40% of parts list several bins
            List<string> bins = new List<string>();
            for (int k = 0; k < n; k++) bins.Add((rnd.Next(3) == 0 ? "n-" : "N") + rnd.Next(60) + (char)('A' + rnd.Next(6)) + rnd.Next(5));
            big.Lines.Add(new SheetLine { Bin = rnd.Next(20) == 0 ? "" : string.Join("/", bins.ToArray()), PartNumber = "P" + i, Description = "x" });
        }
        foreach (CountSheet sheet in new CountSheet[] { MultiBinSheet(), big })
        {
            ISheetLines list = new ListSheetLines(sheet), compact = Compact(sheet);
            bool[] counted = new bool[list.Count];
            for (int i = 0; i < counted.Length; i += 3) counted[i] = true;
            int noA, noB;
            int t0 = Environment.TickCount;
            List<BinSummary> a = compact.BinSummaries(counted, out noA);
            int ms = Environment.TickCount - t0;
            List<BinSummary> b = list.BinSummaries(counted, out noB);
            Check.Equal(noB, noA, "no-bin lines");
            Check.Equal(b.Count, a.Count, "bins");
            for (int i = 0; i < a.Count; i++)
                Check.Equal(b[i].Bin + " " + b[i].Parts + " " + b[i].Left, a[i].Bin + " " + a[i].Parts + " " + a[i].Left, "bin " + i);
            if (sheet == big) Console.WriteLine("    bin list of 38,723 lines on this PC: " + ms + " ms, " + a.Count + " bins");
        }
    }

    static string[] BinNames(List<BinSummary> bins)
    {
        string[] r = new string[bins.Count];
        for (int i = 0; i < r.Length; i++) r[i] = bins[i].Bin;
        return r;
    }

    static string[] Strings(int[] numbers)
    {
        string[] r = new string[numbers.Length];
        for (int i = 0; i < r.Length; i++) r[i] = numbers[i].ToString();
        return r;
    }

    public static void TestSettingsRememberOnlyScanAdds()
    {
        string path = Path.Combine(Temp(), "settings.txt");
        Check.Equal(ScanMode.Type, DeviceSettings.Load(path).Mode, "default: type the quantity");
        DeviceSettings s = new DeviceSettings(path);
        s.Mode = ScanMode.Add; s.Save();
        Check.Equal(ScanMode.Add, DeviceSettings.Load(path).Mode, "each scan adds 1 is remembered");
        s.Mode = ScanMode.Remove; s.Save();
        Check.Equal(ScanMode.Type, DeviceSettings.Load(path).Mode, "removing is a correction: not remembered");
        File.WriteAllText(path, "garbage");
        Check.Equal(ScanMode.Type, DeviceSettings.Load(path).Mode, "a bad file is ignored");
    }

    public static void TestAddSavesImmediatelyAndSurvivesRestart()
    {
        string dir = Temp();
        CountSession a = Open(SharedTests.Sample(true), dir);
        PartInfo p = a.Lookup("1864421058n");
        a.Add("n-3a1", p, 18, 1, "Box torn");
        CountSession b = Open(SharedTests.Sample(true), dir); // "after a battery pull": a fresh session on the same file
        Check.Equal(1, b.Entries.Count, "entry kept");
        Check.Equal("N-3A1", b.Entries[0].Bin, "bin upper-cased");
        Check.Equal(18, b.Entries[0].Quantity, "quantity");
        Check.Equal(1, b.Entries[0].Damaged, "damaged");
        Check.Equal("Box torn", b.Entries[0].Remarks, "remark");
    }

    public static void TestSamePartInTwoBinsIsTwoEntries()
    {
        CountSession s = Open(SharedTests.Sample(true), Temp());
        PartInfo p = s.Lookup("1864421058N");
        s.Add("N-3A1", p, 10, 0, "");
        s.Add("QSB", p, 8, 0, "");
        Check.Equal(2, s.Entries.Count, "two entries");
        Check.Equal(1, s.CountedLines, "still one part of the sheet");
        Check.Equal("N-3A1: 10, QSB: 8", s.CountedSoFar("1864421058N"), "counted so far");
    }

    public static void TestSamePartAndBinAgainIsADuplicate()
    {
        CountSession s = Open(SharedTests.Sample(true), Temp());
        PartInfo p = s.Lookup("1864421058N");
        s.Add("N-3A1", p, 10, 0, "");
        CountEntry dup = s.FindDuplicate("N3A1", "1864421058N", 0);
        Check.True(dup != null, "found, ignoring the dash in the bin");
        Check.Throws<CountException>(delegate { s.Add("N-3A1", p, 1, 0, ""); }, "Add refuses a duplicate");
        s.AddTo(dup, 5, 1, "more");
        Check.Equal(15, s.Entries[0].Quantity, "added");
        Check.Equal(1, s.Entries[0].Damaged, "damaged added");
        s.Replace(s.Entries[0], 3, 0, "");
        Check.Equal(3, s.Entries[0].Quantity, "replaced");
        Check.Equal(1, s.Entries.Count, "still one entry");
    }

    public static void TestAddToSurvivesRestart()
    {
        string dir = Temp();
        CountSession a = Open(SharedTests.Sample(true), dir);
        PartInfo p = a.Lookup("1864421058N");
        CountEntry e = a.Add("N-3A1", p, 10, 0, "");
        a.AddTo(e, 5, 0, "");
        Check.Equal(15, Open(SharedTests.Sample(true), dir).Entries[0].Quantity, "reloaded total");
    }

    public static void TestEditAndDelete()
    {
        string dir = Temp();
        CountSession s = Open(SharedTests.Sample(true), dir);
        PartInfo p = s.Lookup("1864421058N");
        CountEntry a = s.Add("N-3A1", p, 10, 0, "");
        s.Add("QSB", p, 8, 0, "");
        s.Edit(a.Id, "N-3A1", p, 11, 2, "recount");
        Check.Equal(11, s.Entries[0].Quantity, "edited");
        Check.Throws<CountException>(delegate { s.Edit(a.Id, "QSB", p, 1, 0, ""); }, "edit that collides with another entry");
        s.Delete(a.Id);
        Check.Equal(1, s.Entries.Count, "deleted");
        Check.Equal(1, Open(SharedTests.Sample(true), dir).Entries.Count, "delete survives restart");
        CountEntry c = s.Add("N-3A1", p, 4, 0, "");
        Check.True(c.Id > a.Id, "an id is not reused after a delete");
    }

    public static void TestFinishLocksTheSheet()
    {
        string dir = Temp();
        CountSession s = Open(SharedTests.Sample(true), dir);
        PartInfo p = s.Lookup("1864421058N");
        CountEntry e = s.Add("N-3A1", p, 10, 0, "");
        s.Finish();
        Check.True(s.Finished, "finished");
        Check.Throws<CountException>(delegate { s.Add("QSB", p, 1, 0, ""); }, "no add");
        Check.Throws<CountException>(delegate { s.Delete(e.Id); }, "no delete");
        Check.Throws<CountException>(delegate { s.Replace(e, 1, 0, ""); }, "no change");
        Check.True(Open(SharedTests.Sample(true), dir).Finished, "still locked after restart");
    }

    public static void TestNotOnSheetAndBinWarnings()
    {
        CountSession s = Open(SharedTests.Sample(true), Temp());
        PartInfo known = s.Lookup("1864421058N");
        PartInfo stray = s.Lookup("zz-999");
        Check.True(known.OnSheet && !stray.OnSheet, "on sheet flags");
        Check.Equal("ZZ-999", stray.PartNumber, "stray part is upper-cased");
        Check.Equal("", s.BinWarning("N-3A1", known), "same bin: no warning");
        Check.Equal("", s.BinWarning("n3a1", known), "same bin ignoring dashes");
        Check.Equal("Sheet bin is N-3A1", s.BinWarning("QSB", known), "different bin warns");
        Check.Equal("", s.BinWarning("QSB", stray), "no sheet bin to compare");
        CountEntry e = s.Add("QSB", stray, 2, 0, "");
        Check.True(!e.OnSheet, "stray entry marked not on sheet");
        Check.Equal(0, s.CountedLines, "a stray part is not a counted sheet line");
        Check.Equal(3, s.UncountedLines, "all three sheet lines still uncounted");
    }

    public static void TestSystemStockOnlyWhenSheetAllows()
    {
        Check.Equal(57, Open(SharedTests.Sample(true), Temp()).Lookup("1864421058N").SystemStock.Value, "shown");
        Check.True(!Open(SharedTests.Sample(false), Temp()).Lookup("1864421058N").SystemStock.HasValue, "hidden on a blind sheet");
    }

    public static void TestSavingAfterTornRecordKeepsTheNewEntry()
    {
        string dir = Temp();
        CountSession s = Open(SharedTests.Sample(true), dir);
        PartInfo p = s.Lookup("1864421058N");
        s.Add("N-3A1", p, 10, 0, "");
        File.AppendAllText(Path.Combine(dir, "x.counts"), "E\t9\tB\tP\t1"); // power cut mid-record: no end marker, no line break
        CountSession r = Open(SharedTests.Sample(true), dir);
        Check.Equal(1, r.SkippedRecords, "torn record noticed");
        r.Add("QSB", r.Lookup("86110-2T000"), 4, 0, "");
        CountSession again = Open(SharedTests.Sample(true), dir);
        Check.Equal(2, again.Entries.Count, "the new entry is not swallowed by the torn one");
    }

    public static void TestQuantityParsing()
    {
        int v;
        Check.True(CountSession.TryParseCount("12", false, out v) && v == 12, "12");
        Check.True(!CountSession.TryParseCount("", false, out v), "blank quantity refused");
        Check.True(CountSession.TryParseCount("", true, out v) && v == 0, "blank damaged is zero");
        Check.True(!CountSession.TryParseCount("-1", false, out v), "negative");
        Check.True(!CountSession.TryParseCount("1.5", false, out v), "decimal");
        Check.True(!CountSession.TryParseCount("1000001", false, out v), "too large");
        Check.True(CountSession.TryParseCount(" 7 ", false, out v) && v == 7, "spaces trimmed");
    }

    public static void TestValidationLimits()
    {
        CountSession s = Open(SharedTests.Sample(true), Temp());
        PartInfo p = s.Lookup("1864421058N");
        Check.Throws<CountException>(delegate { s.Add(new string('B', 41), p, 1, 0, ""); }, "bin too long");
        Check.Throws<CountException>(delegate { s.Add("A", p, 1, 0, new string('x', 201)); }, "remark too long");
        Check.Throws<CountException>(delegate { s.Add("A", p, -1, 0, ""); }, "negative");
    }

    public static void TestRepositoryListsSheets()
    {
        string root = Temp();
        string dir = DeviceLayout.SheetsDir(root);
        Directory.CreateDirectory(dir);
        CountSheet sheet = SharedTests.Sample(true);
        File.WriteAllText(Path.Combine(dir, sheet.FileStem + ".sheet"), sheet.Serialize());
        File.WriteAllText(Path.Combine(dir, "BROKEN.sheet"), "junk");
        SheetRepository repo = new SheetRepository(root, Tick);
        CountSession s = repo.Open(sheet.FileStem);
        s.Add("N-3A1", s.Lookup("1864421058N"), 5, 0, "");
        List<SheetListItem> items = repo.List();
        Check.Equal(2, items.Count, "two files");
        SheetListItem broken = items.Find(delegate(SheetListItem i) { return i.Stem == "BROKEN"; });
        Check.True(broken.Error.Length > 0, "bad file flagged, not hidden");
        SheetListItem good = items.Find(delegate(SheetListItem i) { return i.Stem == sheet.FileStem; });
        Check.Equal("SHT-000001  3 parts  1 counted", good.Describe(), "list text");
    }
}
