import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json({ limit: "2mb" }));

function isAuthorized(req) {
  const bearer = req.headers["authorization"] || "";
  const envToken = process.env.RENDER_TOKEN;
  const basicUser = process.env.BASIC_USER;
  const basicPass = process.env.BASIC_PASS;

  // Support Bearer token
  if (envToken && bearer.startsWith("Bearer ")) {
    const token = bearer.replace("Bearer ", "").trim();
    if (token && token === envToken) return true;
  }

  // Support Basic auth
  if (basicUser && basicPass && bearer.startsWith("Basic ")) {
    const b64 = bearer.replace("Basic ", "").trim();
    try {
      const [u, p] = Buffer.from(b64, "base64").toString("utf8").split(":");
      if (u === basicUser && p === basicPass) return true;
    } catch {}
  }

  // Optional: token in body (fallback)
  if (envToken && req.body && req.body.token && req.body.token === envToken) return true;

  return false;
}

app.get("/healthz", (_, res) => res.status(200).send("ok"));

app.post("/pdf", async (req, res) => {
  try {
    if (!isAuthorized(req)) return res.status(401).send("unauthorized");

    const {
      url,
      margin = "10mm",
      format = "A4",
      wait = "networkidle0",
      timeout_ms = 60000,
      viewport = { width: 1280, height: 1600, deviceScaleFactor: 1 },
      cookies = [],
      emulateMedia = "screen",
      scale = 1.0
    } = req.body || {};

    if (!url) return res.status(400).send("missing url");

    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();

    await page.setViewport(viewport);
    if (cookies?.length) {
      await page.setCookie(...cookies);
    }
    if (emulateMedia) {
      await page.emulateMediaType(emulateMedia);
    }

    await page.goto(url, { waitUntil: wait, timeout: timeout_ms });

    const pdf = await page.pdf({
      format,
      printBackground: true,
      margin: { top: margin, right: margin, bottom: margin, left: margin },
      scale
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(pdf);
  } catch (e) {
    return res.status(500).send(String(e));
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`pdf-renderer listening on ${port}`);
});
