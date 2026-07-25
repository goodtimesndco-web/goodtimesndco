// Storage layer for bookings.
//
// Zero external dependencies by design: this project runs with nothing but
// Node.js itself (`npm install` is not required).
//
// Primary backend: Node's built-in `node:sqlite` (available in Node 22.5+).
// Fallback backend: a JSON file on disk, used automatically if node:sqlite
// isn't available in the running Node version. Both backends expose the
// exact same functions so the rest of the app never needs to know which one
// is active.

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DAILY_CAPACITY = parseInt(process.env.DAILY_CAPACITY || "1", 10);

function newId() {
  return crypto.randomBytes(9).toString("base64url");
}

let backend;

try {
  const { DatabaseSync } = require("node:sqlite");
  const dbPath = path.join(DATA_DIR, "goodtimes.db");
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      package_id TEXT,
      package_name TEXT,
      event_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      event_type TEXT,
      venue_name TEXT,
      venue_address TEXT,
      guest_count INTEGER,
      addons TEXT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      notes TEXT,
      price_estimate REAL
    )
  `);

  backend = {
    kind: "sqlite",

    countForDate(eventDate) {
      const stmt = db.prepare(
        "SELECT COUNT(*) AS n FROM bookings WHERE event_date = ? AND status != 'cancelled'"
      );
      const row = stmt.get(eventDate);
      return row.n;
    },

    monthCounts(monthPrefix) {
      // monthPrefix like "2026-08"
      const stmt = db.prepare(
        "SELECT event_date, COUNT(*) AS n FROM bookings WHERE event_date LIKE ? AND status != 'cancelled' GROUP BY event_date"
      );
      const rows = stmt.all(`${monthPrefix}%`);
      const map = {};
      for (const r of rows) map[r.event_date] = r.n;
      return map;
    },

    create(data) {
      const id = newId();
      const stmt = db.prepare(`
        INSERT INTO bookings (
          id, created_at, status, package_id, package_name, event_date,
          start_time, end_time, event_type, venue_name, venue_address,
          guest_count, addons, customer_name, customer_email, customer_phone,
          notes, price_estimate
        ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        id,
        new Date().toISOString(),
        data.package_id,
        data.package_name,
        data.event_date,
        data.start_time,
        data.end_time,
        data.event_type,
        data.venue_name,
        data.venue_address,
        data.guest_count,
        JSON.stringify(data.addons || []),
        data.customer_name,
        data.customer_email,
        data.customer_phone,
        data.notes,
        data.price_estimate
      );
      return this.get(id);
    },

    get(id) {
      const stmt = db.prepare("SELECT * FROM bookings WHERE id = ?");
      const row = stmt.get(id);
      return row ? rowToBooking(row) : null;
    },

    list(status) {
      let rows;
      if (status) {
        rows = db
          .prepare("SELECT * FROM bookings WHERE status = ? ORDER BY event_date ASC")
          .all(status);
      } else {
        rows = db.prepare("SELECT * FROM bookings ORDER BY event_date ASC").all();
      }
      return rows.map(rowToBooking);
    },

    updateStatus(id, status) {
      db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, id);
      return this.get(id);
    },
  };

  function rowToBooking(row) {
    return { ...row, addons: safeParse(row.addons) };
  }
} catch (err) {
  // node:sqlite unavailable — fall back to a JSON file store.
  const filePath = path.join(DATA_DIR, "bookings.json");
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "[]", "utf8");

  function readAll() {
    return safeParse(fs.readFileSync(filePath, "utf8")) || [];
  }
  function writeAll(list) {
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2), "utf8");
  }

  backend = {
    kind: "json",

    countForDate(eventDate) {
      return readAll().filter((b) => b.event_date === eventDate && b.status !== "cancelled")
        .length;
    },

    monthCounts(monthPrefix) {
      const map = {};
      for (const b of readAll()) {
        if (b.status === "cancelled") continue;
        if (b.event_date && b.event_date.startsWith(monthPrefix)) {
          map[b.event_date] = (map[b.event_date] || 0) + 1;
        }
      }
      return map;
    },

    create(data) {
      const list = readAll();
      const booking = {
        id: newId(),
        created_at: new Date().toISOString(),
        status: "pending",
        package_id: data.package_id,
        package_name: data.package_name,
        event_date: data.event_date,
        start_time: data.start_time,
        end_time: data.end_time,
        event_type: data.event_type,
        venue_name: data.venue_name,
        venue_address: data.venue_address,
        guest_count: data.guest_count,
        addons: data.addons || [],
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        customer_phone: data.customer_phone,
        notes: data.notes,
        price_estimate: data.price_estimate,
      };
      list.push(booking);
      writeAll(list);
      return booking;
    },

    get(id) {
      return readAll().find((b) => b.id === id) || null;
    },

    list(status) {
      const all = readAll().sort((a, b) => (a.event_date > b.event_date ? 1 : -1));
      return status ? all.filter((b) => b.status === status) : all;
    },

    updateStatus(id, status) {
      const list = readAll();
      const idx = list.findIndex((b) => b.id === id);
      if (idx === -1) return null;
      list[idx].status = status;
      writeAll(list);
      return list[idx];
    },
  };
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// Business rule: how many events Good Times & Co. can cover on one date.
function isDateAvailable(eventDate) {
  return backend.countForDate(eventDate) < DAILY_CAPACITY;
}

module.exports = {
  ...backend,
  isDateAvailable,
  DAILY_CAPACITY,
  backendKind: backend.kind,
};
