/**
 * MeetBot → Google Drive Webhook Handler
 *
 * Google Apps Script that receives meeting.ended webhooks from MeetBot,
 * downloads recordings & transcript, and saves everything to Google Drive.
 *
 * ── Setup ──
 * 1. Go to https://script.google.com and create a new project
 * 2. Paste this entire file into Code.gs
 * 3. Set the Script Properties (Project Settings → Script Properties):
 *      MEETBOT_API_BASE_URL  → Your MeetBot API base URL (e.g. https://meetbot.example.com)
 *      MEETBOT_API_KEY       → Your MeetBot API key (from API Keys tab)
 *      DRIVE_FOLDER_ID       → Google Drive folder ID where meetings will be saved
 *      WEBHOOK_SECRET        → (Optional) Webhook signing secret for HMAC verification
 * 4. Deploy → New deployment → Web app
 *      Execute as: Me
 *      Who has access: Anyone
 * 5. Copy the Web app URL and add it as a webhook in MeetBot (Settings → Webhooks)
 *      - Event: meeting.ended
 *      - URL: <your Apps Script web app URL>
 *      - Secret: (same as WEBHOOK_SECRET if you set one)
 *
 * ── Folder Structure ──
 * 📁 MeetBot Recordings/          ← your DRIVE_FOLDER_ID
 *   📁 2026-07-30_abc-defg-hij/   ← per-meeting subfolder
 *     📄 transcript.txt           ← formatted transcript
 *     📄 webhook.json             ← raw webhook payload
 *     🎥 screen.webm              ← screen recording (if available)
 *     🔊 audio.webm               ← audio recording (if available)
 */

// ═════════════════════════════════════════════════════════════════════════════
// Configuration (read from Script Properties)
// ═════════════════════════════════════════════════════════════════════════════

function getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    apiBaseUrl: (props.getProperty('MEETBOT_API_BASE_URL') || '').replace(/\/+$/, ''),
    apiKey: props.getProperty('MEETBOT_API_KEY') || '',
    driveFolderId: props.getProperty('DRIVE_FOLDER_ID') || '',
    webhookSecret: props.getProperty('WEBHOOK_SECRET') || '',
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Web App Entry Points
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Handle POST requests (webhook events from MeetBot).
 */
function doPost(e) {
  try {
    const config = getConfig();

    // Parse the webhook payload
    const rawBody = e.postData.contents;
    const payload = JSON.parse(rawBody);

    // Verify HMAC signature if webhook secret is configured
    if (config.webhookSecret) {
      const signature = e.parameter['signature'] ||
        (e.headers && e.headers['X-Webhook-Signature']) || '';
      if (!verifySignature(rawBody, signature, config.webhookSecret)) {
        return buildResponse(401, { error: 'Invalid signature' });
      }
    }

    // Only process meeting.ended events
    if (payload.event !== 'meeting.ended') {
      return buildResponse(200, { message: `Ignored event: ${payload.event}` });
    }

    // Process the meeting data
    const result = processMeetingEnded(payload, config);

    return buildResponse(200, {
      message: 'Meeting data saved to Google Drive',
      folderId: result.folderId,
      folderUrl: result.folderUrl,
      files: result.files,
    });

  } catch (error) {
    console.error('Webhook processing failed:', error);
    return buildResponse(500, { error: error.message });
  }
}

/**
 * Handle GET requests (health check / verification).
 */
function doGet(e) {
  return buildResponse(200, {
    status: 'ok',
    service: 'MeetBot Google Drive Webhook',
    timestamp: new Date().toISOString(),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Core Processing
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Process a meeting.ended webhook: create folder, save transcript,
 * download recordings, and store the raw webhook JSON.
 */
function processMeetingEnded(payload, config) {
  const data = payload.data;
  const meetingId = data.meetingId;
  const nativeMeetingId = data.nativeMeetingId || meetingId;
  const meetingDate = (data.endTime || payload.timestamp || new Date().toISOString())
    .substring(0, 10); // YYYY-MM-DD

  // Create the meeting subfolder
  const folderName = `${meetingDate}_${nativeMeetingId}`;
  const parentFolder = DriveApp.getFolderById(config.driveFolderId);
  const meetingFolder = parentFolder.createFolder(folderName);

  const savedFiles = [];

  // 1. Save the raw webhook JSON
  const webhookFile = meetingFolder.createFile(
    'webhook.json',
    JSON.stringify(payload, null, 2),
    'application/json',
  );
  savedFiles.push({ name: 'webhook.json', id: webhookFile.getId() });

  // 2. Save the formatted transcript
  if (data.transcript && data.transcript.segments && data.transcript.segments.length > 0) {
    const transcriptText = formatTranscript(data);
    const transcriptFile = meetingFolder.createFile(
      'transcript.txt',
      transcriptText,
      'text/plain',
    );
    savedFiles.push({ name: 'transcript.txt', id: transcriptFile.getId() });
  }

  // 3. Download and save recordings
  if (data.recordings) {
    if (data.recordings.screenRecordingUrl) {
      const screenFile = downloadRecording(
        config,
        data.recordings.screenRecordingUrl,
        'screen.webm',
        meetingFolder,
      );
      if (screenFile) {
        savedFiles.push({ name: 'screen.webm', id: screenFile.getId() });
      }
    }

    if (data.recordings.audioRecordingUrl) {
      const audioFile = downloadRecording(
        config,
        data.recordings.audioRecordingUrl,
        'audio.webm',
        meetingFolder,
      );
      if (audioFile) {
        savedFiles.push({ name: 'audio.webm', id: audioFile.getId() });
      }
    }
  }

  console.log(`Meeting ${nativeMeetingId} saved to folder: ${folderName} (${savedFiles.length} files)`);

  return {
    folderId: meetingFolder.getId(),
    folderUrl: meetingFolder.getUrl(),
    files: savedFiles,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Transcript Formatting
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Format transcript segments into a readable text document.
 */
function formatTranscript(data) {
  const lines = [];

  // Header
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('  MEETING TRANSCRIPT');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`  Meeting ID    : ${data.nativeMeetingId || data.meetingId}`);
  lines.push(`  Platform      : ${data.platform || 'google_meet'}`);
  lines.push(`  Bot Name      : ${data.botName || 'MeetBot'}`);
  lines.push(`  Start Time    : ${data.startTime || 'N/A'}`);
  lines.push(`  End Time      : ${data.endTime || 'N/A'}`);

  if (data.startTime && data.endTime) {
    const durationMs = new Date(data.endTime) - new Date(data.startTime);
    const durationMin = Math.round(durationMs / 60000);
    lines.push(`  Duration      : ${durationMin} minutes`);
  }

  lines.push(`  Total Segments: ${data.transcript.totalSegments}`);
  lines.push('');
  lines.push('───────────────────────────────────────────────────────');
  lines.push('');

  // Transcript segments grouped by speaker
  const segments = data.transcript.segments;
  let currentSpeaker = '';

  for (const seg of segments) {
    const speaker = seg.speaker || 'Unknown';
    const timestamp = formatTimestamp(seg.startTime);

    if (speaker !== currentSpeaker) {
      if (currentSpeaker !== '') lines.push('');
      lines.push(`[${timestamp}] ${speaker}:`);
      currentSpeaker = speaker;
    }

    lines.push(`  ${seg.text}`);
  }

  lines.push('');
  lines.push('───────────────────────────────────────────────────────');
  lines.push('  END OF TRANSCRIPT');
  lines.push('═══════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Format seconds into MM:SS timestamp.
 */
function formatTimestamp(seconds) {
  if (seconds == null || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Recording Download
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Download a recording from the MeetBot API and save it to the Drive folder.
 * Returns the created File, or null if download failed.
 */
function downloadRecording(config, recordingPath, fileName, folder) {
  try {
    const url = `${config.apiBaseUrl}${recordingPath}`;

    console.log(`Downloading recording: ${url}`);

    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        'x-api-key': config.apiKey,
      },
      muteHttpExceptions: true,
    });

    const statusCode = response.getResponseCode();
    if (statusCode !== 200) {
      console.warn(`Recording download failed (${statusCode}): ${fileName} — ${response.getContentText().substring(0, 200)}`);
      return null;
    }

    const blob = response.getBlob().setName(fileName);
    const file = folder.createFile(blob);

    console.log(`Recording saved: ${fileName} (${blob.getBytes().length} bytes)`);
    return file;

  } catch (error) {
    console.error(`Failed to download recording ${fileName}: ${error.message}`);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// HMAC Signature Verification
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Verify the webhook HMAC-SHA256 signature.
 */
function verifySignature(body, signatureHeader, secret) {
  if (!signatureHeader) return false;

  // Expected format: "sha256=<hex>"
  const expected = signatureHeader.replace(/^sha256=/, '');

  const hmac = Utilities.computeHmacSha256Signature(body, secret);
  const computed = hmac.map(function (b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('');

  return computed === expected;
}

// ═════════════════════════════════════════════════════════════════════════════
// Utilities
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Build a JSON response for the web app.
 */
function buildResponse(statusCode, data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═════════════════════════════════════════════════════════════════════════════
// Manual Test Function
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Run this manually from the Apps Script editor to test the setup.
 * It verifies your Script Properties are configured correctly and
 * creates a test folder in your Drive.
 */
function testSetup() {
  const config = getConfig();
  const errors = [];

  if (!config.apiBaseUrl) errors.push('MEETBOT_API_BASE_URL is not set');
  if (!config.apiKey) errors.push('MEETBOT_API_KEY is not set');
  if (!config.driveFolderId) errors.push('DRIVE_FOLDER_ID is not set');

  if (errors.length > 0) {
    console.error('Configuration errors:\n  - ' + errors.join('\n  - '));
    console.log('\nGo to Project Settings → Script Properties to configure.');
    return;
  }

  // Verify Drive folder access
  try {
    const folder = DriveApp.getFolderById(config.driveFolderId);
    console.log(`✓ Drive folder accessible: "${folder.getName()}"`);
  } catch (e) {
    console.error(`✗ Cannot access Drive folder (${config.driveFolderId}): ${e.message}`);
    return;
  }

  // Verify API connectivity
  try {
    const response = UrlFetchApp.fetch(`${config.apiBaseUrl}/health`, {
      method: 'get',
      headers: { 'x-api-key': config.apiKey },
      muteHttpExceptions: true,
    });
    console.log(`✓ API reachable (status ${response.getResponseCode()})`);
  } catch (e) {
    console.warn(`⚠ Cannot reach API at ${config.apiBaseUrl}: ${e.message}`);
    console.log('  (This is OK if your API is on a private network — recordings will be downloaded at webhook time)');
  }

  // Create a test folder to verify write access
  try {
    const parentFolder = DriveApp.getFolderById(config.driveFolderId);
    const testFolder = parentFolder.createFolder('_meetbot_test_' + Date.now());
    console.log(`✓ Write access confirmed — created test folder: ${testFolder.getUrl()}`);
    // Clean up
    testFolder.setTrashed(true);
    console.log('  (Test folder moved to trash)');
  } catch (e) {
    console.error(`✗ Cannot create folders in Drive: ${e.message}`);
    return;
  }

  console.log('\n✅ Setup looks good! Deploy as a Web app and add the URL as a webhook in MeetBot.');
}
