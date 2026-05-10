# Cloud iOS IPA Signer — Supabase + Render

Personal/internal IPA signer for apps you own or are allowed to test.

## Cloud-only setup from iPad

### 1. Supabase

1. Open Supabase Dashboard.
2. Create a new project.
3. Go to SQL Editor.
4. Paste `supabase.sql` and run it.
5. Go to Project Settings > API.
6. Copy:
   - Project URL
   - service_role key

### 2. GitHub from iPad

1. Create a new GitHub repo.
2. Upload all files from this folder into the repo using GitHub website.

### 3. Render

1. Go to Render Dashboard.
2. New > Web Service.
3. Connect the GitHub repo.
4. Choose Docker runtime.
5. Add environment variables:
   - PUBLIC_BASE_URL=https://YOUR-RENDER-APP.onrender.com
   - SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   - SUPABASE_SERVICE_ROLE_KEY=your service role key
   - SUPABASE_BUCKET=signed-ipas
   - MAX_UPLOAD_MB=500
6. Deploy.
7. Open https://YOUR-RENDER-APP.onrender.com/health to check zsign.

### 4. Use it

Open your Render app URL on iPad Safari, upload:

- unsigned `.ipa`
- `.p12`
- `.mobileprovision`
- p12 password

Then tap Install.

## Important

- The iPad/iPhone UDID must be inside the provisioning profile.
- Certificate and provisioning profile must match the app bundle ID.
- Do not make this public. Protect it with login before production.
- Temporary cert files are deleted after signing, but you still control the server, so treat it as sensitive.
