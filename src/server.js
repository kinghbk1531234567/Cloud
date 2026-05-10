import express from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || 'signed-ipas';
const ZSIGN_PATH = process.env.ZSIGN_PATH || '/usr/local/bin/zsign';
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 500);

if (!PUBLIC_BASE_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('Missing required env vars. Set PUBLIC_BASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 }
});

function safeName(name = 'App') {
  return String(name).replace(/[^a-zA-Z0-9 _.-]/g, '').slice(0, 60) || 'App';
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} failed with code ${code}\n${stderr || stdout}`));
    });
  });
}

async function uploadToSupabase(localPath, remotePath, contentType) {
  const body = await fs.readFile(localPath);
  const { error } = await supabase.storage.from(BUCKET).upload(remotePath, body, {
    contentType,
    upsert: true
  });
  if (error) throw error;
}

async function makeSignedUrl(remotePath, expiresSeconds = 60 * 60 * 24 * 7) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(remotePath, expiresSeconds);
  if (error) throw error;
  return data.signedUrl;
}

app.get('/health', async (_req, res) => {
  try {
    const v = await run(ZSIGN_PATH, ['-v']).catch(e => ({ stdout: '', stderr: e.message }));
    res.json({ ok: true, zsign: (v.stdout || v.stderr).trim() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/sign', upload.fields([
  { name: 'ipa', maxCount: 1 },
  { name: 'p12', maxCount: 1 },
  { name: 'mobileprovision', maxCount: 1 }
]), async (req, res) => {
  const jobId = nanoid(12);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `sign-${jobId}-`));

  try {
    const ipa = req.files?.ipa?.[0];
    const p12 = req.files?.p12?.[0];
    const mobileprovision = req.files?.mobileprovision?.[0];
    const password = req.body.password || '';
    const appName = safeName(req.body.appName || 'Signed App');
    const bundleId = String(req.body.bundleId || '').trim();

    if (!ipa || !p12 || !mobileprovision) {
      return res.status(400).json({ error: 'Upload ipa, p12, and mobileprovision.' });
    }
    if (!ipa.originalname.toLowerCase().endsWith('.ipa')) {
      return res.status(400).json({ error: 'IPA file must end with .ipa' });
    }

    const ipaPath = path.join(tempDir, 'input.ipa');
    const p12Path = path.join(tempDir, 'cert.p12');
    const provPath = path.join(tempDir, 'profile.mobileprovision');
    const outPath = path.join(tempDir, 'signed.ipa');
    await fs.rename(ipa.path, ipaPath);
    await fs.rename(p12.path, p12Path);
    await fs.rename(mobileprovision.path, provPath);

    const args = ['-k', p12Path, '-p', password, '-m', provPath, '-o', outPath, '-z', '9'];
    if (bundleId) args.push('-b', bundleId);
    if (appName) args.push('-n', appName);
    args.push(ipaPath);

    await run(ZSIGN_PATH, args);

    const ipaRemote = `${jobId}/signed.ipa`;
    const manifestRemote = `${jobId}/manifest.plist`;
    await uploadToSupabase(outPath, ipaRemote, 'application/octet-stream');
    const signedIpaUrl = await makeSignedUrl(ipaRemote);

    const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key>
          <string>software-package</string>
          <key>url</key>
          <string>${signedIpaUrl.replace(/&/g, '&amp;')}</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key>
        <string>${(bundleId || 'com.example.signedapp').replace(/&/g, '&amp;')}</string>
        <key>bundle-version</key>
        <string>1.0</string>
        <key>kind</key>
        <string>software</string>
        <key>title</key>
        <string>${appName.replace(/&/g, '&amp;')}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>`;

    const manifestPath = path.join(tempDir, 'manifest.plist');
    await fs.writeFile(manifestPath, manifest);
    await uploadToSupabase(manifestPath, manifestRemote, 'application/xml');
    const manifestUrl = await makeSignedUrl(manifestRemote);
    const installUrl = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`;

    res.json({ jobId, installUrl, manifestUrl, signedIpaUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    try { await fs.rm(tempDir, { recursive: true, force: true }); } catch {}
    for (const field of Object.values(req.files || {}).flat()) {
      try { await fs.rm(field.path, { force: true }); } catch {}
    }
  }
});

app.listen(PORT, () => {
  console.log(`Cloud iOS signer running on ${PORT}`);
});
