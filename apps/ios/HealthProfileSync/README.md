# HealthProfileSync

iPhone companion for the local Health dashboard, HealthKit import and habit sync.

## Run / update on the MacBook

1. Open `HealthProfileSync.xcodeproj` in Xcode.
2. Keep the existing bundle identifier and select the same signing team used for the installed app. Review local changes before replacing an older checkout.
3. Connect the iPhone, select it as the target, and Run. Do not delete the existing app or its local data to update it.
4. Keep the existing pairing if it is still valid. Otherwise create a QR code in the dashboard under iOS koppeln and scan it in the app.
5. Tap **Health erlauben** and permit **Achtsamkeitsminuten** (plus the previously used types).
6. For older breathing sessions, tap **Vollsync neu starten**, then **Synchronisieren**. This resets the import cursor, not your Health data. Repeated samples are deduplicated by source UUID.
7. Open the dashboard’s Habits area: **Atmen / Achtsamkeit** lists the imported dates and minutes.

The category includes Breathe and other mindful sessions; it is not a verified Breathe-only label. Denied read permission may yield an empty result, so an empty import is not proof that no sessions occurred.

## Validation on the Mac mini

The changed Swift file passed a syntax parse. Xcode and the iOS SDK are not installed there: device compilation, signing and a real HealthKit permission/sync test remain to be completed on the MacBook/iPhone.

## Rezepte und Einkaufsliste

Nach diesem Update lädt die App Rezepte vom Server in einen lokalen Cache. Im Tab Einkaufsliste können Rezepte und Portionen ausgewählt und Zutaten in Apple Erinnerungen übernommen werden. Nach einmaliger Aktualisierung der Rezepte funktioniert diese Auswahl auch ohne Serververbindung. Die vorhandenen Web-Einkaufslisten bleiben zusätzlich verfügbar. Die Übernahme in Erinnerungen erfolgt nur über die entsprechende Schaltfläche.
