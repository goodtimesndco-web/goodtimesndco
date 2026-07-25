const crypto = require("crypto");

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, maxBytes = 1e6) {
  return new Promise((resolve, reject) => {
    let data = "";
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function readJSON(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("Invalid JSON body");
    err.status = 400;
    throw err;
  }
}

// Constant-time-ish basic auth check for the admin area.
function checkBasicAuth(req) {
  const user = process.env.ADMIN_USER || "admin";
  const pass = process.env.ADMIN_PASS || "changeme123";

  const header = req.headers["authorization"] || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return false;

  let decoded;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return false;
  }
  const sep = decoded.indexOf(":");
  if (sep === -1) return false;
  const gotUser = decoded.slice(0, sep);
  const gotPass = decoded.slice(sep + 1);

  const a = Buffer.from(gotUser);
  const b = Buffer.from(user);
  const c = Buffer.from(gotPass);
  const d = Buffer.from(pass);

  const userOk = a.length === b.length && crypto.timingSafeEqual(a, b);
  const passOk = c.length === d.length && crypto.timingSafeEqual(c, d);
  return userOk && passOk;
}

function requireAuth(req, res) {
  if (checkBasicAuth(req)) return true;
  res.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="Good Times & Co. Admin"',
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify({ error: "Authentication required" }));
  return false;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidDate(str) {
  if (!DATE_RE.test(str)) return false;
  const d = new Date(str + "T00:00:00Z");
  return !Number.isNaN(d.getTime());
}

function isFutureOrToday(str) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(str + "T00:00:00");
  return d.getTime() >= today.getTime();
}

module.exports = {
  sendJSON,
  readJSON,
  requireAuth,
  checkBasicAuth,
  isValidDate,
  isFutureOrToday,
  EMAIL_RE,
};
