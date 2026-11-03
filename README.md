# Aster Cab — Online Cab Booking System

P1 owns the shared Node/Express/MySQL foundation, authentication, driver identity verification, admin management, and passenger emergency contacts. P2, P3, and P4 add their feature routes under `/api` without changing P1 files. The UI is plain HTML, CSS, and JavaScript.

## Shared database contract (agree before changing schema)

All IDs are `BIGINT UNSIGNED` auto-increment; timestamps are UTC `DATETIME`/`TIMESTAMP`. Foreign keys refer to `users.id` unless stated. Never delete a user that has rides; block the account instead.

| # | Table | Owner | Required columns and shared use |
|---|---|---|---|
| 1 | `users` | P1 | `id`, `full_name`, `email` unique, `phone` unique, `password_hash`, `role` (`passenger`,`driver`,`admin`), `status` (`active`,`blocked`), `created_at`, `updated_at`. JWT has user ID; current role/status come from DB on each request. |
| 2 | `driver_verifications` | P1 | `id`, `driver_id` unique, `identity_document_path`, `licence_document_path`, `licence_number`, `status` (`pending`,`approved`,`rejected`), `rejection_reason`, `reviewed_by`, `reviewed_at`, timestamps. P3 must require `approved` before driver accepts rides. Files are private and served only by an admin endpoint. |
| 3 | `vehicles` | P3 | `id`, `driver_id`, `make`, `model`, `color`, `plate_number` unique, `category`, `seats`, `status` (`pending`,`approved`,`rejected`,`inactive`), `rejection_reason`, `reviewed_by`, `reviewed_at`, timestamps. P3 owns vehicle CRUD; P1 admin manages authorization via status endpoint. |
| 4 | `rides` | P2/P3 | `id`, `passenger_id`, `driver_id` nullable, `vehicle_id` nullable, `pickup_address`, `pickup_lat`, `pickup_lng`, `dropoff_address`, `dropoff_lat`, `dropoff_lng`, `planned_route` nullable JSON, `estimated_distance_km`, `estimated_fare`, `final_fare`, `status` (`requested`,`accepted`,`arriving`,`in_progress`,`completed`,`cancelled`), `requested_at`, `scheduled_at` nullable, `started_at`, `completed_at`, `cancelled_at`, timestamps. P2 creates; P3 transitions; both should agree on allowed transitions and transaction locking. |
| 5 | `ride_status_history` | P2/P3 | `id`, `ride_id`, `status`, `changed_by`, `note`, `created_at`. Insert in same transaction as ride status changes. |
| 6 | `ride_locations` | P4 | `id`, `ride_id`, `driver_id`, `latitude`, `longitude`, `recorded_at`. P4 uses these and `rides.planned_route` for tracking/deviation. |
| 7 | `ride_schedules` | P2 | `id`, `ride_id` unique, `scheduled_for`, `status` (`pending`,`activated`,`cancelled`), `created_at`, `updated_at`. `rides.scheduled_at` is the convenient read field. |
| 8 | `fare_estimates` | P2 | `id`, `passenger_id`, `pickup_lat`, `pickup_lng`, `dropoff_lat`, `dropoff_lng`, `vehicle_category`, `distance_km`, `estimated_fare`, `created_at`. |
| 9 | `emergency_contacts` | P1 | `id`, `passenger_id`, `name`, `phone`, `relationship`, timestamps. P1 permits only the owning passenger to CRUD; P4 SOS may read contacts for the authenticated ride passenger, never arbitrary users. |
| 10 | `sos_alerts` | P4 | `id`, `ride_id`, `passenger_id`, `latitude`, `longitude`, `message`, `status` (`open`,`resolved`), `created_at`, `resolved_at`. |
| 11 | `fare_splits` | P4 | `id`, `ride_id` unique, `created_by`, `total_amount`, `status` (`pending`,`settled`,`cancelled`), timestamps. |
| 12 | `fare_split_participants` | P4 | `id`, `fare_split_id`, `passenger_id` nullable, `email`, `amount`, `status` (`pending`,`paid`), `paid_at`, unique (`fare_split_id`,`email`). |
| 13 | `lost_found_reports` | P4 | `id`, `ride_id`, `reporter_id`, `description`, `status` (`open`,`found`,`closed`), timestamps. |

The enum values and column names above are the integration contract. Coordinate changes to `rides` with P2/P3, contact access with P4, and vehicle approval with P3 before modifying migrations or API behavior.

## Setup

1. Use Node.js 18+ and MySQL 8+. Run `npm install`.
2. Copy `.env.example` to `.env` and supply your own DB credentials and a random JWT secret of at least 32 characters. Never commit `.env`.
3. Create the database and tables: `mysql -u YOUR_DB_USER -p < schema.sql`. The database user needs permission to create the database, or create it first as an administrator.
4. Run `mysql -u YOUR_DB_USER -p online_cab_booking < seed.sql` for four demo accounts. **Change demo passwords before deployment.**
5. Run `npm start`, then open `http://localhost:3000`.

The app can serve static pages without a database, but API calls need MySQL and valid `.env`. Uploaded documents go into ignored `uploads/` and must be backed up separately. Serve behind HTTPS in deployment.

Demo logins after seeding: `admin@astercab.test`, `driver@astercab.test`, `passenger@astercab.test`, and `passenger2@astercab.test`. Each uses `DemoPass!2026` for local development only.

## Response contract

Success: `{ "success": true, "message": "...", "data": {} }` (lists use `data.items` as an array). Failure: `{ "success": false, "message": "..." }`. Send JWT as `Authorization: Bearer <token>`. Every protected request reloads the user from MySQL so blocks take effect immediately.

## P1 API

| Method | Route | Access | Body / result |
|---|---|---|---|
| POST | `/api/auth/register` | public | `{full_name,email,phone,password,role}`; role passenger or driver |
| POST | `/api/auth/login` | public | `{email,password}` → token, user |
| GET | `/api/auth/me` | signed in | current user |
| POST | `/api/verification` | driver | multipart `identity_document`, `licence_document`, `licence_number`; resubmits pending request |
| GET | `/api/verification/me` | driver | data.verification (record or null) |
| GET | `/api/admin/stats` | admin | user, ride, vehicle and verification counts |
| GET | `/api/admin/verifications` | admin | optional `status`, `q` |
| PATCH | `/api/admin/verifications/:id` | admin | `{status:"approved"|"rejected",rejection_reason?}` |
| GET | `/api/admin/verifications/:id/document/:kind` | admin | private identity/licence file |
| GET | `/api/admin/drivers` | admin | optional `q`, `status` |
| GET | `/api/admin/passengers` | admin | optional `q`, `status` |
| PATCH | `/api/admin/users/:id/status` | admin | `{status:"active"|"blocked"}` |
| PATCH | `/api/admin/vehicles/:id/status` | admin | `{status:"approved"|"rejected"|"inactive",rejection_reason?}`; integration point for P3 |
| GET | `/api/emergency-contacts` | passenger | data.items: own contacts |
| POST | `/api/emergency-contacts` | passenger | `{name,phone,relationship}` |
| PUT | `/api/emergency-contacts/:id` | passenger | same fields |
| DELETE | `/api/emergency-contacts/:id` | passenger | deletes own contact |

P2/P3/P4 should register their routers in `routes/index.js` under distinct prefixes. The P1 admin vehicle endpoint changes authorization only; P3 owns vehicle creation and editing. P4 SOS should read `emergency_contacts` using the ride's passenger ID after authorizing the ride, and should not reuse the passenger CRUD route for third-party lookup.

## Shared frontend and geographic helpers

Every P1 page uses `public/css/styles.css`, `public/js/api.js`, and `public/js/navbar.js`. P2–P4 can use `CabAPI.request(path, options)` for the shared JSON envelope and bearer token. `public/js/map.js` exposes `CabMap.create`, `CabMap.marker`, and `CabMap.route`; load Leaflet CSS and JavaScript before this helper on pages that display a map. Leaflet tiles come from OpenStreetMap. `utils/geo.js` exports `distanceKm(lat1, lng1, lat2, lng2)` using WGS84-style latitude/longitude values and a Haversine distance in kilometres. P2 should treat this as a straight-line estimate, not road distance.
