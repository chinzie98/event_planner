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

  // Close calendar when clicking outside
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

  // Empty cells before first day
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
      // Highlight selected range
      if (startDate && date.getTime() === startDate.getTime()) {
        cell.classList.add("selected-start");
      }
      if (endDate && date.getTime() === endDate.getTime()) {
        cell.classList.add("selected-end");
      }
      if (startDate && endDate && date > startDate && date < endDate) {
        cell.classList.add("in-range");
      }

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
    // Start fresh selection
    startDate = date;
    endDate = null;
    selectingEnd = true;
    document.getElementById("cal-selection-hint").textContent = "Now select an end date";
  } else if (selectingEnd) {
    if (date < startDate) {
      // Clicked before start — swap
      endDate = startDate;
      startDate = date;
    } else {
      endDate = date;
    }
    selectingEnd = false;
    document.getElementById("cal-selection-hint").textContent = formatDateRange();
    updateDateDisplay();

    // Close calendar after selection
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
  if (startDate && endDate) {
    return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  }
  if (startDate) return formatDate(startDate);
  return "";
}

function updateDateDisplay() {
  const display = document.getElementById("date-display");
  if (startDate && endDate) {
    display.textContent = formatDateRange();
    display.classList.add("has-dates");
  } else if (startDate) {
    display.textContent = formatDate(startDate);
    display.classList.add("has-dates");
  }
}

function getDurationDays() {
  if (!startDate || !endDate) return null;
  const diff = endDate.getTime() - startDate.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24)) + 1;
}

// =====================
// Trip Planning
// =====================
async function planVacation() {
  const location = document.getElementById("location").value.trim();
  const budget = document.getElementById("budget").value;
  const resultDiv = document.getElementById("result");

  // Validation
  if (!location) return showResult('<div class="result-loading">Please enter a destination.</div>');
  if (!budget || budget <= 0) return showResult('<div class="result-loading">Please enter a valid budget.</div>');
  if (!startDate || !endDate) return showResult('<div class="result-loading">Please select your travel dates.</div>');

  const duration = getDurationDays();

  showResult('<div class="result-loading">Crafting your perfect itinerary…</div>');

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
      return showResult(`<div class="result-loading">${err.error || "Something went wrong."}</div>`);
    }

    const data = await response.json();
    renderItinerary(data, location, duration);

  } catch (error) {
    console.error("Request failed:", error);
    showResult('<div class="result-loading">Could not reach the server. Make sure it\'s running.</div>');
  }
}

function renderItinerary(data, location, duration) {
  const resultDiv = document.getElementById("result");

  let html = `
    <div class="itinerary-header">
      <div class="itinerary-title">${duration} Perfect Day${duration > 1 ? "s" : ""} in ${location}</div>
      <div class="itinerary-meta">${formatDateRange()} &nbsp;·&nbsp; $${Number(document.getElementById("budget").value).toLocaleString()} budget</div>
    </div>
  `;

  if (data.days && Array.isArray(data.days)) {
    data.days.forEach((day, i) => {
      html += `
        <div class="day-card">
          <div class="day-label">Day ${i + 1}</div>
          <div class="day-title">${day.title || ""}</div>
          <div class="day-content">${day.activities || ""}</div>
        </div>
      `;
    });
  } else {
    // Fallback if server returns plain text
    html += `<div class="day-card"><div class="day-content">${data.suggestions || ""}</div></div>`;
  }

  showResult(html);
}

function showResult(html) {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = html;
  resultDiv.classList.add("visible");
}