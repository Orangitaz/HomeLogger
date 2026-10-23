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

## Android app
Each release on the Releases page includes `homelogger.apk` (stable link: `https://github.com/Orangitaz/HomeLogger/releases/latest/download/homelogger.apk`). The app is standalone: its data is stored on the phone, no server needed. Use Settings → Save backup regularly (backups include your documents and photos). The app shows a dot on Settings when a newer release is available; install the new APK over the old one.

The APK is built by `.github/workflows/android.yml` from `android/` plus the `public/` web app, using the fixed signing key in `android/homelogger.keystore` so updates install over earlier versions. Changes to `public/` ship in both the server image and the APK.

### Sync with TrueNAS (optional)
In the app: Settings → Sync with TrueNAS. Enter the server address (for example `http://192.168.1.50:30101`, the host port you gave the app in TrueNAS) and the password if you set `HOMELOGGER_PASSWORD`. The phone then syncs when the app opens and a few seconds after each change, whenever the server is reachable (home Wi-Fi, or a VPN such as Tailscale/WireGuard when away).

- Both sides are merged: the newest edit to each item wins, and a delete wins over an older edit. Photos and documents sync in both directions.
- Two devices that each created an area with the same name will end up with both; delete the extra one.
- Restoring a backup on the phone does not erase server data; the two are merged on the next sync.
- Sync needs the server on version 1.2.0 or newer. Use a version tag (`1.2.0`) for the TrueNAS image.
