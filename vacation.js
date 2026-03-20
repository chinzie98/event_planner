const SERVER_URL = "";

// =====================
// Location Autocomplete
// =====================
let locationValue = "";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function initAutocomplete() {
  const container = document.getElementById("location-container");
  try {
    const res = await fetch(`${SERVER_URL}/config`);
    const { googleMapsKey } = await res.json();
    if (!googleMapsKey) throw new Error("No Google Maps key configured");

    await new Promise((resolve, reject) => {
      window.__mapsReady = resolve;
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsKey)}&libraries=places&v=weekly&loading=async&callback=__mapsReady`;
      script.async = true;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    const { PlaceAutocompleteElement } = google.maps.places;

    const placeAutocomplete = new PlaceAutocompleteElement({
      includedPrimaryTypes: ["locality", "administrative_area_level_1", "country"],
    });
    container.appendChild(placeAutocomplete);

    // Capture typed text as a fallback (user may not select a suggestion)
    placeAutocomplete.addEventListener("input", (e) => {
      locationValue = e.target.value || "";
    });

    // Preferred path: use the formatted display name from the selected suggestion
    placeAutocomplete.addEventListener("gmp-select", async (e) => {
      try {
        const place = e.placePrediction.toPlace();
        await place.fetchFields({ fields: ["displayName", "formattedAddress"] });
        locationValue = place.displayName || place.formattedAddress || "";
      } catch {
        locationValue = e.placePrediction?.text?.toString() || locationValue;
      }
    });

  } catch (err) {
    console.warn("Places autocomplete unavailable, using plain input:", err.message);
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "City, country, or region…";
    input.addEventListener("input", (e) => { locationValue = e.target.value; });
    container.appendChild(input);
  }
}

// =====================
// Calendar State
// =====================
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let startDate = null;
let endDate = null;
let selectingEnd = false;

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// =====================
// Calendar Init
// =====================
// =====================
// Pill Selectors
// =====================
function initPills() {
  // Multi-select pills (travel style)
  document.querySelectorAll("#travel-style .pill").forEach(btn => {
    btn.addEventListener("click", () => btn.classList.toggle("active"));
  });

  // Single-select pills (group type)
  document.querySelectorAll("#group-type .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#group-type .pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

function getSelectedPills(groupId) {
  return [...document.querySelectorAll(`#${groupId} .pill.active`)].map(b => b.dataset.value);
}

function getSinglePill(groupId) {
  const active = document.querySelector(`#${groupId} .pill.active`);
  return active ? active.dataset.value : null;
}

document.addEventListener("DOMContentLoaded", () => {
  renderCalendar();
  initPills();
  initAutocomplete();

  document.getElementById("date-trigger").addEventListener("click", () => {
    const popup = document.getElementById("calendar-popup");
    const trigger = document.getElementById("date-trigger");
    popup.classList.toggle("open");
    trigger.classList.toggle("active");
  });

  document.getElementById("prev-month").addEventListener("click", (e) => {
    e.stopPropagation();
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
  });

  document.getElementById("next-month").addEventListener("click", (e) => {
    e.stopPropagation();
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
  });

  document.getElementById("cal-clear").addEventListener("click", (e) => {
    e.stopPropagation();
    clearDates();
  });

  document.addEventListener("click", (e) => {
    const popup = document.getElementById("calendar-popup");
    const trigger = document.getElementById("date-trigger");
    if (!popup.contains(e.target) && !trigger.contains(e.target)) {
      popup.classList.remove("open");
      trigger.classList.remove("active");
    }
  });

  // Check URL params
  const params = new URLSearchParams(window.location.search);
  const tripId = params.get("trip");
  if (tripId) loadSharedTrip(tripId);
  if (params.get("upgrade") === "true") openPremiumModal("general");
});

function renderCalendar() {
  document.getElementById("month-label").textContent = `${MONTHS[currentMonth]} ${currentYear}`;
  const daysContainer = document.getElementById("calendar-days");
  daysContainer.innerHTML = "";

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-day empty";
    daysContainer.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(currentYear, currentMonth, d);
    const cell = document.createElement("div");
    cell.className = "cal-day";
    cell.textContent = d;

    if (date < today) {
      cell.classList.add("disabled");
    } else {
      if (startDate && date.getTime() === startDate.getTime()) cell.classList.add("selected-start");
      if (endDate && date.getTime() === endDate.getTime()) cell.classList.add("selected-end");
      if (startDate && endDate && date > startDate && date < endDate) cell.classList.add("in-range");

      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        handleDateClick(date);
      });
    }

    daysContainer.appendChild(cell);
  }
}

function handleDateClick(date) {
  if (!startDate || (startDate && endDate)) {
    startDate = date;
    endDate = null;
    selectingEnd = true;
    document.getElementById("cal-selection-hint").textContent = "Now select an end date";
  } else if (selectingEnd) {
    if (date < startDate) { endDate = startDate; startDate = date; }
    else endDate = date;
    selectingEnd = false;
    document.getElementById("cal-selection-hint").textContent = formatDateRange();
    updateDateDisplay();
    setTimeout(() => {
      document.getElementById("calendar-popup").classList.remove("open");
      document.getElementById("date-trigger").classList.remove("active");
    }, 300);
  }
  renderCalendar();
  updateDateDisplay();
}

function clearDates() {
  startDate = null;
  endDate = null;
  selectingEnd = false;
  document.getElementById("cal-selection-hint").textContent = "Select a start date";
  document.getElementById("date-display").textContent = "Select dates…";
  document.getElementById("date-display").classList.remove("has-dates");
  renderCalendar();
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateRange() {
  if (startDate && endDate) return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  if (startDate) return formatDate(startDate);
  return "";
}

function updateDateDisplay() {
  const display = document.getElementById("date-display");
  if (startDate && endDate) { display.textContent = formatDateRange(); display.classList.add("has-dates"); }
  else if (startDate) { display.textContent = formatDate(startDate); display.classList.add("has-dates"); }
}

function getDurationDays() {
  if (!startDate || !endDate) return null;
  return Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
}

// =====================
// Trip Planning
// =====================
async function planVacation() {
  if (!currentUser) {
    openAuthModal("login");
    return;
  }

  const location = locationValue.trim();
  const budget = document.getElementById("budget").value;

  if (!location) return showError("Please enter a destination.");
  if (!budget || budget <= 0) return showError("Please enter a valid budget.");
  if (!startDate || !endDate) return showError("Please select your travel dates.");

  const duration = getDurationDays();
  const travelStyle = getSelectedPills("travel-style");
  const groupType = getSinglePill("group-type");
  const dietary = document.getElementById("dietary").value.trim();
  showLoading();

  try {
    const response = await fetch(`${SERVER_URL}/plan-trip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: currentUser.id,
        location,
        budget,
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        duration,
        travelStyle,
        groupType,
        dietary
      }),
    });

    if (response.status === 429) {
      document.getElementById("result").innerHTML = "";
      document.getElementById("result").classList.remove("visible");
      openPremiumModal("usage_limit");
      return;
    }

    if (!response.ok) {
      const err = await response.json();
      return showError(err.error || "Something went wrong.");
    }

    const data = await response.json();

    if (data.days && Array.isArray(data.days) && data.days.length > 0) {
      renderSlideshow(data.days, location, duration, budget);
    } else {
      showError("Could not parse the itinerary. Please try again.");
    }

  } catch (error) {
    console.error("Request failed:", error);
    showError("Could not reach the server. Make sure it's running.");
  }
}

// =====================
// Slideshow
// =====================
let currentSlide = 0;
let slides = [];
let currentTripData = null;

function renderSlideshow(days, location, duration, budget, isShared = false) {
  slides = days;
  currentSlide = 0;
  currentTripData = { days, location, duration, budget };

  const resultDiv = document.getElementById("result");

  // Show save/share bar only if not viewing a shared trip
  const actionBar = isShared ? `
    <div class="action-bar">
      <span class="shared-badge">Shared itinerary</span>
      <button class="action-btn" onclick="copyShareLink(null)">
        <svg viewBox="0 0 20 20" fill="none"><path d="M13 7H7v6h6V7z" stroke="currentColor" stroke-width="1.2"/><path d="M13 3h4v4M7 17H3v-4M17 13v4h-4M3 7V3h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        Copy link
      </button>
    </div>` : `
    <div class="action-bar">
      <button class="action-btn save-btn" id="save-btn" onclick="saveTrip()">
        <svg viewBox="0 0 20 20" fill="none"><path d="M10 3v10M5 9l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 15h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        Save itinerary
      </button>
      <button class="action-btn share-btn" id="share-btn" onclick="shareTrip()" disabled>
        <svg viewBox="0 0 20 20" fill="none"><circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.2"/><circle cx="5" cy="10" r="2" stroke="currentColor" stroke-width="1.2"/><circle cx="15" cy="15" r="2" stroke="currentColor" stroke-width="1.2"/><path d="M7 9l6-3M7 11l6 3" stroke="currentColor" stroke-width="1.2"/></svg>
        Share
      </button>
    </div>`;

  const header = `
    <div class="itinerary-header">
      <div class="itinerary-title">${duration} Perfect Day${duration > 1 ? "s" : ""} in ${location}</div>
      <div class="itinerary-meta">${formatDateRange()} &nbsp;·&nbsp; $${Number(budget).toLocaleString()} budget</div>
    </div>
    ${actionBar}
    <div class="slideshow">
      <div class="slideshow-track" id="slideshow-track"></div>
      <div class="slideshow-controls">
        <button class="slide-arrow" id="slide-prev" onclick="changeSlide(-1)">
          <svg viewBox="0 0 20 20" fill="none"><path d="M13 5l-5 5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="slide-dots" id="slide-dots"></div>
        <button class="slide-arrow" id="slide-next" onclick="changeSlide(1)">
          <svg viewBox="0 0 20 20" fill="none"><path d="M7 5l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
  `;

  resultDiv.innerHTML = header;
  resultDiv.classList.add("visible");

  const track = document.getElementById("slideshow-track");
  days.forEach((day, i) => {
    const card = document.createElement("div");
    card.className = "slide-card" + (i === 0 ? " active" : "");
    const highlightsHTML = day.highlights && day.highlights.length
      ? `<ul class="slide-highlights">${day.highlights.map(h => `<li>${h}</li>`).join("")}</ul>`
      : "";
    const tipHTML = day.tip
      ? `<div class="slide-tip"><svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.2"/><path d="M10 6.5v4M10 13v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>${day.tip}</div>`
      : "";
    card.innerHTML = `
      <div class="slide-day-label">Day ${i + 1} of ${days.length}</div>
      <div class="slide-day-title">${day.title || ""}</div>
      <div class="slide-activities">${day.activities || ""}</div>
      ${highlightsHTML}
      ${tipHTML}
      <div class="slide-cost">
        <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.2"/>
          <path d="M10 6v8M7.5 8.5C7.5 7.4 8.6 7 10 7s2.5.4 2.5 1.5S11.4 10 10 10s-2.5.5-2.5 1.5S8.6 13 10 13s2.5-.4 2.5-1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        Estimated cost: ${day.estimatedCost || "—"}
      </div>
    `;
    track.appendChild(card);
  });

  const dotsContainer = document.getElementById("slide-dots");
  days.forEach((_, i) => {
    const dot = document.createElement("div");
    dot.className = "slide-dot" + (i === 0 ? " active" : "");
    dot.onclick = () => goToSlide(i);
    dotsContainer.appendChild(dot);
  });

  updateSlideControls();
}

function changeSlide(direction) {
  goToSlide(currentSlide + direction);
}

function goToSlide(index) {
  if (index < 0 || index >= slides.length) return;
  const track = document.getElementById("slideshow-track");
  const cards = track.querySelectorAll(".slide-card");
  const dots = document.getElementById("slide-dots").querySelectorAll(".slide-dot");
  const direction = index > currentSlide ? "next" : "prev";

  cards[currentSlide].classList.add(direction === "next" ? "exit-left" : "exit-right");
  cards[index].classList.add(direction === "next" ? "enter-right" : "enter-left");

  setTimeout(() => {
    cards[currentSlide].classList.remove("active", "exit-left", "exit-right");
    cards[index].classList.remove("enter-right", "enter-left");
    cards[index].classList.add("active");
    dots[currentSlide].classList.remove("active");
    dots[index].classList.add("active");
    currentSlide = index;
    updateSlideControls();
  }, 300);
}

function updateSlideControls() {
  const prev = document.getElementById("slide-prev");
  const next = document.getElementById("slide-next");
  if (prev) prev.style.opacity = currentSlide === 0 ? "0.3" : "1";
  if (next) next.style.opacity = currentSlide === slides.length - 1 ? "0.3" : "1";
}

// =====================
// Save & Share
// =====================
async function saveTrip() {
  if (!currentUser) {
    openAuthModal("login");
    return;
  }

  const saveBtn = document.getElementById("save-btn");
  saveBtn.textContent = "Saving…";
  saveBtn.disabled = true;

  try {
    const response = await fetch(`${SERVER_URL}/save-trip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: currentUser.id,
        location: currentTripData.location,
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        budget: currentTripData.budget,
        duration: currentTripData.duration,
        days: currentTripData.days
      }),
    });

    const data = await response.json();

    if (response.status === 403 && data.error === "save_requires_premium") {
      saveBtn.innerHTML = `
        <svg viewBox="0 0 20 20" fill="none"><path d="M10 3v10M5 9l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 15h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        Save itinerary
      `;
      saveBtn.disabled = false;
      openPremiumModal("save");
      return;
    }

    if (!response.ok) throw new Error(data.error);

    // Enable share button with the trip ID
    const shareBtn = document.getElementById("share-btn");
    shareBtn.disabled = false;
    shareBtn.onclick = () => copyShareLink(data.tripId);

    saveBtn.innerHTML = `
      <svg viewBox="0 0 20 20" fill="none"><path d="M4 10l4 4 8-8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Saved!
    `;

  } catch (err) {
    console.error("Save failed:", err);
    saveBtn.textContent = "Save failed — try again";
    saveBtn.disabled = false;
  }
}

async function shareTrip() {
  // This gets replaced with the actual trip ID after saving
}

function copyShareLink(tripId) {
  const base = window.location.origin + window.location.pathname;
  const url = tripId ? `${base}?trip=${tripId}` : window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    showToast("Link copied to clipboard!");
  });
}

// =====================
// Load Shared Trip
// =====================
async function loadSharedTrip(tripId) {
  showLoading("Loading shared itinerary…");
  try {
    const response = await fetch(`${SERVER_URL}/get-trip/${tripId}`);
    if (!response.ok) return showError("Trip not found or no longer available.");
    const trip = await response.json();

    // Restore date state so formatDateRange() works
    startDate = new Date(trip.start_date);
    endDate = new Date(trip.end_date);

    renderSlideshow(trip.days, trip.location, trip.duration, trip.budget, true);

    // Hide the form when viewing a shared trip
    document.querySelector(".form").style.display = "none";
    document.querySelector(".subtitle").style.display = "none";

  } catch (err) {
    showError("Could not load this shared trip.");
  }
}

// =====================
// Toast notification
// =====================
function showToast(message) {
  const existing = document.getElementById("toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "toast";
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add("visible"), 10);
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// =====================
// Premium Modal
// =====================
function openPremiumModal(reason = "general") {
  const title = document.getElementById("premium-modal-title");
  const subtitle = document.getElementById("premium-modal-subtitle");
  if (reason === "usage_limit") {
    title.textContent = "Daily limit reached";
    subtitle.innerHTML = "Free accounts can plan up to <strong>3 trips per 24 hours</strong>. Upgrade for unlimited planning and saving.";
  } else if (reason === "save") {
    title.textContent = "Saving requires Premium";
    subtitle.innerHTML = "Free accounts can plan trips but <strong>saving itineraries</strong> is a Premium feature.";
  } else {
    title.textContent = "Upgrade to Premium";
    subtitle.innerHTML = "Unlock the full Vacation Planner experience.";
  }
  document.getElementById("premium-modal").classList.add("open");
}

function closePremiumModal() {
  document.getElementById("premium-modal").classList.remove("open");
}

async function upgradeToPremium() {
  if (!currentUser) return;
  const btn = document.getElementById("upgrade-btn");
  btn.textContent = "Upgrading…";
  btn.disabled = true;
  try {
    const res = await fetch(`${SERVER_URL}/upgrade-premium`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser.id }),
    });
    if (res.ok) {
      closePremiumModal();
      showToast("You're now Premium! Unlimited trips await.");
      const upgradeBtn = document.getElementById("nav-upgrade-btn");
      if (upgradeBtn) upgradeBtn.style.display = "none";
    } else {
      btn.textContent = "Upgrade failed — try again";
      btn.disabled = false;
    }
  } catch {
    btn.textContent = "Upgrade failed — try again";
    btn.disabled = false;
  }
}

function showLoading(msg = "Crafting your perfect itinerary…") {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = `<div class="result-loading">${msg}</div>`;
  resultDiv.classList.add("visible");
}

function showError(message) {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = `<div class="result-loading">${message}</div>`;
  resultDiv.classList.add("visible");
}