using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace Danamotors.Hhdc.Link
{
    /// <summary>HHDC Link: send count sheets to the handheld, and take finished ones back to the server.</summary>
    public sealed class MainForm : Form
    {
        readonly string dataDir;
        LinkSettings settings;
        ApiClient api;

        readonly TextBox txtServer = new TextBox();
        readonly TextBox txtEmail = new TextBox();
        readonly TextBox txtPassword = new TextBox();
        readonly Button btnSignIn = new Button();
        readonly Label lblUser = new Label();
        readonly CheckBox chkAllBranches = new CheckBox();

        readonly ListView sheets = new ListView();
        readonly Button btnRefresh = new Button();
        readonly Button btnSend = new Button();

        readonly Label lblDevice = new Label();
        readonly TextBox txtFolder = new TextBox();
        readonly ListView onDevice = new ListView();
        readonly Button btnDeviceRefresh = new Button();
        readonly Button btnReceive = new Button();
        readonly Button btnInstall = new Button();
        readonly TextBox log = new TextBox();

        List<WorkItem> items = new List<WorkItem>();
        List<DeviceSheet> deviceItems = new List<DeviceSheet>();

        public MainForm(string dataDir, LinkSettings overrides)
        {
            this.dataDir = dataDir;
            settings = overrides ?? LinkSettings.Load(dataDir);
            Text = "HHDC Link - Danamotors";
            ClientSize = new Size(820, 640);
            MinimumSize = new Size(760, 600);
            Font = new Font("Segoe UI", 9f);
            Build();
            txtServer.Text = settings.Server;
            txtEmail.Text = settings.Email;
            txtFolder.Text = settings.DeviceFolder;
            Say("Sign in with your Danamotors account, then refresh the list of sheets.");
            UpdateButtons();
        }

        void Build()
        {
            GroupBox account = new GroupBox { Text = "1. Danamotors account", Left = 12, Top = 8, Width = 796, Height = 84, Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
            Add(account, new Label { Text = "Server", Left = 12, Top = 26, Width = 60 });
            txtServer.SetBounds(76, 22, 330, 24); account.Controls.Add(txtServer);
            Add(account, new Label { Text = "Email", Left = 12, Top = 54, Width = 60 });
            txtEmail.SetBounds(76, 50, 200, 24); account.Controls.Add(txtEmail);
            Add(account, new Label { Text = "Password", Left = 284, Top = 54, Width = 60 });
            txtPassword.SetBounds(348, 50, 140, 24); txtPassword.UseSystemPasswordChar = true; account.Controls.Add(txtPassword);
            btnSignIn.Text = "Sign in"; btnSignIn.SetBounds(500, 49, 90, 26); btnSignIn.Click += delegate { SignIn(); }; account.Controls.Add(btnSignIn);
            lblUser.SetBounds(420, 25, 360, 20); lblUser.Text = "Not signed in"; account.Controls.Add(lblUser);
            AcceptButton = btnSignIn;
            Controls.Add(account);

            GroupBox send = new GroupBox { Text = "2. Count sheets issued and not yet uploaded", Left = 12, Top = 98, Width = 796, Height = 200, Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
            sheets.SetBounds(12, 22, 772, 140); sheets.View = View.Details; sheets.FullRowSelect = true; sheets.HideSelection = false; sheets.MultiSelect = false;
            sheets.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            foreach (string c in new string[] { "Sheet", "Stock taking", "Type", "Branch", "Checker", "Parts", "Selection" }) sheets.Columns.Add(c, c == "Selection" ? 200 : c == "Checker" ? 130 : c == "Parts" ? 50 : 100);
            sheets.SelectedIndexChanged += delegate { UpdateButtons(); };
            send.Controls.Add(sheets);
            btnRefresh.Text = "Refresh list"; btnRefresh.SetBounds(12, 166, 110, 28); btnRefresh.Click += delegate { RefreshSheets(); }; send.Controls.Add(btnRefresh);
            btnSend.Text = "Send to device"; btnSend.SetBounds(130, 166, 130, 28); btnSend.Click += delegate { SendSelected(); }; send.Controls.Add(btnSend);
            chkAllBranches.Text = "All branches (only if you may see them)"; chkAllBranches.SetBounds(280, 169, 300, 22); send.Controls.Add(chkAllBranches);
            Controls.Add(send);

            GroupBox dev = new GroupBox { Text = "3. Handheld", Left = 12, Top = 304, Width = 796, Height = 238, Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
            lblDevice.SetBounds(12, 22, 772, 20); lblDevice.Text = "Dock the handheld in its USB cradle and wake it."; dev.Controls.Add(lblDevice);
            onDevice.SetBounds(12, 46, 772, 140); onDevice.View = View.Details; onDevice.FullRowSelect = true; onDevice.HideSelection = false; onDevice.MultiSelect = false;
            onDevice.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            foreach (string c in new string[] { "Sheet", "State", "Entries", "Quantity", "Damaged", "Sent to device (PC time)" }) onDevice.Columns.Add(c, c.StartsWith("Sent") ? 180 : 110);
            onDevice.SelectedIndexChanged += delegate { UpdateButtons(); };
            dev.Controls.Add(onDevice);
            btnDeviceRefresh.Text = "Read device"; btnDeviceRefresh.SetBounds(12, 192, 110, 28); btnDeviceRefresh.Click += delegate { RefreshDevice(); }; dev.Controls.Add(btnDeviceRefresh);
            btnReceive.Text = "Receive from device"; btnReceive.SetBounds(130, 192, 160, 28); btnReceive.Click += delegate { ReceiveSelected(); }; dev.Controls.Add(btnReceive);
            btnInstall.Text = "Install / update app on device"; btnInstall.SetBounds(298, 192, 200, 28); btnInstall.Click += delegate { InstallApp(); }; dev.Controls.Add(btnInstall);
            Add(dev, new Label { Text = "Test folder instead of a handheld:", Left = 510, Top = 198, Width = 190 });
            txtFolder.SetBounds(666, 195, 118, 24); dev.Controls.Add(txtFolder);
            Controls.Add(dev);

            log.SetBounds(12, 548, 796, 80); log.Multiline = true; log.ReadOnly = true; log.ScrollBars = ScrollBars.Vertical;
            log.Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom;
            Controls.Add(log);
        }

        static void Add(Control parent, Control c) { parent.Controls.Add(c); }

        // ── Helpers ───────────────────────────────────────────────────────────────

        void Say(string text)
        {
            log.AppendText(DateTime.Now.ToString("HH:mm:ss") + "  " + text.Replace("\r\n", " ").Replace("\n", " ") + "\r\n");
        }

        void Fail(Exception e)
        {
            Say("PROBLEM: " + e.Message);
            MessageBox.Show(this, e.Message, "HHDC Link", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        /// <summary>Run work with a wait cursor; show a LinkException as a plain message. True if it finished.</summary>
        bool Run(Action work)
        {
            Cursor old = Cursor.Current;
            Cursor.Current = Cursors.WaitCursor;
            try { work(); return true; }
            catch (ApiException e) { if (e.Unauthorized) SignedOut(); Fail(e); }
            catch (LinkException e) { Fail(e); }
            catch (IOException e) { Fail(new LinkException("File problem: " + e.Message, e)); }
            finally { Cursor.Current = old; UpdateButtons(); }
            return false;
        }

        void SignedOut()
        {
            api = null;
            lblUser.Text = "Not signed in";
        }

        IDeviceStorage OpenDevice()
        {
            settings.DeviceFolder = txtFolder.Text.Trim();
            IDeviceStorage d = settings.OpenDevice();
            try { d.Connect(); return d; }
            catch { d.Dispose(); throw; }
        }

        LinkService Service(IDeviceStorage dev)
        {
            return new LinkService(api, dev, new UploadLedger(Path.Combine(dataDir, "uploads.log")), delegate { return DateTime.UtcNow; });
        }

        void UpdateButtons()
        {
            bool signedIn = api != null;
            btnSend.Enabled = signedIn && sheets.SelectedIndices.Count == 1;
            btnRefresh.Enabled = signedIn;
            btnReceive.Enabled = signedIn && onDevice.SelectedIndices.Count == 1;
        }

        // ── Actions ───────────────────────────────────────────────────────────────

        void SignIn()
        {
            Run(delegate
            {
                ApiClient c = new ApiClient(txtServer.Text);
                c.Login(txtEmail.Text, txtPassword.Text);
                api = c;
                settings.Server = txtServer.Text.Trim();
                settings.Email = txtEmail.Text.Trim();
                settings.DeviceFolder = txtFolder.Text.Trim();
                settings.Save(dataDir);
                txtPassword.Text = "";
                lblUser.Text = "Signed in as " + c.UserName;
                Say("Signed in as " + c.UserName + " (" + c.BaseUrl + ")");
            });
            if (api != null) RefreshSheets();
        }

        void RefreshSheets()
        {
            Run(delegate
            {
                items = api.ListOpenSheets(chkAllBranches.Checked);
                sheets.Items.Clear();
                foreach (WorkItem w in items)
                {
                    ListViewItem row = new ListViewItem(w.SheetNumber);
                    row.SubItems.Add(w.BatchNumber); row.SubItems.Add(w.StockTakeType); row.SubItems.Add(w.BranchName);
                    row.SubItems.Add(w.Checker); row.SubItems.Add(w.LineCount.ToString()); row.SubItems.Add(w.Criteria);
                    sheets.Items.Add(row);
                }
                Say(items.Count + " sheet(s) issued and not yet uploaded.");
            });
        }

        void SendSelected()
        {
            if (sheets.SelectedIndices.Count != 1) return;
            WorkItem w = items[sheets.SelectedIndices[0]];
            Run(delegate
            {
                using (IDeviceStorage dev = OpenDevice())
                {
                    Service(dev).Send(w);
                    Say("Sent sheet " + w.SheetNumber + " (" + w.LineCount + " parts) to the handheld.");
                    ReadDevice(dev);
                }
            });
        }

        void RefreshDevice()
        {
            Run(delegate { using (IDeviceStorage dev = OpenDevice()) ReadDevice(dev); });
        }

        void ReadDevice(IDeviceStorage dev)
        {
            DeviceSheets store = new DeviceSheets(dev);
            deviceItems = store.List();
            lblDevice.Text = dev.Describe() + " - " + deviceItems.Count + " sheet(s)";
            onDevice.Items.Clear();
            foreach (DeviceSheet d in deviceItems)
            {
                ListViewItem row = new ListViewItem(d.Sheet != null ? d.Sheet.SheetNumber : d.Stem);
                if (d.Error.Length > 0) { row.SubItems.Add("unusable: " + d.Error); }
                else
                {
                    row.SubItems.Add(d.Finished ? "FINISHED" : d.State.Entries.Count == 0 ? "not started" : "counting");
                    row.SubItems.Add(d.State.Entries.Count.ToString()); row.SubItems.Add(d.State.TotalQuantity.ToString());
                    row.SubItems.Add(d.State.TotalDamaged.ToString());
                    row.SubItems.Add(d.Sheet.SentAtUtc.ToLocalTime().ToString("dd MMM yyyy HH:mm"));
                }
                onDevice.Items.Add(row);
            }
        }

        void ReceiveSelected()
        {
            if (onDevice.SelectedIndices.Count != 1) return;
            DeviceSheet d = deviceItems[onDevice.SelectedIndices[0]];
            Run(delegate
            {
                using (IDeviceStorage dev = OpenDevice())
                {
                    LinkService svc = Service(dev);
                    // Re-read so the check is made on what is on the device now.
                    d = new DeviceSheets(dev).Read(d.Stem);
                    ReceiveSummary summary;
                    try { summary = svc.Check(d); }
                    catch (LinkException e) { Fail(e); return; }

                    string uncounted = ReceiveDialog.Ask(this, d.Sheet, summary);
                    if (uncounted == null) { Say("Receive cancelled; nothing was uploaded."); return; }

                    try
                    {
                        ReceiveResult r = svc.Receive(d, uncounted);
                        Say("Uploaded sheet " + d.Sheet.SheetNumber + ": " + r.Summary.Entries + " entries, " + r.Summary.Quantity + " good, " + r.Summary.Damaged + " damaged. Uncounted parts: " + uncounted + ".");
                        if (r.Cleared) Say("Removed the sheet from the handheld.");
                        else MessageBox.Show(this, "The counts were uploaded, but the sheet could not be removed from the handheld:\r\n\r\n" + r.ClearProblem +
                                             "\r\n\r\nDo NOT upload it again. Read the device again later and use Receive to clear it.", "HHDC Link", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        MessageBox.Show(this, "Sheet " + d.Sheet.SheetNumber + " uploaded. Check the counts on the Stock Taking screen.", "HHDC Link", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                    catch (AlreadyUploadedException e)
                    {
                        Say(e.Message);
                        if (MessageBox.Show(this, e.Message + "\r\n\r\nRemove this sheet from the handheld now?", "HHDC Link", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
                        {
                            svc.ClearUploaded(d);
                            Say("Removed sheet " + d.Sheet.SheetNumber + " from the handheld.");
                        }
                    }
                    ReadDevice(dev);
                }
            });
            RefreshSheetsQuiet();
        }

        void RefreshSheetsQuiet()
        {
            if (api == null) return;
            try { items = api.ListOpenSheets(chkAllBranches.Checked); } catch (LinkException) { return; }
            RefreshSheets();
        }

        void InstallApp()
        {
            string exe = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, DeviceLayout.AppFileName);
            if (!File.Exists(exe))
            {
                using (OpenFileDialog dlg = new OpenFileDialog())
                {
                    dlg.Title = "Find DanamotorsCount.exe"; dlg.Filter = "DanamotorsCount.exe|DanamotorsCount.exe";
                    if (dlg.ShowDialog(this) != DialogResult.OK) return;
                    exe = dlg.FileName;
                }
            }
            string path = exe;
            Run(delegate
            {
                using (IDeviceStorage dev = OpenDevice())
                {
                    Say(new DeviceSheets(dev).InstallApp(File.ReadAllBytes(path)));
                    MessageBox.Show(this, "Installed. On the handheld open Start > Programs > Danamotors Count.", "HHDC Link", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            });
        }
    }

    /// <summary>The check before uploading: a summary, and the choice ZERO or RELEASE for uncounted parts.</summary>
    public static class ReceiveDialog
    {
        /// <returns>"ZERO", "RELEASE", or null if cancelled.</returns>
        public static string Ask(IWin32Window owner, CountSheet sheet, ReceiveSummary s)
        {
            using (Form f = new Form())
            {
                f.Text = "Receive sheet " + sheet.SheetNumber;
                f.FormBorderStyle = FormBorderStyle.FixedDialog; f.StartPosition = FormStartPosition.CenterParent;
                f.MaximizeBox = false; f.MinimizeBox = false; f.ShowInTaskbar = false;
                f.ClientSize = new Size(520, 400);
                Label head = new Label { Left = 12, Top = 10, Width = 496, Height = 36, Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                    Text = sheet.BatchNumber + "  -  " + sheet.Branch + "\r\nChecker: " + (sheet.Checker.Length > 0 ? sheet.Checker : "-") + "   Selection: " + sheet.Criteria };
                TextBox body = new TextBox { Left = 12, Top = 52, Width = 496, Height = 130, Multiline = true, ReadOnly = true, Font = new Font("Consolas", 9.5f), Text = s.Describe().Replace("\n", "\r\n") };
                Label q = new Label { Left = 12, Top = 192, Width = 496, Height = 36, Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                    Text = s.UncountedLines + " part(s) on the sheet have no count. What should happen to them?" };
                RadioButton zero = new RadioButton { Left = 24, Top = 232, Width = 480, Height = 40, Text = "ZERO - they were not found: count them as none (this will show as a shortage)" };
                RadioButton release = new RadioButton { Left = 24, Top = 276, Width = 480, Height = 40, Text = "RELEASE - not counted yet: put them back so another sheet can count them" };
                Label warn = new Label { Left = 12, Top = 322, Width = 496, Height = 30, ForeColor = Color.DarkRed, Text = "The sheet is uploaded once. It cannot be uploaded again." };
                Button ok = new Button { Text = "Upload", Left = 316, Top = 360, Width = 90, Height = 28, Enabled = false, DialogResult = DialogResult.OK };
                Button cancel = new Button { Text = "Cancel", Left = 418, Top = 360, Width = 90, Height = 28, DialogResult = DialogResult.Cancel };
                EventHandler chosen = delegate { ok.Enabled = zero.Checked || release.Checked; };
                zero.CheckedChanged += chosen; release.CheckedChanged += chosen;
                f.Controls.AddRange(new Control[] { head, body, q, zero, release, warn, ok, cancel });
                f.CancelButton = cancel;
                if (f.ShowDialog(owner) != DialogResult.OK) return null;
                return zero.Checked ? "ZERO" : "RELEASE";
            }
        }
    }
}
