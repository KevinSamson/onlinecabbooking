// VEHICLE FARE DETAILS

const RATES = {
    Bike: {
        baseFare: 20,
        perKmRate: 8
    },

    Auto: {
        baseFare: 30,
        perKmRate: 12
    },

    Cab: {
        baseFare: 50,
        perKmRate: 16
    }
};


// SAMPLE RIDE HISTORY

const DEMO_RIDES = [
    {
        pickup: "T. Nagar",
        drop: "Guindy",
        date: "2026-10-29",
        vehicle: "Auto",
        fare: 150,
        status: "Completed"
    },
    {
        pickup: "Adyar",
        drop: "Velachery",
        date: "2026-10-26",
        vehicle: "Bike",
        fare: 92,
        status: "Completed"
    },
    {
        pickup: "Anna Nagar",
        drop: "Airport",
        date: "2026-10-20",
        vehicle: "Cab",
        fare: 370,
        status: "Completed"
    }
];


// LOCAL STORAGE FUNCTIONS

const read = (key, fallback = []) => {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
};

const write = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
};

const money = n => "₹" + Number(n).toFixed(0);


// FARE ESTIMATION FUNCTION

function estimateFare(distanceKm, vehicleType) {

    const rate = RATES[vehicleType];

    if (
        !rate ||
        !Number.isFinite(Number(distanceKm)) ||
        Number(distanceKm) <= 0
    ) {
        throw new Error("Enter a valid distance and vehicle type.");
    }

    return Math.round(
        rate.baseFare + Number(distanceKm) * rate.perKmRate
    );
}


// GET ALL RIDES

function allRides() {
    return [
        ...read("cabRides", []),
        ...DEMO_RIDES
    ];
}


// DISPLAY RIDE DETAILS

function renderRideRows(target, rides) {

    const el = document.getElementById(target);

    if (!el) return;

    if (!rides.length) {
        el.innerHTML = '<div class="empty">No rides to show yet.</div>';
        return;
    }

    el.innerHTML = rides.map(r => `
        <div class="ride-item row">

            <div>
                <strong>
                    ${escapeHtml(r.pickup)} → ${escapeHtml(r.drop)}
                </strong>

                <div class="muted">
                    ${escapeHtml(r.date)} · ${escapeHtml(r.vehicle || "Cab")}
                </div>
            </div>

            <div style="text-align:right">
                <strong>${money(r.fare || 0)}</strong>

                <div class="muted">
                    ${escapeHtml(r.status || "Planned")}
                </div>
            </div>

        </div>
    `).join("");
}


// PREVENT HTML INJECTION IN DISPLAYED TEXT

function escapeHtml(value) {

    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[c]));
}


// NAVIGATION

function initNav() {

    const current = document.querySelector("main")?.dataset.page;

    document.querySelectorAll(".navlinks a").forEach(a => {

        if (a.dataset.page === current) {
            a.classList.add("active");
        }

    });
}


// PASSENGER DASHBOARD

function initDashboard() {

    const rides = allRides();

    const completed = rides.filter(
        r => r.status === "Completed"
    );

    const spent = completed.reduce(
        (s, r) => s + Number(r.fare || 0),
        0
    );

    const total = document.getElementById("total-rides");

    const moneyEl = document.getElementById("total-spent");

    if (total) total.textContent = rides.length;

    if (moneyEl) moneyEl.textContent = money(spent);

    renderRideRows(
        "dashboard-rides",
        rides.slice(0, 4)
    );
}


// COMPARE FARES

function initFareCompare() {

    const form = document.getElementById("fare-form");

    if (!form) return;

    const calculate = () => {

        const distance = Number(
            document.getElementById("fare-distance").value
        );

        const results = document.getElementById("fare-results");

        if (!Number.isFinite(distance) || distance <= 0) {
            results.innerHTML = '<div class="notice">Enter a valid distance.</div>';
            return;
        }

        results.innerHTML = Object.keys(RATES).map(vehicle => `

            <article class="card span-4">

                <span class="pill">${vehicle}</span>

                <div class="price" style="margin:15px 0">
                    ${money(estimateFare(distance, vehicle))}
                </div>

                <div class="muted">
                    Estimated fare · ${distance} km
                </div>

                <p class="muted">
                    Base ${money(RATES[vehicle].baseFare)}
                    + ${money(RATES[vehicle].perKmRate)} per km
                </p>

                <button type="button" data-choose="${vehicle}">
                    Choose ${vehicle}
                </button>

            </article>

        `).join("");

        results.querySelectorAll("[data-choose]").forEach(button => {

            button.addEventListener("click", () => {

                write("selectedVehicle", button.dataset.choose);

                location.href = "book-ride.html";

            });

        });

    };

    form.addEventListener("submit", e => {

        e.preventDefault();

        calculate();

    });

    calculate();
}


// BOOK RIDE

   
// BOOK RIDE - CONNECTED TO BACKEND

function initBooking() {
    const form = document.getElementById("booking-form");

    if (!form) return;

    let stopCount = 0;

    document.getElementById("add-stop").addEventListener("click", () => {
        stopCount++;

        const wrap = document.createElement("div");
        wrap.className = "field";

        wrap.innerHTML = `
            <label>Additional stop ${stopCount}</label>
            <input class="extra-stop" placeholder="Stop location">
        `;

        document.getElementById("stops-list").appendChild(wrap);
    });

    const selected = read("selectedVehicle", "Cab");
    document.getElementById("vehicle").value = selected;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const pickup = document.getElementById("pickup").value.trim();
        const drop = document.getElementById("drop").value.trim();
        const distance = Number(document.getElementById("distance").value);
        const vehicle = document.getElementById("vehicle").value;

        const stops = [...document.querySelectorAll(".extra-stop")]
            .map(input => input.value.trim())
            .filter(Boolean);

        const message = document.getElementById("booking-message");
        const summary = document.getElementById("booking-summary");

        try {
            if (!pickup || !drop || distance <= 0) {
                throw new Error("Please enter valid trip details.");
            }

            const fare = estimateFare(distance, vehicle);

            message.innerHTML = '<div class="notice">Booking your ride...</div>';

            const response = await fetch("http://localhost:3000/api/rides", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    pickup,
                    drop,
                    vehicleType: vehicle,
                    distanceKm: distance,
                    stops
                })
            });

            const result = await response.json();

            if (!response.ok || result.success === false) {
                throw new Error(result.message || "Booking failed.");
            }

            const savedRide = result.data || {};

            const ride = {
                ...savedRide,
                pickup,
                drop,
                stops,
                distance,
                vehicle,
                fare: savedRide.fare ?? fare,
                date: new Date().toISOString().slice(0, 10),
                status: savedRide.status || "Booked"
            };

            // Save a local copy for the frontend
            const rides = read("cabRides", []);
            rides.unshift(ride);
            write("cabRides", rides);

            summary.innerHTML = `
                <strong>
                    ${escapeHtml(pickup)} → ${escapeHtml(drop)}
                </strong>

                <p class="muted">
                    ${stops.length} additional stop(s) · ${distance} km
                </p>

                <div class="price">${money(ride.fare)}</div>

                <p class="muted">${escapeHtml(vehicle)} estimated fare</p>

                <p class="notice success">Ride booked successfully!</p>
            `;

            message.innerHTML = `
                <div class="notice success">
                    Your ride has been created successfully!
                    Ride ID: ${escapeHtml(ride.id ?? "Created")}
                </div>
            `;

            write("draftRide", ride);

        } catch (error) {
            message.innerHTML = `
                <div class="notice">
                    ${escapeHtml(error.message)}
                </div>
            `;
        }
    });
}


// SCHEDULE RIDE

function initSchedule() {

    const form = document.getElementById("schedule-form");

    if (!form) return;

    const date = document.getElementById("schedule-date");

    const today = new Date();

    date.min = new Date(
        today.getTime() - today.getTimezoneOffset() * 60000
    ).toISOString().slice(0, 10);

    form.addEventListener("submit", e => {

        e.preventDefault();

        const selectedDate = date.value;

        const selectedTime = document.getElementById("schedule-time").value;

        const when = new Date(`${selectedDate}T${selectedTime}`);

        if (when <= new Date()) {

            document.getElementById("schedule-message").innerHTML = `
                <div class="notice">
                    Choose a future date and time.
                </div>
            `;

            return;
        }

        const ride = {

            pickup: document.getElementById("schedule-pickup").value,

            drop: document.getElementById("schedule-drop").value,

            date: selectedDate,

            time: selectedTime,

            vehicle: document.getElementById("schedule-vehicle").value,

            fare: 0,

            status: "Scheduled"

        };

        const rides = read("cabRides", []);

        rides.unshift(ride);

        write("cabRides", rides);

        document.getElementById("schedule-message").innerHTML = `
            <div class="notice success">
                Your demo ride has been scheduled!
            </div>
        `;

        form.reset();

    });

}


// PREFERRED DRIVERS

function initPreferred() {

    const el = document.getElementById("preferred-list");

    if (!el) return;

    const drivers = read(
        "preferredDrivers",
        ["DRV-1042", "DRV-2088", "DRV-3150"]
    );

    el.innerHTML = drivers.map(code => `

        <div class="ride-item row">

            <div>
                <strong>${escapeHtml(code)}</strong>

                <div class="muted">
                    Anonymous driver code
                </div>
            </div>

            <span class="pill">Preferred</span>

        </div>

    `).join("") || '<div class="empty">No preferred drivers yet.</div>';

}


// RIDE HISTORY

function initHistory() {

    const rides = allRides();

    const completed = rides.filter(
        r => r.status === "Completed"
    );

    const upcoming = rides.filter(
        r => r.status === "Scheduled"
    );

    const spent = completed.reduce(
        (s, r) => s + Number(r.fare || 0),
        0
    );

    const element = document.getElementById("history-spent");

    if (!element) return;

    element.textContent = money(spent);

    document.getElementById("history-count").textContent =
        completed.length;

    document.getElementById("upcoming-count").textContent =
        upcoming.length;

    renderRideRows("history-table", rides);

}


// INITIALIZE ALL FEATURES

document.addEventListener("DOMContentLoaded", () => {

    initNav();

    initDashboard();

    initFareCompare();

    initBooking();

    initSchedule();

    initPreferred();

    initHistory();

});