// index.js
import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json({ limit: "2mb" }));

// --- auth ---
function isAuthorized(req, bodyToken) {
  const auth = req.headers["authorization"] || "";
  const envToken = process.env.RENDER_TOKEN || "";
  const basicUser = process.env.BASIC_USER || "";
  const basicPass = process.env.BASIC_PASS || "";

  if (envToken && auth.startsWith("Bearer ")) {
    const tok = auth.slice(7).trim();
    if (tok === envToken) return true;
  }
  if (basicUser && basicPass && auth.startsWith("Basic ")) {
    try {
      const [u, p] = Buffer.from(auth.slice(6), "base64").toString("utf8").split(":");
      if (u === basicUser && p === basicPass) return true;
    } catch {}
  }
  if (envToken && bodyToken && bodyToken === envToken) return true;

  return !envToken && !(basicUser || basicPass); // open if no secrets set
}

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.post("/pdf", async (req, res) => {
  const {
    url,
    // PDF options (use your own @page from CSS; format is optional)
    format,                   // e.g. "A4" (omit to rely on @page)
    margin = "10mm",          // set to "0" if @page defines margins
    scale = 1.0,
    displayHeaderFooter = false,
    headerTemplate,
    footerTemplate,
    preferCSSPageSize = true, // respect @page size like Chrome Print

    // Navigation / rendering
    wait = "networkidle0",
    timeout_ms = 60000,
    emulateMedia = "print",   // key: use print styles
    viewport = { width: 1280, height: 1600, deviceScaleFactor: 2 },
    cookies = [],
    readySelector,            // optional: "#resume-root.ready"
    readyFunction             // optional: "window.c4jReady===true"
  } = req.body || {};

  if (!isAuthorized(req, req.body?.token)) return res.status(401).send("unauthorized");
  if (!url) return res.status(400).send("missing url");

  let browser;
  try {
    browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();

    if (viewport) await page.setViewport(viewport);
    await page.emulateMediaType(emulateMedia || "print");

    if (Array.isArray(cookies) && cookies.length) {
      await page.setCookie(...cookies);
    }

    await page.goto(url, { waitUntil: wait, timeout: timeout_ms });

    // Ensure fonts and late JS are ready (Chrome Print behavior)
    try {
      await page.evaluate(async () => {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
      });
    } catch {}

    if (readySelector) await page.waitForSelector(readySelector, { timeout: timeout_ms });
    if (readyFunction) await page.waitForFunction(readyFunction, { timeout: timeout_ms });

    const opts = {
      printBackground: true,
      margin: { top: margin, right: margin, bottom: margin, left: margin },
      scale,
      preferCSSPageSize,
      displayHeaderFooter,
      headerTemplate,
      footerTemplate
    };
    if (format) opts.format = format; // only if you explicitly pass it

    const pdf = await page.pdf(opts);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", 'inline; filename="render.pdf"');
    return res.send(pdf);
  } catch (err) {
    return res.status(500).send(String(err));
  } finally {
    try { if (browser) await browser.close(); } catch {}
  }
});

app.get("/", (_req, res) => res.status(200).send("pdf-renderer ready"));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`pdf-renderer listening on ${port}`));
