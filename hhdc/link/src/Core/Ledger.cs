using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace Danamotors.Hhdc.Link
{
    public enum UploadState { None, Uploading, Uploaded, Failed }

    public sealed class LedgerRecord
    {
        public DateTime AtUtc;
        public string SheetId = "";
        public string SheetNumber = "";
        public UploadState State;
        public int Entries;
        public int Quantity;
        public string User = "";
        public string Note = "";
    }

    /// <summary>
    /// This PC's record of which sheets were uploaded. The server adds counts up, so a sheet uploaded twice
    /// would double its quantities: HHDC Link refuses a second upload from here (and the server refuses it too).
    /// "Uploading" is written before the request is sent, so if the program dies mid-upload the next attempt
    /// asks the server what happened instead of sending again blindly. Append-only text file.
    /// </summary>
    public sealed class UploadLedger
    {
        readonly string path;

        public UploadLedger(string path)
        {
            this.path = path;
        }

        public string Path { get { return path; } }

        public UploadState StateOf(string sheetId)
        {
            LedgerRecord r = Last(sheetId);
            return r == null ? UploadState.None : r.State;
        }

        public LedgerRecord Last(string sheetId)
        {
            LedgerRecord last = null;
            foreach (LedgerRecord r in ReadAll()) if (r.SheetId == sheetId) last = r;
            return last;
        }

        public List<LedgerRecord> ReadAll()
        {
            List<LedgerRecord> all = new List<LedgerRecord>();
            if (!File.Exists(path)) return all;
            using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            using (StreamReader rd = new StreamReader(fs, Encoding.UTF8))
            {
                string line;
                while ((line = rd.ReadLine()) != null)
                {
                    string[] f = line.Split('\t');
                    if (f.Length != 9 || f[8] != ".") continue;
                    LedgerRecord r = new LedgerRecord();
                    if (!Iso.TryParse(f[0], out r.AtUtc)) continue;
                    r.SheetId = Esc.Unescape(f[1]);
                    r.SheetNumber = Esc.Unescape(f[2]);
                    try { r.State = (UploadState)Enum.Parse(typeof(UploadState), f[3]); } catch (ArgumentException) { continue; }
                    Num.TryInt(f[4], out r.Entries);
                    Num.TryInt(f[5], out r.Quantity);
                    r.User = Esc.Unescape(f[6]);
                    r.Note = Esc.Unescape(f[7]);
                    all.Add(r);
                }
            }
            return all;
        }

        public void Add(DateTime atUtc, string sheetId, string sheetNumber, UploadState state, int entries, int quantity, string user, string note)
        {
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(System.IO.Path.GetFullPath(path)));
            string line = Iso.Utc(atUtc) + "\t" + Esc.Escape(sheetId) + "\t" + Esc.Escape(sheetNumber) + "\t" + state + "\t" + entries + "\t" +
                          quantity + "\t" + Esc.Escape(user) + "\t" + Esc.Escape(note) + "\t.";
            using (FileStream fs = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.Read))
            {
                byte[] b = new UTF8Encoding(false).GetBytes("\n" + line + "\n");
                fs.Write(b, 0, b.Length);
                fs.Flush();
            }
        }
    }
}
