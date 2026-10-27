using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace Danamotors.Hhdc.Device
{
    /// <summary>
    /// Picking an indent or CPO, or checking an MIT, on the MC3190's 318x269 screen with the keypad. One line at a
    /// time, in bin order (MIT: case order). A scan of the line's part adds 1; a scan of another line's part or bin
    /// moves there. All rules live in DocSession; this class only shows state and passes keys.
    /// </summary>
    public sealed class DocForm : Form
    {
        enum Typing { None, Quantity, Damaged, Note }
        // The Compact Framework has no MethodInvoker or Action.
        delegate void Change();

        static readonly Color Warn = Color.FromArgb(190, 0, 0);
        static readonly Color Good = Color.FromArgb(0, 110, 0);
        static readonly Color Blue = Color.FromArgb(0, 0, 150);

        readonly DocSession session;
        readonly Timer scanTimer = new Timer();
        readonly ScanDetector scan = new ScanDetector();

        readonly Panel workPanel = new Panel();
        readonly Label lblTitle = new Label();
        readonly Label lblProgress = new Label();
        readonly Label lblWhere = new Label();
        readonly Label lblPart = new Label();
        readonly Label lblDesc = new Label();
        readonly Label lblBig = new Label();
        readonly Label lblNote = new Label();
        readonly Label lblBox = new Label();
        readonly TextBox txtScan = new TextBox();
        readonly Label lblStatus = new Label();
        readonly Label lblKeys = new Label();

        readonly Panel linesPanel = new Panel();
        readonly Label linesTitle = new Label();
        readonly ListBox linesList = new ListBox();
        readonly Label linesKeys = new Label();

        int current;
        bool damagedMode;   // MIT: scans count damaged units
        Typing typing = Typing.None;
        bool showingLines;

        public DocForm(DocSession session)
        {
            this.session = session;
            Text = DocTypes.Short(session.Doc.Type) + " " + session.Doc.Reference;
            MinimizeBox = false;
            MaximizeBox = false;
            KeyPreview = true;
            BackColor = Color.White;
            if (Environment.OSVersion.Platform != PlatformID.WinCE)
            {
                FormBorderStyle = FormBorderStyle.FixedSingle;
                ClientSize = new Size(318, 269);
            }
            BuildWork();
            BuildLines();
            foreach (Panel p in new Panel[] { workPanel, linesPanel })
            {
                p.Bounds = new Rectangle(0, 0, 318, 269);
                p.BackColor = Color.White;
                Controls.Add(p);
            }
            txtScan.KeyPress += OnScanKeyPress;
            scanTimer.Interval = 40;
            scanTimer.Tick += OnScanTick;
            scanTimer.Enabled = true;

            int open = session.NextOpen(-1);
            current = open < 0 ? 0 : open;
            ShowWork();
            if (session.SkippedRecords > 0)
                ChoiceDialog.Tell(this, "Results file", session.SkippedRecords + " unreadable record(s) were ignored (a battery pull while saving?). Check the lines (F1).");
        }

        /// <summary>The line being worked on (for tests).</summary>
        public int CurrentLine { get { return current; } }

        // ── Layout ────────────────────────────────────────────────────────────────

        static Font Bold(float size) { return new Font(FontFamily.GenericSansSerif, size, FontStyle.Bold); }
        static Font Plain(float size) { return new Font(FontFamily.GenericSansSerif, size, FontStyle.Regular); }

        static void Put(Panel on, Label l, int x, int y, int w, int h, Font f)
        {
            l.Font = f;
            l.Bounds = new Rectangle(x, y, w, h);
            on.Controls.Add(l);
        }

        void BuildWork()
        {
            Put(workPanel, lblTitle, 4, 2, 310, 18, Bold(9f));
            Put(workPanel, lblProgress, 4, 20, 310, 16, Plain(8f));
            Put(workPanel, lblWhere, 4, 38, 310, 24, Bold(13f));
            lblWhere.ForeColor = Blue;
            Put(workPanel, lblPart, 4, 64, 310, 22, Bold(12f));
            Put(workPanel, lblDesc, 4, 86, 310, 18, Plain(9f));
            Put(workPanel, lblBig, 4, 106, 310, 30, Bold(15f));
            Put(workPanel, lblNote, 4, 138, 310, 30, Bold(9f));
            lblNote.ForeColor = Warn;
            Put(workPanel, lblBox, 4, 174, 44, 22, Bold(10f));
            txtScan.Font = Bold(12f);
            txtScan.Bounds = new Rectangle(50, 172, 262, 26);
            txtScan.MaxLength = CountSession.MaxCodeLength;
            workPanel.Controls.Add(txtScan);
            Put(workPanel, lblStatus, 4, 202, 310, 20, Bold(9f));
            Put(workPanel, lblKeys, 4, 224, 310, 42, Plain(8f));
        }

        void BuildLines()
        {
            Put(linesPanel, linesTitle, 4, 2, 310, 22, Bold(10f));
            linesList.Font = Plain(10f);
            linesList.Bounds = new Rectangle(4, 26, 310, 206);
            linesPanel.Controls.Add(linesList);
            Put(linesPanel, linesKeys, 4, 236, 310, 30, Plain(8f));
        }

        // ── Screens ───────────────────────────────────────────────────────────────

        void ShowWork()
        {
            showingLines = false;
            linesPanel.Visible = false;
            workPanel.Visible = true;
            EndTyping();
            Redraw(true);
            txtScan.Focus();
            scan.Reset();
        }

        void Redraw(bool keepStatus)
        {
            HandheldDoc d = session.Doc;
            DocLine l = session.Line(current);
            int n = session.LineCount;
            lblTitle.Text = DocTypes.Short(d.Type) + " " + d.Reference + "  " + d.Party;
            lblProgress.Text = "Line " + (current + 1) + "/" + n + "   done " + session.DoneLines + "/" + n + "   " +
                               (session.TotalQuantity + session.TotalDamaged) + "/" + d.TotalExpected + " pcs" + (session.Finished ? "  FINISHED" : "");
            lblWhere.Text = session.Picking ? (l.Bin.Length > 0 ? "Bin " + l.Bin : "No bin")
                                            : "Case " + (l.Case.Length > 0 ? l.Case : "-") + (l.Bin.Length > 0 ? "  bin " + l.Bin : "");
            lblPart.Text = l.PartNumber;
            lblDesc.Text = l.Description;
            int q = session.Quantity(current), dm = session.Damaged(current);
            lblBig.Text = (session.Picking ? "PICKED " : "RECEIVED ") + q + " of " + l.Expected + (dm > 0 ? "  DMG " + dm : "");
            lblBig.ForeColor = session.Done(current) ? Good : Color.Black;
            LineResult r = session.Result(current);
            string note = "";
            if (r != null && r.Reason.Length > 0) note = "Short: " + ShortReasons.Label(r.Reason);
            if (r != null && r.Scanned.Length > 0) note += (note.Length > 0 ? "\r\n" : "") + "Found instead: " + r.Scanned;
            if (r != null && r.Note.Length > 0) note += (note.Length > 0 ? "  " : "") + r.Note;
            lblNote.Text = note;
            if (typing == Typing.None)
            {
                lblBox.Text = damagedMode ? "DMG" : "Scan";
                lblBox.ForeColor = damagedMode ? Warn : Color.Black;
            }
            lblKeys.Text = session.Finished
                ? "Finished and locked. Dock the handheld and use HHDC Link: Receive.  Esc=back"
                : session.Picking
                    ? "Scan part=+1  Up/Down=line  F1=lines  F2=type qty\r\nF3=short reason  F4=finish  Esc=menu"
                    : "Scan part=+1  Up/Down=line  F1=lines  F2=type qty\r\nF3=" + (damagedMode ? "scans count GOOD" : "scans count DAMAGED") + "  F4=finish  Esc=menu";
            if (!keepStatus) SetStatus("", Good);
        }

        void SetStatus(string text, Color color)
        {
            lblStatus.Text = text;
            lblStatus.ForeColor = color;
            if (color == Warn && text.Length > 0) Beeper.Error();
        }

        void ShowLines()
        {
            showingLines = true;
            EndTyping();
            linesList.Items.Clear();
            for (int i = 0; i < session.LineCount; i++)
            {
                DocLine l = session.Line(i);
                string where = session.Picking ? l.Bin : l.Case;
                linesList.Items.Add((session.Done(i) ? "OK " : "-- ") + (where.Length > 0 ? where : "-") + "  " + l.PartNumber + "  " +
                                    (session.Quantity(i) + session.Damaged(i)) + "/" + l.Expected);
            }
            foreach (ExtraPart e in session.Extras)
                linesList.Items.Add("+  EXTRA " + e.PartNumber + "  " + e.Quantity + (e.Damaged > 0 ? "+" + e.Damaged + "d" : ""));
            linesTitle.Text = session.DoneLines + " of " + session.LineCount + " lines done" + (session.Extras.Count > 0 ? ", " + session.Extras.Count + " extra" : "");
            linesKeys.Text = "Enter=go to line (extra: delete)  Esc=back";
            linesList.SelectedIndex = Math.Min(current, linesList.Items.Count - 1);
            workPanel.Visible = false;
            linesPanel.Visible = true;
            linesList.Focus();
        }

        // ── Keys ──────────────────────────────────────────────────────────────────

        protected override void OnKeyDown(KeyEventArgs e)
        {
            base.OnKeyDown(e);
            if (showingLines ? LinesKey(e.KeyCode) : WorkKey(e.KeyCode)) e.Handled = true;
        }

        bool LinesKey(Keys k)
        {
            switch (k)
            {
                case Keys.Escape: ShowWork(); return true;
                case Keys.Enter:
                    int i = linesList.SelectedIndex;
                    if (i < 0) return true;
                    if (i < session.LineCount) { current = i; ShowWork(); return true; }
                    ExtraPart x = session.Extras[i - session.LineCount];
                    if (ChoiceDialog.Ask(this, "Extra part", x.PartNumber + " (not on this MIT): " + x.Quantity + (x.Damaged > 0 ? " + " + x.Damaged + " damaged" : "") + ".", "Delete it") == 0)
                    {
                        Try(delegate { session.DeleteExtra(x.Id); });
                        ShowLines();
                    }
                    return true;
                case Keys.Up: if (linesList.SelectedIndex > 0) linesList.SelectedIndex--; return true;
                case Keys.Down: if (linesList.SelectedIndex < linesList.Items.Count - 1) linesList.SelectedIndex++; return true;
            }
            return false;
        }

        bool WorkKey(Keys k)
        {
            if (session.Finished)
            {
                if (k == Keys.Escape) { Close(); return true; }
                if (k == Keys.F1) { ShowLines(); return true; }
                if (k == Keys.Up || k == Keys.Down) { Move(k == Keys.Up ? -1 : 1); return true; }
                return k == Keys.Enter;
            }
            switch (k)
            {
                case Keys.Enter:
                    if (typing != Typing.None) CommitTyping();
                    else if (txtScan.Text.Trim().Length > 0) HandleScan(txtScan.Text);
                    return true;
                case Keys.Escape:
                    if (typing != Typing.None) { EndTyping(); Redraw(false); } else ShowMenu();
                    return true;
                case Keys.Up: if (typing == Typing.None) Move(-1); return true;
                case Keys.Down: if (typing == Typing.None) Move(1); return true;
                case Keys.F1: ShowLines(); return true;
                case Keys.F2: StartTyping(Typing.Quantity); return true;
                case Keys.F3: if (session.Picking) AskReason(current); else ToggleDamaged(); return true;
                case Keys.F4: FinishDoc(); return true;
            }
            return false;
        }

        void Move(int step)
        {
            current = Math.Max(0, Math.Min(session.LineCount - 1, current + step));
            Redraw(false);
        }

        void ShowMenu()
        {
            int c = ChoiceDialog.Ask(this, "Menu", "Everything is already saved.",
                "Lines (F1)", "Type the quantity (F2)", session.Picking ? "Short reason (F3)" : "Type the damaged quantity",
                "Remove 1 from this line", "Note on this line", "Finish (F4)", "Back to the list");
            if (c == 0) ShowLines();
            else if (c == 1) StartTyping(Typing.Quantity);
            else if (c == 2) { if (session.Picking) AskReason(current); else StartTyping(Typing.Damaged); }
            else if (c == 3) Try(delegate { session.Scan(current, -1, damagedMode); SetStatus("-1 on this line", Good); });
            else if (c == 4) StartTyping(Typing.Note);
            else if (c == 5) FinishDoc();
            else if (c == 6) { Close(); return; }
            Redraw(true);
        }

        void ToggleDamaged()
        {
            damagedMode = !damagedMode;
            Redraw(false);
            SetStatus(damagedMode ? "Scans now count DAMAGED units" : "Scans now count good units", damagedMode ? Warn : Good);
        }

        // ── Typing a quantity or a note in the scan box ───────────────────────────

        void StartTyping(Typing what)
        {
            if (what == Typing.Damaged && session.Picking) return;
            typing = what;
            lblBox.Text = what == Typing.Quantity ? "Qty" : what == Typing.Damaged ? "Dmg" : "Note";
            lblBox.ForeColor = Blue;
            LineResult r = session.Result(current);
            txtScan.MaxLength = what == Typing.Note ? DocSession.MaxNoteLength : 7;
            txtScan.Text = what == Typing.Quantity ? session.Quantity(current).ToString()
                         : what == Typing.Damaged ? session.Damaged(current).ToString()
                         : r == null ? "" : r.Note;
            txtScan.SelectAll();
            txtScan.Focus();
            SetStatus(what == Typing.Note ? "Type the note, Enter to save, Esc to cancel" : "Type the quantity, Enter to save, Esc to cancel", Blue);
        }

        void EndTyping()
        {
            typing = Typing.None;
            txtScan.MaxLength = CountSession.MaxCodeLength;
            txtScan.Text = "";
        }

        void CommitTyping()
        {
            Typing what = typing;
            string text = txtScan.Text;
            if (what == Typing.Note)
            {
                if (Try(delegate { session.SetNote(current, text); })) { EndTyping(); Redraw(false); SetStatus("Note saved", Good); }
                return;
            }
            int n;
            if (!CountSession.TryParseCount(text, false, out n)) { SetStatus("Enter a whole number", Warn); txtScan.SelectAll(); return; }
            int q = what == Typing.Quantity ? n : session.Quantity(current);
            int d = what == Typing.Damaged ? n : session.Damaged(current);
            if (!Try(delegate { session.Set(current, q, d); })) { txtScan.SelectAll(); return; }
            EndTyping();
            AfterChange("Saved");
            if (session.Picking && session.Quantity(current) < session.Line(current).Expected && session.Reason(current).Length == 0)
                AskReason(current);
        }

        // ── Scans ─────────────────────────────────────────────────────────────────

        void HandleScan(string text)
        {
            txtScan.Text = "";
            scan.Reset();
            ScanMatch m = session.Match(text, current);
            if (m.Kind == ScanKind.Bin)
            {
                if (m.Lines.Contains(current)) { SetStatus((session.Picking ? "Bin" : "Case") + " OK: scan the part", Good); return; }
                int open = -1;
                foreach (int i in m.Lines) if (!session.Done(i)) { open = i; break; }
                current = open >= 0 ? open : m.Lines[0];
                Redraw(false);
                SetStatus("Moved to line " + (current + 1), Good);
                return;
            }
            if (m.Kind == ScanKind.Part)
            {
                int i = session.LineWithRoom(m.Lines);
                DocLine l = session.Line(i);
                if (session.Quantity(i) + session.Damaged(i) >= l.Expected)
                {
                    current = i;
                    Redraw(false);
                    SetStatus("All " + l.Expected + " already " + (session.Picking ? "picked" : "checked") + " for " + l.PartNumber, Warn);
                    return;
                }
                bool moved = i != current;
                current = i;
                if (Try(delegate { session.Scan(i, 1, damagedMode); }))
                    AfterChange((moved ? "Line " + (i + 1) + ": " : "") + (damagedMode ? "+1 damaged" : "+1"));
                return;
            }
            NotOnDocument(m.Part);
        }

        void NotOnDocument(string part)
        {
            Beeper.Error();
            if (part.Length == 0) return;
            if (session.Picking)
            {
                DocLine l = session.Line(current);
                int c = ChoiceDialog.Ask(this, "Not on this document",
                    part + " is not on this document.\r\nThis line needs " + l.PartNumber + ".\r\nA part found instead is not picked: the store decides.",
                    "Record " + part + " as found instead");
                if (c == 0 && Try(delegate { session.SetSubstitute(current, part); })) { Redraw(false); SetStatus("Recorded for the store", Good); }
                else Redraw(true);
                return;
            }
            int a = ChoiceDialog.Ask(this, "Not on this MIT", part + " is not on this MIT.\r\nIt will not go into stock; the store takes it up with Mobis.",
                "Record it as an extra part (+1" + (damagedMode ? " damaged" : "") + ")");
            if (a == 0 && Try(delegate { session.ScanExtra(part, 1, damagedMode); })) SetStatus("Extra " + part + " recorded", Good);
            Redraw(true);
        }

        /// <summary>After a line changes: when it is complete, move on to the next open line.</summary>
        void AfterChange(string what)
        {
            if (session.Done(current) && session.Quantity(current) + session.Damaged(current) >= session.Line(current).Expected)
            {
                int next = session.NextOpen(current);
                if (next < 0) { Redraw(false); SetStatus(what + ". All lines done: F4 to finish", Good); return; }
                current = next;
                Redraw(false);
                SetStatus(what + ". Line done; next line " + (next + 1), Good);
                return;
            }
            Redraw(false);
            SetStatus(what, Good);
        }

        // ── Short reasons and finishing ───────────────────────────────────────────

        /// <summary>Ask why a picking line is short. False if the picker pressed Esc.</summary>
        bool AskReason(int i)
        {
            DocLine l = session.Line(i);
            if (session.Quantity(i) >= l.Expected) { SetStatus("Picked in full: no reason needed", Good); return true; }
            int c = ChoiceDialog.Ask(this, "Short: line " + (i + 1),
                l.PartNumber + (l.Bin.Length > 0 ? "  bin " + l.Bin : "") + "\r\nPicked " + session.Quantity(i) + " of " + l.Expected + ". Why?",
                ShortReasons.Labels);
            if (c < 0) return false;
            bool ok = Try(delegate { session.SetReason(i, ShortReasons.Codes[c]); });
            if (ok && i == current) AfterChange("Reason saved");
            return ok;
        }

        void FinishDoc()
        {
            if (session.Picking)
            {
                List<int> missing = session.ShortWithoutReason();
                int untouched = 0;
                foreach (int i in missing) if (!session.Touched(i)) untouched++;
                if (untouched >= 2)
                {
                    int c = ChoiceDialog.Ask(this, "Not picked", untouched + " line(s) were not picked at all.", "Give each a reason", "Mark all " + untouched + ": Not found");
                    if (c < 0) return;
                    if (c == 1)
                        foreach (int i in missing)
                            if (!session.Touched(i) && !Try(delegate { session.SetReason(i, "NOT_FOUND"); })) return;
                }
                foreach (int i in session.ShortWithoutReason())
                {
                    current = i;
                    Redraw(false);
                    if (!AskReason(i)) { SetStatus("Finish stopped: give the reason for this line", Warn); return; }
                }
            }
            string msg = session.Picking
                ? session.TotalQuantity + " of " + session.Doc.TotalExpected + " picked.\r\nAfter finishing, the document is locked."
                : session.TotalQuantity + " good, " + session.TotalDamaged + " damaged of " + session.Doc.TotalExpected + "." +
                  (session.UncheckedLines > 0 ? "\r\n" + session.UncheckedLines + " line(s) not checked: the store checks them on the MRN." : "") +
                  (session.Extras.Count > 0 ? "\r\n" + session.Extras.Count + " extra part(s)." : "") + "\r\nAfter finishing, it is locked.";
            if (ChoiceDialog.Ask(this, "Finish", msg, "Finish") != 0) { Redraw(true); return; }
            if (!Try(delegate { session.Finish(); })) return;
            ChoiceDialog.Tell(this, "Finished", "Locked. Dock the handheld and use HHDC Link: Receive from device.");
            Close();
        }

        /// <summary>Runs a change; a rule broken or a file problem shows in the status line with the error sound. True if it worked.</summary>
        bool Try(Change change)
        {
            try { change(); return true; }
            catch (CountException ex) { SetStatus(ex.Message, Warn); }
            catch (IOException ex) { SetStatus("NOT SAVED: " + ex.Message, Warn); }
            return false;
        }

        // ── Scanner ───────────────────────────────────────────────────────────────

        void OnScanKeyPress(object sender, KeyPressEventArgs e)
        {
            if (e.KeyChar == '\r' || e.KeyChar == '\n' || e.KeyChar == '\t') { e.Handled = true; return; }
            if (typing == Typing.None && e.KeyChar >= ' ') scan.Key(Environment.TickCount);
        }

        void OnScanTick(object sender, EventArgs e)
        {
            if (showingLines || typing != Typing.None || session.Finished || !scan.Poll(Environment.TickCount)) return;
            if (txtScan.Text.Trim().Length > 0) HandleScan(txtScan.Text);
            scan.Reset();
        }

        protected override void OnClosed(EventArgs e)
        {
            scanTimer.Enabled = false;
            base.OnClosed(e);
        }
    }
}
