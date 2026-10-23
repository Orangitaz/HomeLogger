# Changelog

## 1.2.0
- Sync with TrueNAS: the Android app can sync with your HomeLogger server (Settings → Sync with TrueNAS). Changes on either side are merged, the newest edit to an item wins, deletes carry over, and documents/photos transfer both ways. Syncs on open and shortly after each change. The server keeps a change log so phone clock differences don't matter.
- Server: new sync endpoint, deletion tracking, uploads with a chosen file id. Update the TrueNAS image to 1.2.0 before turning on sync.

## 1.1.0
- Android app (APK): the same app running standalone on the phone with data stored on the device, camera/photo/file attachments, open and save files, backup/restore including documents, and an in-app update notice. Built automatically by GitHub Actions and published as a GitHub Release.

## 1.0.0
- First release: areas/systems, recurring maintenance tasks with reminders, work history (maintenance, repair, upgrade) with attachments, document library with categories and expiry dates, search across everything, backup/restore, daily automatic backups, optional password and webhook alerts.
