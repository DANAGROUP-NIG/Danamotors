using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace Danamotors.Hhdc
{
    public sealed class SheetFormatException : Exception
    {
        public SheetFormatException(string message) : base(message) { }
    }

    public sealed class SheetLine
    {
        public string Bin = "";
        public string PartNumber = "";
        public string Description = "";
        /// <summary>System stock, only when the sheet allows the checker to see it.</summary>
        public int? SystemStock;
    }

    /// <summary>
    /// A count sheet as the PC sends it to the device (one .sheet file). Plain text: a header of
    /// "key TAB value" lines, one "L" line per part, and an "END" line with the part count, so a file
    /// cut short by a dropped USB link is recognised.
    /// </summary>
    public sealed class CountSheet
    {
        public const int Version = 1;

        public string StockTakeId = "";
        public string SheetId = "";
        public string SheetNumber = "";
        public string BatchNumber = "";
        public string Branch = "";
        public string Checker = "";
        public string Criteria = "";
        public bool ShowSystemStock;
        /// <summary>The PC's clock when the sheet was sent; the device clock cannot be trusted.</summary>
        public DateTime SentAtUtc;
        public List<SheetLine> Lines = new List<SheetLine>();

        /// <summary>File name stem on the device, safe on any file system.</summary>
        public string FileStem
        {
            get { return SafeStem(SheetNumber); }
        }

        public static string SafeStem(string name)
        {
            StringBuilder b = new StringBuilder();
            foreach (char c in name ?? "") b.Append(char.IsLetterOrDigit(c) || c == '-' || c == '_' ? c : '_');
            return b.Length == 0 ? "sheet" : b.ToString();
        }

        public string Serialize()
        {
            StringBuilder b = new StringBuilder();
            b.Append("DMSHEET\t").Append(Version).Append('\n');
            Pair(b, "stockTakeId", StockTakeId);
            Pair(b, "sheetId", SheetId);
            Pair(b, "sheetNumber", SheetNumber);
            Pair(b, "batchNumber", BatchNumber);
            Pair(b, "branch", Branch);
            Pair(b, "checker", Checker);
            Pair(b, "criteria", Criteria);
            Pair(b, "showSystemStock", ShowSystemStock ? "1" : "0");
            Pair(b, "sentAt", Iso.Utc(SentAtUtc));
            Pair(b, "lines", Lines.Count.ToString());
            foreach (SheetLine l in Lines)
            {
                // A blind sheet never carries system stock, even if the caller set it.
                string stock = ShowSystemStock && l.SystemStock.HasValue ? l.SystemStock.Value.ToString() : "";
                b.Append("L\t").Append(Esc.Escape(l.Bin)).Append('\t').Append(Esc.Escape(l.PartNumber)).Append('\t')
                 .Append(Esc.Escape(l.Description)).Append('\t').Append(stock).Append('\n');
            }
            b.Append("END\t").Append(Lines.Count).Append('\n');
            return b.ToString();
        }

        static void Pair(StringBuilder b, string key, string value)
        {
            b.Append(key).Append('\t').Append(Esc.Escape(value)).Append('\n');
        }

        /// <summary>Lines the header says the sheet has (the part lines themselves are not read by ParseHeader).</summary>
        public int DeclaredLines;

        public static CountSheet Parse(string text)
        {
            if (string.IsNullOrEmpty(text)) throw new SheetFormatException("The sheet file is empty");
            return Parse(new StringReader(text), false);
        }

        /// <summary>Header only: stops at the first part line. For listing sheets without reading thousands of parts.</summary>
        public static CountSheet ParseHeader(TextReader r)
        {
            return Parse(r, true);
        }

        /// <summary>Reads a line at a time, so a 40,000-part sheet is not held in memory twice.</summary>
        public static CountSheet Parse(TextReader r)
        {
            return Parse(r, false);
        }

        static CountSheet Parse(TextReader r, bool headerOnly)
        {
            string first = r.ReadLine();
            if (first == null) throw new SheetFormatException("The sheet file is empty");
            if (first.TrimEnd('\r') != "DMSHEET\t" + Version)
                throw new SheetFormatException("Not a Danamotors count sheet (or a newer version)");

            CountSheet s = new CountSheet();
            int declared = -1, ended = -1, i = 0;
            bool sawSent = false;
            string row;
            while ((row = r.ReadLine()) != null)
            {
                i++;
                row = row.TrimEnd('\r');
                if (row.Length == 0) continue;
                if (row[0] == 'L' && row.Length > 1 && row[1] == '\t')
                {
                    if (headerOnly) break;
                    string[] f = row.Split('\t');
                    if (f.Length < 5) throw new SheetFormatException("Bad part line " + i);
                    SheetLine l = new SheetLine();
                    l.Bin = Esc.Unescape(f[1]);
                    l.PartNumber = Esc.Unescape(f[2]);
                    l.Description = Esc.Unescape(f[3]);
                    int stock;
                    if (f[4].Length > 0 && Num.TryInt(f[4], out stock)) l.SystemStock = stock;
                    s.Lines.Add(l);
                    continue;
                }
                string[] h = row.Split('\t');
                if (h[0] == "END")
                {
                    if (h.Length < 2 || !Num.TryInt(h[1], out ended)) throw new SheetFormatException("Bad end line");
                }
                else if (h.Length >= 2)
                {
                    string v = Esc.Unescape(h[1]);
                    switch (h[0])
                    {
                        case "stockTakeId": s.StockTakeId = v; break;
                        case "sheetId": s.SheetId = v; break;
                        case "sheetNumber": s.SheetNumber = v; break;
                        case "batchNumber": s.BatchNumber = v; break;
                        case "branch": s.Branch = v; break;
                        case "checker": s.Checker = v; break;
                        case "criteria": s.Criteria = v; break;
                        case "showSystemStock": s.ShowSystemStock = v == "1"; break;
                        case "sentAt":
                            if (!Iso.TryParse(v, out s.SentAtUtc)) throw new SheetFormatException("Bad sent time");
                            sawSent = true;
                            break;
                        case "lines": Num.TryInt(v, out declared); break;
                    }
                }
            }
            s.DeclaredLines = declared < 0 ? 0 : declared;
            if (s.SheetId.Length == 0 || s.StockTakeId.Length == 0 || s.SheetNumber.Length == 0 || !sawSent)
                throw new SheetFormatException("The sheet file is missing its header");
            if (headerOnly) return s;
            if (ended < 0) throw new SheetFormatException("The sheet file is incomplete (it was cut short): send it again");
            if (ended != s.Lines.Count || (declared >= 0 && declared != s.Lines.Count))
                throw new SheetFormatException("The sheet file is damaged: send it again");
            return s;
        }
    }
}
