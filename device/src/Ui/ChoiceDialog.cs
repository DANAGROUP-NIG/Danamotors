using System;
using System.Drawing;
using System.Windows.Forms;

namespace Danamotors.Hhdc.Device
{
    /// <summary>
    /// A question answered with a number key or a tap on the choice (Esc or the Cancel key to cancel). Enter does not
    /// choose: the scanner ends every scan with Enter, and a scan must never answer a question by accident.
    /// </summary>
    public sealed class ChoiceDialog : Form
    {
        readonly int count;
        int chosen = -1;

        ChoiceDialog(string title, string message, string[] choices, bool tell)
        {
            count = choices.Length;
            Theme.SetUp(this, title);

            HeaderBar header = new HeaderBar();
            header.Set(title, "", false, 0, 0);
            Controls.Add(header);

            int listH = Math.Min(choices.Length * 24, Theme.BodyHeight - 40);
            Label msg = new Label();
            msg.Text = message;
            msg.Font = Theme.Bold(10f);
            msg.ForeColor = Theme.Ink;
            msg.Bounds = new Rectangle(8, Theme.BodyTop + 6, Theme.Width - 16, Theme.BodyHeight - listH - 12);
            Controls.Add(msg);

            ItemList list = new ItemList();
            list.TapOpens = true;
            list.NoSelection = true;
            list.Bounds = new Rectangle(0, Theme.BodyTop + Theme.BodyHeight - listH, Theme.Width, listH);
            for (int i = 0; i < choices.Length; i++)
            {
                ListItem it = new ListItem(choices[i]);
                it.Key = (i + 1).ToString();
                list.Add(it);
            }
            list.Activated = delegate(int i) { Choose(i); };
            Controls.Add(list);

            KeyBar keys = new KeyBar();
            if (tell) keys.Add("1", "OK", Keys.D1).Add("Esc", "Close", Keys.Escape);
            else keys.Add(count == 1 ? "1" : "1-" + count, "Choose", Keys.None).Add("Esc", "Cancel", Keys.Escape);
            keys.Tapped = delegate(Keys k) { if (k == Keys.Escape) Cancel(); else if (k == Keys.D1) Choose(0); };
            Controls.Add(keys);
        }

        void Choose(int n)
        {
            if (n < 0 || n >= count) return;
            chosen = n;
            DialogResult = DialogResult.OK;
        }

        void Cancel()
        {
            chosen = -1;
            DialogResult = DialogResult.Cancel;
        }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            base.OnKeyDown(e);
            if (e.KeyCode == Keys.Escape)
            {
                Cancel();
                e.Handled = true;
                return;
            }
            int n = -1;
            if (e.KeyCode >= Keys.D1 && e.KeyCode <= Keys.D9) n = e.KeyCode - Keys.D1;
            else if (e.KeyCode >= Keys.NumPad1 && e.KeyCode <= Keys.NumPad9) n = e.KeyCode - Keys.NumPad1;
            if (n >= 0 && n < count)
            {
                Choose(n);
                e.Handled = true;
            }
        }

        /// <summary>Returns the 0-based choice, or -1 if cancelled with Esc.</summary>
        public static int Ask(Form owner, string title, string message, params string[] choices)
        {
            using (ChoiceDialog d = new ChoiceDialog(title, message, choices, false))
            {
                d.ShowDialog();
                return d.chosen;
            }
        }

        /// <summary>A message, closed with 1 or Esc (or a tap).</summary>
        public static void Tell(Form owner, string title, string message)
        {
            using (ChoiceDialog d = new ChoiceDialog(title, message, new string[] { "OK" }, true))
            {
                d.ShowDialog();
            }
        }
    }
}
