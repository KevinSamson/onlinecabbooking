document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (
    !page?.startsWith("driver-") &&
    page !== "daily-vehicle" &&
    page !== "ride-requests" &&
    page !== "active-trip"
  )
    return;
  const $ = (s) => document.querySelector(s);
  const esc = window.escapeHTML;
  const money = (n) =>
    `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const date = (v) =>
    v
      ? new Date(v).toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—";
  const badge = (s) => /* HTML */ `
    <span class="badge badge-${esc(s || "inactive")}">
      ${esc(s || "unknown").replaceAll("_", " ")}
    </span>
  `;
  const run = async (fn, button, label = "Saving…") => {
    try {
      setBusy(button, true, label);
      await fn();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(button, false);
    }
  };
  const needDriver = () => {
    const u = CabAPI.user();
    if (!CabAPI.token() || !u) {
      location.href = "/login.html";
      return false;
    }
    if (u.role !== "driver") {
      location.href = "/";
      return false;
    }
    return true;
  };
  if (!needDriver()) return;
  const shellLinks = [
    [
      "driver-dashboard",
      "LayoutDashboard",
      "Overview",
      "/driver-dashboard.html",
    ],
    ["driver-vehicles", "CarFront", "My vehicles", "/driver-vehicles.html"],
    ["daily-vehicle", "CalendarCheck", "Daily vehicle", "/daily-vehicle.html"],
    ["ride-requests", "Bell", "Ride requests", "/ride-requests.html"],
    ["active-trip", "MapPinned", "Active trip", "/active-trip.html"],
    ["driver-earnings", "Wallet", "Earnings", "/driver-earnings.html"],
  ];
  document.querySelectorAll("[data-driver-nav]").forEach(
    (nav) =>
      (nav.innerHTML = shellLinks
        .map(
          ([id, ico, label, url]) => /* HTML */ `
            <a class="side-link ${page === id ? "active" : ""}" href="${url}">
              <i data-lucide="${ico}"></i>
              ${label}
            </a>
          `,
        )
        .join("")),
  );
  const title =
    {
      "driver-dashboard": "Driver overview",
      "driver-vehicles": "My vehicles",
      "daily-vehicle": "Choose today’s vehicle",
      "ride-requests": "Ride requests",
      "active-trip": "Active trip",
      "driver-earnings": "Earnings",
    }[page] || "Driver space";
  if ($("#driver-title")) $("#driver-title").textContent = title;
  const icon = () => window.lucide?.createIcons();
  let locationWatch = null;
  const vehicleLabel = (v) =>
    v
      ? `${esc(v.make)} ${esc(v.model)} · ${esc(v.plate_number)}`
      : "No vehicle selected";

  async function dashboard() {
    const d = await CabAPI.request("/driver/dashboard");
    $("#driver-name").textContent = CabAPI.user().full_name;
    $("#driver-verification").innerHTML = badge(
      d.verification?.status || "pending",
    );
    $("#driver-online").textContent = d.is_online ? "Online" : "Offline";
    $("#driver-vehicle").textContent = vehicleLabel(d.daily_vehicle);
    $("#stat-trips").textContent = Number(
      d.completed_trips || 0,
    ).toLocaleString("en-IN");
    $("#stat-earnings").textContent = money(d.gross_earnings);
    $("#stat-active").textContent = Number(d.active_trips || 0).toLocaleString(
      "en-IN",
    );
    $("#stat-requests").textContent = Number(
      d.pending_requests || 0,
    ).toLocaleString("en-IN");
    $("#availability-toggle").textContent = d.is_online
      ? "Go offline"
      : "Go online";
    $("#availability-toggle").dataset.online = String(!d.is_online);
    $("#driver-notice").innerHTML =
      d.verification?.status !== "approved"
        ? /* HTML */ `
            <div class="notice">
              Your driver verification is
              ${badge(d.verification?.status || "pending")}. Complete approval
              before going online.
              <a class="text-link" href="/driver-verification.html">
                View verification
              </a>
            </div>
          `
        : !d.daily_vehicle
          ? /* HTML */ `
              <div class="notice">
                Select an approved vehicle for today before going online.
                <a class="text-link" href="/daily-vehicle.html">
                  Choose vehicle
                </a>
              </div>
            `
          : "";
    icon();
  }
  async function vehicles() {
    const { items } = await CabAPI.request("/driver/vehicles");
    $("#vehicle-list").innerHTML = items.length
      ? items
          .map(
            (v) => /* HTML */ `
              <article class="card">
                <div class="inline-row">
                  <h3>${esc(v.make)} ${esc(v.model)}</h3>
                  <span class="spacer"></span>
                  ${badge(v.status)}
                </div>
                <p class="muted">
                  ${esc(v.color)} · ${esc(v.category)} · ${Number(v.seats)}
                  seats
                </p>
                <div class="cell-main">${esc(v.plate_number)}</div>
                ${
                  v.rejection_reason
                    ? /* HTML */ `
                        <p class="notice error">${esc(v.rejection_reason)}</p>
                      `
                    : ""
                }
              </article>
            `,
          )
          .join("")
      : '<div class="card empty"><h3>No vehicles registered</h3><p>Register a vehicle to get started.</p></div>';
    icon();
  }
  async function dailyVehicle() {
    const [{ items }, { vehicle }] = await Promise.all([
      CabAPI.request("/driver/vehicles"),
      CabAPI.request("/driver/daily-vehicle"),
    ]);
    const approved = items.filter((v) => v.status === "approved");
    $("#vehicle-options").innerHTML = approved.length
      ? approved
          .map(
            (v) => /* HTML */ `
              <option
                value="${v.id}"
                ${Number(vehicle?.vehicle_id) === Number(v.id) ? "selected" : ""}
              >
                ${esc(v.make)} ${esc(v.model)} — ${esc(v.plate_number)}
              </option>
            `,
          )
          .join("")
      : '<option value="">No approved vehicles available</option>';
    $("#daily-current").innerHTML = vehicle
      ? /* HTML */ `
          <div class="notice">
            Selected for today:
            <strong>${vehicleLabel(vehicle)}</strong>
          </div>
        `
      : '<div class="notice">No vehicle selected for today.</div>';
    $("#daily-form button").disabled = !approved.length;
    icon();
  }
  async function requests() {
    const { items } = await CabAPI.request("/driver/requests");
    $("#request-list").innerHTML = items.length
      ? items
          .map(
            (r) => /* HTML */ `
              <article class="card">
                <div class="inline-row">
                  <h3>Ride #${r.id}</h3>
                  <span class="spacer"></span>
                  ${r.scheduled_at ? badge("scheduled") : badge("requested")}
                </div>
                <p>
                  <strong>Pickup:</strong>
                  ${esc(r.pickup_address)}
                </p>
                <p>
                  <strong>Drop-off:</strong>
                  ${esc(r.dropoff_address)}
                </p>
                <div class="inline-row">
                  <span>
                    ${r.estimated_distance_km ? `${esc(r.estimated_distance_km)} km` : ""}
                  </span>
                  <span class="spacer"></span>
                  <strong>${money(r.estimated_fare)}</strong>
                </div>
                <div class="actions" style="margin-top:16px">
                  <button class="btn btn-primary" data-accept="${r.id}">
                    Accept ride
                  </button>
                  <button class="btn btn-outline" data-decline="${r.id}">
                    Decline
                  </button>
                </div>
              </article>
            `,
          )
          .join("")
      : '<div class="card empty"><h3>No ride requests</h3><p>New requests will appear here when you are online.</p></div>';
  }
  async function activeTrip() {
    const { ride } = await CabAPI.request("/driver/active-trip");
    const tripActions = ride
      ? [
          ride.status === "accepted"
            ? /* HTML */ `
                <button class="btn btn-outline" data-arriving="${ride.id}">
                  Mark arriving
                </button>
              `
            : "",
          ["accepted", "arriving"].includes(ride.status)
            ? /* HTML */ `
                <button class="btn btn-primary" data-start="${ride.id}">
                  Start trip
                </button>
              `
            : "",
          ride.status === "in_progress"
            ? /* HTML */ `
                <button class="btn btn-primary" data-complete="${ride.id}">
                  Complete trip
                </button>
              `
            : "",
        ].join("")
      : "";
    $("#active-trip-content").innerHTML = ride
      ? /* HTML */ `
          <article class="card">
            <div class="inline-row">
              <h3>Ride #${ride.id}</h3>
              <span class="spacer"></span>
              ${badge(ride.status)}
            </div>
            <p>
              <strong>Passenger:</strong>
              ${esc(ride.passenger_name)}
            </p>
            <p>
              <strong>Contact:</strong>
              ${esc(ride.passenger_phone || "Not provided")}
            </p>
            <p>
              <strong>Pickup:</strong>
              ${esc(ride.pickup_address)}
            </p>
            <p>
              <strong>Drop-off:</strong>
              ${esc(ride.dropoff_address)}
            </p>
            <p>
              <strong>Estimated fare:</strong>
              ${money(ride.estimated_fare)}
            </p>
            <div class="actions">${tripActions}</div>
            <div class="actions" style="margin-top:16px">
              <button class="btn btn-outline" data-share-location="${ride.id}">
                Share live location
              </button>
              <button
                class="btn btn-ghost"
                data-stop-location
                ${locationWatch === null ? "disabled" : ""}
              >
                Stop sharing
              </button>
            </div>
            <p id="location-status" class="form-note">
              Location sharing is off.
            </p>
          </article>
        `
      : /* HTML */ `
          <div class="card empty">
            <h3>No active trip</h3>
            <p>Accepted rides will appear here.</p>
            <a class="btn btn-primary" href="/ride-requests.html">
              View ride requests
            </a>
          </div>
        `;
    if (!ride && locationWatch !== null) {
      navigator.geolocation.clearWatch(locationWatch);
      locationWatch = null;
    }
  }
  async function earnings() {
    const d = await CabAPI.request("/driver/earnings");
    $("#earnings-total").textContent = money(d.gross_earnings);
    $("#earnings-trips").textContent = Number(
      d.completed_trips || 0,
    ).toLocaleString("en-IN");
    $("#earnings-body").innerHTML = d.items.length
      ? d.items
          .map(
            (r) => /* HTML */ `
              <tr>
                <td>#${r.id}</td>
                <td>${esc(r.pickup_address)}</td>
                <td>${esc(r.dropoff_address)}</td>
                <td>${money(r.final_fare)}</td>
                <td>${date(r.completed_at)}</td>
              </tr>
            `,
          )
          .join("")
      : '<tr><td colspan="5"><div class="empty">No completed trips yet.</div></td></tr>';
  }
  document.addEventListener("click", (e) => {
    const share = e.target.closest("[data-share-location]");
    if (share) {
      if (!navigator.geolocation) {
        $("#location-status").textContent =
          "Geolocation is unavailable in this browser.";
        return;
      }
      if (locationWatch !== null)
        navigator.geolocation.clearWatch(locationWatch);
      const rideId = share.dataset.shareLocation;
      locationWatch = navigator.geolocation.watchPosition(
        async (position) => {
          try {
            await CabAPI.request(`/tracking/${rideId}/location`, {
              method: "POST",
              body: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              },
            });
            if ($("#location-status"))
              $("#location-status").textContent =
                `Location shared at ${new Date().toLocaleTimeString()}.`;
          } catch (error) {
            if ($("#location-status"))
              $("#location-status").textContent = error.message;
          }
        },
        (error) => {
          if ($("#location-status"))
            $("#location-status").textContent = error.message;
        },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
      );
      $("#location-status").textContent = "Waiting for GPS permission…";
      document.querySelector("[data-stop-location]").disabled = false;
      return;
    }
    if (e.target.closest("[data-stop-location]")) {
      if (locationWatch !== null)
        navigator.geolocation.clearWatch(locationWatch);
      locationWatch = null;
      $("#location-status").textContent = "Location sharing is off.";
      e.target.disabled = true;
      return;
    }
    const t = e.target.closest(
      "[data-accept],[data-decline],[data-arriving],[data-start],[data-complete]",
    );
    if (!t) return;
    run(
      async () => {
        const id =
          t.dataset.accept ||
          t.dataset.decline ||
          t.dataset.arriving ||
          t.dataset.start ||
          t.dataset.complete;
        const action = t.dataset.accept
          ? "accept"
          : t.dataset.decline
            ? "decline"
            : t.dataset.arriving
              ? "arriving"
              : t.dataset.start
                ? "start"
                : "complete";
        await CabAPI.request(`/driver/rides/${id}/${action}`, {
          method: "POST",
        });
        toast(
          action === "accept"
            ? "Ride accepted."
            : `Ride ${action === "decline" ? "declined" : action === "complete" ? "completed" : action === "start" ? "started" : "updated"}.`,
        );
        if (page === "ride-requests") await requests();
        else await activeTrip();
      },
      t,
      "Updating…",
    );
  });
  if (page === "driver-dashboard") {
    dashboard().catch((e) => toast(e.message, "error"));
    $("#availability-toggle").addEventListener("click", (e) =>
      run(
        async () => {
          const online = e.currentTarget.dataset.online === "true";
          await CabAPI.request("/driver/availability", {
            method: "PATCH",
            body: { is_online: online },
          });
          await dashboard();
          toast(online ? "You are online." : "You are offline.");
        },
        e.currentTarget,
        "Updating…",
      ),
    );
  }
  if (page === "driver-vehicles") {
    vehicles().catch((e) => toast(e.message, "error"));
    $("#vehicle-form").addEventListener("submit", (e) => {
      e.preventDefault();
      run(
        async () => {
          await CabAPI.request("/driver/vehicles", {
            method: "POST",
            body: Object.fromEntries(new FormData(e.currentTarget)),
          });
          e.currentTarget.reset();
          toast("Vehicle submitted for approval.");
          await vehicles();
        },
        e.currentTarget.querySelector("button[type=submit]"),
        "Submitting…",
      );
    });
  }
  if (page === "daily-vehicle") {
    dailyVehicle().catch((e) => toast(e.message, "error"));
    $("#daily-form").addEventListener("submit", (e) => {
      e.preventDefault();
      run(
        async () => {
          await CabAPI.request("/driver/daily-vehicle", {
            method: "PUT",
            body: { vehicle_id: Number($("#vehicle-options").value) },
          });
          toast("Daily vehicle updated.");
          await dailyVehicle();
        },
        e.currentTarget.querySelector("button[type=submit]"),
        "Saving…",
      );
    });
  }
  if (page === "ride-requests")
    requests().catch((e) => toast(e.message, "error"));
  if (page === "active-trip")
    activeTrip().catch((e) => toast(e.message, "error"));
  if (page === "driver-earnings")
    earnings().catch((e) => toast(e.message, "error"));
  icon();
});
