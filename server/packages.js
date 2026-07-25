// Package catalog for Good Times & Co.
// Edit prices, names, and inclusions here — the site and booking form read from this file.
//
// Pricing structure (wedding rate card):
//   Essential  — digital-only entry tier, no print cost, framed as the small/casual-event option.
//   Signature  — the featured middle tier; unlimited prints + on-site attendant. Highest volume.
//   Bespoke    — top tier; keepsake guestbook, premium styling, priority booking.
//
// NOTE ON RANGES: the business brief gave price *ranges* per tier (e.g. Signature $2,400–2,900).
// The values below are the midpoint of each range. Adjust freely — nothing else in the code
// depends on the exact numbers.

const PACKAGES = [
  {
    id: "essential",
    name: "The Essential",
    price: 850, // range given: $750–950
    hours: "2",
    tagline: "Digital-only coverage with instant online sharing — ideal for smaller, casual celebrations.",
    features: [
      "2 hours of open-air photobooth service",
      "Instant digital gallery with QR code sharing",
      "Unlimited digital photos — no print station",
      "Self-serve friendly (attendant available on request)",
      "Gallery delivered the same day",
    ],
  },
  {
    id: "signature",
    name: "The Signature",
    price: 2650, // range given: $2,400–2,900
    hours: "3",
    tagline: "Our most-booked package — unlimited prints with a custom overlay matched to your invitation suite.",
    features: [
      "3 hours of open-air photobooth service",
      "Unlimited branded prints",
      "Custom print overlay matched to your invitation suite",
      "Professional on-site attendant",
      "Digital gallery delivered within 48 hours",
    ],
    featured: true,
  },
  {
    id: "bespoke",
    name: "The Bespoke",
    price: 4300, // range given: $3,800–4,800
    hours: "4–5",
    tagline: "Our most elevated experience — editorial-style styling for weddings and galas that want a signature moment.",
    features: [
      "4–5 hours of open-air or enclosed service",
      "Unlimited branded prints",
      "Bound keepsake guestbook included",
      "Premium prop & backdrop styling",
      "Priority booking on your date",
      "Editorial \"cover shoot\" styling — our signature differentiator",
    ],
  },
];

// A la carte add-ons — offered across all three tiers, not bundled by default.
// Add-ons carry most of the margin since the marginal cost of extending a booking
// you're already staffed for is close to zero.
const ADDONS = [
  { id: "extra-hour", name: "Additional hour", price: 350 }, // range: $300–400
  { id: "guest-book", name: "Keepsake guestbook / album (included in Bespoke)", price: 450 }, // range: $300–600
  { id: "premium-backdrop", name: "Premium backdrop / floral wall", price: 600 }, // range: $400–800
  { id: "second-attendant", name: "Second attendant or booth (200+ guests)", price: 800 }, // range: $800+
  { id: "keychain-station", name: "Keychain photo station (scales with guest count, from $500)", price: 750 }, // range: $500–1,500, shown as a representative starting price
];

// Corporate & non-wedding events are priced at a multiplier over the wedding rate card
// for the same booth and hours, per the brief (1.5–2x). 1.75x is the midpoint.
const CORPORATE_MULTIPLIER = 1.75;
const WEDDING_EVENT_TYPE = "Wedding";

function isWeddingEvent(eventType) {
  return eventType === WEDDING_EVENT_TYPE;
}

function getPackageById(id) {
  return PACKAGES.find((p) => p.id === id) || null;
}

function getAddonById(id) {
  return ADDONS.find((a) => a.id === id) || null;
}

module.exports = {
  PACKAGES,
  ADDONS,
  CORPORATE_MULTIPLIER,
  WEDDING_EVENT_TYPE,
  isWeddingEvent,
  getPackageById,
  getAddonById,
};
