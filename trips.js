const SERVER_URL = "";

document.addEventListener("DOMContentLoaded", async () => {
  // Wait for auth to initialize before loading trips
  await waitForAuth();
  loadTrips();
});

function waitForAuth() {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (typeof authInitialized !== "undefined" && authInitialized) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
    // Timeout after 3 seconds
    setTimeout(() => { clearInterval(interval); resolve(); }, 3000);
  });
}

async function loadTrips() {
  const loading = document.getElementById("trips-loading");
  const empty = document.getElementById("trips-empty");
  const grid = document.getElementById("trips-grid");

  if (!currentUser) {
    loading.textContent = "Please sign in to view your saved trips.";
    return;
  }

  try {
    const response = await fetch(`${SERVER_URL}/my-trips/${currentUser.id}`);
    if (!response.ok) throw new Error("Failed to load trips");

    const trips = await response.json();

    loading.style.display = "none";

    if (trips.length === 0) {
      empty.style.display = "block";
      return;
    }

    grid.style.display = "grid";
    trips.forEach(trip => {
      grid.appendChild(buildTripCard(trip));
    });

  } catch (err) {
    console.error("Load trips error:", err);
    loading.textContent = "Could not load your trips. Please try again.";
  }
}

function buildTripCard(trip) {
  const card = document.createElement("div");
  card.className = "trip-card";

  const duration = trip.duration;
  const shareUrl = `${window.location.origin}/index.html?trip=${trip.id}`;

  card.innerHTML = `
    <div class="trip-card-header">
      <div class="trip-destination">${trip.location}</div>
      <div class="trip-duration">${duration} day${duration > 1 ? "s" : ""}</div>
    </div>
    <div class="trip-meta">
      <span>${trip.start_date} – ${trip.end_date}</span>
      <span>$${Number(trip.budget).toLocaleString()} budget</span>
    </div>
    <div class="trip-preview">
      ${trip.days.slice(0, 2).map((day, i) => `
        <div class="trip-day-preview">
          <span class="trip-day-num">Day ${i + 1}</span>
          <span class="trip-day-title">${day.title}</span>
        </div>
      `).join("")}
      ${trip.days.length > 2 ? `<div class="trip-more">+${trip.days.length - 2} more days</div>` : ""}
    </div>
    <div class="trip-card-footer">
      <a href="/index.html?trip=${trip.id}" class="trip-btn trip-btn-view">View itinerary</a>
      <button class="trip-btn trip-btn-share" onclick="copyLink('${shareUrl}', this)">Copy share link</button>
      <button class="trip-btn trip-btn-delete" onclick="deleteTrip('${trip.id}', this)">Delete</button>
    </div>
  `;

  return card;
}

function copyLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    const original = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => btn.textContent = original, 2000);
  });
}

async function deleteTrip(tripId, btn) {
  if (!confirm("Are you sure you want to delete this trip?")) return;

  try {
    const response = await fetch(`${SERVER_URL}/delete-trip/${tripId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser.id })
    });

    if (!response.ok) throw new Error("Delete failed");

    // Remove the card from the UI
    const card = btn.closest(".trip-card");
    card.style.opacity = "0";
    card.style.transform = "scale(0.95)";
    setTimeout(() => {
      card.remove();
      // Show empty state if no cards left
      if (document.querySelectorAll(".trip-card").length === 0) {
        document.getElementById("trips-grid").style.display = "none";
        document.getElementById("trips-empty").style.display = "block";
      }
    }, 300);

  } catch (err) {
    console.error("Delete error:", err);
    alert("Could not delete trip. Please try again.");
  }
}