using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32;
using Danamotors.Hhdc.Link;

namespace Danamotors.Hhdc.Setup
{
    /// <summary>
    /// Where things are. The kit folder holds the setup, setup.ini (server=...) and payload\ (the programs and WMDC).
    /// Programs go to Program Files for every user; the server, the key (DPAPI) and the sign-in start stay per Windows
    /// user, as HHDC Link has always kept them (RAPI needs the user's session).
    /// </summary>
    public static class Kit
    {
        public const string RunValue = "Danamotors HHDC station";
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        public static readonly string[] Programs = { "HhdcLink.exe", DeviceLayout.AppFileName };
        static readonly Regex KeyPattern = new Regex(@"^[^.\s]+\.[^.\s]+$");

        public static string Dir { get { return AppDomain.CurrentDomain.BaseDirectory; } }
        public static string Payload { get { return Path.Combine(Dir, "payload"); } }
        public static string WmdcPayload { get { return Path.Combine(Payload, "wmdc"); } }

        public static string InstallDir
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Danamotors\HHDC Link"); }
        }

        public static string StationExe { get { return Path.Combine(InstallDir, "HhdcLink.exe"); } }

        /// <summary>The per-user copy the first installer used (2026-11-18); moved to Program Files.</summary>
        public static string OldUserInstall
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Danamotors\HHDC Link\app"); }
        }

        public static string Ini(string key)
        {
            string file = Path.Combine(Dir, "setup.ini");
            if (!File.Exists(file)) return "";
            foreach (string line in File.ReadAllLines(file))
            {
                int eq = line.IndexOf('=');
                if (eq > 0 && line.Substring(0, eq).Trim().Equals(key, StringComparison.OrdinalIgnoreCase)) return line.Substring(eq + 1).Trim();
            }
            return "";
        }

        public static string BuildLabel()
        {
            string file = Path.Combine(Dir, "BUILD.txt");
            return File.Exists(file) ? File.ReadAllText(file).Trim() : "";
        }

        public static bool LooksLikeKey(string text)
        {
            return text != null && KeyPattern.IsMatch(text.Trim());
        }

        /// <summary>"https://host" and "https://host/api/" both become "https://host/api".</summary>
        public static string NormalizeServer(string url)
        {
            string s = (url ?? "").Trim().TrimEnd('/');
            if (s.Length == 0) return "";
            if (!s.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && !s.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) s = "https://" + s;
            if (!s.EndsWith("/api", StringComparison.OrdinalIgnoreCase)) s += "/api";
            return s;
        }

        /// <summary>True when Program Files already holds exactly the kit's programs.</summary>
        public static bool ProgramsCurrent()
        {
            foreach (string f in Programs)
            {
                string target = Path.Combine(InstallDir, f), source = Path.Combine(Payload, f);
                if (!File.Exists(target) || Hash(target) != Hash(source)) return false;
            }
            return true;
        }

        public static string Hash(string file)
        {
            using (SHA256 sha = SHA256.Create())
            using (FileStream s = File.OpenRead(file))
                return Convert.ToBase64String(sha.ComputeHash(s));
        }

        public static void SetAutostart()
        {
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(RunKey))
                k.SetValue(RunValue, "\"" + StationExe + "\" --station");
        }

        /// <summary>Stops HHDC Link in every session this process may stop (all of them when elevated).</summary>
        public static int StopStations()
        {
            int stopped = 0;
            foreach (string name in new string[] { "HhdcLink", "HhdcLinkCli" })
            {
                foreach (Process p in Process.GetProcessesByName(name))
                {
                    try { p.Kill(); p.WaitForExit(5000); stopped++; }
                    catch (Exception) { }
                    finally { p.Dispose(); }
                }
            }
            return stopped;
        }

        public static bool NetFramework48()
        {
            using (RegistryKey k = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full"))
            {
                object v = k == null ? null : k.GetValue("Release");
                return v is int && (int)v >= 528040;
            }
        }
    }
}
