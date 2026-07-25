// Good Times & Co. — website + booking engine server.
// Pure Node.js core modules only — no `npm install` required (Node 22.5+).

const http = require("http");
const path = require("path");
const fs = require("fs");
const { URL } = require("url");

loadDotEnvIfPresent();

const db = require("./db");
const {
  PACKAGES,
  ADDONS,
  CORPORATE_MULTIPLIER,
  isWeddingEvent,
  getPackageById,
  getAddonById,
} = require("./packages");
const {
  sendJSON,
  readJSON,
  requireAuth,
  isValidDate,
  isFutureOrToday,
  EMAIL_RE,
} = require("./utils");

const PORT = parseInt(process.env.PORT || "3000", 10);
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function loadDotEnvIfPresent() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === "/" ? "/index.html" : pathname;

  // Friendly URLs: /booking -> /booking.html, /admin -> /admin.html
  if (!path.extname(filePath)) {
    filePath += ".html";
  }

  const resolved = path.normalize(path.join(PUBLIC_DIR, filePath));
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, "404.html"), (err2, data2) => {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end(err2 ? "Not found" : data2);
      });
      return;
    }
    const ext = path.extname(resolved);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function calcPriceEstimate(pkg, addonIds, eventType) {
  // Corporate & non-wedding events are priced at a multiplier over the wedding
  // rate card for the same booth/hours — add-ons stay flat.
  let base = pkg.price;
  if (!isWeddingEvent(eventType)) {
    base = Math.round(base * CORPORATE_MULTIPLIER);
  }
  let total = base;
  for (const id of addonIds) {
    const addon = getAddonById(id);
    if (addon) total += addon.price;
  }
  return total;
}

async function handleApi(req, res, pathname, query) {
  // GET /api/packages
  if (req.method === "GET" && pathname === "/api/packages") {
    return sendJSON(res, 200, {
      packages: PACKAGES,
      addons: ADDONS,
      corporateMultiplier: CORPORATE_MULTIPLIER,
      weddingEventType: "Wedding",
    });
  }

  // GET /api/availability?month=YYYY-MM
  if (req.method === "GET" && pathname === "/api/availability") {
    const month = query.get("month");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return sendJSON(res, 400, { error: "month must be in YYYY-MM format" });
    }
    const counts = db.monthCounts(month);
    const fullyBooked = Object.entries(counts)
      .filter(([, n]) => n >= db.DAILY_CAPACITY)
      .map(([date]) => date);
    return sendJSON(res, 200, { month, fullyBooked, capacity: db.DAILY_CAPACITY });
  }

  // POST /api/bookings
  if (req.method === "POST" && pathname === "/api/bookings") {
    let body;
    try {
      body = await readJSON(req);
    } catch (e) {
      return sendJSON(res, e.status || 400, { error: e.message });
    }

    const errors = [];
    const pkg = getPackageById(body.package_id);
    if (!pkg) errors.push("Please choose a valid package.");

    if (!body.event_date || !isValidDate(body.event_date)) {
      errors.push("Please choose a valid event date.");
    } else if (!isFutureOrToday(body.event_date)) {
      errors.push("Event date must be today or later.");
    }

    if (!body.customer_name || !body.customer_name.trim()) {
      errors.push("Full name is required.");
    }
    if (!body.customer_email || !EMAIL_RE.test(body.customer_email)) {
      errors.push("A valid email is required.");
    }
    if (!body.customer_phone || !body.customer_phone.trim()) {
      errors.push("Phone number is required.");
    }
    if (!body.event_type || !body.event_type.trim()) {
      errors.push("Please select an event type.");
    }

    const addonIds = Array.isArray(body.addons)
      ? body.addons.filter((id) => getAddonById(id))
      : [];

    if (errors.length) {
      return sendJSON(res, 422, { error: "Validation failed", details: errors });
    }

    if (!db.isDateAvailable(body.event_date)) {
      return sendJSON(res, 409, {
        error: "That date just got booked. Please pick another date.",
      });
    }

    const booking = db.create({
      package_id: pkg.id,
      package_name: pkg.name,
      event_date: body.event_date,
      start_time: body.start_time || null,
      end_time: body.end_time || null,
      event_type: body.event_type,
      venue_name: body.venue_name || null,
      venue_address: body.venue_address || null,
      guest_count: body.guest_count ? parseInt(body.guest_count, 10) : null,
      addons: addonIds,
      customer_name: body.customer_name.trim(),
      customer_email: body.customer_email.trim(),
      customer_phone: body.customer_phone.trim(),
      notes: body.notes || null,
      price_estimate: calcPriceEstimate(pkg, addonIds, body.event_type),
    });

    return sendJSON(res, 201, { booking });
  }

  // --- Admin routes (protected) ---
  if (pathname.startsWith("/api/admin/")) {
    if (!requireAuth(req, res)) return;

    if (req.method === "GET" && pathname === "/api/admin/bookings") {
      const status = query.get("status") || undefined;
      return sendJSON(res, 200, { bookings: db.list(status) });
    }

    const statusMatch = pathname.match(/^\/api\/admin\/bookings\/([^/]+)\/status$/);
    if (req.method === "PATCH" && statusMatch) {
      let body;
      try {
        body = await readJSON(req);
      } catch (e) {
        return sendJSON(res, e.status || 400, { error: e.message });
      }
      const allowed = ["pending", "confirmed", "cancelled", "completed"];
      if (!allowed.includes(body.status)) {
        return sendJSON(res, 400, { error: `status must be one of: ${allowed.join(", ")}` });
      }
      const updated = db.updateStatus(statusMatch[1], body.status);
      if (!updated) return sendJSON(res, 404, { error: "Booking not found" });
      return sendJSON(res, 200, { booking: updated });
    }

    return sendJSON(res, 404, { error: "Not found" });
  }

  return sendJSON(res, 404, { error: "Not found" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname, url.searchParams);
      return;
    }

    if (pathname === "/admin" || pathname === "/admin.html") {
      if (!requireAuth(req, res)) return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end("Method not allowed");
      return;
    }

    serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Good Times & Co. server running at http://localhost:${PORT}`);
  console.log(`Storage backend: ${db.backendKind}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
});
