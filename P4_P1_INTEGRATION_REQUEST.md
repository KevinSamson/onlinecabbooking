# P4 → P1 integration request

P4 does not edit `schema.sql`, per the team handoff.

Please incorporate the following into the shared schema before running the P4 Lost & Found and fare invitation APIs:

1. `fare_splits.invite_token CHAR(48) UNIQUE` — required for secure invitation URLs/QR joins.
2. `lost_found_reports.response TEXT NULL`, `responded_by BIGINT UNSIGNED NULL` (FK to `users.id`), and `responded_at TIMESTAMP NULL` — required for customer-care responses.

The existing `sos_alerts` table is used for both SOS and route-deviation alerts. Route deviation messages are stored in `sos_alerts.message`; no new table is required for this implementation.

P3 integration: during an assigned ride with status `accepted`, `arriving`, or `in_progress`, send driver coordinates every few seconds to:
`POST /api/tracking/:rideId/location`
JSON: `{ "latitude": 12.9, "longitude": 80.2 }`
The endpoint only accepts the assigned driver. P4 passenger tracking polls:
`GET /api/tracking/:rideId`

SOS uses the passenger-owned ride:
`POST /api/rides/:rideId/sos`
JSON: `{ "latitude": 12.9, "longitude": 80.2, "message": "..." }`
P4 reads emergency contacts only after verifying the ride belongs to the authenticated passenger.

Customer-care desk is currently restricted to the existing `admin` role because the shared `users.role` enum has no `customer_care` role.

Payment confirmation is a member self-confirmation only; there is no payment gateway in the shared foundation. SOS alerts are persisted for customer care; no SMS/WhatsApp provider is configured.

Planned-route JSON contract: P4 accepts an array of coordinate pairs `[[lat, lng], ...]`
or objects `[{"lat": 12.9, "lng": 80.2}, ...]` in `rides.planned_route`.
P4 compares each incoming GPS point to these route points using straight-line distance;
the initial alert threshold is 0.5 km. If no planned route is saved, the passenger map
draws a straight pickup-to-drop-off line for visual context only.
