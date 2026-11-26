using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;

namespace Danamotors.Hhdc.Link
{
    public sealed class ApiException : LinkException
    {
        public readonly int StatusCode;
        public ApiException(int statusCode, string message) : base(message) { StatusCode = statusCode; }
        public bool Unauthorized { get { return StatusCode == 401; } }
    }

    /// <summary>An issued sheet that has not been uploaded, with the stock taking it belongs to.</summary>
    public sealed class WorkItem
    {
        public string StockTakeId = "";
        public string BatchNumber = "";
        public string StockTakeType = "";
        public string BranchId = "";
        public string BranchName = "";
        public string SheetId = "";
        public string SheetNumber = "";
        public string Checker = "";
        public string Criteria = "";
        public int LineCount;
        public bool ShowSystemStock;
    }

    public sealed class FetchedSheet
    {
        public CountSheet Sheet;
        /// <summary>The sheet was uploaded, or cancelled, or the stock taking is closed: it can no longer take counts.</summary>
        public bool Closed;
        public string ClosedReason = "";
        public bool Uploaded;
    }

    /// <summary>What HHDC Link needs from the Danamotors server. The real one is ApiClient; tests use a fake.</summary>
    public interface IStockTakeApi
    {
        string UserName { get; }
        List<WorkItem> ListOpenSheets(bool allBranches);
        FetchedSheet GetSheet(string stockTakeId, string sheetId, DateTime nowUtc);
        void Upload(string stockTakeId, string sheetId, string uncounted, List<Dictionary<string, object>> entries);
    }

    public sealed partial class ApiClient : IStockTakeApi
    {
        readonly string baseUrl;
        string token = "";
        // Station mode: the PC's own key ("<stationId>.<secret>") instead of a user's sign-in.
        string stationKey = "";
        string userName = "";
        string branchId = "";

        public ApiClient(string serverUrl)
        {
            baseUrl = NormalizeUrl(serverUrl);
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
        }

        /// <summary>A client for the station endpoints, authenticated by the station key issued on the web.</summary>
        public static ApiClient ForStation(string serverUrl, string key)
        {
            ApiClient c = new ApiClient(serverUrl);
            c.stationKey = (key ?? "").Trim();
            if (c.stationKey.Length == 0) throw new LinkException("This PC has no station key. Register it on the web (Settings > HHDC) and enter the key in HHDC Link.");
            c.userName = "station";
            return c;
        }

        public string UserName { get { return userName; } }
        public string BranchId { get { return branchId; } }
        public string BaseUrl { get { return baseUrl; } }

        /// <summary>"localhost:8000" or "https://host/api/" both become the API root, e.g. http://localhost:8000/api.</summary>
        public static string NormalizeUrl(string url)
        {
            string u = (url ?? "").Trim().TrimEnd('/');
            if (u.Length == 0) throw new LinkException("Enter the server address");
            if (!u.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && !u.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                u = "http://" + u;
            if (!u.EndsWith("/api", StringComparison.OrdinalIgnoreCase)) u += "/api";
            return u;
        }

        public void Login(string email, string password)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["email"] = (email ?? "").Trim();
            body["password"] = password ?? "";
            object r = Send("POST", "/auth/login", body, 30000, false);
            token = Json.Str(r, "data", "accessToken");
            if (token.Length == 0) throw new LinkException("The server did not return a sign-in token. Is this a staff account?");
            userName = (Json.Str(r, "data", "user", "firstName") + " " + Json.Str(r, "data", "user", "lastName")).Trim();
            if (userName.Length == 0) userName = Json.Str(r, "data", "user", "email");
            branchId = Json.Str(r, "data", "user", "branchId");
        }

        public List<WorkItem> ListOpenSheets(bool allBranches)
        {
            List<WorkItem> items = new List<WorkItem>();
            foreach (string kind in new string[] { "COUNT", "AUDIT" })
            {
                object list;
                try { list = Send("GET", "/stock-takes?status=ACTIVE&kind=" + kind, null, 30000, true); }
                catch (ApiException e)
                {
                    // Not allowed to see stock audits (stockaudit:read) is normal for a storekeeper.
                    if (e.StatusCode == 403 && kind == "AUDIT") continue;
                    throw;
                }
                foreach (object take in Json.List(list, "data", "stockTakes"))
                {
                    string takeBranch = Json.Str(take, "branch", "id");
                    if (!allBranches && branchId.Length > 0 && takeBranch != branchId) continue;
                    object detail = Send("GET", "/stock-takes/" + Json.Str(take, "id"), null, 30000, true);
                    foreach (object s in Json.List(detail, "data", "stockTake", "sheets"))
                    {
                        if (Json.At(s, "uploadedAt") != null || Json.At(s, "cancelledAt") != null) continue;
                        WorkItem w = new WorkItem();
                        w.StockTakeId = Json.Str(take, "id");
                        w.BatchNumber = Json.Str(take, "batchNumber");
                        w.StockTakeType = Json.Str(take, "type");
                        w.BranchId = takeBranch;
                        w.BranchName = Json.Str(take, "branch", "name");
                        w.SheetId = Json.Str(s, "id");
                        w.SheetNumber = Json.Str(s, "sheetNumber");
                        w.Checker = (Json.Str(s, "checker", "firstName") + " " + Json.Str(s, "checker", "lastName")).Trim();
                        w.Criteria = Json.Str(s, "criteria");
                        w.LineCount = Json.Int(s, "lineCount") ?? 0;
                        w.ShowSystemStock = Json.Bool(s, "showSystemStock");
                        items.Add(w);
                    }
                }
            }
            return items;
        }

        public FetchedSheet GetSheet(string stockTakeId, string sheetId, DateTime nowUtc)
        {
            object r = Send("GET", "/stock-takes/" + stockTakeId + "/sheets/" + sheetId, null, 120000, true);
            return SheetFromJson(Json.At(r, "data", "sheet"), stockTakeId, nowUtc);
        }

        /// <summary>The server's sheet (as GET /stock-takes/:id/sheets/:sheetId returns it) as the device file.</summary>
        public static FetchedSheet SheetFromJson(object s, string stockTakeId, DateTime nowUtc)
        {
            if (s == null) throw new LinkException("The server returned no sheet");

            FetchedSheet f = new FetchedSheet();
            CountSheet c = new CountSheet();
            c.StockTakeId = stockTakeId.Length > 0 ? stockTakeId : Json.Str(s, "stockTake", "id");
            c.SheetId = Json.Str(s, "id");
            c.SheetNumber = Json.Str(s, "sheetNumber");
            c.BatchNumber = Json.Str(s, "stockTake", "batchNumber");
            c.Branch = Json.Str(s, "stockTake", "branch", "name");
            c.Checker = (Json.Str(s, "checker", "firstName") + " " + Json.Str(s, "checker", "lastName")).Trim();
            c.Criteria = Json.Str(s, "criteria");
            c.ShowSystemStock = Json.Bool(s, "showSystemStock");
            c.SentAtUtc = nowUtc;
            foreach (object l in Json.List(s, "lines"))
            {
                SheetLine line = new SheetLine();
                line.PartNumber = Json.Str(l, "partNumber");
                if (line.PartNumber.Length == 0) continue;
                line.Bin = Json.Str(l, "binLocation");
                string name = Json.Str(l, "part", "name");
                line.Description = name.Length > 0 ? name : line.PartNumber;
                // The server sends system stock whatever the sheet allows; the device only gets it when permitted.
                if (c.ShowSystemStock) line.SystemStock = Json.Int(l, "systemStock");
                c.Lines.Add(line);
            }
            f.Sheet = c;
            f.Uploaded = Json.At(s, "uploadedAt") != null;
            string takeStatus = Json.Str(s, "stockTake", "status");
            if (f.Uploaded) { f.Closed = true; f.ClosedReason = "was already uploaded"; }
            else if (Json.At(s, "cancelledAt") != null) { f.Closed = true; f.ClosedReason = "was cancelled"; }
            else if (takeStatus.Length > 0 && takeStatus != "ACTIVE") { f.Closed = true; f.ClosedReason = "belongs to a stock taking that is " + takeStatus.ToLowerInvariant(); }
            return f;
        }

        public void Upload(string stockTakeId, string sheetId, string uncounted, List<Dictionary<string, object>> entries)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["uncounted"] = uncounted;
            body["entries"] = entries;
            Send("POST", "/stock-takes/" + stockTakeId + "/sheets/" + sheetId + "/upload", body, 600000, true);
        }

        object Send(string method, string path, object body, int timeoutMs, bool auth)
        {
            HttpWebRequest req;
            try { req = (HttpWebRequest)WebRequest.Create(baseUrl + path); }
            catch (UriFormatException) { throw new LinkException("The server address is not valid: " + baseUrl); }
            req.Method = method;
            req.Timeout = timeoutMs;
            req.ReadWriteTimeout = timeoutMs;
            req.Accept = "application/json";
            req.UserAgent = "HHDC-Link";
            if (auth) req.Headers["Authorization"] = stationKey.Length > 0 ? "Station " + stationKey : "Bearer " + token;
            if (body != null)
            {
                byte[] bytes = new UTF8Encoding(false).GetBytes(Json.Write(body));
                req.ContentType = "application/json";
                req.ContentLength = bytes.Length;
                try { using (Stream s = req.GetRequestStream()) s.Write(bytes, 0, bytes.Length); }
                catch (WebException e) { throw Unreachable(e); }
            }
            try
            {
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                    return Read(resp);
            }
            catch (WebException e)
            {
                HttpWebResponse err = e.Response as HttpWebResponse;
                if (err == null) throw Unreachable(e);
                using (err)
                {
                    string message = ErrorMessage(Read(err), (int)err.StatusCode);
                    if (err.StatusCode == HttpStatusCode.Unauthorized && auth)
                        message = stationKey.Length > 0
                            ? "The server refused this station's key. Register the PC again on the web (Settings > HHDC) and enter the new key."
                            : "Your sign-in has expired. Sign in again.";
                    throw new ApiException((int)err.StatusCode, message);
                }
            }
        }

        static object Read(HttpWebResponse resp)
        {
            using (Stream s = resp.GetResponseStream())
            using (StreamReader r = new StreamReader(s, Encoding.UTF8))
            {
                string text = r.ReadToEnd();
                if (text.Trim().Length == 0) return null;
                try { return Json.Parse(text); }
                catch (ArgumentException) { return text; } // not JSON, e.g. a proxy's error page
            }
        }

        static string ErrorMessage(object body, int status)
        {
            string m = Json.Str(body, "message");
            if (m.Length > 0) return m;
            if (status == 403) return "You do not have permission to do this.";
            return "The server refused the request (HTTP " + status + ").";
        }

        LinkException Unreachable(WebException e)
        {
            return new LinkException("Cannot reach the server at " + baseUrl + ": " + e.Message + ". Check the address and the network.", e);
        }
    }
}
