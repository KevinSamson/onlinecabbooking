function distanceKm(lat1, lon1, lat2, lon2) {
  const values = [lat1, lon1, lat2, lon2].map(Number);
  if (values.some((value) => !Number.isFinite(value)))
    throw new TypeError("Coordinates must be finite numbers");
  const [a, b, c, d] = values;
  if (
    Math.abs(a) > 90 ||
    Math.abs(c) > 90 ||
    Math.abs(b) > 180 ||
    Math.abs(d) > 180
  )
    throw new RangeError("Coordinates out of range");
  const rad = (value) => (value * Math.PI) / 180;
  const deltaLat = rad(c - a),
    deltaLon = rad(d - b);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(deltaLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
module.exports = { distanceKm };
