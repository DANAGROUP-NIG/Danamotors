using System;

namespace Danamotors.Hhdc
{
    public delegate bool DirectoryTest(string path);

    /// <summary>The current time; passed in so code that stamps records can be tested.</summary>
    public delegate DateTime Clock();

    /// <summary>Where the app, its sheets and its counts live on the device. HHDC Link and the app agree here.</summary>
    public static class DeviceLayout
    {
        /// <summary>\Application is the persistent flash folder on Symbol/Motorola devices (survives a cold boot).</summary>
        public const string PersistentFolder = "\\Application";
        public const string PrimaryRoot = "\\Application\\Danamotors";
        public const string FallbackRoot = "\\Danamotors";
        public const string SheetsFolder = "sheets";
        /// <summary>Kia Motors Handheld (KMHH). The data folder keeps its old name so sheets on a device are not lost.</summary>
        public const string AppFileName = "KMHH.exe";
        public const string ShortcutName = "Kia Motors Handheld.lnk";
        /// <summary>The app's names before 2026-11-10 ("Danamotors Count"); an install removes them.</summary>
        public const string OldAppFileName = "DanamotorsCount.exe";
        public const string OldShortcutName = "Danamotors Count.lnk";
        public const string OldOnResetScript = "\\Application\\StartUpCtl\\OnReset\\OnReset_Danamotors.txt";
        /// <summary>Start > Programs on CE 6 (the MC3190 has no \Windows\Start Menu\Programs).</summary>
        public const string ProgramsFolder = "\\Windows\\Programs";
        /// <summary>The desktop, where the legacy AEHHDC.lnk sits.</summary>
        public const string DesktopFolder = "\\Windows\\Desktop";
        /// <summary>
        /// \Windows is rebuilt by a cold boot; \Application is not. Motorola's StartUpCtl runs every .txt script in this
        /// folder at each restart, warm or cold (seen in its log on the MC3190), so the shortcuts are put back from here.
        /// </summary>
        public const string StartUpCtlFolder = "\\Application\\StartUpCtl";
        public const string OnResetScript = "\\Application\\StartUpCtl\\OnReset\\OnReset_KMHH.txt";

        /// <summary>The StartUpCtl script that copies the shortcut kept in the app folder back to the desktop and Start > Programs.</summary>
        public static string OnResetText(string root)
        {
            string lnk = "\"" + root + "\\" + ShortcutName + "\"";
            return "# Kia Motors Handheld: put the shortcuts back after a cold boot (\\Windows is rebuilt).\r\n" +
                   "copy " + lnk + " " + DesktopFolder + "\r\n" +
                   "copy " + lnk + " " + ProgramsFolder + "\r\n";
        }
        public const string SheetExtension = ".sheet";
        public const string CountsExtension = ".counts";
        /// <summary>A picking list, CPO or MIT (HandheldDoc), and its results (PickLog). Kept next to the sheets.</summary>
        public const string DocExtension = ".hdoc";
        public const string PicksExtension = ".hlog";

        public static string DocPath(string root, string stem)
        {
            return SheetsDir(root) + "\\" + stem + DocExtension;
        }

        public static string PicksPath(string root, string stem)
        {
            return SheetsDir(root) + "\\" + stem + PicksExtension;
        }

        public static string ResolveRoot(DirectoryTest exists)
        {
            return exists(PersistentFolder) ? PrimaryRoot : FallbackRoot;
        }

        public static string SheetsDir(string root)
        {
            return root.TrimEnd('\\') + "\\" + SheetsFolder;
        }

        public static string SheetPath(string root, string stem)
        {
            return SheetsDir(root) + "\\" + stem + SheetExtension;
        }

        public static string CountsPath(string root, string stem)
        {
            return SheetsDir(root) + "\\" + stem + CountsExtension;
        }

        /// <summary>Windows CE shortcut: the length of the quoted command, '#', then the command.</summary>
        public static string ShortcutText(string exePath)
        {
            string quoted = "\"" + exePath + "\"";
            return quoted.Length + "#" + quoted;
        }
    }
}
