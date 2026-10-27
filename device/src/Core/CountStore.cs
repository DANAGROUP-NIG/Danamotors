using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace Danamotors.Hhdc.Device
{
    /// <summary>The .counts file of one sheet. Records are only ever appended, and each append is flushed and closed.</summary>
    public sealed class CountStore
    {
        readonly string path;

        public CountStore(string path)
        {
            this.path = path;
        }

        public string FilePath { get { return path; } }

        public CountState Load()
        {
            List<string> lines = new List<string>();
            if (File.Exists(path))
            {
                using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                using (StreamReader r = new StreamReader(fs, Encoding.UTF8))
                {
                    string line;
                    while ((line = r.ReadLine()) != null) lines.Add(line);
                }
            }
            return CountLog.Replay(lines);
        }

        /// <summary>
        /// Append one record. It starts with a line break, so a record cut off earlier by a battery pull
        /// cannot swallow this one. Throws IOException if it cannot be written; nothing is then recorded.
        /// </summary>
        public void Append(string record)
        {
            byte[] bytes = new UTF8Encoding(false).GetBytes("\n" + record + "\n");
            using (FileStream fs = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.Read))
            {
                fs.Write(bytes, 0, bytes.Length);
                fs.Flush();
            }
        }
    }
}
