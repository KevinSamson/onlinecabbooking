window.CabMap = {
  create(elementId, options = {}) {
    if (!window.L) throw new Error('Leaflet is not loaded.');
    const map = L.map(elementId).setView(options.center || [20.5937, 78.9629], options.zoom || 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    return map;
  },
  marker(map, latitude, longitude, label) { return L.marker([latitude, longitude]).addTo(map).bindPopup(label || 'Location'); },
  route(map, points) { const line = L.polyline(points, { color: '#7a9f23', weight: 4 }).addTo(map); map.fitBounds(line.getBounds(), { padding: [30, 30] }); return line; }
};
