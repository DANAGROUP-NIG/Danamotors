using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace Danamotors.Hhdc.Device
{
    /// <summary>
    /// The main window of Kia Motors Handheld, built for the MC3190's 318x269 client area, its keypad and its stylus.
    /// Screens: home (the jobs on the handheld by kind, like the legacy main menu), the jobs of one kind, and for a count
    /// sheet: counting, review and find. All counting rules live in CountSession; this class only shows state and
    /// passes keys and taps. Picking lists, CPOs and MITs open in DocForm.
    /// </summary>
    public sealed class MainForm : Form
    {
        enum Screen { Home, Jobs, Count, Review, Find }

        static readonly Color Ink = Theme.Ink;
        static readonly Color Warn = Theme.Warn;
        static readonly Color Good = Theme.Good;

        /// <summary>The kinds of job, in the order of the home screen (number keys 1-4).</summary>
        static readonly string[] Kinds = { "Stock count", "Branch indent picking", "CPO picking", "MIT receiving" };
        static readonly string[] KindNouns = { "count sheet", "indent", "CPO", "MIT" };
        const int Unreadable = 4;

        readonly SheetRepository repo;
        readonly Timer scanTimer = new Timer();
        readonly ScanDetector scan = new ScanDetector();

        readonly HeaderBar header = new HeaderBar();
        readonly KeyBar keys = new KeyBar();

        // Home and the jobs of one kind
        readonly Panel homePanel = new Panel();
        readonly ItemList homeList = new ItemList();
        readonly Panel homeBand;
        readonly Label homeHelp = new Label();
        readonly Panel jobsPanel = new Panel();
        readonly ItemList jobsList = new ItemList();
        List<SheetListItem> sheetItems = new List<SheetListItem>();
        List<SheetListItem> jobs = new List<SheetListItem>();  // the jobs of the kind shown
        int kind = -1;               // the kind whose jobs are listed, -1 on home
        bool backToJobs;             // the job was opened from a list of jobs (not straight from home)

        // Counting
        readonly Panel countPanel = new Panel();
        readonly TextBox txtBin = new TextBox();
        readonly TextBox txtPart = new TextBox();
        readonly Label lblInfo = new Label();
        readonly Panel infoBand;
        readonly Label lblWarn = new Label();
        readonly Panel warnBand;
        readonly TextBox txtQty = new TextBox();
        readonly TextBox txtDmg = new TextBox();
        readonly TextBox txtNote = new TextBox();
        readonly Label lblStatus = new Label();
        readonly Panel statusBand;
        readonly Label lblBig = new Label();               // the mode and the last scan, in the scan modes
        readonly Panel bigBand;
        readonly List<Control> typeRows = new List<Control>(); // quantity, damaged and note: hidden in the scan modes

        // Parts left in the bin / find a part
        readonly Panel findPanel = new Panel();
        readonly Label findTitle = new Label();
        readonly TextBox txtFind = new TextBox();
        readonly ItemList findList = new ItemList();
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
        readonly ItemList reviewList = new ItemList();

        Control focused;
        Screen screen = Screen.Home;
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
            Theme.SetUp(this, Theme.AppName);

            Controls.Add(header);
            keys.Tapped = delegate(Keys k) { if (k != Keys.None) HandleKey(k); };
            Controls.Add(keys);
            foreach (Panel p in new Panel[] { homePanel, jobsPanel, countPanel, reviewPanel, findPanel })
            {
                p.Bounds = new Rectangle(0, Theme.BodyTop, Theme.Width, Theme.BodyHeight);
                p.BackColor = Theme.Paper;
                p.Visible = false;
                Controls.Add(p);
            }
            homeBand = BuildHome();
            BuildJobs();
            BuildCount(out infoBand, out warnBand, out bigBand, out statusBand);
            BuildReview();
            BuildFind();
            mode = settings.Mode; // after the boxes exist: the keypad order depends on the mode

            scanTimer.Interval = 40;
            scanTimer.Tick += OnScanTick;
            scanTimer.Enabled = true;
            ShowHome();
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

        static Label MakeLabel(Panel on, string text, int x, int y, int w, int h)
        {
            Label l = new Label();
            l.Text = text;
            l.Font = Theme.Bold(8f);
            l.ForeColor = Theme.Muted;
            l.Bounds = new Rectangle(x, y, w, h);
            on.Controls.Add(l);
            return l;
        }

        static void Place(Panel on, TextBox t, int x, int y, int w, int maxLength)
        {
            t.Font = Theme.Bold(12f);
            t.Bounds = new Rectangle(x, y, w, 26);
            t.MaxLength = maxLength;
            on.Controls.Add(t);
        }

        Panel BuildHome()
        {
            homeList.Bounds = new Rectangle(0, 0, Theme.Width, 5 * 34);
            homeList.Activated = delegate(int i) { OpenKind(KindAt(i)); };
            homePanel.Controls.Add(homeList);
            return Theme.Band(homePanel, homeHelp, new Rectangle(0, 5 * 34 + 2, Theme.Width, Theme.BodyHeight - 5 * 34 - 2), Theme.Plain(8f));
        }

        void BuildJobs()
        {
            jobsList.Bounds = new Rectangle(0, 0, Theme.Width, Theme.BodyHeight);
            jobsList.Activated = delegate(int i) { OpenJob(jobs[i], true); };
            jobsPanel.Controls.Add(jobsList);
        }

        void BuildCount(out Panel info, out Panel warn, out Panel big, out Panel status)
        {
            MakeLabel(countPanel, "BIN", 6, 9, 40, 16);
            Place(countPanel, txtBin, 46, 4, 266, CountSession.MaxCodeLength);
            MakeLabel(countPanel, "PART", 6, 39, 40, 16);
            Place(countPanel, txtPart, 46, 34, 266, CountSession.MaxCodeLength);

            info = Theme.Band(countPanel, lblInfo, new Rectangle(6, 64, 306, 42), Theme.Plain(9f));
            Theme.Colour(info, lblInfo, Ink, Theme.Shade);
            warn = Theme.Band(countPanel, lblWarn, new Rectangle(6, 108, 306, 29), Theme.Bold(8f));
            Theme.Colour(warn, lblWarn, Warn, Theme.Paper);

            typeRows.Add(MakeLabel(countPanel, "QTY", 6, 146, 40, 16));
            Place(countPanel, txtQty, 46, 141, 90, 7);
            typeRows.Add(MakeLabel(countPanel, "DAMAGED", 148, 146, 66, 16));
            Place(countPanel, txtDmg, 216, 141, 96, 7);
            typeRows.Add(MakeLabel(countPanel, "NOTE", 6, 175, 40, 16));
            Place(countPanel, txtNote, 46, 170, 266, CountSession.MaxRemarkLength);
            typeRows.Add(txtQty);
            typeRows.Add(txtDmg);
            typeRows.Add(txtNote);

            // In the scan modes the three boxes above give way to the mode and the result of the last scan.
            big = Theme.Band(countPanel, lblBig, new Rectangle(6, 141, 306, 55), Theme.Bold(10f));
            big.Visible = false;

            status = Theme.Band(countPanel, lblStatus, new Rectangle(0, 199, Theme.Width, 22), Theme.Bold(9f));

            foreach (TextBox t in new TextBox[] { txtBin, txtPart, txtQty, txtDmg, txtNote })
            {
                t.KeyPress += OnFieldKeyPress;
            }
            foreach (TextBox t in Fields) t.GotFocus += delegate(object sender, EventArgs e) { focused = (Control)sender; };
            txtQty.GotFocus += delegate { EnsurePartLooked(); };
        }

        void BuildFind()
        {
            Place(findPanel, txtFind, 6, 4, 306, CountSession.MaxCodeLength);
            findTitle.Font = Theme.Bold(8f);
            findTitle.ForeColor = Theme.Muted;
            findTitle.Bounds = new Rectangle(6, 34, 306, 16);
            findPanel.Controls.Add(findTitle);
            findList.Bounds = new Rectangle(0, 52, Theme.Width, Theme.BodyHeight - 52);
            findList.Activated = delegate { if (findBins) UseBin(); else UseFound(); };
            findPanel.Controls.Add(findList);
            txtFind.KeyPress += OnFieldKeyPress;
            txtFind.TextChanged += delegate { if (screen == Screen.Find) RefreshFind(); };
        }

        void BuildReview()
        {
            reviewTitle.Font = Theme.Bold(8f);
            reviewTitle.ForeColor = Theme.Muted;
            reviewTitle.Bounds = new Rectangle(6, 4, 306, 16);
            reviewPanel.Controls.Add(reviewTitle);
            reviewList.Bounds = new Rectangle(0, 22, Theme.Width, Theme.BodyHeight - 22);
            reviewList.EmptyText = "Nothing counted yet. Esc goes back to counting.";
            reviewList.Activated = delegate { EditSelected(); };
            reviewPanel.Controls.Add(reviewList);
        }

        /// <summary>Shows one body panel and hides the rest.</summary>
        void Show(Panel p)
        {
            foreach (Panel q in new Panel[] { homePanel, jobsPanel, countPanel, reviewPanel, findPanel })
                if (q != p) q.Visible = false;
            p.Visible = true;
        }

        // ── Home and job lists ────────────────────────────────────────────────────

        static int KindOf(SheetListItem it)
        {
            if (!it.IsDoc) return 0;
            if (it.DocType == DocTypes.IndentPick) return 1;
            if (it.DocType == DocTypes.CpoPick) return 2;
            if (it.DocType == DocTypes.MitReceive) return 3;
            return Unreadable;
        }

        List<SheetListItem> JobsOf(int k)
        {
            List<SheetListItem> l = new List<SheetListItem>();
            foreach (SheetListItem it in sheetItems) if (KindOf(it) == k) l.Add(it);
            return l;
        }

        /// <summary>Home rows: the four kinds, then the unreadable files if there are any.</summary>
        int KindAt(int row) { return row; }

        void ShowHome()
        {
            screen = Screen.Home;
            kind = -1;
            session = null;
            int t0 = Environment.TickCount;
            sheetItems = repo.List();
            sheetItems.AddRange(repo.ListDocs()); // picking lists, CPOs and MITs after the count sheets
            Timing("list " + sheetItems.Count + " sheets and documents", t0);

            int keep = homeList.SelectedIndex, first = -1, total = 0;
            homeList.Clear();
            for (int k = 0; k < Kinds.Length; k++)
            {
                List<SheetListItem> l = JobsOf(k);
                total += l.Count;
                if (l.Count > 0 && first < 0) first = k;
                homeList.Add(KindRow(k, l));
            }
            List<SheetListItem> bad = JobsOf(Unreadable);
            if (bad.Count > 0)
            {
                ListItem r = new ListItem("Unreadable files");
                r.Key = "5";
                r.Detail = "Ask the store to send them again";
                r.Badge = bad.Count.ToString();
                r.BadgeColor = Warn;
                r.Alert = true;
                homeList.Add(r);
            }
            homeList.SelectedIndex = keep >= 0 ? keep : first >= 0 ? first : 0;
            header.Set("Motors Handheld", total == 0 ? "" : total + (total == 1 ? " job" : " jobs"), true, 0, 0);
            SetHomeNote(total == 0
                ? "No jobs on this handheld yet. The store sends them from the web (Send to handheld); they arrive when the handheld is in its cradle."
                : "New jobs and finished work move by themselves while the handheld is in its cradle.", Theme.Muted);
            keys.Clear().Add("Ent", "Open", Keys.Enter).Add("Esc", "Exit", Keys.Escape);
            Show(homePanel);
            FocusOn(homeList.Sink);
        }

        static ListItem KindRow(int k, List<SheetListItem> l)
        {
            ListItem r = new ListItem(Kinds[k]);
            r.Key = (k + 1).ToString();
            int done = 0, started = 0;
            foreach (SheetListItem it in l)
            {
                if (it.Finished) done++;
                else if (it.Entries > 0) started++;
            }
            int toDo = l.Count - done;
            if (l.Count == 0)
            {
                r.Detail = "None on this handheld";
                r.Dim = true;
                return r;
            }
            r.Detail = (toDo > 0 ? toDo + " to do" + (started > 0 ? " (" + started + " started)" : "") : "") +
                       (done > 0 ? (toDo > 0 ? " \u00B7 " : "") + done + " finished, waiting for the cradle" : "");
            r.Badge = l.Count.ToString();
            r.BadgeColor = toDo == 0 ? Good : started > 0 ? Theme.Busy : Theme.Info;
            return r;
        }

        void SetHomeNote(string text, Color fore)
        {
            homeHelp.Text = text;
            Theme.Colour(homeBand, homeHelp, fore, fore == Theme.Muted ? Theme.Shade : Theme.BackFor(fore));
        }

        /// <summary>One job of the kind opens straight away; several are listed first.</summary>
        void OpenKind(int k)
        {
            List<SheetListItem> l = JobsOf(k);
            if (l.Count == 0)
            {
                SetHomeNote("No " + KindNouns[k] + " on this handheld. The store sends it from the web; it arrives when the handheld is in its cradle.", Theme.Busy);
                return;
            }
            if (l.Count == 1 && k != Unreadable) { OpenJob(l[0], false); return; }
            ShowJobs(k);
        }

        void ShowJobs(int k)
        {
            screen = Screen.Jobs;
            kind = k;
            session = null;
            jobs = JobsOf(k);
            int keep = jobsList.SelectedIndex;
            jobsList.Clear();
            foreach (SheetListItem it in jobs) jobsList.Add(JobRow(it));
            jobsList.SelectedIndex = Math.Max(0, keep);
            header.Set(k == Unreadable ? "Unreadable files" : Kinds[k], jobs.Count + (jobs.Count == 1 ? " job" : " jobs"), false, 0, 0);
            keys.Clear().Add("Ent", "Open", Keys.Enter).Add("Esc", "Back", Keys.Escape);
            Show(jobsPanel);
            FocusOn(jobsList.Sink);
        }

        static ListItem JobRow(SheetListItem it)
        {
            if (it.Error.Length > 0)
            {
                ListItem bad = new ListItem(it.Stem);
                bad.Detail = it.Error;
                bad.Badge = "BAD FILE";
                bad.BadgeColor = Warn;
                bad.Alert = true;
                return bad;
            }
            ListItem r;
            if (it.IsDoc)
            {
                r = new ListItem(DocTypes.Short(it.DocType) + " " + it.Reference);
                r.Detail = (it.Branch.Length > 0 ? it.Branch + " \u00B7 " : "") + it.Lines + (it.Lines == 1 ? " line" : " lines");
                r.Progress = it.Lines > 0 ? (float)it.Entries / it.Lines : -1f;
                if (!it.Finished && it.Entries > 0) { r.Badge = it.Entries + "/" + it.Lines; r.BadgeColor = Theme.Busy; }
            }
            else
            {
                r = new ListItem(it.Number);
                r.Detail = (it.Branch.Length > 0 ? it.Branch + " \u00B7 " : "") + it.Lines + (it.Lines == 1 ? " part" : " parts");
                if (!it.Finished && it.Entries > 0) { r.Badge = it.Entries + " counted"; r.BadgeColor = Theme.Busy; }
            }
            if (it.Finished) { r.Badge = "DONE"; r.BadgeColor = Good; r.Detail += " \u00B7 waiting for the cradle"; }
            else if (r.Badge.Length == 0) { r.Badge = "NEW"; r.BadgeColor = Theme.Info; }
            return r;
        }

        void OpenJob(SheetListItem item, bool fromList)
        {
            backToJobs = fromList;
            if (item.IsDoc) OpenDoc(item); else OpenSheet(item);
        }

        /// <summary>Back from a job: to the list it was chosen from, or home.</summary>
        void ShowBack()
        {
            if (backToJobs && kind >= 0)
            {
                sheetItems = repo.List();
                sheetItems.AddRange(repo.ListDocs());
                ShowJobs(kind);
            }
            else ShowHome();
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
            header.Set("Opening " + item.Number + "...", "", false, 0, 0);
            header.Refresh();
            int t0 = Environment.TickCount;
            try { session = repo.Open(item.Stem); Timing("open " + item.Number + " (" + item.Lines + " parts; " + repo.LastOpenTiming + ")", t0); }
            catch (Exception ex)
            {
                Cursor.Current = Cursors.Default;
                ChoiceDialog.Tell(this, "Cannot open sheet", ex.Message);
                ShowBack();
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

        /// <summary>A picking list, CPO or MIT opens on its own screen; back here when it closes.</summary>
        void OpenDoc(SheetListItem item)
        {
            if (item.Error.Length > 0)
            {
                ChoiceDialog.Tell(this, "Bad document file", item.Error + "\r\n\r\nAsk the store to send it again.");
                return;
            }
            DocSession doc;
            try { doc = repo.OpenDoc(item.Stem); }
            catch (Exception ex) { ChoiceDialog.Tell(this, "Cannot open", ex.Message); return; }
            CheckScanner();
            scanTimer.Enabled = false; // the document screen has its own scan timer
            try { using (DocForm f = new DocForm(doc)) f.ShowDialog(); }
            finally { scanTimer.Enabled = true; }
            ShowBack();
        }

        void ShowCount()
        {
            screen = Screen.Count;
            editingId = 0;
            ClearEntry(false);
            ApplyMode();
            SetStatus(txtBin.Text.Length == 0 ? "Pull the trigger to scan the BIN label" : "Pull the trigger to scan the PART label", Good);
            RefreshTitle();
            CountKeys();
            Show(countPanel);
            FocusOn(txtBin.Text.Length == 0 ? txtBin : txtPart);
            scan.Reset();
        }

        void CountKeys()
        {
            if (editingId != 0)
                keys.Clear().Add("Ent", "Next / save", Keys.Enter).Add("Esc", "Cancel edit", Keys.Escape);
            else
                keys.Clear().Add("F1", "Find", Keys.F1).Add("F2", "Review", Keys.F2).Add("F3", "Bin", Keys.F3).Add("F4", "Clear", Keys.F4).Add("Esc", "Menu", Keys.Escape);
        }

        void ShowReview()
        {
            screen = Screen.Review;
            RefreshReview();
            Show(reviewPanel);
            FocusOn(reviewList.Sink);
        }

        void RefreshReview()
        {
            int keep = reviewList.SelectedIndex;
            reviewEntries = new List<CountEntry>(session.Entries);
            reviewList.Clear();
            foreach (CountEntry e in reviewEntries)
            {
                ListItem r = new ListItem(e.PartNumber);
                r.Detail = (e.OnSheet ? "" : "NOT ON SHEET \u00B7 ") + (e.Bin.Length == 0 ? "no bin" : e.Bin) + (e.Remarks.Length > 0 ? " \u00B7 " + e.Remarks : "");
                r.Alert = !e.OnSheet;
                r.Badge = e.Quantity + (e.Damaged > 0 ? " +" + e.Damaged + " dmg" : "");
                r.BadgeColor = e.Damaged > 0 ? Theme.Busy : Theme.Info;
                reviewList.Add(r);
            }
            reviewTitle.Text = (session.Finished ? "FINISHED  \u00B7  " : "") + reviewEntries.Count + " entries  \u00B7  " + session.TotalQuantity + " pcs" +
                               (session.TotalDamaged > 0 ? "  \u00B7  " + session.TotalDamaged + " damaged" : "");
            reviewTitle.ForeColor = session.Finished ? Good : Theme.Muted;
            header.Set("Review " + session.Sheet.SheetNumber, session.CountedLines + "/" + session.LineCount + " parts", false, session.CountedLines, session.LineCount);
            if (session.Finished)
                keys.Clear().Add("Esc", "Back", Keys.Escape);
            else
                keys.Clear().Add("Ent", "Edit", Keys.Enter).Add("F3", "Delete", Keys.F3).Add("F4", "Finish", Keys.F4).Add("Esc", "Count", Keys.Escape);
            if (reviewEntries.Count > 0) reviewList.SelectedIndex = Math.Min(Math.Max(keep, 0), reviewEntries.Count - 1);
        }

        // ── Keys ──────────────────────────────────────────────────────────────────

        protected override void OnKeyDown(KeyEventArgs e)
        {
            base.OnKeyDown(e);
            if (HandleKey(e.KeyCode)) e.Handled = true;
        }

        /// <summary>A key from the keypad, or a key of the key bar tapped with the stylus.</summary>
        bool HandleKey(Keys k)
        {
            switch (screen)
            {
                case Screen.Home: return HomeKey(k);
                case Screen.Jobs: return JobsKey(k);
                case Screen.Count: return CountKey(k);
                case Screen.Review: return ReviewKey(k);
                case Screen.Find: return FindKey(k);
            }
            return false;
        }

        static int Digit(Keys k)
        {
            if (k >= Keys.D1 && k <= Keys.D9) return k - Keys.D1;
            if (k >= Keys.NumPad1 && k <= Keys.NumPad9) return k - Keys.NumPad1;
            return -1;
        }

        bool HomeKey(Keys k)
        {
            int d = Digit(k);
            if (d >= 0 && d < homeList.Count) { homeList.SelectedIndex = d; OpenKind(KindAt(d)); return true; }
            switch (k)
            {
                case Keys.Enter: if (homeList.SelectedIndex >= 0) OpenKind(KindAt(homeList.SelectedIndex)); return true;
                case Keys.Escape: Close(); return true;
                case Keys.Up: homeList.Move(-1); return true;
                case Keys.Down: homeList.Move(1); return true;
            }
            return false;
        }

        bool JobsKey(Keys k)
        {
            switch (k)
            {
                case Keys.Enter: if (jobsList.SelectedIndex >= 0) OpenJob(jobs[jobsList.SelectedIndex], true); return true;
                case Keys.Escape: ShowHome(); return true;
                case Keys.Up: jobsList.Move(-1); return true;
                case Keys.Down: jobsList.Move(1); return true;
            }
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
                    if (session.Finished) ShowBack(); else ShowCount();
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
                case Keys.Up: reviewList.Move(-1); return true;
                case Keys.Down: reviewList.Move(1); return true;
            }
            return false;
        }

        void CountMenu()
        {
            int c = ChoiceDialog.Ask(this, "Menu", "Entries are already saved.\r\nScanning: " + ModeName(mode),
                "Review entries", "Parts left in bin / find a part", "New bin", "Scan mode (adds 1 per scan, or type)", "Back to the jobs");
            if (c == 0) ShowReview();
            else if (c == 1) ShowFind();
            else if (c == 2) FocusBin();
            else if (c == 3) ChooseMode();
            else if (c == 4) ShowBack();
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
            bigBand.Visible = !typing;
            Color fore = mode == ScanMode.Remove ? Warn : Theme.Info;
            Theme.Colour(bigBand, lblBig, fore, Theme.BackFor(fore));
            lblBig.Text = mode == ScanMode.Remove ? "EACH SCAN REMOVES 1" : "EACH SCAN ADDS 1";
        }

        void RefreshTitle()
        {
            header.Set(session.Sheet.SheetNumber, session.CountedLines + "/" + session.LineCount + " parts", false, session.CountedLines, session.LineCount);
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
            Show(findPanel);
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
            {
                ListItem r = new ListItem(b.Bin);
                r.Badge = b.Left == 0 ? "DONE" : b.Left + " of " + b.Parts + " left";
                r.BadgeColor = b.Left == 0 ? Good : b.Left < b.Parts ? Theme.Busy : Theme.Info;
                r.Progress = b.Parts > 0 ? (float)(b.Parts - b.Left) / b.Parts : -1f;
                findList.Add(r);
            }
            header.Set("Bins \u00B7 " + session.Sheet.SheetNumber, session.CountedLines + "/" + session.LineCount + " parts", false, session.CountedLines, session.LineCount);
            keys.Clear().Add("Ent", "Go to bin", Keys.Enter).Add("F1", "Parts", Keys.F1).Add("Esc", "Back", Keys.Escape);
            findList.EmptyText = "Type the start of a bin to filter.";
        }

        void RefreshFind()
        {
            findList.Clear();
            if (findBins)
            {
                RefreshBins();
                if (binHits.Count > 0) findList.SelectedIndex = 0;
                return;
            }
            keys.Clear().Add("Ent", "Count it", Keys.Enter).Add("F1", "Bins", Keys.F1).Add("Esc", "Back", Keys.Escape);
            string q = Norm.PartFromScan(txtFind.Text);
            string bin = Norm.Code(txtBin.Text);
            if (q.Length > 0)
            {
                findHits = session.FindParts(q, FindMax);
                findTitle.Text = findHits.Count == 0 ? "No part on the sheet starts with that"
                               : findHits.Count >= FindMax ? "First " + FindMax + " parts found" : findHits.Count + " part(s) found";
                header.Set("Find a part", "", false, 0, 0);
            }
            else
            {
                findHits = new List<SheetHit>();
                if (bin.Length == 0) findTitle.Text = "No bin chosen: type or scan a part";
                else
                {
                    int onSheet = session.SheetPartsInBin(bin), left;
                    findHits = session.PartsLeftInBin(bin, FindMax, out left);
                    findTitle.Text = onSheet == 0 ? "The sheet has no parts for bin " + bin
                                   : left == 0 ? "All " + onSheet + " parts in " + bin + " are counted"
                                   : bin + ": " + left + " of " + onSheet + " parts left" + (left > FindMax ? " (first " + FindMax + ")" : "");
                    header.Set("Parts left \u00B7 " + bin, onSheet == 0 ? "" : (onSheet - left) + "/" + onSheet, false, onSheet - left, onSheet);
                }
                if (bin.Length == 0) header.Set("Find a part", "", false, 0, 0);
            }
            findList.EmptyText = "Type or scan a part number to find it on the sheet.";
            foreach (SheetHit h in findHits)
            {
                ListItem r = new ListItem(h.Line.PartNumber);
                r.Detail = h.Line.Description + (q.Length > 0 && h.Line.Bin.Length > 0 ? " \u00B7 bin " + h.Line.Bin : "");
                if (h.CountedQty >= 0) { r.Badge = h.CountedQty + " counted"; r.BadgeColor = Good; }
                findList.Add(r);
            }
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
                case Keys.Up: findList.Move(-1); return true;
                case Keys.Down: findList.Move(1); return true;
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
                SetInfo(info);
                SetWarn(warn);
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
            if (text.Length == 0) { part = null; committedPart = ""; SetInfo(""); SetWarn(""); return; }
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
            SetInfo(PartInfoText(part));
            ShowWarnings(true);
        }

        void ShowWarnings(bool beep)
        {
            string w = "";
            if (part != null && !part.OnSheet) w = "NOT ON THIS SHEET";
            string bw = session.BinWarning(txtBin.Text, part);
            if (bw.Length > 0) w += (w.Length > 0 ? "\r\n" : "") + bw;
            SetWarn(w);
            if (beep && w.Length > 0) Beeper.Error();
        }

        /// <summary>The part's description and stock, on a grey band only while there is something to show.</summary>
        void SetInfo(string text)
        {
            lblInfo.Text = text;
            Theme.Colour(infoBand, lblInfo, Ink, text.Length > 0 ? Theme.Shade : Theme.Paper);
        }

        /// <summary>The warning band is red only while there is a warning.</summary>
        void SetWarn(string text)
        {
            lblWarn.Text = text;
            Theme.Colour(warnBand, lblWarn, Warn, text.Length > 0 ? Theme.WarnBack : Theme.Paper);
        }

        void ClearEntry(bool keepBin)
        {
            part = null;
            committedPart = "";
            txtPart.Text = "";
            txtQty.Text = "";
            txtDmg.Text = "";
            txtNote.Text = "";
            SetInfo("");
            SetWarn("");
            if (editingId != 0) { editingId = 0; txtBin.Text = ""; CountKeys(); }
            if (screen == Screen.Count) { FocusOn(txtPart); scan.Reset(); }
        }

        void SetStatus(string text, Color color)
        {
            lblStatus.Text = text;
            Theme.Colour(statusBand, lblStatus, Color.White, text.Length == 0 ? Theme.Paper : color == Warn ? Warn : color == Good ? Good : Theme.Midnight);
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
                CountKeys();
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
            CountKeys();
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
            ChoiceDialog.Tell(this, "Sheet finished", "Locked. Put the handheld in its cradle: the counts go to the web by themselves.");
            ShowBack();
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
