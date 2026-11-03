module.exports = (...allowed) => (req, res, next) => {
  if (!req.user || !allowed.includes(req.user.role)) return res.status(403).json({ success: false, message: 'You do not have permission to do this.' });
  next();
};
