# Astercab local application

This checkout combines the P1 authentication and admin foundation, P2 passenger booking, P3 driver operations, and P4 tracking and safety features into one Node/Express/MySQL app. The frontend is plain HTML, CSS, and JavaScript.

## Requirements and setup

- Node.js 18 or newer and MySQL 8 or newer.
- Run `npm ci` in this directory.
- Copy `.env.example` to `.env` and set your own MySQL account and a random `JWT_SECRET` of at least 32 characters. `.env` is ignored by Git.
- For a fresh database, run `mysql -u YOUR_USER -p < schema.sql`, then `mysql -u YOUR_USER -p online_cab_booking < seed.sql` to add four local demo accounts.
- For a database created from the original P1 schema, run `schema.sql` and then `integrated-migration.sql` instead of replacing the database. `schema.sql` creates the new tables; the migration adds columns to existing tables. Make a database backup before upgrading.
- Run `npm start` and open `http://127.0.0.1:3000` (or use `PORT` from `.env`).

The seeded local accounts are `admin@astercab.test`, `driver@astercab.test`, `passenger@astercab.test`, and `passenger2@astercab.test`. Their password is `DemoPass!2026`. These accounts are only for local development.

## Test the complete flow

1. Sign in as a passenger. Search for pickup, destination, and optional stops, or select them on the map. Enter an approximate road distance and choose a vehicle category. You can also compare fares or schedule a future ride. Location coordinates are selected automatically; the entered distance is used for the fare estimate.
2. Sign in as a driver. Upload verification documents on the Verification page and register a vehicle.
3. Sign in as admin. Approve the driver verification and vehicle under Drivers & vehicles.
4. Sign in as driver again. Select today's approved vehicle, go online, accept the request, and manage the trip from Active trip. Click **Share live location** to allow GPS updates while the page stays open.
5. Sign in as the passenger. Track the ride, manage emergency contacts, or record an SOS alert. After completion, you can create a fare split or file a Lost & Found report. Admin sees alerts and reports in the customer care desk.

The driver's browser asks for location permission when sharing starts. Tracking needs the driver to keep the Active trip page open. SOS alerts are stored for the admin desk; no emergency call or SMS provider is connected. Fare split payments are self-confirmed; no payment gateway is connected. The planned route joins selected pickup, stop, and destination points with straight lines, so route-deviation alerts are only a demo aid, not navigation-grade detection.

## API and data

Routes are mounted under `/api`: `/auth`, `/verification`, `/admin`, `/emergency-contacts`, `/rides`, `/driver`, plus the tracking, SOS, fare split, Lost & Found, and customer care routes in `routes/safety.js`. Protected requests use `Authorization: Bearer <token>`. Success responses use `{ success: true, message, data }`; failures use `{ success: false, message }`.

Do not commit `.env`, uploaded documents, or the local MySQL data directory. `npm run check` checks JavaScript syntax; the end-to-end flow requires a running MySQL server.
