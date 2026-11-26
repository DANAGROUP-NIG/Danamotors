using System;
using System.Collections.Generic;
using System.Text;

namespace Danamotors.Hhdc
{
    public sealed class CountEntry
    {
        public int Id;
        public string Bin = "";
        public string PartNumber = "";
        public int Quantity;
        public int Damaged;
        public string Remarks = "";
        /// <summary>Device clock when counted. Untrusted: HHDC Link checks it before use.</summary>
        public DateTime AtUtc;
        /// <summary>Whether the part was on the sheet when counted (legacy NewPart).</summary>
        public bool OnSheet = true;

        public CountEntry Copy()
        {
            return (CountEntry)MemberwiseClone();
        }
    }

    /// <summary>The counts of one sheet after replaying its log.</summary>
    public sealed class CountState
    {
        public List<CountEntry> Entries = new List<CountEntry>();
        public bool Finished;
        public DateTime FinishedAtUtc;
        public int MaxId;
        /// <summary>Lines that were not understood, e.g. a record cut off by a battery pull.</summary>
        public int Skipped;

        public CountEntry Find(int id)
        {
            foreach (CountEntry e in Entries) if (e.Id == id) return e;
            return null;
        }

        public int TotalQuantity
        {
            get { int n = 0; foreach (CountEntry e in Entries) n += e.Quantity; return n; }
        }

        public int TotalDamaged
        {
            get { int n = 0; foreach (CountEntry e in Entries) n += e.Damaged; return n; }
        }
    }

    /// <summary>
    /// The count file (.counts) is append-only: one record per line, each ending in "TAB ." so a record
    /// cut off by a battery pull is recognised and ignored. Edits and deletes are further records.
    ///   E id bin part qty damaged remarks at onSheet .   an entry
    ///   U id bin part qty damaged remarks at onSheet .   the entry now reads like this
    ///   X id at .                                          the entry is deleted
    ///   F at .                                             the sheet is finished (nothing after it counts)
    /// </summary>
    public static class CountLog
    {
        const string End = ".";

        public static string Entry(CountEntry e, bool update)
        {
            return (update ? "U" : "E") + "\t" + e.Id + "\t" + Esc.Escape(e.Bin) + "\t" + Esc.Escape(e.PartNumber) + "\t" +
                   e.Quantity + "\t" + e.Damaged + "\t" + Esc.Escape(e.Remarks) + "\t" + Iso.Utc(e.AtUtc) + "\t" +
                   (e.OnSheet ? "1" : "0") + "\t" + End;
        }

        public static string Delete(int id, DateTime atUtc)
        {
            return "X\t" + id + "\t" + Iso.Utc(atUtc) + "\t" + End;
        }

        public static string Finish(DateTime atUtc)
        {
            return "F\t" + Iso.Utc(atUtc) + "\t" + End;
        }

        public static CountState Replay(IEnumerable<string> lines)
        {
            CountState s = new CountState();
            foreach (string raw in lines)
            {
                string line = raw.TrimEnd('\r');
                if (line.Length == 0) continue;
                string[] f = line.Split('\t');
                if (f[f.Length - 1] != End) { s.Skipped++; continue; }
                if (s.Finished) continue; // locked

                bool ok = true;
                switch (f[0])
                {
                    case "E":
                    case "U":
                        CountEntry e = ParseEntry(f);
                        if (e == null) { ok = false; break; }
                        if (e.Id > s.MaxId) s.MaxId = e.Id;
                        CountEntry old = s.Find(e.Id);
                        if (f[0] == "E")
                        {
                            if (old == null) s.Entries.Add(e);
                        }
                        else if (old != null)
                        {
                            s.Entries[s.Entries.IndexOf(old)] = e;
                        }
                        break;
                    case "X":
                        int id;
                        if (f.Length != 4 || !Num.TryInt(f[1], out id)) { ok = false; break; }
                        CountEntry gone = s.Find(id);
                        if (gone != null) s.Entries.Remove(gone);
                        break;
                    case "F":
                        DateTime at;
                        if (f.Length != 3 || !Iso.TryParse(f[1], out at)) { ok = false; break; }
                        s.Finished = true;
                        s.FinishedAtUtc = at;
                        break;
                    default:
                        ok = false;
                        break;
                }
                if (!ok) s.Skipped++;
            }
            return s;
        }

        static CountEntry ParseEntry(string[] f)
        {
            if (f.Length != 10) return null;
            CountEntry e = new CountEntry();
            if (!Num.TryInt(f[1], out e.Id) || e.Id <= 0) return null;
            e.Bin = Esc.Unescape(f[2]);
            e.PartNumber = Esc.Unescape(f[3]);
            if (!Num.TryInt(f[4], out e.Quantity) || e.Quantity < 0) return null;
            if (!Num.TryInt(f[5], out e.Damaged) || e.Damaged < 0) return null;
            e.Remarks = Esc.Unescape(f[6]);
            if (!Iso.TryParse(f[7], out e.AtUtc)) return null;
            e.OnSheet = f[8] == "1";
            if (e.PartNumber.Length == 0) return null;
            return e;
        }
    }
}
