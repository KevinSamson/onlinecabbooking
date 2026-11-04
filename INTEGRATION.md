# Astercab P3 Driver Module integration

## Files in this package
- `routes/driver.js`: Driver API endpoints.
- `p3-migration.sql`: Run once after the existing `schema.sql` has been applied.
- `public/driver-dashboard.html`, `public/driver-vehicles.html`, `public/daily-vehicle.html`, `public/ride-requests.html`, `public/active-trip.html`, `public/driver-earnings.html`: Driver pages.
- `public/js/driver.js`: Shared driver-page frontend logic.

## Install into the repository
Copy the files/folders into the matching locations in the cloned repository. Do not replace existing shared files except for the two small integration edits below.

### 1. Mount the API router
In `routes/index.js`, add this line alongside the other route mounts:

```js
router.use('/driver', require('./driver'));
```

### 2. Include the driver script
Each new driver HTML page already loads `/js/driver.js` after `/js/api.js` and `/js/navbar.js`. Keep those script includes.

### 3. Update driver landing destination
In `public/js/app.js`, change the driver destination after login from `/driver-verification.html` to `/driver-dashboard.html` only after the driver dashboard is installed. In `public/js/navbar.js`, change both driver `My space` destinations similarly.

### 4. Database
Run `p3-migration.sql` against the same MySQL database after `schema.sql`. Do not rerun or replace the existing schema.

### 5. Existing app assumptions
- MySQL database name is `online_cab_booking`.
- Driver verification endpoint remains `/api/verification/me`.
- A driver must have active account + approved verification + approved daily vehicle to go online and accept requests.
- Driver request decline is per-driver; it does not cancel or reject the passenger's ride.
- Completion sets `final_fare = estimated_fare` only when final_fare is still NULL. Payment/commission reconciliation remains outside P3.

## API endpoints
- `GET /api/driver/dashboard`
- `GET, POST /api/driver/vehicles`
- `GET, PUT /api/driver/daily-vehicle`
- `PATCH /api/driver/availability` with `{ "is_online": true|false }`
- `GET /api/driver/requests`
- `POST /api/driver/rides/:id/decline`
- `POST /api/driver/rides/:id/accept`
- `POST /api/driver/rides/:id/arriving`
- `POST /api/driver/rides/:id/start`
- `POST /api/driver/rides/:id/complete`
- `GET /api/driver/active-trip`
- `GET /api/driver/earnings`

## P4 handoff
P4 can post driver GPS points to the existing `ride_locations` table using the active ride ID and authenticated driver ID. P3 does not add a second location schema or GPS polling implementation. Coordinate the exact tracking endpoint with P4 before wiring it into the UI.
