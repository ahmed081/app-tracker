/** Start of the time slot containing `date`, for an interval in minutes (UTC). */
export function slotStart(date, intervalMinutes = 60) {
  const ms = intervalMinutes * 60_000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}
