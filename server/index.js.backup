const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');

// ── Load .env file manually (no dotenv dependency) ───────────
(function loadEnv() {
  try {
    const _fs = require('fs');
    const _path = require('path');
    const envFile = _path.join(__dirname, '../.env');
    if (_fs.existsSync(envFile)) {
      _fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && k.trim() && v.length) process.env[k.trim()] = v.join('=').trim();
      });
    }
  } catch(e) {}
})();

const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SITES_FILE = path.join(DATA_DIR, 'sites.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');

// ── Init data files ───────────────────────────────────────────
[DATA_DIR, UPLOADS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
if (!fs.existsSync(SITES_FILE)) fs.writeFileSync(SITES_FILE, JSON.stringify([]));

// ── Helpers ───────────────────────────────────────────────────
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

const getUsers = () => readJSON(USERS_FILE);
const getSites = () => readJSON(SITES_FILE);
const saveUsers = (u) => writeJSON(USERS_FILE, u);
const saveSites = (s) => writeJSON(SITES_FILE, s);

const requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Non authentifié' });
  next();
};

// ── Middleware ────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'quickio-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── AUTH ROUTES ───────────────────────────────────────────────

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { firstname, lastname, email, password, metier } = req.body;
    if (!firstname || !email || !password) return res.status(400).json({ error: 'Champs manquants' });

    const users = getUsers();
    if (users.find(u => u.email === email)) return res.status(409).json({ error: 'Email déjà utilisé' });

    const hash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const user = { id: userId, firstname, lastname, email, password: hash, metier, plan: 'gratuit', createdAt: new Date().toISOString() };
    users.push(user);
    saveUsers(users);

    // Create default empty site for user
    const sites = getSites();
    const siteId = uuidv4();
    const slug = (firstname + '-' + (metier || 'pro')).toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const defaultSite = {
      id: siteId,
      userId,
      slug: slug + '-' + siteId.slice(0, 4),
      published: false,
      content: {
        name: firstname + ' ' + (lastname || ''),
        tagline: 'Professionnel à votre service',
        description: 'Bonjour ! Je suis ' + firstname + ', ' + (metier || 'professionnel') + '. Contactez-moi pour un devis gratuit.',
        phone: '',
        email: email,
        city: '',
        metier: metier || '',
        services: [
          { icon: '⚡', title: 'Service 1', desc: 'Description de votre premier service' },
          { icon: '🔧', title: 'Service 2', desc: 'Description de votre deuxième service' },
          { icon: '🏠', title: 'Service 3', desc: 'Description de votre troisième service' },
        ],
        ctaText: 'Prendre RDV gratuitement',
        ctaUrl: '',
        socialLinks: { facebook: '', instagram: '', whatsapp: '' },
      },
      design: {
        primaryColor: '#1A6BFF',
        fontFamily: 'Syne',
        theme: 'light',
        template: 'moderne',
        buttonRadius: '50',
        showReviews: true,
        showServices: true,
        showContact: true,
      },
      seo: {
        title: firstname + ' ' + (metier || '') + ' - Site professionnel',
        description: 'Site professionnel de ' + firstname + '. Contactez-moi pour un devis.',
        keywords: metier || '',
        googleVerification: '',
      },
      domain: {
        subdomain: slug + '-' + siteId.slice(0, 4),
        customDomain: '',
        customDomainStatus: 'non configuré',
      },
      stats: { visits: 0, clicks: 0, rdv: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    sites.push(defaultSite);
    saveSites(sites);

    req.session.userId = userId;
    req.session.siteId = siteId;
    res.json({ success: true, user: { id: userId, firstname, email, plan: 'gratuit' }, siteId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.email === email);
    if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    const sites = getSites();
    const site = sites.find(s => s.userId === user.id);

    req.session.userId = user.id;
    req.session.siteId = site?.id;
    res.json({ success: true, user: { id: user.id, firstname: user.firstname, email: user.email, plan: user.plan }, siteId: site?.id });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Session check
app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecté' });
  const users = getUsers();
  const user = users.find(u => u.id === req.session.userId);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  res.json({ id: user.id, firstname: user.firstname, lastname: user.lastname, email: user.email, plan: user.plan, siteId: req.session.siteId });
});

// ── SITE ROUTES ───────────────────────────────────────────────

// Get site data
app.get('/api/site', requireAuth, (req, res) => {
  const sites = getSites();
  const site = sites.find(s => s.id === req.session.siteId);
  if (!site) return res.status(404).json({ error: 'Site introuvable' });
  res.json(site);
});

// Update content
app.put('/api/site/content', requireAuth, (req, res) => {
  const sites = getSites();
  const idx = sites.findIndex(s => s.id === req.session.siteId);
  if (idx === -1) return res.status(404).json({ error: 'Site introuvable' });
  const prev = sites[idx].content;
  const body = req.body;
  // Merge fields individually — never lose services array
  sites[idx].content = {
    ...prev,
    ...body,
    // Keep existing services if body sends null/undefined
    services: Array.isArray(body.services) ? body.services : prev.services,
    socialLinks: { ...(prev.socialLinks || {}), ...(body.socialLinks || {}) },
  };
  sites[idx].updatedAt = new Date().toISOString();
  saveSites(sites);
  res.json({ success: true, content: sites[idx].content });
});

// Update design
app.put('/api/site/design', requireAuth, (req, res) => {
  const sites = getSites();
  const idx = sites.findIndex(s => s.id === req.session.siteId);
  if (idx === -1) return res.status(404).json({ error: 'Site introuvable' });
  sites[idx].design = { ...sites[idx].design, ...req.body };
  sites[idx].updatedAt = new Date().toISOString();
  saveSites(sites);
  res.json({ success: true, design: sites[idx].design });
});

// Update SEO
app.put('/api/site/seo', requireAuth, (req, res) => {
  const sites = getSites();
  const idx = sites.findIndex(s => s.id === req.session.siteId);
  if (idx === -1) return res.status(404).json({ error: 'Site introuvable' });
  sites[idx].seo = { ...sites[idx].seo, ...req.body };
  sites[idx].updatedAt = new Date().toISOString();
  saveSites(sites);
  res.json({ success: true, seo: sites[idx].seo });
});

// Update domain
app.put('/api/site/domain', requireAuth, (req, res) => {
  const sites = getSites();
  const idx = sites.findIndex(s => s.id === req.session.siteId);
  if (idx === -1) return res.status(404).json({ error: 'Site introuvable' });

  const { subdomain, customDomain } = req.body;
  if (subdomain) {
    // Check uniqueness
    const clean = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const conflict = sites.find(s => s.domain.subdomain === clean && s.id !== req.session.siteId);
    if (conflict) return res.status(409).json({ error: 'Ce sous-domaine est déjà pris' });
    sites[idx].domain.subdomain = clean;
    sites[idx].slug = clean;
  }
  if (customDomain !== undefined) {
    sites[idx].domain.customDomain = customDomain;
    sites[idx].domain.customDomainStatus = customDomain ? 'en attente de DNS' : 'non configuré';
  }
  sites[idx].updatedAt = new Date().toISOString();
  saveSites(sites);
  res.json({ success: true, domain: sites[idx].domain });
});

// Publish / unpublish
app.post('/api/site/publish', requireAuth, (req, res) => {
  const sites = getSites();
  const idx = sites.findIndex(s => s.id === req.session.siteId);
  if (idx === -1) return res.status(404).json({ error: 'Site introuvable' });
  sites[idx].published = !sites[idx].published;
  sites[idx].updatedAt = new Date().toISOString();
  saveSites(sites);
  res.json({ success: true, published: sites[idx].published });
});

// Change template
app.put('/api/site/template', requireAuth, (req, res) => {
  const sites = getSites();
  const idx = sites.findIndex(s => s.id === req.session.siteId);
  if (idx === -1) return res.status(404).json({ error: 'Site introuvable' });
  sites[idx].design.template = req.body.template;
  sites[idx].updatedAt = new Date().toISOString();
  saveSites(sites);
  res.json({ success: true });
});

// ── IMAGE GENERATION ─────────────────────────────────────────
const https = require('https');
const http  = require('http');

// ── AI TEXT GENERATION (Groq — gratuit) ─────────────────────
app.post('/api/site/generate-desc', requireAuth, async (req, res) => {
  try {
    const { serviceTitle, metier, name } = req.body;
    if (!serviceTitle) return res.status(400).json({ error: 'Titre manquant' });

    const apiKey = process.env.GROQ_API_KEY || '';
    if (!apiKey) return res.status(500).json({ error: 'Clé GROQ_API_KEY manquante dans .env' });

    const body = JSON.stringify({
      model: 'llama-3.1-8b-instant',
      max_tokens: 120,
      messages: [
        {
          role: 'system',
          content: 'Tu rédiges des descriptions de services professionnels en français, en 30 mots maximum. Pas de guillemets. Pas d\'introduction. Juste la description directement, percutante et orientée client.'
        },
        {
          role: 'user',
          content: `Service : "${serviceTitle}". Professionnel : ${name || 'un pro'}, ${metier || 'indépendant'}. Rédige une description de 30 mots max.`
        }
      ]
    });

    const response = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(body)
        }
      };
      const req2 = https.request(options, (r) => {
        let data = '';
        r.on('data', chunk => data += chunk);
        r.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(new Error('Réponse invalide')); } });
      });
      req2.on('error', reject);
      req2.write(body);
      req2.end();
    });

    if (response.error) return res.status(500).json({ error: response.error.message });
    const text = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
    res.json({ success: true, text: text ? text.trim() : '' });
  } catch(e) {
    console.error('AI text error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── IMAGE GENERATION ────────────────────────────────────────
app.post('/api/site/service-image', requireAuth, async (req, res) => {
  try {
    const { serviceTitle, metier, idx } = req.body;
    if (!serviceTitle) return res.status(400).json({ error: 'Titre manquant' });

    const filename = `service-${req.session.siteId}-${idx}-${Date.now()}`;
    let savedPath = '';

    // Try Pollinations first
    try {
      const prompt = encodeURIComponent(`professional photo ${metier || ''} ${serviceTitle}, clean modern, bright, no text, commercial photography`);
      const seed = Math.floor(Math.random() * 99999);
      const url = `https://image.pollinations.ai/prompt/${prompt}?width=600&height=400&seed=${seed}&nologo=true`;
      const buf = await fetchImageBuffer(url, 35000);
      if (buf && buf.length > 5000) {
        const fp = path.join(UPLOADS_DIR, filename + '.jpg');
        fs.writeFileSync(fp, buf);
        savedPath = `/uploads/${filename}.jpg`;
        console.log(`Pollinations OK: ${buf.length} bytes`);
      }
    } catch(e) { console.log('Pollinations failed:', e.message); }

    // Fallback: generate a clean SVG illustration
    if (!savedPath) {
      const colors = ['#1A6BFF','#00C97A','#FF8C42','#8B5CF6','#EF4444','#0EA5E9'];
      const color = colors[Math.abs(serviceTitle.charCodeAt(0)) % colors.length];
      const icons = { 'elec': '⚡', 'plomb': '🔧', 'coiff': '✂️', 'resto': '🍽️', 'médec': '🏥', 'coach': '💪', 'jardin': '🌿', 'peint': '🖌️', 'maçon': '🏗️', 'nettoy': '🧹' };
      let icon = '✨';
      const lower = (serviceTitle + metier).toLowerCase();
      for (const [k, v] of Object.entries(icons)) { if (lower.includes(k)) { icon = v; break; } }

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${color};stop-opacity:0.12"/>
      <stop offset="100%" style="stop-color:${color};stop-opacity:0.04"/>
    </linearGradient>
    <linearGradient id="card" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1"/>
      <stop offset="100%" style="stop-color:#f7f9ff;stop-opacity:1"/>
    </linearGradient>
  </defs>
  <rect width="600" height="400" fill="url(#bg)"/>
  <rect x="0" y="0" width="600" height="4" fill="${color}" opacity="0.6"/>
  <!-- decorative circles -->
  <circle cx="520" cy="60" r="80" fill="${color}" opacity="0.06"/>
  <circle cx="80" cy="340" r="60" fill="${color}" opacity="0.05"/>
  <!-- main card -->
  <rect x="150" y="80" width="300" height="240" rx="20" fill="url(#card)" opacity="0.95" filter="drop-shadow(0 8px 24px rgba(0,0,0,0.08))"/>
  <rect x="150" y="80" width="300" height="240" rx="20" fill="none" stroke="${color}" stroke-opacity="0.15" stroke-width="1.5"/>
  <!-- icon circle -->
  <circle cx="300" cy="175" r="45" fill="${color}" opacity="0.12"/>
  <circle cx="300" cy="175" r="35" fill="${color}" opacity="0.18"/>
  <text x="300" y="188" text-anchor="middle" font-size="30">${icon}</text>
  <!-- title -->
  <text x="300" y="242" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="16" fill="#0A0F1E" opacity="0.85">${serviceTitle.slice(0,28)}</text>
  ${metier ? `<text x="300" y="265" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="${color}" opacity="0.8">${metier.slice(0,30)}</text>` : ''}
  <!-- bottom bar -->
  <rect x="240" y="290" width="120" height="3" rx="2" fill="${color}" opacity="0.3"/>
</svg>`;

      const fp = path.join(UPLOADS_DIR, filename + '.svg');
      fs.writeFileSync(fp, svg);
      savedPath = `/uploads/${filename}.svg`;
      console.log('SVG fallback used');
    }

    // Save into site data
    const sites = getSites();
    const siteIdx = sites.findIndex(s => s.id === req.session.siteId);
    if (siteIdx !== -1 && sites[siteIdx].content.services[idx] !== undefined) {
      sites[siteIdx].content.services[idx].image = savedPath;
      sites[siteIdx].updatedAt = new Date().toISOString();
      saveSites(sites);
    }

    res.json({ success: true, imageUrl: savedPath });
  } catch(e) {
    console.error('Image error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Helper: fetch image as buffer with timeout + redirect support
function fetchImageBuffer(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), timeoutMs || 20000);
    const doGet = (targetUrl, redirects) => {
      if (redirects <= 0) { clearTimeout(timer); return reject(new Error('Trop de redirections')); }
      const protocol = targetUrl.startsWith('https') ? https : http;
      protocol.get(targetUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return doGet(response.headers.location, redirects - 1);
        }
        if (response.statusCode !== 200) {
          clearTimeout(timer);
          return reject(new Error(`HTTP ${response.statusCode}`));
        }
        const chunks = [];
        response.on('data', c => chunks.push(c));
        response.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
        response.on('error', e => { clearTimeout(timer); reject(e); });
      }).on('error', e => { clearTimeout(timer); reject(e); });
    };
    doGet(url, 5);
  });
}



// ── PUBLIC SITE RENDER ────────────────────────────────────────
app.get('/site/:slug', (req, res) => {
  const sites = getSites();
  const site = sites.find(s => s.slug === req.params.slug);
  if (!site) return res.status(404).send('<h1>Site introuvable</h1>');
  if (!site.published) return res.status(404).send('<h1>Ce site n\'est pas encore publié</h1>');

  // Increment visits
  const idx = sites.findIndex(s => s.id === site.id);
  sites[idx].stats.visits = (sites[idx].stats.visits || 0) + 1;
  saveSites(sites);

  res.send(renderSite(site));
});

// Preview (auth required, no publish check)
app.get('/api/site/preview', requireAuth, (req, res) => {
  const sites = getSites();
  const site = sites.find(s => s.id === req.session.siteId);
  if (!site) return res.status(404).send('<h1>Site introuvable</h1>');
  res.send(renderSite(site));
});

// ── SITE RENDERER ─────────────────────────────────────────────
function renderSite(site) {
  const { content, design, seo } = site;
  const c = content;
  const d = design;
  const fontUrl = d.fontFamily === 'Syne'
    ? 'https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500;600&display=swap'
    : d.fontFamily === 'Georgia'
    ? 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap'
    : 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap';

  const servicesHTML = (c.services || []).map(s => `
    <div class="service-card">
      ${s.image ? `<div class="s-img" style="background-image:url('${s.image}')"></div>` : `<div class="s-icon">${s.icon}</div>`}
      <h3>${s.title}</h3>
      <p>${s.desc}</p>
    </div>`).join('');

  const socialsHTML = Object.entries(c.socialLinks || {}).filter(([,v]) => v).map(([k,v]) => {
    const icons = { facebook: '📘', instagram: '📸', whatsapp: '💬' };
    return `<a href="${v}" class="social-link">${icons[k] || '🔗'} ${k}</a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${seo.title}</title>
<meta name="description" content="${seo.description}"/>
<meta name="keywords" content="${seo.keywords}"/>
${seo.googleVerification ? `<meta name="google-site-verification" content="${seo.googleVerification}"/>` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="${fontUrl}" rel="stylesheet"/>
<style>
:root{--primary:${d.primaryColor};--radius:${d.buttonRadius}px;--font:'${d.fontFamily}',sans-serif;}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'DM Sans',sans-serif;background:${d.theme==='dark'?'#0A0F1E':'#fff'};color:${d.theme==='dark'?'#fff':'#0A0F1E'};}
h1,h2,h3,h4{font-family:var(--font);}
nav{position:sticky;top:0;background:${d.theme==='dark'?'rgba(10,15,30,0.95)':'rgba(255,255,255,0.95)'};backdrop-filter:blur(12px);padding:14px 6%;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid ${d.theme==='dark'?'rgba(255,255,255,0.08)':'#E2E8F8'};z-index:100;}
.nav-name{font-family:var(--font);font-weight:800;font-size:1.2rem;}
.nav-cta{padding:8px 20px;background:var(--primary);color:white;border:none;border-radius:var(--radius);font-weight:600;cursor:pointer;font-size:0.85rem;text-decoration:none;}
.hero{padding:80px 6%;text-align:center;background:radial-gradient(ellipse 80% 60% at 50% -10%,${d.primaryColor}18 0%,transparent 70%);}
.hero h1{font-size:clamp(2rem,5vw,3.5rem);font-weight:800;letter-spacing:-0.04em;margin-bottom:1rem;}
.hero h1 .accent{color:var(--primary);}
.hero p{font-size:1.05rem;opacity:.7;max-width:500px;margin:0 auto 2rem;line-height:1.65;}
.hero-btn{display:inline-block;padding:14px 32px;background:var(--primary);color:white;border:none;border-radius:var(--radius);font-weight:700;font-size:1rem;cursor:pointer;text-decoration:none;box-shadow:0 8px 24px ${d.primaryColor}44;}
.section{padding:72px 6%;}
.section-bg{background:${d.theme==='dark'?'#111827':'#F7F9FF'};}
.section-title{text-align:center;font-size:clamp(1.5rem,3vw,2.2rem);font-weight:800;letter-spacing:-0.03em;margin-bottom:2.5rem;}
.services-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1.2rem;}
.service-card{background:${d.theme==='dark'?'#1a2540':'white'};border:1px solid ${d.theme==='dark'?'rgba(255,255,255,0.08)':'#E2E8F8'};border-radius:16px;padding:1.8rem;text-align:center;}
.service-card:hover{transform:translateY(-4px);transition:.2s;box-shadow:0 12px 32px ${d.primaryColor}22;}
.s-icon{font-size:2rem;margin-bottom:0.8rem;}
.s-img{width:100%;height:140px;background-size:cover;background-position:center;border-radius:10px;margin-bottom:0.9rem;}
.service-card h3{font-size:1rem;font-weight:700;margin-bottom:0.4rem;}
.service-card p{font-size:0.85rem;opacity:.6;line-height:1.55;}
.contact-section{padding:72px 6%;text-align:center;}
.contact-info{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin-bottom:1.5rem;}
.contact-btn{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;border-radius:var(--radius);font-weight:600;font-size:0.9rem;text-decoration:none;cursor:pointer;transition:.2s;}
.contact-btn.primary{background:var(--primary);color:white;}
.contact-btn.outline{border:2px solid ${d.theme==='dark'?'rgba(255,255,255,0.2)':'#E2E8F8'};color:inherit;background:none;}
.social-links{display:flex;gap:1rem;justify-content:center;margin-top:1.5rem;flex-wrap:wrap;}
.social-link{padding:8px 16px;border-radius:20px;background:${d.theme==='dark'?'rgba(255,255,255,0.06)':'#F0F4FF'};color:var(--primary);text-decoration:none;font-size:0.85rem;font-weight:500;}
footer{padding:28px 6%;text-align:center;border-top:1px solid ${d.theme==='dark'?'rgba(255,255,255,0.06)':'#E2E8F8'};font-size:0.8rem;opacity:.4;}
.badge{display:inline-flex;align-items:center;gap:6px;background:${d.primaryColor}18;color:var(--primary);padding:5px 14px;border-radius:20px;font-size:0.78rem;font-weight:600;margin-bottom:1.2rem;}
</style>
</head>
<body>
<nav>
  <div class="nav-name">${c.name}</div>
  ${c.ctaUrl ? `<a href="${c.ctaUrl}" class="nav-cta">${c.ctaText}</a>` : `<span class="nav-cta">${c.ctaText}</span>`}
</nav>

<section class="hero">
  <div class="badge">✨ ${c.metier || 'Professionnel'} ${c.city ? '· ' + c.city : ''}</div>
  <h1><span class="accent">${c.name.split(' ')[0]}</span>${c.name.split(' ').slice(1).join(' ') ? ' ' + c.name.split(' ').slice(1).join(' ') : ''}</h1>
  <p>${c.tagline}</p>
  <p style="font-size:.95rem;opacity:.6;margin-bottom:1.8rem;">${c.description}</p>
  ${c.ctaUrl ? `<a href="${c.ctaUrl}" class="hero-btn">${c.ctaText}</a>` : `<span class="hero-btn">${c.ctaText}</span>`}
</section>

${d.showServices !== false && c.services?.length ? `
<section class="section section-bg">
  <h2 class="section-title">Mes Services</h2>
  <div class="services-grid">${servicesHTML}</div>
</section>` : ''}

${d.showContact !== false ? `
<section class="contact-section">
  <h2 class="section-title">Me contacter</h2>
  <div class="contact-info">
    ${c.phone ? `<a href="tel:${c.phone}" class="contact-btn primary">📞 ${c.phone}</a>` : ''}
    ${c.email ? `<a href="mailto:${c.email}" class="contact-btn outline">✉️ ${c.email}</a>` : ''}
    ${c.ctaUrl ? `<a href="${c.ctaUrl}" class="contact-btn outline">📅 Prendre RDV</a>` : ''}
  </div>
  ${socialsHTML ? `<div class="social-links">${socialsHTML}</div>` : ''}
</section>` : ''}

<footer>© ${new Date().getFullYear()} ${c.name} · Propulsé par Quickio</footer>
</body></html>`;
}

// ── SPA fallback ──────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'dashboard.html')));
app.get('/editor', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'editor.html')));
app.get('/templates', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'templates.html')));
app.get('/auth', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'auth.html')));

app.listen(PORT, () => {
  console.log(`\n  ╔═══════════════════════════════════╗`);
  console.log(`  ║   🚀 QUICKIO — http://localhost:${PORT}  ║`);
  console.log(`  ╚═══════════════════════════════════╝\n`);
  console.log(`  Landing    → http://localhost:${PORT}/`);
  console.log(`  Auth       → http://localhost:${PORT}/auth`);
  console.log(`  Dashboard  → http://localhost:${PORT}/dashboard`);
  console.log(`  Editeur    → http://localhost:${PORT}/editor`);
  console.log(`\n  Ctrl+C pour arrêter\n`);
});
