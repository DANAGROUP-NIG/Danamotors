using System;
using System.IO;
using System.Text;
using System.Threading;

namespace Danamotors.Hhdc.Setup
{
    /// <summary>
    /// Progress lines between the administrator half and the window: "KIND\ttext", KIND = STEP OK WARN WAIT FAIL DONE.
    /// A file, not a pipe: the administrator may be another Windows account, and it can still write the user's temp.
    /// </summary>
    public sealed class Progress
    {
        readonly string file;
        public Progress(string file) { this.file = file; }

        void Line(string kind, string text)
        {
            byte[] b = new UTF8Encoding(false).GetBytes(kind + "\t" + text.Replace("\r", " ").Replace("\n", " ") + "\n");
            for (int i = 0; i < 20; i++)
            {
                try
                {
                    using (FileStream s = new FileStream(file, FileMode.Append, FileAccess.Write, FileShare.ReadWrite)) s.Write(b, 0, b.Length);
                    return;
                }
                catch (IOException) { Thread.Sleep(100); }
            }
        }

        public void Step(string text) { Line("STEP", text); }
        public void Ok(string text) { Line("OK", text); }
        public void Warn(string text) { Line("WARN", text); }
        public void Wait(string text) { Line("WAIT", text); }
        public void Fail(string text) { Line("FAIL", text); }
        public void Done() { Line("DONE", ""); }
    }

    /// <summary>The part that needs an administrator: the programs into Program Files, and WMDC.</summary>
    public static class ElevatedPart
    {
        public static int Run(string[] args)
        {
            Progress p = new Progress(args[1]);
            bool files = Array.IndexOf(args, "--files") >= 0, wmdc = Array.IndexOf(args, "--wmdc") >= 0;
            try
            {
                if (files) InstallPrograms(p);
                if (wmdc) Wmdc.Install(p, args[1] + ".skip");
                p.Done();
                return 0;
            }
            catch (Exception e)
            {
                p.Fail(e.Message);
                return 1;
            }
        }

        static void InstallPrograms(Progress p)
        {
            p.Step("Installing the programs to " + Kit.InstallDir);
            Kit.StopStations();
            Directory.CreateDirectory(Kit.InstallDir);
            foreach (string f in Kit.Programs)
            {
                string source = Path.Combine(Kit.Payload, f);
                if (!File.Exists(source)) throw new InvalidOperationException("payload\\" + f + " is missing from the kit. If the antivirus removed it, restore it and run the setup again.");
                string target = Path.Combine(Kit.InstallDir, f);
                for (int attempt = 1; ; attempt++)
                {
                    try { File.Copy(source, target, true); break; }
                    catch (IOException)
                    {
                        if (attempt == 5) throw;
                        Kit.StopStations();
                        Thread.Sleep(1000);
                    }
                }
            }
            p.Ok("Programs installed");
        }
    }
}
