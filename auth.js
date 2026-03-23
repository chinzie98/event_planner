const SUPABASE_URL = "https://lrexnbwtysxtndwveicb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyZXhuYnd0eXN4dG5kd3ZlaWNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDQwMTQsImV4cCI6MjA4OTUyMDAxNH0.tGFVylONs9d7W-BNAOoMl8cb3G7XNICmNZ_seIm7U1Y";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let authInitialized = false;

async function initAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    updateNavForUser(currentUser);
  }
  authInitialized = true;

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (_event === "PASSWORD_RECOVERY") {
      openAuthModal("reset-password");
      return;
    }
    currentUser = session?.user ?? null;
    if (currentUser) {
      updateNavForUser(currentUser);
      closeAuthModal();
    } else {
      updateNavForGuest();
    }
  });
}

async function updateNavForUser(user) {
  const navUser = document.getElementById("nav-user");
  const navBtn = document.getElementById("nav-auth-btn");
  const tripsLink = document.getElementById("nav-trips-link");
  const upgradeBtn = document.getElementById("nav-upgrade-btn");

  if (navBtn) { navBtn.textContent = "Sign out"; navBtn.onclick = handleLogout; }
  if (tripsLink) tripsLink.style.display = "inline-flex";

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const token = session?.access_token || null;
    const res = await fetch(`/user-profile/${user.id}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const profile = await res.json();
    if (navUser) navUser.textContent = profile.username || user.email;
    if (upgradeBtn) {
      if (!profile.is_premium) {
        upgradeBtn.style.display = "inline-flex";
        upgradeBtn.onclick = () => {
          if (typeof openPremiumModal === "function") {
            openPremiumModal("general");
          } else {
            window.location.href = "/?upgrade=true";
          }
        };
      } else {
        upgradeBtn.style.display = "none";
      }
    }
  } catch {
    if (navUser) navUser.textContent = user.email;
  }
}

function updateNavForGuest() {
  const navUser = document.getElementById("nav-user");
  const navBtn = document.getElementById("nav-auth-btn");
  const tripsLink = document.getElementById("nav-trips-link");
  const upgradeBtn = document.getElementById("nav-upgrade-btn");

  if (navUser) navUser.textContent = "";
  if (navBtn) { navBtn.textContent = "Sign in"; navBtn.onclick = () => openAuthModal("login"); }
  if (tripsLink) tripsLink.style.display = "none";
  if (upgradeBtn) upgradeBtn.style.display = "none";
}

// =====================
// Sign In (username → email → Supabase)
// =====================
async function handleLogin() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  clearAuthError();
  if (!username || !password) return showAuthError("Please enter your username and password.");

  let email;
  try {
    const res = await fetch("/resolve-username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });
    if (res.status === 404) return showAuthError("Username not found.");
    if (!res.ok) return showAuthError("Could not sign in. Please try again.");
    const data = await res.json();
    email = data.email;
  } catch {
    return showAuthError("Could not reach the server. Please try again.");
  }

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) showAuthError(error.message);
}

// =====================
// Create Account
// =====================
async function handleSignup() {
  const username = document.getElementById("signup-username").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  clearAuthError();

  if (!username || !email || !password) return showAuthError("Please fill in all fields.");
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return showAuthError("Username must be 3–20 characters: letters, numbers, or underscores only.");
  if (password.length < 6) return showAuthError("Password must be at least 6 characters.");

  // Check username availability before creating the account
  try {
    const checkRes = await fetch("/check-username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });
    if (checkRes.status === 409) return showAuthError("Username is already taken.");
    if (!checkRes.ok) return showAuthError("Could not verify username. Please try again.");
  } catch {
    return showAuthError("Could not reach the server. Please try again.");
  }

  // Create the Supabase auth account
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) return showAuthError(error.message);

  // Store username linked to the new user ID
  if (data.user) {
    try {
      const setRes = await fetch("/set-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: data.user.id, username })
      });
      if (setRes.status === 409) {
        // Race condition — username was taken between check and set
        return showAuthError("That username was just taken. Please choose another.");
      }
    } catch {
      // Non-fatal — account created, username can be set on next sign-in
    }
  }

  showAuthError("Check your email to confirm your account!", "success");
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
}

async function getAuthToken() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session?.access_token || null;
}

// =====================
// Modal Navigation
// =====================
function openAuthModal(view = "login") {
  const modal = document.getElementById("auth-modal");
  if (modal) { modal.classList.add("open"); showView(view); clearAuthError(); }
}

function closeAuthModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.classList.remove("open");
}

function showView(view) {
  const views = ["login", "signup", "forgot-password", "forgot-username", "reset-password"];
  const tabs = document.getElementById("auth-tabs");

  views.forEach(v => {
    const el = document.getElementById(`${v}-form`);
    if (el) el.style.display = "none";
  });
  clearAuthError();

  const target = document.getElementById(`${view}-form`);
  if (target) target.style.display = "block";

  // Show tabs only for the primary login/signup views
  if (tabs) tabs.style.display = (view === "login" || view === "signup") ? "flex" : "none";
  if (view === "login" || view === "signup") {
    const tabLogin = document.getElementById("tab-login");
    const tabSignup = document.getElementById("tab-signup");
    if (tabLogin) tabLogin.classList.toggle("active", view === "login");
    if (tabSignup) tabSignup.classList.toggle("active", view === "signup");
  }
}

function switchTab(tab) {
  showView(tab);
}

// =====================
// Forgot Password
// =====================
async function handleForgotPassword() {
  const email = document.getElementById("reset-email").value.trim();
  clearAuthError();
  if (!email) return showAuthError("Please enter your email address.");

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });
  if (error) showAuthError(error.message);
  else showAuthError("Password reset email sent! Check your inbox.", "success");
}

// =====================
// Forgot Username
// =====================
async function handleForgotUsername() {
  const email = document.getElementById("lookup-email").value.trim();
  clearAuthError();
  if (!email) return showAuthError("Please enter your email address.");

  try {
    const res = await fetch(`/forgot-username?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    if (!res.ok) showAuthError("No account found with that email.");
    else showAuthError(`Your username is: ${data.username}`, "success");
  } catch {
    showAuthError("Could not reach the server. Please try again.");
  }
}

// =====================
// Password Reset (after clicking email link)
// =====================
async function handlePasswordReset() {
  const password = document.getElementById("new-password").value;
  clearAuthError();
  if (!password || password.length < 6) return showAuthError("Password must be at least 6 characters.");

  const { error } = await supabaseClient.auth.updateUser({ password });
  if (error) showAuthError(error.message);
  else {
    showAuthError("Password updated successfully!", "success");
    setTimeout(() => closeAuthModal(), 2000);
  }
}

// =====================
// Error Display
// =====================
function showAuthError(msg, type = "error") {
  const el = document.getElementById("auth-error");
  if (el) { el.textContent = msg; el.className = `auth-error ${type}`; }
}

function clearAuthError() {
  const el = document.getElementById("auth-error");
  if (el) { el.textContent = ""; el.className = "auth-error"; }
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("auth-modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeAuthModal();
    });
  }
  initAuth();
});
