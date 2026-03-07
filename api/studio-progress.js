// api/studio-progress.js
// Reads and writes episode/workflow progress to GitHub-backed JSON
// GET  /api/studio-progress        -> returns current progress JSON
// POST /api/studio-progress        -> saves new progress JSON (requires auth header)

const REPO  = 'TheSuiMethod/franchise-grade-systems';
const FILE  = 'studio-progress.json';
const BRANCH = 'main';

function unauthorized(res) {
  res.status(401).json({ error: 'Unauthorized' });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Studio-Auth');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') { return res.status(200).end(); }

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'Server misconfigured' });

  const API = `https://api.github.com/repos/${REPO}/contents/${FILE}`;
  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'FGS-Studio'
  };

  // ── GET ─────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const r = await fetch(API, { headers });
    if (r.status === 404) return res.json({ episodes: {}, steps: {} });
    if (!r.ok) return res.status(502).json({ error: 'GitHub error' });
    const data = await r.json();
    const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
    return res.json(content);
  }

  // ── POST ────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    // Verify studio password header
    const auth = req.headers['x-studio-auth'];
    if (auth !== process.env.STUDIO_PASSWORD) return unauthorized(res);

    const newContent = req.body;
    if (!newContent || typeof newContent !== 'object') {
      return res.status(400).json({ error: 'Invalid body' });
    }

    // Get current SHA (needed for update)
    const current = await fetch(API, { headers });
    let sha = null;
    if (current.ok) {
      const cd = await current.json();
      sha = cd.sha;
    }

    const encoded = Buffer.from(JSON.stringify(newContent, null, 2)).toString('base64');
    const payload = {
      message: 'Update studio progress',
      content: encoded,
      branch: BRANCH,
      ...(sha ? { sha } : {})
    };

    const put = await fetch(API, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!put.ok) {
      const err = await put.json();
      return res.status(502).json({ error: 'GitHub write failed', detail: err.message });
    }

    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
