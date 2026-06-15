/**
 * SWIN Waitlist — Google Apps Script
 *
 * HOW TO USE:
 * 1. Open your Google Sheet → Extensions → Apps Script
 * 2. Delete everything, paste this file, Save
 * 3. Deploy → New deployment → Web app
 *    Execute as: Me  |  Who has access: Anyone
 * 4. Copy the Web App URL → paste into .env as WEBHOOK_URL=
 *
 * NOTE: Every time you change this script you MUST create a
 * NEW deployment (not update existing) for changes to take effect.
 */

/**
 * GET endpoint — returns the current signup count.
 * The server calls this same URL (WEBHOOK_URL) via GET to get a persistent count.
 * This survives Vercel cold starts because the data lives in Google Sheets.
 */
function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    // subtract 1 for the header row (returns 0 if sheet is empty)
    const count = Math.max(0, sheet.getLastRow() - 1);
    return ContentService
      .createTextOutput(JSON.stringify({ count: count }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ count: 0, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data  = JSON.parse(e.postData.contents);

    // ── First-time sheet setup ────────────────────────────────────
    if (sheet.getLastRow() === 0) {

      // Force entire column B (WhatsApp) to plain text format
      // Do this BEFORE writing any data
      sheet.getRange('B:B').setNumberFormat('@');
      SpreadsheetApp.flush(); // commit format before any writes

      // Write header row
      sheet.appendRow([
        '✅ Name',
        '📱 WhatsApp',
        '👕 Size',
        '🏙️ City',
        '🔥 Most Excited For',
        '📣 How They Found Us',
        '🕐 Joined At (IST)',
      ]);

      // Style header
      const h = sheet.getRange(1, 1, 1, 7);
      h.setFontWeight('bold');
      h.setBackground('#000000');
      h.setFontColor('#ffffff');
      h.setFontSize(10);
      sheet.setFrozenRows(1);
    }

    // ── Format timestamp ──────────────────────────────────────────
    const joinedAt = data.joinedAt
      ? new Date(data.joinedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const nextRow = sheet.getLastRow() + 1;

    // ── KEY FIX: Write WhatsApp cell in a separate step ───────────
    // Step 1: write all columns EXCEPT WhatsApp (leave B blank)
    sheet.getRange(nextRow, 1, 1, 7).setValues([[
      data.name     || '—',
      '',                      // WhatsApp written separately below
      data.size     || '—',
      data.city     || '—',
      data.interest || '—',
      data.referral || '—',
      joinedAt,
    ]]);

    // Step 2: Set column B cell format to plain text and flush
    const waCell = sheet.getRange(nextRow, 2);
    waCell.setNumberFormat('@');
    SpreadsheetApp.flush(); // commit the text format BEFORE writing value

    // Step 3: Now write the phone number — Sheets won't parse it as formula
    waCell.setValue(data.whatsapp || '—');

    // Auto-resize
    sheet.autoResizeColumns(1, 7);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('SWIN error: ' + err.message);
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * ─── RUN THIS to fix the existing #ERROR! rows ───────────────────
 * In Apps Script: click Run → fixExistingRows
 * It will repair all broken WhatsApp cells in your sheet.
 */
function fixExistingRows() {
  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('No data rows found.'); return; }

  let fixed = 0;
  for (let row = 2; row <= lastRow; row++) {
    const cell = sheet.getRange(row, 2);

    // Set format to text first, flush, then re-set the value
    cell.setNumberFormat('@');
    SpreadsheetApp.flush();

    const raw = cell.getDisplayValue(); // getDisplayValue avoids triggering formula
    if (raw) {
      cell.setValue(raw);
      fixed++;
    }
  }
  Logger.log('Fixed ' + fixed + ' rows. Check your sheet.');
}

/**
 * ─── Test without the website ────────────────────────────────────
 * In Apps Script: click Run → testEntry
 */
function testEntry() {
  const fake = {
    postData: {
      contents: JSON.stringify({
        name:      'Test User',
        whatsapp:  '+91 98765 43210',
        size:      'L',
        city:      'Mumbai',
        interest:  'Hoodies',
        referral:  'Instagram',
        joinedAt:  new Date().toISOString(),
      }),
    },
  };
  Logger.log(doPost(fake).getContent());
}
