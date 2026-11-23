using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;

namespace Danamotors.Hhdc.Device
{
    /// <summary>The part lines of a sheet, as the count session needs them.</summary>
    public interface ISheetLines
    {
        int Count { get; }
        /// <summary>The sheet's line for a scanned or typed part, or null.</summary>
        SheetLine Find(string scanned);
        /// <summary>Line number i (0 to Count-1), in sheet order.</summary>
        SheetLine At(int i);
        /// <summary>Line numbers of the lines whose bin, or one of whose '/'-separated bins, is this bin (ignoring case, dashes and spaces). At most maxCount.</summary>
        int[] LinesInBin(string bin, int maxCount);
        /// <summary>Line numbers of the lines whose part number starts with this text (letters and digits only, any case). At most maxCount.</summary>
        int[] LinesWithPartStart(string text, int maxCount);
        /// <summary>The bin field of line i as sent (may list several bins separated by '/').</summary>
        string BinText(int i);
        /// <summary>The part number of line i as sent.</summary>
        string PartText(int i);
        /// <summary>The line number of a scanned or typed part, or -1 (same matching as Find).</summary>
        int LineOf(string scanned);
        /// <summary>
        /// Every bin on the sheet in sheet order, with its parts and the parts whose line is not in counted. A bin field
        /// may list several bins ('/'); the line counts in each. noBin: lines with no bin.
        /// </summary>
        List<BinSummary> BinSummaries(bool[] counted, out int noBin);
    }

    /// <summary>Lines already parsed into a CountSheet (used by tests and small sheets).</summary>
    public sealed class ListSheetLines : ISheetLines
    {
        readonly CountSheet sheet;
        readonly SheetIndex index;

        public ListSheetLines(CountSheet sheet)
        {
            this.sheet = sheet;
            this.index = new SheetIndex(sheet);
        }

        public int Count { get { return sheet.Lines.Count; } }
        public SheetLine Find(string scanned) { return index.Find(scanned); }
        public SheetLine At(int i) { return sheet.Lines[i]; }
        public string BinText(int i) { return sheet.Lines[i].Bin ?? ""; }
        public string PartText(int i) { return sheet.Lines[i].PartNumber ?? ""; }

        public int LineOf(string scanned)
        {
            SheetLine l = index.Find(scanned);
            return l == null ? -1 : sheet.Lines.IndexOf(l);
        }

        public List<BinSummary> BinSummaries(bool[] counted, out int noBin)
        {
            Dictionary<string, BinSummary> byKey = new Dictionary<string, BinSummary>();
            List<BinSummary> bins = new List<BinSummary>();
            noBin = 0;
            for (int i = 0; i < sheet.Lines.Count; i++)
            {
                bool any = false;
                foreach (string one in BinText(i).Split('/'))
                {
                    string key = Norm.Key(one);
                    if (key.Length == 0) continue;
                    any = true;
                    BinSummary b;
                    if (!byKey.TryGetValue(key, out b)) { b = new BinSummary(Norm.Code(one)); byKey[key] = b; bins.Add(b); }
                    b.Parts++;
                    if (!counted[i]) b.Left++;
                }
                if (!any) noBin++;
            }
            return bins;
        }

        public int[] LinesInBin(string bin, int maxCount)
        {
            List<int> found = new List<int>();
            string key = Norm.Key(bin);
            if (key.Length == 0) return new int[0];
            for (int i = 0; i < sheet.Lines.Count && found.Count < maxCount; i++)
                if (Norm.BinListHas(sheet.Lines[i].Bin, bin)) found.Add(i);
            return found.ToArray();
        }

        public int[] LinesWithPartStart(string text, int maxCount)
        {
            List<int> found = new List<int>();
            string key = Norm.Key(text);
            if (key.Length == 0) return new int[0];
            for (int i = 0; i < sheet.Lines.Count && found.Count < maxCount; i++)
                if (Norm.Key(sheet.Lines[i].PartNumber).StartsWith(key, StringComparison.Ordinal)) found.Add(i);
            return found.ToArray();
        }
    }

    /// <summary>
    /// A sheet held as one string plus two hash tables of line numbers. A legacy annual count had 38,723
    /// parts; a string and an object per part took 23 seconds on the handheld (the .NET Compact Framework
    /// collector walks every live object), and managed loops over every character still took 10 seconds. So
    /// the lines and tabs are found with the runtime's native string search, only the short part-number
    /// field is hashed, and a SheetLine is made only for the part being looked at.
    /// Part numbers that contain a backslash cannot be matched.
    /// </summary>
    public sealed class CompactSheetLines : ISheetLines
    {
        readonly string text;
        readonly int[] starts;   // offset of the "L" of each part line
        readonly int[] ends;     // offset just past the last character of each part line
        readonly int[] partFrom; // the part-number field of each line: text[partFrom, partTo)
        readonly int[] partTo;
        readonly int[] binFrom;  // the bin field of each line: text[binFrom, binTo)
        readonly int[] binTo;
        readonly int count;
        readonly int[] exact;    // hash table of line number + 1 (0 = empty), by trimmed upper-case part number
        readonly int[] loose;    // same, by letters and digits only; negative when two lines share the key
        readonly int mask;

        public CountSheet Header;
        /// <summary>Milliseconds: reading the file, finding the lines, building the tables.</summary>
        public int ReadMs, ScanMs, HashMs;

        public int Count { get { return count; } }

        /// <summary>Reads and checks a whole sheet file. Throws SheetFormatException for a bad or cut-short file.</summary>
        public static CompactSheetLines Read(Stream stream)
        {
            int t0 = Environment.TickCount;
            string all;
            using (StreamReader r = new StreamReader(stream, Encoding.UTF8)) all = r.ReadToEnd();
            CompactSheetLines c = new CompactSheetLines(all, t0);
            return c;
        }

        CompactSheetLines(string all, int t0)
        {
            text = all;
            int length = text.Length;
            if (length == 0) throw new SheetFormatException("The sheet file is empty");
            int t1 = Environment.TickCount;
            ReadMs = unchecked(t1 - t0);

            // The header is everything before the first part line; the shared parser reads it.
            int firstPart = text.IndexOf("\nL\t", StringComparison.Ordinal);
            int headerLength = firstPart >= 0 ? firstPart + 1 : length;
            using (StringReader hr = new StringReader(text.Substring(0, headerLength)))
                Header = CountSheet.ParseHeader(hr);
            int capacity = Header.DeclaredLines + 1;
            starts = new int[capacity];
            ends = new int[capacity];
            partFrom = new int[capacity];
            partTo = new int[capacity];
            binFrom = new int[capacity];
            binTo = new int[capacity];

            // Find the lines and the tabs with the native search.
            int found = 0, endCount = -1;
            int pos = headerLength;
            while (pos < length)
            {
                int eol = text.IndexOf('\n', pos);
                if (eol < 0) eol = length;
                int stop = eol > pos && text[eol - 1] == '\r' ? eol - 1 : eol;
                if (stop - pos > 1 && text[pos] == 'L' && text[pos + 1] == '\t')
                {
                    // L TAB bin TAB part TAB description TAB stock
                    int t2 = text.IndexOf('\t', pos + 2, stop - pos - 2);
                    int t3 = t2 < 0 ? -1 : text.IndexOf('\t', t2 + 1, stop - t2 - 1);
                    int t4 = t3 < 0 ? -1 : text.IndexOf('\t', t3 + 1, stop - t3 - 1);
                    if (t4 < 0) throw new SheetFormatException("Bad part line " + (found + 1));
                    if (found >= capacity) throw new SheetFormatException("The sheet file is damaged: send it again");
                    starts[found] = pos;
                    ends[found] = stop;
                    partFrom[found] = t2 + 1;
                    partTo[found] = t3;
                    binFrom[found] = pos + 2;
                    binTo[found] = t2;
                    found++;
                }
                else if (stop - pos > 4 && string.CompareOrdinal(text, pos, "END\t", 0, 4) == 0)
                {
                    if (!Num.TryInt(text.Substring(pos + 4, stop - pos - 4), out endCount)) throw new SheetFormatException("Bad end line");
                }
                pos = eol + 1;
            }
            count = found;
            if (endCount < 0) throw new SheetFormatException("The sheet file is incomplete (it was cut short): send it again");
            if (endCount != count || Header.DeclaredLines != count) throw new SheetFormatException("The sheet file is damaged: send it again");
            int t5 = Environment.TickCount;
            ScanMs = unchecked(t5 - t1);

            int size = 16;
            while (size < count * 2 + 2) size <<= 1;
            mask = size - 1;
            exact = new int[size];
            loose = new int[size];
            for (int i = 0; i < count; i++)
            {
                // Exact: first line wins, as in SheetIndex.
                int h = (int)(HashCode(partFrom[i], partTo[i]) & (uint)mask);
                while (exact[h] != 0 && !SameCode(exact[h] - 1, i)) h = (h + 1) & mask;
                if (exact[h] == 0) exact[h] = i + 1;
                // Loose: a second line with the same letters and digits makes the key ambiguous.
                h = (int)(HashKey(partFrom[i], partTo[i]) & (uint)mask);
                while (loose[h] != 0 && !SameKey(loose[h], i)) h = (h + 1) & mask;
                if (loose[h] == 0) loose[h] = i + 1; else loose[h] = -Math.Abs(loose[h]);
            }
            HashMs = unchecked(Environment.TickCount - t5);
        }

        // Upper case without a culture lookup for the plain characters part numbers are made of.
        static char Up(char c)
        {
            if (c < 128) return c >= 'a' && c <= 'z' ? (char)(c - 32) : c;
            return char.ToUpper(c, CultureInfo.InvariantCulture);
        }

        static bool IsAlnum(char c)
        {
            if (c < 128) return (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
            return char.IsLetterOrDigit(c);
        }

        // Trimmed, upper case (Norm.Code) over text[s, e).
        uint HashCode(int s, int e)
        {
            while (s < e && char.IsWhiteSpace(text[s])) s++;
            while (e > s && char.IsWhiteSpace(text[e - 1])) e--;
            uint h = 2166136261;
            for (int i = s; i < e; i++) h = (h ^ Up(text[i])) * 16777619;
            return h;
        }

        static uint HashCode(string code)
        {
            uint h = 2166136261;
            for (int i = 0; i < code.Length; i++) h = (h ^ code[i]) * 16777619;
            return h;
        }

        bool SameCode(int a, int b)
        {
            int as_ = partFrom[a], ae = partTo[a], bs = partFrom[b], be = partTo[b];
            while (as_ < ae && char.IsWhiteSpace(text[as_])) as_++;
            while (ae > as_ && char.IsWhiteSpace(text[ae - 1])) ae--;
            while (bs < be && char.IsWhiteSpace(text[bs])) bs++;
            while (be > bs && char.IsWhiteSpace(text[be - 1])) be--;
            if (ae - as_ != be - bs) return false;
            for (int i = 0; i < ae - as_; i++) if (Up(text[as_ + i]) != Up(text[bs + i])) return false;
            return true;
        }

        bool EqualsCode(int line, string code)
        {
            int ps = partFrom[line], pe = partTo[line];
            while (ps < pe && char.IsWhiteSpace(text[ps])) ps++;
            while (pe > ps && char.IsWhiteSpace(text[pe - 1])) pe--;
            if (pe - ps != code.Length) return false;
            for (int i = 0; i < code.Length; i++) if (Up(text[ps + i]) != code[i]) return false;
            return true;
        }

        // Letters and digits only, upper case (Norm.Key).
        uint HashKey(int s, int e)
        {
            uint h = 2166136261;
            for (int i = s; i < e; i++) if (IsAlnum(text[i])) h = (h ^ Up(text[i])) * 16777619;
            return h;
        }

        bool SameKey(int entry, int b)
        {
            int a = Math.Abs(entry) - 1;
            int ps = partFrom[a], pe = partTo[a], s = partFrom[b], e = partTo[b];
            while (true)
            {
                while (ps < pe && !IsAlnum(text[ps])) ps++;
                while (s < e && !IsAlnum(text[s])) s++;
                if (ps >= pe || s >= e) return ps >= pe && s >= e;
                if (Up(text[ps]) != Up(text[s])) return false;
                ps++; s++;
            }
        }

        bool EqualsKey(int entry, string key)
        {
            int line = Math.Abs(entry) - 1;
            int k = 0;
            for (int p = partFrom[line]; p < partTo[line]; p++)
            {
                if (!IsAlnum(text[p])) continue;
                if (k >= key.Length || Up(text[p]) != key[k]) return false;
                k++;
            }
            return k == key.Length;
        }

        /// <summary>True when the letters and digits of text[from, to), upper-cased, are exactly key (or start with it).</summary>
        bool KeyMatches(int from, int to, string key, bool prefixOnly)
        {
            int k = 0;
            for (int p = from; p < to; p++)
            {
                if (!IsAlnum(text[p])) continue;
                if (k >= key.Length) return prefixOnly;
                if (Up(text[p]) != key[k]) return false;
                k++;
            }
            return k == key.Length;
        }

        public int[] LinesInBin(string bin, int maxCount)
        {
            string key = Norm.Key(bin);
            List<int> found = new List<int>();
            if (key.Length == 0) return new int[0];
            for (int i = 0; i < count && found.Count < maxCount; i++)
                if (BinFieldHas(binFrom[i], binTo[i], key)) found.Add(i);
            return found.ToArray();
        }

        /// <summary>The bin field text[from, to) may list several bins separated by '/' (Norm.BinListHas).</summary>
        bool BinFieldHas(int from, int to, string key)
        {
            int s = from;
            while (s <= to)
            {
                int slash = s < to ? text.IndexOf('/', s, to - s) : -1;
                int e = slash < 0 ? to : slash;
                if (KeyMatches(s, e, key, false)) return true;
                s = e + 1;
            }
            return false;
        }

        public int[] LinesWithPartStart(string value, int maxCount)
        {
            string key = Norm.Key(value);
            List<int> found = new List<int>();
            if (key.Length == 0) return new int[0];
            for (int i = 0; i < count && found.Count < maxCount; i++)
                if (KeyMatches(partFrom[i], partTo[i], key, true)) found.Add(i);
            return found.ToArray();
        }

        public string BinText(int i)
        {
            return Field(binFrom[i], binTo[i]);
        }

        public string PartText(int i)
        {
            return Field(partFrom[i], partTo[i]);
        }

        string Field(int from, int to)
        {
            string s = text.Substring(from, to - from);
            return s.IndexOf('\\') < 0 ? s : Esc.Unescape(s);
        }

        public SheetLine At(int i)
        {
            if (i < 0 || i >= count) throw new ArgumentOutOfRangeException("i");
            string[] f = text.Substring(starts[i], ends[i] - starts[i]).Split('\t');
            SheetLine l = new SheetLine();
            l.Bin = Esc.Unescape(f[1]);
            l.PartNumber = Esc.Unescape(f[2]);
            l.Description = Esc.Unescape(f[3]);
            int stock;
            if (f.Length > 4 && f[4].Length > 0 && Num.TryInt(f[4], out stock)) l.SystemStock = stock;
            return l;
        }

        public SheetLine Find(string scanned)
        {
            int i = LineOf(scanned);
            return i < 0 ? null : At(i);
        }

        public int LineOf(string scanned)
        {
            int i = LineOfText(scanned);
            if (i >= 0) return i;
            string part = Norm.PartFromScan(scanned);
            return part == (scanned ?? "").Trim() ? -1 : LineOfText(part);
        }

        int LineOfText(string value)
        {
            string code = Norm.Code(value);
            if (code.Length == 0) return -1;
            int h = (int)(HashCode(code) & (uint)mask);
            while (exact[h] != 0)
            {
                if (EqualsCode(exact[h] - 1, code)) return exact[h] - 1;
                h = (h + 1) & mask;
            }
            string key = Norm.Key(value);
            if (key.Length == 0) return -1;
            uint hk = 2166136261;
            for (int i = 0; i < key.Length; i++) hk = (hk ^ key[i]) * 16777619;
            h = (int)(hk & (uint)mask);
            while (loose[h] != 0)
            {
                if (EqualsKey(loose[h], key)) return loose[h] > 0 ? loose[h] - 1 : -1; // negative = ambiguous
                h = (h + 1) & mask;
            }
            return -1;
        }

        /// <summary>
        /// The bin list without a string per line: on the handheld the first version (a few strings per line) took
        /// 17 seconds for 38,723 lines. Bins are hashed straight from the sheet text; a string is made per distinct bin.
        /// </summary>
        public List<BinSummary> BinSummaries(bool[] counted, out int noBin)
        {
            int segments = 0;
            for (int i = 0; i < count; i++)
            {
                segments++;
                for (int p = binFrom[i]; p < binTo[i]; p++) if (text[p] == '/') segments++;
            }
            int size = 16;
            while (size < segments * 2 + 2) size <<= 1;
            int binMask = size - 1;
            int[] slots = new int[size];           // bin number + 1
            List<BinSummary> bins = new List<BinSummary>();
            List<int> repFrom = new List<int>(), repTo = new List<int>(); // where each bin's text first appears
            noBin = 0;
            for (int i = 0; i < count; i++)
            {
                bool any = false;
                int s = binFrom[i], to = binTo[i];
                while (s <= to)
                {
                    int slash = s < to ? text.IndexOf('/', s, to - s) : -1;
                    int e = slash < 0 ? to : slash;
                    if (HasAlnum(s, e))
                    {
                        any = true;
                        int h = (int)(HashKey(s, e) & (uint)binMask);
                        while (slots[h] != 0 && !SameKeyRange(repFrom[slots[h] - 1], repTo[slots[h] - 1], s, e)) h = (h + 1) & binMask;
                        if (slots[h] == 0)
                        {
                            bins.Add(new BinSummary(Norm.Code(Field(s, e))));
                            repFrom.Add(s);
                            repTo.Add(e);
                            slots[h] = bins.Count;
                        }
                        BinSummary b = bins[slots[h] - 1];
                        b.Parts++;
                        if (!counted[i]) b.Left++;
                    }
                    s = e + 1;
                }
                if (!any) noBin++;
            }
            return bins;
        }

        bool HasAlnum(int s, int e)
        {
            for (int p = s; p < e; p++) if (IsAlnum(text[p])) return true;
            return false;
        }

        /// <summary>The letters and digits of text[as, ae) and text[bs, be) are the same, ignoring case.</summary>
        bool SameKeyRange(int as_, int ae, int bs, int be)
        {
            while (true)
            {
                while (as_ < ae && !IsAlnum(text[as_])) as_++;
                while (bs < be && !IsAlnum(text[bs])) bs++;
                if (as_ >= ae || bs >= be) return as_ >= ae && bs >= be;
                if (Up(text[as_]) != Up(text[bs])) return false;
                as_++; bs++;
            }
        }
    }
}
