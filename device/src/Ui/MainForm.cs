using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace Danamotors.Hhdc.Device
{
    /// <summary>
    /// The one window of Danamotors Count, built for the MC3190's 318x269 client area and its keypad.
    /// Three screens share it: the sheet list, counting, and review. All rules live in CountSession;
    /// this class only shows state and passes keys.
    /// </summary>
    public sealed class MainForm : Form
    {
        enum Screen { Sheets, Count, Review, Find }

        static readonly Color Ink = Color.Black;
        static readonly Color Warn = Color.FromArgb(190, 0, 0);
        static readonly Color Good = Color.FromArgb(0, 110, 0);

        readonly SheetRepository repo;
        readonly Timer scanTimer = new Timer();
        readonly ScanDetector scan = new ScanDetector();

        // Sheet list
        readonly Panel sheetsPanel = new Panel();
        readonly Label sheetsTitle = new Label();
        readonly ListBox sheetsList = new ListBox();
        readonly Label sheetsHelp = new Label();
        List<SheetListItem> sheetItems = new List<SheetListItem>();

        // Counting
        readonly Panel countPanel = new Panel();
        readonly Label countTitle = new Label();
        readonly TextBox txtBin = new TextBox();
        readonly TextBox txtPart = new TextBox();
        readonly Label lblInfo = new Label();
        readonly Label lblWarn = new Label();
        readonly TextBox txtQty = new TextBox();
        readonly TextBox txtDmg = new TextBox();
        readonly TextBox txtNote = new TextBox();
        readonly Label lblStatus = new Label();
        readonly Label countKeys = new Label();
        readonly Label lblBig = new Label();               // the mode and the last scan, in the scan modes
        readonly List<Control> typeRows = new List<Control>(); // quantity, damaged and note: hidden in the scan modes

        // Parts left in the bin / find a part
        readonly Panel findPanel = new Panel();
        readonly Label findTitle = new Label();
        readonly TextBox txtFind = new TextBox();
        readonly ListBox findList = new ListBox();
        readonly Label findKeys = new Label();
        List<SheetHit> findHits = new List<SheetHit>();
        const int FindMax = 100;
        bool findBins;                                      // the F1 screen lists bins, not parts
        List<BinSummary> allBins = new List<BinSummary>();  // worked out when the bin list is opened
        List<BinSummary> binHits = new List<BinSummary>();  // the bins shown (filtered by what is typed)
        int noBinParts;
        const int BinsShown = 300;

        // Review
        readonly Panel reviewPanel = new Panel();
        readonly Label reviewTitle = new Label();
        readonly ListBox reviewList = new ListBox();
        readonly Label reviewKeys = new Label();

        Control focused;
        Screen screen = Screen.Sheets;
        CountSession session;
        PartInfo part;            // the part currently looked up
        string committedPart = ""; // text of the part box that part was looked up for
        string workBin = "";       // the bin counting is in: last accepted in the Bin box, chosen from the list, or saved
        int editingId;            // entry being edited from the review screen, 0 for a new one
        List<CountEntry> reviewEntries = new List<CountEntry>();
        DeviceSettings settings;
        ScanMode mode = ScanMode.Type;
        readonly Dictionary<string, bool> offSheetOk = new Dictionary<string, bool>(); // off-sheet parts already confirmed in the scan modes

        /// <summary>The quantity, damaged and note boxes are in use: typing mode, or an entry being edited.</summary>
        bool TypingUi { get { return mode == ScanMode.Type || editingId != 0; } }

        public MainForm(SheetRepository repo)
        {
            this.repo = repo;
            settings = DeviceSettings.Load(System.IO.Path.Combine(System.IO.Path.GetDirectoryName(repo.Directory), "settings.txt"));
            Text = "Danamotors Count";
            MinimizeBox = false;
            MaximizeBox = false;
            KeyPreview = true;
            BackColor = Color.White;
            if (Environment.OSVersion.Platform != PlatformID.WinCE)
            {
                // On a PC, show the same 318x269 area the device gives.
                FormBorderStyle = FormBorderStyle.FixedSingle;
                ClientSize = new Size(318, 269);
            }

            BuildSheets();
            BuildCount();
            BuildReview();
            BuildFind();
            foreach (Panel p in new Panel[] { sheetsPanel, countPanel, reviewPanel, findPanel })
            {
                p.Bounds = new Rectangle(0, 0, 318, 269);
                p.BackColor = Color.White;
                Controls.Add(p);
            }
            mode = settings.Mode; // after the boxes exist: the keypad order depends on the mode

            scanTimer.Interval = 40;
            scanTimer.Tick += OnScanTick;
            scanTimer.Enabled = true;
            ShowSheets();
            CheckScanner();
        }

        /// <summary>Starts DataWedge if it is not running (the trigger does nothing without it). Logged to timing.log.</summary>
        void CheckScanner()
        {
            int t0 = Environment.TickCount;
            string s = Scanner.EnsureRunning();
            if (s.Length > 0) Timing(s, t0);
        }

        // ── Layout ────────────────────────────────────────────────────────────────

        static Font Bold(float size) { return new Font(FontFamily.GenericSansSerif, size, FontStyle.Bold); }
        static Font Plain(float size) { return new Font(FontFamily.GenericSansSerif, size, FontStyle.Regular); }

        static Label MakeLabel(Panel on, string text, int x, int y, int w, int h, Font font)
        {
            Label l = new Label();
            l.Text = text;
            l.Font = font;
            l.Bounds = new Rectangle(x, y, w, h);
            on.Controls.Add(l);
            return l;
        }

        static void Place(Panel on, TextBox t, int x, int y, int w, int maxLength)
        {
            t.Font = Bold(12f);
            t.Bounds = new Rectangle(x, y, w, 26);
            t.MaxLength = maxLength;
            on.Controls.Add(t);
        }

        void BuildSheets()
        {
            sheetsTitle.Text = "Count sheets";
            sheetsTitle.Font = Bold(11f);
            sheetsTitle.Bounds = new Rectangle(4, 2, 310, 22);
            sheetsPanel.Controls.Add(sheetsTitle);
            sheetsList.Font = Bold(10f);
            sheetsList.Bounds = new Rectangle(4, 26, 310, 180);
            sheetsPanel.Controls.Add(sheetsList);
            sheetsHelp.Font = Plain(9f);
            sheetsHelp.Bounds = new Rectangle(4, 210, 310, 56);
            sheetsPanel.Controls.Add(sheetsHelp);
        }

        void BuildCount()
        {
            countTitle.Font = Bold(9f);
            countTitle.Bounds = new Rectangle(4, 2, 310, 18);
            countPanel.Controls.Add(countTitle);

            MakeLabel(countPanel, "Bin", 4, 24, 44, 22, Bold(10f));
            Place(countPanel, txtBin, 50, 22, 262, CountSession.MaxCodeLength);
            MakeLabel(countPanel, "Part", 4, 52, 44, 22, Bold(10f));
            Place(countPanel, txtPart, 50, 50, 262, CountSession.MaxCodeLength);

            lblInfo.Font = Plain(9f);
            lblInfo.Bounds = new Rectangle(4, 79, 310, 40);
            countPanel.Controls.Add(lblInfo);
            lblWarn.Font = Bold(9f);
            lblWarn.ForeColor = Warn;
            lblWarn.Bounds = new Rectangle(4, 120, 310, 30);
            countPanel.Controls.Add(lblWarn);

            typeRows.Add(MakeLabel(countPanel, "Qty", 4, 156, 44, 22, Bold(10f)));
            Place(countPanel, txtQty, 50, 154, 80, 7);
            typeRows.Add(MakeLabel(countPanel, "Dmg", 140, 156, 44, 22, Bold(10f)));
            Place(countPanel, txtDmg, 186, 154, 80, 7);
            typeRows.Add(MakeLabel(countPanel, "Note", 4, 184, 44, 22, Bold(10f)));
            Place(countPanel, txtNote, 50, 182, 262, CountSession.MaxRemarkLength);
            typeRows.Add(txtQty);
            typeRows.Add(txtDmg);
            typeRows.Add(txtNote);

            // In the scan modes the three boxes above give way to the mode and the result of the last scan.
            lblBig.Font = Bold(11f);
            lblBig.Bounds = new Rectangle(4, 154, 310, 54);
            lblBig.Visible = false;
            countPanel.Controls.Add(lblBig);

            lblStatus.Font = Bold(9f);
            lblStatus.Bounds = new Rectangle(4, 212, 310, 22);
            countPanel.Controls.Add(lblStatus);
            countKeys.Font = Plain(8f);
            countKeys.Text = "Enter=next F1=Find F2=Review F3=New bin F4=Clear part Esc=Menu";
            countKeys.Bounds = new Rectangle(4, 238, 310, 28);
            countPanel.Controls.Add(countKeys);

            foreach (TextBox t in new TextBox[] { txtBin, txtPart, txtQty, txtDmg, txtNote })
            {
                t.KeyPress += OnFieldKeyPress;
            }
            foreach (TextBox t in Fields) t.GotFocus += delegate(object sender, EventArgs e) { focused = (Control)sender; };
            txtQty.GotFocus += delegate { EnsurePartLooked(); };
        }

        void BuildFind()
        {
            findTitle.Font = Bold(10f);
            findTitle.Bounds = new Rectangle(4, 2, 310, 22);
            findPanel.Controls.Add(findTitle);
            Place(findPanel, txtFind, 4, 26, 310, CountSession.MaxCodeLength);
            findList.Font = Plain(10f);
            findList.Bounds = new Rectangle(4, 56, 310, 176);
            findPanel.Controls.Add(findList);
            findKeys.Font = Plain(8f);
            findKeys.Bounds = new Rectangle(4, 236, 310, 30);
            findPanel.Controls.Add(findKeys);
            txtFind.KeyPress += OnFieldKeyPress;
            txtFind.TextChanged += delegate { if (screen == Screen.Find) RefreshFind(); };
        }

        void BuildReview()
        {
            reviewTitle.Font = Bold(10f);
            reviewTitle.Bounds = new Rectangle(4, 2, 310, 22);
            reviewPanel.Controls.Add(reviewTitle);
            reviewList.Font = Plain(10f);
            reviewList.Bounds = new Rectangle(4, 26, 310, 206);
            reviewPanel.Controls.Add(reviewList);
            reviewKeys.Font = Plain(8f);
            reviewKeys.Bounds = new Rectangle(4, 236, 310, 30);
            reviewPanel.Controls.Add(reviewKeys);
        }

        // ── Screens ───────────────────────────────────────────────────────────────

        void ShowSheets()
        {
            screen = Screen.Sheets;
            session = null;
            int t0 = Environment.TickCount;
            sheetItems = repo.List();
            Timing("list " + sheetItems.Count + " sheets", t0);
            sheetsList.Items.Clear();
            foreach (SheetListItem item in sheetItems) sheetsList.Items.Add(item.Describe());
            if (sheetItems.Count > 0) sheetsList.SelectedIndex = 0;
            sheetsHelp.Text = sheetItems.Count == 0
                ? "No sheets on this device.\r\nDock it and use HHDC Link on the PC: Send to device.\r\nEsc = exit"
                : "Up/Down = choose   Enter = open   Esc = exit";
            countPanel.Visible = false;
            reviewPanel.Visible = false;
            findPanel.Visible = false;
            sheetsPanel.Visible = true;
            FocusOn(sheetsList);
        }

        /// <summary>Best-effort timing log (timing.log next to the sheets folder), to see how slow the handheld really is.</summary>
        void Timing(string what, int startTick)
        {
            try
            {
                using (StreamWriter w = new StreamWriter(Path.Combine(Path.GetDirectoryName(repo.Directory), "timing.log"), true))
                    w.WriteLine(DateTime.UtcNow.ToString("HH:mm:ss") + " " + what + " " + unchecked(Environment.TickCount - startTick) + " ms");
            }
            catch (IOException) { }
        }

        void OpenSheet(SheetListItem item)
        {
            if (item.Error.Length > 0)
            {
                ChoiceDialog.Tell(this, "Bad sheet file", item.Error + "\r\n\r\nAsk the store to send the sheet again.");
                return;
            }
            // A big sheet takes a while to read on the handheld: say so, show the hourglass.
            Cursor.Current = Cursors.WaitCursor;
            sheetsHelp.Text = "Opening " + item.Number + "...";
            sheetsHelp.Refresh();
            int t0 = Environment.TickCount;
            try { session = repo.Open(item.Stem); Timing("open " + item.Number + " (" + item.Lines + " parts; " + repo.LastOpenTiming + ")", t0); }
            catch (Exception ex)
            {
                Cursor.Current = Cursors.Default;
                ChoiceDialog.Tell(this, "Cannot open sheet", ex.Message);
                return;
            }
            finally { Cursor.Current = Cursors.Default; }
            if (session.SkippedRecords > 0)
                ChoiceDialog.Tell(this, "Count file", session.SkippedRecords + " unreadable record(s) were ignored (a battery pull while saving?). Check the review screen.");
            txtBin.Text = session.LastBin; // carry on in the bin the last entry was counted in (never the previous sheet's bin)
            workBin = txtBin.Text;
            offSheetOk.Clear();
            CheckScanner();
            if (session.Finished) ShowReview(); else ShowCount();
        }

        void ShowCount()
        {
            screen = Screen.Count;
            editingId = 0;
            ClearEntry(false);
            ApplyMode();
            SetStatus(txtBin.Text.Length == 0 ? "Pull the trigger to scan the BIN label" : "Pull the trigger to scan the PART label", Good);
            RefreshTitle();
            sheetsPanel.Visible = false;
            reviewPanel.Visible = false;
            findPanel.Visible = false;
            countPanel.Visible = true;
            FocusOn(txtBin.Text.Length == 0 ? txtBin : txtPart);
            scan.Reset();
        }

        void ShowReview()
        {
            screen = Screen.Review;
            RefreshReview();
            sheetsPanel.Visible = false;
            countPanel.Visible = false;
            findPanel.Visible = false;
            reviewPanel.Visible = true;
            FocusOn(reviewList);
        }

        void RefreshReview()
        {
            int keep = reviewList.SelectedIndex;
            reviewEntries = new List<CountEntry>(session.Entries);
            reviewList.Items.Clear();
            foreach (CountEntry e in reviewEntries)
                reviewList.Items.Add((e.Bin.Length == 0 ? "-" : e.Bin) + "  " + e.PartNumber + "  " + e.Quantity + (e.Damaged > 0 ? "+" + e.Damaged + "d" : "") + (e.OnSheet ? "" : "  *"));
            reviewTitle.Text = (session.Finished ? "FINISHED  " : "") + reviewEntries.Count + " entries  " + session.TotalQuantity + " pcs" +
                               (session.TotalDamaged > 0 ? "  " + session.TotalDamaged + " dmg" : "");
            reviewKeys.Text = session.Finished
                ? "Sheet finished and locked. Dock the device and use HHDC Link: Receive.  Esc=Back"
                : "1/Enter=Edit  2/F3=Delete  3/F4=Finish sheet  Esc=Back   (* = not on sheet)";
            if (reviewEntries.Count > 0) reviewList.SelectedIndex = Math.Min(Math.Max(keep, 0), reviewEntries.Count - 1);
        }

        // ── Keys ──────────────────────────────────────────────────────────────────

        protected override void OnKeyDown(KeyEventArgs e)
        {
            base.OnKeyDown(e);
            bool handled = true;
            switch (screen)
            {
                case Screen.Sheets: handled = SheetsKey(e.KeyCode); break;
                case Screen.Count: handled = CountKey(e.KeyCode); break;
                case Screen.Review: handled = ReviewKey(e.KeyCode); break;
                case Screen.Find: handled = FindKey(e.KeyCode); break;
            }
            if (handled) e.Handled = true;
        }

        bool SheetsKey(Keys k)
        {
            if (k == Keys.Enter)
            {
                if (sheetsList.SelectedIndex >= 0) OpenSheet(sheetItems[sheetsList.SelectedIndex]);
                return true;
            }
            if (k == Keys.Escape) { Close(); return true; }
            return false;
        }

        bool CountKey(Keys k)
        {
            switch (k)
            {
                case Keys.Enter: Advance(); return true;
                case Keys.F1: ShowFind(); return true;
                case Keys.F2: ShowReview(); return true;
                case Keys.F3: FocusBin(); return true;
                case Keys.F4: ClearEntry(true); return true;
                case Keys.Escape:
                    if (editingId != 0) { editingId = 0; ShowReview(); } else CountMenu();
                    return true;
                case Keys.Up: MoveField(-1); return true;
                case Keys.Down: MoveField(1); return true;
            }
            return false;
        }

        bool ReviewKey(Keys k)
        {
            switch (k)
            {
                case Keys.Escape:
                    if (session.Finished) ShowSheets(); else ShowCount();
                    return true;
                case Keys.Enter:
                case Keys.D1:
                case Keys.NumPad1: EditSelected(); return true;
                case Keys.F3:
                case Keys.Delete:
                case Keys.D2:
                case Keys.NumPad2: DeleteSelected(); return true;
                case Keys.F4:
                case Keys.D3:
                case Keys.NumPad3: FinishSheet(); return true;
            }
            return false;
        }

        void CountMenu()
        {
            int c = ChoiceDialog.Ask(this, "Menu", "Entries are already saved.\r\nScanning: " + ModeName(mode),
                "Review entries", "Parts left in bin / find a part", "New bin", "Scan mode (adds 1 per scan, or type)", "Back to sheet list");
            if (c == 0) ShowReview();
            else if (c == 1) ShowFind();
            else if (c == 2) FocusBin();
            else if (c == 3) ChooseMode();
            else if (c == 4) ShowSheets();
        }

        static string ModeName(ScanMode m)
        {
            return m == ScanMode.Add ? "each scan adds 1" : m == ScanMode.Remove ? "each scan removes 1" : "you type the quantity";
        }

        void ChooseMode()
        {
            int c = ChoiceDialog.Ask(this, "Scan mode", "What does a scan of a part do?\r\nNow: " + ModeName(mode),
                "I type the quantity", "Each scan adds 1", "Each scan removes 1 (a scan counted twice)");
            if (c < 0) return;
            mode = c == 1 ? ScanMode.Add : c == 2 ? ScanMode.Remove : ScanMode.Type;
            settings.Mode = mode;
            settings.Save();
            ClearEntry(true);
            ApplyMode();
            SetStatus(mode == ScanMode.Type ? "Type the quantity for each part" : "Scan the part: " + ModeName(mode), Good);
            if (Norm.Code(txtBin.Text).Length == 0) FocusBin(); // no bin yet: the next scan is the bin
        }

        /// <summary>Show the boxes the mode needs: quantity, damaged and note when typing; the last-scan result when each scan counts.</summary>
        void ApplyMode()
        {
            bool typing = TypingUi;
            foreach (Control c in typeRows) c.Visible = typing;
            lblBig.Visible = !typing;
            lblBig.ForeColor = mode == ScanMode.Remove ? Warn : Color.FromArgb(0, 0, 150);
            lblBig.Text = mode == ScanMode.Remove ? "EACH SCAN REMOVES 1" : "EACH SCAN ADDS 1";
        }

        void RefreshTitle()
        {
            countTitle.Text = session.Sheet.SheetNumber + "  " + session.CountedLines + "/" + session.LineCount + " parts  sent " +
                              session.Sheet.SentAtUtc.ToString("dd-MMM HH:mm") + " (PC)";
        }

        // ── Parts left in the bin / find a part ───────────────────────────────────

        void ShowFind()
        {
            screen = Screen.Find;
            // No bin chosen yet: start with the bins of the sheet, to choose where to count.
            findBins = Norm.Code(txtBin.Text).Length == 0;
            if (findBins) LoadBins();
            txtFind.Text = "";
            RefreshFind();
            sheetsPanel.Visible = false;
            countPanel.Visible = false;
            reviewPanel.Visible = false;
            findPanel.Visible = true;
            FocusOn(txtFind);
        }

        void LoadBins()
        {
            Cursor.Current = Cursors.WaitCursor;
            int t0 = Environment.TickCount;
            try { allBins = session.Bins(out noBinParts); }
            finally { Cursor.Current = Cursors.Default; }
            Timing("bins " + allBins.Count + " (" + session.LineCount + " parts)", t0);
        }

        void RefreshBins()
        {
            string key = Norm.Key(txtFind.Text);
            int withLeft = 0;
            binHits = new List<BinSummary>();
            foreach (BinSummary b in allBins)
            {
                if (b.Left > 0) withLeft++;
                if (binHits.Count < BinsShown && Norm.Key(b.Bin).StartsWith(key, StringComparison.Ordinal)) binHits.Add(b);
            }
            if (allBins.Count == 0) findTitle.Text = "No bins on this sheet";
            else if (key.Length > 0) findTitle.Text = binHits.Count == 0 ? "No bin starts with that" : binHits.Count + " bin(s) found";
            else findTitle.Text = allBins.Count + " bins, " + withLeft + " with parts left" + (noBinParts > 0 ? ", " + noBinParts + " parts no bin" : "");
            foreach (BinSummary b in binHits)
                findList.Items.Add(b.Bin + "   " + (b.Left == 0 ? "done (" + b.Parts + ")" : b.Left + " of " + b.Parts + " left"));
            findKeys.Text = "Enter=go to bin  F1=parts  Esc=back  (type to filter)";
        }

        void RefreshFind()
        {
            findList.Items.Clear();
            if (findBins)
            {
                RefreshBins();
                if (binHits.Count > 0) findList.SelectedIndex = 0;
                return;
            }
            findKeys.Text = "Enter=count it  F1=bins  Esc=back  (type or scan to find)";
            string q = Norm.PartFromScan(txtFind.Text);
            if (q.Length > 0)
            {
                findHits = session.FindParts(q, FindMax);
                findTitle.Text = findHits.Count == 0 ? "No part on the sheet starts with that"
                               : findHits.Count >= FindMax ? "First " + FindMax + " parts found" : findHits.Count + " part(s) found";
            }
            else
            {
                string bin = Norm.Code(txtBin.Text);
                findHits = new List<SheetHit>();
                if (bin.Length == 0) findTitle.Text = "No bin chosen: type or scan a part";
                else
                {
                    int onSheet = session.SheetPartsInBin(bin), left;
                    findHits = session.PartsLeftInBin(bin, FindMax, out left);
                    findTitle.Text = onSheet == 0 ? "The sheet has no parts for bin " + bin
                                   : left == 0 ? "All " + onSheet + " parts in " + bin + " are counted"
                                   : bin + ": " + left + " of " + onSheet + " parts left" + (left > FindMax ? " (first " + FindMax + ")" : "");
                }
            }
            foreach (SheetHit h in findHits)
                findList.Items.Add(h.Line.PartNumber + (h.CountedQty >= 0 ? "  [" + h.CountedQty + " counted]" : "") +
                                   (q.Length > 0 && h.Line.Bin.Length > 0 ? "  @" + h.Line.Bin : "") + "  " + h.Line.Description);
            if (findHits.Count > 0) findList.SelectedIndex = 0;
        }

        bool FindKey(Keys k)
        {
            switch (k)
            {
                case Keys.Escape: ShowCount(); return true;
                case Keys.Enter: if (findBins) UseBin(); else UseFound(); return true;
                case Keys.F1:
                    findBins = !findBins;
                    if (findBins) LoadBins();
                    txtFind.Text = "";
                    RefreshFind();
                    return true;
                case Keys.Up: if (findList.SelectedIndex > 0) findList.SelectedIndex--; return true;
                case Keys.Down: if (findList.SelectedIndex < findList.Items.Count - 1) findList.SelectedIndex++; return true;
            }
            return false;
        }

        /// <summary>The chosen bin becomes the counting bin; the screen then shows the parts left in it.</summary>
        void UseBin()
        {
            int i = findList.SelectedIndex;
            if (i < 0 || i >= binHits.Count) { Beeper.Error(); return; }
            txtBin.Text = binHits[i].Bin;
            workBin = txtBin.Text;
            findBins = false;
            txtFind.Text = "";
            RefreshFind();
        }

        /// <summary>Back to counting with the chosen part in the Part box. The bin is filled from the sheet only if none is chosen yet.</summary>
        void UseFound()
        {
            int i = findList.SelectedIndex;
            if (i < 0 || i >= findHits.Count) { Beeper.Error(); return; }
            SheetLine l = findHits[i].Line;
            ShowCount();
            if (Norm.Code(txtBin.Text).Length == 0) txtBin.Text = Norm.Code(l.Bin);
            txtPart.Text = l.PartNumber;
            LookupPart();
            if (TypingUi) FocusQty(); else FocusOn(txtPart);
        }

        /// <summary>After a part is looked up: type mode goes to the quantity; the scan modes count it now.</summary>
        void AfterPart()
        {
            if (part == null) return;
            if (TypingUi) { FocusQty(); return; }
            CountByScan(mode == ScanMode.Add ? 1 : -1);
        }

        void CountByScan(int delta)
        {
            string bin = Norm.Code(txtBin.Text);
            txtBin.Text = bin;
            PartInfo p = part;
            if (bin.Length == 0)
            {
                ClearEntry(true);
                SetStatus("Scan the BIN first", Warn);
                FocusBin();
                return;
            }
            if (!p.OnSheet && delta > 0 && !offSheetOk.ContainsKey(p.PartNumber))
            {
                Beeper.Error();
                int ok = ChoiceDialog.Ask(this, "Not on this sheet", p.PartNumber + " is not on this sheet.\r\nCount it anyway?\r\n(Asked once for this part.)", "Yes, count it");
                if (ok != 0) { ClearEntry(true); return; }
                offSheetOk[p.PartNumber] = true;
            }
            try
            {
                CountEntry e = session.CountOne(bin, p, delta);
                string info = PartInfoText(p);
                string warn = p.OnSheet ? session.BinWarning(bin, p) : "NOT ON THIS SHEET"; // BinWarning is empty for an off-sheet part
                ClearEntry(true);
                txtBin.Text = e.Bin;
                workBin = e.Bin;
                lblInfo.Text = info;
                lblWarn.Text = warn;
                if (warn.Length > 0) Beeper.Error();
                lblBig.Text = (mode == ScanMode.Remove ? "EACH SCAN REMOVES 1" : "EACH SCAN ADDS 1") + "\r\n" +
                              e.PartNumber + "  " + (delta > 0 ? "+1" : "-1") + "  =  " + e.Quantity + " in " + e.Bin;
                SetStatus("Saved", Good);
                RefreshTitle();
            }
            catch (CountException ex) { ClearEntry(true); SetStatus(ex.Message, Warn); }
            catch (IOException ex) { ClearEntry(true); SetStatus("NOT SAVED: " + ex.Message, Warn); }
        }

        string PartInfoText(PartInfo p)
        {
            string info = p.OnSheet ? p.Description : "";
            if (p.OnSheet && p.SystemStock.HasValue) info += "\r\nSystem stock: " + p.SystemStock.Value;
            string so = session.CountedSoFar(p.PartNumber);
            if (so.Length > 0) info += (info.Length > 0 ? "\r\n" : "") + "Counted: " + so;
            return info;
        }

        // ── Counting ──────────────────────────────────────────────────────────────

        TextBox[] Fields
        {
            get
            {
                return TypingUi ? new TextBox[] { txtBin, txtPart, txtQty, txtDmg, txtNote } : new TextBox[] { txtBin, txtPart };
            }
        }

        TextBox ActiveField()
        {
            foreach (TextBox t in Fields) if (t == focused) return t;
            return null;
        }

        /// <summary>Focus a control. The field in use is tracked here, not read back from the OS, so it is right even when the window is not the foreground one.</summary>
        void FocusOn(Control c)
        {
            focused = c;
            c.Focus();
        }

        void MoveField(int step)
        {
            TextBox[] f = Fields;
            TextBox cur = ActiveField();
            int i = cur == null ? 1 : Array.IndexOf(f, cur);
            if (cur == txtPart) EnsurePartLooked();
            i = Math.Max(0, Math.Min(f.Length - 1, i + step));
            FocusOn(f[i]);
            f[i].SelectAll();
        }

        void FocusBin()
        {
            scan.Reset();
            FocusOn(txtBin);
            txtBin.SelectAll();
            pendingFocus = txtBin;
        }

        /// <summary>
        /// After a dialog closes, Windows gives the focus back to the box that had it before the dialog, which would
        /// override a focus set while the dialog's result was handled. The timer puts it where it was meant to go.
        /// </summary>
        Control pendingFocus;

        void Advance()
        {
            TextBox cur = ActiveField();
            scan.Reset();
            if (cur == txtBin) { CommitBin(); }
            else if (cur == txtPart) { LookupPart(); AfterPart(); }
            else if (cur == txtQty) { FocusOn(txtDmg); txtDmg.SelectAll(); }
            else if (cur == txtDmg) { FocusOn(txtNote); txtNote.SelectAll(); }
            else if (cur == txtNote) { SaveEntry(); }
        }

        void FocusQty()
        {
            FocusOn(txtQty);
            txtQty.SelectAll();
        }

        void CommitBin()
        {
            txtBin.Text = Norm.Code(txtBin.Text);
            if (txtBin.Text.Length == 0) return;
            string refusal = CountSession.BinRefusal(txtBin.Text);
            if (refusal.Length > 0)
            {
                Beeper.Error();
                txtBin.Text = "";
                SetStatus(refusal + ". Scan the BIN label", Warn);
                FocusBin();
                return;
            }
            if (session.LooksLikePart(txtBin.Text))
            {
                // Usually a part scanned while the cursor was in the Bin box: the first choice counts it as the part in
                // the bin in use. Keeping it as the bin is the second choice, so pressing 1 out of habit does no harm.
                Beeper.Error();
                string scanned = txtBin.Text;
                bool canCount = workBin.Length > 0 && !session.LooksLikePart(workBin);
                string msg = "\"" + scanned + "\" looks like a part label, not a bin.";
                int c = canCount
                    ? ChoiceDialog.Ask(this, "Is this a bin?", msg, "It's a part: count it in " + workBin, "Use it as the bin anyway")
                    : ChoiceDialog.Ask(this, "Is this a bin?", msg + "\r\nScan the bin label first.", "Use it as the bin anyway");
                if (canCount && c == 0)
                {
                    txtBin.Text = workBin;
                    txtPart.Text = scanned;
                    LookupPart();
                    AfterPart();
                    pendingFocus = TypingUi ? txtQty : txtPart; // the dialog hands the focus back to the Bin box
                    return;
                }
                if (c != (canCount ? 1 : 0)) { txtBin.Text = workBin; SetStatus("Scan the BIN label", Warn); FocusBin(); return; }
            }
            workBin = txtBin.Text;
            if (part != null) ShowWarnings(true);
            FocusOn(txtPart);
            txtPart.SelectAll();
        }

        void LookupPart()
        {
            string text = txtPart.Text.Trim();
            if (text.Length == 0) { part = null; committedPart = ""; lblInfo.Text = ""; lblWarn.Text = ""; return; }
            part = session.Lookup(text);
            committedPart = txtPart.Text;
            txtPart.Text = part.PartNumber;
            committedPart = txtPart.Text;
            ShowPartInfo();
        }

        void EnsurePartLooked()
        {
            if (session != null && txtPart.Text != committedPart) LookupPart();
        }

        void ShowPartInfo()
        {
            if (part == null) return;
            lblInfo.Text = PartInfoText(part);
            ShowWarnings(true);
        }

        void ShowWarnings(bool beep)
        {
            string w = "";
            if (part != null && !part.OnSheet) w = "NOT ON THIS SHEET";
            string bw = session.BinWarning(txtBin.Text, part);
            if (bw.Length > 0) w += (w.Length > 0 ? "\r\n" : "") + bw;
            lblWarn.Text = w;
            if (beep && w.Length > 0) Beeper.Error();
        }

        void ClearEntry(bool keepBin)
        {
            if (!keepBin && editingId == 0) { /* a new sheet starts with the bin box as it was */ }
            part = null;
            committedPart = "";
            txtPart.Text = "";
            txtQty.Text = "";
            txtDmg.Text = "";
            txtNote.Text = "";
            lblInfo.Text = "";
            lblWarn.Text = "";
            if (editingId != 0) { editingId = 0; txtBin.Text = ""; }
            if (screen == Screen.Count) { FocusOn(txtPart); scan.Reset(); }
        }

        void SetStatus(string text, Color color)
        {
            lblStatus.Text = text;
            lblStatus.ForeColor = color;
            if (color == Warn && text.Length > 0) Beeper.Error();
        }

        void SaveEntry()
        {
            EnsurePartLooked();
            string bin = Norm.Code(txtBin.Text);
            txtBin.Text = bin;
            if (part == null) { SetStatus("Scan or type the part first", Warn); FocusOn(txtPart); return; }
            int qty, dmg;
            if (!CountSession.TryParseCount(txtQty.Text, false, out qty)) { SetStatus("Enter the quantity (whole number)", Warn); FocusQty(); return; }
            if (!CountSession.TryParseCount(txtDmg.Text, true, out dmg)) { SetStatus("Damaged must be a whole number", Warn); FocusOn(txtDmg); return; }
            string note = txtNote.Text.Trim();

            try
            {
                CountEntry saved;
                if (editingId != 0)
                {
                    saved = session.Edit(editingId, bin, part, qty, dmg, note);
                }
                else
                {
                    if (!part.OnSheet)
                    {
                        int ok = ChoiceDialog.Ask(this, "Not on this sheet", part.PartNumber + " is not on this sheet.\r\nCount it anyway?", "Yes, count it");
                        if (ok != 0) { FocusOn(txtPart); return; }
                    }
                    if (bin.Length == 0)
                    {
                        // Legacy required a bin; the store decided to allow a count without one after a question (2026-10-27).
                        int ok = ChoiceDialog.Ask(this, "No bin", "Save " + part.PartNumber + " without a bin?\r\nPress Esc and scan the bin label if it has one.", "Yes, save without a bin");
                        if (ok != 0) { FocusBin(); return; }
                    }
                    CountEntry dup = session.FindDuplicate(bin, part.PartNumber, 0);
                    if (dup == null)
                    {
                        saved = session.Add(bin, part, qty, dmg, note);
                    }
                    else
                    {
                        int c = ChoiceDialog.Ask(this, "Already counted here",
                            part.PartNumber + " is already counted in " + (bin.Length == 0 ? "no bin" : bin) + ": " + dup.Quantity + (dup.Damaged > 0 ? " + " + dup.Damaged + " damaged" : "") + ".",
                            "Add: total " + (dup.Quantity + qty) + (dup.Damaged + dmg > 0 ? " + " + (dup.Damaged + dmg) + " dmg" : ""),
                            "Replace with " + qty + (dmg > 0 ? " + " + dmg + " dmg" : ""));
                        if (c == 0) saved = session.AddTo(dup, qty, dmg, note);
                        else if (c == 1) saved = session.Replace(dup, qty, dmg, note);
                        else { FocusQty(); return; }
                    }
                }
                bool wasEdit = editingId != 0;
                SetStatus("Saved " + saved.PartNumber + "  " + saved.Quantity + (saved.Damaged > 0 ? "+" + saved.Damaged + "d" : ""), Good);
                string savedBin = saved.Bin;
                editingId = 0;
                ClearEntry(true);
                txtBin.Text = savedBin;
                workBin = savedBin;
                RefreshTitle();
                if (wasEdit) ShowReview();
            }
            catch (CountException ex) { SetStatus(ex.Message, Warn); }
            catch (IOException ex) { SetStatus("NOT SAVED: " + ex.Message, Warn); }
        }

        // ── Review ────────────────────────────────────────────────────────────────

        CountEntry Selected()
        {
            int i = reviewList.SelectedIndex;
            return i >= 0 && i < reviewEntries.Count ? reviewEntries[i] : null;
        }

        void EditSelected()
        {
            CountEntry e = Selected();
            if (e == null || session.Finished) return;
            ShowCount();
            editingId = e.Id;
            txtBin.Text = e.Bin;
            txtPart.Text = e.PartNumber;
            LookupPart();
            txtQty.Text = e.Quantity.ToString();
            txtDmg.Text = e.Damaged > 0 ? e.Damaged.ToString() : "";
            txtNote.Text = e.Remarks;
            ApplyMode(); // an entry is always edited with the quantity boxes, whatever the scan mode
            SetStatus("Editing entry. Enter on Note saves, Esc cancels.", Ink);
            FocusQty();
        }

        void DeleteSelected()
        {
            CountEntry e = Selected();
            if (e == null || session.Finished) return;
            int c = ChoiceDialog.Ask(this, "Delete entry", e.PartNumber + " in " + (e.Bin.Length == 0 ? "no bin" : e.Bin) + ": " + e.Quantity + "?", "Delete");
            if (c != 0) return;
            try { session.Delete(e.Id); }
            catch (Exception ex) { ChoiceDialog.Tell(this, "Not deleted", ex.Message); }
            RefreshReview();
        }

        void FinishSheet()
        {
            if (session.Finished) return;
            string msg = session.UncountedLines + " of " + session.LineCount + " parts have no count.\r\nAfter finishing, this sheet is locked.";
            int c = ChoiceDialog.Ask(this, "Finish sheet", msg, "Finish sheet");
            if (c != 0) return;
            try { session.Finish(); }
            catch (Exception ex) { ChoiceDialog.Tell(this, "Not finished", ex.Message); return; }
            ChoiceDialog.Tell(this, "Sheet finished", "Locked. Dock the device and use HHDC Link: Receive from device.");
            ShowSheets();
        }

        // ── Scanning ──────────────────────────────────────────────────────────────

        void OnFieldKeyPress(object sender, KeyPressEventArgs e)
        {
            // Enter and Tab end a scan; their work is done in OnKeyDown. Swallow them so the box does not beep.
            if (e.KeyChar == '\r' || e.KeyChar == '\n' || e.KeyChar == '\t') { e.Handled = true; return; }
            if ((sender == txtBin || sender == txtPart) && e.KeyChar >= ' ') scan.Key(Environment.TickCount);
        }

        void OnScanTick(object sender, EventArgs e)
        {
            if (pendingFocus != null)
            {
                Control want = pendingFocus;
                pendingFocus = null;
                if (screen == Screen.Count && focused != want) { FocusOn(want); if (want is TextBox) ((TextBox)want).SelectAll(); scan.Reset(); }
            }
            if (screen != Screen.Count || !scan.Poll(Environment.TickCount)) return;
            TextBox cur = ActiveField();
            if (cur == txtBin) { CommitBin(); }
            else if (cur == txtPart) { LookupPart(); AfterPart(); }
            scan.Reset();
        }
    }
}
