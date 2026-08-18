# Halo Telco Meeting Room Booking — Production Package

Static GitHub Pages frontend backed by Supabase authentication, PostgreSQL, Row Level Security and realtime updates.

## What is included

- Passwordless work-email sign-in (magic link)
- Optional Microsoft/Azure login hook
- Central PostgreSQL data shared by all users
- Database-level double-booking protection
- Booking ownership and admin cancellation support
- Realtime calendar refresh
- Past-slot blocking, room-capacity validation and operating-hour validation
- Responsive and keyboard-accessible controls
- No service-role key or private credential in the frontend

## 1. Create the Supabase project

1. Create a project at Supabase and record its **Project URL** and **anon public key**.
2. Open **SQL Editor**, paste all contents of `supabase/schema.sql`, and run it once.
3. In **Authentication → URL Configuration**, set:
   - Site URL: `https://syedhalimhalo.github.io/meetingroombooking/`
   - Redirect URL: `https://syedhalimhalo.github.io/meetingroombooking/**`
4. In **Authentication → Email**, enable email sign-in. Configure company SMTP before general rollout so magic links reliably arrive from a trusted Halo Telco sender.
5. To restrict sign-ups to a corporate domain, configure the restriction in Supabase Auth/SMTP and also set `allowedEmailDomain` in `config.js`. Client-side restriction alone is not a security boundary.

## 2. Configure the frontend

Edit `config.js`:

```js
window.APP_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_PUBLIC_KEY',
  roomSlug: 'marketing-meeting-room',
  timezone: 'Asia/Kuala_Lumpur',
  enableAzureLogin: false,
  allowedEmailDomain: 'your-company-domain.com'
};
```

The anon key is designed for browser use and is protected by Row Level Security. **Never place the Supabase service-role key in this folder or GitHub.**

Update the seeded room in `supabase/schema.sql` before first run, or edit the row later in Supabase Table Editor.

## 3. Deploy to GitHub Pages

Copy the contents of this folder to the root of the `meetingroombooking` repository, commit, and push. Required deployed files:

```text
index.html
app.js
styles.css
config.js
assets/halo-telco-logo.png
```

Do not deploy `supabase/schema.sql` if you prefer keeping database structure out of the public Pages bundle; keep it in a private operations repository instead.

## 4. Create an administrator

After the user has signed in at least once, run this in SQL Editor using their email:

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.user_id = u.id and lower(u.email) = lower('admin@your-company-domain.com');
```

Admins can cancel any booking through the database function. The current UI displays the cancel button to booking owners; an admin-management screen is a recommended next iteration.

## Optional Microsoft/Azure SSO

Configure the Azure provider under **Supabase Authentication → Providers**, add the callback URL shown by Supabase to the Microsoft Entra application, then set `enableAzureLogin: true`. Keep client secrets only inside the Supabase provider settings—never in `config.js`.

## Production acceptance checklist

- [ ] Test login and redirect using an actual work email
- [ ] Verify two simultaneous bookings for the same slot: exactly one must succeed
- [ ] Confirm ordinary users cannot cancel another user's booking
- [ ] Confirm past slots and over-capacity bookings are rejected
- [ ] Confirm realtime updates appear on a second device
- [ ] Configure company SMTP and review email templates
- [ ] Set the real room name, location and capacity
- [ ] Assign at least one admin and document the owner
- [ ] Enable Supabase database backups and review logs
- [ ] Test desktop, phone and the intended meeting-room tablet/kiosk

## Data model

- `rooms`: room identity, capacity and equipment
- `profiles`: user display name, department and role
- `bookings`: time range, owner, audit timestamps and cancellation status

Cancelled bookings remain in the database for audit purposes. They are not hard-deleted.
