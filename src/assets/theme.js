const storageKey = "lilykekerun-theme";
const root = document.documentElement;
const toggle = document.querySelector("[data-theme-toggle]");

function activeTheme() {
  return root.dataset.theme === "dark" ? "dark" : "light";
}

function updateToggle() {
  if (!toggle) return;
  const nextTheme = activeTheme() === "dark" ? "浅色" : "深色";
  toggle.setAttribute("aria-label", `切换到${nextTheme}模式`);
  toggle.setAttribute("aria-pressed", String(activeTheme() === "dark"));
  const label = toggle.querySelector("[data-theme-label]");
  if (label) label.textContent = nextTheme;
}

toggle?.addEventListener("click", () => {
  const theme = activeTheme() === "dark" ? "light" : "dark";
  root.dataset.theme = theme;
  localStorage.setItem(storageKey, theme);
  updateToggle();
});

updateToggle();
