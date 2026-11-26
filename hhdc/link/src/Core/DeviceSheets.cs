using System;
using System.Collections.Generic;
using System.Text;

namespace Danamotors.Hhdc.Link
{
    /// <summary>A sheet found on the device.</summary>
    public sealed class DeviceSheet
    {
        public string Stem = "";
        public CountSheet Sheet;
        public CountState State = new CountState();
        /// <summary>Why the sheet cannot be used (cut short, damaged); empty if fine.</summary>
        public string Error = "";

        public bool Finished { get { return State.Finished; } }

        public string Describe()
        {
            if (Error.Length > 0) return Stem + ": " + Error;
            string status = State.Finished ? "finished" : State.Entries.Count == 0 ? "not started" : "counting";
            return Sheet.SheetNumber + " (" + status + ", " + State.Entries.Count + " entries)";
        }
    }

    /// <summary>The count sheets on the device, through whichever IDeviceStorage is connected.</summary>
    public sealed class DeviceSheets
    {
        readonly IDeviceStorage dev;
        readonly string root;

        public DeviceSheets(IDeviceStorage dev)
        {
            this.dev = dev;
            this.root = DeviceLayout.ResolveRoot(delegate(string p) { return dev.DirectoryExists(p); });
            // The first RAPI calls after docking can fail silently (seen 2026-10-27 and 2026-11-12): \Application then
            // looks missing and the app would be put in RAM (lost on a cold boot). \Windows is always there, so if it
            // is not seen either the link is not ready yet; the station tries again on its next pass.
            if (root == DeviceLayout.FallbackRoot && dev is RapiDevice && !dev.DirectoryExists("\\Windows"))
                throw new LinkException("The handheld is not answering yet. It is tried again in a few seconds.");
        }

        public string Root { get { return root; } }

        public List<DeviceSheet> List()
        {
            List<DeviceSheet> found = new List<DeviceSheet>();
            string dir = DeviceLayout.SheetsDir(root);
            List<string> names = dev.ListFiles(dir);
            names.Sort(StringComparer.OrdinalIgnoreCase);
            foreach (string name in names)
            {
                if (!name.EndsWith(DeviceLayout.SheetExtension, StringComparison.OrdinalIgnoreCase)) continue;
                found.Add(Read(name.Substring(0, name.Length - DeviceLayout.SheetExtension.Length)));
            }
            return found;
        }

        public DeviceSheet Read(string stem)
        {
            DeviceSheet d = new DeviceSheet();
            d.Stem = stem;
            try
            {
                d.Sheet = CountSheet.Parse(Utf8(dev.ReadFile(DeviceLayout.SheetPath(root, stem))));
                string counts = DeviceLayout.CountsPath(root, stem);
                if (dev.FileExists(counts))
                    d.State = CountLog.Replay(Utf8(dev.ReadFile(counts)).Split('\n'));
            }
            catch (SheetFormatException e) { d.Error = e.Message; }
            return d;
        }

        /// <summary>
        /// Put a sheet on the device. A sheet that already has counts there is never overwritten: that would
        /// lose the checker's work. The file is read back to make sure the USB transfer was complete.
        /// </summary>
        public void Send(CountSheet sheet, DateTime nowUtc)
        {
            string stem = sheet.FileStem;
            DeviceSheet existing = null;
            if (dev.FileExists(DeviceLayout.SheetPath(root, stem))) existing = Read(stem);
            if (existing != null && (existing.State.Entries.Count > 0 || existing.State.Finished))
                throw new LinkException("Sheet " + sheet.SheetNumber + " is already on the device with " + existing.State.Entries.Count +
                                        " counted entries. Receive it from the device first; it was not replaced.");

            sheet.SentAtUtc = nowUtc;
            byte[] data = new UTF8Encoding(false).GetBytes(sheet.Serialize());
            dev.WriteFile(DeviceLayout.SheetPath(root, stem), data);
            // A leftover empty count file from an earlier copy of this sheet is harmless but is removed for tidiness.
            if (existing != null) dev.DeleteFile(DeviceLayout.CountsPath(root, stem));

            DeviceSheet check = Read(stem);
            if (check.Error.Length > 0 || check.Sheet.Lines.Count != sheet.Lines.Count)
                throw new LinkException("The sheet did not arrive complete on the device (" + (check.Error.Length > 0 ? check.Error : "line count differs") + "). Try sending it again.");
        }

        /// <summary>Remove a sheet and its counts from the device. Only call after the upload succeeded.</summary>
        public void Clear(string stem)
        {
            dev.DeleteFile(DeviceLayout.CountsPath(root, stem));
            dev.DeleteFile(DeviceLayout.SheetPath(root, stem));
        }

        /// <summary>Push the app and its shortcuts (Start > Programs and the desktop).</summary>
        public string InstallApp(byte[] exe)
        {
            string target = root + "\\" + DeviceLayout.AppFileName;
            dev.WriteFile(target, exe);
            byte[] back = dev.ReadFile(target);
            if (back.Length != exe.Length) throw new LinkException("The app did not copy completely to the device. Try again.");
            byte[] lnk = Encoding.ASCII.GetBytes(DeviceLayout.ShortcutText(target));
            dev.WriteFile(DeviceLayout.ProgramsFolder + "\\" + DeviceLayout.ShortcutName, lnk);
            dev.WriteFile(DeviceLayout.DesktopFolder + "\\" + DeviceLayout.ShortcutName, lnk);
            string msg = "Installed " + target + " (" + exe.Length + " bytes) and the shortcut \"" + DeviceLayout.ShortcutName + "\" on the desktop and in Start > Programs.";
            if (dev.DirectoryExists(DeviceLayout.StartUpCtlFolder))
            {
                // Keep a copy of the shortcut in flash and let StartUpCtl put it back after a cold boot.
                dev.WriteFile(root + "\\" + DeviceLayout.ShortcutName, lnk);
                dev.WriteFile(DeviceLayout.OnResetScript, Encoding.ASCII.GetBytes(DeviceLayout.OnResetText(root)));
                msg += " The shortcuts come back by themselves after a cold boot.";
            }
            string old = RemoveOldNames();
            return old.Length > 0 ? msg + " " + old : msg;
        }

        /// <summary>
        /// Removes the app's files from before it was renamed Kia Motors Handheld (2026-11-10): the old exe, its shortcuts
        /// and its cold-boot script, so the handheld does not show two apps. The old exe is locked while it is open; it is
        /// tried again at the next install or dock. Returns what was done ("" if there was nothing to remove).
        /// </summary>
        public string RemoveOldNames()
        {
            string[] files = {
                DeviceLayout.ProgramsFolder + "\\" + DeviceLayout.OldShortcutName,
                DeviceLayout.DesktopFolder + "\\" + DeviceLayout.OldShortcutName,
                root + "\\" + DeviceLayout.OldShortcutName,
                DeviceLayout.OldOnResetScript,
                root + "\\" + DeviceLayout.OldAppFileName };
            int removed = 0;
            string locked = "";
            foreach (string f in files)
            {
                if (!dev.FileExists(f)) continue;
                try { dev.DeleteFile(f); removed++; }
                catch (LinkException) { locked = f; }
            }
            if (removed == 0 && locked.Length == 0) return "";
            return "Removed the old Danamotors Count app (" + removed + " file(s))." +
                   (locked.Length > 0 ? " " + locked + " is still open on the handheld; it is removed next time." : "");
        }

        static string Utf8(byte[] b)
        {
            return new UTF8Encoding(false).GetString(b);
        }
    }
}
