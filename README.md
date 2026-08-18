# Halo Telco Meeting Room Booking — V3 Firebase

This version replaces Supabase magic links with **Google Sign-In**. It uses Firebase Authentication, Cloud Firestore realtime updates, security rules, and two Cloud Functions that enforce booking ownership and prevent overlapping bookings.

## Important first

The Cloud Functions are what make double-booking protection server-enforced. Deploying them requires the Firebase **Blaze** plan with a linked billing account. Firebase includes no-cost quotas on Blaze, but configure a budget alert before deployment. Do not deploy Functions until the billing owner approves.

## What staff experience

1. Open the GitHub Pages website.
2. Click **Continue with Google**.
3. Choose their Google account.
4. Book a future slot. Other signed-in staff see it immediately.

## Part A — Firebase Console setup

1. Go to https://console.firebase.google.com and create a project named `halo-meeting-room`.
2. In the project overview, click the web icon `</>` to **Add app**. Register the app; do not enable Firebase Hosting because GitHub Pages remains the website host.
3. Firebase shows a JavaScript config object. Copy its six values into `firebase-config.js`.
4. Go to **Authentication → Sign-in method**, enable **Google**, provide a public project support email, and save.
5. In **Authentication → Settings → Authorized domains**, add `syedhalimhalo.github.io`.
6. Go to **Firestore Database → Create database**. Choose Production mode and a nearby location.

## Part B — Create the room once

In **Firestore Database → Start collection**:

- Collection ID: `rooms`
- Document ID: `marketing-meeting-room`

Add these fields:

| Field | Type | Value |
|---|---|---|
| `name` | string | `Marketing Meeting Room` |
| `department` | string | `Marketing Department` |
| `location` | string | `Level 8` |
| `capacity` | number | `12` |
| `active` | boolean | `true` |

The document ID must remain identical to `roomId` in `firebase-config.js`.

## Part C — Deploy security and server functions

On a Windows computer with Node.js installed, open PowerShell inside this V3 folder and run:

```powershell
npm install -g firebase-tools
firebase login
firebase use --add
cd functions
npm install
cd ..
firebase deploy --only firestore:rules,firestore:indexes,functions
```

Choose the Firebase project you created when `firebase use --add` asks. Do not upload `functions/` to GitHub Pages; it deploys to Firebase through the command above.

After deployment, Firestore client writes are blocked by `firestore.rules`; only the secure Cloud Functions can create or cancel bookings.

## Part D — Deploy the web frontend to GitHub Pages

Upload these to the **root** of `syedhalimhalo/meetingroombooking`:

```text
index.html
app.js
styles.css
firebase-config.js
assets/halo-telco-logo.png
```

The Firebase web config is safe to publish. Never publish a service-account JSON key, private key, Google Cloud credential, or billing information.

## Verification checklist

- [ ] Google popup/redirect lets you sign in.
- [ ] Header changes from `CHECKING` to `AVAILABLE`.
- [ ] A future booking appears after confirmation.
- [ ] Same booking appears in a second signed-in browser.
- [ ] A booking that overlaps is rejected.
- [ ] A user can cancel their own booking but cannot cancel another user's booking.
- [ ] Budget alert is enabled under Google Cloud Billing.

## Administration

Bookings are stored in Firestore collection `bookings`. To give an admin the ability to cancel any booking, an administrator must set the Firebase custom claim `admin: true` using an Admin SDK script or Firebase/Google Cloud tooling. The standard UI deliberately only shows cancellation to the booking owner.

## Architecture

```text
GitHub Pages UI → Firebase Google Sign-In → Cloud Firestore (realtime read)
                                      ↘ Cloud Functions (secure book/cancel)
```
