// Admin dashboard: list bookings, filter by status, update status inline.
// Auth is enforced server-side via HTTP Basic Auth on /admin and /api/admin/*;
// the browser caches the credentials for this origin after the first prompt.

let allBookings = [];
let activeFilter = "";

function formatMoney(n) {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    ", " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

async function loadBookings() {
  const res = await fetch("/api/admin/bookings");
  if (res.status === 401) {
    document.getElementById("bookings-body").innerHTML =
      '<tr><td colspan="11">Authentication required. Refresh the page and sign in.</td></tr>';
    return;
  }
  const data = await res.json();
  allBookings = data.bookings || [];
  renderStats();
  renderTable();
}

function renderStats() {
  const total = allBookings.length;
  const pending = allBookings.filter((b) => b.status === "pending").length;
  const confirmed = allBookings.filter((b) => b.status === "confirmed").length;
  const revenue = allBookings
    .filter((b) => b.status === "confirmed" || b.status === "completed")
    .reduce((sum, b) => sum + (Number(b.price_estimate) || 0), 0);

  document.getElementById("stats").innerHTML = `
    <div class="stat-pill"><b>${total}</b>Total Requests</div>
    <div class="stat-pill"><b>${pending}</b>Pending</div>
    <div class="stat-pill"><b>${confirmed}</b>Confirmed</div>
    <div class="stat-pill"><b>${formatMoney(revenue)}</b>Confirmed Revenue</div>
  `;
}

function renderTable() {
  const rows = activeFilter ? allBookings.filter((b) => b.status === activeFilter) : allBookings;
  const body = document.getElementById("bookings-body");

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="11">No bookings in this view.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map((b) => {
      const addonNames = (b.addons || []).join(", ") || "—";
      return `
      <tr>
        <td><strong>${formatDate(b.event_date)}</strong>${b.start_time ? `<br><span class="help">${b.start_time}${b.end_time ? "–" + b.end_time : ""}</span>` : ""}</td>
        <td>${escapeHtml(b.customer_name)}</td>
        <td>${escapeHtml(b.customer_email)}<br><span class="help">${escapeHtml(b.customer_phone || "")}</span></td>
        <td>${escapeHtml(b.package_name || "")}</td>
        <td>${escapeHtml(addonNames)}</td>
        <td>${formatMoney(b.price_estimate)}</td>
        <td>${escapeHtml(b.event_type || "")}</td>
        <td>${escapeHtml(b.venue_name || "—")}</td>
        <td><span class="status-tag status-${b.status}">${b.status}</span></td>
        <td>${formatDateTime(b.created_at)}</td>
        <td class="row-actions">
          <select data-id="${b.id}">
            <option value="pending" ${b.status === "pending" ? "selected" : ""}>Pending</option>
            <option value="confirmed" ${b.status === "confirmed" ? "selected" : ""}>Confirmed</option>
            <option value="completed" ${b.status === "completed" ? "selected" : ""}>Completed</option>
            <option value="cancelled" ${b.status === "cancelled" ? "selected" : ""}>Cancelled</option>
          </select>
        </td>
      </tr>
    `;
    })
    .join("");

  body.querySelectorAll("select[data-id]").forEach((sel) => {
    sel.addEventListener("change", () => updateStatus(sel.dataset.id, sel.value));
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

async function updateStatus(id, status) {
  const res = await fetch(`/api/admin/bookings/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    alert("Could not update status. Please try again.");
    return;
  }
  const data = await res.json();
  const idx = allBookings.findIndex((b) => b.id === id);
  if (idx !== -1) allBookings[idx] = data.booking;
  renderStats();
  renderTable();
}

document.getElementById("filters").addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-btn");
  if (!btn) return;
  document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  activeFilter = btn.dataset.status;
  renderTable();
});

loadBookings();
