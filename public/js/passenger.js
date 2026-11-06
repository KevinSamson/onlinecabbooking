const $ = (id) => document.getElementById(id);
const esc = (value) => window.escapeHTML(value);
const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const categories = ["economy", "comfort", "premium", "xl"];
const showError = (id, error) => {
  if ($(id))
    $(id).innerHTML = /* HTML */ `
      <div class="notice">${esc(error.message || error)}</div>
    `;
};
const date = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
const rideActions = (ride) => {
  const actions = [
    /* HTML */ `
      <a href="/track-ride.html?ride=${ride.id}">Track</a>
    `,
  ];
  if (["accepted", "arriving", "in_progress"].includes(ride.status)) {
    actions.push(/* HTML */ `
      <a href="/sos.html?ride=${ride.id}">SOS</a>
    `);
  }
  if (ride.status === "completed") {
    actions.push(
      /* HTML */ `
        <a href="/split-fare.html?ride=${ride.id}">Split fare</a>
      `,
      /* HTML */ `
        <a href="/lost-found.html?ride=${ride.id}">Lost & Found</a>
      `,
    );
  }
  if (["requested", "accepted", "arriving"].includes(ride.status)) {
    actions.push(/* HTML */ `
      <button type="button" class="btn btn-danger" data-cancel="${ride.id}">
        Cancel
      </button>
    `);
  }
  return actions.join(" · ");
};
const rideRows = (rides) =>
  rides.length
    ? rides
        .map(
          (r) => /* HTML */ `
            <div class="ride-item row">
              <div>
                <strong>
                  ${esc(r.pickup_address)} → ${esc(r.dropoff_address)}
                </strong>
                <div class="muted">
                  #${r.id} · ${date(r.scheduled_at || r.requested_at)} ·
                  ${esc(r.vehicle_category)}
                </div>
                ${
                  r.driver_name
                    ? /* HTML */ `
                        <div class="muted">Driver: ${esc(r.driver_name)}</div>
                      `
                    : ""
                }
              </div>
              <div style="text-align:right">
                <strong>${money(r.final_fare ?? r.estimated_fare)}</strong>
                <div class="muted">${esc(r.status)}</div>
                <div>${rideActions(r)}</div>
              </div>
            </div>
          `,
        )
        .join("")
    : '<div class="empty">No rides yet.</div>';
async function loadRides() {
  const { items } = await CabAPI.request("/rides");
  if ($("dashboard-rides"))
    $("dashboard-rides").innerHTML = rideRows(items.slice(0, 4));
  if ($("history-table")) $("history-table").innerHTML = rideRows(items);
  const completed = items.filter((r) => r.status === "completed");
  const spent = completed.reduce(
    (sum, r) => sum + Number(r.final_fare ?? r.estimated_fare ?? 0),
    0,
  );
  if ($("total-rides")) $("total-rides").textContent = items.length;
  if ($("total-spent")) $("total-spent").textContent = money(spent);
  if ($("history-spent")) $("history-spent").textContent = money(spent);
  if ($("history-count")) $("history-count").textContent = completed.length;
  if ($("upcoming-count"))
    $("upcoming-count").textContent = items.filter(
      (r) => r.status === "requested" && r.scheduled_at,
    ).length;
}
document.addEventListener("DOMContentLoaded", () => {
  const page = document.querySelector("main")?.dataset.page;
  if (!page) return;
  if (!CabAPI.token() || CabAPI.user()?.role !== "passenger") {
    location.href = "/login.html";
    return;
  }
  document
    .querySelectorAll("[data-passenger-name]")
    .forEach((el) => (el.textContent = CabAPI.user().full_name));
  document.addEventListener("click", async (e) => {
    const cancel = e.target.closest("[data-cancel]");
    if (!cancel) return;
    if (!confirm("Cancel this ride?")) return;
    try {
      await CabAPI.request(`/rides/${cancel.dataset.cancel}/cancel`, {
        method: "POST",
      });
      await loadRides();
    } catch (error) {
      alert(error.message);
    }
  });
  if (page === "passenger-dashboard" || page === "ride-history")
    loadRides().catch((e) =>
      showError(
        page === "ride-history" ? "history-table" : "dashboard-rides",
        e,
      ),
    );
  if (page === "compare-fares") {
    $("fare-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const distance = Number($("fare-distance").value);
        const { items } = await CabAPI.request(
          `/rides/fare-estimate?distanceKm=${encodeURIComponent(distance)}`,
        );
        $("fare-results").innerHTML = items
          .map(
            (r) => /* HTML */ `
              <article class="card span-4">
                <span class="pill">${esc(r.category)}</span>
                <div class="price" style="margin:15px 0">
                  ${money(r.estimated_fare)}
                </div>
                <p class="muted">
                  Base ${money(r.base_fare)} + ${money(r.per_km)} per km
                </p>
                <button
                  type="button"
                  class="btn btn-primary"
                  data-choose="${esc(r.category)}"
                >
                  Choose ${esc(r.category)}
                </button>
              </article>
            `,
          )
          .join("");
      } catch (error) {
        showError("fare-results", error);
      }
    });
    $("fare-results").addEventListener("click", (e) => {
      const button = e.target.closest("[data-choose]");
      if (button)
        location.href = `/book-ride.html?category=${encodeURIComponent(button.dataset.choose)}`;
    });
  }
  if (page === "book-ride") CabBooking.init();
  if (page === "preferred-drivers") {
    const load = async () => {
      const [{ items }, { items: available }] = await Promise.all([
        CabAPI.request("/rides/preferred-drivers"),
        CabAPI.request("/rides/available-drivers"),
      ]);
      $("preferred-list").innerHTML =
        /* HTML */ `<div class="field">
          <label for="preferred-select">Approved driver</label>
          <select class="select" id="preferred-select">
            ${available
              .map(
                (d) => /* HTML */ `
                  <option value="${d.id}">${esc(d.full_name)}</option>
                `,
              )
              .join("")}
          </select>
          <button class="btn btn-primary" id="preferred-add" ${available.length ? "" : "disabled"}>
            Save driver
          </button>
        </div>` +
        (items.length
          ? items
              .map(
                (d) => /* HTML */ `
                  <div class="ride-item row">
                    <strong>${esc(d.full_name)}</strong>
                    <button class="btn btn-ghost" data-remove-driver="${d.id}">
                      Remove
                    </button>
                  </div>
                `,
              )
              .join("")
          : '<div class="empty">No preferred drivers yet.</div>');
      $("preferred-add").addEventListener("click", async () => {
        try {
          await CabAPI.request("/rides/preferred-drivers", {
            method: "POST",
            body: { driver_id: Number($("preferred-select").value) },
          });
          await load();
        } catch (error) {
          alert(error.message);
        }
      });
    };
    $("preferred-list").addEventListener("click", async (e) => {
      const button = e.target.closest("[data-remove-driver]");
      if (button) {
        await CabAPI.request(
          `/rides/preferred-drivers/${button.dataset.removeDriver}`,
          { method: "DELETE" },
        );
        await load();
      }
    });
    load().catch((e) => showError("preferred-list", e));
  }
});
