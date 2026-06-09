const SHEET_URL = "https://script.google.com/macros/s/AKfycbxz9KrTHaErxIYeiqdI5iLdrKgWN8NQPA_zZwUcXoqzlV_yb9T-aeVeGGUqFsHNf865Og/exec";

/* =============================================
   ON PAGE LOAD — redirect if already logged in
============================================= */
document.addEventListener("DOMContentLoaded", () => {
  const auth  = localStorage.getItem("annotator_auth");
  const token = localStorage.getItem("annotator_token");
  const name  = localStorage.getItem("annotator_name");

  // Already logged in — go straight to tool
  if (auth === "true" && token && name) {
    window.location.href = "index.html";
    return;
  }

  // Show login form
  document.getElementById("login-container").style.display = "flex";
  setTimeout(() => document.getElementById("login-name")?.focus(), 50);
});

/* =============================================
   SUBMIT LOGIN
============================================= */
function submitLogin() {
  const nameEl  = document.getElementById("login-name");
  const passEl  = document.getElementById("login-pass");
  const errorEl = document.getElementById("login-error");
  const btnEl   = document.querySelector(".login-card button");

  const name = nameEl.value.trim();
  const pass = passEl.value.trim();

  if (!name || !pass) {
    errorEl.textContent = "Please enter both name and password.";
    return;
  }

  btnEl.textContent = "Signing in…";
  btnEl.disabled    = true;
  errorEl.textContent = "";

  const url = `${SHEET_URL}?type=auth&name=${encodeURIComponent(name)}&password=${encodeURIComponent(pass)}`;

  fetch(url)
    .then(r => r.json())
    .then(res => {
      if (res.ok && res.token) {
        // Save everything to localStorage so it persists across refreshes
        localStorage.setItem("annotator_name",  name);
        localStorage.setItem("annotator_auth",  "true");
        localStorage.setItem("annotator_token", res.token);

        // Also set sessionStorage for current session
        sessionStorage.setItem("annotator_name",  name);
        sessionStorage.setItem("annotator_auth",  "true");
        sessionStorage.setItem("annotator_token", res.token);

        window.location.href = "index.html";

      } else {
        errorEl.textContent = "✗ Incorrect credentials. Please try again.";
        passEl.value = "";
        passEl.focus();
        btnEl.textContent  = "Sign In →";
        btnEl.disabled     = false;
      }
    })
    .catch(err => {
      console.error("Login error:", err);

      // On localhost CORS error — warn but allow bypass for testing
      if (window.location.hostname === "localhost" || 
          window.location.hostname === "127.0.0.1") {
        errorEl.textContent = "⚠ CORS blocked on localhost — deploy to Netlify to test login. Use test bypass below.";
        errorEl.style.color = "#92400E";

        // Local dev bypass — remove before sharing with annotators
        const bypass = document.getElementById("dev-bypass");
        if (bypass) bypass.style.display = "block";
      } else {
        errorEl.textContent = "✗ Could not reach server. Check your connection.";
      }

      btnEl.textContent = "Sign In →";
      btnEl.disabled    = false;
    });
}

/* =============================================
   DEV BYPASS — local testing only
   This button is hidden in the HTML by default
   Remove or keep hidden before deploying
============================================= */
function devBypass() {
  const name = document.getElementById("login-name").value.trim() || "Annotator_T";
  localStorage.setItem("annotator_name",  name);
  localStorage.setItem("annotator_auth",  "true");
  localStorage.setItem("annotator_token", "dev-token-local");
  sessionStorage.setItem("annotator_name",  name);
  sessionStorage.setItem("annotator_auth",  "true");
  sessionStorage.setItem("annotator_token", "dev-token-local");
  window.location.href = "index.html";
}

/* =============================================
   ENTER KEY SUPPORT
============================================= */
document.addEventListener("keydown", e => {
  if (e.key === "Enter") submitLogin();
});
