using System;
using System.Collections.Generic;
using System.IO;
using Danamotors.Hhdc;
using Danamotors.Hhdc.Link;

/// <summary>
/// HHDC Link on a command line: the same logic as the window, for scripts and the end-to-end test.
///   HhdcLinkCli [options] list | device | send SHEET | receive SHEET ZERO|RELEASE | install EXE
///                         sources TYPE | senddoc TYPE NUMBER PICKERCODE | receivedoc NUMBER
/// TYPE is INDENT_PICK, CPO_PICK or MIT_RECEIVE; NUMBER is the indent, CPO or MIT number.
/// Options: --server URL  --email E  --password P (or HHDC_PASSWORD)  --folder DIR (stand-in device)
///          --data DIR (settings and upload record)  --all-branches
/// SHEET is a sheet number such as SHT-000012.
/// </summary>
public static class Cli
{
    public static int Main(string[] args)
    {
        Dictionary<string, string> opt = new Dictionary<string, string>();
        List<string> words = new List<string>();
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i].StartsWith("--"))
            {
                string key = args[i].Substring(2);
                opt[key] = key == "all-branches" ? "1" : (i + 1 < args.Length ? args[++i] : "");
            }
            else words.Add(args[i]);
        }
        if (words.Count == 0) { Console.Error.WriteLine("Commands: list | device | send SHEET | receive SHEET ZERO|RELEASE | install EXE | sources TYPE | senddoc TYPE NUMBER PICKERCODE | receivedoc NUMBER"); return 1; }

        try
        {
            string dataDir = opt.ContainsKey("data") ? opt["data"] : LinkSettings.DefaultDataDir();
            LinkSettings settings = LinkSettings.Load(dataDir);
            if (opt.ContainsKey("server")) settings.Server = opt["server"];
            if (opt.ContainsKey("folder")) settings.DeviceFolder = opt["folder"];
            Clock clock = delegate { return DateTime.UtcNow; };

            using (IDeviceStorage device = settings.OpenDevice())
            {
                string cmd = words[0].ToLowerInvariant();
                if (cmd == "device")
                {
                    device.Connect();
                    foreach (DeviceSheet d in new DeviceSheets(device).List()) Console.WriteLine(d.Describe());
                    foreach (DeviceDoc d in new DeviceDocs(device).List()) Console.WriteLine(d.Describe());
                    return 0;
                }
                if (cmd == "install")
                {
                    device.Connect();
                    Console.WriteLine(new DeviceSheets(device).InstallApp(File.ReadAllBytes(words[1])));
                    return 0;
                }

                ApiClient api = new ApiClient(settings.Server);
                string pw = opt.ContainsKey("password") ? opt["password"] : Environment.GetEnvironmentVariable("HHDC_PASSWORD");
                api.Login(opt.ContainsKey("email") ? opt["email"] : settings.Email, pw);
                bool all = opt.ContainsKey("all-branches");
                LinkService svc = new LinkService(api, device, new UploadLedger(Path.Combine(dataDir, "uploads.log")), clock);

                if (cmd == "list")
                {
                    foreach (WorkItem w in api.ListOpenSheets(all))
                        Console.WriteLine(w.SheetNumber + "\t" + w.BatchNumber + "\t" + w.StockTakeType + "\t" + w.BranchName + "\t" + w.Checker + "\t" + w.LineCount + " parts");
                    return 0;
                }
                if (cmd == "send")
                {
                    WorkItem w = Find(api.ListOpenSheets(all), words[1]);
                    svc.Send(w);
                    Console.WriteLine("Sent " + w.SheetNumber + " (" + w.LineCount + " parts) to " + device.Describe());
                    return 0;
                }
                if (cmd == "receive")
                {
                    device.Connect();
                    DeviceSheet d = Find(new DeviceSheets(device).List(), words[1]);
                    Console.WriteLine(svc.Check(d).Describe());
                    ReceiveResult r = svc.Receive(d, words.Count > 2 ? words[2].ToUpperInvariant() : "");
                    Console.WriteLine("Uploaded " + r.Summary.Entries + " entries" + (r.WasAlreadyUploaded ? " (the server already had them)" : "") +
                                      (r.Cleared ? "; removed from the device" : "; " + r.ClearProblem));
                    return 0;
                }
                DocLinkService docs = new DocLinkService(api, device, new UploadLedger(Path.Combine(dataDir, "uploads.log")), clock);
                if (cmd == "sources")
                {
                    foreach (DocSource s in api.ListSources(words[1].ToUpperInvariant()))
                        Console.WriteLine(s.Number + "\t" + s.Reference + "\t" + s.Party + "\t" + s.Lines + " lines\t" + s.Quantity + " pcs");
                    return 0;
                }
                if (cmd == "senddoc")
                {
                    DocSource source = null;
                    foreach (DocSource s in api.ListSources(words[1].ToUpperInvariant())) if (string.Equals(s.Number, words[2], StringComparison.OrdinalIgnoreCase)) source = s;
                    if (source == null) throw new LinkException("Nothing to send for " + words[2] + ".");
                    Picker picker = null;
                    foreach (Picker p in api.ListPickers()) if (string.Equals(p.Code, words[3], StringComparison.OrdinalIgnoreCase)) picker = p;
                    if (picker == null) throw new LinkException("No current employee with code " + words[3] + ".");
                    HandheldDoc doc = docs.Send(source, picker);
                    Console.WriteLine("Sent " + doc.Reference + " as document " + doc.DocumentNumber + " (" + doc.Lines.Count + " lines) for " + picker.Name);
                    return 0;
                }
                if (cmd == "receivedoc")
                {
                    device.Connect();
                    DeviceDoc found = null;
                    foreach (DeviceDoc d in new DeviceDocs(device).List()) if (d.Doc != null && string.Equals(d.Doc.Reference, words[1], StringComparison.OrdinalIgnoreCase)) found = d;
                    if (found == null) throw new LinkException(words[1] + " is not on the device.");
                    Console.WriteLine(docs.Check(found).Describe());
                    ReceiveResult r = docs.Receive(found);
                    Console.WriteLine("Uploaded" + (r.WasAlreadyUploaded ? " (the server already had it)" : "") + (r.Cleared ? "; removed from the device" : "; " + r.ClearProblem));
                    return 0;
                }
                Console.Error.WriteLine("Unknown command " + cmd);
                return 1;
            }
        }
        catch (LinkException e)
        {
            Console.Error.WriteLine(e.Message);
            return 2;
        }
    }

    static WorkItem Find(List<WorkItem> items, string number)
    {
        foreach (WorkItem w in items) if (string.Equals(w.SheetNumber, number, StringComparison.OrdinalIgnoreCase)) return w;
        throw new LinkException("No open sheet " + number + " for this user.");
    }

    static DeviceSheet Find(List<DeviceSheet> items, string number)
    {
        foreach (DeviceSheet d in items) if (d.Sheet != null && string.Equals(d.Sheet.SheetNumber, number, StringComparison.OrdinalIgnoreCase)) return d;
        throw new LinkException("Sheet " + number + " is not on the device.");
    }
}
