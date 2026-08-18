# Halo Telco Meeting Room Booking — Simple Team Version

This is the free, no-login version. Anyone with the website link can view, create, and delete bookings. It is intended only for a small internal team that agrees to use it responsibly.

## What you need to do

Your existing Firebase project, room document, and Firestore index can stay exactly as they are. Do **not** deploy Cloud Functions and do not upgrade to Blaze.

### 1. Publish these Firestore rules

1. Open Firebase Console → **Firestore Database** → **Rules**.
2. Click **Develop and Test**.
3. Replace everything in the editor with the contents of `firestore.rules` in this folder.
4. Click **Publish**.

These rules let visitors read rooms and bookings, create a valid booking, and delete any booking. They do not allow editing the room details or altering an existing booking.

### 2. Keep your existing index

The following composite index must show **Enabled** under Firestore → **Indexes**:

| Collection | Fields (ascending) |
| --- | --- |
| `bookings` | `roomId`, `status`, `dayKey`, `startAt` |

The index you already created is the right one.

### 3. Upload to GitHub Pages

Upload or replace these files in the root of your `meetingroombooking` GitHub repository:

```text
index.html
app.js
styles.css
firebase-config.js
assets/halo-telco-logo.png
```

Keep the existing `firebase-config.js` values. Wait 1–2 minutes for GitHub Pages, then refresh the website using **Ctrl + F5**.

## Team message to share

> This room calendar is shared by the Marketing team. Please book only the time you need, and delete only your own booking. All bookings are visible to everyone in real time.

## Important limitation

This version has no identity check. Anyone who has the site link can delete a booking, and two people booking exactly the same time at the exact same moment could potentially create a clash. This is acceptable only because the team has agreed to work on trust. For stricter control later, restore the login/production version.
