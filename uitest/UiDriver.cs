using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using Danamotors.Hhdc;

/// <summary>
/// Drives the real DanamotorsCount.exe (the same binary that runs on the handheld) on this PC through a
/// counting session, then checks what it saved. Key messages are posted straight to the app's own
/// controls, so nothing depends on which window has the focus and nothing is typed into other programs.
/// The app's windows are kept off screen; screenshots are taken with DrawToBitmap.
///   UiDriver.exe DanamotorsCount.exe DATA_FOLDER SHOTS_FOLDER
/// DATA_FOLDER must hold sheets\*.sheet with the sheet from tests\ui\sample.sheet.
/// </summary>
public static class UiDriver
{
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
    const uint WM_KEYDOWN = 0x100, WM_KEYUP = 0x101, WM_CHAR = 0x102;

    static Form main;
    static Type mainType;
    static string shots;
    static readonly Queue<string> steps = new Queue<string>();
    static DateTime waitUntil = DateTime.MinValue;
    static readonly List<string> failures = new List<string>();
    static readonly Dictionary<string, int> vk = new Dictionary<string, int> {
        { "ENTER", 0x0D }, { "ESC", 0x1B }, { "F1", 0x70 }, { "F2", 0x71 }, { "F3", 0x72 }, { "F4", 0x73 }, { "DOWN", 0x28 }, { "UP", 0x26 }, { "DEL", 0x2E } };

    public static DateTime UtcNow() { return DateTime.UtcNow; }

    [STAThread]
    public static int Main(string[] args)
    {
        string exe = args[0], data = args[1];
        shots = args[2];
        Directory.CreateDirectory(shots);
        bool scanRun = Array.IndexOf(args, "--scan") >= 0;
        bool docRun = Array.IndexOf(args, "--doc") >= 0;
        if (docRun) WriteSampleDoc(data);
        else if (Array.IndexOf(args, "--sample") >= 0) WriteSample(data);
        Assembly asm = Assembly.LoadFrom(exe);
        mainType = asm.GetType("Danamotors.Hhdc.Device.MainForm");
        Type repoType = asm.GetType("Danamotors.Hhdc.Device.SheetRepository");
        Delegate clock = Delegate.CreateDelegate(asm.GetType("Danamotors.Hhdc.Clock"), typeof(UiDriver).GetMethod("UtcNow"));
        object repo = Activator.CreateInstance(repoType, data, clock);

        main = (Form)Activator.CreateInstance(mainType, repo);
        main.StartPosition = FormStartPosition.Manual;
        main.Location = new Point(-3000, -3000);
        main.Show();
        Check(main.ClientSize.Width == 318 && main.ClientSize.Height == 269, "client area is 318x269, was " + main.ClientSize.Width + "x" + main.ClientSize.Height);

        foreach (string s in (docRun ? DocScenario : scanRun ? ScanScenario : Scenario).Split('\n')) { string t = s.Trim(); if (t.Length > 0 && !t.StartsWith("#")) Tokenise(t); }
        Timer timer = new Timer { Interval = 60 };
        timer.Tick += delegate
        {
            foreach (Form f in Application.OpenForms) if (f.Left > -2000) f.Location = new Point(-3000, -3000); // keep dialogs off screen too
            if (DateTime.UtcNow < waitUntil) return;
            if (steps.Count == 0) { timer.Stop(); Application.Exit(); return; }
            Run(steps.Dequeue());
        };
        timer.Start();
        Application.Run();

        if (docRun) VerifyDocRun(data); else if (scanRun) VerifyScanRun(data); else VerifySavedFile(data);
        Console.WriteLine(failures.Count == 0 ? "UI test passed" : failures.Count + " UI check(s) failed");
        foreach (string f in failures) Console.WriteLine("  FAIL " + f);
        return failures.Count == 0 ? 0 : 1;
    }

    // ── The session ──
    // Plain text is typed; {ENTER} {ESC} {F2} {F3} {F4} {DOWN} {UP} {DEL} are keys; {WAIT:ms} pauses;
    // {SHOT:name} saves a screenshot; {EXPECT:field~text} checks that a label contains text.
    const string Scenario = @"
# open the first sheet
{ENTER}{WAIT:300}
Aisle 1 Rack 1{ENTER}
BELT-SERP-002{ENTER}{WAIT:100}{SHOT:03_part_found}
{EXPECT:lblInfo~Serpentine Belt}{EXPECT:lblInfo~System stock: 46}
40{ENTER}1{ENTER}box torn{SHOT:04_filled}{ENTER}{WAIT:100}
{EXPECT:lblStatus~Saved BELT-SERP-002}{SHOT:05_saved}
# a scan with no Enter after it: the pause must end it and move to Qty
SUS-BALL-JNT{WAIT:700}{EXPECT:lblInfo~Ball Joint}
21{ENTER}{ENTER}{ENTER}{WAIT:100}
# same part in another bin, which is not the sheet's bin
{F3}Aisle 2 Rack 9{ENTER}BELT-SERP-002{ENTER}{WAIT:100}{EXPECT:lblWarn~Sheet bin is Aisle 1 Rack 1}{EXPECT:lblInfo~Counted: AISLE 1 RACK 1: 40}
6{ENTER}{ENTER}{ENTER}{WAIT:100}
# same part and bin again: add or replace; choose 1 = add
BELT-SERP-002{ENTER}2{ENTER}{ENTER}{ENTER}{WAIT:300}{SHOT:07_duplicate_dialog}1{WAIT:200}
{EXPECT:lblStatus~Saved BELT-SERP-002  8}
# a part that is not on the sheet: asks first
ZZ-NOT-ON-SHEET{ENTER}{WAIT:100}{EXPECT:lblWarn~NOT ON THIS SHEET}3{ENTER}{ENTER}{ENTER}{WAIT:300}{SHOT:08_not_on_sheet_dialog}1{WAIT:200}
# a part on the sheet in the wrong bin: warns but allows
{F3}Aisle 7 Rack 7{ENTER}AC-GAS-R134A{ENTER}{WAIT:100}{SHOT:09_wrong_bin_warning}9{ENTER}1{ENTER}{ENTER}{WAIT:100}
# bad quantity is refused
SUS-BALL-JNT{ENTER}x{ENTER}{ENTER}{ENTER}{WAIT:100}{EXPECT:lblStatus~Enter the quantity}{F4}
# a count with no bin asks first; Esc saves nothing and goes back to the bin
{F3}{DEL}{DOWN}SUS-BALL-JNT{ENTER}5{ENTER}{ENTER}{ENTER}{WAIT:300}{SHOT:09b_no_bin_dialog}{ESC}{WAIT:200}{F4}
# review, edit one, cancel, delete one
{F2}{WAIT:300}{SHOT:10_review}
{ENTER}{WAIT:300}{SHOT:11_edit}{ESC}{WAIT:300}
{DOWN}2{WAIT:300}{SHOT:11b_delete_dialog}1{WAIT:300}
# finish: confirm, then dismiss the message
{F4}{WAIT:300}{SHOT:12_finish_dialog}1{WAIT:300}{SHOT:13_finished_message}1{WAIT:300}
{SHOT:14_sheets_after}
";

    // The scan modes, Find and the bin guard. The menu is Esc; its 4th choice is Scan mode (1 type, 2 adds 1, 3 removes 1).
    const string ScanScenario = @"
{ENTER}{WAIT:300}
{ESC}{WAIT:300}4{WAIT:300}2{WAIT:300}{SHOT:20_scan_mode_chosen}
{EXPECT:lblBig~EACH SCAN ADDS 1}
Aisle 1 Rack 1{ENTER}
BELT-SERP-002{ENTER}{WAIT:100}{EXPECT:lblBig~BELT-SERP-002  +1  =  1 in AISLE 1 RACK 1}
BELT-SERP-002{ENTER}{WAIT:100}
BELT-SERP-002{ENTER}{WAIT:100}{EXPECT:lblBig~=  3 in AISLE 1 RACK 1}{EXPECT:lblInfo~Serpentine Belt}{SHOT:21_three_scans}
# one scan too many: switch to removing, take one off, switch back
{ESC}{WAIT:300}4{WAIT:300}3{WAIT:300}
BELT-SERP-002{ENTER}{WAIT:100}{EXPECT:lblBig~BELT-SERP-002  -1  =  2 in AISLE 1 RACK 1}
{ESC}{WAIT:300}4{WAIT:300}2{WAIT:300}
# what is left in this bin: only the ball joint
{F1}{WAIT:200}{EXPECT:findTitle~1 of 2 parts left}{SHOT:22_parts_left}
{ENTER}{WAIT:200}{EXPECT:lblInfo~Ball Joint}
# find a part anywhere on the sheet by the start of its number, then count it in this bin (not its sheet bin)
{F1}{WAIT:200}ac{WAIT:200}{EXPECT:findTitle~1 part(s) found}{SHOT:23_find}{ENTER}{WAIT:200}
{EXPECT:lblInfo~Refrigerant}{ENTER}{WAIT:100}{EXPECT:lblBig~AC-GAS-R134A  +1  =  1 in AISLE 1 RACK 1}{EXPECT:lblWarn~Sheet bin is Aisle 1 Rack 12}
# a part label scanned into the Bin box is not taken as a bin unless confirmed
{F3}96611P2700  KL22{ENTER}{WAIT:300}{SHOT:24_label_as_bin}{ESC}{WAIT:200}{EXPECT:lblStatus~Scan the BIN label}
# a part label scanned into the Bin box by mistake: choice 1 counts it as the part in the bin in use
{F3}BELT-SERP-002  KL22{ENTER}{WAIT:300}1{WAIT:300}{EXPECT:lblBig~BELT-SERP-002  +1  =  3 in AISLE 1 RACK 1}{SHOT:24b_label_counted}
# no bin chosen: F1 lists the sheet's bins; Enter goes to the first one and lists its parts left; F1 goes back to the bins
{F3}{DEL}{F1}{WAIT:300}{EXPECT:findTitle~bins,}{SHOT:25_bins}
{ENTER}{WAIT:200}{EXPECT:findTitle~AISLE 1 RACK 1:}{SHOT:26_bin_chosen}
{F1}{WAIT:300}{EXPECT:findTitle~with parts left}{ESC}{WAIT:200}
";

    // An indent pick: two lines in bin order. Scans add 1 and move on when a line is done; a typed short asks a reason;
    // an unknown part is recorded as found instead; Finish asks first. Labels on the document screen are DocForm's.
    const string DocScenario = @"
{ENTER}{WAIT:400}{SHOT:30_doc_open}{EXPECT:lblBig~PICKED 0 of 2}{EXPECT:lblWhere~Bin AISLE 1 RACK 1}
belt-serp-002{ENTER}{WAIT:100}{EXPECT:lblBig~PICKED 1 of 2}
belt-serp-002{ENTER}{WAIT:150}{EXPECT:lblPart~AC-GAS-R134A}{EXPECT:lblStatus~Line done}{SHOT:31_next_line}
# one too many of the first part is refused
belt-serp-002{ENTER}{WAIT:150}{EXPECT:lblStatus~All 2 already picked}
ac-gas-r134a{ENTER}{WAIT:100}{EXPECT:lblBig~PICKED 1 of 3}
# type the quantity: 2 of 3 asks why
{F2}{WAIT:150}2{ENTER}{WAIT:400}{SHOT:32_reason}3{WAIT:300}{EXPECT:lblNote~Short: Less in the bin}
# a part that is not on the document
zz-other{ENTER}{WAIT:400}{SHOT:33_not_on_doc}1{WAIT:300}{EXPECT:lblNote~Found instead: ZZ-OTHER}
{F1}{WAIT:200}{EXPECT:linesTitle~2 of 2 lines done}{SHOT:34_lines}{ESC}{WAIT:200}
{F4}{WAIT:400}{SHOT:35_finish}1{WAIT:400}{SHOT:36_finished}1{WAIT:400}
{SHOT:37_list_after}
";

    static void Tokenise(string line)
    {
        int i = 0;
        StringBuilder text = new StringBuilder();
        while (i < line.Length)
        {
            if (line[i] == '{')
            {
                int close = line.IndexOf('}', i);
                if (text.Length > 0) { steps.Enqueue("T:" + text); text.Length = 0; }
                steps.Enqueue("K:" + line.Substring(i + 1, close - i - 1));
                i = close + 1;
            }
            else text.Append(line[i++]);
        }
        if (text.Length > 0) steps.Enqueue("T:" + text);
    }

    static void Run(string step)
    {
        string kind = step.Substring(0, 2), body = step.Substring(2);
        if (kind == "T:") { foreach (char c in body) Type(c); return; }
        if (body.StartsWith("WAIT:")) { waitUntil = DateTime.UtcNow.AddMilliseconds(int.Parse(body.Substring(5))); return; }
        if (body.StartsWith("SHOT:")) { Shot(body.Substring(5)); return; }
        if (body.StartsWith("EXPECT:")) { Expect(body.Substring(7)); return; }
        Press(vk[body], 0);
        waitUntil = DateTime.UtcNow.AddMilliseconds(120);
    }

    /// <summary>The window and control that would get the key: a dialog if one is open, else the app's focused field.</summary>
    static IntPtr Target()
    {
        Form top = Top();
        // The document screen takes keys in its scan box (its form previews the function keys).
        if (top.GetType().Name == "DocForm") return ((Control)FieldOf(top, "txtScan")).Handle;
        if (top != main) return top.Handle;
        Control focused = (Control)Field("focused");
        return focused != null ? focused.Handle : main.Handle;
    }

    static object Field(string name)
    {
        return mainType.GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).GetValue(main);
    }

    /// <summary>The window in front: a dialog or the document screen if one is open, else the main window.</summary>
    static Form Top()
    {
        Form top = main;
        foreach (Form f in Application.OpenForms) if (f != main && f.Visible) top = f;
        return top;
    }

    static object FieldOf(Form f, string name)
    {
        FieldInfo fi = f.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic);
        return fi == null ? null : fi.GetValue(f);
    }

    // A character is posted as the key that produces it: the message loop's TranslateMessage then makes the
    // WM_CHAR, exactly once, as for a real key. (Posting WM_CHAR as well typed every character twice.)
    // There is no Shift, so letters arrive in lower case; the app upper-cases bins and parts itself.
    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);

    static void Post(int key)
    {
        IntPtr t = Target();
        IntPtr down = (IntPtr)(1 | (MapVirtualKey((uint)key, 0) << 16));
        PostMessage(t, WM_KEYDOWN, (IntPtr)key, down);
        PostMessage(t, WM_KEYUP, (IntPtr)key, (IntPtr)(unchecked((int)(0xC0000001 | (MapVirtualKey((uint)key, 0) << 16)))));
    }

    static void Press(int key, int ch)
    {
        Post(key);
    }

    static void Type(char c)
    {
        int key = char.IsLetterOrDigit(c) && c < 128 ? char.ToUpper(c) : c == ' ' ? 0x20 : c == '-' ? 0xBD : c == '.' ? 0xBE : 0;
        if (key == 0) throw new InvalidOperationException("The test driver cannot type '" + c + "'");
        Post(key);
    }

    static bool IsMainField(IntPtr t)
    {
        Control c = Control.FromHandle(t);
        return c is TextBox;
    }

    static bool FocusedIsTextBox()
    {
        return Field("focused") is TextBox;
    }

    static void Shot(string name)
    {
        Form top = main;
        foreach (Form f in Application.OpenForms) if (f != main && f.Visible) top = f;
        using (Bitmap bmp = new Bitmap(top.ClientSize.Width, top.ClientSize.Height))
        {
            top.DrawToBitmap(bmp, new Rectangle(Point.Empty, bmp.Size));
            bmp.Save(Path.Combine(shots, name + ".png"), ImageFormat.Png);
        }
    }

    static void Expect(string spec)
    {
        string[] p = spec.Split('~');
        // A label of the document screen when it is open (dialogs have no such fields), else of the main window.
        object own = null;
        foreach (Form f in Application.OpenForms) if (f.GetType().Name == "DocForm") own = FieldOf(f, p[0]);
        string text = ((Control)(own ?? Field(p[0]))).Text;
        Check(text.IndexOf(p[1], StringComparison.Ordinal) >= 0, p[0] + " should contain [" + p[1] + "] but is [" + text.Replace("\r\n", " | ") + "]");
    }

    static void Check(bool ok, string what)
    {
        if (!ok) failures.Add(what);
    }

    static void VerifySavedFile(string data)
    {
        string path = Directory.GetFiles(Path.Combine(data, "sheets"), "*.counts")[0];
        CountState s = CountLog.Replay(File.ReadAllLines(path));
        Check(s.Finished, "the sheet is finished and locked");
        Check(s.Skipped == 0, "no unreadable records");
        // Left after the session: belt in two bins (one of them added to), the stray part, the gas; the ball joint was deleted.
        Check(s.Entries.Count == 4, "4 entries remain, found " + s.Entries.Count);
        CountEntry belt1 = Find(s, "AISLE 1 RACK 1", "BELT-SERP-002");
        Check(belt1 != null && belt1.Quantity == 40 && belt1.Damaged == 1 && belt1.Remarks == "box torn", "belt in rack 1: 40 + 1 damaged, remark kept");
        CountEntry belt2 = Find(s, "AISLE 2 RACK 9", "BELT-SERP-002");
        Check(belt2 != null && belt2.Quantity == 8, "belt in rack 9: 6 added to 2 = 8");
        CountEntry stray = Find(s, "AISLE 2 RACK 9", "ZZ-NOT-ON-SHEET");
        Check(stray != null && stray.Quantity == 3 && !stray.OnSheet, "stray part counted and marked not on sheet");
        CountEntry gas = Find(s, "AISLE 7 RACK 7", "AC-GAS-R134A");
        Check(gas != null && gas.Quantity == 9 && gas.Damaged == 1, "gas counted in the wrong bin, as typed");
        Check(Find(s, "AISLE 1 RACK 1", "SUS-BALL-JNT") == null, "ball joint was deleted in review");
    }

    static void VerifyScanRun(string data)
    {
        string path = Directory.GetFiles(Path.Combine(data, "sheets"), "*.counts")[0];
        CountState s = CountLog.Replay(File.ReadAllLines(path));
        Check(s.Skipped == 0, "no unreadable records");
        Check(!s.Finished, "the sheet is not finished");
        Check(s.Entries.Count == 2, "2 entries, found " + s.Entries.Count);
        CountEntry belt = Find(s, "AISLE 1 RACK 1", "BELT-SERP-002");
        Check(belt != null && belt.Quantity == 3, "belt: three scans, one removed, one label scanned into the Bin box and counted = 3");
        CountEntry gas = Find(s, "AISLE 1 RACK 1", "AC-GAS-R134A");
        Check(gas != null && gas.Quantity == 1 && gas.OnSheet, "gas found with Find, counted once in this bin");
        string settings = File.ReadAllText(Path.Combine(data, "settings.txt"));
        Check(settings.StartsWith("scanmode\tadd"), "each scan adds 1 is remembered, was [" + settings.Trim() + "]");
    }

    /// <summary>The same parts as the local dev database has, so this session also runs against a sheet from the server.</summary>
    static void WriteSample(string data)
    {
        CountSheet s = new CountSheet();
        s.StockTakeId = "t"; s.SheetId = "s"; s.SheetNumber = "SAMPLE-1"; s.BatchNumber = "B1"; s.Branch = "Test"; s.ShowSystemStock = true; s.SentAtUtc = DateTime.UtcNow;
        s.Lines.Add(new SheetLine { Bin = "Aisle 1 Rack 1", PartNumber = "BELT-SERP-002", Description = "Serpentine Belt (Heavy Duty)", SystemStock = 46 });
        s.Lines.Add(new SheetLine { Bin = "Aisle 1 Rack 1", PartNumber = "SUS-BALL-JNT", Description = "Ball Joint", SystemStock = 21 });
        s.Lines.Add(new SheetLine { Bin = "Aisle 1 Rack 12", PartNumber = "AC-GAS-R134A", Description = "Refrigerant R-134a (330g)", SystemStock = 56 });
        Directory.CreateDirectory(Path.Combine(data, "sheets"));
        File.WriteAllText(Path.Combine(data, "sheets", "SAMPLE-1.sheet"), s.Serialize());
    }

    static void VerifyDocRun(string data)
    {
        string path = Directory.GetFiles(Path.Combine(data, "sheets"), "*.hlog")[0];
        PickState s = PickLog.Replay(File.ReadAllLines(path));
        Check(s.Finished, "the document is finished and locked");
        Check(s.Skipped == 0, "no unreadable records");
        LineResult belt = s.Result("l1"), gas = s.Result("l2");
        Check(belt != null && belt.Quantity == 2 && belt.Reason == "", "belt: 2 of 2 picked by scanning, the third scan refused");
        Check(gas != null && gas.Quantity == 2 && gas.Reason == "LESS_IN_BIN", "gas: 2 of 3 typed, short reason Less in the bin");
        Check(gas != null && gas.Scanned == "ZZ-OTHER", "the unknown part is recorded as found instead");
    }

    /// <summary>An indent pick with the parts of the sample sheet.</summary>
    static void WriteSampleDoc(string data)
    {
        HandheldDoc d = new HandheldDoc();
        d.DocumentId = "doc-ui"; d.DocumentNumber = "2026000099"; d.Type = DocTypes.IndentPick; d.Reference = "2026000214";
        d.Party = "Kia Plaza"; d.Branch = "CPD"; d.Picker = "Picker 00015"; d.SentAtUtc = DateTime.UtcNow;
        d.Lines.Add(new DocLine { Id = "l1", Number = 1, Bin = "AISLE 1 RACK 1", PartNumber = "BELT-SERP-002", Description = "Serpentine Belt (Heavy Duty)", Expected = 2 });
        d.Lines.Add(new DocLine { Id = "l2", Number = 2, Bin = "AISLE 1 RACK 12", PartNumber = "AC-GAS-R134A", Description = "Refrigerant R-134a (330g)", Expected = 3 });
        Directory.CreateDirectory(Path.Combine(data, "sheets"));
        File.WriteAllText(Path.Combine(data, "sheets", d.FileStem + ".hdoc"), d.Serialize());
    }

    static CountEntry Find(CountState s, string bin, string part)
    {
        foreach (CountEntry e in s.Entries) if (e.Bin == bin && e.PartNumber == part) return e;
        return null;
    }
}
