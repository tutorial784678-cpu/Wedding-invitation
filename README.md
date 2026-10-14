# Luxury Islamic Nikah Invitation

A responsive Muslim Nikah invitation site using the supplied golden Islamic arch artwork, Bismillah calligraphy, a cinematic open-invitation screen, RSVP form, countdown, admin dashboard, personalized guest links, PostgreSQL persistence, and optional Cloudinary image storage.

## Included
- `public/index.html` — public invitation and RSVP.
- `public/admin.html` — admin login/dashboard for names, event details, theme, media URLs, guest links, RSVP responses, draft/publish and restore.
- `server.js` — Express API, secure HttpOnly admin session cookie, PostgreSQL persistence.
- `schema.sql` — database schema and default invitation settings.
- `scripts/init-db.js` — initialize database schema.
- `public/assets/nikah-artwork.jpg` — your supplied artwork.

## Important setup

### 1. Create PostgreSQL
Create a database using Neon or Supabase. Copy its PostgreSQL connection string. For hosted providers, use SSL. Keep credentials private.

### 2. Configure environment
Copy `.env.example` to `.env` for local development, then set:
- `DATABASE_URL`
- `JWT_SECRET` to a random secret of at least 32 characters
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD` to a unique password of at least 12 characters

The first admin is created when the server initializes the schema and no admin exists. Do not commit `.env` to GitHub. The admin password is stored as a bcrypt hash.

### 3. Run locally
Requires Node.js 20+.

```bash
npm install
npm run db:init
npm start
```

Open `http://localhost:3000` and `http://localhost:3000/admin.html`.

### 4. Optional Cloudinary image storage
Create a Cloudinary account and set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the hosting environment. The admin dashboard can then upload replacement artwork. Cloudinary secrets stay server-side. Audio is supplied as a URL; use durable cloud storage for audio and paste its public URL in the admin panel.

### 5. Deploy to Vercel + GitHub
1. Push this project to a private or public GitHub repository.
2. Import the repository in Vercel.
3. Add all required environment variables in **Project Settings → Environment Variables** for Production (and Preview if needed).
4. Use a hosted PostgreSQL database (Neon/Supabase recommended); add `DATABASE_URL`.
5. Deploy. The Vercel Node function runs `server.js`; the database schema is initialized on the first API request.
6. Visit `/admin.html` and sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

Vercel's filesystem is ephemeral; the app intentionally does not save uploaded files to local disk. PostgreSQL stores settings, guest links, RSVP records, and previous settings versions. Cloudinary stores uploaded images.

## Personalized guest links
Create a guest record in the admin dashboard, then share the generated `/invite/slug` URL. The public page uses the guest record display name in the greeting. Guest links can be enabled/disabled in the admin list; disabled known guest slugs are rejected by the public settings API.

## Security notes
- Never put database, JWT, or Cloudinary secrets in frontend code.
- Use a strong unique admin password and rotate it if exposed.
- Vercel environment variables should not be committed to GitHub.
- Use HTTPS in production.
- This starter supports a single initial admin account. Admin password changes and multi-admin management are not included in the dashboard yet; rotate the initial admin credentials through a secure database/admin maintenance process.
- Configure database backups and Cloudinary access controls before relying on the site for a live event.
- The RSVP form is public; consider adding CAPTCHA or rate limiting before a public launch.

## Notes about artwork
The supplied image is used directly as the main artwork. If its checkerboard is part of the uploaded pixels (rather than actual alpha transparency), this project does not alter the original file. Replace it with a clean transparent PNG if you have one for the best visual finish.
