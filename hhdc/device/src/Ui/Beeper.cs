using System;
using System.IO;
using System.Runtime.InteropServices;

namespace Danamotors.Hhdc.Device
{
    /// <summary>
    /// The error sound. The legacy app played \windows\alarm3.wav; this device does not have that file, so the first
    /// of alarm3, critical and then the system beep is used. On a PC (tests) it is silent.
    /// </summary>
    public static class Beeper
    {
        const uint SND_ASYNC = 0x0001, SND_FILENAME = 0x00020000, MB_ICONHAND = 0x10;
        static readonly string[] Sounds = { "\\Windows\\alarm3.wav", "\\Windows\\critical.wav" };

        [DllImport("coredll.dll", EntryPoint = "PlaySound")]
        static extern bool PlaySound(string name, IntPtr module, uint flags);

        [DllImport("coredll.dll", EntryPoint = "MessageBeep")]
        static extern bool MessageBeep(uint type);

        static bool OnDevice { get { return Environment.OSVersion.Platform == PlatformID.WinCE; } }

        public static void Error()
        {
            if (!OnDevice) return;
            try
            {
                foreach (string s in Sounds)
                    if (File.Exists(s) && PlaySound(s, IntPtr.Zero, SND_FILENAME | SND_ASYNC)) return;
                MessageBeep(MB_ICONHAND);
            }
            catch (Exception) { } // no sound is never worth stopping a count for
        }
    }
}
