using System;
using System.Collections.Generic;
using System.Text;

namespace Danamotors.Hhdc.Link
{
    /// <summary>A picking list, CPO or MIT that can be sent to a handheld now.</summary>
    public sealed class DocSource
    {
        public string Type = "";
        public string SourceId = "";
        public string Number = "";
        public string Reference = "";
        public string Party = "";
        public DateTime? Date;
        public int Lines;
        public int Quantity;
    }

    public sealed class Picker
    {
        public string Id = "";
        public string Code = "";
        public string Name = "";

        public override string ToString() { return Name + (Code.Length > 0 ? " (" + Code + ")" : ""); }
    }

    public sealed class FetchedDoc
    {
        public HandheldDoc Doc;
        /// <summary>SENT, UPLOADED or CANCELLED.</summary>
        public string Status = "";
        public string CancelRemark = "";
    }

    /// <summary>The handheld document calls HHDC Link makes. The real one is ApiClient; tests use a fake.</summary>
    public interface IHandheldApi
    {
        string UserName { get; }
        List<DocSource> ListSources(string type);
        List<Picker> ListPickers();
        FetchedDoc CreateDocument(string type, string sourceId, string pickerId);
        FetchedDoc GetDocument(string id);
        void UploadDocument(string id, Dictionary<string, object> body);
        void CancelDocument(string id, string remark);
    }

    public sealed partial class ApiClient : IHandheldApi
    {
        public List<DocSource> ListSources(string type)
        {
            List<DocSource> list = new List<DocSource>();
            object r = Send("GET", "/handheld/sources?type=" + type, null, 30000, true);
            foreach (object s in Json.List(r, "data", "sources"))
            {
                DocSource d = new DocSource();
                d.Type = type;
                d.SourceId = Json.Str(s, "sourceId");
                d.Number = Json.Str(s, "number");
                d.Reference = Json.Str(s, "reference");
                d.Party = Json.Str(s, "party");
                DateTime at;
                if (DateTime.TryParse(Json.Str(s, "date"), null, System.Globalization.DateTimeStyles.RoundtripKind, out at)) d.Date = at;
                d.Lines = Json.Int(s, "lines") ?? 0;
                d.Quantity = Json.Int(s, "quantity") ?? 0;
                list.Add(d);
            }
            return list;
        }

        public List<Picker> ListPickers()
        {
            List<Picker> list = new List<Picker>();
            object r = Send("GET", "/handheld/pickers", null, 30000, true);
            foreach (object p in Json.List(r, "data", "pickers"))
            {
                Picker k = new Picker();
                k.Id = Json.Str(p, "id");
                k.Code = Json.Str(p, "code");
                k.Name = Json.Str(p, "name");
                list.Add(k);
            }
            return list;
        }

        public FetchedDoc CreateDocument(string type, string sourceId, string pickerId)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["type"] = type;
            body["sourceId"] = sourceId;
            body["pickerId"] = pickerId;
            return DocFromJson(Json.At(Send("POST", "/handheld/documents", body, 60000, true), "data", "document"));
        }

        public FetchedDoc GetDocument(string id)
        {
            return DocFromJson(Json.At(Send("GET", "/handheld/documents/" + id, null, 60000, true), "data", "document"));
        }

        public void UploadDocument(string id, Dictionary<string, object> body)
        {
            Send("POST", "/handheld/documents/" + id + "/upload", body, 300000, true);
        }

        public void CancelDocument(string id, string remark)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["remark"] = remark;
            Send("PATCH", "/handheld/documents/" + id + "/cancel", body, 30000, true);
        }

        /// <summary>The server's document as the device file; lines the device recorded as extras are left out.</summary>
        public static FetchedDoc DocFromJson(object d)
        {
            if (d == null) throw new LinkException("The server returned no document");
            FetchedDoc f = new FetchedDoc();
            HandheldDoc doc = new HandheldDoc();
            doc.DocumentId = Json.Str(d, "id");
            doc.DocumentNumber = Json.Str(d, "documentNumber");
            doc.Type = Json.Str(d, "type");
            doc.Branch = Json.Str(d, "branch", "name");
            doc.Picker = Json.Str(d, "pickerName");
            if (doc.Type == DocTypes.IndentPick)
            {
                doc.Reference = Json.Str(d, "pickingList", "indent", "indentNumber");
                doc.Party = Json.Str(d, "pickingList", "indent", "requestingBranch", "name");
            }
            else if (doc.Type == DocTypes.CpoPick)
            {
                doc.Reference = Json.Str(d, "customerOrder", "cpoNumber");
                string company = Json.Str(d, "customerOrder", "customer", "companyName");
                doc.Party = company.Length > 0 ? company
                          : (Json.Str(d, "customerOrder", "customer", "firstName") + " " + Json.Str(d, "customerOrder", "customer", "lastName")).Trim();
            }
            else
            {
                doc.Reference = Json.Str(d, "mit", "mitNumber");
                string inv = Json.Str(d, "mit", "invoiceNumber");
                doc.Party = (Json.Str(d, "mit", "vendor") + (inv.Length > 0 ? " inv " + inv : "")).Trim();
            }
            foreach (object l in Json.List(d, "lines"))
            {
                if (Json.Bool(l, "extra")) continue;
                DocLine line = new DocLine();
                line.Id = Json.Str(l, "id");
                line.Number = Json.Int(l, "lineNumber") ?? 0;
                line.Bin = Json.Str(l, "binLocation");
                line.PartNumber = Json.Str(l, "partNumber");
                string name = Json.Str(l, "partName");
                line.Description = name.Length > 0 ? name : line.PartNumber;
                line.Case = Json.Str(l, "caseNumber");
                line.Expected = Json.Int(l, "expectedQuantity") ?? 0;
                doc.Lines.Add(line);
            }
            f.Doc = doc;
            f.Status = Json.Str(d, "status");
            f.CancelRemark = Json.Str(d, "cancelRemark");
            return f;
        }
    }

    /// <summary>A handheld document found on the device.</summary>
    public sealed class DeviceDoc
    {
        public string Stem = "";
        public HandheldDoc Doc;
        public PickState State = new PickState();
        public string Error = "";

        public bool Finished { get { return State.Finished; } }

        public string Describe()
        {
            if (Error.Length > 0) return Stem + ": " + Error;
            return DocTypes.Short(Doc.Type) + " " + Doc.Reference + " (" + Doc.DocumentNumber + ", " +
                   (State.Finished ? "finished" : State.Lines.Count == 0 && State.Extras.Count == 0 ? "not started" : "in progress") + ")";
        }
    }

    /// <summary>The handheld documents on the device (next to the count sheets).</summary>
    public sealed class DeviceDocs
    {
        readonly IDeviceStorage dev;
        readonly string root;

        public DeviceDocs(IDeviceStorage dev)
        {
            this.dev = dev;
            this.root = DeviceLayout.ResolveRoot(delegate(string p) { return dev.DirectoryExists(p); });
        }

        public List<DeviceDoc> List()
        {
            List<DeviceDoc> found = new List<DeviceDoc>();
            List<string> names = dev.ListFiles(DeviceLayout.SheetsDir(root));
            names.Sort(StringComparer.OrdinalIgnoreCase);
            foreach (string name in names)
                if (name.EndsWith(DeviceLayout.DocExtension, StringComparison.OrdinalIgnoreCase))
                    found.Add(Read(name.Substring(0, name.Length - DeviceLayout.DocExtension.Length)));
            return found;
        }

        public DeviceDoc Read(string stem)
        {
            DeviceDoc d = new DeviceDoc();
            d.Stem = stem;
            try
            {
                d.Doc = HandheldDoc.Parse(Utf8(dev.ReadFile(DeviceLayout.DocPath(root, stem))));
                string log = DeviceLayout.PicksPath(root, stem);
                if (dev.FileExists(log)) d.State = PickLog.Replay(Utf8(dev.ReadFile(log)).Split('\n'));
            }
            catch (SheetFormatException e) { d.Error = e.Message; }
            return d;
        }

        /// <summary>Put a document on the device and read it back. A copy that already has results is never overwritten.</summary>
        public void Write(HandheldDoc doc)
        {
            string stem = doc.FileStem;
            if (dev.FileExists(DeviceLayout.DocPath(root, stem)))
            {
                DeviceDoc existing = Read(stem);
                if (existing.State.Lines.Count > 0 || existing.State.Extras.Count > 0 || existing.State.Finished)
                    throw new LinkException("Document " + doc.DocumentNumber + " is already on the device with results. Receive it first; it was not replaced.");
                dev.DeleteFile(DeviceLayout.PicksPath(root, stem));
            }
            dev.WriteFile(DeviceLayout.DocPath(root, stem), new UTF8Encoding(false).GetBytes(doc.Serialize()));
            DeviceDoc check = Read(stem);
            if (check.Error.Length > 0 || check.Doc.Lines.Count != doc.Lines.Count)
                throw new LinkException("The document did not arrive complete on the device (" + (check.Error.Length > 0 ? check.Error : "line count differs") + ").");
        }

        public void Clear(string stem)
        {
            dev.DeleteFile(DeviceLayout.PicksPath(root, stem));
            dev.DeleteFile(DeviceLayout.DocPath(root, stem));
        }

        static string Utf8(byte[] b)
        {
            return new UTF8Encoding(false).GetString(b);
        }
    }

    /// <summary>What the store manager checks before a document's result is uploaded.</summary>
    public sealed class DocSummary
    {
        public bool Picking;
        public int Lines, LinesTouched, Expected, Quantity, Damaged, Unchecked;
        public List<string> Short = new List<string>();
        public List<string> Substitutes = new List<string>();
        public List<string> Extras = new List<string>();

        public static DocSummary Build(HandheldDoc doc, PickState state)
        {
            DocSummary s = new DocSummary();
            s.Picking = doc.Picking;
            s.Lines = doc.Lines.Count;
            foreach (DocLine l in doc.Lines)
            {
                s.Expected += l.Expected;
                LineResult r = state.Result(l.Id);
                if (r == null) { s.Unchecked++; if (s.Picking && l.Expected > 0) s.Short.Add(l.PartNumber + " 0 of " + l.Expected + " (not picked)"); continue; }
                s.LinesTouched++;
                s.Quantity += r.Quantity;
                s.Damaged += r.Damaged;
                if (s.Picking && r.Quantity < l.Expected)
                    s.Short.Add(l.PartNumber + " " + r.Quantity + " of " + l.Expected + (r.Reason.Length > 0 ? " (" + ShortReasons.Label(r.Reason) + ")" : ""));
                if (!s.Picking && r.Quantity + r.Damaged < l.Expected)
                    s.Short.Add(l.PartNumber + " case " + l.Case + ": " + r.Quantity + (r.Damaged > 0 ? " + " + r.Damaged + " damaged" : "") + " of " + l.Expected);
                if (r.Scanned.Length > 0) s.Substitutes.Add(l.PartNumber + " -> " + r.Scanned);
            }
            foreach (ExtraPart e in state.Extras) s.Extras.Add(e.PartNumber + " x" + e.Quantity + (e.Damaged > 0 ? " + " + e.Damaged + " damaged" : ""));
            return s;
        }

        public string Describe()
        {
            StringBuilder b = new StringBuilder();
            b.AppendLine("Lines:                  " + Lines + (Unchecked > 0 ? " (" + Unchecked + " not " + (Picking ? "picked" : "checked") + ")" : ""));
            b.AppendLine((Picking ? "Picked:                 " : "Received good:          ") + Quantity + " of " + Expected);
            if (!Picking) b.AppendLine("Damaged:                " + Damaged);
            b.AppendLine((Picking ? "Short:                  " : "Short or not checked:   ") + Short.Count);
            foreach (string x in Short.GetRange(0, Math.Min(Short.Count, 8))) b.AppendLine("   " + x);
            if (Substitutes.Count > 0) b.AppendLine("Found instead (for the store): " + string.Join(", ", Substitutes.ToArray()));
            if (Extras.Count > 0) b.AppendLine("Not on the MIT (not posted):   " + string.Join(", ", Extras.ToArray()));
            return b.ToString().TrimEnd();
        }
    }

    public static class DocUploadBuilder
    {
        /// <summary>The upload body: one entry per line the picker touched, the MIT's extra parts, and the reason for untouched picking lines.</summary>
        public static Dictionary<string, object> Build(HandheldDoc doc, PickState state)
        {
            List<Dictionary<string, object>> lines = new List<Dictionary<string, object>>();
            foreach (DocLine l in doc.Lines)
            {
                LineResult r = state.Result(l.Id);
                if (r == null) continue;
                Dictionary<string, object> row = new Dictionary<string, object>();
                row["lineId"] = l.Id;
                row["quantity"] = r.Quantity;
                if (!doc.Picking && r.Damaged > 0) row["damagedQuantity"] = r.Damaged;
                if (r.Reason.Length > 0 && (doc.Picking ? r.Quantity < l.Expected : true)) row["shortReason"] = r.Reason;
                if (r.Scanned.Length > 0) row["scannedPartNumber"] = r.Scanned;
                if (r.Note.Length > 0) row["note"] = r.Note;
                lines.Add(row);
            }
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["lines"] = lines;
            if (!doc.Picking)
            {
                List<Dictionary<string, object>> extras = new List<Dictionary<string, object>>();
                foreach (ExtraPart e in state.Extras)
                {
                    Dictionary<string, object> x = new Dictionary<string, object>();
                    x["partNumber"] = e.PartNumber;
                    x["quantity"] = e.Quantity;
                    if (e.Damaged > 0) x["damagedQuantity"] = e.Damaged;
                    if (e.Note.Length > 0) x["note"] = e.Note;
                    extras.Add(x);
                }
                body["extras"] = extras;
            }
            else body["unreportedReason"] = "NOT_FOUND";
            return body;
        }
    }

    /// <summary>Send a picking list, CPO or MIT to the handheld, and take its finished result back to the server exactly once.</summary>
    public sealed class DocLinkService
    {
        readonly IHandheldApi api;
        readonly IDeviceStorage device;
        readonly UploadLedger ledger;
        readonly Clock clock;

        public DocLinkService(IHandheldApi api, IDeviceStorage device, UploadLedger ledger, Clock clock)
        {
            this.api = api;
            this.device = device;
            this.ledger = ledger;
            this.clock = clock;
        }

        /// <summary>Creates the document on the server and writes it to the device. If the device write fails the server copy is cancelled again.</summary>
        public HandheldDoc Send(DocSource source, Picker picker)
        {
            if (picker == null || picker.Id.Length == 0) throw new LinkException("Choose the picker.");
            device.Connect(); // before the server marks it as on a handheld
            FetchedDoc f = api.CreateDocument(source.Type, source.SourceId, picker.Id);
            f.Doc.SentAtUtc = clock().ToUniversalTime();
            try
            {
                new DeviceDocs(device).Write(f.Doc);
            }
            catch (Exception e)
            {
                try { api.CancelDocument(f.Doc.DocumentId, "Could not be written to the handheld: " + e.Message); }
                catch (LinkException) { } // the store can cancel it on the web
                throw;
            }
            return f.Doc;
        }

        public DocSummary Check(DeviceDoc d)
        {
            Require(d);
            return DocSummary.Build(d.Doc, d.State);
        }

        void Require(DeviceDoc d)
        {
            if (d.Error.Length > 0) throw new LinkException("Document " + d.Stem + " on the device cannot be read: " + d.Error);
            if (!d.Finished)
                throw new LinkException(DocTypes.Short(d.Doc.Type) + " " + d.Doc.Reference + " is not finished. Ask the picker to open it on the handheld and press F4 (Finish).");
        }

        public ReceiveResult Receive(DeviceDoc d)
        {
            Require(d);
            HandheldDoc doc = d.Doc;
            DocSummary summary = DocSummary.Build(doc, d.State);
            ReceiveResult result = new ReceiveResult();
            LedgerRecord last = ledger.Last(doc.DocumentId);
            if (last != null && last.State == UploadState.Uploaded) throw new AlreadyUploadedException(doc.DocumentNumber, last.AtUtc);

            FetchedDoc server = api.GetDocument(doc.DocumentId);
            if (server.Status == "UPLOADED")
            {
                if (last != null && last.State == UploadState.Uploading)
                {
                    ledger.Add(clock().ToUniversalTime(), doc.DocumentId, doc.DocumentNumber, UploadState.Uploaded, summary.LinesTouched, summary.Quantity, api.UserName, "found uploaded by an earlier attempt");
                    result.Uploaded = true;
                    result.WasAlreadyUploaded = true;
                    TryClear(d, result);
                    return result;
                }
                throw new LinkException("Document " + doc.DocumentNumber + " was already uploaded to the server (not from this PC). It was not sent again.");
            }
            if (server.Status == "CANCELLED")
                throw new DocCancelledException(doc.DocumentNumber, server.CancelRemark);

            Dictionary<string, object> body = DocUploadBuilder.Build(doc, d.State);
            ledger.Add(clock().ToUniversalTime(), doc.DocumentId, doc.DocumentNumber, UploadState.Uploading, summary.LinesTouched, summary.Quantity, api.UserName, doc.Type);
            try
            {
                api.UploadDocument(doc.DocumentId, body);
            }
            catch (ApiException e)
            {
                if (e.StatusCode >= 500) throw;
                ledger.Add(clock().ToUniversalTime(), doc.DocumentId, doc.DocumentNumber, UploadState.Failed, summary.LinesTouched, summary.Quantity, api.UserName, e.Message);
                throw;
            }
            ledger.Add(clock().ToUniversalTime(), doc.DocumentId, doc.DocumentNumber, UploadState.Uploaded, summary.LinesTouched, summary.Quantity, api.UserName, doc.Type);
            result.Uploaded = true;
            TryClear(d, result);
            return result;
        }

        /// <summary>Remove a document from the device that was uploaded from this PC or cancelled on the server.</summary>
        public void ClearDone(DeviceDoc d)
        {
            if (d.Doc == null) { new DeviceDocs(device).Clear(d.Stem); return; }
            if (ledger.StateOf(d.Doc.DocumentId) != UploadState.Uploaded && api.GetDocument(d.Doc.DocumentId).Status != "CANCELLED")
                throw new LinkException("That document has not been uploaded from this PC nor cancelled, so it is not removed from the device.");
            new DeviceDocs(device).Clear(d.Stem);
        }

        void TryClear(DeviceDoc d, ReceiveResult result)
        {
            try { new DeviceDocs(device).Clear(d.Stem); result.Cleared = true; }
            catch (LinkException e) { result.ClearProblem = e.Message; }
        }
    }

    public sealed class DocCancelledException : LinkException
    {
        public DocCancelledException(string number, string remark)
            : base("Document " + number + " was cancelled on the server" + (remark.Length > 0 ? " (" + remark + ")" : "") +
                   ". Its result cannot be uploaded. Remove it from the handheld; send the job again if it still needs doing.") { }
    }
}
