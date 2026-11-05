const express = require('express');
const crypto = require('crypto');
const db = require('../config/db');
const auth = require('../middleware/auth');
const allow = require('../middleware/roles');
const { distanceKm } = require('../utils/geo');
const router = express.Router();
router.use(auth);

const ok = (res, message, data = {}, status = 200) =>
  res.status(status).json({ success: true, message, data });
const fail = (res, status, message) =>
  res.status(status).json({ success: false, message });
const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
const validCoords = (lat, lng) => lat !== null && lng !== null &&
  Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

async function getRide(rideId) {
  const [[ride]] = await db.execute(
    `SELECT id, passenger_id, driver_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
            planned_route, estimated_fare, final_fare, status
       FROM rides WHERE id = ?`, [rideId]);
  return ride;
}
function canViewRide(ride, user) {
  return ride && (Number(ride.passenger_id) === Number(user.id) ||
    Number(ride.driver_id) === Number(user.id) || user.role === 'admin');
}
function parseRoute(value) {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(point => Array.isArray(point)
      ? { lat: Number(point[0]), lng: Number(point[1]) }
      : { lat: Number(point.lat ?? point.latitude), lng: Number(point.lng ?? point.longitude) })
      .filter(p => validCoords(p.lat, p.lng));
  } catch { return []; }
}
function nearestRouteDistanceKm(point, route) {
  if (!route.length) return null;
  return Math.min(...route.map(p => distanceKm(point.lat, point.lng, p.lat, p.lng)));
}

// Driver GPS updates. P3 should call this endpoint during an active trip.
router.post('/tracking/:rideId/location', allow('driver'), async (req, res, next) => {
  try {
    const lat = number(req.body.latitude), lng = number(req.body.longitude);
    if (!validCoords(lat, lng)) return fail(res, 400, 'Valid latitude and longitude are required.');
    const ride = await getRide(req.params.rideId);
    if (!ride || Number(ride.driver_id) !== Number(req.user.id)) return fail(res, 404, 'Assigned ride not found.');
    if (!['accepted', 'arriving', 'in_progress'].includes(ride.status)) return fail(res, 409, 'This ride is not accepting location updates.');
    await db.execute(
      'INSERT INTO ride_locations (ride_id, driver_id, latitude, longitude) VALUES (?, ?, ?, ?)',
      [ride.id, req.user.id, lat, lng]);

    let deviation = null;
    if (ride.status === 'in_progress') {
      const route = parseRoute(ride.planned_route);
      const distance = nearestRouteDistanceKm({ lat, lng }, route);
      const threshold = 0.5; // 500 metres, as a simple demonstrable threshold.
      if (distance !== null && distance > threshold) {
        const [[openDeviation]] = await db.execute(
          `SELECT id FROM sos_alerts WHERE ride_id = ? AND status = 'open'
           AND message LIKE 'Route deviation detected:%' LIMIT 1`, [ride.id]);
        if (!openDeviation) {
          const [alert] = await db.execute(
            `INSERT INTO sos_alerts (ride_id, passenger_id, latitude, longitude, message)
             VALUES (?, ?, ?, ?, ?)`,
            [ride.id, ride.passenger_id, lat, lng,
              `Route deviation detected: driver is approximately ${distance.toFixed(2)} km from the planned route.`]);
          deviation = { alert_id: alert.insertId, distance_km: Number(distance.toFixed(2)), threshold_km: threshold };
        } else deviation = { alert_id: openDeviation.id, distance_km: Number(distance.toFixed(2)), threshold_km: threshold, already_open: true };
      }
    }
    return ok(res, 'Location recorded.', { ride_id: ride.id, latitude: lat, longitude: lng, deviation }, 201);
  } catch (error) { next(error); }
});

router.get('/tracking/:rideId', async (req, res, next) => {
  try {
    const ride = await getRide(req.params.rideId);
    if (!canViewRide(ride, req.user)) return fail(res, 404, 'Ride not found.');
    const [rows] = await db.execute(
      `SELECT latitude, longitude, recorded_at FROM ride_locations
       WHERE ride_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1`, [ride.id]);
    return ok(res, 'Tracking data loaded.', {
      ride: { id: ride.id, status: ride.status, pickup_lat: ride.pickup_lat, pickup_lng: ride.pickup_lng,
        dropoff_lat: ride.dropoff_lat, dropoff_lng: ride.dropoff_lng, planned_route: parseRoute(ride.planned_route) },
      location: rows[0] || null
    });
  } catch (error) { next(error); }
});

// SOS is persisted and made visible to customer care. No SMS/call provider is configured in P1.
router.post('/rides/:rideId/sos', allow('passenger'), async (req, res, next) => {
  try {
    const ride = await getRide(req.params.rideId);
    if (!ride || Number(ride.passenger_id) !== Number(req.user.id)) return fail(res, 404, 'Your ride was not found.');
    if (!['accepted', 'arriving', 'in_progress'].includes(ride.status)) return fail(res, 409, 'SOS is available for an active ride only.');
    const lat = req.body.latitude == null ? null : number(req.body.latitude);
    const lng = req.body.longitude == null ? null : number(req.body.longitude);
    if ((lat === null) !== (lng === null) || (lat !== null && !validCoords(lat, lng))) return fail(res, 400, 'Provide valid coordinates or omit both.');
    const message = String(req.body.message || 'Passenger requested emergency assistance.').trim().slice(0, 500);
    const [result] = await db.execute(
      'INSERT INTO sos_alerts (ride_id, passenger_id, latitude, longitude, message) VALUES (?, ?, ?, ?, ?)',
      [ride.id, req.user.id, lat, lng, message]);
    const [contacts] = await db.execute(
      'SELECT name, phone, relationship FROM emergency_contacts WHERE passenger_id = ? ORDER BY name',
      [ride.passenger_id]);
    return ok(res, 'SOS alert recorded for customer care.', {
      alert_id: result.insertId, status: 'open', contacts,
      notification_note: 'The alert is stored for customer care. SMS/call delivery requires a configured messaging provider.'
    }, 201);
  } catch (error) { next(error); }
});

// Fare splitting. Requires P1 to add invite_token to fare_splits (see P4_SCHEMA_REQUEST.sql).
router.post('/fare-splits', allow('passenger'), async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const ride = await getRide(req.body.ride_id);
    if (!ride || Number(ride.passenger_id) !== Number(req.user.id)) {
      connection.release(); return fail(res, 404, 'Your ride was not found.');
    }
    if (ride.status !== 'completed') { connection.release(); return fail(res, 409, 'Fare splitting is available after ride completion.'); }
    const amount = number(ride.final_fare ?? ride.estimated_fare);
    if (amount === null || amount <= 0) { connection.release(); return fail(res, 400, 'This ride has no valid fare to split.'); }
    const emails = [...new Set([req.user.email, ...(Array.isArray(req.body.invite_emails) ? req.body.invite_emails : [])]
      .map(v => String(v).trim().toLowerCase()).filter(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)))];
    if (emails.length < 2 || emails.length > 8) { connection.release(); return fail(res, 400, 'Add between 1 and 7 valid invitee email addresses.'); }
    const token = crypto.randomBytes(24).toString('hex');
    await connection.beginTransaction();
    const [split] = await connection.execute(
      'INSERT INTO fare_splits (ride_id, created_by, total_amount, invite_token) VALUES (?, ?, ?, ?)',
      [ride.id, req.user.id, amount, token]);
    const share = Math.floor((amount / emails.length) * 100) / 100;
    let allocated = 0;
    for (let i = 0; i < emails.length; i++) {
      const part = i === emails.length - 1 ? Number((amount - allocated).toFixed(2)) : share;
      allocated += part;
      const [[person]] = await connection.execute('SELECT id FROM users WHERE email = ? AND role = "passenger"', [emails[i]]);
      await connection.execute(
        'INSERT INTO fare_split_participants (fare_split_id, passenger_id, email, amount) VALUES (?, ?, ?, ?)',
        [split.insertId, person?.id || null, emails[i], part]);
    }
    await connection.commit();
    return ok(res, 'Fare split created.', {
      id: split.insertId, total_amount: amount, member_count: emails.length,
      invite_token: token, invitation_path: `/join-split.html?token=${token}`
    }, 201);
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (error.code === 'ER_DUP_ENTRY') return fail(res, 409, 'A fare split already exists for this ride.');
    next(error);
  } finally { connection.release(); }
});

router.get('/fare-splits/invite/:token', async (req, res, next) => {
  try {
    const [[split]] = await db.execute(
      `SELECT fs.id, fs.total_amount, fs.status, fs.created_at, r.id AS ride_id
       FROM fare_splits fs JOIN rides r ON r.id = fs.ride_id WHERE fs.invite_token = ?`, [req.params.token]);
    if (!split) return fail(res, 404, 'Invitation not found.');
    const [members] = await db.execute(
      'SELECT email, amount, status FROM fare_split_participants WHERE fare_split_id = ? ORDER BY id', [split.id]);
    return ok(res, 'Fare split loaded.', { ...split, members });
  } catch (error) { next(error); }
});

router.post('/fare-splits/invite/:token/join', allow('passenger'), async (req, res, next) => {
  try {
    const [[split]] = await db.execute('SELECT id, status FROM fare_splits WHERE invite_token = ?', [req.params.token]);
    if (!split || split.status !== 'pending') return fail(res, 404, 'Open fare split not found.');
    const [result] = await db.execute(
      'UPDATE fare_split_participants SET passenger_id = ? WHERE fare_split_id = ? AND email = ? AND passenger_id IS NULL',
      [req.user.id, split.id, req.user.email]);
    if (!result.affectedRows) {
      const [[existing]] = await db.execute(
        'SELECT id FROM fare_split_participants WHERE fare_split_id = ? AND email = ?', [split.id, req.user.email]);
      return existing ? fail(res, 409, 'You have already joined this split.') : fail(res, 403, 'Your signed-in email is not on this invitation.');
    }
    return ok(res, 'You joined the fare split.', { split_id: split.id });
  } catch (error) { next(error); }
});

router.get('/fare-splits/:id', allow('passenger'), async (req, res, next) => {
  try {
    const [[split]] = await db.execute(
      `SELECT fs.* FROM fare_splits fs JOIN fare_split_participants p ON p.fare_split_id = fs.id
       WHERE fs.id = ? AND p.email = ?`, [req.params.id, req.user.email]);
    if (!split) return fail(res, 404, 'Fare split not found.');
    const [members] = await db.execute(
      'SELECT email, amount, status, paid_at FROM fare_split_participants WHERE fare_split_id = ? ORDER BY id', [split.id]);
    return ok(res, 'Fare split loaded.', { ...split, members });
  } catch (error) { next(error); }
});

router.post('/fare-splits/:id/confirm-payment', allow('passenger'), async (req, res, next) => {
  try {
    const [result] = await db.execute(
      `UPDATE fare_split_participants p JOIN fare_splits fs ON fs.id = p.fare_split_id
       SET p.status = 'paid', p.paid_at = CURRENT_TIMESTAMP
       WHERE p.fare_split_id = ? AND p.email = ? AND fs.status = 'pending'`,
      [req.params.id, req.user.email]);
    if (!result.affectedRows) return fail(res, 404, 'Your pending fare share was not found.');
    await db.execute(
      `UPDATE fare_splits SET status = 'settled'
       WHERE id = ? AND NOT EXISTS (SELECT 1 FROM fare_split_participants WHERE fare_split_id = ? AND status <> 'paid')`,
      [req.params.id, req.params.id]);
    return ok(res, 'Payment marked as confirmed by you.', { status: 'paid', verification: 'self-reported; no payment gateway is connected' });
  } catch (error) { next(error); }
});

// Lost & Found: passenger submits and reviews own reports; admin acts as the customer-care desk.
router.post('/lost-found', allow('passenger'), async (req, res, next) => {
  try {
    const rideId = Number(req.body.ride_id);
    const description = String(req.body.description || '').trim();
    const ride = await getRide(rideId);
    if (!ride || Number(ride.passenger_id) !== Number(req.user.id)) return fail(res, 404, 'Your ride was not found.');
    if (description.length < 5 || description.length > 2000) return fail(res, 400, 'Describe the lost item in 5–2000 characters.');
    const [result] = await db.execute(
      'INSERT INTO lost_found_reports (ride_id, reporter_id, description) VALUES (?, ?, ?)',
      [rideId, req.user.id, description]);
    return ok(res, 'Lost-item report submitted.', { id: result.insertId, status: 'open' }, 201);
  } catch (error) { next(error); }
});
router.get('/lost-found/mine', allow('passenger'), async (req, res, next) => {
  try {
    const [items] = await db.execute(
      `SELECT id, ride_id, description, status, response, created_at, updated_at
       FROM lost_found_reports WHERE reporter_id = ? ORDER BY created_at DESC`, [req.user.id]);
    return ok(res, 'Your reports loaded.', { items });
  } catch (error) { next(error); }
});
router.patch('/safety-alerts/:id/resolve', allow('admin'), async (req, res, next) => {
  try {
    const [result] = await db.execute(
      "UPDATE sos_alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'open'",
      [req.params.id]);
    if (!result.affectedRows) return fail(res, 404, 'Open safety alert not found.');
    return ok(res, 'Safety alert marked as resolved.', { id: Number(req.params.id), status: 'resolved' });
  } catch (error) { next(error); }
});

router.get('/safety-alerts', allow('admin'), async (req, res, next) => {
  try {
    const [items] = await db.execute(
      `SELECT a.id, a.ride_id, a.passenger_id, a.latitude, a.longitude, a.message, a.status, a.created_at,
              u.full_name AS passenger_name, u.phone AS passenger_phone
       FROM sos_alerts a JOIN users u ON u.id = a.passenger_id
       WHERE a.status = 'open' ORDER BY a.created_at DESC`);
    return ok(res, 'Open safety alerts loaded.', { items });
  } catch (error) { next(error); }
});

router.get('/lost-found/care', allow('admin'), async (req, res, next) => {
  try {
    const [items] = await db.execute(
      `SELECT l.id, l.ride_id, l.description, l.status, l.response, l.created_at,
              u.full_name AS passenger_name, u.email AS passenger_email
       FROM lost_found_reports l JOIN users u ON u.id = l.reporter_id
       ORDER BY l.created_at DESC`);
    return ok(res, 'Customer-care reports loaded.', { items });
  } catch (error) { next(error); }
});
router.patch('/lost-found/:id/respond', allow('admin'), async (req, res, next) => {
  try {
    const response = String(req.body.response || '').trim();
    const status = ['open', 'found', 'closed'].includes(req.body.status) ? req.body.status : 'open';
    if (response.length < 2 || response.length > 2000) return fail(res, 400, 'Enter a response between 2 and 2000 characters.');
    const [result] = await db.execute(
      'UPDATE lost_found_reports SET response = ?, status = ?, responded_by = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?',
      [response, status, req.user.id, req.params.id]);
    if (!result.affectedRows) return fail(res, 404, 'Lost-item report not found.');
    return ok(res, 'Customer-care response saved.', { id: Number(req.params.id), status });
  } catch (error) { next(error); }
});

module.exports = router;
