using System;
using System.Drawing;
using System.Windows.Forms;

namespace Danamotors.Hhdc.Device
{
    /// <summary>A question answered with a number key (or Esc to cancel). No stylus needed.</summary>
    public sealed class ChoiceDialog : Form
    {
        readonly int count;
        int chosen = -1;

        ChoiceDialog(string title, string message, string[] choices)
        {
            count = choices.Length;
            Text = title;
            MinimizeBox = false;
            MaximizeBox = false;
            KeyPreview = true;
            BackColor = Color.White;
            if (Environment.OSVersion.Platform != PlatformID.WinCE)
            {
                FormBorderStyle = FormBorderStyle.FixedDialog;
                ClientSize = new Size(318, 269);
            }

            Label msg = new Label();
            msg.Text = message;
            msg.Font = new Font(FontFamily.GenericSansSerif, 10f, FontStyle.Bold);
            msg.Bounds = new Rectangle(6, 6, 306, 112);
            Controls.Add(msg);

            string list = "";
            for (int i = 0; i < choices.Length; i++) list += (i + 1) + "  " + choices[i] + "\r\n";
            list += "Esc  Cancel";
            Label opts = new Label();
            opts.Text = list;
            opts.Font = new Font(FontFamily.GenericSansSerif, 10f, FontStyle.Regular);
            opts.Bounds = new Rectangle(6, 124, 306, 138);
            Controls.Add(opts);
        }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            base.OnKeyDown(e);
            if (e.KeyCode == Keys.Escape)
            {
                chosen = -1;
                DialogResult = DialogResult.Cancel;
                e.Handled = true;
                return;
            }
            int n = -1;
            if (e.KeyCode >= Keys.D1 && e.KeyCode <= Keys.D9) n = e.KeyCode - Keys.D1;
            else if (e.KeyCode >= Keys.NumPad1 && e.KeyCode <= Keys.NumPad9) n = e.KeyCode - Keys.NumPad1;
            if (n >= 0 && n < count)
            {
                chosen = n;
                DialogResult = DialogResult.OK;
                e.Handled = true;
            }
        }

        /// <summary>Returns the 0-based choice, or -1 if cancelled with Esc.</summary>
        public static int Ask(Form owner, string title, string message, params string[] choices)
        {
            using (ChoiceDialog d = new ChoiceDialog(title, message, choices))
            {
                d.ShowDialog();
                return d.chosen;
            }
        }

        /// <summary>A message that any key dismisses.</summary>
        public static void Tell(Form owner, string title, string message)
        {
            using (ChoiceDialog d = new ChoiceDialog(title, message, new string[] { "OK" }))
            {
                d.ShowDialog();
            }
        }
    }
}
