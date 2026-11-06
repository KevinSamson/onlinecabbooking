/* Address search and map selection for the passenger booking form. */
window.CabBooking = {
  init() {
    const byId = (id) => document.getElementById(id);
    const escape = (value) => window.escapeHTML(value);
    const form = byId("booking-form");
    const mapSection = byId("booking-map-section");
    const mapStatus = byId("map-status");
    const locationMessage = byId("location-message");
    const fields = new Map([
      ["pickup", byId("pickup")],
      ["dropoff", byId("drop")],
    ]);
    const points = new Map();
    const markers = new Map();
    const stopKeys = [];
    const searchTimers = new Map();
    const searchControllers = new Map();
    const searchVersions = new Map();
    const lookupVersions = new Map();
    const searchCache = new Map();
    const reverseCache = new Map();
    let map = null;
    let routeLine = null;
    let selectedTarget = "pickup";
    let stopCount = 0;
    let fareEstimate = null;
    let fareTimer;
    let fareVersion = 0;
    let roadRoute = null;
    let routeVersion = 0;
    let routeTimer;
    let routeController;
    let bookedRide = null;
    let geolocationVersion = 0;
    const scheduleToggle = byId("schedule-later");
    const scheduleDate = byId("schedule-date");
    const scheduleTime = byId("schedule-time");
    const submitButton = byId("book-ride-submit");
    const localDate = (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const localTime = (date) =>
      `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    const scheduledPickup = () => {
      if (!scheduleToggle.checked) return null;
      const earliest = new Date(Date.now() + 60_000);
      scheduleDate.min = localDate(earliest);
      if (scheduleDate.value === localDate(earliest))
        scheduleTime.min = localTime(earliest);
      else scheduleTime.removeAttribute("min");
      let message = "";
      let pickup = null;
      if (!scheduleDate.value || !scheduleTime.value) {
        message = "Choose both a pickup date and time.";
      } else {
        pickup = new Date(`${scheduleDate.value}T${scheduleTime.value}`);
        if (!Number.isFinite(pickup.getTime()) || pickup < earliest) {
          message = "Choose a future pickup date and time.";
          pickup = null;
        }
      }
      byId("schedule-validation").textContent = message;
      return pickup;
    };
    const refreshSubmitState = () => {
      const pickupTime = scheduleToggle.checked ? scheduledPickup() : null;
      submitButton.disabled =
        !roadRoute || (scheduleToggle.checked && !pickupTime);
    };

    const selectedCategory = new URLSearchParams(location.search).get(
      "category",
    );
    if (
      [...byId("vehicle").options].some(
        (option) => option.value === selectedCategory,
      )
    ) {
      byId("vehicle").value = selectedCategory;
    }

    const labelFor = (key) =>
      key === "pickup"
        ? "pickup"
        : key === "dropoff"
          ? "destination"
          : `stop ${stopKeys.indexOf(key) + 1}`;
    const validCoordinates = (lat, lng) =>
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180;
    const orderedKeys = () => ["pickup", ...stopKeys, "dropoff"];
    const notice = (message) => {
      locationMessage.textContent = message;
    };
    const invalidateBooking = () => {
      if (!bookedRide) return;
      bookedRide = null;
      byId("booking-message").replaceChildren();
    };
    const cacheSet = (cache, key, value) => {
      if (cache.size >= 30) cache.delete(cache.keys().next().value);
      cache.set(key, value);
    };

    const formatFeature = (feature) => {
      const properties = feature.properties || {};
      const street = [properties.housenumber, properties.street]
        .filter(Boolean)
        .join(" ");
      const parts = [
        properties.name,
        street,
        properties.district || properties.locality,
        properties.city || properties.county,
        properties.state,
        properties.country,
      ];
      const distinct = parts.filter(
        (part, index) => part && parts.indexOf(part) === index,
      );
      return distinct.join(", ").slice(0, 255);
    };
    const featurePoint = (feature) => {
      const [lng, lat] = feature.geometry?.coordinates || [];
      return validCoordinates(lat, lng) ? { lat, lng } : null;
    };
    const photonRequest = async (endpoint, parameters, controller) => {
      const url = new URL(`https://photon.komoot.io/${endpoint}`);
      Object.entries(parameters).forEach(([key, value]) =>
        url.searchParams.set(key, value),
      );
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok)
          throw new Error(`Location service returned ${response.status}.`);
        return (await response.json()).features || [];
      } finally {
        clearTimeout(timeout);
      }
    };

    const suggestionBox = (key) => byId(`${fields.get(key).id}-suggestions`);
    const hideSuggestions = (key) => {
      const box = suggestionBox(key);
      box.hidden = true;
      box.replaceChildren();
      fields.get(key).setAttribute("aria-expanded", "false");
    };
    const showSuggestions = (key, features) => {
      const box = suggestionBox(key);
      const results = features.filter(
        (feature) => featurePoint(feature) && formatFeature(feature),
      );
      box.innerHTML = results.length
        ? results
            .map(
              (feature, index) => `
            <button class="location-suggestion" type="button" role="option" data-suggestion="${index}">
              ${escape(formatFeature(feature))}
            </button>
          `,
            )
            .join("")
        : '<div class="location-suggestion-empty">No matching addresses. Try a more specific search.</div>';
      box.hidden = false;
      fields.get(key).setAttribute("aria-expanded", "true");
      box.onclick = (event) => {
        const option = event.target.closest("[data-suggestion]");
        if (option)
          selectFeature(key, results[Number(option.dataset.suggestion)]);
      };
    };
    const cancelSearch = (key) => {
      clearTimeout(searchTimers.get(key));
      searchControllers.get(key)?.abort();
      searchVersions.set(key, (searchVersions.get(key) || 0) + 1);
    };

    const renderSummary = () => {
      const summary = byId("booking-summary");
      const pickupTime = scheduleToggle.checked ? scheduledPickup() : null;
      const entries = orderedKeys()
        .map((key) => [labelFor(key), fields.get(key).value.trim()])
        .filter(([, address]) => address);
      if (!entries.length) {
        summary.className = "empty";
        summary.textContent = "Your trip summary will appear here.";
        return;
      }
      const row = (label, value) => `
        <div class="summary-row"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>
      `;
      summary.className = "";
      summary.innerHTML = [
        bookedRide
          ? row(
              "Booking",
              `Ride #${bookedRide.id} ${bookedRide.scheduled_at ? "scheduled" : "confirmed"}`,
            )
          : "",
        ...entries.map(([label, address]) =>
          row(label.charAt(0).toUpperCase() + label.slice(1), address),
        ),
        row("Vehicle", byId("vehicle").selectedOptions[0].textContent),
        pickupTime
          ? row(
              "Pickup time",
              pickupTime.toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            )
          : "",
        roadRoute
          ? row(
              "Estimated road distance",
              `${roadRoute.distance_km.toFixed(2)} km`,
            )
          : "",
        fareEstimate !== null || bookedRide
          ? row(
              "Estimated fare",
              `₹${Number(bookedRide?.estimated_fare ?? fareEstimate).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`,
            )
          : "",
      ].join("");
    };
    const refreshFare = () => {
      clearTimeout(fareTimer);
      const version = ++fareVersion;
      const distance = roadRoute?.distance_km;
      if (!Number.isFinite(distance) || distance <= 0) {
        fareEstimate = null;
        renderSummary();
        return;
      }
      fareTimer = setTimeout(async () => {
        try {
          const { items } = await CabAPI.request(
            `/rides/fare-estimate?distanceKm=${encodeURIComponent(distance)}`,
          );
          if (version !== fareVersion) return;
          fareEstimate =
            items.find((item) => item.category === byId("vehicle").value)
              ?.estimated_fare ?? null;
        } catch {
          if (version !== fareVersion) return;
          fareEstimate = null;
        }
        renderSummary();
      }, 250);
    };

    const markerIcon = (key) => {
      const kind =
        key === "pickup" ? "pickup" : key === "dropoff" ? "dropoff" : "stop";
      const letter = key.startsWith("stop-")
        ? String(stopKeys.indexOf(key) + 1)
        : kind === "pickup"
          ? "P"
          : "D";
      return L.divIcon({
        className: `booking-pin booking-pin-${kind}`,
        html: letter,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
    };
    const updateMap = (focusKey) => {
      if (!map) return;
      for (const key of orderedKeys()) {
        const point = points.get(key);
        const marker = markers.get(key);
        if (point && marker) marker.setLatLng([point.lat, point.lng]);
        else if (point) {
          const created = CabMap.marker(
            map,
            point.lat,
            point.lng,
            labelFor(key),
          );
          created.setIcon(markerIcon(key));
          markers.set(key, created);
        } else if (marker) {
          map.removeLayer(marker);
          markers.delete(key);
        }
      }
      const locations = orderedKeys()
        .map((key) => points.get(key))
        .filter(Boolean)
        .map((point) => [point.lat, point.lng]);
      if (roadRoute) {
        const line = roadRoute.geometry.map(([lng, lat]) => [lat, lng]);
        if (routeLine) routeLine.setLatLngs(line);
        else
          routeLine = L.polyline(line, { color: "#7a9f23", weight: 5 }).addTo(
            map,
          );
        map.fitBounds(routeLine.getBounds(), {
          padding: [35, 35],
          maxZoom: 15,
        });
      } else if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
      }
      if (locations.length === 1 && focusKey) {
        const point = points.get(focusKey);
        if (point) map.setView([point.lat, point.lng], 15);
      } else if (!roadRoute && locations.length > 1 && focusKey) {
        map.fitBounds(locations, { padding: [35, 35], maxZoom: 15 });
      }
    };
    const routePoints = () => {
      if (!points.has("pickup") || !points.has("dropoff")) return null;
      const activeStops = stopKeys.filter((key) =>
        fields.get(key).value.trim(),
      );
      if (activeStops.some((key) => !points.has(key))) return null;
      return ["pickup", ...activeStops, "dropoff"].map((key) => {
        const point = points.get(key);
        return [point.lat, point.lng];
      });
    };
    const updateRoute = (immediate = false) => {
      clearTimeout(routeTimer);
      routeController?.abort();
      const version = ++routeVersion;
      roadRoute = null;
      fareEstimate = null;
      ++fareVersion;
      clearTimeout(fareTimer);
      submitButton.disabled = true;
      byId("retry-route").hidden = true;
      updateMap();
      renderSummary();
      const locations = routePoints();
      if (!locations) {
        byId("route-distance").textContent = "Choose pickup and destination";
        byId("route-status").textContent = stopKeys.some(
          (key) => fields.get(key).value.trim() && !points.has(key),
        )
          ? "Choose each stop from the suggestions or map."
          : "";
        return;
      }
      byId("route-distance").textContent = "Calculating route...";
      byId("route-status").textContent =
        "Finding the driving route along roads.";
      routeTimer = setTimeout(
        async () => {
          const controller = new AbortController();
          routeController = controller;
          try {
            const result = await CabAPI.request("/rides/route", {
              method: "POST",
              body: { points: locations },
              signal: controller.signal,
            });
            if (version !== routeVersion) return;
            roadRoute = result;
            byId("route-distance").textContent =
              `${result.distance_km.toFixed(2)} km`;
            byId("route-status").textContent =
              "Driving route calculated with OSRM.";
            refreshSubmitState();
            updateMap();
            renderSummary();
            refreshFare();
          } catch (error) {
            if (version !== routeVersion || error.name === "AbortError") return;
            byId("route-distance").textContent = "Route unavailable";
            byId("route-status").textContent =
              `${error.message} Check your locations and retry.`;
            byId("retry-route").hidden = false;
            renderSummary();
          }
        },
        immediate ? 0 : 400,
      );
    };
    const selectTarget = (key) => {
      selectedTarget = key;
      document.querySelectorAll("[data-map-target]").forEach((button) => {
        const active = button.dataset.mapTarget === key;
        button.classList.toggle("btn-primary", active);
        button.classList.toggle("btn-outline", !active);
        button.setAttribute("aria-pressed", String(active));
      });
      mapStatus.textContent = `Click the map to place your ${labelFor(key)} pin.`;
    };
    const revealMap = (key) => {
      mapSection.hidden = false;
      selectTarget(key);
      try {
        if (!map) {
          map = CabMap.create("booking-map");
          map.on("click", ({ latlng }) =>
            reversePoint(selectedTarget, latlng.lat, latlng.lng),
          );
        }
        requestAnimationFrame(() => {
          map.invalidateSize();
          updateMap(key);
        });
      } catch (error) {
        notice(
          `Map unavailable: ${error.message}. Search for an address instead.`,
        );
      }
    };
    const setPoint = (key, point, address) => {
      if (!point || !address) return;
      lookupVersions.set(key, (lookupVersions.get(key) || 0) + 1);
      invalidateBooking();
      cancelSearch(key);
      points.set(key, point);
      fields.get(key).value = address;
      hideSuggestions(key);
      updateMap(key);
      renderSummary();
      updateRoute();
      notice(`${labelFor(key)} selected: ${address}`);
    };
    const selectFeature = (key, feature) => {
      const point = featurePoint(feature);
      const address = formatFeature(feature);
      if (!point || !address) return;
      setPoint(key, point, address);
      revealMap(key);
    };
    const reversePoint = async (key, lat, lng) => {
      if (!validCoordinates(lat, lng)) return;
      const version = (lookupVersions.get(key) || 0) + 1;
      lookupVersions.set(key, version);
      invalidateBooking();
      cancelSearch(key);
      hideSuggestions(key);
      points.set(key, { lat, lng });
      fields.get(key).value = "";
      renderSummary();
      updateMap(key);
      updateRoute();
      notice(`Finding the address for your ${labelFor(key)}...`);
      const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      try {
        let address = reverseCache.get(cacheKey);
        if (!address) {
          const features = await photonRequest(
            "reverse",
            { lat, lon: lng, limit: 1 },
            new AbortController(),
          );
          address = features.map(formatFeature).find(Boolean);
          if (address) cacheSet(reverseCache, cacheKey, address);
        }
        if (lookupVersions.get(key) !== version) return;
        if (!address) throw new Error("No address was found for this point.");
        setPoint(key, { lat, lng }, address);
      } catch (error) {
        if (lookupVersions.get(key) !== version) return;
        notice(
          `Could not find an address for your ${labelFor(key)}. Search for an address or choose another point.`,
        );
      }
    };

    const searchAddress = (key) => {
      cancelSearch(key);
      const input = fields.get(key);
      const query = input.value.trim();
      if (query.length < 3) {
        hideSuggestions(key);
        return;
      }
      const version = searchVersions.get(key);
      searchTimers.set(
        key,
        setTimeout(async () => {
          const cacheKey = query.toLocaleLowerCase();
          const controller = new AbortController();
          searchControllers.set(key, controller);
          try {
            let features = searchCache.get(cacheKey);
            if (!features) {
              const params = { q: query, limit: 5, lang: "en" };
              const center = map?.getCenter();
              if (center)
                Object.assign(params, { lat: center.lat, lon: center.lng });
              features = await photonRequest("api", params, controller);
              cacheSet(searchCache, cacheKey, features);
            }
            if (
              version === searchVersions.get(key) &&
              input.value.trim() === query
            ) {
              showSuggestions(key, features);
            }
          } catch (error) {
            if (version !== searchVersions.get(key)) return;
            hideSuggestions(key);
            notice(
              "Address search is temporarily unavailable. Try again shortly.",
            );
          }
        }, 450),
      );
    };
    const registerField = (key, input) => {
      fields.set(key, input);
      input.addEventListener("input", () => {
        invalidateBooking();
        lookupVersions.set(key, (lookupVersions.get(key) || 0) + 1);
        points.delete(key);
        updateMap();
        renderSummary();
        updateRoute();
        searchAddress(key);
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") hideSuggestions(key);
        if (event.key === "ArrowDown") {
          const first = suggestionBox(key).querySelector("[data-suggestion]");
          if (first) {
            event.preventDefault();
            first.focus();
          }
        }
      });
      suggestionBox(key).addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          hideSuggestions(key);
          input.focus();
        }
      });
    };
    registerField("pickup", byId("pickup"));
    registerField("dropoff", byId("drop"));

    form.addEventListener("click", (event) => {
      const selectButton = event.target.closest("[data-select-map]");
      if (selectButton) revealMap(selectButton.dataset.selectMap);
      const modeButton = event.target.closest("[data-map-target]");
      if (modeButton) selectTarget(modeButton.dataset.mapTarget);
    });
    document.addEventListener("click", (event) => {
      for (const key of fields.keys()) {
        if (!fields.get(key).closest(".location-field").contains(event.target))
          hideSuggestions(key);
      }
    });
    byId("use-current-location").addEventListener("click", () => {
      if (!navigator.geolocation) {
        notice(
          "Location services are unavailable in this browser. Search for your pickup instead.",
        );
        return;
      }
      notice("Requesting your current location...");
      const request = ++geolocationVersion;
      const pickupVersion = lookupVersions.get("pickup") || 0;
      try {
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            if (
              request !== geolocationVersion ||
              pickupVersion !== (lookupVersions.get("pickup") || 0)
            )
              return;
            revealMap("pickup");
            reversePoint("pickup", coords.latitude, coords.longitude);
            map?.setView([coords.latitude, coords.longitude], 15);
          },
          (error) => {
            if (
              request !== geolocationVersion ||
              pickupVersion !== (lookupVersions.get("pickup") || 0)
            )
              return;
            const message =
              error.code === 1
                ? "Location access was denied. Search for your pickup or select it on the map."
                : error.code === 3
                  ? "Your location request timed out. Try again or search for your pickup."
                  : "Your location is unavailable. Search for your pickup or select it on the map.";
            notice(message);
          },
          { enableHighAccuracy: true, timeout: 12000 },
        );
      } catch {
        notice("Your location is unavailable. Search for your pickup instead.");
      }
    });
    byId("add-stop").addEventListener("click", () => {
      if (stopCount >= 5) return;
      invalidateBooking();
      const number = ++stopCount;
      const key = `stop-${number}`;
      stopKeys.push(key);
      const wrapper = document.createElement("div");
      wrapper.className = "field location-field";
      wrapper.dataset.locationField = key;
      wrapper.innerHTML = `
        <label for="${key}">Additional stop ${number}</label>
        <div class="location-entry">
          <div class="location-search">
            <input class="input extra-stop" id="${key}" maxlength="255" autocomplete="off"
              aria-autocomplete="list" aria-controls="${key}-suggestions" aria-expanded="false"
              placeholder="Search stop ${number} address..." />
            <div class="location-suggestions" id="${key}-suggestions" role="listbox" hidden></div>
          </div>
          <button class="btn btn-outline" type="button" data-select-map="${key}">Select on map</button>
        </div>
      `;
      byId("stops-list").append(wrapper);
      registerField(key, byId(key));
      const modeButton = document.createElement("button");
      modeButton.className = "btn btn-outline";
      modeButton.type = "button";
      modeButton.dataset.mapTarget = key;
      modeButton.setAttribute("aria-pressed", "false");
      modeButton.textContent = `Select stop ${number}`;
      byId("map-mode-controls").insertBefore(
        modeButton,
        byId("map-mode-controls").lastElementChild,
      );
      updateRoute();
      byId(key).focus();
    });
    byId("retry-route").addEventListener("click", () => updateRoute(true));
    byId("vehicle").addEventListener("change", () => {
      invalidateBooking();
      renderSummary();
      refreshFare();
    });
    scheduleToggle.addEventListener("change", () => {
      invalidateBooking();
      byId("schedule-fields").hidden = !scheduleToggle.checked;
      scheduleDate.required = scheduleToggle.checked;
      scheduleTime.required = scheduleToggle.checked;
      submitButton.textContent = scheduleToggle.checked
        ? "Schedule Ride"
        : "Book Ride";
      if (!scheduleToggle.checked) byId("schedule-validation").textContent = "";
      refreshSubmitState();
      renderSummary();
    });
    for (const input of [scheduleDate, scheduleTime]) {
      const onScheduleChange = () => {
        invalidateBooking();
        refreshSubmitState();
        renderSummary();
      };
      input.addEventListener("input", onScheduleChange);
      input.addEventListener("change", onScheduleChange);
    }
    if (new URLSearchParams(location.search).get("schedule") === "1") {
      scheduleToggle.checked = true;
      scheduleToggle.dispatchEvent(new Event("change"));
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const pickupTime = scheduledPickup();
      if (scheduleToggle.checked && !pickupTime) {
        (!scheduleDate.value || scheduleDate.value < scheduleDate.min
          ? scheduleDate
          : scheduleTime
        ).focus();
        return;
      }
      for (const key of ["pickup", "dropoff"]) {
        if (!points.has(key)) {
          notice(
            `Choose your ${labelFor(key)} from the suggestions or map before booking.`,
          );
          fields.get(key).focus();
          return;
        }
      }
      if (!roadRoute) {
        notice("Wait for a valid driving route before booking.");
        return;
      }
      const stops = stopKeys
        .map((key) => ({
          address: fields.get(key).value.trim(),
          point: points.get(key),
        }))
        .filter((stop) => stop.address);
      const pickup = points.get("pickup");
      const dropoff = points.get("dropoff");
      try {
        byId("booking-message").innerHTML =
          `<div class="notice">${scheduleToggle.checked ? "Scheduling..." : "Booking..."}</div>`;
        const ride = await CabAPI.request("/rides", {
          method: "POST",
          body: {
            pickup_address: fields.get("pickup").value.trim(),
            dropoff_address: fields.get("dropoff").value.trim(),
            pickup_lat: pickup.lat,
            pickup_lng: pickup.lng,
            dropoff_lat: dropoff.lat,
            dropoff_lng: dropoff.lng,
            distance_km: roadRoute.distance_km,
            vehicle_category: byId("vehicle").value,
            stops: stops.map((stop) => stop.address),
            stop_coordinates: stops.map((stop) =>
              stop.point ? [stop.point.lat, stop.point.lng] : null,
            ),
            ...(pickupTime ? { scheduled_at: pickupTime.toISOString() } : {}),
          },
        });
        byId("booking-message").innerHTML = `
          <div class="notice success">Ride #${ride.id} ${pickupTime ? "scheduled" : "booked"}. <a href="/ride-history.html">View rides</a></div>
        `;
        bookedRide = ride;
        renderSummary();
      } catch (error) {
        byId("booking-message").innerHTML =
          `<div class="notice">${escape(error.message)}</div>`;
      }
    });
    refreshFare();
  },
};
