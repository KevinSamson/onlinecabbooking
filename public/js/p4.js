document.addEventListener("DOMContentLoaded", () => {
  const $ = (selector) => document.querySelector(selector);
  const page = document.body.dataset.page;
  const user = CabAPI.user();
  const requireRole = (role) => {
    if (!user || user.role !== role) {
      location.href = "/login.html";
      return false;
    }
    return true;
  };
  const showError = (error) =>
    toast(error.message || "Something went wrong.", "error");
  const alertLocationLink = (alert) => {
    if (alert.latitude === null || alert.longitude === null) {
      return '<span class="report-meta">No GPS coordinates provided</span>';
    }
    const lat = encodeURIComponent(alert.latitude);
    const lng = encodeURIComponent(alert.longitude);
    const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
    return /* HTML */ `
      <a class="text-link" target="_blank" rel="noopener" href="${url}">
        View location
      </a>
    `;
  };
  const linkedRideId = new URLSearchParams(location.search).get("ride");
  if (linkedRideId && $("#ride-id")) $("#ride-id").value = linkedRideId;

  if (page === "track-ride") {
    if (!user || !["passenger", "driver", "admin"].includes(user.role))
      return (location.href = "/login.html");
    let map,
      marker,
      timer,
      rideId,
      routeDrawn = false,
      paused = false;
    try {
      map = CabMap.create("ride-map", { center: [13.0827, 80.2707], zoom: 12 });
    } catch (e) {
      $("#track-status").textContent = e.message;
    }
    async function refresh() {
      if (!rideId) return;
      try {
        const data = await CabAPI.request(
          `/tracking/${encodeURIComponent(rideId)}`,
        );
        $("#ride-state").textContent = data.ride.status.replaceAll("_", " ");
        const stages = [
          "requested",
          "accepted",
          "arriving",
          "in_progress",
          "completed",
        ];
        const stage = Math.max(0, stages.indexOf(data.ride.status));
        $("#progress-fill").style.width =
          `${Math.round((stage / (stages.length - 1)) * 100)}%`;
        $("#progress-label").textContent = data.ride.status.replaceAll(
          "_",
          " ",
        );
        if (map && !routeDrawn) {
          const start = [
            Number(data.ride.pickup_lat),
            Number(data.ride.pickup_lng),
          ];
          const end = [
            Number(data.ride.dropoff_lat),
            Number(data.ride.dropoff_lng),
          ];
          CabMap.marker(map, start[0], start[1], "Pickup");
          CabMap.marker(map, end[0], end[1], "Drop-off");
          const route = (data.ride.planned_route || []).map((p) => [
            Number(p.lat),
            Number(p.lng),
          ]);
          if (route.length > 1) CabMap.route(map, route);
          else CabMap.route(map, [start, end]);
          routeDrawn = true;
        }
        if (data.location && map) {
          const point = [
            Number(data.location.latitude),
            Number(data.location.longitude),
          ];
          if (!marker)
            marker = CabMap.marker(map, point[0], point[1], "Driver location");
          else marker.setLatLng(point);
          $("#driver-lat").textContent = point[0].toFixed(6);
          $("#driver-lng").textContent = point[1].toFixed(6);
          map.setView(point, Math.max(map.getZoom(), 14));
          $("#last-updated").textContent =
            `Last update: ${new Date(data.location.recorded_at).toLocaleString()}`;
          $("#track-status").textContent = "Live location received.";
        } else
          $("#track-status").textContent =
            "Ride loaded. Waiting for the driver’s first GPS update.";
        if (
          data.ride.status === "completed" ||
          data.ride.status === "cancelled"
        ) {
          clearInterval(timer);
          $("#track-status").textContent =
            `Ride ${data.ride.status}. Tracking stopped.`;
        }
      } catch (e) {
        $("#track-status").textContent = e.message;
        clearInterval(timer);
      }
    }
    $("#track-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      rideId = $("#ride-id").value;
      clearInterval(timer);
      await refresh();
      paused = false;
      timer = setInterval(refresh, 3000);
      $("#pause-tracking").disabled = false;
      $("#resume-tracking").disabled = true;
      $("#restart-tracking").disabled = false;
    });
    $("#pause-tracking").addEventListener("click", () => {
      clearInterval(timer);
      paused = true;
      $("#pause-tracking").disabled = true;
      $("#resume-tracking").disabled = false;
      $("#track-status").textContent = "Tracking paused.";
    });
    $("#resume-tracking").addEventListener("click", () => {
      if (!rideId) return;
      clearInterval(timer);
      paused = false;
      refresh();
      timer = setInterval(refresh, 3000);
      $("#pause-tracking").disabled = false;
      $("#resume-tracking").disabled = true;
    });
    $("#restart-tracking").addEventListener("click", () => {
      if (!rideId) return;
      clearInterval(timer);
      marker = null;
      routeDrawn = false;
      $("#driver-lat").textContent = "—";
      $("#driver-lng").textContent = "—";
      refresh();
      timer = setInterval(refresh, 3000);
      $("#pause-tracking").disabled = false;
      $("#resume-tracking").disabled = true;
    });
    if (linkedRideId) $("#track-form").requestSubmit();
  }

  if (page === "split-fare") {
    if (!requireRole("passenger")) return;
    const rideList = $("#split-ride-list");
    const createButton = $("#create-split");
    let selectedRideId = null;
    let eligibleRideIds = new Set();
    const loadEligibleRides = async () => {
      rideList.innerHTML =
        '<p class="loading">Loading your eligible rides…</p>';
      createButton.disabled = true;
      selectedRideId = null;
      eligibleRideIds = new Set();
      try {
        const { items } = await CabAPI.request("/rides");
        const eligible = items.filter(
          (ride) =>
            ride.status === "completed" &&
            Number(ride.final_fare ?? ride.estimated_fare) > 0 &&
            !ride.has_fare_split,
        );
        eligibleRideIds = new Set(eligible.map((ride) => Number(ride.id)));
        if (!items.length) {
          rideList.innerHTML =
            '<p class="muted">You have no rides yet. Completed rides with a fare will appear here.</p>';
          return;
        }
        if (!eligible.length) {
          rideList.innerHTML =
            '<p class="muted">No rides are ready to split. A ride must be completed, have a fare, and not already have a split.</p>';
          return;
        }
        rideList.innerHTML = eligible
          .map((ride) => {
            const fare = Number(ride.final_fare ?? ride.estimated_fare);
            return /* HTML */ `
              <label class="ride-option">
                <input
                  type="radio"
                  name="split-ride"
                  value="${Number(ride.id)}"
                />
                <span class="ride-option-details">
                  <strong>
                    ${escapeHTML(ride.pickup_address)} →
                    ${escapeHTML(ride.dropoff_address)}
                  </strong>
                  <span class="report-meta">
                    ${escapeHTML(new Date(ride.scheduled_at || ride.requested_at).toLocaleString())}
                    ·
                    ${escapeHTML(ride.vehicle_category || "Vehicle not specified")}
                    · ${escapeHTML(ride.status.replaceAll("_", " "))}
                  </span>
                  <strong>
                    Fare:
                    ₹${fare.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </span>
              </label>
            `;
          })
          .join("");
        const linkedRideId = Number(
          new URLSearchParams(location.search).get("ride"),
        );
        if (eligibleRideIds.has(linkedRideId)) {
          const linked = [
            ...rideList.querySelectorAll('input[name="split-ride"]'),
          ].find((input) => Number(input.value) === linkedRideId);
          linked.checked = true;
          linked.dispatchEvent(new Event("change", { bubbles: true }));
        }
      } catch (error) {
        rideList.innerHTML = /* HTML */ `
          <p class="muted">
            Could not load your rides: ${escapeHTML(error.message)}
          </p>
          <button class="btn btn-outline" type="button" id="retry-split-rides">
            Try again
          </button>
        `;
      }
    };
    rideList.addEventListener("change", (event) => {
      if (!event.target.matches('input[name="split-ride"]')) return;
      const rideId = Number(event.target.value);
      selectedRideId = eligibleRideIds.has(rideId) ? rideId : null;
      createButton.disabled = !selectedRideId;
      rideList.querySelectorAll(".ride-option").forEach((option) => {
        option.classList.toggle(
          "is-selected",
          option.querySelector("input").checked,
        );
      });
    });
    rideList.addEventListener("click", (event) => {
      if (event.target.closest("#retry-split-rides")) loadEligibleRides();
    });
    $("#split-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!selectedRideId || !eligibleRideIds.has(selectedRideId)) {
        toast("Select an eligible completed ride first.", "error");
        return;
      }
      const button = createButton;
      setBusy(button, true, "Creating…");
      try {
        const invite_emails = $("#emails")
          .value.split(/[\s,;]+/)
          .map((v) => v.trim())
          .filter(Boolean);
        const data = await CabAPI.request("/fare-splits", {
          method: "POST",
          body: { ride_id: selectedRideId, invite_emails },
        });
        const url = `${location.origin}${data.invitation_path}`;
        $("#split-result").innerHTML = /* HTML */ `
          <h3>Fare split created</h3>
          <p>
            Total:
            <strong>₹${Number(data.total_amount).toFixed(2)}</strong>
          </p>
          <p>Members: ${data.member_count}</p>
          <div id="split-members" class="report-item">
            Loading participant shares…
          </div>
          <button class="btn btn-outline" id="refresh-split" type="button">
            Refresh payment status
          </button>
          <label>Invitation link</label>
          <div class="inline-row">
            <input
              class="input"
              readonly
              value="${escapeHTML(url)}"
              id="invite-url"
            />
            <button class="btn btn-outline" id="copy-invite" type="button">
              Copy
            </button>
          </div>
          <div id="split-qr"></div>
          <p class="form-note">
            Invitees must sign in using an email address included in the
            invitation.
          </p>
        `;
        $("#copy-invite").addEventListener("click", () =>
          navigator.clipboard
            .writeText(url)
            .then(() => toast("Invitation link copied."))
            .catch(() => toast("Could not copy link.", "error")),
        );
        if (window.QRCode)
          new QRCode($("#split-qr"), { text: url, width: 180, height: 180 });
        const refreshSplit = async () => {
          try {
            const details = await CabAPI.request(`/fare-splits/${data.id}`);
            $("#split-members").innerHTML = /* HTML */ `
              <strong>Split status: ${escapeHTML(details.status)}</strong>
              <ul>
                ${details.members
                  .map(
                    (member) => /* HTML */ `
                      <li>
                        ${escapeHTML(member.email)} —
                        ₹${Number(member.amount).toFixed(2)}
                        (${escapeHTML(member.status)})
                      </li>
                    `,
                  )
                  .join("")}
              </ul>
            `;
          } catch (error) {
            $("#split-members").textContent =
              `Could not load participant shares: ${error.message}`;
          }
        };
        $("#refresh-split").addEventListener("click", refreshSplit);
        await refreshSplit();
        await loadEligibleRides();
      } catch (err) {
        showError(err);
      } finally {
        setBusy(button, false);
        button.disabled = !selectedRideId;
      }
    });
    loadEligibleRides();
  }

  if (page === "join-split") {
    if (!requireRole("passenger")) return;
    const token = new URLSearchParams(location.search).get("token");
    const button = $("#join-button");
    if (!token) {
      $("#invite-details").textContent = "Invitation token is missing.";
      return;
    }
    (async () => {
      try {
        const data = await CabAPI.request(
          `/fare-splits/invite/${encodeURIComponent(token)}`,
        );
        $("#invite-details").innerHTML = /* HTML */ `
          <h2>₹${Number(data.total_amount).toFixed(2)} total</h2>
          <p>Ride #${data.ride_id} · ${data.members.length} invited members</p>
          <p>
            Your signed-in email:
            <strong>${escapeHTML(user.email)}</strong>
          </p>
          <ul>
            ${data.members
              .map(
                (m) => /* HTML */ `
                  <li>
                    ${escapeHTML(m.email)} — ₹${Number(m.amount).toFixed(2)}
                    (${escapeHTML(m.status)})
                  </li>
                `,
              )
              .join("")}
          </ul>
        `;
        button.hidden = false;
        button.addEventListener("click", async () => {
          setBusy(button, true, "Joining…");
          try {
            await CabAPI.request(
              `/fare-splits/invite/${encodeURIComponent(token)}/join`,
              { method: "POST", body: {} },
            );
            toast("You joined the split.");
            button.disabled = true;
            button.textContent = "Joined";
          } catch (e) {
            showError(e);
            setBusy(button, false);
          }
        });
      } catch (e) {
        $("#invite-details").textContent = e.message;
      }
    })();
  }

  if (page === "sos") {
    if (!requireRole("passenger")) return;
    $("#sos-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!confirm("Send an SOS alert for this active ride?")) return;
      const button = e.submitter;
      setBusy(button, true, "Sending alert…");
      const send = async (coords) => {
        try {
          const data = await CabAPI.request(
            `/rides/${encodeURIComponent($("#ride-id").value)}/sos`,
            {
              method: "POST",
              body: { ...(coords || {}), message: $("#message").value },
            },
          );
          $("#sos-result").innerHTML = /* HTML */ `
            <div class="notice error">
              <strong>Alert recorded · #${data.alert_id}</strong>
              <p>${escapeHTML(data.notification_note)}</p>
              <p>Emergency contacts on file: ${data.contacts.length}</p>
              ${data.contacts
                .map(
                  (c) => /* HTML */ `
                    <p>${escapeHTML(c.name)} · ${escapeHTML(c.phone)}</p>
                  `,
                )
                .join("")}
            </div>
          `;
          toast("SOS alert recorded.");
        } catch (err) {
          showError(err);
        } finally {
          setBusy(button, false);
        }
      };
      if (navigator.geolocation)
        navigator.geolocation.getCurrentPosition(
          (p) =>
            send({
              latitude: p.coords.latitude,
              longitude: p.coords.longitude,
            }),
          () => send(null),
          { enableHighAccuracy: true, timeout: 8000 },
        );
      else send(null);
    });
  }

  if (page === "lost-found") {
    if (!requireRole("passenger")) return;
    const rideList = $("#lost-ride-list");
    const submitButton = $("#submit-lost-report");
    let selectedRideId = null;
    let eligibleRideIds = new Set();
    const loadRides = async () => {
      rideList.innerHTML = '<p class="loading">Loading your recent rides…</p>';
      submitButton.disabled = true;
      selectedRideId = null;
      eligibleRideIds = new Set();
      try {
        const { items } = await CabAPI.request("/rides");
        const eligible = items.filter((ride) =>
          ["in_progress", "completed"].includes(ride.status),
        );
        eligibleRideIds = new Set(eligible.map((ride) => Number(ride.id)));
        if (!items.length) {
          rideList.innerHTML =
            '<p class="muted">You have no rides yet. Once you have taken a trip, you can report a lost item here.</p>';
          return;
        }
        if (!eligible.length) {
          rideList.innerHTML =
            '<p class="muted">None of your recent rides are eligible yet. A lost-item report must be linked to a ride in progress or a completed ride.</p>';
          return;
        }
        rideList.innerHTML = eligible
          .map(
            (ride) => /* HTML */ `
              <label class="ride-option">
                <input
                  type="radio"
                  name="selected-ride"
                  value="${Number(ride.id)}"
                />
                <span class="ride-option-details">
                  <strong>
                    ${escapeHTML(ride.pickup_address)} →
                    ${escapeHTML(ride.dropoff_address)}
                  </strong>
                  <span class="report-meta">
                    ${escapeHTML(new Date(ride.scheduled_at || ride.requested_at).toLocaleString())}
                    ·
                    ${escapeHTML(ride.vehicle_category || "Vehicle not specified")}
                    · ${escapeHTML(ride.status.replaceAll("_", " "))}
                  </span>
                </span>
              </label>
            `,
          )
          .join("");
        const linkedRideId = Number(
          new URLSearchParams(location.search).get("ride"),
        );
        if (eligibleRideIds.has(linkedRideId)) {
          const linked = [
            ...rideList.querySelectorAll('input[name="selected-ride"]'),
          ].find((input) => Number(input.value) === linkedRideId);
          linked.checked = true;
          linked.dispatchEvent(new Event("change", { bubbles: true }));
        }
      } catch (error) {
        rideList.innerHTML = /* HTML */ `
          <p class="muted">
            Could not load your rides: ${escapeHTML(error.message)}
          </p>
          <button class="btn btn-outline" type="button" id="retry-lost-rides">
            Try again
          </button>
        `;
      }
    };
    rideList.addEventListener("change", (event) => {
      if (!event.target.matches('input[name="selected-ride"]')) return;
      const rideId = Number(event.target.value);
      selectedRideId = eligibleRideIds.has(rideId) ? rideId : null;
      submitButton.disabled = !selectedRideId;
      rideList.querySelectorAll(".ride-option").forEach((option) => {
        option.classList.toggle(
          "is-selected",
          option.querySelector("input").checked,
        );
      });
    });
    rideList.addEventListener("click", (event) => {
      if (event.target.closest("#retry-lost-rides")) loadRides();
    });
    const loadReports = async () => {
      try {
        const { items } = await CabAPI.request("/lost-found/mine");
        $("#my-reports").innerHTML = items.length
          ? items
              .map(
                (r) => /* HTML */ `
                  <article class="report-item">
                    <strong>Report #${r.id}</strong>
                    <span class="badge badge-${r.status}">
                      ${escapeHTML(r.status)}
                    </span>
                    <p>${escapeHTML(r.description)}</p>
                    ${
                      r.response
                        ? /* HTML */ `
                            <div class="notice">
                              Customer care: ${escapeHTML(r.response)}
                            </div>
                          `
                        : ""
                    }
                    <div class="report-meta">
                      ${new Date(r.created_at).toLocaleString()}
                    </div>
                  </article>
                `,
              )
              .join("")
          : '<p class="muted">You have not submitted any reports.</p>';
      } catch (e) {
        $("#my-reports").textContent = e.message;
      }
    };
    $("#lost-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!selectedRideId || !eligibleRideIds.has(selectedRideId)) {
        toast("Select an eligible ride before submitting.", "error");
        return;
      }
      const button = submitButton;
      setBusy(button, true, "Submitting…");
      try {
        await CabAPI.request("/lost-found", {
          method: "POST",
          body: {
            ride_id: selectedRideId,
            description: $("#description").value,
          },
        });
        toast("Report submitted.");
        $("#lost-form").reset();
        selectedRideId = null;
        rideList.querySelectorAll(".ride-option").forEach((option) => {
          option.classList.remove("is-selected");
        });
        await loadReports();
      } catch (err) {
        showError(err);
      } finally {
        setBusy(button, false);
        button.disabled = !selectedRideId;
      }
    });
    loadRides();
    loadReports();
  }

  if (page === "admin-care-desk") {
    if (!requireRole("admin")) return;
    const load = async () => {
      try {
        const [alerts, reports] = await Promise.all([
          CabAPI.request("/safety-alerts"),
          CabAPI.request("/lost-found/care"),
        ]);
        $("#sos-alerts").innerHTML = alerts.items.length
          ? alerts.items
              .map(
                (a) => /* HTML */ `
                  <article class="report-item">
                    <strong>SOS #${a.id} · Ride #${a.ride_id}</strong>
                    <span class="badge badge-pending">Open</span>
                    <p>
                      ${escapeHTML(a.message || "Emergency assistance requested.")}
                    </p>
                    <p class="report-meta">
                      ${escapeHTML(a.passenger_name)} ·
                      ${escapeHTML(a.passenger_phone)} ·
                      ${new Date(a.created_at).toLocaleString()}
                    </p>
                    ${alertLocationLink(a)}
                    <div class="inline-row" style="margin-top:10px">
                      <button class="btn btn-outline btn-sm resolve-alert">
                        Mark resolved
                      </button>
                    </div>
                  </article>
                `,
              )
              .join("")
          : '<p class="muted">No open SOS alerts.</p>';
        document.querySelectorAll(".resolve-alert").forEach((button) =>
          button.addEventListener("click", async () => {
            const card = button.closest(".report-item");
            const id = card
              .querySelector("strong")
              .textContent.match(/#(\d+)/)?.[1];
            if (!id) return;
            setBusy(button, true, "Resolving…");
            try {
              await CabAPI.request(`/safety-alerts/${id}/resolve`, {
                method: "PATCH",
                body: {},
              });
              toast("Safety alert resolved.");
              await load();
            } catch (e) {
              showError(e);
              setBusy(button, false);
            }
          }),
        );
        const { items } = reports;
        $("#care-reports").innerHTML = items.length
          ? items
              .map(
                (r) => /* HTML */ `
                  <article class="report-item" data-report="${r.id}">
                    <div class="inline-row">
                      <strong>Report #${r.id} · Ride #${r.ride_id}</strong>
                      <span class="badge badge-${r.status}">
                        ${escapeHTML(r.status)}
                      </span>
                    </div>
                    <p>${escapeHTML(r.description)}</p>
                    <p class="report-meta">
                      ${escapeHTML(r.passenger_name)} ·
                      ${escapeHTML(r.passenger_email)} ·
                      ${new Date(r.created_at).toLocaleString()}
                    </p>
                    <label>Customer-care response</label>
                    <textarea
                      class="input care-response"
                      rows="3"
                      maxlength="2000"
                    >
${escapeHTML(r.response || "")}</textarea>
                    <div class="inline-row">
                      <select class="select care-status">
                        <option
                          value="open"
                          ${r.status === "open" ? "selected" : ""}
                        >
                          Open
                        </option>
                        <option
                          value="found"
                          ${r.status === "found" ? "selected" : ""}
                        >
                          Found
                        </option>
                        <option
                          value="closed"
                          ${r.status === "closed" ? "selected" : ""}
                        >
                          Closed
                        </option>
                      </select>
                      <button class="btn btn-primary btn-sm save-response">
                        Save response
                      </button>
                    </div>
                  </article>
                `,
              )
              .join("")
          : '<p class="muted">No lost-item reports yet.</p>';
        document.querySelectorAll(".save-response").forEach((button) =>
          button.addEventListener("click", async () => {
            const card = button.closest("[data-report]");
            setBusy(button, true, "Saving…");
            try {
              await CabAPI.request(
                `/lost-found/${card.dataset.report}/respond`,
                {
                  method: "PATCH",
                  body: {
                    response: card.querySelector(".care-response").value,
                    status: card.querySelector(".care-status").value,
                  },
                },
              );
              toast("Response saved.");
              await load();
            } catch (e) {
              showError(e);
              setBusy(button, false);
            }
          }),
        );
      } catch (e) {
        $("#care-reports").textContent = e.message;
      }
    };
    $("#refresh-reports").addEventListener("click", load);
    load();
  }
});
