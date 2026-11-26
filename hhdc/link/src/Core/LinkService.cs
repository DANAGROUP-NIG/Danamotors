using System;
using System.Collections.Generic;

namespace Danamotors.Hhdc.Link
{
    public sealed class ReceiveResult
    {
        public ReceiveSummary Summary;
        public bool Uploaded;
        /// <summary>The device copy was removed.</summary>
        public bool Cleared;
        /// <summary>Set if the upload went through but the device copy could not be removed.</summary>
        public string ClearProblem = "";
        /// <summary>The server already had this sheet's counts (an earlier attempt got through).</summary>
        public bool WasAlreadyUploaded;
    }

    /// <summary>Send a sheet to the device, and take a finished sheet back to the server exactly once.</summary>
    public sealed class LinkService
    {
        readonly IStockTakeApi api;
        readonly IDeviceStorage device;
        readonly UploadLedger ledger;
        readonly Clock clock;

        public LinkService(IStockTakeApi api, IDeviceStorage device, UploadLedger ledger, Clock clock)
        {
            this.api = api;
            this.device = device;
            this.ledger = ledger;
            this.clock = clock;
        }

        public void Send(WorkItem item)
        {
            UploadState st = ledger.StateOf(item.SheetId);
            if (st == UploadState.Uploaded)
                throw new LinkException("Sheet " + item.SheetNumber + " was already uploaded from this PC.");
            FetchedSheet f = api.GetSheet(item.StockTakeId, item.SheetId, clock().ToUniversalTime());
            if (f.Closed) throw new LinkException("Sheet " + item.SheetNumber + " " + f.ClosedReason + " and cannot be counted.");
            if (f.Sheet.Lines.Count == 0) throw new LinkException("Sheet " + item.SheetNumber + " has no parts.");
            device.Connect();
            new DeviceSheets(device).Send(f.Sheet, clock().ToUniversalTime());
        }

        /// <summary>The summary for the storekeeper's check, before choosing ZERO or RELEASE.</summary>
        public ReceiveSummary Check(DeviceSheet d)
        {
            Require(d);
            return ReceiveSummary.Build(d.Sheet, d.State);
        }

        void Require(DeviceSheet d)
        {
            if (d.Error.Length > 0) throw new LinkException("Sheet " + d.Stem + " on the device cannot be read: " + d.Error);
            if (!d.Finished)
                throw new LinkException("Sheet " + d.Sheet.SheetNumber + " is not finished. Ask the checker to open it on the device and choose Finish sheet (F4 on the review screen).");
        }

        /// <param name="uncounted">"ZERO" (parts nobody counted are none) or "RELEASE" (they go back for another sheet).</param>
        public ReceiveResult Receive(DeviceSheet d, string uncounted)
        {
            if (uncounted != "ZERO" && uncounted != "RELEASE") throw new LinkException("Choose what happens to uncounted parts: ZERO or RELEASE.");
            Require(d);
            CountSheet sheet = d.Sheet;
            ReceiveResult result = new ReceiveResult();
            result.Summary = ReceiveSummary.Build(sheet, d.State);

            LedgerRecord last = ledger.Last(sheet.SheetId);
            if (last != null && last.State == UploadState.Uploaded)
                throw new AlreadyUploadedException(sheet.SheetNumber, last.AtUtc);

            // What the server thinks now: also catches a sheet cancelled, or uploaded from the web screen.
            FetchedSheet server = api.GetSheet(sheet.StockTakeId, sheet.SheetId, clock().ToUniversalTime());
            if (server.Uploaded)
            {
                if (last != null && last.State == UploadState.Uploading)
                {
                    // An earlier attempt got through before the connection or program died.
                    ledger.Add(clock().ToUniversalTime(), sheet.SheetId, sheet.SheetNumber, UploadState.Uploaded, result.Summary.Entries, result.Summary.Quantity, api.UserName, "found uploaded by an earlier attempt");
                    result.Uploaded = true;
                    result.WasAlreadyUploaded = true;
                    TryClear(d, result);
                    return result;
                }
                throw new LinkException("Sheet " + sheet.SheetNumber + " was already uploaded to the server (not from this PC). Its counts were not sent again.");
            }
            if (server.Closed) throw new LinkException("Sheet " + sheet.SheetNumber + " " + server.ClosedReason + " on the server, so its counts cannot be uploaded.");

            DateTime now = clock().ToUniversalTime();
            List<Dictionary<string, object>> entries = UploadBuilder.Build(sheet, d.State, now);
            ledger.Add(now, sheet.SheetId, sheet.SheetNumber, UploadState.Uploading, result.Summary.Entries, result.Summary.Quantity, api.UserName, uncounted);
            try
            {
                api.Upload(sheet.StockTakeId, sheet.SheetId, uncounted, entries);
            }
            catch (ApiException e)
            {
                // A 5xx may or may not have been applied, so it stays "Uploading" and the next attempt asks the server.
                if (e.StatusCode >= 500) throw;
                // The server refused the request (4xx): nothing was recorded, so the sheet may be tried again.
                ledger.Add(clock().ToUniversalTime(), sheet.SheetId, sheet.SheetNumber, UploadState.Failed, result.Summary.Entries, result.Summary.Quantity, api.UserName, e.Message);
                throw;
            }
            // Any other failure (network drop) leaves "Uploading": the next attempt asks the server first.
            ledger.Add(clock().ToUniversalTime(), sheet.SheetId, sheet.SheetNumber, UploadState.Uploaded, result.Summary.Entries, result.Summary.Quantity, api.UserName, uncounted);
            result.Uploaded = true;
            TryClear(d, result);
            return result;
        }

        /// <summary>Remove from the device a sheet this PC already uploaded (e.g. the device was unplugged before it was cleared).</summary>
        public void ClearUploaded(DeviceSheet d)
        {
            if (d.Sheet == null || ledger.StateOf(d.Sheet.SheetId) != UploadState.Uploaded)
                throw new LinkException("That sheet has not been uploaded from this PC, so it is not removed from the device.");
            new DeviceSheets(device).Clear(d.Stem);
        }

        void TryClear(DeviceSheet d, ReceiveResult result)
        {
            try
            {
                new DeviceSheets(device).Clear(d.Stem);
                result.Cleared = true;
            }
            catch (LinkException e)
            {
                result.ClearProblem = e.Message;
            }
        }
    }

    public sealed class AlreadyUploadedException : LinkException
    {
        public readonly DateTime AtUtc;
        public AlreadyUploadedException(string sheetNumber, DateTime atUtc)
            : base("Sheet " + sheetNumber + " was already uploaded from this PC on " + atUtc.ToLocalTime().ToString("dd MMM yyyy HH:mm") +
                   ". It is not uploaded again: the server would add the counts a second time.")
        {
            AtUtc = atUtc;
        }
    }
}
