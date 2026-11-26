using System;

namespace Danamotors.Hhdc.Device
{
    /// <summary>
    /// Decides when a scan has ended. DataWedge types a scan as keystrokes and may or may not add Enter
    /// (unproven on the device), so Enter and Tab always end a scan, and so does a burst of fast
    /// characters followed by a short pause. A person never types this fast, so typed text only ends
    /// on Enter. Times are milliseconds from Environment.TickCount, passed in so this can be tested.
    /// </summary>
    public sealed class ScanDetector
    {
        /// <summary>Largest gap between two characters of one scan.</summary>
        public int MaxGapMs = 90;
        /// <summary>Fewest characters that count as a scan.</summary>
        public int MinChars = 3;
        /// <summary>Silence after the last character that ends the scan.</summary>
        public int PauseMs = 250;

        int run;
        int last;
        bool fired;

        public void Reset()
        {
            run = 0;
            fired = false;
        }

        /// <summary>A character arrived.</summary>
        public void Key(int nowMs)
        {
            if (run == 0 || unchecked(nowMs - last) > MaxGapMs) run = 1; else run++;
            last = nowMs;
            fired = false;
        }

        /// <summary>Call often (a timer). True once, when a scan has just ended.</summary>
        public bool Poll(int nowMs)
        {
            if (fired || run < MinChars || unchecked(nowMs - last) < PauseMs) return false;
            fired = true;
            return true;
        }
    }
}
