const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const auth = require('../middleware/auth');
const roles = require('../middleware/roles');
const router = express.Router();
router.use(auth, roles('admin'));
const ok = (res, message, data) => res.json({ success: true, message, data });
const bad = (res, message) => res.status(400).json({ success: false, message });
const notFound = res => res.status(404).json({ success: false, message: 'Record not found.' });

router.get('/stats', async (req, res, next) => {
  try {
    const [[users]] = await db.execute(`SELECT COUNT(*) total_users, SUM(role = 'passenger') passengers, SUM(role = 'driver') drivers, SUM(status = 'blocked') blocked_users FROM users`);
    const [[verifications]] = await db.execute(`SELECT COUNT(*) total_verifications, COALESCE(SUM(status = 'pending'),0) pending_verifications, COALESCE(SUM(status = 'approved'),0) approved_verifications FROM driver_verifications`);
    const [[vehicles]] = await db.execute(`SELECT COUNT(*) total_vehicles, COALESCE(SUM(status = 'pending'),0) pending_vehicles, COALESCE(SUM(status = 'approved'),0) approved_vehicles FROM vehicles`);
    const [[rides]] = await db.execute(`SELECT COUNT(*) total_rides, COALESCE(SUM(status = 'in_progress'),0) active_rides, COALESCE(SUM(status = 'completed'),0) completed_rides FROM rides`);
    ok(res, 'Dashboard statistics loaded.', { ...users, ...verifications, ...vehicles, ...rides });
  } catch (error) { next(error); }
});
router.get('/verifications', async (req, res, next) => {
  try {
    const status = String(req.query.status || 'all');
    const q = `%${String(req.query.q || '').trim().slice(0, 80)}%`;
    if (!['all','pending','approved','rejected'].includes(status)) return bad(res, 'Invalid status filter.');
    const [rows] = await db.execute(`SELECT v.id, v.driver_id, u.full_name, u.email, u.phone, u.status AS account_status, v.licence_number, v.status, v.rejection_reason, v.created_at, v.reviewed_at
      FROM driver_verifications v JOIN users u ON u.id = v.driver_id WHERE (? = 'all' OR v.status = ?) AND (u.full_name LIKE ? OR u.email LIKE ? OR v.licence_number LIKE ?) ORDER BY v.created_at DESC`, [status, status, q, q, q]);
    ok(res, 'Verifications loaded.', { items: rows });
  } catch (error) { next(error); }
});
router.patch('/verifications/:id', async (req, res, next) => {
  try {
    const status = req.body.status;
    const reason = String(req.body.rejection_reason || '').trim();
    if (!['approved','rejected'].includes(status) || (status === 'rejected' && !reason)) return bad(res, 'Choose approve or reject; rejection requires a reason.');
    const [result] = await db.execute('UPDATE driver_verifications SET status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?', [status, status === 'rejected' ? reason.slice(0, 500) : null, req.user.id, req.params.id]);
    if (!result.affectedRows) return notFound(res);
    ok(res, `Driver ${status}.`, { id: Number(req.params.id), status });
  } catch (error) { next(error); }
});
router.get('/verifications/:id/document/:kind', async (req, res, next) => {
  try {
    const column = req.params.kind === 'identity' ? 'identity_document_path' : req.params.kind === 'licence' ? 'licence_document_path' : null;
    if (!column) return bad(res, 'Unknown document type.');
    const [[row]] = await db.execute(`SELECT ${column} AS filename FROM driver_verifications WHERE id = ?`, [req.params.id]);
    if (!row) return notFound(res);
    const file = path.join(__dirname, '..', 'uploads', path.basename(row.filename));
    if (!fs.existsSync(file)) return notFound(res);
    res.sendFile(file);
  } catch (error) { next(error); }
});
function listUsers(role) { return async (req, res, next) => {
  try {
    const status = String(req.query.status || 'all');
    if (!['all','active','blocked'].includes(status)) return bad(res, 'Invalid status filter.');
    const q = `%${String(req.query.q || '').trim().slice(0, 80)}%`;
    const [rows] = await db.execute(`SELECT u.id, u.full_name, u.email, u.phone, u.role, u.status, u.created_at, v.status AS verification_status,
      (SELECT COUNT(*) FROM vehicles x WHERE x.driver_id = u.id) AS vehicle_count
      FROM users u LEFT JOIN driver_verifications v ON v.driver_id = u.id
      WHERE u.role = ? AND (? = 'all' OR u.status = ?) AND (u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?) ORDER BY u.created_at DESC`, [role, status, status, q, q, q]);
    ok(res, `${role === 'driver' ? 'Drivers' : 'Passengers'} loaded.`, { items: rows });
  } catch (error) { next(error); }
}; }
router.get('/drivers', listUsers('driver'));
router.get('/passengers', listUsers('passenger'));
router.patch('/users/:id/status', async (req, res, next) => {
  try {
    const status = req.body.status;
    if (!['active','blocked'].includes(status)) return bad(res, 'Invalid account status.');
    const [result] = await db.execute("UPDATE users SET status = ? WHERE id = ? AND role IN ('passenger','driver')", [status, req.params.id]);
    if (!result.affectedRows) return notFound(res);
    ok(res, `Account ${status === 'blocked' ? 'blocked' : 'unblocked'}.`, { id: Number(req.params.id), status });
  } catch (error) { next(error); }
});
router.get('/vehicles', async (req, res, next) => {
  try {
    const [rows] = await db.execute('SELECT v.id, v.driver_id, u.full_name AS driver_name, v.make, v.model, v.color, v.plate_number, v.category, v.seats, v.status, v.rejection_reason, v.created_at FROM vehicles v JOIN users u ON u.id = v.driver_id ORDER BY v.created_at DESC');
    ok(res, 'Vehicles loaded.', { items: rows });
  } catch (error) { next(error); }
});
router.patch('/vehicles/:id/status', async (req, res, next) => {
  try {
    const status = req.body.status;
    const reason = String(req.body.rejection_reason || '').trim();
    if (!['approved','rejected','inactive'].includes(status) || (status === 'rejected' && !reason)) return bad(res, 'Choose a valid vehicle status; rejection requires a reason.');
    const [result] = await db.execute(`UPDATE vehicles v LEFT JOIN driver_verifications d ON d.driver_id = v.driver_id JOIN users u ON u.id = v.driver_id
      SET v.status = ?, v.rejection_reason = ?, v.reviewed_by = ?, v.reviewed_at = CURRENT_TIMESTAMP
      WHERE v.id = ? AND (? <> 'approved' OR (d.status = 'approved' AND u.status = 'active'))`, [status, status === 'rejected' ? reason.slice(0,500) : null, req.user.id, req.params.id, status]);
    if (!result.affectedRows) return res.status(409).json({ success: false, message: 'Vehicle not found or driver is not approved and active.' });
    ok(res, `Vehicle ${status}.`, { id: Number(req.params.id), status });
  } catch (error) { next(error); }
});
module.exports = router;
