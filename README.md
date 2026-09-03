# Residents Association Portal

A free-hosting-friendly starter portal using **GitHub Pages** for the website and **Supabase** for authentication, protected data and private document storage.

## Important security point

GitHub Pages is public static hosting. Do **not** put private meeting minutes, resident details or secret documents directly in the GitHub repository. This starter keeps protected content in Supabase, with Row Level Security (RLS), and uses a private Supabase Storage bucket for files.

The Supabase **publishable/anon key is intended for browser use** when RLS is correctly configured. Never place a `service_role` key in this project.

## 1. Create a Supabase project

1. Create a free project at Supabase.
2. Open **SQL Editor**.
3. Paste and run `supabase-setup.sql`.
4. In **Authentication > Users**, create a test resident account with an email and password.
5. In your project API settings, copy:
   - Project URL
   - Publishable key (or legacy anon key)
6. Put those two values in `config.js`.

## 2. Add content

Use Supabase Table Editor:

- `notices` — title, body, published date
- `documents` — title, description, storage path
- `contacts` — role, name, email, display order

For a private file:

1. Open **Storage > residents-documents**.
2. Upload (for example) `minutes/2026-09-agm.pdf`.
3. Add a row to `documents` where `storage_path` is exactly `minutes/2026-09-agm.pdf`.

The website creates a short-lived signed URL only after the resident is logged in.

## 3. Test locally

Because browsers can restrict some behaviour when files are opened directly, serve the folder locally if possible:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## 4. Publish free with GitHub Pages

1. Create a GitHub repository.
2. Upload these files to the repository root.
3. Open **Settings > Pages** in GitHub.
4. Choose to deploy from the `main` branch (root) or use GitHub Actions.
5. GitHub will provide your Pages address, usually similar to:
   `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`

## 5. Managing residents

Create one Supabase Auth user per resident/household. When somebody leaves, remove or disable only their account. Do not share one common password between all residents.

## What this starter does

- Email/password sign in
- Persists a logged-in session in the browser
- Sign out
- Protected notices from Supabase
- Private documents through signed Storage URLs
- Protected committee contacts
- Responsive desktop/mobile design

## Suggested next improvements

- Password reset flow
- Committee/admin role with editing controls
- Events/calendar page
- Maintenance request form
- Branded logo and association name
- Invite-only resident registration
