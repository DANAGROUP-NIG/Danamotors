/** Opens the browser's own date/time picker for a hidden native input. */
export function openNativePicker(input: HTMLInputElement | null) {
  if (!input) return;
  try {
    input.showPicker();
  } catch {
    // Older browsers without showPicker(): focusing still opens the picker on most mobiles.
    input.focus();
    input.click();
  }
}
