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

  if (navUser) navUser.textContent = user.email;
  if (navBtn) { navBtn.textContent = "Sign out"; navBtn.onclick = handleLogout; }
  if (tripsLink) tripsLink.style.display = "inline-flex";

  if (upgradeBtn) {
    try {
      const res = await fetch(`/user-profile/${user.id}`);
      const profile = await res.json();
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
    } catch {
      // Non-fatal — skip showing the button
    }
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

async function handleLogin() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  clearAuthError();
  if (!email || !password) return showAuthError("Please enter your email and password.");
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) showAuthError(error.message);
}

async function handleSignup() {
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  clearAuthError();
  if (!email || !password) return showAuthError("Please fill in all fields.");
  if (password.length < 6) return showAuthError("Password must be at least 6 characters.");
  const { error } = await supabaseClient.auth.signUp({ email, password });
  if (error) { showAuthError(error.message); }
  else { showAuthError("Check your email to confirm your account!", "success"); }
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
}

function openAuthModal(tab = "login") {
  const modal = document.getElementById("auth-modal");
  if (modal) { modal.classList.add("open"); switchTab(tab); clearAuthError(); }
}

function closeAuthModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.classList.remove("open");
}

function switchTab(tab) {
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  const tabLogin = document.getElementById("tab-login");
  const tabSignup = document.getElementById("tab-signup");
  if (loginForm) loginForm.style.display = tab === "login" ? "block" : "none";
  if (signupForm) signupForm.style.display = tab === "signup" ? "block" : "none";
  if (tabLogin) tabLogin.classList.toggle("active", tab === "login");
  if (tabSignup) tabSignup.classList.toggle("active", tab === "signup");
  clearAuthError();
}

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