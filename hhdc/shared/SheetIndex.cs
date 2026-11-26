using System;
using System.Collections.Generic;

namespace Danamotors.Hhdc
{
    public sealed class PartInfo
    {
        /// <summary>What was scanned or typed, trimmed.</summary>
        public string Scanned = "";
        /// <summary>The sheet's part number when found, otherwise the scanned text in upper case.</summary>
        public string PartNumber = "";
        public bool OnSheet;
        public string Description = "";
        public int? SystemStock;
        public string SheetBin = "";
    }

    /// <summary>Finds a scanned part on the sheet.</summary>
    public sealed class SheetIndex
    {
        readonly Dictionary<string, SheetLine> exact = new Dictionary<string, SheetLine>();
        readonly Dictionary<string, SheetLine> loose = new Dictionary<string, SheetLine>();
        readonly Dictionary<string, bool> ambiguous = new Dictionary<string, bool>();

        public SheetIndex(CountSheet sheet)
        {
            foreach (SheetLine l in sheet.Lines)
            {
                string code = Norm.Code(l.PartNumber);
                if (!exact.ContainsKey(code)) exact[code] = l;
                string key = Norm.Key(l.PartNumber);
                if (loose.ContainsKey(key)) ambiguous[key] = true; else loose[key] = l;
            }
        }

        /// <summary>Exact match first (ignoring case), then ignoring dashes and spaces if that is unambiguous.</summary>
        public SheetLine Find(string scanned)
        {
            SheetLine l = FindText(scanned);
            if (l != null) return l;
            string part = Norm.PartFromScan(scanned); // a label with the model code after the part number
            return part == (scanned ?? "").Trim() ? null : FindText(part);
        }

        SheetLine FindText(string text)
        {
            string code = Norm.Code(text);
            if (code.Length == 0) return null;
            SheetLine l;
            if (exact.TryGetValue(code, out l)) return l;
            string key = Norm.Key(text);
            if (key.Length > 0 && !ambiguous.ContainsKey(key) && loose.TryGetValue(key, out l)) return l;
            return null;
        }
    }
}
