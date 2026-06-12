const SHEET_URL      = "https://script.google.com/macros/s/AKfycbyZ0u_14oI9Nha9zZcPETZf9jLaJOr-RjB5twlGChtj4tJuVnWYf2B_JgxsCaI1KfNKkw/exec";
//const ANNOTATOR_NAME = "Annotator_T";

// login page

// authentication
function showLoginScreen() {
  console.log("showLoginScreen called");
  document.getElementById("login-container").style.display = "flex";
  // Focus name field
  setTimeout(() => document.getElementById("login-name")?.focus(), 50);
}


function hideLoginScreen() {
  document.getElementById("login-container").style.display = "none";
}

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

  fetch(
  `${SHEET_URL}?type=auth&name=${encodeURIComponent(name)}&password=${encodeURIComponent(pass)}`
)
    .then(r => r.json())
    .then(res => {
      if (res.ok) {
        sessionStorage.setItem("annotator_name", name);
        sessionStorage.setItem("annotator_auth", "true");
        window.ANNOTATOR_NAME_ACTIVE = name;
        if (res.ok) {

            localStorage.setItem(
                "annotator_name",
                name
            );

            localStorage.setItem(
                "annotator_auth",
                "true"
            );

            window.location.href =
                "index.html";
            }
        } else {
        errorEl.textContent = "✗ Incorrect credentials. Please try again.";
        passEl.value = "";
        passEl.focus();
        btnEl.textContent = "Sign In →";
        btnEl.disabled    = false;
      }
    })
    .catch(() => {
      errorEl.textContent = "✗ Could not reach server. Check your connection.";
      btnEl.textContent = "Sign In →";
      btnEl.disabled    = false;
    });
}

document.addEventListener("DOMContentLoaded", () => {

  const auth =
    localStorage.getItem("annotator_auth");

  if (auth === "true") {

    window.location.href =
      "index.html";
  }

  showLoginScreen();
});
