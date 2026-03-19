const SERVER_URL = "";

async function planVacation(option) {
  const resultDiv = document.getElementById("result");

  // Build the request body based on which option was chosen
  let body = { option };

  if (option === "location") {
    const location = document.getElementById("location").value.trim();
    if (!location) {
      showResult("Please enter a destination first.");
      return;
    }
    body.location = location;

  } else if (option === "budget") {
    const budget = document.getElementById("budget").value;
    if (!budget || budget <= 0) {
      showResult("Please enter a valid budget amount.");
      return;
    }
    body.budget = budget;
  }

  // Show a loading state while we wait for the server
  showResult("Finding the perfect trip for you…", true);

  try {
    const response = await fetch(`${SERVER_URL}/plan-trip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json();
      showResult(err.error || "Something went wrong. Please try again.");
      return;
    }

    const data = await response.json();
    showResult(data.suggestions);

  } catch (error) {
    console.error("Request failed:", error);
    showResult("Could not reach the server. Make sure it's running.");
  }
}

function showResult(message, isLoading = false) {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = isLoading
    ? `<span class="loading">${message}</span>`
    : message;
  resultDiv.classList.add("visible");
}