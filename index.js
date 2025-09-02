// index.js
import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json({ limit: "2mb" }));

// --- auth helpers ---
function isAuthorized(req, bodyToken) {
  const auth = req.headers["authorization"] || "";
  const envToken = process.env.RENDER_TOKEN || "";
  const basicUser = process.env.BASIC_USER || "";
  const basicPass = process.env.BASIC_PASS || "";

  // Bearer token
  if (envToken && auth.startsWith("Bearer ")) {
    const tok = auth.slice("Bearer ".length).trim();
    if (tok && tok === envToken) return true;
  }
  // Basic auth
  if (basicUser && basicPass && auth.startsWith("Basic ")) {
    try {
      const [u, p] = Buffer.from(auth.slice(6), "base64")
        .toString("utf8")
        .split(":");
      if (u === basicUser && p === basicPass) return true;
    } catch {}
  }
  // Fallback: token in body
  if (envToken && bodyToken && bodyToken === envToken) return true;

  return !envToken && !(basicUser || basicPass); // open if no secrets configured
}

// --- health ---
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// --- render to PDF ---
app.post("/pdf", async (req, res) => {
  const {
    url,
    // PDF options
    format = "A4",
    margin = "10mm",
    scale = 1.0,
    displayHeaderFooter = false,
    headerTemplate,
    footerTemplate,
    preferCSSPageSize = true,

    // Navigation / render options
    wait = "networkidle0",
    timeout_ms = 60000,
    emulateMedia = "print",
    viewport = { width: 1280, height: 1600, deviceScaleFactor: 2 },
    cookies = [],
    readySelector,          // e.g. "#resume-root.ready"
    readyFunction,          // e.g. "window.c4jReady===true"
    extraCss                // optional CSS string injected before printing
  } = req.body || {};

  if (!isAuthorized(req, req.body?.token)) {
    return res.status(401).send("unauthorized");
  }
  if (!url) {
    return res.status(400).send("missing url");
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();

    // Viewport and media
    if (viewport) await page.setViewport(viewport);
    await page.emulateMediaType(emulateMedia || "print");

    // Cookies for auth-required pages
    if (Array.isArray(cookies) && cookies.length) {
      await page.setCookie(...cookies);
    }

    // Go to page and wait
    await page.goto(url, { waitUntil: wait, timeout: timeout_ms });

    // Optional: inject CSS before print to normalize layout
    if (extraCss && typeof extraCss === "string") {
      await page.addStyleTag({ content: extraCss });
    }

    // Ensure fonts and late JS are ready
    try {
      await page.evaluate(async () => {
        // Wait for web fonts
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }
      });
    } catch {}

    if (readySelector) {
      await page.waitForSelector(readySelector, { timeout: timeout_ms });
    }
    if (readyFunction) {
      await page.waitForFunction(readyFunction, { timeout: timeout_ms });
    }

    // Produce PDF
    const pdf = await page.pdf({
      format,
      printBackground: true,
      margin: { top: margin, right: margin, bottom: margin, left: margin },
      scale,
      preferCSSPageSize,
      displayHeaderFooter,
      headerTemplate,
      footerTemplate
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", 'inline; filename="render.pdf"');
    return res.send(pdf);
  } catch (err) {
    res.status(500).send(String(err));
  } finally {
    try { if (browser) await browser.close(); } catch {}
  }
});

// default root
app.get("/", (_req, res) => res.status(200).send("pdf-renderer ready"));

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`pdf-renderer listening on ${port}`);
});
