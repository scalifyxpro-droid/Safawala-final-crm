# Port recovery for manage.safawala.com

The live Railway domain target was verified as **8080** on 18 September 2026.
Keep that target and the public domain unchanged. The production `npm start`
command runs the existing migrations once, then starts the recovery gateway.
The gateway listens on Railway's `PORT` (8080 when unset). Next.js runs privately
on 127.0.0.1:8000 and moves to the next port through 8009 after a failure,
excluding the public port. All workers inherit the existing database and session
configuration. Only one app worker runs at a time.

Occupied internal ports are skipped. The worker must announce readiness and
return HTTP 200 from the public login page before receiving traffic. Crashes
trigger recovery; three failed login health checks (15-second intervals,
10-second timeout) trigger recovery from an unresponsive worker. Startup has a
180-second deadline. Repeated failures across the candidate ports stop the
gateway with an error so Railway can restart the container.

Requests, cookies, host/origin headers, uploads and streaming pass through the
TCP gateway unchanged. Requests interrupted by a crash are **not replayed**,
because retrying a payment or other write could duplicate it. During recovery,
new requests receive HTTP 503 with Retry-After: 5. Users may need to reload or
check whether their previous save completed. This is automatic recovery, not
zero downtime.

## Deployment

Publish the startup script and package.json together, using the existing
`npm start` command. Keep Railway's domain target and `PORT` aligned at 8080.
Use `/login` for the Railway deployment health check. Railway's health check
checks deployment readiness only; the gateway performs ongoing worker checks.
The existing Railway restart policy was On Failure, 10 retries when inspected.
The local implementation is not live until deployed.

Do not configure Railway to target an internal worker port. If the public
listener itself fails, Railway must restart the container; silently changing
that listener would break the domain routing. Host outages, database outages,
application bugs and security breaches cannot be solved by switching ports.

## Verification and rollback

Run `node --test scripts/resilient-server.test.mjs` to test an occupied internal
port, crash recovery, hang recovery, stable URL, POST body, cookies, origin and
action headers, protocol upgrades, and shutdown using isolated local fixtures.
No production data is used. Restore the previous start command
`node scripts/railway-run-migrations.mjs && next start` to roll back.
