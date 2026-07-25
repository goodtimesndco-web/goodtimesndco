// Booking page: package selection, live calendar availability, and submission.

const state = {
  packages: [],
  addons: [],
  selectedPackage: null,
  selectedAddons: new Set(),
  viewYear: null,
  viewMonth: null, // 0-indexed
  selectedDate: null, // "YYYY-MM-DD"
  fullyBookedDates: new Set(),
  availabilityCache: {}, // "YYYY-MM" -> Set of fully booked dates
  corporateMultiplier: 1.75,
  weddingEventType: "Wedding",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatMoney(n) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function isCorporateRate() {
  const eventType = document.getElementById("event_type")?.value;
  // Before an event type is chosen, assume wedding rate (the base rate card).
  return eventType && eventType !== state.weddingEventType;
}

function currentTotal() {
  if (!state.selectedPackage) return 0;
  let base = state.selectedPackage.price;
  if (isCorporateRate()) {
    base = Math.round(base * state.corporateMultiplier);
  }
  let total = base;
  for (const id of state.selectedAddons) {
    const addon = state.addons.find((a) => a.id === id);
    if (addon) total += addon.price;
  }
  return total;
}

function renderPackages() {
  const wrap = document.getElementById("pkg-select");
  wrap.innerHTML = state.packages
    .map(
      (p) => `
    <div class="pkg-option ${state.selectedPackage && state.selectedPackage.id === p.id ? "selected" : ""}" data-id="${p.id}">
      <div>
        <div class="name">${p.name}</div>
        <div class="sub">${p.hours} hrs &middot; ${p.tagline}</div>
      </div>
      <div class="amount">${formatMoney(p.price)}</div>
    </div>
  `
    )
    .join("");

  wrap.querySelectorAll(".pkg-option").forEach((el) => {
    el.addEventListener("click", () => {
      state.selectedPackage = state.packages.find((p) => p.id === el.dataset.id);
      renderPackages();
      updateTotal();
    });
  });
}

function renderAddons() {
  const wrap = document.getElementById("addons-select");
  wrap.innerHTML = state.addons
    .map(
      (a) => `
    <div class="addon-row">
      <label>
        <input type="checkbox" data-id="${a.id}" ${state.selectedAddons.has(a.id) ? "checked" : ""} />
        ${a.name}
      </label>
      <span class="amount">+${formatMoney(a.price)}</span>
    </div>
  `
    )
    .join("");

  wrap.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) state.selectedAddons.add(cb.dataset.id);
      else state.selectedAddons.delete(cb.dataset.id);
      updateTotal();
    });
  });
}

function updateTotal() {
  document.getElementById("total-display").textContent = formatMoney(currentTotal());
  const note = document.getElementById("total-note");
  if (note) {
    note.textContent = isCorporateRate()
      ? `Corporate/non-wedding rate applied (${state.corporateMultiplier}x wedding rate card).`
      : "";
  }
}

async function fetchAvailability(year, month) {
  const key = `${year}-${String(month + 1).padStart(2, "0")}`;
  if (state.availabilityCache[key]) return state.availabilityCache[key];
  const res = await fetch(`/api/availability?month=${key}`);
  const data = await res.json();
  const set = new Set(data.fullyBooked || []);
  state.availabilityCache[key] = set;
  return set;
}

async function renderCalendar() {
  const grid = document.getElementById("cal-grid");
  const title = document.getElementById("cal-title");
  title.textContent = `${MONTH_NAMES[state.viewMonth]} ${state.viewYear}`;

  const booked = await fetchAvailability(state.viewYear, state.viewMonth);
  const today = todayISO();

  const firstOfMonth = new Date(state.viewYear, state.viewMonth, 1);
  const startDow = firstOfMonth.getDay();
  const daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();

  let html = "";
  ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].forEach((d) => {
    html += `<div class="dow">${d}</div>`;
  });
  for (let i = 0; i < startDow; i++) html += `<div class="day-cell empty"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${state.viewYear}-${String(state.viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isPast = iso < today;
    const isBooked = booked.has(iso);
    const isSelected = state.selectedDate === iso;

    let cls = "day-cell";
    if (isPast) cls += " past";
    else if (isBooked) cls += " booked";
    else cls += " available";
    if (isSelected) cls += " selected";

    html += `<div class="${cls}" data-date="${iso}">${day}</div>`;
  }

  grid.innerHTML = html;

  grid.querySelectorAll(".day-cell.available").forEach((cell) => {
    cell.addEventListener("click", () => {
      state.selectedDate = cell.dataset.date;
      renderCalendar();
      showSelectedBanner();
    });
  });
}

function showSelectedBanner() {
  const banner = document.getElementById("selected-date-banner");
  if (!state.selectedDate) {
    banner.classList.add("hidden");
    return;
  }
  const d = new Date(state.selectedDate + "T00:00:00");
  const formatted = d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  banner.textContent = `Selected date: ${formatted}`;
  banner.classList.remove("hidden");
}

function showError(messages) {
  const box = document.getElementById("form-error");
  const list = Array.isArray(messages) ? messages : [messages];
  box.innerHTML = `<strong>Please fix the following:</strong><ul>${list.map((m) => `<li>${m}</li>`).join("")}</ul>`;
  box.classList.remove("hidden");
  box.scrollIntoView({ behavior: "smooth", block: "center" });
}

function hideError() {
  document.getElementById("form-error").classList.add("hidden");
}

async function init() {
  const res = await fetch("/api/packages");
  const data = await res.json();
  state.packages = data.packages;
  state.addons = data.addons;
  state.corporateMultiplier = data.corporateMultiplier || state.corporateMultiplier;
  state.weddingEventType = data.weddingEventType || state.weddingEventType;

  const params = new URLSearchParams(window.location.search);
  const preselect = params.get("package");
  state.selectedPackage =
    state.packages.find((p) => p.id === preselect) ||
    state.packages.find((p) => p.featured) ||
    state.packages[0];

  renderPackages();
  renderAddons();
  updateTotal();

  const now = new Date();
  state.viewYear = now.getFullYear();
  state.viewMonth = now.getMonth();
  await renderCalendar();

  document.getElementById("cal-prev").addEventListener("click", async () => {
    state.viewMonth -= 1;
    if (state.viewMonth < 0) {
      state.viewMonth = 11;
      state.viewYear -= 1;
    }
    await renderCalendar();
  });
  document.getElementById("cal-next").addEventListener("click", async () => {
    state.viewMonth += 1;
    if (state.viewMonth > 11) {
      state.viewMonth = 0;
      state.viewYear += 1;
    }
    await renderCalendar();
  });

  document.getElementById("event_type").addEventListener("change", updateTotal);

  document.getElementById("booking-form").addEventListener("submit", onSubmit);
}

async function onSubmit(e) {
  e.preventDefault();
  hideError();

  const errors = [];
  if (!state.selectedPackage) errors.push("Please choose a package.");
  if (!state.selectedDate) errors.push("Please select an available date on the calendar.");

  const customer_name = document.getElementById("customer_name").value.trim();
  const customer_email = document.getElementById("customer_email").value.trim();
  const customer_phone = document.getElementById("customer_phone").value.trim();
  const event_type = document.getElementById("event_type").value;

  if (!customer_name) errors.push("Full name is required.");
  if (!customer_email) errors.push("Email is required.");
  if (!customer_phone) errors.push("Phone number is required.");
  if (!event_type) errors.push("Please select an event type.");

  if (errors.length) {
    showError(errors);
    return;
  }

  const payload = {
    package_id: state.selectedPackage.id,
    addons: Array.from(state.selectedAddons),
    event_date: state.selectedDate,
    start_time: document.getElementById("start_time").value || null,
    end_time: document.getElementById("end_time").value || null,
    event_type,
    venue_name: document.getElementById("venue_name").value || null,
    venue_address: document.getElementById("venue_address").value || null,
    guest_count: document.getElementById("guest_count").value || null,
    customer_name,
    customer_email,
    customer_phone,
    notes: document.getElementById("notes").value || null,
  };

  const btn = document.getElementById("submit-btn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Submitting…';

  try {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 409) {
        showError(data.error);
        // Refresh calendar to reflect the now-taken date.
        delete state.availabilityCache[`${state.viewYear}-${String(state.viewMonth + 1).padStart(2, "0")}`];
        state.selectedDate = null;
        await renderCalendar();
        showSelectedBanner();
      } else {
        showError(data.details || data.error || "Something went wrong. Please try again.");
      }
      btn.disabled = false;
      btn.textContent = "Request This Date";
      return;
    }

    showSuccess(data.booking);
  } catch (err) {
    showError("Network error — please check your connection and try again.");
    btn.disabled = false;
    btn.textContent = "Request This Date";
  }
}

function showSuccess(booking) {
  document.getElementById("booking-form").classList.add("hidden");
  document.getElementById("booking-success").classList.remove("hidden");
  document.getElementById("success-name").textContent = booking.customer_name.split(" ")[0];
  document.getElementById("success-message").textContent =
    "Your date request has been received. We'll reach out shortly to confirm the details.";
  document.getElementById("s-package").textContent = booking.package_name;
  const d = new Date(booking.event_date + "T00:00:00");
  document.getElementById("s-date").textContent = d.toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  document.getElementById("s-total").textContent = formatMoney(booking.price_estimate);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

init();
