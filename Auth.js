// =====================
// Supabase Config
// Replace these two values with your own from supabase.com
// Project Settings → API → Project URL and anon/public key
// =====================
//changed file name to auth.js and added auth functions
const SUPABASE_URL = "https://lrexnbwtysxtndwveicb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyZXhuYnd0eXN4dG5kd3ZlaWNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDQwMTQsImV4cCI6MjA4OTUyMDAxNH0.tGFVylONs9d7W-BNAOoMl8cb3G7XNICmNZ_seIm7U1Y";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =====================
// Session Management
// =====================
let currentUser = null;

async function initAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    updateNavForUser(currentUser);
  }

  // Listen for auth state changes (login/logout)
  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    if (currentUser) {
      updateNavForUser(currentUser);
      closeAuthModal();
    } else {
      updateNavForGuest();
    }
  });
}

function updateNavForUser(user) {
  const navUser = document.getElementById("nav-user");
  const navBtn = document.getElementById("nav-auth-btn");
  navUser.textContent = user.email;
  navBtn.textContent = "Sign out";
  navBtn.onclick = handleLogout;
}

function updateNavForGuest() {
  const navUser = document.getElementById("nav-user");
  const navBtn = document.getElementById("nav-auth-btn");
  navUser.textContent = "";
  navBtn.textContent = "Sign in";
  navBtn.onclick = () => openAuthModal("login");
}

// =====================
// Auth Actions
// =====================
async function handleLogin() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  clearAuthError();

  if (!email || !password) return showAuthError("Please enter your email and password.");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) showAuthError(error.message);
}

async function handleSignup() {
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  clearAuthError();

  if (!email || !password) return showAuthError("Please fill in all fields.");
  if (password.length < 6) return showAuthError("Password must be at least 6 characters.");

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    showAuthError(error.message);
  } else {
    showAuthError("Check your email to confirm your account!", "success");
  }
}

async function handleLogout() {
  await supabase.auth.signOut();
}

// =====================
// Modal Controls
// =====================
function openAuthModal(tab = "login") {
  document.getElementById("auth-modal").classList.add("open");
  switchTab(tab);
  clearAuthError();
}

function closeAuthModal() {
  document.getElementById("auth-modal").classList.remove("open");
}

function switchTab(tab) {
  document.getElementById("login-form").style.display = tab === "login" ? "block" : "none";
  document.getElementById("signup-form").style.display = tab === "signup" ? "block" : "none";
  document.getElementById("tab-login").classList.toggle("active", tab === "login");
  document.getElementById("tab-signup").classList.toggle("active", tab === "signup");
  clearAuthError();
}

function showAuthError(msg, type = "error") {
  const el = document.getElementById("auth-error");
  el.textContent = msg;
  el.className = `auth-error ${type}`;
}

function clearAuthError() {
  const el = document.getElementById("auth-error");
  el.textContent = "";
  el.className = "auth-error";
}

// Close modal when clicking outside
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("auth-modal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("auth-modal")) closeAuthModal();
  });
  initAuth();
});