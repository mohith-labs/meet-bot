/**
 * Object-key naming for meeting archives.
 *
 * Layout:
 *   <prefix>/<YYYY-MM-DD>/<HH-mm-ss>_<meeting-title-slug>_<short-id>/<artifact>
 *
 * Example:
 *   meetings/2026-10-09/14-30-05_sprint-planning-q4_a1b2c3d4/video.webm
 *
 * The date/time folders are derived in the user's configured timezone so the
 * bucket reads the same way the meeting felt, and the short meeting-id suffix
 * guarantees uniqueness when two meetings share a title and start second.
 */

const MAX_SLUG_LENGTH = 60;

/**
 * Convert an arbitrary meeting title into a safe, readable S3 key segment.
 * Falls back to 'untitled-meeting' when nothing usable remains.
 */
export function slugifyTitle(title: string | undefined | null): string {
  if (!title) return 'untitled-meeting';

  const slug = title
    .normalize('NFKD')
    // strip combining marks so "Café" -> "Cafe"
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // anything that is not a-z 0-9 becomes a separator
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');

  return slug || 'untitled-meeting';
}

/**
 * Format a Date into date/time parts for a given IANA timezone.
 * Uses Intl so no extra dependency is required.
 */
export function formatDateParts(
  date: Date,
  timezone: string = 'UTC',
): { date: string; time: string } {
  let parts: Intl.DateTimeFormatPart[];

  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
  } catch {
    // Invalid timezone string — fall back to UTC rather than throwing mid-upload.
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
  }

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '00';

  // Intl renders midnight as "24" in some locales/engines — normalise it.
  const hour = get('hour') === '24' ? '00' : get('hour');

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${hour}-${get('minute')}-${get('second')}`,
  };
}

/**
 * Build the folder key (no trailing slash) for one meeting's artifacts.
 */
export function buildMeetingFolderKey(options: {
  prefix?: string;
  startedAt: Date;
  title?: string | null;
  meetingId: string;
  timezone?: string;
}): string {
  const { date, time } = formatDateParts(
    options.startedAt,
    options.timezone || 'UTC',
  );

  const slug = slugifyTitle(options.title);
  const shortId = (options.meetingId || '').replace(/-/g, '').slice(0, 8) || 'nomeetid';

  const cleanPrefix = (options.prefix ?? 'meetings')
    .replace(/^\/+|\/+$/g, '')
    .trim();

  const folder = `${date}/${time}_${slug}_${shortId}`;
  return cleanPrefix ? `${cleanPrefix}/${folder}` : folder;
}

/** Join a folder key and a file name into a full object key. */
export function buildObjectKey(folderKey: string, fileName: string): string {
  return `${folderKey.replace(/\/+$/g, '')}/${fileName}`;
}
