function planVacation(option) {
    const resultDiv = document.getElementById('result');
    let message = '';

    if(option === 'location') {
        const location = document.getElementById('location').value.trim();
        if(location) {
            message = `Great choice! You could plan a wonderful trip to ${location}. 🌴✈️`;
        } else {
            message = 'Please enter a location first!';
        }
    } else if(option === 'budget') {
        const budget = document.getElementById('budget').value;
        if(budget && budget > 0) {
            if(budget < 500) {
                message = `With $${budget}, you might enjoy a cozy weekend getaway nearby. 🏕️`;
            } else if(budget < 1500) {
                message = `With $${budget}, a domestic trip or a short international trip is perfect! 🌍`;
            } else {
                message = `Wow! With $${budget}, you could plan a luxury vacation anywhere in the world! 🏖️`;
            }
        } else {
            message = 'Please enter a valid budget amount!';
        }
    } else if(option === 'surprise') {
        const destinations = ['Paris, France', 'Tokyo, Japan', 'Bali, Indonesia', 'New York, USA', 'Sydney, Australia'];
        const randomDestination = destinations[Math.floor(Math.random() * destinations.length)];
        message = `Surprise! How about visiting ${randomDestination}? 🎉✈️`;
    }

    resultDiv.textContent = message;
}
