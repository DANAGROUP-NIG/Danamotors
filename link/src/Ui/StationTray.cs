using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Danamotors.Hhdc.Link
{
    /// <summary>
    /// HHDC Link in station mode: no window, only a tray icon for IT. Started at Windows sign-in (Run key),
    /// it delivers the branch's handheld jobs and collects results whenever a handheld is docked. Store
    /// staff never open it; everything starts and ends on the document's web page.
    /// </summary>
    public sealed class StationTray : ApplicationContext
    {
        readonly string dataDir;
        readonly LinkSettings settings;
        readonly NotifyIcon icon = new NotifyIcon();
        readonly System.Windows.Forms.Timer refresh = new System.Windows.Forms.Timer();
        readonly StationLog log;
        StationRunner runner;
        Thread thread;
        MainForm window;

        public StationTray(string dataDir, LinkSettings settings)
        {
            this.dataDir = dataDir;
            this.settings = settings;
            log = new StationLog(LinkSettings.LogDir(dataDir), delegate { return DateTime.UtcNow; });

            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("Status...", null, delegate { ShowStatus(); });
            menu.Items.Add("Open HHDC Link (IT)", null, delegate { OpenWindow(); });
            menu.Items.Add("Open log folder", null, delegate { Process.Start("explorer.exe", "\"" + LinkSettings.LogDir(dataDir) + "\""); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Stop the station", null, delegate { Quit(); });
            icon.ContextMenuStrip = menu;
            icon.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
            icon.DoubleClick += delegate { ShowStatus(); };
            icon.Visible = true;

            Start();
            refresh.Interval = 5000;
            refresh.Tick += delegate { UpdateText(); };
            refresh.Start();
            UpdateText();
        }

        public static string LinkVersion()
        {
            return File.GetLastWriteTimeUtc(Application.ExecutablePath).ToString("yyyy.MM.dd.HHmm");
        }

        /// <summary>The device app shipped next to HHDC Link; the station installs it on each handheld that differs.</summary>
        public static byte[] BundledApp()
        {
            string path = Path.Combine(Application.StartupPath, DeviceLayout.AppFileName);
            return File.Exists(path) ? File.ReadAllBytes(path) : null;
        }

        void Start()
        {
            if (settings.StationKey.Length == 0)
            {
                log.Write("Not registered: open HHDC Link (IT) and enter the station key issued on the web.");
                return;
            }
            LinkSettings s = settings;
            runner = new StationRunner(ApiClient.ForStation(s.Server, s.StationKey), delegate { return s.OpenDevice(); },
                                       delegate { return DateTime.UtcNow; }, log, LinkVersion(), BundledApp());
            thread = new Thread(runner.Run);
            thread.IsBackground = true;
            thread.Name = "HHDC station";
            thread.Start();
        }

        string StatusText()
        {
            return runner == null ? "Not registered as a station" : runner.Status;
        }

        void UpdateText()
        {
            string t = "HHDC Link station: " + StatusText();
            icon.Text = t.Length > 63 ? t.Substring(0, 60) + "..." : t;
        }

        void ShowStatus()
        {
            string text = StatusText() + "\r\n\r\nServer: " + settings.Server + "\r\nLog: " + LinkSettings.LogDir(dataDir) + "\r\n\r\nLast entries:\r\n" +
                          string.Join("\r\n", log.Recent().ToArray());
            MessageBox.Show(text, "HHDC Link station", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        void OpenWindow()
        {
            if (window == null || window.IsDisposed)
            {
                window = new MainForm(dataDir, null);
                window.FormClosed += delegate { window = null; };
            }
            window.Show();
            window.Activate();
        }

        void Quit()
        {
            if (MessageBox.Show("Stop the handheld station on this PC? Jobs sent from the web will wait until it runs again.", "HHDC Link station",
                                MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
            if (runner != null) runner.Stop();
            if (thread != null) thread.Join(15000);
            icon.Visible = false;
            ExitThread();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) { refresh.Dispose(); icon.Dispose(); }
            base.Dispose(disposing);
        }
    }

    /// <summary>Starts the station at Windows sign-in for this user (HKCU Run), as RAPI needs the user's session.</summary>
    public static class StationAutostart
    {
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string ValueName = "Danamotors HHDC station";

        public static bool Enabled
        {
            get
            {
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey))
                    return k != null && k.GetValue(ValueName) != null;
            }
        }

        public static void Set(bool on)
        {
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (on) k.SetValue(ValueName, "\"" + Application.ExecutablePath + "\" --station");
                else if (k.GetValue(ValueName) != null) k.DeleteValue(ValueName);
            }
        }
    }
}
