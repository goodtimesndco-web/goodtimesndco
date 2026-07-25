// Shared behavior across all pages: mobile nav toggle + active link highlight.
document.addEventListener("DOMContentLoaded", () => {
  const nav = document.querySelector(".nav");
  const toggle = document.querySelector(".nav-toggle");
  if (toggle && nav) {
    toggle.addEventListener("click", () => nav.classList.toggle("open"));
  }

  const here = window.location.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
  document.querySelectorAll(".nav-links a").forEach((link) => {
    const linkPath = link.getAttribute("href").replace(/\.html$/, "");
    if (linkPath === here || (here === "/" && linkPath === "/")) {
      link.classList.add("active");
    }
  });
});
