const OSRM_ORIGIN = "https://router.project-osrm.org";
const CACHE_TTL_MS = 5 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1100;
const cache = new Map();
const inFlight = new Map();
let queue = Promise.resolve();
let nextRequestAt = 0;

const validPoint = (point) =>
  Array.isArray(point) &&
  point.length === 2 &&
  point.every((value) => typeof value === "number" && Number.isFinite(value)) &&
  Math.abs(point[0]) <= 90 &&
  Math.abs(point[1]) <= 180;

async function fetchRoute(points) {
  const coordinates = points
    .map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
    .join(";");
  const url = new URL(`/route/v1/driving/${coordinates}`, OSRM_ORIGIN);
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "simplified");
  url.searchParams.set("steps", "false");
  url.searchParams.set("generate_hints", "false");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Astercab local development (OpenStreetMap routing)",
      },
    });
    if (!response.ok)
      throw new Error(`Routing service returned ${response.status}.`);
    const result = await response.json();
    const route = result.routes?.[0];
    const geometry = route?.geometry?.coordinates;
    if (
      result.code !== "Ok" ||
      !Number.isFinite(route?.distance) ||
      route.distance <= 0 ||
      !Array.isArray(geometry) ||
      geometry.length < 2 ||
      route.legs?.length !== points.length - 1
    ) {
      throw new Error("No drivable road route was found for these locations.");
    }
    const distanceKm = Math.round((route.distance / 1000) * 100) / 100;
    if (distanceKm <= 0 || distanceKm > 1000) {
      throw new Error("The road route must be between 0 and 1000 km.");
    }
    return { distance_km: distanceKm, geometry };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Road routing timed out. Please retry.");
    }
    if (error instanceof TypeError) {
      throw new Error("Road routing is temporarily unavailable. Please retry.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function roadRoute(points) {
  if (
    !Array.isArray(points) ||
    points.length < 2 ||
    points.length > 7 ||
    !points.every(validPoint)
  ) {
    throw new TypeError(
      "Choose valid pickup, stop, and destination locations.",
    );
  }

  const key = JSON.stringify(
    points.map(([lat, lng]) => [
      Number(lat.toFixed(6)),
      Number(lng.toFixed(6)),
    ]),
  );
  const saved = cache.get(key);
  if (saved && saved.expiresAt > Date.now()) return saved.route;
  if (inFlight.has(key)) return inFlight.get(key);

  const task = queue.then(async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
    const route = await fetchRoute(points);
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, { route, expiresAt: Date.now() + CACHE_TTL_MS });
    return route;
  });
  queue = task.catch(() => {});
  inFlight.set(key, task);
  try {
    return await task;
  } finally {
    inFlight.delete(key);
  }
}

module.exports = { roadRoute };
