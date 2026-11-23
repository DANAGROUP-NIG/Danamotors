using System;
using System.Collections.Generic;
using System.Text;

namespace Danamotors.Hhdc.Link
{
    /// <summary>What the storekeeper checks before anything is uploaded.</summary>
    public sealed class ReceiveSummary
    {
        public int Entries;
        public int PartsCounted;
        public int Quantity;
        public int Damaged;
        public int SheetLines;
        public int UncountedLines;
        /// <summary>Part numbers counted that are not on the sheet (legacy NewPart).</summary>
        public List<string> NotOnSheet = new List<string>();

        public static ReceiveSummary Build(CountSheet sheet, CountState state)
        {
            ReceiveSummary s = new ReceiveSummary();
            SheetIndex index = new SheetIndex(sheet);
            Dictionary<string, bool> parts = new Dictionary<string, bool>();
            Dictionary<string, bool> onSheet = new Dictionary<string, bool>();
            Dictionary<string, bool> off = new Dictionary<string, bool>();
            foreach (CountEntry e in state.Entries)
            {
                s.Entries++;
                s.Quantity += e.Quantity;
                s.Damaged += e.Damaged;
                parts[Norm.Code(e.PartNumber)] = true;
                SheetLine l = index.Find(e.PartNumber);
                if (l != null) onSheet[Norm.Code(l.PartNumber)] = true;
                else if (!off.ContainsKey(Norm.Code(e.PartNumber))) { off[Norm.Code(e.PartNumber)] = true; s.NotOnSheet.Add(Norm.Code(e.PartNumber)); }
            }
            s.PartsCounted = parts.Count;
            s.SheetLines = sheet.Lines.Count;
            s.UncountedLines = sheet.Lines.Count - onSheet.Count;
            return s;
        }

        public string Describe()
        {
            StringBuilder b = new StringBuilder();
            b.AppendLine("Entries counted:        " + Entries + " (" + PartsCounted + " different parts)");
            b.AppendLine("Quantity (good):        " + Quantity);
            b.AppendLine("Damaged:                " + Damaged);
            b.AppendLine("Parts on the sheet:     " + SheetLines);
            b.AppendLine("Not counted at all:     " + UncountedLines);
            b.Append("Not on the sheet:       " + NotOnSheet.Count);
            if (NotOnSheet.Count > 0)
            {
                int show = Math.Min(NotOnSheet.Count, 8);
                b.Append("  (" + string.Join(", ", NotOnSheet.GetRange(0, show).ToArray()) + (NotOnSheet.Count > show ? ", ..." : "") + ")");
            }
            return b.ToString();
        }
    }

    public static class UploadBuilder
    {
        const int ToleranceMinutes = 5;

        /// <summary>
        /// The device clock cannot be trusted (it can read 2009 after a power loss). Its time is used only if
        /// it falls between when the PC sent the sheet and now; otherwise the time the PC received the sheet.
        /// </summary>
        public static DateTime ResolveTime(DateTime deviceUtc, DateTime sentAtUtc, DateTime receivedAtUtc)
        {
            DateTime lo = sentAtUtc.AddMinutes(-ToleranceMinutes), hi = receivedAtUtc.AddMinutes(ToleranceMinutes);
            if (deviceUtc < lo || deviceUtc > hi) return receivedAtUtc;
            return deviceUtc > receivedAtUtc ? receivedAtUtc : deviceUtc;
        }

        /// <summary>One entry per part per bin, as the upload expects. Duplicates (which the app prevents) are summed.</summary>
        public static List<Dictionary<string, object>> Build(CountSheet sheet, CountState state, DateTime receivedAtUtc)
        {
            List<string> order = new List<string>();
            Dictionary<string, Dictionary<string, object>> byKey = new Dictionary<string, Dictionary<string, object>>();
            Dictionary<string, DateTime> latest = new Dictionary<string, DateTime>();
            foreach (CountEntry e in state.Entries)
            {
                string key = Norm.Code(e.PartNumber) + "|" + Norm.Key(e.Bin);
                DateTime at = ResolveTime(e.AtUtc, sheet.SentAtUtc, receivedAtUtc);
                Dictionary<string, object> row;
                if (!byKey.TryGetValue(key, out row))
                {
                    row = new Dictionary<string, object>();
                    row["partNumber"] = Norm.Code(e.PartNumber);
                    if (Norm.Code(e.Bin).Length > 0) row["binLocation"] = Norm.Code(e.Bin);
                    row["quantity"] = 0;
                    row["damagedQuantity"] = 0;
                    byKey[key] = row;
                    order.Add(key);
                    latest[key] = at;
                }
                row["quantity"] = (int)row["quantity"] + e.Quantity;
                row["damagedQuantity"] = (int)row["damagedQuantity"] + e.Damaged;
                if (at > latest[key]) latest[key] = at;
                if (e.Remarks.Length > 0)
                {
                    string old = row.ContainsKey("remarks") ? (string)row["remarks"] : "";
                    if (old.IndexOf(e.Remarks, StringComparison.Ordinal) < 0)
                    {
                        string joined = old.Length == 0 ? e.Remarks : old + "; " + e.Remarks;
                        row["remarks"] = joined.Length > 200 ? joined.Substring(0, 200) : joined;
                    }
                }
            }
            List<Dictionary<string, object>> rows = new List<Dictionary<string, object>>();
            foreach (string key in order)
            {
                byKey[key]["countedAt"] = Iso.Utc(latest[key]);
                rows.Add(byKey[key]);
            }
            return rows;
        }
    }
}
