CREATE DATABASE IF NOT EXISTS online_cab_booking CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE online_cab_booking;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(30) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('passenger','driver','admin') NOT NULL,
  status ENUM('active','blocked') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role_status (role, status)
);

CREATE TABLE IF NOT EXISTS driver_verifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  driver_id BIGINT UNSIGNED NOT NULL UNIQUE,
  identity_document_path VARCHAR(255) NOT NULL,
  licence_document_path VARCHAR(255) NOT NULL,
  licence_number VARCHAR(80) NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  rejection_reason VARCHAR(500) NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES users(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id),
  INDEX idx_verifications_status (status)
);

CREATE TABLE IF NOT EXISTS vehicles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  driver_id BIGINT UNSIGNED NOT NULL,
  make VARCHAR(80) NOT NULL,
  model VARCHAR(80) NOT NULL,
  color VARCHAR(50) NOT NULL,
  plate_number VARCHAR(30) NOT NULL UNIQUE,
  category ENUM('economy','comfort','premium','xl') NOT NULL DEFAULT 'economy',
  seats TINYINT UNSIGNED NOT NULL DEFAULT 4,
  status ENUM('pending','approved','rejected','inactive') NOT NULL DEFAULT 'pending',
  rejection_reason VARCHAR(500) NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES users(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id),
  INDEX idx_vehicles_driver_status (driver_id, status)
);

CREATE TABLE IF NOT EXISTS rides (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  passenger_id BIGINT UNSIGNED NOT NULL,
  driver_id BIGINT UNSIGNED NULL,
  vehicle_id BIGINT UNSIGNED NULL,
  pickup_address VARCHAR(255) NOT NULL,
  pickup_lat DECIMAL(10,7) NOT NULL,
  pickup_lng DECIMAL(10,7) NOT NULL,
  dropoff_address VARCHAR(255) NOT NULL,
  dropoff_lat DECIMAL(10,7) NOT NULL,
  dropoff_lng DECIMAL(10,7) NOT NULL,
  planned_route JSON NULL,
  estimated_distance_km DECIMAL(10,2) NULL,
  estimated_fare DECIMAL(10,2) NULL,
  final_fare DECIMAL(10,2) NULL,
  status ENUM('requested','accepted','arriving','in_progress','completed','cancelled') NOT NULL DEFAULT 'requested',
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scheduled_at TIMESTAMP NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  cancelled_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (passenger_id) REFERENCES users(id),
  FOREIGN KEY (driver_id) REFERENCES users(id),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  INDEX idx_rides_passenger_status (passenger_id, status),
  INDEX idx_rides_driver_status (driver_id, status)
);

CREATE TABLE IF NOT EXISTS ride_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id BIGINT UNSIGNED NOT NULL,
  status ENUM('requested','accepted','arriving','in_progress','completed','cancelled') NOT NULL,
  changed_by BIGINT UNSIGNED NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ride_id) REFERENCES rides(id),
  FOREIGN KEY (changed_by) REFERENCES users(id),
  INDEX idx_ride_history (ride_id, created_at)
);

CREATE TABLE IF NOT EXISTS ride_locations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id BIGINT UNSIGNED NOT NULL,
  driver_id BIGINT UNSIGNED NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ride_id) REFERENCES rides(id),
  FOREIGN KEY (driver_id) REFERENCES users(id),
  INDEX idx_ride_locations (ride_id, recorded_at)
);

CREATE TABLE IF NOT EXISTS ride_schedules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id BIGINT UNSIGNED NOT NULL UNIQUE,
  scheduled_for TIMESTAMP NOT NULL,
  status ENUM('pending','activated','cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ride_id) REFERENCES rides(id)
);

CREATE TABLE IF NOT EXISTS fare_estimates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  passenger_id BIGINT UNSIGNED NOT NULL,
  pickup_lat DECIMAL(10,7) NOT NULL,
  pickup_lng DECIMAL(10,7) NOT NULL,
  dropoff_lat DECIMAL(10,7) NOT NULL,
  dropoff_lng DECIMAL(10,7) NOT NULL,
  vehicle_category ENUM('economy','comfort','premium','xl') NOT NULL,
  distance_km DECIMAL(10,2) NOT NULL,
  estimated_fare DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (passenger_id) REFERENCES users(id),
  INDEX idx_fare_estimates_passenger (passenger_id, created_at)
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  passenger_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  relationship VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (passenger_id) REFERENCES users(id),
  INDEX idx_contacts_passenger (passenger_id)
);

CREATE TABLE IF NOT EXISTS sos_alerts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id BIGINT UNSIGNED NOT NULL,
  passenger_id BIGINT UNSIGNED NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  message VARCHAR(500) NULL,
  status ENUM('open','resolved') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  FOREIGN KEY (ride_id) REFERENCES rides(id),
  FOREIGN KEY (passenger_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS fare_splits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id BIGINT UNSIGNED NOT NULL UNIQUE,
  created_by BIGINT UNSIGNED NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending','settled','cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ride_id) REFERENCES rides(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS fare_split_participants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fare_split_id BIGINT UNSIGNED NOT NULL,
  passenger_id BIGINT UNSIGNED NULL,
  email VARCHAR(190) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending','paid') NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP NULL,
  FOREIGN KEY (fare_split_id) REFERENCES fare_splits(id),
  FOREIGN KEY (passenger_id) REFERENCES users(id),
  UNIQUE KEY uq_split_participant (fare_split_id, email)
);

CREATE TABLE IF NOT EXISTS lost_found_reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id BIGINT UNSIGNED NOT NULL,
  reporter_id BIGINT UNSIGNED NOT NULL,
  description TEXT NOT NULL,
  status ENUM('open','found','closed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ride_id) REFERENCES rides(id),
  FOREIGN KEY (reporter_id) REFERENCES users(id)
);
