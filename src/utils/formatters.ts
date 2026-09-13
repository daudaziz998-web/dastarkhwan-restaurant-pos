/**
 * Utility number and currency formatting functions
 */

/**
 * Compact formatting for large numeric values:
 * - Below 1,000,000 -> normal number with comma separators (e.g. 1,000, 999,999)
 * - 1,000,000+ -> M (e.g. 1M, 1.5M, 15M)
 * - 1,000,000,000+ -> B (e.g. 1B, 2.5B)
 * - 1,000,000,000,000+ -> T (e.g. 1T)
 * Does not show unnecessary decimals (1.0M -> 1M, 2.00M -> 2M, 2.50M -> 2.5M)
 */
export function formatCompactNumber(val: number): string {
  if (val === null || val === undefined || isNaN(val)) return '0';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';

  if (abs < 1_000_000) {
    if (Number.isInteger(abs)) {
      return sign + abs.toLocaleString('en-US');
    }
    const rounded = Math.round(abs * 100) / 100;
    return sign + rounded.toLocaleString('en-US');
  }

  let divisor = 1_000_000;
  let suffix = 'M';

  if (abs >= 1_000_000_000_000) {
    divisor = 1_000_000_000_000;
    suffix = 'T';
  } else if (abs >= 1_000_000_000) {
    divisor = 1_000_000_000;
    suffix = 'B';
  } else {
    divisor = 1_000_000;
    suffix = 'M';
  }

  const divided = abs / divisor;
  // Round to up to 2 decimal places and strip unnecessary trailing zeros
  const rounded = Math.round(divided * 100) / 100;
  return `${sign}${rounded}${suffix}`;
}

/**
 * Compact currency formatter: e.g. "Rs 1.5M", "Rs 15,000"
 */
export function formatCompactMoney(val: number, currency: string = 'Rs'): string {
  return `${currency} ${formatCompactNumber(val)}`;
}

/**
 * Pakistani / Indian numbering system formatting:
 * Last 3 digits grouped, then every 2 digits grouped by commas.
 * Example: 150000000 -> "15,00,00,000"
 */
export function formatPakistaniNumber(val: number): string {
  const rounded = Math.round(Math.abs(val || 0));
  const absStr = rounded.toString();

  if (absStr.length <= 3) {
    return absStr;
  }

  const lastThree = absStr.substring(absStr.length - 3);
  const otherNumbers = absStr.substring(0, absStr.length - 3);
  const formattedOther = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${formattedOther},${lastThree}`;
}

/**
 * Pakistani / Indian currency formatting:
 * Example: 150000000 -> "Rs 15,00,00,000"
 */
export function formatPakistaniCurrency(val: number, currency: string = 'Rs'): string {
  const isNeg = (val || 0) < 0;
  return `${currency} ${isNeg ? '-' : ''}${formatPakistaniNumber(val)}`;
}
