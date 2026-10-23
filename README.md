# HomeLogger

Self-hosted home maintenance, upgrades and document storage. Runs on TrueNAS (custom app) as a single container with no dependencies.

## Features
- Areas/systems (HVAC, roof, water heater, kitchen…) each with a dashboard, tasks, history, documents and info (model, serial, warranty)
- Recurring maintenance tasks; marking done rolls the next date forward and logs history
- Log maintenance, repairs and upgrades with vendor, parts, notes and attached receipts/photos
- Document library (deed, insurance, permits, inspections, manuals) with categories and expiry reminders
- Search across everything, backup/restore, 14 automatic daily backups, optional webhook alerts

## Run
```
docker run -d -p 3000:3000 -v /mnt/pool/homelogger:/data ghcr.io/orangitaz/homelogger:latest
```
Environment: `PORT` (3000), `DATA_DIR` (/data), `HOMELOGGER_PASSWORD` (optional; browser login with any username).

On TrueNAS, use a version tag (e.g. `1.0.0`) rather than `latest` so updates are picked up.

Install on a phone: open the site in Chrome and choose "Install app" / "Add to Home screen".
