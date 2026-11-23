using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

namespace Danamotors.Hhdc.Device
{
    /// <summary>The Compact Framework has no Action&lt;T&gt;.</summary>
    public delegate void KeyTap(Keys key);
    public delegate void RowTap(int index);

    /// <summary>Paints into a bitmap first, so the slow device screen does not flicker.</summary>
    public abstract class PaintedControl : Control
    {
        Bitmap buffer;

        protected override void OnPaintBackground(PaintEventArgs e) { }

        protected override void OnPaint(PaintEventArgs e)
        {
            if (Width <= 0 || Height <= 0) return;
            if (buffer == null || buffer.Width != Width || buffer.Height != Height)
            {
                if (buffer != null) buffer.Dispose();
                buffer = new Bitmap(Width, Height);
            }
            using (Graphics g = Graphics.FromImage(buffer)) Draw(g);
            e.Graphics.DrawImage(buffer, 0, 0);
        }

        protected abstract void Draw(Graphics g);

        protected override void Dispose(bool disposing)
        {
            if (disposing && buffer != null) { buffer.Dispose(); buffer = null; }
            base.Dispose(disposing);
        }
    }

    /// <summary>The midnight band at the top: the Kia logo or the screen's name, a short note on the right, and progress.</summary>
    public sealed class HeaderBar : PaintedControl
    {
        static readonly Font TitleFont = Theme.Bold(10f);
        static readonly Font RightFont = Theme.Plain(8f);
        static readonly Color Track = Color.FromArgb(40, 58, 72);
        static readonly Color Fill = Color.FromArgb(0, 186, 104);

        string title = "", right = "";
        bool logo;
        int done, total;

        public HeaderBar()
        {
            Bounds = new Rectangle(0, 0, Theme.Width, Theme.HeaderHeight);
        }

        /// <summary>Total 0 hides the progress line.</summary>
        public void Set(string title, string right, bool showLogo, int done, int total)
        {
            this.title = title ?? "";
            this.right = right ?? "";
            this.logo = showLogo;
            this.done = done;
            this.total = total;
            Invalidate();
        }

        public string Title { get { return title; } }

        protected override void Draw(Graphics g)
        {
            using (SolidBrush b = new SolidBrush(Theme.Midnight)) g.FillRectangle(b, 0, 0, Width, Height);
            int x = 6;
            Bitmap l = logo ? Theme.Logo : null;
            if (l != null)
            {
                g.DrawImage(l, x, (Height - l.Height) / 2 - 1);
                x += l.Width + 7;
                using (Pen p = new Pen(Track)) g.DrawLine(p, x - 4, 5, x - 4, Height - 7);
            }
            int rightWidth = right.Length == 0 ? 0 : (int)g.MeasureString(right, RightFont).Width + 2;
            rightWidth = Math.Min(rightWidth, (Width - x) / 2);
            using (SolidBrush w = new SolidBrush(Color.White))
                g.DrawString(Theme.Fit(g, title, TitleFont, Width - x - rightWidth - 10), TitleFont, w, x, 3);
            if (rightWidth > 0)
            {
                string r = Theme.Fit(g, right, RightFont, rightWidth);
                int rw = (int)g.MeasureString(r, RightFont).Width;
                using (SolidBrush s = new SolidBrush(Theme.HeaderSub)) g.DrawString(r, RightFont, s, Width - 6 - rw, 5);
            }
            if (total > 0)
            {
                int fill = (int)((long)(Width) * Math.Min(done, total) / total);
                using (SolidBrush t = new SolidBrush(Track)) g.FillRectangle(t, 0, Height - 3, Width, 3);
                using (SolidBrush f = new SolidBrush(Fill)) g.FillRectangle(f, 0, Height - 3, fill, 3);
            }
        }
    }

    /// <summary>
    /// The keys the screen answers to, along the bottom, like the soft keys of the legacy screen. Each one can also be
    /// tapped with the stylus, which does the same as pressing the key.
    /// </summary>
    public sealed class KeyBar : PaintedControl
    {
        static readonly Font CapFont = Theme.Bold(7f);
        static readonly Font LabelFont = Theme.Plain(8f);

        sealed class Slot { public string Cap; public string Label; public Keys Key; }
        readonly List<Slot> slots = new List<Slot>();

        /// <summary>Called when a key is tapped.</summary>
        public KeyTap Tapped;

        public KeyBar()
        {
            Bounds = new Rectangle(0, Theme.Height - Theme.KeyBarHeight, Theme.Width, Theme.KeyBarHeight);
        }

        public KeyBar Clear() { slots.Clear(); Invalidate(); return this; }

        public KeyBar Add(string cap, string label, Keys key)
        {
            Slot s = new Slot();
            s.Cap = cap; s.Label = label; s.Key = key;
            slots.Add(s);
            Invalidate();
            return this;
        }

        /// <summary>The keys shown, as text (for tests and the timing log).</summary>
        public string Describe()
        {
            string t = "";
            foreach (Slot s in slots) t += (t.Length > 0 ? "  " : "") + s.Cap + "=" + s.Label;
            return t;
        }

        protected override void Draw(Graphics g)
        {
            using (SolidBrush b = new SolidBrush(Theme.Shade)) g.FillRectangle(b, 0, 0, Width, Height);
            using (Pen p = new Pen(Theme.Line)) g.DrawLine(p, 0, 0, Width, 0);
            if (slots.Count == 0) return;
            int w = Width / slots.Count;
            using (SolidBrush cap = new SolidBrush(Theme.Midnight))
            using (SolidBrush white = new SolidBrush(Color.White))
            using (SolidBrush ink = new SolidBrush(Theme.Ink))
            using (Pen sep = new Pen(Theme.Line))
            {
                for (int i = 0; i < slots.Count; i++)
                {
                    Slot s = slots[i];
                    int x = i * w;
                    if (i > 0) g.DrawLine(sep, x, 4, x, Height - 4);
                    int cw = (int)g.MeasureString(s.Cap, CapFont).Width + 3;
                    g.FillRectangle(cap, x + 2, 5, cw, 15);
                    g.DrawString(s.Cap, CapFont, white, x + 3, 6);
                    g.DrawString(Theme.Fit(g, s.Label, LabelFont, w - cw - 5), LabelFont, ink, x + cw + 3, 6);
                }
            }
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (slots.Count == 0 || Tapped == null) return;
            int i = Math.Min(slots.Count - 1, Math.Max(0, e.X / (Width / slots.Count)));
            Tapped(slots[i].Key);
        }
    }

    /// <summary>One row of an ItemList.</summary>
    public sealed class ListItem
    {
        /// <summary>A key shown in a box at the left ("1"); empty for none.</summary>
        public string Key = "";
        public string Title = "";
        /// <summary>A second, smaller line; rows are taller when any row has one.</summary>
        public string Detail = "";
        /// <summary>A short state on the right ("DONE", "3/5").</summary>
        public string Badge = "";
        public Color BadgeColor = Theme.Muted;
        /// <summary>0..1 draws a thin progress line under the row; below 0 none.</summary>
        public float Progress = -1f;
        /// <summary>Nothing to open here: drawn grey.</summary>
        public bool Dim;
        /// <summary>A warning about the row: drawn red.</summary>
        public bool Alert;

        public ListItem(string title) { Title = title ?? ""; }
    }

    /// <summary>
    /// The lists of the app (jobs, bins, parts, entries, lines and dialog choices). Up/Down are passed in by the form;
    /// a tap selects a row, and a tap on the selected row opens it (Activated), so the stylus works as well as the keys.
    /// </summary>
    public sealed class ItemList : PaintedControl
    {
        static readonly Font TitleFont = Theme.Bold(9f);
        static readonly Font DetailFont = Theme.Plain(8f);
        static readonly Font BadgeFont = Theme.Bold(8f);
        static readonly Font KeyFont = Theme.Bold(9f);

        readonly List<ListItem> items = new List<ListItem>();
        int selected = -1, top;

        /// <summary>Text shown when the list is empty.</summary>
        public string EmptyText = "";
        /// <summary>One tap opens a row (dialog choices), instead of tap to select and tap again to open.</summary>
        public bool TapOpens;
        /// <summary>Never show a selected row (dialog choices answer to their number keys only).</summary>
        public bool NoSelection;
        public RowTap Activated;

        public int Count { get { return items.Count; } }
        public ListItem this[int i] { get { return items[i]; } }

        public void Clear() { items.Clear(); selected = -1; top = 0; Invalidate(); }

        public void Add(ListItem item) { items.Add(item); Invalidate(); }

        int RowHeight
        {
            get
            {
                foreach (ListItem i in items) if (i.Detail.Length > 0) return 34;
                return 24;
            }
        }

        int VisibleRows { get { return Math.Max(1, Height / RowHeight); } }

        public int SelectedIndex
        {
            get { return selected; }
            set
            {
                selected = items.Count == 0 || NoSelection ? -1 : Math.Max(-1, Math.Min(items.Count - 1, value));
                if (selected >= 0)
                {
                    if (selected < top) top = selected;
                    if (selected >= top + VisibleRows) top = selected - VisibleRows + 1;
                }
                Invalidate();
            }
        }

        /// <summary>Up or Down by one (or a page with a bigger step); stays at the ends.</summary>
        public void Move(int step)
        {
            if (items.Count == 0) return;
            SelectedIndex = Math.Max(0, Math.Min(items.Count - 1, (selected < 0 ? 0 : selected) + step));
        }

        protected override void Draw(Graphics g)
        {
            using (SolidBrush paper = new SolidBrush(Theme.Paper)) g.FillRectangle(paper, 0, 0, Width, Height);
            if (items.Count == 0)
            {
                using (SolidBrush m = new SolidBrush(Theme.Muted))
                    g.DrawString(EmptyText, DetailFont, m, new RectangleF(10, 12, Width - 20, Height - 20));
                return;
            }
            int rh = RowHeight, rows = VisibleRows;
            bool scroll = items.Count > rows;
            int right = Width - (scroll ? 6 : 0);
            if (top > Math.Max(0, items.Count - rows)) top = Math.Max(0, items.Count - rows);
            using (Pen line = new Pen(Theme.Line))
            {
                for (int r = 0; r < rows && top + r < items.Count; r++)
                {
                    int i = top + r;
                    DrawRow(g, items[i], i == selected, 0, r * rh, right, rh);
                    g.DrawLine(line, 0, r * rh + rh - 1, right, r * rh + rh - 1);
                }
            }
            if (scroll)
            {
                int h = Math.Max(12, Height * rows / items.Count);
                int y = (Height - h) * top / Math.Max(1, items.Count - rows);
                using (SolidBrush t = new SolidBrush(Theme.Shade)) g.FillRectangle(t, Width - 5, 0, 5, Height);
                using (SolidBrush th = new SolidBrush(Theme.Muted)) g.FillRectangle(th, Width - 5, y, 5, h);
            }
        }

        void DrawRow(Graphics g, ListItem it, bool sel, int x, int y, int w, int h)
        {
            Color back = sel ? Theme.Midnight : Theme.Paper;
            Color title = sel ? Color.White : it.Alert ? Theme.Warn : it.Dim ? Theme.Muted : Theme.Ink;
            Color detail = sel ? Theme.HeaderSub : Theme.Muted;
            using (SolidBrush b = new SolidBrush(back)) g.FillRectangle(b, x, y, w, h - 1);
            if (sel)
                using (SolidBrush accent = new SolidBrush(Color.FromArgb(0, 186, 104))) g.FillRectangle(accent, x, y, 3, h - 1);

            int left = x + 7;
            bool twoLines = it.Detail.Length > 0;
            int titleY = y + (twoLines ? 3 : (h - 15) / 2);
            if (it.Key.Length > 0)
            {
                int kw = 17;
                int ky = y + (h - kw) / 2;
                using (SolidBrush kb = new SolidBrush(sel ? Color.White : it.Dim ? Theme.Line : Theme.Midnight))
                    g.FillRectangle(kb, left, ky, kw, kw);
                using (SolidBrush kt = new SolidBrush(sel ? Theme.Midnight : Color.White))
                {
                    int tw = (int)g.MeasureString(it.Key, KeyFont).Width;
                    g.DrawString(it.Key, KeyFont, kt, left + (kw - tw) / 2 + 1, ky + 1);
                }
                left += kw + 7;
            }

            int badgeW = 0;
            if (it.Badge.Length > 0)
            {
                int bw = (int)g.MeasureString(it.Badge, BadgeFont).Width + 8;
                badgeW = bw + 6;
                int by = y + (twoLines ? 4 : (h - 16) / 2);
                Color bf = it.BadgeColor;
                using (SolidBrush bb = new SolidBrush(Theme.BackFor(bf))) g.FillRectangle(bb, x + w - bw - 5, by, bw, 15);
                using (SolidBrush bt = new SolidBrush(bf)) g.DrawString(it.Badge, BadgeFont, bt, x + w - bw - 1, by + 1);
            }

            using (SolidBrush t = new SolidBrush(title))
                g.DrawString(Theme.Fit(g, it.Title, TitleFont, w - (left - x) - badgeW - 4), TitleFont, t, left, titleY);
            if (twoLines)
                using (SolidBrush d = new SolidBrush(detail))
                    g.DrawString(Theme.Fit(g, it.Detail, DetailFont, w - (left - x) - 6), DetailFont, d, left, y + 18);

            if (it.Progress >= 0f)
            {
                int pw = w - (left - x) - 8;
                int fill = (int)(pw * Math.Min(1f, it.Progress));
                using (SolidBrush tr = new SolidBrush(sel ? Color.FromArgb(40, 58, 72) : Theme.Shade)) g.FillRectangle(tr, left, y + h - 4, pw, 2);
                using (SolidBrush f = new SolidBrush(it.Progress >= 1f ? Theme.Good : Color.FromArgb(0, 150, 84))) g.FillRectangle(f, left, y + h - 4, fill, 2);
            }
        }

        /// <summary>
        /// The control to focus while the list is in use. A painted control with the focus gives up the arrow keys to
        /// moving between controls (on a PC; the Compact Framework has no IsInputKey to stop it), so the focus sits in a
        /// text box out of sight that passes every key on to the form and keeps no text.
        /// </summary>
        public Control Sink
        {
            get
            {
                if (sink == null)
                {
                    sink = new TextBox();
                    sink.Bounds = new Rectangle(-60, -60, 20, 20);
                    sink.KeyPress += delegate(object s, KeyPressEventArgs e) { e.Handled = true; };
                    Controls.Add(sink);
                }
                return sink;
            }
        }
        TextBox sink;

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            int i = top + e.Y / RowHeight;
            if (i < 0 || i >= items.Count) return;
            bool open = TapOpens || i == selected;
            if (!NoSelection) SelectedIndex = i;
            if (open && Activated != null) Activated(i);
        }
    }
}
