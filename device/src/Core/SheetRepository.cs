using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace Danamotors.Hhdc.Device
{
    public sealed class SheetListItem
    {
        public string Stem = "";
        public string Number = "";
        public string Branch = "";
        public int Lines;
        public int Entries;
        public int Quantity;
        public bool Finished;
        /// <summary>Set when the sheet file cannot be used.</summary>
        public string Error = "";
        /// <summary>A picking list, CPO or MIT (a .hdoc file) rather than a count sheet.</summary>
        public bool IsDoc;
        public string DocType = "";
        public string Reference = "";

        /// <summary>One line for the sheet list, sized for the device screen.</summary>
        public string Describe()
        {
            if (Error.Length > 0) return Stem + "  (bad file)";
            if (IsDoc)
                return (DocTypes.IsPicking(DocType) ? "PICK " : "CHECK ") + DocTypes.Short(DocType) + " " + Reference + "  " + Lines + " lines" +
                       (Finished ? "  FINISHED" : Entries > 0 ? "  " + Entries + " done" : "");
            if (Finished) return Number + "  " + Lines + " parts  FINISHED";
            return Number + "  " + Lines + " parts" + (Entries > 0 ? "  " + Entries + " counted" : "");
        }
    }

    /// <summary>The sheets in the device's data folder (<root>\sheets).</summary>
    public sealed class SheetRepository
    {
        readonly string dir;
        readonly Clock clock;

        public SheetRepository(string root, Clock clock)
        {
            this.dir = DeviceLayout.SheetsDir(root);
            this.clock = clock;
        }

        public string Directory { get { return dir; } }

        /// <summary>
        /// Lists the sheets from their headers only. A legacy annual count had 38,723 parts on one device;
        /// reading every part of every sheet each time the list was shown made the handheld unusable.
        /// </summary>
        public List<SheetListItem> List()
        {
            List<SheetListItem> items = new List<SheetListItem>();
            if (!System.IO.Directory.Exists(dir)) return items;
            string[] files = System.IO.Directory.GetFiles(dir, "*" + DeviceLayout.SheetExtension);
            Array.Sort(files, StringComparer.OrdinalIgnoreCase);
            foreach (string file in files)
            {
                SheetListItem item = new SheetListItem();
                item.Stem = System.IO.Path.GetFileNameWithoutExtension(file);
                try
                {
                    CountSheet h;
                    using (FileStream fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                    using (StreamReader r = new StreamReader(fs, Encoding.UTF8)) h = CountSheet.ParseHeader(r);
                    if (!HasEndMarker(file)) throw new SheetFormatException("The sheet file is incomplete (it was cut short): send it again");
                    item.Number = h.SheetNumber;
                    item.Branch = h.Branch;
                    item.Lines = h.DeclaredLines;
                    CountState st = new CountStore(System.IO.Path.Combine(dir, item.Stem + DeviceLayout.CountsExtension)).Load();
                    item.Entries = st.Entries.Count;
                    item.Quantity = st.TotalQuantity;
                    item.Finished = st.Finished;
                }
                catch (Exception e)
                {
                    item.Error = e.Message;
                }
                items.Add(item);
            }
            return items;
        }

        /// <summary>The picking lists, CPOs and MITs on the device, from their headers.</summary>
        public List<SheetListItem> ListDocs()
        {
            List<SheetListItem> items = new List<SheetListItem>();
            if (!System.IO.Directory.Exists(dir)) return items;
            string[] files = System.IO.Directory.GetFiles(dir, "*" + DeviceLayout.DocExtension);
            Array.Sort(files, StringComparer.OrdinalIgnoreCase);
            foreach (string file in files)
            {
                SheetListItem item = new SheetListItem();
                item.IsDoc = true;
                item.Stem = System.IO.Path.GetFileNameWithoutExtension(file);
                try
                {
                    DocSession s = OpenDoc(item.Stem);
                    item.Number = s.Doc.DocumentNumber;
                    item.DocType = s.Doc.Type;
                    item.Reference = s.Doc.Reference;
                    item.Branch = s.Doc.Party;
                    item.Lines = s.LineCount;
                    item.Entries = s.DoneLines;
                    item.Quantity = s.TotalQuantity;
                    item.Finished = s.Finished;
                }
                catch (Exception e)
                {
                    item.Error = e.Message;
                }
                items.Add(item);
            }
            return items;
        }

        /// <summary>Documents are small (a few lines; an MIT a few hundred), so the whole file is read.</summary>
        public DocSession OpenDoc(string stem)
        {
            HandheldDoc doc;
            using (FileStream fs = new FileStream(System.IO.Path.Combine(dir, stem + DeviceLayout.DocExtension), FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            using (StreamReader r = new StreamReader(fs, Encoding.UTF8)) doc = HandheldDoc.Parse(r, false);
            return new DocSession(doc, new CountStore(System.IO.Path.Combine(dir, stem + DeviceLayout.PicksExtension)), clock);
        }

        /// <summary>The sheet ends with an END line; a copy cut short by a dropped USB link does not.</summary>
        static bool HasEndMarker(string file)
        {
            using (FileStream fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                int n = (int)Math.Min(64, fs.Length);
                fs.Seek(-n, SeekOrigin.End);
                byte[] tail = new byte[n];
                int got = fs.Read(tail, 0, n);
                string text = Encoding.UTF8.GetString(tail, 0, got);
                return text.IndexOf("\nEND\t", StringComparison.Ordinal) >= 0;
            }
        }

        /// <summary>Milliseconds spent in each step of the last Open, for timing.log.</summary>
        public string LastOpenTiming = "";

        public CountSession Open(string stem)
        {
            string sheetFile = System.IO.Path.Combine(dir, stem + DeviceLayout.SheetExtension);
            int t0 = Environment.TickCount;
            CompactSheetLines lines;
            using (FileStream fs = new FileStream(sheetFile, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) lines = CompactSheetLines.Read(fs);
            int t1 = Environment.TickCount;
            CountSession session = new CountSession(lines.Header, lines, new CountStore(System.IO.Path.Combine(dir, stem + DeviceLayout.CountsExtension)), clock);
            int t2 = Environment.TickCount;
            LastOpenTiming = "read " + lines.ReadMs + " ms, scan " + lines.ScanMs + " ms, hash " + lines.HashMs + " ms, counts " + unchecked(t2 - t1) + " ms, memory " + (GC.GetTotalMemory(false) / 1024) + " KB";
            return session;
        }
    }
}
