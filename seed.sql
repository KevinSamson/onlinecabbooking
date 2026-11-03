USE online_cab_booking;
-- Local demonstration data only. All four accounts use password DemoPass!2026.
-- Change or remove these accounts before any public deployment.
INSERT INTO users (full_name, email, phone, password_hash, role) VALUES
('Aster Admin', 'admin@astercab.test', '+919000000001', '$2a$12$M9ngWNJv7QQGpqx.MImnNOf6uIAvAT3qZa88ECU.B1GWBIDFUgzay', 'admin'),
('Arjun Driver', 'driver@astercab.test', '+919000000002', '$2a$12$AA1x80qTDofEQnrndd0tQe9zajA3ilcJ3lM4OnfhDHQDuVtRyGORC', 'driver'),
('Maya Passenger', 'passenger@astercab.test', '+919000000003', '$2a$12$gzvx5F87/RcEpJVg7UecX.E89QSROn6OSxLz5XuD.i7jXUlfkTtOK', 'passenger'),
('Noah Passenger', 'passenger2@astercab.test', '+919000000004', '$2a$12$6PgCREvFc6E5iUQY2SuFZewyFy/.Dy4EkJY95MQd03aBFcrarVfj.', 'passenger')
ON DUPLICATE KEY UPDATE email = VALUES(email);
