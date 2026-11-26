using System;
using System.Collections;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace Danamotors.Hhdc.Link
{
    /// <summary>Just enough JSON for the Danamotors API: read nested values without casts everywhere.</summary>
    public static class Json
    {
        static JavaScriptSerializer Serializer()
        {
            JavaScriptSerializer s = new JavaScriptSerializer();
            s.MaxJsonLength = int.MaxValue;
            s.RecursionLimit = 64;
            return s;
        }

        public static object Parse(string text)
        {
            return Serializer().DeserializeObject(text);
        }

        public static string Write(object value)
        {
            return Serializer().Serialize(value);
        }

        /// <summary>Follow keys through nested objects; null if any step is missing.</summary>
        public static object At(object node, params string[] path)
        {
            foreach (string key in path)
            {
                IDictionary<string, object> d = node as IDictionary<string, object>;
                object next;
                if (d == null || !d.TryGetValue(key, out next)) return null;
                node = next;
            }
            return node;
        }

        public static string Str(object node, params string[] path)
        {
            object v = At(node, path);
            return v == null ? "" : Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture);
        }

        public static bool Bool(object node, params string[] path)
        {
            object v = At(node, path);
            return v is bool && (bool)v;
        }

        public static int? Int(object node, params string[] path)
        {
            object v = At(node, path);
            if (v == null) return null;
            try { return Convert.ToInt32(v, System.Globalization.CultureInfo.InvariantCulture); }
            catch (FormatException) { return null; }
        }

        public static List<object> List(object node, params string[] path)
        {
            List<object> items = new List<object>();
            IEnumerable e = At(node, path) as IEnumerable;
            if (e == null || e is string) return items;
            foreach (object o in e) items.Add(o);
            return items;
        }
    }
}
