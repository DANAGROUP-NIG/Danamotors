using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace Danamotors.Hhdc
{
    /// <summary>The kinds of handheld document, as the server names them.</summary>
    public static class DocTypes
    {
        public const string IndentPick = "INDENT_PICK";
        public const string CpoPick = "CPO_PICK";
        public const string MitReceive = "MIT_RECEIVE";

        public static bool IsPicking(string type) { return type == IndentPick || type == CpoPick; }

        /// <summary>Short name for the device screen and lists.</summary>
        public static string Short(string type)
        {
            return type == IndentPick ? "Indent" : type == CpoPick ? "CPO" : type == MitReceive ? "MIT" : type;
        }
    }

    /// <summary>Why fewer were picked than reserved (the server's HandheldShortReason).</summary>
    public static class ShortReasons
    {
        public static readonly string[] Codes = { "NOT_FOUND", "DAMAGED", "LESS_IN_BIN", "OTHER" };
        public static readonly string[] Labels = { "Not found", "Damaged", "Less in the bin", "Other" };

        public static string Label(string code)
        {
            int i = Array.IndexOf(Codes, code);
            return i < 0 ? "" : Labels[i];
        }
    }

    public sealed class DocLine
    {
        /// <summary>The server's HandheldDocumentLine id; the upload refers to it.</summary>
        public string Id = "";
        public int Number;
        public string Bin = "";
        public string PartNumber = "";
        public string Description = "";
        /// <summary>MIT case number; empty for picking.</summary>
        public string Case = "";
        /// <summary>Reserved quantity (picking) or invoice quantity (MIT).</summary>
        public int Expected;
    }

    /// <summary>
    /// A picking list, CPO or MIT as the PC sends it to the device (one .hdoc file). Same layout as a count sheet:
    /// "key TAB value" header lines, one "L" line per document line, and an "END" line with the line count, so a
    /// file cut short by a dropped USB link is recognised. No rates: the picker does not need them.
    /// </summary>
    public sealed class HandheldDoc
    {
        public const int Version = 1;

        public string DocumentId = "";
        public string DocumentNumber = "";
        public string Type = "";
        /// <summary>Indent, CPO or MIT number, as the store knows the job.</summary>
        public string Reference = "";
        /// <summary>Requesting branch (indent), customer (CPO) or vendor and invoice (MIT).</summary>
        public string Party = "";
        public string Branch = "";
        public string Picker = "";
        public DateTime SentAtUtc;
        public List<DocLine> Lines = new List<DocLine>();

        public string FileStem { get { return "D" + CountSheet.SafeStem(DocumentNumber); } }

        public bool Picking { get { return DocTypes.IsPicking(Type); } }

        public int TotalExpected
        {
            get { int n = 0; foreach (DocLine l in Lines) n += l.Expected; return n; }
        }

        public DocLine Line(string id)
        {
            foreach (DocLine l in Lines) if (l.Id == id) return l;
            return null;
        }

        public string Serialize()
        {
            StringBuilder b = new StringBuilder();
            b.Append("DMHDOC\t").Append(Version).Append('\n');
            Pair(b, "documentId", DocumentId);
            Pair(b, "documentNumber", DocumentNumber);
            Pair(b, "type", Type);
            Pair(b, "reference", Reference);
            Pair(b, "party", Party);
            Pair(b, "branch", Branch);
            Pair(b, "picker", Picker);
            Pair(b, "sentAt", Iso.Utc(SentAtUtc));
            Pair(b, "lines", Lines.Count.ToString());
            foreach (DocLine l in Lines)
            {
                b.Append("L\t").Append(Esc.Escape(l.Id)).Append('\t').Append(l.Number).Append('\t').Append(Esc.Escape(l.Bin)).Append('\t')
                 .Append(Esc.Escape(l.PartNumber)).Append('\t').Append(Esc.Escape(l.Description)).Append('\t').Append(Esc.Escape(l.Case))
                 .Append('\t').Append(l.Expected).Append('\n');
            }
            b.Append("END\t").Append(Lines.Count).Append('\n');
            return b.ToString();
        }

        static void Pair(StringBuilder b, string key, string value)
        {
            b.Append(key).Append('\t').Append(Esc.Escape(value)).Append('\n');
        }

        public static HandheldDoc Parse(string text)
        {
            if (string.IsNullOrEmpty(text)) throw new SheetFormatException("The document file is empty");
            return Parse(new StringReader(text), false);
        }

        /// <summary>Header only, for listing documents.</summary>
        public static HandheldDoc ParseHeader(TextReader r)
        {
            return Parse(r, true);
        }

        public static HandheldDoc Parse(TextReader r, bool headerOnly)
        {
            string first = r.ReadLine();
            if (first == null) throw new SheetFormatException("The document file is empty");
            if (first.TrimEnd('\r') != "DMHDOC\t" + Version)
                throw new SheetFormatException("Not a Danamotors handheld document (or a newer version)");

            HandheldDoc d = new HandheldDoc();
            int declared = -1, ended = -1, i = 0;
            bool sawSent = false;
            string row;
            while ((row = r.ReadLine()) != null)
            {
                i++;
                row = row.TrimEnd('\r');
                if (row.Length == 0) continue;
                string[] f = row.Split('\t');
                if (f[0] == "L")
                {
                    if (headerOnly) break;
                    if (f.Length < 8) throw new SheetFormatException("Bad document line " + i);
                    DocLine l = new DocLine();
                    l.Id = Esc.Unescape(f[1]);
                    if (!Num.TryInt(f[2], out l.Number)) throw new SheetFormatException("Bad document line " + i);
                    l.Bin = Esc.Unescape(f[3]);
                    l.PartNumber = Esc.Unescape(f[4]);
                    l.Description = Esc.Unescape(f[5]);
                    l.Case = Esc.Unescape(f[6]);
                    if (!Num.TryInt(f[7], out l.Expected) || l.Expected < 0 || l.Id.Length == 0) throw new SheetFormatException("Bad document line " + i);
                    d.Lines.Add(l);
                    continue;
                }
                if (f[0] == "END")
                {
                    if (f.Length < 2 || !Num.TryInt(f[1], out ended)) throw new SheetFormatException("Bad end line");
                }
                else if (f.Length >= 2)
                {
                    string v = Esc.Unescape(f[1]);
                    switch (f[0])
                    {
                        case "documentId": d.DocumentId = v; break;
                        case "documentNumber": d.DocumentNumber = v; break;
                        case "type": d.Type = v; break;
                        case "reference": d.Reference = v; break;
                        case "party": d.Party = v; break;
                        case "branch": d.Branch = v; break;
                        case "picker": d.Picker = v; break;
                        case "sentAt":
                            if (!Iso.TryParse(v, out d.SentAtUtc)) throw new SheetFormatException("Bad sent time");
                            sawSent = true;
                            break;
                        case "lines": Num.TryInt(v, out declared); break;
                    }
                }
            }
            d.DeclaredLines = declared < 0 ? 0 : declared;
            if (d.DocumentId.Length == 0 || d.DocumentNumber.Length == 0 || d.Type.Length == 0 || !sawSent)
                throw new SheetFormatException("The document file is missing its header");
            if (headerOnly) return d;
            if (ended < 0) throw new SheetFormatException("The document file is incomplete (it was cut short): send it again");
            if (ended != d.Lines.Count || (declared >= 0 && declared != d.Lines.Count))
                throw new SheetFormatException("The document file is damaged: send it again");
            return d;
        }

        /// <summary>Lines the header says the document has.</summary>
        public int DeclaredLines;
    }

    /// <summary>What the picker recorded for one line. Absent from PickState.Lines until the line is touched.</summary>
    public sealed class LineResult
    {
        public string LineId = "";
        public int Quantity;
        public int Damaged;
        /// <summary>One of ShortReasons.Codes, or empty.</summary>
        public string Reason = "";
        /// <summary>A different part scanned for this line (substitute), kept for the store; not counted.</summary>
        public string Scanned = "";
        public string Note = "";
        public DateTime AtUtc;

        public LineResult Copy() { return (LineResult)MemberwiseClone(); }
    }

    /// <summary>A part found in an MIT case that is not on the MIT (legacy newpart).</summary>
    public sealed class ExtraPart
    {
        public int Id;
        public string PartNumber = "";
        public int Quantity;
        public int Damaged;
        public string Note = "";
        public DateTime AtUtc;
    }

    public sealed class PickState
    {
        public Dictionary<string, LineResult> Lines = new Dictionary<string, LineResult>();
        public List<ExtraPart> Extras = new List<ExtraPart>();
        public bool Finished;
        public DateTime FinishedAtUtc;
        public int MaxExtraId;
        public int Skipped;

        public LineResult Result(string lineId)
        {
            LineResult r;
            return Lines.TryGetValue(lineId, out r) ? r : null;
        }

        public ExtraPart Extra(int id)
        {
            foreach (ExtraPart e in Extras) if (e.Id == id) return e;
            return null;
        }
    }

    /// <summary>
    /// The results file (.hlog) of a document, append-only like the count file: each record ends in "TAB ." so one cut
    /// off by a battery pull is ignored. The latest record for a line or an extra part wins.
    ///   P lineId qty damaged reason scanned note at .   the line now reads like this
    ///   A id part qty damaged note at .                  an extra part (MIT only) now reads like this
    ///   Y id at .                                        the extra part is deleted
    ///   F at .                                           finished (nothing after it counts)
    /// </summary>
    public static class PickLog
    {
        const string End = ".";

        public static string Line(LineResult r)
        {
            return "P\t" + Esc.Escape(r.LineId) + "\t" + r.Quantity + "\t" + r.Damaged + "\t" + Esc.Escape(r.Reason) + "\t" +
                   Esc.Escape(r.Scanned) + "\t" + Esc.Escape(r.Note) + "\t" + Iso.Utc(r.AtUtc) + "\t" + End;
        }

        public static string Extra(ExtraPart e)
        {
            return "A\t" + e.Id + "\t" + Esc.Escape(e.PartNumber) + "\t" + e.Quantity + "\t" + e.Damaged + "\t" + Esc.Escape(e.Note) + "\t" +
                   Iso.Utc(e.AtUtc) + "\t" + End;
        }

        public static string DeleteExtra(int id, DateTime atUtc)
        {
            return "Y\t" + id + "\t" + Iso.Utc(atUtc) + "\t" + End;
        }

        public static string Finish(DateTime atUtc)
        {
            return "F\t" + Iso.Utc(atUtc) + "\t" + End;
        }

        public static PickState Replay(IEnumerable<string> lines)
        {
            PickState s = new PickState();
            foreach (string raw in lines)
            {
                string line = raw.TrimEnd('\r');
                if (line.Length == 0) continue;
                string[] f = line.Split('\t');
                if (f[f.Length - 1] != End) { s.Skipped++; continue; }
                if (s.Finished) continue;
                bool ok = true;
                switch (f[0])
                {
                    case "P":
                        LineResult r = ParseLine(f);
                        if (r == null) { ok = false; break; }
                        s.Lines[r.LineId] = r;
                        break;
                    case "A":
                        ExtraPart e = ParseExtra(f);
                        if (e == null) { ok = false; break; }
                        if (e.Id > s.MaxExtraId) s.MaxExtraId = e.Id;
                        ExtraPart old = s.Extra(e.Id);
                        if (old == null) s.Extras.Add(e); else s.Extras[s.Extras.IndexOf(old)] = e;
                        break;
                    case "Y":
                        int id;
                        if (f.Length != 4 || !Num.TryInt(f[1], out id)) { ok = false; break; }
                        ExtraPart gone = s.Extra(id);
                        if (gone != null) s.Extras.Remove(gone);
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

        static LineResult ParseLine(string[] f)
        {
            if (f.Length != 9) return null;
            LineResult r = new LineResult();
            r.LineId = Esc.Unescape(f[1]);
            if (r.LineId.Length == 0) return null;
            if (!Num.TryInt(f[2], out r.Quantity) || r.Quantity < 0) return null;
            if (!Num.TryInt(f[3], out r.Damaged) || r.Damaged < 0) return null;
            r.Reason = Esc.Unescape(f[4]);
            if (r.Reason.Length > 0 && Array.IndexOf(ShortReasons.Codes, r.Reason) < 0) return null;
            r.Scanned = Esc.Unescape(f[5]);
            r.Note = Esc.Unescape(f[6]);
            if (!Iso.TryParse(f[7], out r.AtUtc)) return null;
            return r;
        }

        static ExtraPart ParseExtra(string[] f)
        {
            if (f.Length != 8) return null;
            ExtraPart e = new ExtraPart();
            if (!Num.TryInt(f[1], out e.Id) || e.Id <= 0) return null;
            e.PartNumber = Esc.Unescape(f[2]);
            if (e.PartNumber.Length == 0) return null;
            if (!Num.TryInt(f[3], out e.Quantity) || e.Quantity < 0) return null;
            if (!Num.TryInt(f[4], out e.Damaged) || e.Damaged < 0) return null;
            e.Note = Esc.Unescape(f[5]);
            if (!Iso.TryParse(f[6], out e.AtUtc)) return null;
            return e;
        }
    }
}
