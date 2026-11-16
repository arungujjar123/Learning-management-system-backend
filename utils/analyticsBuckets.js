// Time buckets for the SuperAdmin trend charts.
// 7 and 30 day periods are bucketed by day, 90 days by week. Day boundaries
// follow ANALYTICS_UTC_OFFSET_MINUTES (default 330 = IST), because the server
// runs in UTC but the platform's users are in India.

const DAY_MS = 24 * 60 * 60 * 1000;
const ALLOWED_PERIODS = [7, 30, 90];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function utcOffsetMs() {
  const minutes = Number(process.env.ANALYTICS_UTC_OFFSET_MINUTES);
  return (Number.isFinite(minutes) ? minutes : 330) * 60 * 1000;
}

function normalizePeriod(raw) {
  const period = parseInt(raw, 10);
  return ALLOWED_PERIODS.includes(period) ? period : 30;
}

function label(startMs, offset) {
  const d = new Date(startMs + offset); // read the local calendar date from the UTC fields
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * @returns {{ period, unit, start: Date, buckets: { label, start: Date, end: Date }[], indexOf(date): number }}
 * indexOf returns -1 for dates outside the range.
 */
function buildBuckets(rawPeriod, now = new Date()) {
  const period = normalizePeriod(rawPeriod);
  const unit = period > 31 ? "week" : "day";
  const bucketMs = (unit === "week" ? 7 : 1) * DAY_MS;
  const count = Math.ceil(period / (bucketMs / DAY_MS));
  const offset = utcOffsetMs();

  // Start of tomorrow in local time, expressed as a UTC timestamp
  const localNow = now.getTime() + offset;
  const endMs = Math.floor(localNow / DAY_MS) * DAY_MS + DAY_MS - offset;
  const startMs = endMs - count * bucketMs;

  const buckets = Array.from({ length: count }, (_, i) => {
    const s = startMs + i * bucketMs;
    return { label: label(s, offset), start: new Date(s), end: new Date(s + bucketMs) };
  });

  return {
    period,
    unit,
    start: new Date(startMs),
    buckets,
    indexOf(date) {
      const t = new Date(date).getTime();
      if (!(t >= startMs && t < endMs)) return -1;
      return Math.floor((t - startMs) / bucketMs);
    },
  };
}

module.exports = { buildBuckets, normalizePeriod };
