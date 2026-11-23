const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** 10:49 PM */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Today -> "Today", yesterday -> "Yesterday", otherwise "Nov 18" */
export function dayLabel(iso: string): string {
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Inbox time: clock for today, otherwise "Yesterday" or the date */
export function inboxTime(iso: string): string {
  return dayLabel(iso) === 'Today' ? formatClock(iso) : dayLabel(iso);
}
