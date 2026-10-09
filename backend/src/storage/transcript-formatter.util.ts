import { TranscriptSegment } from '../entities/transcript-segment.entity';
import { Meeting } from '../entities/meeting.entity';

/**
 * Renders transcript segments into the file formats archived to S3.
 */

/** Seconds (relative to meeting start) -> "HH:MM:SS.mmm" for WebVTT. */
function toVttTimestamp(seconds: number): string {
  const total = Math.max(0, Number(seconds) || 0);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);

  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
}

/** Seconds -> "HH:MM:SS" for the human-readable formats. */
function toClock(seconds: number): string {
  const total = Math.max(0, Number(seconds) || 0);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

export function buildTranscriptJson(
  meeting: Meeting,
  segments: TranscriptSegment[],
): string {
  return JSON.stringify(
    {
      meetingId: meeting.id,
      title: meeting.title || null,
      platform: meeting.platform,
      nativeMeetingId: meeting.nativeMeetingId,
      meetingUrl: meeting.constructedMeetingUrl || null,
      startTime: meeting.startTime ? meeting.startTime.toISOString() : null,
      endTime: meeting.endTime ? meeting.endTime.toISOString() : null,
      totalSegments: segments.length,
      segments: segments.map((s) => ({
        speaker: s.speaker,
        text: s.text,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
    },
    null,
    2,
  );
}

export function buildTranscriptText(
  meeting: Meeting,
  segments: TranscriptSegment[],
): string {
  const header = [
    `Meeting: ${meeting.title || meeting.nativeMeetingId}`,
    `Meeting ID: ${meeting.nativeMeetingId}`,
    meeting.startTime ? `Started: ${meeting.startTime.toISOString()}` : null,
    meeting.endTime ? `Ended: ${meeting.endTime.toISOString()}` : null,
    `Segments: ${segments.length}`,
    '',
    '---',
    '',
  ]
    .filter((l) => l !== null)
    .join('\n');

  const body = segments
    .map((s) => `[${toClock(s.startTime)}] ${s.speaker || 'Unknown'}: ${s.text}`)
    .join('\n');

  return `${header}${body}\n`;
}

export function buildTranscriptVtt(segments: TranscriptSegment[]): string {
  const cues = segments.map((s, index) => {
    const start = toVttTimestamp(s.startTime);
    // Guard against zero-length cues so players still render them.
    const rawEnd = Number(s.endTime);
    const end = toVttTimestamp(
      Number.isFinite(rawEnd) && rawEnd > s.startTime
        ? rawEnd
        : Number(s.startTime) + 2,
    );
    const speaker = s.speaker ? `<v ${s.speaker}>` : '';
    return `${index + 1}\n${start} --> ${end}\n${speaker}${s.text}\n`;
  });

  return `WEBVTT\n\n${cues.join('\n')}`;
}

export function buildTranscriptMarkdown(
  meeting: Meeting,
  segments: TranscriptSegment[],
): string {
  const title = meeting.title || `Meeting ${meeting.nativeMeetingId}`;
  const durationMs =
    meeting.startTime && meeting.endTime
      ? meeting.endTime.getTime() - meeting.startTime.getTime()
      : 0;
  const durationMin = durationMs > 0 ? Math.round(durationMs / 60000) : null;

  const speakers = Array.from(
    new Set(segments.map((s) => s.speaker).filter(Boolean)),
  );

  const lines: string[] = [
    `# ${title}`,
    '',
    '## Details',
    '',
    `- **Meeting ID:** \`${meeting.nativeMeetingId}\``,
    `- **Platform:** ${meeting.platform}`,
    meeting.startTime
      ? `- **Started:** ${meeting.startTime.toISOString()}`
      : null,
    meeting.endTime ? `- **Ended:** ${meeting.endTime.toISOString()}` : null,
    durationMin !== null ? `- **Duration:** ~${durationMin} min` : null,
    `- **Participants heard:** ${speakers.length > 0 ? speakers.join(', ') : 'none detected'}`,
    `- **Transcript segments:** ${segments.length}`,
    '',
    '## Transcript',
    '',
  ].filter((l) => l !== null) as string[];

  if (segments.length === 0) {
    lines.push('_No transcript was captured for this meeting._');
  } else {
    // Group consecutive segments by the same speaker into one paragraph.
    let currentSpeaker: string | null = null;
    let buffer: string[] = [];
    let blockStart = 0;

    const flush = () => {
      if (buffer.length === 0) return;
      lines.push(
        `**${currentSpeaker || 'Unknown'}** _(${toClock(blockStart)})_`,
        '',
        buffer.join(' '),
        '',
      );
      buffer = [];
    };

    for (const segment of segments) {
      const speaker = segment.speaker || 'Unknown';
      if (speaker !== currentSpeaker) {
        flush();
        currentSpeaker = speaker;
        blockStart = segment.startTime;
      }
      buffer.push(segment.text);
    }
    flush();
  }

  return lines.join('\n') + '\n';
}
