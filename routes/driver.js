const express = require("express");
const db = require("../config/db");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const router = express.Router();
router.use(auth, roles("driver"));
const ok = (res, message, data = {}) =>
  res.json({ success: true, message, data });
const bad = (res, message, status = 400) =>
  res.status(status).json({ success: false, message });
const today = () => new Date().toISOString().slice(0, 10);

async function driverReady(driverId) {
  const [[row]] = await db.execute(
    `SELECT u.status AS account_status, v.status AS verification_status
    FROM users u LEFT JOIN driver_verifications v ON v.driver_id=u.id WHERE u.id=?`,
    [driverId],
  );
  return (
    row &&
    row.account_status === "active" &&
    row.verification_status === "approved"
  );
}

router.get("/dashboard", async (req, res, next) => {
  try {
    const [[verification]] = await db.execute(
      "SELECT status, rejection_reason FROM driver_verifications WHERE driver_id=?",
      [req.user.id],
    );
    const [[presence]] = await db.execute(
      "SELECT is_online FROM driver_presence WHERE driver_id=?",
      [req.user.id],
    );
    const [[daily]] = await db.execute(
      `SELECT v.id, v.make, v.model, v.color, v.plate_number, v.category
      FROM driver_daily_vehicles d JOIN vehicles v ON v.id=d.vehicle_id WHERE d.driver_id=? AND d.service_date=CURDATE()`,
      [req.user.id],
    );
    const [[stats]] = await db.execute(
      `SELECT COUNT(*) AS completed_trips, COALESCE(SUM(final_fare),0) AS gross_earnings
      FROM rides WHERE driver_id=? AND status='completed' AND DATE(completed_at)=CURDATE()`,
      [req.user.id],
    );
    const [[active]] = await db.execute(
      "SELECT COUNT(*) AS active_trips FROM rides WHERE driver_id=? AND status IN ('accepted','arriving','in_progress')",
      [req.user.id],
    );
    const [[requests]] = await db.execute(
      `SELECT COUNT(*) AS pending_requests FROM rides r
      WHERE r.status='requested' AND r.vehicle_category=? AND (r.scheduled_at IS NULL OR r.scheduled_at<=UTC_TIMESTAMP())
      AND NOT EXISTS (SELECT 1 FROM driver_ride_declines x WHERE x.ride_id=r.id AND x.driver_id=?)`,
      [daily?.category || "", req.user.id],
    );
    ok(res, "Driver dashboard loaded.", {
      verification: verification || null,
      is_online: Boolean(presence?.is_online),
      daily_vehicle: daily || null,
      ...stats,
      ...active,
      ...requests,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/vehicles", async (req, res, next) => {
  try {
    const [items] = await db.execute(
      `SELECT id, make, model, color, plate_number, category, seats, status, rejection_reason, created_at
      FROM vehicles WHERE driver_id=? ORDER BY created_at DESC`,
      [req.user.id],
    );
    ok(res, "Vehicles loaded.", { items });
  } catch (e) {
    next(e);
  }
});
router.post("/vehicles", async (req, res, next) => {
  try {
    const make = String(req.body.make || "").trim();
    const model = String(req.body.model || "").trim();
    const color = String(req.body.color || "").trim();
    const plate = String(req.body.plate_number || "")
      .trim()
      .toUpperCase();
    const category = String(req.body.category || "economy");
    const seats = Number(req.body.seats || 4);
    if (
      !make ||
      !model ||
      !color ||
      !plate ||
      make.length > 80 ||
      model.length > 80 ||
      color.length > 50 ||
      plate.length > 30
    )
      return bad(
        res,
        "Enter valid make, model, colour and registration number.",
      );
    if (
      !["economy", "comfort", "premium", "xl"].includes(category) ||
      !Number.isInteger(seats) ||
      seats < 1 ||
      seats > 20
    )
      return bad(res, "Choose a valid category and seat count.");
    const [result] = await db.execute(
      `INSERT INTO vehicles (driver_id, make, model, color, plate_number, category, seats) VALUES (?,?,?,?,?,?,?)`,
      [req.user.id, make, model, color, plate, category, seats],
    );
    ok(res, "Vehicle submitted for admin approval.", {
      id: result.insertId,
      status: "pending",
    });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY")
      return bad(res, "That registration number is already registered.", 409);
    next(e);
  }
});

router.get("/daily-vehicle", async (req, res, next) => {
  try {
    const [[item]] = await db.execute(
      `SELECT d.vehicle_id, d.service_date, v.make, v.model, v.color, v.plate_number, v.category
      FROM driver_daily_vehicles d JOIN vehicles v ON v.id=d.vehicle_id WHERE d.driver_id=? AND d.service_date=CURDATE()`,
      [req.user.id],
    );
    ok(res, "Daily vehicle loaded.", { vehicle: item || null });
  } catch (e) {
    next(e);
  }
});
router.put("/daily-vehicle", async (req, res, next) => {
  try {
    const vehicleId = Number(req.body.vehicle_id);
    if (!Number.isSafeInteger(vehicleId) || vehicleId < 1)
      return bad(res, "Choose a valid vehicle.");
    if (!(await driverReady(req.user.id)))
      return bad(
        res,
        "Your driver verification must be approved before going online.",
        403,
      );
    const [[vehicle]] = await db.execute(
      "SELECT id FROM vehicles WHERE id=? AND driver_id=? AND status='approved'",
      [vehicleId, req.user.id],
    );
    if (!vehicle)
      return bad(res, "Only your approved vehicles can be selected.", 409);
    const [[active]] = await db.execute(
      "SELECT id FROM rides WHERE driver_id=? AND status IN ('accepted','arriving','in_progress') LIMIT 1",
      [req.user.id],
    );
    if (active)
      return bad(
        res,
        "You cannot change vehicles while a trip is active.",
        409,
      );
    await db.execute(
      `INSERT INTO driver_daily_vehicles (driver_id, vehicle_id, service_date) VALUES (?,?,CURDATE())
      ON DUPLICATE KEY UPDATE vehicle_id=VALUES(vehicle_id), updated_at=CURRENT_TIMESTAMP`,
      [req.user.id, vehicleId],
    );
    ok(res, "Vehicle selected for today.", {
      vehicle_id: vehicleId,
      service_date: today(),
    });
  } catch (e) {
    next(e);
  }
});

router.patch("/availability", async (req, res, next) => {
  try {
    const online = req.body.is_online;
    if (typeof online !== "boolean")
      return bad(res, "is_online must be true or false.");
    if (online) {
      if (!(await driverReady(req.user.id)))
        return bad(
          res,
          "Your driver verification must be approved before going online.",
          403,
        );
      const [[daily]] = await db.execute(
        `SELECT d.vehicle_id FROM driver_daily_vehicles d JOIN vehicles v ON v.id=d.vehicle_id
        WHERE d.driver_id=? AND d.service_date=CURDATE() AND v.status='approved'`,
        [req.user.id],
      );
      if (!daily)
        return bad(
          res,
          "Select an approved vehicle for today before going online.",
          409,
        );
    }
    await db.execute(
      `INSERT INTO driver_presence (driver_id,is_online) VALUES (?,?) ON DUPLICATE KEY UPDATE is_online=VALUES(is_online), updated_at=CURRENT_TIMESTAMP`,
      [req.user.id, online ? 1 : 0],
    );
    ok(res, online ? "You are now online." : "You are now offline.", {
      is_online: online,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/requests", async (req, res, next) => {
  try {
    const ready = await driverReady(req.user.id);
    if (!ready)
      return ok(res, "Complete driver verification to receive requests.", {
        items: [],
      });
    const [[presence]] = await db.execute(
      "SELECT is_online FROM driver_presence WHERE driver_id=?",
      [req.user.id],
    );
    if (!presence?.is_online)
      return ok(res, "Go online to receive requests.", { items: [] });
    const [[daily]] = await db.execute(
      `SELECT vehicle_id FROM driver_daily_vehicles WHERE driver_id=? AND service_date=CURDATE()`,
      [req.user.id],
    );
    if (!daily) return ok(res, "Select your vehicle for today.", { items: [] });
    const [items] = await db.execute(
      `SELECT r.id, r.pickup_address, r.pickup_lat, r.pickup_lng, r.dropoff_address, r.dropoff_lat, r.dropoff_lng,
      r.estimated_distance_km, r.estimated_fare, r.requested_at, r.scheduled_at, r.planned_route,
      (SELECT GROUP_CONCAT(address ORDER BY stop_order SEPARATOR ' → ') FROM ride_stops WHERE ride_id=r.id) AS stops
      FROM rides r JOIN vehicles v ON v.id=? WHERE r.status='requested' AND r.vehicle_category=v.category
      AND (r.scheduled_at IS NULL OR r.scheduled_at<=UTC_TIMESTAMP()) AND (r.vehicle_id IS NULL OR r.vehicle_id=?)
      AND NOT EXISTS (SELECT 1 FROM driver_ride_declines x WHERE x.ride_id=r.id AND x.driver_id=?)
      ORDER BY r.requested_at LIMIT 50`,
      [daily.vehicle_id, daily.vehicle_id, req.user.id],
    );
    ok(res, "Ride requests loaded.", { items });
  } catch (e) {
    next(e);
  }
});
router.post("/rides/:id/decline", async (req, res, next) => {
  try {
    const rideId = Number(req.params.id);
    if (!Number.isSafeInteger(rideId) || rideId < 1)
      return bad(res, "Invalid ride.");
    const [[ride]] = await db.execute(
      "SELECT id FROM rides WHERE id=? AND status='requested'",
      [rideId],
    );
    if (!ride) return bad(res, "This request is no longer available.", 409);
    await db.execute(
      "INSERT IGNORE INTO driver_ride_declines (ride_id,driver_id) VALUES (?,?)",
      [rideId, req.user.id],
    );
    ok(res, "Ride request declined.", { ride_id: rideId });
  } catch (e) {
    next(e);
  }
});
router.post("/rides/:id/accept", async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const rideId = Number(req.params.id);
    if (!Number.isSafeInteger(rideId) || rideId < 1)
      return bad(res, "Invalid ride.");
    if (!(await driverReady(req.user.id)))
      return bad(res, "Your driver verification is not approved.", 403);
    await conn.beginTransaction();
    const [[presence]] = await conn.execute(
      "SELECT is_online FROM driver_presence WHERE driver_id=? FOR UPDATE",
      [req.user.id],
    );
    const [[daily]] = await conn.execute(
      `SELECT d.vehicle_id FROM driver_daily_vehicles d JOIN vehicles v ON v.id=d.vehicle_id
      WHERE d.driver_id=? AND d.service_date=CURDATE() AND v.status='approved' FOR UPDATE`,
      [req.user.id],
    );
    if (!presence?.is_online || !daily) {
      await conn.rollback();
      return bad(res, "Go online and select an approved vehicle first.", 409);
    }
    const [[active]] = await conn.execute(
      "SELECT id FROM rides WHERE driver_id=? AND status IN ('accepted','arriving','in_progress') LIMIT 1 FOR UPDATE",
      [req.user.id],
    );
    if (active) {
      await conn.rollback();
      return bad(
        res,
        "Complete your current trip before accepting another.",
        409,
      );
    }
    const [[ride]] = await conn.execute(
      "SELECT id, status, vehicle_id, vehicle_category, scheduled_at FROM rides WHERE id=? FOR UPDATE",
      [rideId],
    );
    const [[vehicle]] = await conn.execute(
      "SELECT category FROM vehicles WHERE id=?",
      [daily.vehicle_id],
    );
    if (
      !ride ||
      ride.status !== "requested" ||
      (ride.vehicle_id &&
        Number(ride.vehicle_id) !== Number(daily.vehicle_id)) ||
      ride.vehicle_category !== vehicle?.category ||
      (ride.scheduled_at && new Date(ride.scheduled_at) > new Date())
    ) {
      await conn.rollback();
      return bad(
        res,
        "This ride request is no longer available for your vehicle.",
        409,
      );
    }
    const [updated] = await conn.execute(
      "UPDATE rides SET driver_id=?, vehicle_id=?, status='accepted' WHERE id=? AND status='requested'",
      [req.user.id, daily.vehicle_id, rideId],
    );
    if (!updated.affectedRows) {
      await conn.rollback();
      return bad(res, "Another driver has already accepted this ride.", 409);
    }
    await conn.execute(
      "INSERT INTO ride_status_history (ride_id,status,changed_by,note) VALUES (?,'accepted',?,'Accepted by driver')",
      [rideId, req.user.id],
    );
    await conn.execute(
      "UPDATE ride_schedules SET status='activated' WHERE ride_id=?",
      [rideId],
    );
    await conn.commit();
    ok(res, "Ride accepted.", { ride_id: rideId, status: "accepted" });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally {
    conn.release();
  }
});

async function changeRide(
  req,
  res,
  next,
  from,
  to,
  extraSql = "",
  extraValues = [],
) {
  const conn = await db.getConnection();
  try {
    const rideId = Number(req.params.id);
    if (!Number.isSafeInteger(rideId) || rideId < 1)
      return bad(res, "Invalid ride.");
    await conn.beginTransaction();
    const [[ride]] = await conn.execute(
      "SELECT id,status FROM rides WHERE id=? AND driver_id=? FOR UPDATE",
      [rideId, req.user.id],
    );
    if (!ride) {
      await conn.rollback();
      return bad(res, "Ride not found.", 404);
    }
    if (!from.includes(ride.status)) {
      await conn.rollback();
      return bad(res, `Ride cannot move from ${ride.status} to ${to}.`, 409);
    }
    await conn.execute(
      `UPDATE rides SET status=?, ${extraSql} updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [to, ...extraValues, rideId],
    );
    await conn.execute(
      "INSERT INTO ride_status_history (ride_id,status,changed_by,note) VALUES (?,?,?,?)",
      [rideId, to, req.user.id, `Driver changed ride to ${to}`],
    );
    await conn.commit();
    ok(res, `Ride ${to.replace("_", " ")}.`, { ride_id: rideId, status: to });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally {
    conn.release();
  }
}
router.post("/rides/:id/arriving", (req, res, next) =>
  changeRide(req, res, next, ["accepted"], "arriving"),
);
router.post("/rides/:id/start", (req, res, next) =>
  changeRide(
    req,
    res,
    next,
    ["accepted", "arriving"],
    "in_progress",
    "started_at=CURRENT_TIMESTAMP,",
  ),
);
router.post("/rides/:id/complete", (req, res, next) =>
  changeRide(
    req,
    res,
    next,
    ["in_progress"],
    "completed",
    "completed_at=CURRENT_TIMESTAMP, final_fare=COALESCE(final_fare,estimated_fare),",
  ),
);

router.get("/active-trip", async (req, res, next) => {
  try {
    const [[ride]] = await db.execute(
      `SELECT r.*, u.full_name AS passenger_name, u.phone AS passenger_phone
      FROM rides r JOIN users u ON u.id=r.passenger_id
      WHERE r.driver_id=? AND r.status IN ('accepted','arriving','in_progress')
      ORDER BY r.updated_at DESC LIMIT 1`,
      [req.user.id],
    );
    ok(res, "Active trip loaded.", { ride: ride || null });
  } catch (e) {
    next(e);
  }
});
router.get("/earnings", async (req, res, next) => {
  try {
    const [items] = await db.execute(
      `SELECT id, pickup_address, dropoff_address, final_fare, completed_at
      FROM rides WHERE driver_id=? AND status='completed' ORDER BY completed_at DESC LIMIT 100`,
      [req.user.id],
    );
    const [[totals]] = await db.execute(
      `SELECT COUNT(*) AS completed_trips, COALESCE(SUM(final_fare),0) AS gross_earnings
      FROM rides WHERE driver_id=? AND status='completed'`,
      [req.user.id],
    );
    ok(res, "Earnings loaded.", { ...totals, items });
  } catch (e) {
    next(e);
  }
});
module.exports = router;
