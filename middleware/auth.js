const jwt = require('jsonwebtoken');
const db = require('../config/db');
module.exports = async function auth(req, res, next) {
  try {
    const token = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1];
    if (!token) return res.status(401).json({ success: false, message: 'Sign in to continue.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const [[user]] = await db.execute('SELECT id, full_name, email, phone, role, status FROM users WHERE id = ?', [payload.id]);
    if (!user) return res.status(401).json({ success: false, message: 'Account no longer exists.' });
    if (user.status === 'blocked') return res.status(403).json({ success: false, message: 'This account is blocked.' });
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Session expired or invalid. Sign in again.' });
    next(error);
  }
};
