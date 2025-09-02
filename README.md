# pdf-renderer (Cloud Run)

Chromium-based HTML → PDF service using Puppeteer.

## Auth
- Bearer token: set secret env `RENDER_TOKEN`, send `Authorization: Bearer <token>`.
- Basic auth: set secret env `BASIC_USER` and `BASIC_PASS`, send `Authorization: Basic base64(user:pass)`.

## API
POST /pdf
```json
{
  "url": "https://example.com/resume",
  "format": "A4",
  "margin": "10mm",
  "wait": "networkidle0",
  "timeout_ms": 60000,
  "viewport": {"width":1280,"height":1600,"deviceScaleFactor":1},
  "emulateMedia": "screen",
  "scale": 1.0
}
```
Response: `application/pdf` bytes.
