using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

namespace Danamotors.Hhdc.Device
{
    /// <summary>
    /// The look of Kia Motors Handheld: Kia midnight and white like the web dashboard, with green, amber and red kept
    /// for state (done, in progress, problem). One place so every screen and dialog matches.
    /// </summary>
    public static class Theme
    {
        public const string AppName = "Kia Motors Handheld";
        public const string ShortName = "KMHH";

        /// <summary>The device's client area under the title bar (and the size the forms take on a PC).</summary>
        public const int Width = 318, Height = 269;
        public const int HeaderHeight = 24, KeyBarHeight = 24;
        /// <summary>The space between the header and the key bar.</summary>
        public const int BodyTop = HeaderHeight, BodyHeight = Height - HeaderHeight - KeyBarHeight;

        public static readonly Color Midnight = Color.FromArgb(5, 20, 31);      // Kia midnight black, the dashboard's primary
        public static readonly Color Ink = Color.FromArgb(5, 20, 31);
        public static readonly Color Muted = Color.FromArgb(96, 106, 116);
        public static readonly Color Line = Color.FromArgb(206, 212, 218);
        public static readonly Color Paper = Color.White;
        public static readonly Color Shade = Color.FromArgb(240, 242, 245);      // info boxes, key bar
        public static readonly Color HeaderSub = Color.FromArgb(170, 184, 196);  // secondary text on midnight

        public static readonly Color Good = Color.FromArgb(0, 118, 58);
        public static readonly Color GoodBack = Color.FromArgb(222, 242, 229);
        public static readonly Color Warn = Color.FromArgb(196, 16, 40);
        public static readonly Color WarnBack = Color.FromArgb(253, 226, 230);
        public static readonly Color Busy = Color.FromArgb(150, 86, 0);
        public static readonly Color BusyBack = Color.FromArgb(255, 239, 210);
        public static readonly Color Info = Color.FromArgb(0, 82, 160);
        public static readonly Color InfoBack = Color.FromArgb(224, 236, 250);

        public static Font Bold(float size) { return new Font(FontFamily.GenericSansSerif, size, FontStyle.Bold); }
        public static Font Plain(float size) { return new Font(FontFamily.GenericSansSerif, size, FontStyle.Regular); }

        /// <summary>The background that goes with a text colour, for banners and badges.</summary>
        public static Color BackFor(Color fore)
        {
            if (fore == Good) return GoodBack;
            if (fore == Warn) return WarnBack;
            if (fore == Busy) return BusyBack;
            if (fore == Info) return InfoBack;
            return Shade;
        }

        static Bitmap logo;
        static bool logoTried;

        /// <summary>The Kia wordmark, white on midnight (embedded; null if it cannot be read).</summary>
        public static Bitmap Logo
        {
            get
            {
                if (logoTried) return logo;
                logoTried = true;
                try
                {
                    Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("Kia.Logo.png");
                    if (s != null) logo = new Bitmap(s);
                }
                catch (Exception) { logo = null; } // the app works without its logo
                return logo;
            }
        }

        /// <summary>Text cut with "..." to fit a width.</summary>
        public static string Fit(Graphics g, string text, Font font, int width)
        {
            if (text == null) return "";
            if (width <= 0) return "";
            if (g.MeasureString(text, font).Width <= width) return text;
            int n = text.Length;
            while (n > 0 && g.MeasureString(text.Substring(0, n) + "...", font).Width > width) n--;
            return text.Substring(0, n) + "...";
        }

        /// <summary>A form sized and coloured for the device; on a PC it shows the device's client area.</summary>
        public static void SetUp(Form f, string title)
        {
            f.Text = title;
            f.MinimizeBox = false;
            f.MaximizeBox = false;
            f.KeyPreview = true;
            f.BackColor = Paper;
            if (Environment.OSVersion.Platform != PlatformID.WinCE)
            {
                f.FormBorderStyle = FormBorderStyle.FixedSingle;
                f.ClientSize = new Size(Width, Height);
            }
        }

        /// <summary>A label with its own coloured band, so text does not touch the band's edge.</summary>
        public static Panel Band(Control on, Label inner, Rectangle bounds, Font font)
        {
            Panel p = new Panel();
            p.Bounds = bounds;
            inner.Font = font;
            inner.Bounds = new Rectangle(6, 2, bounds.Width - 12, bounds.Height - 3);
            p.Controls.Add(inner);
            on.Controls.Add(p);
            return p;
        }

        public static void Colour(Panel band, Label inner, Color fore, Color back)
        {
            band.BackColor = back;
            inner.BackColor = back;
            inner.ForeColor = fore;
        }
    }
}
