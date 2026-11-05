const express = require("express");
const db = require("../config/db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const router = express.Router();
router.use(auth, roles("passenger"));

const RATES = {
  economy: { base: 30, perKm: 12 },
  comfort: { base: 50, perKm: 16 },
  premium: { base: 80, perKm: 22 },
  xl: { base: 100, perKm: 26 },
};
const validCoordinate = (value, max) =>
  value !== "" &&
  value !== null &&
  value !== undefined &&
  Number.isFinite(Number(value)) &&
  Math.abs(Number(value)) <= max;
const fail = (res, status, message) =>
  res.status(status).json({ success: false, message });
const ok = (res, message, data, status = 200) =>
  res.status(status).json({ success: true, message, data });

router.get("/fare-estimate", (req, res) => {
  const distance = Number(req.query.distanceKm);
  if (!Number.isFinite(distance) || distance <= 0 || distance > 1000)
    return fail(res, 400, "Enter a distance between 0 and 1000 km.");
  const items = Object.entries(RATES).map(([category, rate]) => ({
    category,
    base_fare: rate.base,
    per_km: rate.perKm,
    estimated_fare: Math.round((rate.base + distance * rate.perKm) * 100) / 100,
  }));
  return ok(res, "Fare estimates calculated.", { items });
});

router.get("/", async (req, res, next) => {
  try {
    const [items] = await db.execute(
      `SELECT r.id, r.pickup_address, r.dropoff_address, r.pickup_lat, r.pickup_lng,
      r.dropoff_lat, r.dropoff_lng, r.estimated_distance_km, r.estimated_fare, r.final_fare,
      r.status, r.scheduled_at, r.requested_at, r.driver_id, u.full_name AS driver_name,
      r.vehicle_category, v.make AS vehicle_make, v.model AS vehicle_model
      FROM rides r LEFT JOIN users u ON u.id=r.driver_id LEFT JOIN vehicles v ON v.id=r.vehicle_id
      WHERE r.passenger_id=? ORDER BY r.requested_at DESC, r.id DESC LIMIT 100`,
      [req.user.id],
    );
    return ok(res, "Your rides loaded.", { items });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  const pickup = String(req.body.pickup_address || "").trim();
  const dropoff = String(req.body.dropoff_address || "").trim();
  const distance = Number(req.body.distance_km);
  const category = String(req.body.vehicle_category || "economy");
  const coords = [
    req.body.pickup_lat,
    req.body.pickup_lng,
    req.body.dropoff_lat,
    req.body.dropoff_lng,
  ];
  if (!pickup || !dropoff || pickup.length > 255 || dropoff.length > 255)
    return fail(res, 400, "Enter valid pickup and destination addresses.");
  if (
    !validCoordinate(coords[0], 90) ||
    !validCoordinate(coords[1], 180) ||
    !validCoordinate(coords[2], 90) ||
    !validCoordinate(coords[3], 180)
  )
    return fail(res, 400, "Enter valid pickup and destination coordinates.");
  if (
    !Number.isFinite(distance) ||
    distance <= 0 ||
    distance > 1000 ||
    !RATES[category]
  )
    return fail(res, 400, "Enter a valid distance and vehicle category.");
  const stops = req.body.stops || [];
  if (
    !Array.isArray(stops) ||
    stops.length > 5 ||
    stops.some((s) => !String(s).trim() || String(s).length > 255)
  )
    return fail(res, 400, "Enter up to five valid stops.");
  const stopCoordinates = req.body.stop_coordinates || [];
  if (
    !Array.isArray(stopCoordinates) ||
    (stopCoordinates.length && stopCoordinates.length !== stops.length) ||
    stopCoordinates.some(
      (point) =>
        point !== null &&
        (!Array.isArray(point) ||
          point.length !== 2 ||
          !validCoordinate(point[0], 90) ||
          !validCoordinate(point[1], 180)),
    )
  )
    return fail(res, 400, "Enter valid coordinates for each selected stop.");
  const scheduledAt = req.body.scheduled_at
    ? new Date(req.body.scheduled_at)
    : null;
  if (
    scheduledAt &&
    (!Number.isFinite(scheduledAt.getTime()) || scheduledAt <= new Date())
  )
    return fail(res, 400, "Choose a future pickup time.");
  const fare =
    Math.round(
      (RATES[category].base + distance * RATES[category].perKm) * 100,
    ) / 100;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO rides
      (passenger_id, pickup_address, pickup_lat, pickup_lng,
       dropoff_address, dropoff_lat, dropoff_lng, planned_route,
       estimated_distance_km, estimated_fare, scheduled_at, vehicle_category)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.user.id,
        pickup,
        Number(coords[0]),
        Number(coords[1]),
        dropoff,
        Number(coords[2]),
        Number(coords[3]),
        JSON.stringify([
          [Number(coords[0]), Number(coords[1])],
          ...stopCoordinates
            .filter(Boolean)
            .map((point) => [Number(point[0]), Number(point[1])]),
          [Number(coords[2]), Number(coords[3])],
        ]),
        distance,
        fare,
        scheduledAt
          ? scheduledAt.toISOString().slice(0, 19).replace("T", " ")
          : null,
        category,
      ],
    );
    await connection.execute(
      `INSERT INTO ride_status_history (ride_id,status,changed_by,note) VALUES (?,'requested',?,?)`,
      [
        result.insertId,
        req.user.id,
        scheduledAt ? "Scheduled by passenger" : "Requested by passenger",
      ],
    );
    if (scheduledAt)
      await connection.execute(
        "INSERT INTO ride_schedules (ride_id,scheduled_for) VALUES (?,?)",
        [
          result.insertId,
          scheduledAt.toISOString().slice(0, 19).replace("T", " "),
        ],
      );
    for (let i = 0; i < stops.length; i++)
      await connection.execute(
        "INSERT INTO ride_stops (ride_id,stop_order,address) VALUES (?,?,?)",
        [result.insertId, i + 1, String(stops[i]).trim()],
      );
    await connection.commit();
    return ok(
      res,
      "Ride created.",
      {
        id: result.insertId,
        status: "requested",
        estimated_fare: fare,
        scheduled_at: scheduledAt?.toISOString() || null,
      },
      201,
    );
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

router.post("/:id/cancel", async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[ride]] = await connection.execute(
      "SELECT id,status FROM rides WHERE id=? AND passenger_id=? FOR UPDATE",
      [req.params.id, req.user.id],
    );
    if (!ride) {
      await connection.rollback();
      return fail(res, 404, "Ride not found.");
    }
    if (!["requested", "accepted", "arriving"].includes(ride.status)) {
      await connection.rollback();
      return fail(res, 409, "This ride cannot be cancelled.");
    }
    await connection.execute(
      "UPDATE rides SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP WHERE id=?",
      [ride.id],
    );
    await connection.execute(
      "UPDATE ride_schedules SET status='cancelled' WHERE ride_id=?",
      [ride.id],
    );
    await connection.execute(
      "INSERT INTO ride_status_history (ride_id,status,changed_by,note) VALUES (?,'cancelled',?,'Cancelled by passenger')",
      [ride.id, req.user.id],
    );
    await connection.commit();
    return ok(res, "Ride cancelled.", { id: ride.id, status: "cancelled" });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

router.get("/preferred-drivers", async (req, res, next) => {
  try {
    const [items] = await db.execute(
      `SELECT u.id, u.full_name FROM preferred_drivers p JOIN users u ON u.id=p.driver_id
      WHERE p.passenger_id=? AND u.status='active' ORDER BY u.full_name`,
      [req.user.id],
    );
    return ok(res, "Preferred drivers loaded.", { items });
  } catch (error) {
    next(error);
  }
});
router.get("/available-drivers", async (req, res, next) => {
  try {
    const [items] = await db.execute(
      `SELECT u.id, u.full_name FROM users u JOIN driver_verifications v ON v.driver_id=u.id
      WHERE u.role='driver' AND u.status='active' AND v.status='approved' ORDER BY u.full_name`,
      [],
    );
    return ok(res, "Approved drivers loaded.", { items });
  } catch (error) {
    next(error);
  }
});
router.post("/preferred-drivers", async (req, res, next) => {
  try {
    const id = Number(req.body.driver_id);
    if (!Number.isSafeInteger(id) || id < 1)
      return fail(res, 400, "Choose a valid driver.");
    const [[driver]] = await db.execute(
      "SELECT u.id FROM users u JOIN driver_verifications v ON v.driver_id=u.id WHERE u.id=? AND u.role='driver' AND u.status='active' AND v.status='approved'",
      [id],
    );
    if (!driver) return fail(res, 404, "Approved driver not found.");
    await db.execute(
      "INSERT IGNORE INTO preferred_drivers (passenger_id,driver_id) VALUES (?,?)",
      [req.user.id, id],
    );
    return ok(res, "Driver saved.", { driver_id: id }, 201);
  } catch (error) {
    next(error);
  }
});
router.delete("/preferred-drivers/:id", async (req, res, next) => {
  try {
    await db.execute(
      "DELETE FROM preferred_drivers WHERE passenger_id=? AND driver_id=?",
      [req.user.id, req.params.id],
    );
    return ok(res, "Driver removed.", {});
  } catch (error) {
    next(error);
  }
});
module.exports = router;
