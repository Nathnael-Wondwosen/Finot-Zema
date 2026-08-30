/**
 * Ethiopian Calendar & Traditional Time Conversion Utilities
 */

const ETH_MONTHS = [
  "መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት",
  "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ"
];

/**
 * Extract date/time parts in Ethiopian Timezone (Africa/Addis_Ababa, UTC+3)
 */
function getAddisAbabaParts(date: Date) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Addis_Ababa",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const getVal = (type: string) =>
      parseInt(parts.find((p) => p.type === type)?.value || "0", 10);

    return {
      year: getVal("year"),
      month: getVal("month"),
      day: getVal("day"),
      hour: getVal("hour"),
      minute: getVal("minute"),
    };
  } catch {
    // Fallback if Intl timezone not supported
    const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
    const eatDate = new Date(utcTime + 3 * 3600000); // UTC+3
    return {
      year: eatDate.getFullYear(),
      month: eatDate.getMonth() + 1,
      day: eatDate.getDate(),
      hour: eatDate.getHours(),
      minute: eatDate.getMinutes(),
    };
  }
}

/**
 * Convert a Gregorian Date to Ethiopian Calendar Date
 */
export function toEthiopianDate(gregorianDate: Date) {
  const { year: gYear, month: gMonth, day: gDay } = getAddisAbabaParts(gregorianDate);

  // Julian Day Number calculation
  const a = Math.floor((14 - gMonth) / 12);
  const y = gYear + 4800 - a;
  const m = gMonth + 12 * a - 3;
  const jdn =
    gDay +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;

  const r = (jdn - 1723856) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const ethYear =
    4 * Math.floor((jdn - 1723856) / 1461) +
    Math.floor(r / 365) -
    Math.floor(r / 1460);
  const ethMonth = Math.floor(n / 30) + 1;
  const ethDay = (n % 30) + 1;

  const monthName = ETH_MONTHS[ethMonth - 1] || "";

  return {
    year: ethYear,
    month: ethMonth,
    monthName,
    day: ethDay,
  };
}

/**
 * Convert Gregorian Hour (in East Africa Time) to Traditional Ethiopian Local Time
 *
 * In Ethiopian Traditional 12-Hour Cycle:
 * - 06:00 EAT (6 AM)  -> 12:00 ጠዋት (Sunrise / Day Start)
 * - 07:00 EAT (7 AM)  -> 1:00 ጠዋት
 * - 12:00 EAT (Noon)  -> 6:00 ከቀኑ / እኩለ ቀን
 * - 18:00 EAT (6 PM)  -> 12:00 ምሽት (Sunset / Night Start)
 * - 19:00 EAT (7 PM)  -> 1:00 ከምሽቱ
 * - 20:00 EAT (8 PM)  -> 2:00 ከምሽቱ
 * - 21:00 EAT (9 PM)  -> 3:00 ከምሽቱ
 * - 00:00 EAT (Midn.) -> 6:00 ከሌሊቱ / እኩለ ሌሊት
 */
export function toEthiopianTime(date: Date) {
  const { hour: gHour, minute: gMinute } = getAddisAbabaParts(date);

  // Convert Gregorian hour to Ethiopian 12-hour traditional cycle (6 hours offset)
  let ethHour = (gHour - 6 + 24) % 12;
  if (ethHour === 0) ethHour = 12;

  // Determine period in Amharic
  let period = "ከጠዋቱ";
  if (gHour >= 6 && gHour < 12) {
    period = "ከጠዋቱ";
  } else if (gHour >= 12 && gHour < 18) {
    period = "ከቀኑ";
  } else if (gHour >= 18 && gHour < 23) {
    period = "ከምሽቱ";
  } else {
    // 23:00 to 05:59 EAT
    period = "ከሌሊቱ";
  }

  const minutesStr = gMinute.toString().padStart(2, "0");
  return {
    ethHour,
    minute: minutesStr,
    period,
    formatted: `${period} ${ethHour}:${minutesStr}`,
  };
}

/**
 * Extract Ethiopian Calendar Year from an ISO Date string or Date object
 */
export function getEthiopianYear(isoStringOrDate: string | Date | undefined): number {
  if (!isoStringOrDate) return 2017;
  const date = typeof isoStringOrDate === "string" ? new Date(isoStringOrDate) : isoStringOrDate;
  if (isNaN(date.getTime())) return 2017;
  return toEthiopianDate(date).year;
}

/**
 * Format an ISO string to a full Ethiopian Date and Traditional Local Time
 * e.g. "ነሐሴ 24 ቀን 2018 ዓ.ም (ከምሽቱ 2:47)"
 */
export function formatEthiopianDateTime(isoStringOrDate: string | Date | undefined): string {
  if (!isoStringOrDate) return "ያልተገለጸ";
  const date = typeof isoStringOrDate === "string" ? new Date(isoStringOrDate) : isoStringOrDate;
  if (isNaN(date.getTime())) return "ያልተገለጸ";

  const { year, monthName, day } = toEthiopianDate(date);
  const { formatted: ethTimeFormatted } = toEthiopianTime(date);

  return `${monthName} ${day} ቀን ${year} ዓ.ም (${ethTimeFormatted})`;
}
