const SERVER_URL = "";

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
document.addEventListener("DOMContentLoaded", () => {
  renderCalendar();

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
  const location = document.getElementById("location").value.trim();
  const budget = document.getElementById("budget").value;

  if (!location) return showError("Please enter a destination.");
  if (!budget || budget <= 0) return showError("Please enter a valid budget.");
  if (!startDate || !endDate) return showError("Please select your travel dates.");

  const duration = getDurationDays();
  showLoading();

  try {
    const response = await fetch(`${SERVER_URL}/plan-trip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location,
        budget,
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        duration
      }),
    });

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

function renderSlideshow(days, location, duration, budget) {
  slides = days;
  currentSlide = 0;

  const resultDiv = document.getElementById("result");

  const header = `
    <div class="itinerary-header">
      <div class="itinerary-title">${duration} Perfect Day${duration > 1 ? "s" : ""} in ${location}</div>
      <div class="itinerary-meta">${formatDateRange()} &nbsp;·&nbsp; $${Number(budget).toLocaleString()} budget</div>
    </div>
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

  // Build slide cards
  const track = document.getElementById("slideshow-track");
  days.forEach((day, i) => {
    const card = document.createElement("div");
    card.className = "slide-card" + (i === 0 ? " active" : "");
    card.innerHTML = `
      <div class="slide-day-label">Day ${i + 1} of ${days.length}</div>
      <div class="slide-day-title">${day.title || ""}</div>
      <div class="slide-activities">${day.activities || ""}</div>
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

  // Build dots
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

  // Determine direction for animation
  const direction = index > currentSlide ? "next" : "prev";

  // Animate out current
  cards[currentSlide].classList.add(direction === "next" ? "exit-left" : "exit-right");

  // Prepare next
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

function showLoading() {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = `<div class="result-loading">Crafting your perfect itinerary…</div>`;
  resultDiv.classList.add("visible");
}

function showError(message) {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = `<div class="result-loading">${message}</div>`;
  resultDiv.classList.add("visible");
}