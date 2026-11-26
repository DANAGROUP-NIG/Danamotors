using System;
using System.Collections.Generic;

namespace Danamotors.Hhdc.Device
{
    /// <summary>What a scan on a document screen turned out to be.</summary>
    public enum ScanKind
    {
        /// <summary>The part of one or more lines; Lines holds them.</summary>
        Part,
        /// <summary>The bin (or MIT case) of one or more lines; Lines holds them.</summary>
        Bin,
        /// <summary>Nothing on the document.</summary>
        Unknown
    }

    public sealed class ScanMatch
    {
        public ScanKind Kind = ScanKind.Unknown;
        /// <summary>Indexes into the document's lines.</summary>
        public List<int> Lines = new List<int>();
        /// <summary>The part number as scanned (label suffix removed), for a substitute or an extra part.</summary>
        public string Part = "";
    }

    /// <summary>
    /// One picker working one handheld document: an indent or CPO pick, or an MIT check (legacy HHDC Branch Indent,
    /// Customer Purchase Order and Material In Transit). Every change is written to the results file first, then
    /// applied in memory. Rules kept from the legacy app: picked may not exceed the reserved quantity nor go below
    /// zero; received plus damaged may not exceed the invoice; a different part is recorded as a substitute, not
    /// picked. Added: a short pick needs a reason before the document can be finished. No UI in here.
    /// </summary>
    public sealed class DocSession
    {
        public const int MaxNoteLength = 200;

        readonly HandheldDoc doc;
        readonly CountStore store;
        readonly Clock clock;
        readonly PickState state;

        public DocSession(HandheldDoc doc, CountStore store, Clock clock)
        {
            this.doc = doc;
            this.store = store;
            this.clock = clock;
            this.state = PickLog.Replay(store.ReadLines());
        }

        public HandheldDoc Doc { get { return doc; } }
        public bool Picking { get { return doc.Picking; } }
        public bool Finished { get { return state.Finished; } }
        public int SkippedRecords { get { return state.Skipped; } }
        public int LineCount { get { return doc.Lines.Count; } }
        public IList<ExtraPart> Extras { get { return state.Extras; } }

        public DocLine Line(int i) { return doc.Lines[i]; }

        public LineResult Result(int i) { return state.Result(doc.Lines[i].Id); }

        /// <summary>Picked (picking) or received in good condition (MIT).</summary>
        public int Quantity(int i)
        {
            LineResult r = Result(i);
            return r == null ? 0 : r.Quantity;
        }

        public int Damaged(int i)
        {
            LineResult r = Result(i);
            return r == null ? 0 : r.Damaged;
        }

        public string Reason(int i)
        {
            LineResult r = Result(i);
            return r == null ? "" : r.Reason;
        }

        /// <summary>Nothing left to do on the line: all of it picked or received, or (picking) a reason given for the rest.</summary>
        public bool Done(int i)
        {
            DocLine l = doc.Lines[i];
            if (Quantity(i) + Damaged(i) >= l.Expected) return true;
            return Picking && Reason(i).Length > 0;
        }

        public bool Touched(int i) { return Result(i) != null; }

        public int DoneLines
        {
            get { int n = 0; for (int i = 0; i < doc.Lines.Count; i++) if (Done(i)) n++; return n; }
        }

        public int TotalQuantity
        {
            get { int n = 0; for (int i = 0; i < doc.Lines.Count; i++) n += Quantity(i); return n; }
        }

        public int TotalDamaged
        {
            get { int n = 0; for (int i = 0; i < doc.Lines.Count; i++) n += Damaged(i); return n; }
        }

        /// <summary>The first line that is not done, starting after `from` and wrapping round; -1 when all are done.</summary>
        public int NextOpen(int from)
        {
            int n = doc.Lines.Count;
            for (int step = 1; step <= n; step++)
            {
                int i = (from + step) % n;
                if (!Done(i)) return i;
            }
            return -1;
        }

        /// <summary>Picking lines with less than reserved and no reason yet: they block Finish.</summary>
        public List<int> ShortWithoutReason()
        {
            List<int> list = new List<int>();
            if (!Picking) return list;
            for (int i = 0; i < doc.Lines.Count; i++)
                if (Quantity(i) < doc.Lines[i].Expected && Reason(i).Length == 0) list.Add(i);
            return list;
        }

        /// <summary>MIT lines nobody checked; on the MRN they start at the invoice quantity.</summary>
        public int UncheckedLines
        {
            get { int n = 0; for (int i = 0; i < doc.Lines.Count; i++) if (!Touched(i)) n++; return n; }
        }

        /// <summary>
        /// What a scan is: a part on the document (a Kia label's suffix is ignored), else a bin (or, for an MIT, a case)
        /// on the document, else unknown. `current` comes first among several matching lines.
        /// </summary>
        public ScanMatch Match(string scanned, int current)
        {
            ScanMatch m = new ScanMatch();
            string part = Norm.Code(Norm.PartFromScan(scanned));
            m.Part = part;
            string key = Norm.Key(part), raw = Norm.Key(scanned);
            if (key.Length == 0) return m;
            for (int i = 0; i < doc.Lines.Count; i++)
            {
                string k = Norm.Key(doc.Lines[i].PartNumber);
                if (k == key || k == raw) m.Lines.Add(i);
            }
            if (m.Lines.Count > 0) { m.Kind = ScanKind.Part; PutFirst(m.Lines, current); return m; }
            for (int i = 0; i < doc.Lines.Count; i++)
            {
                DocLine l = doc.Lines[i];
                if (Norm.BinListHas(l.Bin, scanned) || (l.Case.Length > 0 && Norm.SameBin(l.Case, scanned))) m.Lines.Add(i);
            }
            if (m.Lines.Count > 0) { m.Kind = ScanKind.Bin; PutFirst(m.Lines, current); }
            return m;
        }

        static void PutFirst(List<int> lines, int current)
        {
            int at = lines.IndexOf(current);
            if (at > 0) { lines.RemoveAt(at); lines.Insert(0, current); }
        }

        /// <summary>Of the lines a part scan matched, the one to count on: the current line if it has room, else the first with room.</summary>
        public int LineWithRoom(List<int> lines)
        {
            foreach (int i in lines)
                if (Quantity(i) + Damaged(i) < doc.Lines[i].Expected) return i;
            return lines.Count > 0 ? lines[0] : -1;
        }

        /// <summary>One scan: +1 (or -1) picked or received, or damaged on an MIT. Clears the short reason once the line is complete.</summary>
        public LineResult Scan(int i, int delta, bool damaged)
        {
            if (damaged && Picking) throw new CountException("Damaged is recorded only when checking an MIT");
            int q = Quantity(i), d = Damaged(i);
            if (damaged) d += delta; else q += delta;
            if (q < 0 || d < 0) throw new CountException("Already zero on this line");
            return Set(i, q, d);
        }

        /// <summary>Typed quantities for a line.</summary>
        public LineResult Set(int i, int quantity, int damaged)
        {
            DocLine l = doc.Lines[i];
            if (damaged > 0 && Picking) throw new CountException("Damaged is recorded only when checking an MIT");
            if (quantity < 0 || damaged < 0) throw new CountException("Quantities cannot be below zero");
            if (quantity + damaged > l.Expected)
                throw new CountException(Picking ? "Only " + l.Expected + " reserved: you cannot pick more"
                                                 : "The invoice has " + l.Expected + ": received plus damaged cannot be more");
            LineResult r = Current(i);
            r.Quantity = quantity;
            r.Damaged = damaged;
            if (quantity + damaged >= l.Expected) r.Reason = "";
            return Save(r);
        }

        /// <summary>Why fewer than reserved were picked (picking only).</summary>
        public LineResult SetReason(int i, string code)
        {
            if (!Picking) throw new CountException("A reason is given only when picking");
            if (Array.IndexOf(ShortReasons.Codes, code) < 0) throw new CountException("Choose a reason");
            if (Quantity(i) >= doc.Lines[i].Expected) throw new CountException("The line is picked in full: no reason needed");
            LineResult r = Current(i);
            r.Reason = code;
            return Save(r);
        }

        /// <summary>A different part was found for this line (legacy "picked part does not match"). Kept for the store; nothing is picked.</summary>
        public LineResult SetSubstitute(int i, string part)
        {
            if (!Picking) throw new CountException("A substitute is recorded only when picking");
            string p = Norm.Code(part);
            if (p.Length == 0 || p.Length > CountSession.MaxCodeLength) throw new CountException("Scan the part found instead");
            LineResult r = Current(i);
            r.Scanned = p;
            return Save(r);
        }

        public LineResult SetNote(int i, string note)
        {
            string n = (note ?? "").Trim();
            if (n.Length > MaxNoteLength) throw new CountException("The note is too long");
            LineResult r = Current(i);
            r.Note = n;
            return Save(r);
        }

        /// <summary>A part in an MIT case that is not on the MIT: +1 (or -1) on its extra entry, created on the first scan.</summary>
        public ExtraPart ScanExtra(string part, int delta, bool damaged)
        {
            if (Picking) throw new CountException("Only an MIT can record parts that are not on it");
            string p = Norm.Code(Norm.PartFromScan(part));
            if (p.Length == 0 || p.Length > CountSession.MaxCodeLength) throw new CountException("Scan the part");
            ExtraPart e = null;
            foreach (ExtraPart x in state.Extras) if (Norm.Key(x.PartNumber) == Norm.Key(p)) e = x;
            ExtraPart n = new ExtraPart();
            n.Id = e == null ? state.MaxExtraId + 1 : e.Id;
            n.PartNumber = e == null ? p : e.PartNumber;
            n.Quantity = (e == null ? 0 : e.Quantity) + (damaged ? 0 : delta);
            n.Damaged = (e == null ? 0 : e.Damaged) + (damaged ? delta : 0);
            n.Note = e == null ? "" : e.Note;
            if (n.Quantity < 0 || n.Damaged < 0) throw new CountException("Already zero");
            n.AtUtc = clock().ToUniversalTime();
            CheckOpen();
            store.Append(PickLog.Extra(n));
            if (n.Id > state.MaxExtraId) state.MaxExtraId = n.Id;
            if (e == null) state.Extras.Add(n); else state.Extras[state.Extras.IndexOf(e)] = n;
            if (n.Quantity + n.Damaged == 0) DeleteExtra(n.Id);
            return n;
        }

        public void DeleteExtra(int id)
        {
            ExtraPart e = state.Extra(id);
            if (e == null) return;
            CheckOpen();
            store.Append(PickLog.DeleteExtra(id, clock().ToUniversalTime()));
            state.Extras.Remove(e);
        }

        /// <summary>Lock the document. Picking: every short line needs a reason first.</summary>
        public void Finish()
        {
            if (state.Finished) return;
            List<int> missing = ShortWithoutReason();
            if (missing.Count > 0)
                throw new CountException(missing.Count + " line(s) are short with no reason. Give a reason for each first.");
            DateTime now = clock().ToUniversalTime();
            store.Append(PickLog.Finish(now));
            state.Finished = true;
            state.FinishedAtUtc = now;
        }

        LineResult Current(int i)
        {
            LineResult r = Result(i);
            if (r != null) return r.Copy();
            r = new LineResult();
            r.LineId = doc.Lines[i].Id;
            return r;
        }

        LineResult Save(LineResult r)
        {
            CheckOpen();
            r.AtUtc = clock().ToUniversalTime();
            store.Append(PickLog.Line(r));
            state.Lines[r.LineId] = r;
            return r;
        }

        void CheckOpen()
        {
            if (state.Finished) throw new CountException("This document is finished and locked");
        }
    }
}
