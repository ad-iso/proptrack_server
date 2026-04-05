# PropTrack Pro — SMS Proxy Server

Serves the PropTrack app AND proxies SMS messages through Twilio.
Opening from `http://localhost:3000` fixes the "failed to fetch" browser error
that happens when you open the HTML file directly.

## Requirements
- Node.js 18+ (check: `node --version`)
- Twilio account with an SMS phone number

## Setup

### 1 — Put these two files in the same folder
- `server.js`
- `proptrack-pro.html`

### 2 — Set your Twilio credentials as environment variables

**Mac / Linux (Terminal):**
```bash
export TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
export TWILIO_AUTH_TOKEN=your_auth_token_here
node server.js
```

**Windows — Command Prompt:**
```cmd
set TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
set TWILIO_AUTH_TOKEN=your_auth_token_here
node server.js
```

**Windows — PowerShell:**
```powershell
$env:TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
$env:TWILIO_AUTH_TOKEN="your_auth_token_here"
node server.js
```

### 3 — Open the app in your browser
```
http://localhost:3000
```

You should see PropTrack Pro load. SMS buttons now call Twilio directly — no
native SMS app opens, messages are sent silently in the background.

## Why not just open the HTML file?

Browsers block `fetch()` calls to `http://localhost` from pages loaded via
`file://` (this is called the "mixed content" or "same-origin" policy).
Serving both the app and the API from the same `http://localhost:3000` origin
bypasses this restriction entirely.

## API Endpoints

| Method | Path         | Body                              | Description        |
|--------|--------------|-----------------------------------|--------------------|
| GET    | /            | —                                 | PropTrack app      |
| GET    | /health      | —                                 | Server status      |
| POST   | /send        | `{ phone, message }`              | Send to one tenant |
| POST   | /broadcast   | `{ phones: [...], message }`      | Send to many       |

## Deploying to the cloud (access from any device)

### Railway (recommended — free tier)
1. Push this folder to a GitHub repo
2. railway.app → New Project → Deploy from GitHub
3. Add env vars in the Railway dashboard
4. Use the Railway URL in `SMS_PROXY_URL` inside `proptrack-pro.html`

### Render (also free)
Same steps — render.com → New Web Service

### ngrok (quick local tunnel for testing on phone)
```bash
npx ngrok http 3000
# Use the https://xxxxx.ngrok.io URL as SMS_PROXY_URL
```

## Twilio trial account note
Trial accounts can only send SMS to **verified** phone numbers.
Go to Twilio Console → Verified Caller IDs to add test numbers.
Upgrade to a paid account to send to anyone.
