using System;
using System.Collections.Generic;

namespace Danamotors.Hhdc.Device
{
    /// <summary>The user did something the count rules do not allow; Message is fit to show.</summary>
    public sealed class CountException : Exception
    {
        public CountException(string message) : base(message) { }
    }

    /// <summary>A sheet line with how much of it is counted: CountedQty is -1 when the part has no count yet.</summary>
    public sealed class SheetHit
    {
        public readonly SheetLine Line;
        public readonly int CountedQty;

        public SheetHit(SheetLine line, int countedQty)
        {
            Line = line;
            CountedQty = countedQty;
        }
    }

    /// <summary>A bin on the sheet: how many of its parts the sheet lists and how many of those have no count yet.</summary>
    public sealed class BinSummary
    {
        public readonly string Bin;
        public int Parts;
        public int Left;

        public BinSummary(string bin) { Bin = bin; }
    }

    /// <summary>
    /// One checker counting one sheet. Every change is written to the count file first, then applied
    /// in memory, so what is on screen is always what is saved. No UI in here.
    /// </summary>
    public sealed class CountSession
    {
        public const int MaxQuantity = 1000000;
        public const int MaxCodeLength = 40;
        public const int MaxRemarkLength = 200;

        readonly CountSheet sheet;
        readonly CountStore store;
        readonly ISheetLines index;
        readonly Clock clock;
        CountState state;

        public CountSession(CountSheet sheet, CountStore store, Clock clock) : this(sheet, new ListSheetLines(sheet), store, clock) { }

        /// <summary>sheet supplies the header; the part lines come from lines (the sheet's own Lines list is not used).</summary>
        public CountSession(CountSheet sheet, ISheetLines lines, CountStore store, Clock clock)
        {
            this.sheet = sheet;
            this.store = store;
            this.clock = clock;
            this.index = lines;
            this.state = store.Load();
        }

        public CountSheet Sheet { get { return sheet; } }
        /// <summary>Parts on the sheet.</summary>
        public int LineCount { get { return index.Count; } }
        public bool Finished { get { return state.Finished; } }
        public IList<CountEntry> Entries { get { return state.Entries; } }
        public int SkippedRecords { get { return state.Skipped; } }
        public int TotalQuantity { get { return state.TotalQuantity; } }
        public int TotalDamaged { get { return state.TotalDamaged; } }

        /// <summary>Sheet parts with at least one entry.</summary>
        public int CountedLines
        {
            get
            {
                Dictionary<string, bool> seen = new Dictionary<string, bool>();
                foreach (CountEntry e in state.Entries)
                {
                    SheetLine l = index.Find(e.PartNumber);
                    if (l != null) seen[Norm.Code(l.PartNumber)] = true;
                }
                return seen.Count;
            }
        }

        public int UncountedLines { get { return index.Count - CountedLines; } }

        /// <summary>The bin of the most recent entry, so counting can carry on where it stopped. Empty if nothing is counted.</summary>
        public string LastBin
        {
            get
            {
                CountEntry last = null;
                foreach (CountEntry e in state.Entries) if (last == null || e.Id > last.Id) last = e;
                return last == null ? "" : last.Bin;
            }
        }

        /// <summary>Quantity counted so far for each part (all bins), by upper-case part number.</summary>
        Dictionary<string, int> CountedByPart()
        {
            Dictionary<string, int> counted = new Dictionary<string, int>();
            foreach (CountEntry e in state.Entries)
            {
                // An entry may carry a label's text; match it to the sheet's part so a counted part is never listed as left.
                SheetLine l = index.Find(e.PartNumber);
                string key = Norm.Code(l != null ? l.PartNumber : e.PartNumber);
                int q;
                counted.TryGetValue(key, out q);
                counted[key] = q + e.Quantity;
            }
            return counted;
        }

        /// <summary>
        /// The sheet's parts for this bin that have no count yet (in any bin), in sheet order. total is how many there are;
        /// the list holds at most max of them.
        /// </summary>
        public List<SheetHit> PartsLeftInBin(string bin, int max, out int total)
        {
            Dictionary<string, int> counted = CountedByPart();
            List<SheetHit> hits = new List<SheetHit>();
            total = 0;
            foreach (int i in index.LinesInBin(bin, 5000))
            {
                SheetLine l = index.At(i);
                if (counted.ContainsKey(Norm.Code(l.PartNumber))) continue;
                total++;
                if (hits.Count < max) hits.Add(new SheetHit(l, -1));
            }
            return hits;
        }

        /// <summary>
        /// Every bin on the sheet, in sheet order, with its parts and the parts left (the legacy bin selection grid).
        /// A part listed in several bins ("1D3/1D2") counts in each. noBin is the number of sheet parts with no bin.
        /// </summary>
        public List<BinSummary> Bins(out int noBin)
        {
            // Mark the counted lines from the entries (few), not by looking up every line's part (many).
            bool[] counted = new bool[index.Count];
            foreach (CountEntry e in state.Entries)
            {
                int i = index.LineOf(e.PartNumber);
                if (i >= 0) counted[i] = true;
            }
            return index.BinSummaries(counted, out noBin);
        }

        /// <summary>How many parts the sheet lists for this bin, counted or not.</summary>
        public int SheetPartsInBin(string bin)
        {
            return index.LinesInBin(bin, 5000).Length;
        }

        /// <summary>Sheet parts whose number starts with the text (dashes and spaces ignored), counted or not.</summary>
        public List<SheetHit> FindParts(string text, int max)
        {
            Dictionary<string, int> counted = CountedByPart();
            List<SheetHit> hits = new List<SheetHit>();
            foreach (int i in index.LinesWithPartStart(text, max))
            {
                SheetLine l = index.At(i);
                int q;
                hits.Add(new SheetHit(l, counted.TryGetValue(Norm.Code(l.PartNumber), out q) ? q : -1));
            }
            return hits;
        }

        /// <summary>
        /// One scan in "each scan adds 1" or "removes 1" mode. Needs a bin. Adds the entry if the part is not counted in this bin yet.
        /// Removing stops at zero; an entry left at zero stays (it says the part was looked for and none found).
        /// </summary>
        public CountEntry CountOne(string bin, PartInfo part, int delta)
        {
            if (Norm.Code(bin).Length == 0) throw new CountException("Scan the bin first");
            CountEntry existing = FindDuplicate(bin, part.PartNumber, 0);
            if (existing == null)
            {
                if (delta < 0) throw new CountException("Nothing counted in this bin to remove");
                return Add(bin, part, 1, 0, "");
            }
            int q = existing.Quantity + delta;
            if (q < 0) throw new CountException("Already zero in this bin");
            if (q > MaxQuantity) throw new CountException("Quantity is out of range");
            return Change(existing, existing.Bin, existing.PartNumber, q, existing.Damaged, existing.Remarks);
        }

        public PartInfo Lookup(string scanned)
        {
            PartInfo p = new PartInfo();
            p.Scanned = (scanned ?? "").Trim();
            SheetLine l = index.Find(p.Scanned);
            if (l == null)
            {
                p.PartNumber = Norm.Code(Norm.PartFromScan(p.Scanned));
                return p;
            }
            p.OnSheet = true;
            p.PartNumber = Norm.Code(l.PartNumber);
            p.Description = l.Description;
            p.SheetBin = l.Bin;
            p.SystemStock = sheet.ShowSystemStock ? l.SystemStock : null;
            return p;
        }

        /// <summary>A warning when the bin is not one of the sheet's bins for the part; empty otherwise. Counting is still allowed.</summary>
        public string BinWarning(string bin, PartInfo part)
        {
            if (part == null || !part.OnSheet || Norm.Key(part.SheetBin).Length == 0 || Norm.Key(bin).Length == 0) return "";
            if (Norm.BinListHas(part.SheetBin, bin)) return "";
            return (part.SheetBin.IndexOf('/') >= 0 ? "Sheet bins are " : "Sheet bin is ") + part.SheetBin;
        }

        /// <summary>What was already counted for the part, e.g. "N-3A1: 5, QSB: 2". Empty if nothing.</summary>
        public string CountedSoFar(string partNumber)
        {
            List<string> parts = new List<string>();
            foreach (CountEntry e in state.Entries)
                if (Norm.Code(e.PartNumber) == Norm.Code(partNumber)) parts.Add((e.Bin.Length == 0 ? "no bin" : e.Bin) + ": " + e.Quantity);
            return string.Join(", ", parts.ToArray());
        }

        /// <summary>The existing entry for the same part in the same bin, if any (other than ignoreId).</summary>
        public CountEntry FindDuplicate(string bin, string partNumber, int ignoreId)
        {
            foreach (CountEntry e in state.Entries)
                if (e.Id != ignoreId && Norm.Code(e.PartNumber) == Norm.Code(partNumber) && Norm.Key(e.Bin) == Norm.Key(bin)) return e;
            return null;
        }

        /// <summary>Whole number from 0 to MaxQuantity. A blank is zero only if allowed.</summary>
        public static bool TryParseCount(string text, bool blankIsZero, out int value)
        {
            value = 0;
            string t = (text ?? "").Trim();
            if (t.Length == 0) return blankIsZero;
            if (t.Length > 7) return false;
            foreach (char c in t) if (c < '0' || c > '9') return false;
            return Num.TryInt(t, out value) && value <= MaxQuantity;
        }

        /// <summary>Record a new entry. Throws CountException if the same part and bin is already counted: use AddTo or Replace.</summary>
        public CountEntry Add(string bin, PartInfo part, int quantity, int damaged, string remarks)
        {
            Check(bin, part.PartNumber, quantity, damaged, remarks);
            if (FindDuplicate(bin, part.PartNumber, 0) != null) throw new CountException("This part is already counted in this bin");
            CountEntry e = Make(state.MaxId + 1, bin, part.PartNumber, quantity, damaged, remarks, part.OnSheet);
            Save(CountLog.Entry(e, false));
            state.MaxId = e.Id;
            state.Entries.Add(e);
            return e;
        }

        /// <summary>Add to an entry already counted (the checker found more of the same part in the same bin).</summary>
        public CountEntry AddTo(CountEntry existing, int quantity, int damaged, string remarks)
        {
            string note = string.IsNullOrEmpty(remarks) ? existing.Remarks
                        : existing.Remarks.Length == 0 ? remarks : existing.Remarks + "; " + remarks;
            if (note.Length > MaxRemarkLength) note = note.Substring(0, MaxRemarkLength);
            return Change(existing, existing.Bin, existing.PartNumber, existing.Quantity + quantity, existing.Damaged + damaged, note);
        }

        public CountEntry Replace(CountEntry existing, int quantity, int damaged, string remarks)
        {
            return Change(existing, existing.Bin, existing.PartNumber, quantity, damaged, remarks);
        }

        /// <summary>Edit an entry from the review screen. Throws CountException if it would duplicate another entry.</summary>
        public CountEntry Edit(int id, string bin, PartInfo part, int quantity, int damaged, string remarks)
        {
            CountEntry existing = state.Find(id);
            if (existing == null) throw new CountException("That entry no longer exists");
            if (FindDuplicate(bin, part.PartNumber, id) != null)
                throw new CountException("Another entry already has this part in this bin. Edit or delete that one instead.");
            return Change(existing, bin, part.PartNumber, quantity, damaged, remarks);
        }

        CountEntry Change(CountEntry existing, string bin, string partNumber, int quantity, int damaged, string remarks)
        {
            Check(bin, partNumber, quantity, damaged, remarks);
            CountEntry e = Make(existing.Id, bin, partNumber, quantity, damaged, remarks, Lookup(partNumber).OnSheet);
            Save(CountLog.Entry(e, true));
            state.Entries[state.Entries.IndexOf(existing)] = e;
            return e;
        }

        public void Delete(int id)
        {
            CountEntry e = state.Find(id);
            if (e == null) return;
            Save(CountLog.Delete(id, clock().ToUniversalTime()));
            state.Entries.Remove(e);
        }

        /// <summary>Lock the sheet. The PC will pick it up; nothing can be changed afterwards.</summary>
        public void Finish()
        {
            if (state.Finished) return;
            DateTime now = clock().ToUniversalTime();
            Save(CountLog.Finish(now));
            state.Finished = true;
            state.FinishedAtUtc = now;
        }

        CountEntry Make(int id, string bin, string partNumber, int quantity, int damaged, string remarks, bool onSheet)
        {
            CountEntry e = new CountEntry();
            e.Id = id;
            e.Bin = Norm.Code(bin);
            e.PartNumber = Norm.Code(partNumber);
            e.Quantity = quantity;
            e.Damaged = damaged;
            e.Remarks = (remarks ?? "").Trim();
            e.AtUtc = clock().ToUniversalTime();
            e.OnSheet = onSheet;
            return e;
        }

        /// <summary>Why this bin cannot be used (checked as soon as the bin is entered); empty when it can.</summary>
        public static string BinRefusal(string bin)
        {
            string b = Norm.Code(bin);
            if (b.Length > MaxCodeLength) return "The bin is too long";
            if (b == "UNDEFINED") return "The bin cannot be UNDEFINED";
            return "";
        }

        /// <summary>
        /// True when what was put in the Bin box looks like a part label: a Kia label (part number, a run of spaces,
        /// a model code), or a part number on this sheet.
        /// </summary>
        public bool LooksLikePart(string bin)
        {
            string b = (bin ?? "").Trim();
            if (b.Length == 0) return false;
            return b.IndexOf("  ", StringComparison.Ordinal) >= 0 || index.Find(b) != null;
        }

        void Check(string bin, string partNumber, int quantity, int damaged, string remarks)
        {
            if (state.Finished) throw new CountException("This sheet is finished and locked");
            if (Norm.Code(partNumber).Length == 0) throw new CountException("Enter the part");
            if (Norm.Code(partNumber).Length > MaxCodeLength) throw new CountException("The part number is too long");
            string refusal = BinRefusal(bin);
            if (refusal.Length > 0) throw new CountException(refusal);
            if (quantity < 0 || quantity > MaxQuantity || damaged < 0 || damaged > MaxQuantity) throw new CountException("Quantity is out of range");
            if ((remarks ?? "").Trim().Length > MaxRemarkLength) throw new CountException("The remark is too long");
        }

        void Save(string record)
        {
            if (state.Finished) throw new CountException("This sheet is finished and locked");
            store.Append(record);
        }
    }
}
