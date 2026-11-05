# P4 manual test checklist

## Before testing
- P1 has incorporated `P4_SCHEMA_REQUEST.sql` into the shared schema and provided the updated `schema.sql`.
- Import the shared schema and seed data; configure your own `.env`.
- P3 posts driver GPS updates to `POST /api/tracking/:rideId/location`.
- `rides.planned_route` uses the coordinate format documented in `P4_P1_INTEGRATION_REQUEST.md`.

## Test flows
1. Sign in as the passenger who owns an active ride; open `/track-ride.html`, enter the ride ID, and confirm pickup/drop-off, status progress, moving driver marker, coordinates, and pause/resume/restart.
2. Sign in as the assigned driver and POST several GPS points to `/api/tracking/:rideId/location`; confirm the passenger map refreshes.
3. Send a point more than 500 m from the saved planned route; confirm an open alert appears in `/admin-care-desk.html`.
4. As the ride passenger, create a fare split for a completed ride with invitee emails. Confirm equal shares, invitation URL, and QR code.
5. Sign in as an invited passenger using the invited email, open the invitation URL, join, and self-confirm the share.
6. As a passenger with an active ride, submit SOS. Confirm the alert and available emergency contacts appear in the admin care desk.
7. Submit a Lost & Found report for your own ride. As admin, respond and update its status. Confirm the passenger sees the response.

## Honest limitations
- SMS, WhatsApp, phone calls and payment processing are not integrated. SOS is persisted for customer care; fare payment status is self-reported.
- Route deviation uses a 500 m straight-line threshold against the stored route points, not a road-routing engine.
- The customer-care desk uses the existing `admin` role because the shared role enum has no separate customer-care role.
