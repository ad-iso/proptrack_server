/**
 * PropTrack Pro — Combined App + SMS Proxy Server
 *
 * Serves the PropTrack HTML app AND proxies SMS via Twilio.
 * Running everything from one server fixes the browser's
 * "failed to fetch" error that occurs when opening the HTML
 * file directly (file:// protocol blocks fetch to localhost).
 *
 * Usage:
 *   Mac/Linux:
 *     export TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *     export TWILIO_AUTH_TOKEN=your_auth_token
 *     node server.js
 *
 *   Windows CMD:
 *     set TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *     set TWILIO_AUTH_TOKEN=your_auth_token
 *     node server.js
 *
 *   Windows PowerShell:
 *     $env:TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *     $env:TWILIO_AUTH_TOKEN="..."
 *     node server.js
 *
 * Then open:  http://localhost:3000
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '+18336571839';
const PORT               = process.env.PORT || 3000;
const APP_FILE           = path.join(__dirname, 'proptrack-pro.html');

// ── STARTUP VALIDATION ────────────────────────────────────────────────────────
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.error('\n❌  Missing Twilio credentials. Set these environment variables:\n');
  if (!TWILIO_ACCOUNT_SID) console.error('   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  if (!TWILIO_AUTH_TOKEN)  console.error('   TWILIO_AUTH_TOKEN=your_auth_token\n');
  console.error('Mac/Linux:');
  console.error('  export TWILIO_ACCOUNT_SID=AC...');
  console.error('  export TWILIO_AUTH_TOKEN=...');
  console.error('  node server.js\n');
  console.error('Windows CMD:');
  console.error('  set TWILIO_ACCOUNT_SID=AC...');
  console.error('  set TWILIO_AUTH_TOKEN=...');
  console.error('  node server.js\n');
  console.error('Windows PowerShell:');
  console.error('  $env:TWILIO_ACCOUNT_SID="AC..."');
  console.error('  $env:TWILIO_AUTH_TOKEN="..."');
  console.error('  node server.js\n');
  process.exit(1);
}

if (!fs.existsSync(APP_FILE)) {
  console.error(`\n❌  Cannot find proptrack-pro.html in: ${__dirname}`);
  console.error('Make sure server.js and proptrack-pro.html are in the same folder.\n');
  process.exit(1);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function normalizePhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function sendTwilioSMS(to, body) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      To:   to,
      From: TWILIO_FROM_NUMBER,
      Body: body,
    }).toString();

    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
    const options = {
      hostname: 'api.twilio.com',
      path:     `/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      method:   'POST',
      headers:  {
        'Authorization':  `Basic ${auth}`,
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ sid: parsed.sid, to: parsed.to, status: parsed.status });
          } else {
            reject(new Error(parsed.message || `Twilio HTTP ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error(`Bad Twilio response: ${data.slice(0, 100)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── SERVER ────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // Serve the PropTrack app HTML
  if (req.method === 'GET' && (pathname === '/' || pathname === '/proptrack-pro.html')) {
    try {
      const html = fs.readFileSync(APP_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500);
      res.end('Could not read proptrack-pro.html');
    }
    return;
  }

  // Health check
  if (req.method === 'GET' && pathname === '/health') {
    json(res, 200, { status: 'ok', from: TWILIO_FROM_NUMBER, time: new Date().toISOString() });
    return;
  }

  // POST /send — unicast SMS
  if (req.method === 'POST' && pathname === '/send') {
    try {
      const { phone, message } = await readBody(req);
      if (!phone)   throw new Error('phone is required');
      if (!message) throw new Error('message is required');
      const to = normalizePhone(phone);
      console.log(`[SMS] unicast → ${to}  "${message.slice(0, 60)}"`);
      const result = await sendTwilioSMS(to, message);
      console.log(`[SMS] ✓ SID ${result.sid}`);
      json(res, 200, { ok: true, ...result });
    } catch (err) {
      console.error(`[SMS] ✗ ${err.message}`);
      json(res, 400, { ok: false, error: err.message });
    }
    return;
  }

  // POST /broadcast — send to multiple recipients
  if (req.method === 'POST' && pathname === '/broadcast') {
    try {
      const { phones, message } = await readBody(req);
      if (!Array.isArray(phones) || !phones.length) throw new Error('phones[] array is required');
      if (!message) throw new Error('message is required');
      console.log(`[SMS] broadcast → ${phones.length} recipients`);
      const results = [];
      const errors  = [];
      for (const raw of phones) {
        const to = normalizePhone(raw);
        try {
          const r = await sendTwilioSMS(to, message);
          console.log(`[SMS]   ✓ ${to}  SID ${r.sid}`);
          results.push({ to, sid: r.sid, status: r.status });
        } catch (e) {
          console.error(`[SMS]   ✗ ${to}  ${e.message}`);
          errors.push({ to, error: e.message });
        }
        if (phones.length > 1) await sleep(250);
      }
      json(res, 200, { ok: errors.length === 0, sent: results.length, failed: errors.length, results, errors });
    } catch (err) {
      console.error(`[SMS] broadcast ✗ ${err.message}`);
      json(res, 400, { ok: false, error: err.message });
    }
    return;
  }

  // 404
  json(res, 404, { error: `Not found: ${pathname}` });
});

server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║      PropTrack Pro  —  SMS Proxy Server      ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  console.log(`  ✅  Running at:   http://localhost:${PORT}`);
  console.log(`  📱  Twilio from:  ${TWILIO_FROM_NUMBER}`);
  console.log(`  📄  Serving:      proptrack-pro.html\n`);
  console.log('  ──────────────────────────────────────────────');
  console.log(`  👉  Open in browser:  http://localhost:${PORT}`);
  console.log('  ──────────────────────────────────────────────\n');
  console.log('  Press Ctrl+C to stop.\n');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌  Port ${PORT} already in use. Try:  PORT=3001 node server.js\n`);
  } else {
    console.error('\n❌  Server error:', err.message);
  }
  process.exit(1);
});
