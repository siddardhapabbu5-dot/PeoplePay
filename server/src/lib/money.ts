export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function toNum(v: unknown) {
  if (v == null) return 0;
  return round2(Number(v));
}

export function money(n: number) {
  return round2(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function amountInWords(amount: number) {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const two = (n: number) => {
    if (n < 20) return ones[n];
    return `${tens[Math.floor(n / 10)]}${n % 10 ? " " + ones[n % 10] : ""}`.trim();
  };
  const three = (n: number) => {
    if (n < 100) return two(n);
    return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? " " + two(n % 100) : ""}`.trim();
  };

  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Zero Rupees Only";

  let n = rupees;
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const hundred = n;

  const parts: string[] = [];
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${three(lakh)} Lakh`);
  if (thousand) parts.push(`${three(thousand)} Thousand`);
  if (hundred) parts.push(three(hundred));
  let out = `${parts.join(" ")} Rupees`.trim();
  if (paise) out += ` and ${two(paise)} Paise`;
  return `${out} Only`;
}

export function parseTimeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw || raw === "0") return null;
  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2]);
    const mer = ampm[3].toUpperCase();
    if (mer === "PM" && h < 12) h += 12;
    if (mer === "AM" && h === 12) h = 0;
    return h * 60 + m;
  }
  const hm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  return null;
}

export function minutesToHours(min: number) {
  return round2(min / 60);
}

export function monthDays(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function periodBounds(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start, end };
}
