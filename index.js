// index.js
import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json({ limit: "2mb" }));

// ---- auth ----
function isAuthorized(req, bodyToken) {
  const auth = req.headers["authorization"] || "";
  const envToken = process.env.RENDER_TOKEN || "";
  const basicUser = process.env.BASIC_USER || "";
  const basicPass = process.env.BASIC_PASS || "";

  // Bearer
  if (envToken && auth.startsWith("Bearer ")) {
    const tok = auth.slice(7).trim();
    if (tok && tok === envToken) return true;
  }
  // Basic
  if (basicUser && basicPass && auth.startsWith("Basic ")) {
    try {
      const [u, p] = Buffer.from(auth.slice(6), "base64")
        .toString("utf8")
        .split(":");
      if (u === basicUser && p === basicPass) return true;
    } catch {}
  }
  // Fallback body token
  if (envToken && bodyToken && bodyToken === envToken) return true;

  // If no secrets configured, allow
  return !envToken && !(basicUser || basicPass);
}

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// ---- HTML -> PDF ----
app.post("/pdf", async (req, res) => {
  const {
    url,

    // PDF options (let your @page control size/margins if possible)
    format,                    // omit to rely on @page
    margin = "0",              // set "0" so @page margins apply
    scale = 1.0,
    displayHeaderFooter = false,
    headerTemplate,
    footerTemplate,
    preferCSSPageSize = true,  // key to mirror Chrome Print

    // Navigation / rendering
    wait = "networkidle0",
    timeout_ms = 90000,
    emulateMedia = "print",
    viewport = { width: 1280, height: 1800, deviceScaleFactor: 2 },
    cookies = [],
    readySelector,             // optional: "#resume-root.ready"
    readyFunction              // optional: "window.c4jReady===true"
  } = req.body || {};

  if (!isAuthorized(req, req.body?.token)) return res.status(401).send("unauthorized");
  if (!url) return res.status(400).send("missing url");

  let browser;
  try {
    browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();

    if (viewport) await page.setViewport(viewport);
    await page.emulateMediaType(emulateMedia || "print");

    if (Array.isArray(cookies) && cookies.length) {
      await page.setCookie(...cookies);
    }

    await page.goto(url, { waitUntil: wait, timeout: timeout_ms });

    // Make headless behave like Chrome Print
    await page.evaluate(async () => {
      // Fire beforeprint hooks some themes/addons rely on
      try { window.dispatchEvent(new Event("beforeprint")); } catch {}

      // Disable lazyload so offscreen images load
      document.querySelectorAll('img[loading="lazy"]').forEach(img => {
        img.setAttribute("loading", "eager");
        img.decoding = "sync";
      });

      // Wait for all images to complete
      await Promise.all(Array.from(document.images).map(img => {
        if (img.complete) return;
        return new Promise(res => { img.onload = img.onerror = res; });
      }));

      // Ensure web fonts are loaded
      try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch {}

      // Small settle
      await new Promise(r => setTimeout(r, 50));
    });

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
    if (format) opts.format = format; // only if you explicitly provide it

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

// ---- root ----
app.get("/", (_req, res) => res.status(200).send("pdf-renderer ready"));

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`pdf-renderer listening on ${port}`);
});
