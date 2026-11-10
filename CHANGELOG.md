# Changelog

## 1.6.0
- Barcode scanning for belongings (Android app): in Add item, tap 📷 Scan barcode. The scanner screen comes from Google Play services, so the app needs no camera permission. The product name and model are looked up and filled in (only into empty fields), and the barcode number is saved in the notes. If the lookup fails or the product isn't listed, you just type the name and the code is still kept.
- Privacy: only the barcode number is sent, to upcitemdb.com (free lookups, about 100 a day). Nothing else leaves the phone.

## 1.5.1
- Restoring a damaged or partial backup can no longer corrupt the data: the server and the app now check every section first (the app also checks the files before replacing anything).
- If the server's db.json can't be read at startup, a copy is kept as db.json.unreadable-… instead of being overwritten by an empty database.
- The server answers invalid JSON with a clear 400 error, and the daily alert uses the server's local date (set TZ), like /api/status.
- Very long model numbers, serials and titles no longer push appliance, warranty and report screens wider than the phone.
- Adding an appliance whose name matches an existing area (for example "Water heater") suggests that area instead of creating a duplicate.

## 1.5.0
- Appliances now suggest their usual maintenance. After adding a water heater, furnace, AC, dishwasher, fridge, washer, dryer, sump pump and similar, a sheet offers the common jobs (flush the tank, replace the filter, clean the coils…). Tick the ones you want, pick an area or create one named after the appliance, and they start counting from today. Also available any time from the appliance's 🛠️ Maintenance tasks button.
- Server: `GET /api/status` gives a summary for Home Assistant or any dashboard (overdue and upcoming tasks, warranties ending, expiring documents). See the README for a ready-made Home Assistant sensor. Update the TrueNAS image to use it.

## 1.4.1
- Belongings CSV export: text that starts with =, + or @ is saved as plain text so a spreadsheet never runs it as a formula.

## 1.4.0
- Appliances: a register of your appliances and systems with brand, model, serial number, purchase date, warranty end, price, where you bought it, and photos (nameplate, manual, receipt). In the Android app, "Read model & serial from the photo" fills them in from a nameplate photo on the phone itself (nothing is uploaded).
- Warranties: one screen listing what is covered, what ends within 90 days, and what has expired, including any documents you gave an expiry date. Warranties ending within 45 days show on the Home screen, and the server's daily webhook alert includes them.
- This season: a card on the Home screen with jobs that suit the time of year (gutters and winterizing irrigation in fall, AC service in spring, and so on). Tick them off right there; ticks reset each year and sync between devices. Tap the card for all four seasons.
- Belongings: a room-by-room inventory of what you own, with photos, quantity and optional value, with totals per room and overall. Export it as a spreadsheet (CSV) or add it to the history report for insurance.
- The history report now lists appliances and can include the belongings inventory. Search, backup, restore and sync all cover the new data. Update the TrueNAS image and the app together so sync keeps the new items.

## 1.3.2
- Removed the search button at the top of every screen; search is the 🔍 tab in the bottom bar.

## 1.3.1
- The in-app Download update button now downloads the versioned file (for example homelogger-1_3_1.apk) so you can see which version you have. The unversioned homelogger.apk stays on each release so apps older than 1.3.1 can still update.

## 1.3.0
- Home info: a page for the things you need in a hurry. Where the water, gas and power shut off (with photos), paint colors, filter sizes and other specs, who to call, and codes. Reached from the Home screen.
- Suggested tasks: in an area's Tasks tab, tick the common jobs for that kind of area (filters, gutters, water heater flush, smoke alarms…). Nothing is added until you tick it.
- Projects: bigger jobs with a status, step checklist, budget, before / progress / after photos, receipts, and the work and costs logged against them.
- Costs: optional cost on every work entry; spending shown per area and for the whole home (this year / all time) and per project against its budget.
- Receipt reading (Android app): after choosing a receipt photo, tap "Read receipt from the photo" to fill in the vendor, date and total on the phone itself (nothing is uploaded).
- History report: a printable report of the whole home or one area (areas, maintenance schedule, work history, projects, documents, optional photos and costs). Print or save as PDF. Codes are left out.
- Sync, backup, search and the server all understand the new data. Update the TrueNAS image and the app together so sync keeps new items.

## 1.2.0
- Sync with TrueNAS: the Android app can sync with your HomeLogger server (Settings → Sync with TrueNAS). Changes on either side are merged, the newest edit to an item wins, deletes carry over, and documents/photos transfer both ways. Syncs on open and shortly after each change. The server keeps a change log so phone clock differences don't matter.
- Server: new sync endpoint, deletion tracking, uploads with a chosen file id. Update the TrueNAS image to 1.2.0 before turning on sync.

## 1.1.0
- Android app (APK): the same app running standalone on the phone with data stored on the device, camera/photo/file attachments, open and save files, backup/restore including documents, and an in-app update notice. Built automatically by GitHub Actions and published as a GitHub Release.

## 1.0.0
- First release: areas/systems, recurring maintenance tasks with reminders, work history (maintenance, repair, upgrade) with attachments, document library with categories and expiry dates, search across everything, backup/restore, daily automatic backups, optional password and webhook alerts.
