// Shared by the device app (.NET Compact Framework 3.5) and HHDC Link (.NET Framework 4.8).
// Keep to what both have: no LINQ, no Func<>/Action, no String.IsNullOrWhiteSpace.
using System;
using System.Globalization;
using System.Text;

namespace Danamotors.Hhdc
{
    /// <summary>Tab-separated text files: tabs and line breaks inside a value are escaped.</summary>
    public static class Esc
    {
        public static string Escape(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            StringBuilder b = new StringBuilder(s.Length + 8);
            foreach (char c in s)
            {
                if (c == '\\') b.Append("\\\\");
                else if (c == '\t') b.Append("\\t");
                else if (c == '\r') b.Append("\\r");
                else if (c == '\n') b.Append("\\n");
                else b.Append(c);
            }
            return b.ToString();
        }

        public static string Unescape(string s)
        {
            if (string.IsNullOrEmpty(s) || s.IndexOf('\\') < 0) return s ?? "";
            StringBuilder b = new StringBuilder(s.Length);
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                if (c == '\\' && i + 1 < s.Length)
                {
                    char n = s[++i];
                    if (n == 't') b.Append('\t');
                    else if (n == 'r') b.Append('\r');
                    else if (n == 'n') b.Append('\n');
                    else b.Append(n);
                }
                else b.Append(c);
            }
            return b.ToString();
        }
    }

    /// <summary>What .NET Compact Framework 3.5 lacks: it has no Int32.TryParse.</summary>
    public static class Num
    {
        /// <summary>Whole number of up to 9 digits with an optional leading minus; anything else is false.</summary>
        public static bool TryInt(string s, out int value)
        {
            value = 0;
            if (string.IsNullOrEmpty(s) || s.Length > 10) return false;
            int i = s[0] == '-' ? 1 : 0;
            if (i == s.Length || s.Length - i > 9) return false;
            long n = 0;
            for (; i < s.Length; i++)
            {
                if (s[i] < '0' || s[i] > '9') return false;
                n = n * 10 + (s[i] - '0');
            }
            value = (int)(s[0] == '-' ? -n : n);
            return true;
        }
    }

    /// <summary>UTC timestamps as written in the files: 2026-10-17T09:12:00Z.</summary>
    public static class Iso
    {
        const string Format = "yyyy-MM-dd'T'HH:mm:ss'Z'";

        public static string Utc(DateTime utc)
        {
            return utc.ToString(Format, CultureInfo.InvariantCulture);
        }

        public static bool TryParse(string s, out DateTime utc)
        {
            utc = DateTime.MinValue;
            try
            {
                utc = DateTime.ParseExact(s ?? "", Format, CultureInfo.InvariantCulture,
                    DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal);
                return true;
            }
            catch (FormatException) { return false; }
        }
    }

    /// <summary>Normal forms for matching what a scanner or a person types against the sheet.</summary>
    public static class Norm
    {
        /// <summary>Trimmed, upper case: how part numbers and bins are stored.</summary>
        public static string Code(string s)
        {
            return (s ?? "").Trim().ToUpper(CultureInfo.InvariantCulture);
        }

        /// <summary>Letters and digits only, upper case: "86110-2t000" matches "861102T000".</summary>
        public static string Key(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            StringBuilder b = new StringBuilder(s.Length);
            foreach (char c in s) if (char.IsLetterOrDigit(c)) b.Append(char.ToUpper(c, CultureInfo.InvariantCulture));
            return b.ToString();
        }

        /// <summary>
        /// Kia labels print the part number, a run of spaces, then a model or colour code
        /// ("96611P2700        KL22"). The part is the text before the first run of two or more spaces.
        /// Single spaces stay: legacy part numbers such as "0K081 33211" have them.
        /// </summary>
        public static string PartFromScan(string s)
        {
            string t = (s ?? "").Trim();
            int cut = t.IndexOf("  ", StringComparison.Ordinal);
            return cut > 0 ? t.Substring(0, cut).Trim() : t;
        }

        public static bool SameBin(string a, string b)
        {
            string ka = Key(a), kb = Key(b);
            return ka.Length > 0 && ka == kb;
        }

        /// <summary>
        /// A part's bin field can list several bins separated by '/' ("1D3/1D2/40A3": 38% of the parts in stock at CPD).
        /// True when the bin is one of them.
        /// </summary>
        public static bool BinListHas(string list, string bin)
        {
            if (Key(bin).Length == 0 || string.IsNullOrEmpty(list)) return false;
            foreach (string one in list.Split('/'))
                if (SameBin(one, bin)) return true;
            return false;
        }
    }
}
