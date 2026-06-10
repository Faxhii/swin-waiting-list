require('dotenv').config(); // Load .env file automatically

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app       = express();
const PORT      = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'waitlist.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Data helpers ──────────────────────────────────────────────────────────────
function ensureDataFile() {
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE))
    fs.writeFileSync(DATA_FILE, JSON.stringify({ entries: [] }, null, 2));
}

function readData() {
  ensureDataFile();
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { entries: [] }; }
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── Google Sheets webhook ─────────────────────────────────────────────────────
async function sendToGoogleSheets(entry) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return; // silently skip if not configured

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
      signal: AbortSignal.timeout(8000), // 8 second timeout
    });
    const text = await res.text();
    console.log(`[SWIN] ✅ Google Sheets → ${res.status} ${text}`);
  } catch (err) {
    console.error(`[SWIN] ⚠️  Google Sheets webhook failed: ${err.message}`);
    // Don't throw — the signup is still saved locally
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/count
app.get('/api/count', (req, res) => {
  const data = readData();
  res.json({ count: data.entries.length });
});

// POST /api/join
app.post('/api/join', async (req, res) => {
  const { name, whatsapp, size, city, interest, referral } = req.body;

  // Validate required fields
  if (!name || typeof name !== 'string' || name.trim().length < 2)
    return res.status(400).json({ error: 'Please enter your name.', field: 'name' });

  if (!whatsapp || typeof whatsapp !== 'string')
    return res.status(400).json({ error: 'WhatsApp number is required.', field: 'whatsapp' });

  const cleanedNumber = whatsapp.trim();
  if (cleanedNumber.replace(/[\s\-\+()]/g, '').length < 7)
    return res.status(400).json({ error: 'Please enter a valid WhatsApp number.', field: 'whatsapp' });

  if (!size || !['XS','S','M','L','XL','XXL'].includes(size))
    return res.status(400).json({ error: 'Please select your size.', field: 'size' });

  const data = readData();

  // Prevent duplicates
  if (data.entries.some(e => e.whatsapp === cleanedNumber))
    return res.status(409).json({ error: 'This number is already on the list! 🖤', alreadyJoined: true });

  const entry = {
    name:      name.trim(),
    whatsapp:  cleanedNumber,
    size,
    city:      city     ? city.trim()     : '',
    interest:  interest || '',
    referral:  referral || '',
    joinedAt:  new Date().toISOString(),
  };

  // Save locally first (never loses data)
  data.entries.push(entry);
  writeData(data);

  console.log(`[SWIN] 🖤 ${entry.name} (${entry.whatsapp}) | Size: ${entry.size} | Total: ${data.entries.length}`);

  // Then push to Google Sheets (async, non-blocking)
  sendToGoogleSheets(entry);

  res.json({ success: true, count: data.entries.length });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  const sheetsStatus = process.env.WEBHOOK_URL
    ? '✅ Google Sheets connected'
    : '⚠️  Google Sheets NOT configured (set WEBHOOK_URL in .env)';

  console.log(`
🖤 SWIN Waitlist running at http://localhost:${PORT}
${sheetsStatus}
  `);
});
