using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Danamotors.Hhdc.Link;

namespace Danamotors.Hhdc.Setup
{
    /// <summary>A step that stops the setup, with what to do about it.</summary>
    public sealed class StopException : Exception
    {
        public StopException(string message) : base(message) { }
    }

    /// <summary>
    /// The one window: server, key, "Set up this PC". Checks the key with the server before changing anything, asks
    /// for an administrator only when Program Files or WMDC need it, saves the key for this Windows user, starts the
    /// station and then shows what the station reports (docked, app installed). Run again any time: with a saved key
    /// and nothing new it asks for nothing.
    /// </summary>
    public sealed class SetupForm : Form
    {
        static readonly Color Midnight = Color.FromArgb(5, 20, 31);
        static readonly Color HeaderSub = Color.FromArgb(170, 184, 196);
        static readonly Color Muted = Color.FromArgb(96, 106, 116);
        static readonly Color Shade = Color.FromArgb(240, 242, 245);
        static readonly Color Good = Color.FromArgb(0, 118, 58);
        static readonly Color Bad = Color.FromArgb(196, 16, 40);
        static readonly Color Busy = Color.FromArgb(150, 86, 0);

        readonly TextBox server = new TextBox();
        readonly TextBox key = new TextBox();
        readonly CheckBox show = new CheckBox();
        readonly Label keyHint = new Label();
        readonly Button go = new Button();
        readonly Button skip = new Button();
        readonly RichTextBox steps = new RichTextBox();
        readonly string dataDir = LinkSettings.DefaultDataDir();
        LinkSettings saved;
        bool working, done;
        volatile bool closing;
        string skipFile = "";

        public SetupForm()
        {
            Text = "Kia Motors Handheld - station setup";
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { }
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            AutoScaleMode = AutoScaleMode.Font;
            Font = new Font("Segoe UI", 9.75f);
            BackColor = Color.White;
            ClientSize = new Size(600, 590);

            Panel header = new Panel();
            header.Dock = DockStyle.Top;
            header.Height = 72;
            header.BackColor = Midnight;
            Label title = new Label();
            title.Text = "Station setup";
            title.ForeColor = Color.White;
            title.Font = new Font("Segoe UI Semibold", 14f);
            title.AutoSize = true;
            title.Location = new Point(22, 10);
            Label sub = new Label();
            sub.Text = "Kia Motors Handheld: this PC sends jobs to the handheld in its cradle and collects them.";
            sub.ForeColor = HeaderSub;
            sub.AutoSize = true;
            sub.Location = new Point(24, 44);
            header.Controls.Add(title);
            header.Controls.Add(sub);
            Controls.Add(header);

            AddLabel("Server API URL", 90);
            server.SetBounds(24, 112, 552, 26);
            Controls.Add(server);

            AddLabel("Station key  (Settings > HHDC on the web: Register station, or New key)", 150);
            key.SetBounds(24, 172, 480, 26);
            key.UseSystemPasswordChar = true;
            Controls.Add(key);
            show.Text = "Show";
            show.SetBounds(514, 174, 70, 24);
            show.CheckedChanged += delegate { key.UseSystemPasswordChar = !show.Checked; };
            Controls.Add(show);
            keyHint.SetBounds(24, 202, 552, 22);
            keyHint.ForeColor = Muted;
            Controls.Add(keyHint);

            go.Text = "Set up this PC";
            go.SetBounds(24, 232, 552, 42);
            go.BackColor = Midnight;
            go.ForeColor = Color.White;
            go.FlatStyle = FlatStyle.Flat;
            go.FlatAppearance.BorderSize = 0;
            go.Font = new Font("Segoe UI Semibold", 11f);
            go.Click += delegate { OnGo(); };
            Controls.Add(go);
            AcceptButton = go;

            steps.SetBounds(24, 288, 552, 236);
            steps.ReadOnly = true;
            steps.BorderStyle = BorderStyle.None;
            steps.BackColor = Shade;
            steps.Font = new Font("Segoe UI", 9.5f);
            Controls.Add(steps);

            skip.Text = "Skip waiting for the handheld";
            skip.SetBounds(24, 532, 260, 30);
            skip.Visible = false;
            skip.Click += delegate
            {
                try { if (skipFile.Length > 0) File.WriteAllText(skipFile, ""); } catch (Exception) { }
                skip.Enabled = false;
            };
            Controls.Add(skip);

            Label build = new Label();
            build.Text = Kit.BuildLabel();
            build.ForeColor = Muted;
            build.Font = new Font("Segoe UI", 8f);
            build.SetBounds(300, 566, 290, 18);
            build.TextAlign = ContentAlignment.MiddleRight;
            Controls.Add(build);

            Load += delegate { Prefill(); };
            Activated += delegate { TryClipboard(); };
            FormClosing += delegate { closing = true; };
        }

        void AddLabel(string text, int y)
        {
            Label l = new Label();
            l.Text = text;
            l.AutoSize = true;
            l.Location = new Point(22, y);
            Controls.Add(l);
        }

        void Prefill()
        {
            saved = LinkSettings.Load(dataDir);
            bool savedServer = saved.Server.Length > 0 && saved.Server.IndexOf("localhost", StringComparison.OrdinalIgnoreCase) < 0;
            server.Text = savedServer ? saved.Server : Kit.Ini("server");
            if (saved.StationKey.Length > 0)
                keyHint.Text = "A key is already saved for " + Environment.UserName + ". Leave this empty to keep it.";
            else
                keyHint.Text = "Copy the key on the web; it is filled in here by itself.";

            Info("Windows user: " + Environment.UserName + " on " + Environment.MachineName);
            Info("Windows Mobile Device Center: " + (Wmdc.Installed ? (Wmdc.NeedsWork ? "installed, will be finished" : "ready")
                : Wmdc.CanInstall ? "not installed, will be installed" : "not installed (32-bit Windows: see below)"));
            bool programs;
            try { programs = Kit.ProgramsCurrent(); } catch (Exception) { programs = false; }
            Info("Programs: " + (programs ? "up to date" : "will be installed to " + Kit.InstallDir));
            if (!programs || Wmdc.NeedsWork) Info("Windows will ask for an administrator once.");
            TryClipboard();
            if (server.Text.Length == 0) server.Focus(); else key.Focus();
        }

        void TryClipboard()
        {
            if (working || done || key.Text.Trim().Length > 0) return;
            try
            {
                if (!Clipboard.ContainsText()) return;
                string text = Clipboard.GetText().Trim();
                if (!Kit.LooksLikeKey(text)) return;
                key.Text = text;
                keyHint.Text = "Key taken from the clipboard.";
                keyHint.ForeColor = Good;
            }
            catch (Exception) { }
        }

        void OnGo()
        {
            if (done) { Close(); return; }
            if (working) return;
            string url = Kit.NormalizeServer(server.Text);
            if (url.Length == 0) { Hint("Enter the server API URL, e.g. https://api-host/api.", true); server.Focus(); return; }
            string typed = key.Text.Trim();
            if (typed.Length > 0 && !Kit.LooksLikeKey(typed)) { Hint("That is not a station key (it looks like <id>.<secret>). Copy it again from Settings > HHDC.", true); key.Focus(); return; }
            string useKey = typed.Length > 0 ? typed : (saved == null ? "" : saved.StationKey);
            if (useKey.Length == 0) { Hint("Paste the station key from Settings > HHDC (Register station, or New key).", true); key.Focus(); return; }

            server.Text = url;
            working = true;
            server.Enabled = key.Enabled = show.Enabled = go.Enabled = false;
            go.Text = "Setting up...";
            steps.Clear();
            Thread t = new Thread(delegate() { Work(url, useKey); });
            t.IsBackground = true;
            t.Start();
        }

        void Hint(string text, bool bad)
        {
            keyHint.Text = text;
            keyHint.ForeColor = bad ? Bad : Muted;
        }

        // ---------- the work (background thread) ----------

        void Work(string url, string stationKey)
        {
            try
            {
                foreach (string f in Kit.Programs)
                    if (!File.Exists(Path.Combine(Kit.Payload, f)))
                        throw new StopException("payload\\" + f + " is missing from the setup folder. If the antivirus removed it, restore it (and allow it), then run the setup again.");

                Step("Checking the server and the station key");
                CheckKey(url, stationKey);
                Ok("The server accepted the station key");

                if (!Kit.NetFramework48()) Warn(".NET Framework 4.8 is not installed. If the station does not start, install it from Windows Update.");

                if (!Wmdc.Installed && !Wmdc.CanInstall) Warn(Wmdc.Install32BitHelp);
                bool files = !Kit.ProgramsCurrent(), wmdc = Wmdc.NeedsWork;
                if (files || wmdc) Elevated(files, wmdc);
                else Ok("Programs and Windows Mobile Device Center are up to date");

                Step("Saving the station for " + Environment.UserName);
                Kit.StopStations();
                LinkSettings s = LinkSettings.Load(dataDir);
                s.Server = url;
                s.StationKey = stationKey;
                s.DeviceFolder = "";
                s.Save(dataDir);
                Kit.SetAutostart();
                RemoveOldCopy();
                Ok("Saved (the key is encrypted for this Windows user); the station starts when " + Environment.UserName + " signs in");

                string log = NewestLog();
                long logStart = log.Length > 0 && File.Exists(log) ? new FileInfo(log).Length : 0;
                Step("Starting the station");
                Process.Start(Kit.StationExe, "--station");
                Ok("Station running (the Kia icon next to the clock)");
                Finish(true);
                Watch(log, logStart);
            }
            catch (StopException e) { Fail(e.Message); Finish(false); }
            catch (Exception e) { Fail("Unexpected problem: " + e.Message); Finish(false); }
        }

        static void CheckKey(string url, string stationKey)
        {
            ApiClient api = ApiClient.ForStation(url, stationKey);
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["linkVersion"] = "setup";
            body["docked"] = null;
            try { api.Heartbeat(body); }
            catch (ApiException e)
            {
                if (e.StatusCode == 401)
                    throw new StopException("The server refused this station key. Copy it again from Settings > HHDC (or press New key there), and check this is the server where the station was registered.");
                throw new StopException("The server answered: " + e.Message);
            }
            catch (LinkException e)
            {
                string m = e.Message;
                bool secure = m.IndexOf("SSL", StringComparison.OrdinalIgnoreCase) >= 0 || m.IndexOf("TLS", StringComparison.OrdinalIgnoreCase) >= 0 ||
                              m.IndexOf("trust", StringComparison.OrdinalIgnoreCase) >= 0 || m.IndexOf("certificate", StringComparison.OrdinalIgnoreCase) >= 0;
                if (secure && Environment.OSVersion.Version.Major < 10)
                    m += " This Windows could not make a secure connection to the server. On Windows 7: install the latest Windows updates " +
                         "(root certificates and TLS 1.2 support), restart, and run the setup again; or ask IT.";
                throw new StopException(m);
            }
        }

        void Elevated(bool files, bool wmdc)
        {
            Step("Asking Windows for an administrator (to install " + (files && wmdc ? "the programs and WMDC" : files ? "the programs" : "WMDC") + ")");
            string progress = Path.Combine(Path.GetTempPath(), "kmhh-setup-" + Guid.NewGuid().ToString("N") + ".txt");
            File.WriteAllText(progress, "");
            skipFile = progress + ".skip";
            ProcessStartInfo psi = new ProcessStartInfo(Application.ExecutablePath,
                "--elevated \"" + progress + "\"" + (files ? " --files" : "") + (wmdc ? " --wmdc" : ""));
            psi.UseShellExecute = true;
            psi.Verb = "runas";
            psi.WorkingDirectory = Kit.Dir;
            Process proc;
            try { proc = Process.Start(psi); }
            catch (Win32Exception)
            {
                throw new StopException("Windows did not get administrator permission, so nothing was installed. Run the setup again and choose Yes (or have IT enter an administrator password).");
            }
            long pos = 0;
            bool failed = false;
            using (proc)
            {
                while (true)
                {
                    bool exited = proc.HasExited;
                    pos = Pump(progress, pos, ref failed);
                    if (exited) break;
                    Thread.Sleep(300);
                }
                UI(delegate { skip.Visible = false; });
                if (failed || proc.ExitCode != 0) throw new StopException("Nothing more was changed. Fix the problem above and run the setup again.");
            }
            try { File.Delete(progress); File.Delete(skipFile); } catch (Exception) { }
        }

        long Pump(string file, long pos, ref bool failed)
        {
            string text;
            try
            {
                using (FileStream s = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    if (s.Length <= pos) return pos;
                    s.Seek(pos, SeekOrigin.Begin);
                    byte[] b = new byte[s.Length - pos];
                    int n = s.Read(b, 0, b.Length);
                    text = Encoding.UTF8.GetString(b, 0, n);
                }
            }
            catch (IOException) { return pos; }
            int end = text.LastIndexOf('\n');
            if (end < 0) return pos;
            foreach (string line in text.Substring(0, end).Split('\n'))
            {
                int tab = line.IndexOf('\t');
                if (tab < 0) continue;
                string kind = line.Substring(0, tab), msg = line.Substring(tab + 1);
                if (kind == "STEP") Step(msg);
                else if (kind == "OK") Ok(msg);
                else if (kind == "WARN") Warn(msg);
                else if (kind == "FAIL") { Fail(msg); failed = true; }
                else if (kind == "WAIT") { Waiting(msg); UI(delegate { skip.Enabled = true; skip.Visible = true; }); }
                else if (kind == "DONE") UI(delegate { skip.Visible = false; });
            }
            return pos + Encoding.UTF8.GetByteCount(text.Substring(0, end + 1));
        }

        void RemoveOldCopy()
        {
            try
            {
                string old = Kit.OldUserInstall;
                if (Directory.Exists(old) && !old.Equals(Kit.InstallDir, StringComparison.OrdinalIgnoreCase)) Directory.Delete(old, true);
            }
            catch (Exception) { }
        }

        string NewestLog()
        {
            string dir = LinkSettings.LogDir(dataDir);
            return Path.Combine(dir, "station-" + DateTime.Now.ToString("yyyyMMdd") + ".log");
        }

        /// <summary>After the start: what the station writes (docked, app installed, problems), for ten minutes.</summary>
        void Watch(string log, long pos)
        {
            Info("");
            Info("Now dock the handheld and wake it (do not cold boot). What the station does shows here:");
            DateTime until = DateTime.UtcNow.AddMinutes(10);
            while (!closing && DateTime.UtcNow < until)
            {
                Thread.Sleep(1000);
                if (!File.Exists(log)) continue;
                string text;
                try
                {
                    using (FileStream s = new FileStream(log, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                    {
                        if (s.Length < pos) pos = 0;
                        if (s.Length == pos) continue;
                        s.Seek(pos, SeekOrigin.Begin);
                        byte[] b = new byte[s.Length - pos];
                        int n = s.Read(b, 0, b.Length);
                        text = Encoding.UTF8.GetString(b, 0, n);
                    }
                }
                catch (IOException) { continue; }
                int end = text.LastIndexOf('\n');
                if (end < 0) continue;
                pos += Encoding.UTF8.GetByteCount(text.Substring(0, end + 1));
                foreach (string raw in text.Substring(0, end).Split('\n'))
                {
                    string line = raw.TrimEnd('\r');
                    if (line.Length > 21 && line[4] == '-' && line[10] == ' ') line = line.Substring(11, 5) + "  " + line.Substring(21);   // "HH:mm  text"
                    if (line.Trim().Length == 0) continue;
                    if (line.IndexOf("Problem", StringComparison.OrdinalIgnoreCase) >= 0 || line.IndexOf("not installed", StringComparison.OrdinalIgnoreCase) >= 0) Warn(line);
                    else Info("   " + line);
                }
            }
        }

        void Finish(bool ok)
        {
            UI(delegate
            {
                working = false;
                if (ok)
                {
                    done = true;
                    go.Text = "Close";
                    go.BackColor = Good;
                    go.Enabled = true;
                    Hint("Done. Settings > HHDC on the web shows this station online.", false);
                    keyHint.ForeColor = Good;
                }
                else
                {
                    server.Enabled = key.Enabled = show.Enabled = go.Enabled = true;
                    go.Text = "Try again";
                }
            });
        }

        // ---------- the step list ----------

        void Step(string text) { Add("▸  " + text, Midnight, true); }
        void Ok(string text) { Add("✓  " + text, Good, false); }
        void Warn(string text) { Add("!  " + text, Busy, false); }
        void Waiting(string text) { Add("→  " + text, Busy, true); }
        void Fail(string text) { Add("✗  " + text, Bad, true); }
        void Info(string text) { Add(text, Muted, false); }

        void Add(string text, Color color, bool bold)
        {
            UI(delegate
            {
                steps.SelectionStart = steps.TextLength;
                steps.SelectionLength = 0;
                steps.SelectionColor = color;
                steps.SelectionFont = new Font(steps.Font, bold ? FontStyle.Bold : FontStyle.Regular);
                steps.AppendText(text + "\n");
                steps.ScrollToCaret();
            });
        }

        void UI(MethodInvoker action)
        {
            if (closing || IsDisposed) return;
            try
            {
                if (InvokeRequired) BeginInvoke(action);
                else action();
            }
            catch (InvalidOperationException) { }
        }
    }
}
