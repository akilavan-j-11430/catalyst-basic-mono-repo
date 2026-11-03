# Lively - architecture

Lively watches HTTP endpoints for signed-in users. Every monitor has its own scheduled job:
a probe is one `GET`, and a monitor whose last `N` probes all miss raises one alert and
emails it. Each monitor keeps its newest 100 probes and 100 alerts on its own row - there is
no other table.

```
browser (signed in)
     |
     v
/api/v1/monitors ...                 (api AppSail - User scope: session checked against
     |                                Catalyst; Admin scope: data and schedules. Global: no
     |                                owner filter)
     |  create   -> Periodic cron per monitor, at its interval  --.
     |  state    -> pause the cron / resume                        |
     |  delete   -> delete the cron, then the row                  |
     |  check    -> run the cron now                               |
     v                                                             v
Data Store Monitor <------------------------------  Job Scheduling (LivelyJobPool)
  STATE, HEALTH,                                                   |
  LATEST_PROBES, LATEST_ALERTS                                     v
                                               job-executor  `probe` job: one monitor
                                               function       - GET, health, last-N alert
                                                  |             decision, one row update,
                                                  |             email
                                                  '---------> Catalyst Mail
```

## Patterns

**A scheduled job per monitor.** No process keeps a timer and nothing sweeps every monitor.
Registering a monitor stores it, then creates a Periodic cron at that monitor's interval
(`monitorProbeJob.scheduleRepeating`) whose job carries the monitor's id. Catalyst runs it
once at creation and every interval after. A cron made from code appears in no Catalyst
list, so its id is kept on the row as `CRON_ID` - the only handle for pausing or deleting
it. If scheduling fails, the new monitor is removed again rather than left stored with
nothing probing it.

**The job owns the alert logic.** `apps/job-executor`'s `probe` job (`MonitorProbe`) reads
the monitor, sends the `GET`, sets its health, decides the alert, writes the row and emails.
"Check now" is the one probe outside the job: the API makes a single `GET` to the monitor's
URL during the request and answers with the status code and latency, paused or not. It
records nothing - no probe, no health change, no alert - so the monitor's history stays the
job's alone.

**Read model on the row.** Everything the dashboard draws lives on the Monitor row, so a
page of the list is one ZCQL `SELECT` and a run of the job is one read and one write. ZCQL
has no per-group `LIMIT`, window function or correlated subquery, so a monitor's recent
probes could not be read from a separate table in one statement.

- `LATEST_PROBES` - the newest 100 probes, oldest first, each `[epoch ms, latencyMs,
  success, alertTriggered]` (~25 characters; the 10,000-character text column holds ~400).
- `LATEST_ALERTS` - the newest 100 alerts, each `[epoch ms, emailedTo]`. An address may be
  255 characters, so the repository drops the oldest alerts until the JSON fits the column
  rather than let the whole update fail.
- `STATE` - `active` / `inactive`, set by the pause route.
- `HEALTH` - `up` / `down` / `unknown`, set by the job on every probe and reset to `unknown`
  when the state changes.

**Edge-triggered alert, judged from the latest probes.** A probe that misses counts the
unbroken run of misses ending in it, from the monitor's own `LATEST_PROBES`. The alert
fires when that run is exactly `N` (the threshold, at most 100 - the probes kept); a longer
run means it already fired, so each outage alerts once, and a success ends the run so the
next outage alerts again. Health is `down` from the firing miss until the next success.

**An alert is its fire time.** A threshold never changes after registration (the only update
is the state), so an alert's miss count is the monitor's threshold and its message is built
from the monitor - only when it fired and where it was emailed are stored.

**The server decides the wire format.** Every timestamp in a response is ISO 8601 UTC with
milliseconds. Below the API - repository, job - times stay epoch ms; `WireTime` in
`apps/api` is the one place they become strings. A monitor carries `maxProbes`, the slots
the client draws: 40 in the list (which sends only those), 100 in a monitor's detail.

**Best-effort notification.** The alert email goes out only after the row is saved, and a
failed or unconfigured send is logged and dropped. The drawer is the record; email is a
courtesy on top of it, so a Mail outage never fails the job - which would set Catalyst
retrying a probe that already ran.

**Global data.** Nothing filters on owner; who may see and change what is to be controlled
through Catalyst. Every monitor route checks that the caller is a signed-in user.

**Repository.** `MonitorRepository` (`packages/node-utils/src/repositories/`) is the only code
that names the table's columns. It takes and returns the domain types in `@repo/types`, so
the API and the job function share it and neither sees `ROWID` or the compact storage.

## Calls per path

| Path | Data Store | Job Scheduling | Mail |
|---|---|---|---|
| `probe` job (one monitor, per interval) | 1 read + 1 update | - | 0-1 |
| `GET /monitors` | 2 ZCQL (page + count) | - | - |
| `GET /monitors/summary` | 1 ZCQL `GROUP BY STATE, HEALTH` | - | - |
| `GET /monitors/:id` | 1 read | - | - |
| `POST /monitors` | 1 insert + 1 update (the cron id) | 1 create | - |
| `PATCH /monitors/:id` | 1 read (the cron id) + 1 ZCQL | 1 pause or resume | - |
| `PUT /monitors/:id` | 1 read + 1 update (+ 1 read of the cron id when the interval changed) | 1 update when the interval changed | - |
| `DELETE /monitors/:id` | 1 read (the cron id) + 1 ZCQL | 1 delete | - |
| `POST /monitors/:id/check` | 1 read, then one `GET` to the monitor's URL | - | - |
| `POST /monitors/reset` | 1 list + 1 ZCQL delete, then 2 inserts + 2 updates | 1 delete per monitor + 2 creates | - |

Plus one `getCurrentUser` per signed-in request (`requireSignedInUser`), which is what
checks the session.

## Retention

| What | How it expires |
|---|---|
| Probes on a monitor | The newest 100 are kept; each new one drops the oldest |
| Alerts on a monitor | The newest 100 are kept (fewer if long addresses fill the column) |
| Monitors and their crons | Never on their own - deleted by a user or by the reset, with their probes and alerts |

## Failure and recovery

- **A failed probe job is not retried** unless the cron's job is configured with retries;
  the next interval probes again. Failures appear in the job's records in the Console.
- **An inactive or deleted monitor stops costing runs.** Its cron is paused or deleted; a
  run already queued finds it inactive or gone and does nothing.
- **A manual check can race a scheduled run** on the same monitor; both read the row, and
  the later write wins, so one probe can be lost from `LATEST_PROBES`.
- **Crons run in the cloud.** Locally, a monitor's cron still targets the deployed
  `job-executor`; run a job by hand through the proxy's `/jobs` path to exercise local code.
- **Probes are server-side `GET`s to user-supplied URLs.** Any signed-in user can make the
  job fetch any URL (SSRF-shaped). Acceptable for a demo with admin-created accounts; put an
  allow-list in `MonitorProbe.probe` before opening it wider.

## The reset

`POST /api/v1/monitors/reset` deletes every monitor's cron and every monitor - their probes
and alerts with them. It is deliberately public - no sign-in, no role - so a demo can be
cleaned from a plain `curl`; it is registered above the monitors router's sign-in check. In
the cloud, anyone who can reach the `api` AppSail can call it.
