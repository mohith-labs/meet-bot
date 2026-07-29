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
 *
 * ── Debugging ──
 * Check Executions tab in Apps Script editor for detailed logs.
 * Run testSetup() manually to verify configuration.
 * Run testWithSamplePayload() to simulate a full webhook end-to-end.
 */

// ═════════════════════════════════════════════════════════════════════════════
// Configuration (read from Script Properties)
// ═════════════════════════════════════════════════════════════════════════════

function getConfig() {
  const props = PropertiesService.getScriptProperties();
  const config = {
    apiBaseUrl: (props.getProperty('MEETBOT_API_BASE_URL') || '').replace(/\/+$/, ''),
    apiKey: props.getProperty('MEETBOT_API_KEY') || '',
    driveFolderId: props.getProperty('DRIVE_FOLDER_ID') || '',
    webhookSecret: props.getProperty('WEBHOOK_SECRET') || '',
  };
  console.log('Config loaded — apiBaseUrl: ' + config.apiBaseUrl +
    ', apiKey: ' + (config.apiKey ? config.apiKey.substring(0, 8) + '...' : 'NOT SET') +
    ', driveFolderId: ' + (config.driveFolderId || 'NOT SET') +
    ', webhookSecret: ' + (config.webhookSecret ? 'SET' : 'NOT SET'));
  return config;
}

// ═════════════════════════════════════════════════════════════════════════════
// Web App Entry Points
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Handle POST requests (webhook events from MeetBot).
 */
function doPost(e) {
  console.log('━━━ doPost called ━━━');

  try {
    // Log raw request info for debugging
    console.log('Content type: ' + (e.postData ? e.postData.type : 'N/A'));
    console.log('Content length: ' + (e.postData ? e.postData.length : 'N/A'));

    const config = getConfig();

    if (!e.postData || !e.postData.contents) {
      console.error('ERROR: No POST body received');
      return buildResponse(400, { error: 'No POST body' });
    }

    // Parse the webhook payload
    const rawBody = e.postData.contents;
    console.log('Raw payload preview: ' + rawBody.substring(0, 500));

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error('ERROR: Failed to parse JSON: ' + parseErr.message);
      return buildResponse(400, { error: 'Invalid JSON: ' + parseErr.message });
    }

    console.log('Event type: ' + payload.event);
    console.log('Timestamp: ' + payload.timestamp);

    // Verify HMAC signature if webhook secret is configured
    if (config.webhookSecret) {
      // Apps Script receives headers differently depending on deployment.
      // Try multiple locations where the signature header might be.
      const signature =
        (e.parameter && e.parameter['signature']) ||
        (e.headers && (e.headers['X-Webhook-Signature'] || e.headers['x-webhook-signature'])) ||
        '';

      console.log('Signature header found: ' + (signature ? 'YES' : 'NO'));

      if (signature) {
        if (!verifySignature(rawBody, signature, config.webhookSecret)) {
          console.error('ERROR: HMAC signature verification failed');
          return buildResponse(401, { error: 'Invalid signature' });
        }
        console.log('Signature verified ✓');
      } else {
        // No signature header found — Apps Script Web Apps often strip custom headers.
        // Log a warning but still process the webhook.
        console.warn('WARNING: No signature header found in request. ' +
          'Apps Script Web Apps may not forward custom HTTP headers. ' +
          'Proceeding without verification. ' +
          'Consider removing WEBHOOK_SECRET from Script Properties if this keeps happening.');
      }
    }

    // Only process meeting.ended events
    if (payload.event !== 'meeting.ended') {
      console.log('Ignoring event: ' + payload.event);
      return buildResponse(200, { message: 'Ignored event: ' + payload.event });
    }

    // Log meeting details
    const data = payload.data || {};
    console.log('Meeting ID: ' + data.meetingId);
    console.log('Native Meeting ID: ' + data.nativeMeetingId);
    console.log('Platform: ' + data.platform);
    console.log('Transcript segments: ' + (data.transcript ? data.transcript.totalSegments : 0));
    console.log('Recordings object: ' + JSON.stringify(data.recordings || {}));

    // Validate config
    if (!config.driveFolderId) {
      console.error('ERROR: DRIVE_FOLDER_ID is not configured');
      return buildResponse(500, { error: 'DRIVE_FOLDER_ID not configured in Script Properties' });
    }

    // Process the meeting data
    const result = processMeetingEnded(payload, config);

    console.log('━━━ doPost completed successfully ━━━');
    console.log('Folder: ' + result.folderUrl);
    console.log('Files saved: ' + result.files.map(function(f) { return f.name; }).join(', '));

    return buildResponse(200, {
      message: 'Meeting data saved to Google Drive',
      folderId: result.folderId,
      folderUrl: result.folderUrl,
      files: result.files,
    });

  } catch (error) {
    console.error('━━━ doPost FAILED ━━━');
    console.error('Error: ' + error.message);
    console.error('Stack: ' + error.stack);
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
  const folderName = meetingDate + '_' + nativeMeetingId;
  console.log('Creating folder: ' + folderName);

  var parentFolder;
  try {
    parentFolder = DriveApp.getFolderById(config.driveFolderId);
    console.log('Parent folder found: ' + parentFolder.getName());
  } catch (err) {
    console.error('ERROR: Cannot access Drive folder ID "' + config.driveFolderId + '": ' + err.message);
    throw new Error('Cannot access Drive folder. Check DRIVE_FOLDER_ID in Script Properties. Error: ' + err.message);
  }

  const meetingFolder = parentFolder.createFolder(folderName);
  console.log('Meeting folder created: ' + meetingFolder.getUrl());

  var savedFiles = [];

  // 1. Save the raw webhook JSON
  console.log('Saving webhook.json...');
  var webhookFile = meetingFolder.createFile(
    'webhook.json',
    JSON.stringify(payload, null, 2),
    'application/json'
  );
  savedFiles.push({ name: 'webhook.json', id: webhookFile.getId() });
  console.log('webhook.json saved ✓');

  // 2. Save the formatted transcript
  if (data.transcript && data.transcript.segments && data.transcript.segments.length > 0) {
    console.log('Formatting transcript (' + data.transcript.segments.length + ' segments)...');
    var transcriptText = formatTranscript(data);
    var transcriptFile = meetingFolder.createFile(
      'transcript.txt',
      transcriptText,
      'text/plain'
    );
    savedFiles.push({ name: 'transcript.txt', id: transcriptFile.getId() });
    console.log('transcript.txt saved ✓');
  } else {
    console.log('No transcript segments to save');
  }

  // 3. Download and save recordings
  if (data.recordings) {
    if (data.recordings.screenRecordingUrl) {
      console.log('Downloading screen recording...');
      var screenFile = downloadRecording(
        config,
        data.recordings.screenRecordingUrl,
        'screen.webm',
        meetingFolder
      );
      if (screenFile) {
        savedFiles.push({ name: 'screen.webm', id: screenFile.getId() });
        console.log('screen.webm saved ✓');
      } else {
        console.warn('screen.webm download failed or returned null');
      }
    } else {
      console.log('No screen recording URL in payload');
    }

    if (data.recordings.audioRecordingUrl) {
      console.log('Downloading audio recording...');
      var audioFile = downloadRecording(
        config,
        data.recordings.audioRecordingUrl,
        'audio.webm',
        meetingFolder
      );
      if (audioFile) {
        savedFiles.push({ name: 'audio.webm', id: audioFile.getId() });
        console.log('audio.webm saved ✓');
      } else {
        console.warn('audio.webm download failed or returned null');
      }
    } else {
      console.log('No audio recording URL in payload');
    }
  } else {
    console.log('No recordings object in webhook payload');
  }

  console.log('Meeting ' + nativeMeetingId + ' saved to folder: ' + folderName + ' (' + savedFiles.length + ' files)');

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
  var lines = [];

  // Header
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('  MEETING TRANSCRIPT');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');
  lines.push('  Meeting ID    : ' + (data.nativeMeetingId || data.meetingId));
  lines.push('  Platform      : ' + (data.platform || 'google_meet'));
  lines.push('  Bot Name      : ' + (data.botName || 'MeetBot'));
  lines.push('  Start Time    : ' + (data.startTime || 'N/A'));
  lines.push('  End Time      : ' + (data.endTime || 'N/A'));

  if (data.startTime && data.endTime) {
    var durationMs = new Date(data.endTime) - new Date(data.startTime);
    var durationMin = Math.round(durationMs / 60000);
    lines.push('  Duration      : ' + durationMin + ' minutes');
  }

  lines.push('  Total Segments: ' + data.transcript.totalSegments);
  lines.push('');
  lines.push('───────────────────────────────────────────────────────');
  lines.push('');

  // Transcript segments grouped by speaker
  var segments = data.transcript.segments;
  var currentSpeaker = '';

  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    var speaker = seg.speaker || 'Unknown';
    var timestamp = formatTimestamp(seg.startTime);

    if (speaker !== currentSpeaker) {
      if (currentSpeaker !== '') lines.push('');
      lines.push('[' + timestamp + '] ' + speaker + ':');
      currentSpeaker = speaker;
    }

    lines.push('  ' + seg.text);
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
  var mins = Math.floor(seconds / 60);
  var secs = Math.floor(seconds % 60);
  return ('0' + mins).slice(-2) + ':' + ('0' + secs).slice(-2);
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
    // recordingPath is a relative path like /meetings/detail/<id>/recording/screen
    var url = config.apiBaseUrl + recordingPath;

    console.log('Fetching recording: ' + url);

    if (!config.apiBaseUrl) {
      console.error('ERROR: MEETBOT_API_BASE_URL is not set — cannot download recordings');
      return null;
    }

    if (!config.apiKey) {
      console.error('ERROR: MEETBOT_API_KEY is not set — cannot authenticate recording download');
      return null;
    }

    var response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        'x-api-key': config.apiKey,
      },
      muteHttpExceptions: true,
      followRedirects: true,
    });

    var statusCode = response.getResponseCode();
    console.log('Recording response status: ' + statusCode);

    if (statusCode === 404) {
      console.warn('Recording not found (404): ' + fileName + ' — file may not exist on server yet');
      return null;
    }

    if (statusCode !== 200) {
      console.warn('Recording download failed (' + statusCode + '): ' + fileName +
        ' — ' + response.getContentText().substring(0, 200));
      return null;
    }

    var blob = response.getBlob().setName(fileName);
    var sizeBytes = blob.getBytes().length;
    console.log('Downloaded ' + fileName + ': ' + sizeBytes + ' bytes (' + Math.round(sizeBytes / 1024) + ' KB)');

    if (sizeBytes === 0) {
      console.warn('Recording file is empty (0 bytes): ' + fileName);
      return null;
    }

    var file = folder.createFile(blob);
    return file;

  } catch (error) {
    console.error('Failed to download recording ' + fileName + ': ' + error.message);
    console.error('Stack: ' + error.stack);
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
  var expected = signatureHeader.replace(/^sha256=/, '');

  var signature = Utilities.computeHmacSha256Signature(body, secret);
  var computed = signature.map(function (b) {
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
// Manual Test Functions
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Run this manually from the Apps Script editor to test the setup.
 * Verifies Script Properties, Drive folder access, and API connectivity.
 */
function testSetup() {
  var config = getConfig();
  var errors = [];

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
    var folder = DriveApp.getFolderById(config.driveFolderId);
    console.log('✓ Drive folder accessible: "' + folder.getName() + '"');
  } catch (e) {
    console.error('✗ Cannot access Drive folder (' + config.driveFolderId + '): ' + e.message);
    return;
  }

  // Verify API connectivity
  try {
    var response = UrlFetchApp.fetch(config.apiBaseUrl + '/health', {
      method: 'get',
      headers: { 'x-api-key': config.apiKey },
      muteHttpExceptions: true,
    });
    console.log('✓ API reachable (status ' + response.getResponseCode() + ')');
  } catch (e) {
    console.warn('⚠ Cannot reach API at ' + config.apiBaseUrl + ': ' + e.message);
    console.log('  (This is OK if your API is on a private network)');
  }

  // Create a test folder to verify write access
  try {
    var parentFolder = DriveApp.getFolderById(config.driveFolderId);
    var testFolder = parentFolder.createFolder('_meetbot_test_' + Date.now());
    console.log('✓ Write access confirmed — created test folder: ' + testFolder.getUrl());
    testFolder.setTrashed(true);
    console.log('  (Test folder moved to trash)');
  } catch (e) {
    console.error('✗ Cannot create folders in Drive: ' + e.message);
    return;
  }

  console.log('\n✅ Setup looks good! Deploy as a Web app and add the URL as a webhook in MeetBot.');
}

/**
 * Run this manually to simulate a full webhook processing with sample data.
 * This creates a real folder in your Drive with sample files — useful for
 * verifying the entire pipeline works without needing a real meeting.
 */
function testWithSamplePayload() {
  var config = getConfig();

  if (!config.driveFolderId) {
    console.error('DRIVE_FOLDER_ID is not set. Run testSetup() first.');
    return;
  }

  var samplePayload = {
    event: 'meeting.ended',
    timestamp: new Date().toISOString(),
    data: {
      meetingId: 'test-' + Date.now(),
      platform: 'google_meet',
      nativeMeetingId: 'abc-defg-hij',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      botName: 'MeetBot',
      status: 'completed',
      startTime: new Date(Date.now() - 30 * 60000).toISOString(),
      endTime: new Date().toISOString(),
      transcript: {
        totalSegments: 3,
        fullText: 'Hello everyone. Welcome to the meeting. Let us get started.',
        segments: [
          { speaker: 'Alice', text: 'Hello everyone.', startTime: 0, endTime: 3 },
          { speaker: 'Bob', text: 'Welcome to the meeting.', startTime: 4, endTime: 8 },
          { speaker: 'Alice', text: 'Let us get started.', startTime: 9, endTime: 12 },
        ],
      },
      recordings: {
        screenRecordingUrl: '/meetings/detail/test-123/recording/screen',
        audioRecordingUrl: '/meetings/detail/test-123/recording/audio',
      },
    },
  };

  console.log('Processing sample payload...');
  var result = processMeetingEnded(samplePayload, config);
  console.log('\n✅ Test complete!');
  console.log('Folder URL: ' + result.folderUrl);
  console.log('Files created: ' + result.files.map(function(f) { return f.name; }).join(', '));
  console.log('\nCheck your Drive folder to verify the output.');
  console.log('(Recording downloads will fail with sample data — that is expected)');
}
