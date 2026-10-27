using System;
using System.IO;
using System.Windows.Forms;

namespace Danamotors.Hhdc.Device
{
    public static class Program
    {
        /// <summary>
        /// Usage: DanamotorsCount.exe [--data FOLDER]
        /// Without --data the device uses \Application\Danamotors (or \Danamotors if \Application is missing).
        /// On a PC, --data points at the folder that stands in for the device's data folder.
        /// </summary>
        public static void Main(string[] args)
        {
            string root = null;
            for (int i = 0; i < args.Length - 1; i++)
                if (args[i] == "--data") root = args[i + 1];
            if (root == null) root = DeviceLayout.ResolveRoot(delegate(string p) { return Directory.Exists(p); });

            try
            {
                Directory.CreateDirectory(DeviceLayout.SheetsDir(root));
                Application.Run(new MainForm(new SheetRepository(root, delegate { return DateTime.UtcNow; })));
            }
            catch (Exception ex)
            {
                try { using (StreamWriter w = new StreamWriter(Path.Combine(root, "error.log"), true)) w.WriteLine(DateTime.UtcNow.ToString("s") + " " + ex); } catch { }
                MessageBox.Show(ex.Message, "Danamotors Count", MessageBoxButtons.OK, MessageBoxIcon.Hand, MessageBoxDefaultButton.Button1);
            }
        }
    }
}
