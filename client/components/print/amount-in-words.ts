const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

/** 0–999 in words, British style ("One Hundred and Five"). */
function hundreds(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const tail = rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ""}`;
  if (!h) return tail;
  return `${ONES[h]} Hundred${tail ? ` and ${tail}` : ""}`;
}

/** A whole number in words: 1,250,300 → "One Million Two Hundred and Fifty Thousand Three Hundred". */
export function numberInWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "Zero";
  const groups: string[] = [];
  for (let scale = 0; n > 0 && scale < SCALES.length; scale++, n = Math.floor(n / 1000)) {
    const chunk = n % 1000;
    if (chunk) groups.unshift(`${hundreds(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ""}`);
  }
  // "One Thousand and Five", as an amount is read aloud, when the last group is below a hundred.
  const last = Math.floor(Math.abs(value)) % 1000;
  if (groups.length > 1 && last > 0 && last < 100) {
    groups[groups.length - 1] = `and ${groups[groups.length - 1]}`;
  }
  return groups.join(" ");
}

/** A naira amount in words, as printed on bills: "Naira Two Hundred and Twenty-Seven Thousand Seven Hundred Only". */
export function nairaInWords(amount: number): string {
  const kobo = Math.round(Math.abs(amount) * 100);
  const naira = Math.floor(kobo / 100);
  const rest = kobo % 100;
  return `Naira ${numberInWords(naira)}${rest ? ` and ${numberInWords(rest)} Kobo` : ""} Only`;
}
