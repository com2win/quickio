process.on("uncaughtException",function(e){console.error("[crash]",e.message);});
process.on("unhandledRejection",function(e){console.error("[reject]",e&&e.message);});
const express = require('express');
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 5, message: {error: 'Trop de tentatives, réessayez dans 15 minutes.'}, standardHeaders: true, legacyHeaders: false });
const registerLimiter = rateLimit({ windowMs: 60*60*1000, max: 2, message: {error: 'Trop d\'inscriptions depuis cette IP, réessayez dans 1 heure.'}, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 60*1000, max: 5, message: {error: 'Trop de requêtes.'}, standardHeaders: true, legacyHeaders: false });
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
process.on('uncaughtException', function(err) {
  console.error('[uncaughtException]', err.message);
});
process.on('unhandledRejection', function(err) {
  console.error('[unhandledRejection]', err && err.message);
});

const multer = require('multer');
const { renderSite } = require('./templates/render-site');
const { pool, query, queryOne, queryAll } = require('./db/pool');
const app = express();

const _origQuery = pool.query.bind(pool);
pool.query = function(text, params) {
  if (params) {
    for (var i=0; i<params.length; i++) {
      if (params[i] === undefined || params[i] === 'undefined') {
        return Promise.reject(new Error('QUERY_BLOCKED: undefined param in: ' + text.substring(0,60)));
      }
    }
  }
  return _origQuery(text, params);
};


// Auto-catch middleware
const asyncWrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(err => {
  console.error('[route-error]', req.method, req.path, err.message);
});

const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
var BETA_USER = process.env.BETA_USER || "quickio"; var BETA_PASS = process.env.BETA_PASS || "test1234"; function requireBeta(req, res, next) { var auth = req.headers.authorization; if (!auth || !auth.startsWith("Basic ")) { res.set("WWW-Authenticate", "Basic realm=\"Quickio Beta\""); return res.status(401).send("Acces protege"); } var decoded = Buffer.from(auth.split(" ")[1], "base64").toString(); var parts = decoded.split(":"); if (parts[0] === BETA_USER && parts[1] === BETA_PASS) return next(); res.set("WWW-Authenticate", "Basic realm=\"Quickio Beta\""); return res.status(401).send("Identifiants incorrects"); } app.use(function(req,res,next){ var open=["auth","api/auth","favicon.ico"]; var p=req.path.replace(/^\/+/,""); if(open.some(function(o){return p===o||p.startsWith(o+"/");})||p.startsWith("uploads/")||p.startsWith("css/")||p.startsWith("js/")) return next(); return requireBeta(req,res,next); });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(function(req, res, next) { var h=req.hostname||''; var p=h.split('.'); if(p.length>=3 && h.endsWith('quickio.fr') && p.slice(0,p.length-2).join('.')!=='www') return next(); express.static(path.join(__dirname,'..','public'))(req,res,next); });
app.use(session({ store: new PgSession({ pool: pool, tableName: 'sessions', createTableIfMissing: false }), secret: process.env.SESSION_SECRET || 'quickio-secret-dev', resave: false, saveUninitialized: false, cookie: { secure: false, httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 } }));
function requireAuth(req, res, next) { if (!req.session.professionalId) return res.status(401).json({ error: 'Non authentifie' }); next(); }
function getSubdomain(req) { var host=req.hostname||''; var parts=host.split('.'); if(parts.length>=3 && host.endsWith('quickio.fr')){ var sub=parts.slice(0,parts.length-2).join('.'); if(sub!=='www') return sub; } return null; }
app.post('/api/auth/register', registerLimiter, async function(req, res) { try { var b = req.body; if (!b.firstname || !b.email || !b.password) return res.status(400).json({ error: 'Champs manquants' }); var existing = await queryOne('SELECT id FROM professionals WHERE email = $1', [b.email.toLowerCase()]); if (existing) return res.status(409).json({ error: 'Email deja utilise' }); var hash = await bcrypt.hash(b.password, 10); var trade = b.metier || b.trade || null; var pro = await queryOne('INSERT INTO professionals (firstname, lastname, email, password_hash, trade, plan) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [b.firstname.trim(), (b.lastname||'').trim(), b.email.toLowerCase().trim(), hash, trade, 'Tester']); var baseSlug; if (b.sitename && b.sitename.trim()) { baseSlug = b.sitename.trim().toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,''); } else { baseSlug = (b.firstname + '-' + (trade || 'pro')).toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''); } var slug = baseSlug; var slugExists = await queryOne('SELECT id FROM websites WHERE slug=$1', [slug]); if (slugExists) { slug = baseSlug + '-' + pro.id.slice(0,4); var slugExists2 = await queryOne('SELECT id FROM websites WHERE slug=$1', [slug]); if (slugExists2) return res.status(409).json({error:'Ce nom de site est deja pris, essayez un autre.'}); } var w = await queryOne('INSERT INTO websites (professional_id, slug, business_name, tagline, description, contact_email, cta_text, seo_title, seo_description, seo_keywords) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [pro.id, slug, b.firstname+' '+(b.lastname||''), 'Professionnel a votre service', 'Bonjour ! Je suis '+b.firstname+', '+(trade||'professionnel')+'. Contactez-moi pour un devis gratuit.', b.email, 'Prendre RDV gratuitement', b.firstname+' '+(trade||'')+' - Site professionnel', 'Site professionnel de '+b.firstname, trade||'']); var GROQ_KEY = process.env.GROQ_API_KEY; if (GROQ_KEY) { try { var aiPrompt = 'Tu es un copywriter expert francais. Pour un(e) '+(trade||'professionnel(le)')+' nomme(e) "'+b.firstname+' '+(b.lastname||'')+'"' +', genere du contenu pour son site vitrine. Reponds UNIQUEMENT en JSON valide sans backticks avec: ' +'{ "tagline": "phrase accroche courte", "description": "description 2-3 phrases pro vouvoiement", ' +'"services": [{ "emoji": "emoji", "title": "nom du service", "description": "description 2-3 phrases" }] } ' +'Genere exactement 6 services pertinents pour ce metier. Ton professionnel et chaleureux, vouvoiement.'; var aiResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+GROQ_KEY}, body:JSON.stringify({model:'llama-3.3-70b-versatile', messages:[{role:'user',content:aiPrompt}], max_tokens:1024, temperature:0.7})}); var aiData = await aiResp.json(); if (aiData.choices && aiData.choices[0]) { var aiText = aiData.choices[0].message.content; aiText = aiText.replace(/```json/g,'').replace(/```/g,'').trim(); var aiParsed = JSON.parse(aiText); if (aiParsed.tagline) { await queryOne('UPDATE websites SET tagline=$1, description=$2, published=false, status=$4 WHERE id=$3', [aiParsed.tagline, aiParsed.description||'', w.id, 'draft']); } if (aiParsed.services && aiParsed.services.length) { for (var si=0; si<aiParsed.services.length; si++) { var svc = aiParsed.services[si]; await queryOne('INSERT INTO services_offered (website_id,display_order,emoji,title,description,ai_generated) VALUES ($1,$2,$3,$4,$5,true)', [w.id, si, svc.emoji||'\u26a1', svc.title||'Service', svc.description||'']); } } else { await queryOne('INSERT INTO services_offered (website_id,display_order,emoji,title,description) VALUES ($1,0,$2,$3,$4)', [w.id,'\u26a1','Service 1','Description de votre premier service']); await queryOne('INSERT INTO services_offered (website_id,display_order,emoji,title,description) VALUES ($1,1,$2,$3,$4)', [w.id,'\ud83d\udd27','Service 2','Description de votre deuxieme service']); await queryOne('INSERT INTO services_offered (website_id,display_order,emoji,title,description) VALUES ($1,2,$2,$3,$4)', [w.id,'\ud83c\udfe0','Service 3','Description de votre troisieme service']); } } } catch(aiErr) { console.error('AI generation error:', aiErr); await queryOne('INSERT INTO services_offered (website_id,display_order,emoji,title,description) VALUES ($1,0,$2,$3,$4)', [w.id,'\u26a1','Service 1','Description de votre premier service']); await queryOne('INSERT INTO services_offered (website_id,display_order,emoji,title,description) VALUES ($1,1,$2,$3,$4)', [w.id,'\ud83d\udd27','Service 2','Description de votre deuxieme service']); await queryOne('INSERT INTO services_offered (website_id,display_order,emoji,title,description) VALUES ($1,2,$2,$3,$4)', [w.id,'\ud83c\udfe0','Service 3','Description de votre troisieme service']); await queryOne('UPDATE websites SET published=false, status=$2 WHERE id=$1', [w.id, 'published']); } } else { await queryOne('INSERT INTO services_offered (website_id,display_order,emoji,title,description) VALUES ($1,0,$2,$3,$4)', [w.id,'\u26a1','Service 1','Description de votre premier service']); await queryOne('INSERT INTO services_offered (website_id,display_order,emoji,title,description) VALUES ($1,1,$2,$3,$4)', [w.id,'\ud83d\udd27','Service 2','Description de votre deuxieme service']); await queryOne('INSERT INTO services_offered (website_id,display_order,emoji,title,description) VALUES ($1,2,$2,$3,$4)', [w.id,'\ud83c\udfe0','Service 3','Description de votre troisieme service']); await queryOne('UPDATE websites SET published=false, status=$2 WHERE id=$1', [w.id, 'draft']); } req.session.professionalId = pro.id; req.session.siteId = w.id; res.json({ success: true, user: { id: pro.id, firstname: pro.firstname, email: pro.email, plan: pro.plan }, siteId: w.id }); } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); } });


app.post('/api/auth/login', authLimiter, async function(req, res) { try { var b = req.body; if (!b.email || !b.password) return res.status(400).json({ error: 'Champs manquants' }); var pro = await queryOne('SELECT * FROM professionals WHERE email = $1', [b.email.toLowerCase().trim()]); if (!pro) return res.status(401).json({ error: 'Email ou mot de passe incorrect' }); var valid = await bcrypt.compare(b.password, pro.password_hash); if (!valid) return res.status(401).json({ error: 'Email ou mot de passe incorrect' }); var w = await queryOne('SELECT id FROM websites WHERE professional_id = $1', [pro.id]); req.session.professionalId = pro.id; req.session.siteId = w ? w.id : null; res.json({ success: true, user: { id: pro.id, firstname: pro.firstname, email: pro.email, plan: pro.plan }, siteId: w ? w.id : null }); } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); } });
app.get('/auth', function(req,res){ res.sendFile(path.join(__dirname,'..','public','pages','auth.html')); });
app.post('/api/auth/logout', function(req, res) { req.session.destroy(function() { res.clearCookie('connect.sid'); res.json({ success: true }); }); });
app.get('/api/auth/me', requireAuth, async function(req, res) { try { var pro = await queryOne('SELECT * FROM professionals WHERE id = $1', [req.session.professionalId]); if (!pro) return res.status(404).json({ error: 'Introuvable' }); res.json({ id: pro.id, firstname: pro.firstname, lastname: pro.lastname, email: pro.email, plan: pro.plan, metier: pro.trade }); } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); } });
app.get('/api/site', requireAuth, async function(req, res) { try { var w = await queryOne('SELECT * FROM websites WHERE professional_id = $1', [req.session.professionalId]); if (!w) return res.json(null); var services = await queryAll('SELECT * FROM services_offered WHERE website_id = $1 ORDER BY display_order ASC', [w.id]); var pro = await queryOne('SELECT trade, phone FROM professionals WHERE id = $1', [req.session.professionalId]); var svcList = services.map(function(s) { return { id: s.id, icon: s.emoji || '⚡', title: s.title, desc: s.description || '', price: s.price || '', image: s.image_path || '', aiGenerated: s.ai_generated || false }; }); res.json({ id: w.id, slug: w.slug, published: w.published, content: { name: w.business_name || '', tagline: w.tagline || '', description: w.description || '', metier: (pro && pro.trade) || '', city: w.city || '', phone: (pro && pro.phone) || '', email: w.contact_email || '', ctaText: w.cta_text || 'Prendre RDV gratuitement', ctaUrl: w.cta_url || '', services: svcList, socialLinks: { facebook: w.social_facebook || '', instagram: w.social_instagram || '', whatsapp: w.social_whatsapp || '' } }, design: { primaryColor: w.brand_color || '#1A6BFF', fontFamily: w.font_family || 'Syne', theme: w.theme || 'light', template: w.template || 'moderne', buttonRadius: w.button_radius || 50, showServices: w.show_services !== false, showContact: w.show_contact !== false, showReviews: w.show_reviews !== false }, seo: { title: w.seo_title || '', description: w.seo_description || '', keywords: w.seo_keywords || '', googleVerification: w.seo_google_verification || '' }, domain: { subdomain: w.slug || '', customDomain: w.custom_domain || '' }, stats: { visits: w.total_visits || 0, clicks: w.total_clicks || 0 } }); } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); } });
app.put('/api/site/content', requireAuth, async function(req, res) { try { var b = req.body; var w = await queryOne('SELECT id FROM websites WHERE professional_id = $1', [req.session.professionalId]); if (!w) return res.status(404).json({ error: 'Site introuvable' }); await queryOne('UPDATE websites SET business_name=$1, tagline=$2, description=$3, city=$4, contact_email=$5, cta_text=$6, cta_url=$7, social_facebook=$8, social_instagram=$9, social_whatsapp=$10 WHERE id=$11', [b.name||'', b.tagline||'', b.description||'', b.city||'', b.email||'', b.ctaText||'', b.ctaUrl||'', (b.socialLinks&&b.socialLinks.facebook)||'', (b.socialLinks&&b.socialLinks.instagram)||'', (b.socialLinks&&b.socialLinks.whatsapp)||'', w.id]); if (b.metier) await queryOne('UPDATE professionals SET trade=$1 WHERE id=$2', [b.metier, req.session.professionalId]); if (b.phone) await queryOne('UPDATE professionals SET phone=$1 WHERE id=$2', [b.phone, req.session.professionalId]); if (b.services) { await query('DELETE FROM services_offered WHERE website_id=$1', [w.id]); for (var i=0; i<b.services.length; i++) { var s=b.services[i]; await queryOne('INSERT INTO services_offered (website_id,display_order,emoji,title,description,price,image_path,ai_generated) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [w.id, i, s.icon||'⚡', s.title||'', s.desc||'', s.price||'', s.image||'', s.aiGenerated||false]); } } var services = await queryAll('SELECT * FROM services_offered WHERE website_id=$1 ORDER BY display_order ASC', [w.id]); var svcList = services.map(function(s) { return { id:s.id, icon:s.emoji, title:s.title, desc:s.description||'', price:s.price||'', image:s.image_path||'', aiGenerated:s.ai_generated||false }; }); res.json({ success:true, content: { name:b.name, tagline:b.tagline, description:b.description, metier:b.metier, city:b.city, phone:b.phone, email:b.email, ctaText:b.ctaText, ctaUrl:b.ctaUrl, services:svcList, socialLinks:b.socialLinks||{} } }); } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); } });
app.put('/api/site/design', requireAuth, async function(req, res) { try { var b=req.body; await queryOne('UPDATE websites SET brand_color=$1, font_family=$2, theme=$3, button_radius=$4, show_services=$5, show_contact=$6, show_reviews=$7 WHERE professional_id=$8', [b.primaryColor||'#1A6BFF', b.fontFamily||'Syne', b.theme||'light', b.buttonRadius||50, b.showServices!==false, b.showContact!==false, b.showReviews!==false, req.session.professionalId]); res.json({ success:true, design:b }); } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); } });
app.put('/api/site/seo', requireAuth, async function(req, res) { try { var b=req.body; await queryOne('UPDATE websites SET seo_title=$1, seo_description=$2, seo_keywords=$3, seo_google_verification=$4 WHERE professional_id=$5', [b.title||'', b.description||'', b.keywords||'', b.googleVerification||'', req.session.professionalId]); res.json({ success:true, seo:b }); } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); } });
app.put('/api/site/domain', requireAuth, async function(req, res) { try { var b=req.body; if (b.subdomain) { var c=b.subdomain.toLowerCase().replace(/[^a-z0-9-]/g,'').substring(0,80); var ex=await queryOne('SELECT id FROM websites WHERE slug=$1 AND professional_id!=$2', [c, req.session.professionalId]); if (ex) return res.status(409).json({ error:'Slug deja pris' }); await queryOne('UPDATE websites SET slug=$1 WHERE professional_id=$2', [c, req.session.professionalId]); } if (b.customDomain!==undefined) { await queryOne('UPDATE websites SET custom_domain=$1 WHERE professional_id=$2', [b.customDomain||'', req.session.professionalId]); } res.json({ success:true }); } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); } });
app.post('/api/site/publish', requireAuth, async function(req, res) { try { var pro=await queryOne('SELECT plan FROM professionals WHERE id=$1',[req.session.professionalId]); if(pro && (pro.plan==='Tester'||pro.plan==='gratuit'||!pro.plan)) return res.status(403).json({error:'Publication disponible uniquement sur un plan payant',upgrade:true}); var u=await queryOne('UPDATE websites SET published=NOT published, published_at=CASE WHEN NOT published THEN NOW() ELSE published_at END, status=CASE WHEN NOT published THEN $2 ELSE $3 END WHERE professional_id=$1 RETURNING *', [req.session.professionalId, 'published', 'draft']); res.json({ success:true, published:u.published }); } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); } });
app.put('/api/site/template', requireAuth, async function(req, res) { try { await queryOne('UPDATE websites SET template=$1 WHERE professional_id=$2', [req.body.template, req.session.professionalId]); res.json({ success:true }); } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); } });
app.post('/api/site/generate-desc', requireAuth, async function(req, res) { try { var b=req.body; var w=await queryOne('SELECT w.*, p.trade FROM websites w JOIN professionals p ON p.id=w.professional_id WHERE w.professional_id=$1', [req.session.professionalId]); var GROQ_KEY=process.env.GROQ_API_KEY; if (!GROQ_KEY) return res.status(500).json({ error:'Cle API IA non configuree' }); var prompt='Tu es un copywriter expert francais. Genere une description professionnelle de 2-3 phrases pour le service "'+(b.serviceTitle||b.title)+'" propose par un(e) '+(w.trade||'professionnel(le)')+'. Vouvoiement, ton pro et chaleureux.'; var response=await fetch('https://api.groq.com/openai/v1/chat/completions', { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+GROQ_KEY }, body:JSON.stringify({ model:'llama-3.3-70b-versatile', messages:[{role:'user',content:prompt}], max_tokens:256, temperature:0.7 }) }); var data=await response.json(); if (!data.choices||!data.choices[0]) return res.status(500).json({ error:'Erreur IA' }); res.json({ success:true, text:data.choices[0].message.content, description:data.choices[0].message.content }); } catch (err) { console.error(err); res.status(500).json({ error:'Erreur IA' }); } });
app.post('/api/site/service-image', requireAuth, async function(req, res) { try { var b=req.body; var color=b.brandColor||'#1A6BFF'; var title=b.title||'Service'; var svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="'+color+'" opacity="0.1" rx="12"/><circle cx="200" cy="120" r="40" fill="'+color+'" opacity="0.3"/><text x="200" y="220" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">'+title+'</text></svg>'; var filename='service-'+Date.now()+'.svg'; fs.writeFileSync(path.join(UPLOADS_DIR, filename), svg); res.json({ success:true, imagePath:'/uploads/'+filename }); } catch (err) { res.status(500).json({ error:'Erreur image' }); } });
app.get('/', async function(req, res) { var sub=getSubdomain(req); if(!sub){ return res.sendFile(path.join(__dirname,'..','public','index.html')); } try { var w=await queryOne('SELECT * FROM websites WHERE slug=$1 AND published=true AND (status IS NULL OR status NOT IN ($2,$3,$4))',[sub,'trial_expired','offline','paused']); if(!w) return res.sendFile(path.join(__dirname,'..','public','index.html')); var services=await queryAll('SELECT * FROM services_offered WHERE website_id=$1 ORDER BY display_order ASC',[w.id]); var pro=await queryOne('SELECT trade, phone FROM professionals WHERE id=$1',[w.professional_id]); var site={ content:{ name:w.business_name, tagline:w.tagline, description:w.description, metier:(pro&&pro.trade)||'', city:w.city||'', phone:(pro&&pro.phone)||'', email:w.contact_email||'', ctaText:w.cta_text||'', ctaUrl:w.cta_url||'', services:services.map(function(s){return{icon:s.emoji,title:s.title,desc:s.description,image:s.image_path};}), socialLinks:{facebook:w.social_facebook||'',instagram:w.social_instagram||'',whatsapp:w.social_whatsapp||''} }, design:{ primaryColor:w.brand_color||'#1A6BFF', fontFamily:w.font_family||'Syne', theme:w.theme||'light', buttonRadius:w.button_radius||50, showServices:w.show_services, showContact:w.show_contact, showReviews:w.show_reviews }, seo:{ title:w.seo_title||w.business_name, description:w.seo_description||'', keywords:w.seo_keywords||'', googleVerification:w.seo_google_verification||'' } }; res.send(renderSite(site, w.slug, w)); } catch(err){ console.error(err); res.status(500).send('<h1>Erreur serveur</h1>'); } });
app.get('/site/:slug', async function(req, res) { try { var w=await queryOne('SELECT * FROM websites WHERE slug=$1 AND published=true AND (status IS NULL OR status NOT IN ($2,$3,$4))', [req.params.slug,'trial_expired','offline','paused']); if (!w) return res.status(404).send('<h1>Site introuvable</h1>'); await query('UPDATE websites SET total_visits=total_visits+1 WHERE id=$1', [w.id]); var services=await queryAll('SELECT * FROM services_offered WHERE website_id=$1 ORDER BY display_order ASC', [w.id]); var pro=await queryOne('SELECT trade, phone FROM professionals WHERE id=$1', [w.professional_id]); var site={ content:{ name:w.business_name, tagline:w.tagline, description:w.description, metier:(pro&&pro.trade)||'', city:w.city||'', phone:(pro&&pro.phone)||'', email:w.contact_email||'', ctaText:w.cta_text||'', ctaUrl:w.cta_url||'', services:services.map(function(s){return{icon:s.emoji,title:s.title,desc:s.description,image:s.image_path};}), socialLinks:{facebook:w.social_facebook||'',instagram:w.social_instagram||'',whatsapp:w.social_whatsapp||''} }, design:{ primaryColor:w.brand_color||'#1A6BFF', fontFamily:w.font_family||'Syne', theme:w.theme||'light', buttonRadius:w.button_radius||50, showServices:w.show_services, showContact:w.show_contact, showReviews:w.show_reviews }, seo:{ title:w.seo_title||w.business_name, description:w.seo_description||'', keywords:w.seo_keywords||'', googleVerification:w.seo_google_verification||'' } }; res.send(renderSite(site, w.slug, w)); } catch(err) { console.error(err); res.status(500).send('<h1>Erreur serveur</h1>'); } });
app.get("/:trade/:citySlug", async function(req, res) { var sub=getSubdomain(req); if(!sub) return res.status(404).send("<h1>Page introuvable</h1>"); try { var w=await queryOne("SELECT * FROM websites WHERE slug=$1 AND published=true AND (status IS NULL OR status NOT IN ($2,$3,$4))",[sub,'trial_expired','offline','paused']); if(!w) return res.status(404).send("<h1>Site introuvable</h1>"); var city=await queryOne("SELECT * FROM local_seo_pages WHERE website_id=$1 AND city_slug=$2",[w.id,req.params.citySlug]); if(!city) return res.status(404).send("<h1>Page introuvable</h1>"); var services=await queryAll("SELECT * FROM services_offered WHERE website_id=$1 ORDER BY display_order ASC",[w.id]); var pro=await queryOne("SELECT trade,phone FROM professionals WHERE id=$1",[w.professional_id]); var svcHtml=""; if(services.length>0){svcHtml="<h2 style=\"font-family:"+(w.font_family||"Syne")+",sans-serif;font-size:1.5rem;font-weight:800;margin:32px 0 20px;\">Nos services a "+city.city_name+"</h2><div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;margin-bottom:32px;\">"; for(var i=0;i<services.length;i++){var s=services[i]; svcHtml+="<div style=\"background:#f8f9fa;border-radius:12px;padding:20px;text-align:center;border:1px solid #e9ecef;\"><div style=\"font-size:1.5rem;margin-bottom:6px;\">"+(s.emoji||"⚡")+"</div><h3 style=\"font-size:1rem;margin-bottom:6px;\">"+s.title+"</h3><p style=\"font-size:.85rem;color:#555;\">"+(s.description||"")+"</p></div>";} svcHtml+="</div>";} var contentHtml=""; if(city.full_content){var paras=city.full_content.split("\n"); for(var j=0;j<paras.length;j++){if(paras[j].trim())contentHtml+="<p style=\"margin-bottom:16px;\">"+paras[j]+"</p>";}} var color=w.brand_color||"#1A6BFF"; var font=w.font_family||"Syne"; var schema=JSON.stringify({"@context":"https://schema.org","@type":"LocalBusiness","name":w.business_name,"description":city.intro_paragraph||"","address":{"@type":"PostalAddress","addressLocality":city.city_name,"postalCode":city.postal_code||"","addressCountry":"FR"}}); res.send("<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>"+(city.seo_title||w.business_name+" a "+city.city_name)+"</title><meta name=\"description\" content=\""+(city.intro_paragraph||"")+"\"><link rel=\"canonical\" href=\"https://"+sub+".quickio.fr/"+(pro&&pro.trade||"professionnel").toLowerCase().replace(/[^a-z0-9]+/g,"-")+"/"+city.city_slug+"-"+(city.postal_code||"")+"\"><script type=\"application/ld+json\">"+schema+"</script><link href=\"https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500;600&display=swap\" rel=\"stylesheet\"><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:DM Sans,sans-serif;color:#0A0F1E;line-height:1.7;}h1,h2,h3{font-family:"+font+",sans-serif;}.hero{background:"+color+";color:white;padding:60px 6%;text-align:center;}.hero h1{font-size:2rem;margin-bottom:10px;}.hero p{opacity:0.9;max-width:600px;margin:0 auto;}.container{max-width:800px;margin:0 auto;padding:40px 20px;}.back-link{display:inline-block;margin-top:30px;color:"+color+";text-decoration:none;font-weight:600;}footer{text-align:center;padding:24px 20px;color:#888;font-size:.8rem;border-top:1px solid #eee;margin-top:40px;}</style></head><body><div class=\"hero\"><h1>"+(city.h1_heading||w.business_name+" a "+city.city_name)+"</h1><p>"+(city.intro_paragraph||"")+"</p></div><div class=\"container\">"+contentHtml+svcHtml+"<a class=\"back-link\" href=\"/\">← Retour au site principal</a></div><footer><a href=\"/villes\" style=\"color:inherit;text-decoration:none;\">"+w.business_name+"</a> — "+city.city_name+" — Propulse par Quickio</footer></body></html>"); } catch(err) { console.error(err); res.status(500).send("<h1>Erreur serveur</h1>"); } });
app.get("/villes", async function(req, res) { var sub=getSubdomain(req); if(!sub) return res.status(404).send("<h1>Page introuvable</h1>"); try { var w=await queryOne("SELECT * FROM websites WHERE slug=$1 AND published=true AND (status IS NULL OR status NOT IN ($2,$3,$4))",[sub,'trial_expired','offline','paused']); if(!w) return res.status(404).send("<h1>Site introuvable</h1>"); var cities=await queryAll("SELECT * FROM local_seo_pages WHERE website_id=$1 AND is_generated=true ORDER BY city_name ASC",[w.id]); var pro=await queryOne("SELECT trade FROM professionals WHERE id=$1",[w.professional_id]); var color=w.brand_color||"#1A6BFF"; var font=w.font_family||"Syne"; var trade=(pro&&pro.trade||"professionnel").toLowerCase().replace(/[^a-z0-9]+/g,"-"); var citiesHtml=""; for(var i=0;i<cities.length;i++){var c=cities[i]; citiesHtml+="<a href=\"/"+trade+"/"+c.city_slug+"-"+(c.postal_code||"")+"\" style=\"display:block;padding:14px 18px;background:white;border:1px solid #E2E8F8;border-radius:12px;text-decoration:none;color:#0A0F1E;\"><div style=\"display:flex;justify-content:space-between;align-items:center;\"><div><strong>"+c.city_name+"</strong>"+(c.postal_code?" <span style=\"color:#888;font-size:.8rem;\">("+c.postal_code+")</span>":"")+"</div><span style=\"color:"+color+";\">Voir →</span></div></a>";} res.send("<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>"+w.business_name+" — Zones d intervention</title><link href=\"https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500;600&display=swap\" rel=\"stylesheet\"><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:DM Sans,sans-serif;color:#0A0F1E;}h1,h2{font-family:"+font+",sans-serif;}.hero{background:"+color+";color:white;padding:60px 6%;text-align:center;}.hero h1{font-size:2rem;margin-bottom:10px;}.container{max-width:800px;margin:0 auto;padding:40px 20px;}.cities-grid{display:flex;flex-direction:column;gap:10px;margin-top:24px;}footer{text-align:center;padding:24px 20px;color:#888;font-size:.8rem;border-top:1px solid #eee;margin-top:40px;}</style></head><body><div class=\"hero\"><h1>"+w.business_name+"</h1><p>Nos zones d intervention</p></div><div class=\"container\"><h2>"+cities.length+" villes desservies</h2><div class=\"cities-grid\">"+citiesHtml+"</div><a href=\"/\" style=\"display:inline-block;margin-top:30px;color:"+color+";text-decoration:none;font-weight:600;\">← Retour au site</a></div><footer>"+w.business_name+" — Propulse par Quickio</footer></body></html>"); } catch(err) { console.error(err); res.status(500).send("<h1>Erreur serveur</h1>"); } });
app.get("/site/:slug/villes", async function(req, res) { try { var w=await queryOne("SELECT * FROM websites WHERE slug=$1 AND published=true AND (status IS NULL OR status NOT IN ($2,$3,$4))",[req.params.slug,'trial_expired','offline','paused']); if (!w) return res.status(404).send("<h1>Site introuvable</h1>"); var cities=await queryAll("SELECT * FROM local_seo_pages WHERE website_id=$1 AND is_generated=true ORDER BY city_name ASC",[w.id]); var pro=await queryOne("SELECT trade FROM professionals WHERE id=$1",[w.professional_id]); var color=w.brand_color||"#1A6BFF"; var font=w.font_family||"Syne"; var isDark=w.theme==="dark"; var bg=isDark?"#0A0F1E":"#fff"; var fg=isDark?"#fff":"#0A0F1E"; var border=isDark?"rgba(255,255,255,0.08)":"#E2E8F8"; var cardBg=isDark?"#1a2540":"white"; var citiesHtml=""; for(var i=0;i<cities.length;i++){var c=cities[i]; citiesHtml+="<a href=\"/site/"+w.slug+"/"+c.city_slug+"\" style=\"display:block;padding:14px 18px;background:"+cardBg+";border:1px solid "+border+";border-radius:12px;text-decoration:none;color:"+fg+";transition:all .2s;\"><div style=\"display:flex;justify-content:space-between;align-items:center;\"><div><strong style=\"font-size:.95rem;\">"+c.city_name+"</strong>"+(c.postal_code?" <span style=\"font-size:.8rem;color:#888;\">("+c.postal_code+")</span>":"")+(c.department?" <span style=\"font-size:.75rem;color:#aaa;\">— "+c.department+"</span>":"")+"</div><span style=\"color:"+color+";font-size:.85rem;\">Voir →</span></div>"+(c.intro_paragraph?"<p style=\"font-size:.82rem;color:#666;margin-top:6px;line-height:1.5;\">"+c.intro_paragraph.substring(0,120)+"...</p>":"")+"</a>";} var schema=JSON.stringify({"@context":"https://schema.org","@type":"LocalBusiness","name":w.business_name,"description":(pro&&pro.trade||"Professionnel")+" intervenant dans "+cities.length+" villes"}); res.send("<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>"+w.business_name+" — Zones d intervention</title><meta name=\"description\" content=\""+w.business_name+", "+(pro&&pro.trade||"professionnel")+" intervenant dans "+cities.length+" villes.\"><script type=\"application/ld+json\">"+schema+"</script><link href=\"https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500;600&display=swap\" rel=\"stylesheet\"><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:DM Sans,sans-serif;background:"+bg+";color:"+fg+";}h1,h2{font-family:"+font+",sans-serif;}.hero{background:"+color+";color:white;padding:60px 6%;text-align:center;}.hero h1{font-size:2rem;margin-bottom:10px;}.hero p{opacity:0.9;}.container{max-width:800px;margin:0 auto;padding:40px 20px;}.cities-grid{display:flex;flex-direction:column;gap:10px;margin-top:24px;}.back-link{display:inline-block;margin-top:30px;color:"+color+";text-decoration:none;font-weight:600;}footer{text-align:center;padding:24px 20px;color:#888;font-size:.8rem;border-top:1px solid "+border+";margin-top:40px;}</style></head><body><div class=\"hero\"><h1>"+w.business_name+"</h1><p>"+(pro&&pro.trade||"Professionnel")+" — Nos zones d intervention</p></div><div class=\"container\"><h2 style=\"font-size:1.4rem;margin-bottom:8px;\">"+cities.length+" villes desservies</h2><p style=\"color:#666;font-size:.9rem;margin-bottom:20px;\">Retrouvez nos services dans chacune de ces communes.</p><div class=\"cities-grid\">"+citiesHtml+"</div><a class=\"back-link\" href=\"/site/"+w.slug+"\">← Retour au site principal</a></div><footer><a href=\"/site/"+w.slug+"\" style=\"color:"+color+";text-decoration:none;\">"+w.business_name+"</a> — Propulse par Quickio</footer></body></html>"); } catch(err) { console.error(err); res.status(500).send("<h1>Erreur serveur</h1>"); } });
app.get("/site/:slug/:citySlug", async function(req, res) { try { var w=await queryOne("SELECT * FROM websites WHERE slug=$1 AND published=true AND (status IS NULL OR status NOT IN ($2,$3,$4))",[req.params.slug,'trial_expired','offline','paused']); if (!w) return res.status(404).send("<h1>Site introuvable</h1>"); var city=await queryOne("SELECT * FROM local_seo_pages WHERE website_id=$1 AND city_slug=$2",[w.id,req.params.citySlug]); if (!city) return res.status(404).send("<h1>Page introuvable</h1>"); var services=await queryAll("SELECT * FROM services_offered WHERE website_id=$1 ORDER BY display_order ASC",[w.id]); var pro=await queryOne("SELECT trade,phone FROM professionals WHERE id=$1",[w.professional_id]); var svcHtml=""; if(services.length>0){svcHtml="<h2 class=\"section-title\">Nos services a "+city.city_name+"</h2><div class=\"services-grid\">"; for(var i=0;i<services.length;i++){var s=services[i]; svcHtml+="<div class=\"service-card\"><div class=\"s-icon\">"+(s.emoji||"⚡")+"</div><h3>"+s.title+"</h3><p>"+(s.description||"")+"</p></div>";} svcHtml+="</div>";} var contentHtml=""; if(city.full_content){var paras=city.full_content.split("\n"); for(var j=0;j<paras.length;j++){if(paras[j].trim())contentHtml+="<p>"+paras[j]+"</p>";}} var schema=JSON.stringify({"@context":"https://schema.org","@type":"LocalBusiness","name":w.business_name,"description":city.intro_paragraph||"","address":{"@type":"PostalAddress","addressLocality":city.city_name,"postalCode":city.postal_code||"","addressCountry":"FR"}}); var color=w.brand_color||"#1A6BFF"; var font=w.font_family||"Syne"; res.send("<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>"+(city.seo_title||w.business_name+" a "+city.city_name)+"</title><meta name=\"description\" content=\""+(city.intro_paragraph||"")+"\"><link rel=\"canonical\" href=\"https://quickio.fr/site/"+w.slug+"/"+city.city_slug+"\"><script type=\"application/ld+json\">"+schema+"</script><link href=\"https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@400;500;600&display=swap\" rel=\"stylesheet\"><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:DM Sans,sans-serif;color:#0A0F1E;line-height:1.7;}h1,h2,h3{font-family:"+font+",sans-serif;}.hero{background:"+color+";color:white;padding:60px 6%;text-align:center;}.hero h1{font-size:2rem;margin-bottom:10px;}.hero p{opacity:0.9;max-width:600px;margin:0 auto;}.container{max-width:800px;margin:0 auto;padding:40px 20px;}.content p{margin-bottom:16px;font-size:1rem;color:#333;}.section-title{font-size:1.5rem;font-weight:800;margin:32px 0 20px;}.services-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;margin-bottom:32px;}.service-card{background:#f8f9fa;border-radius:12px;padding:20px;text-align:center;border:1px solid #e9ecef;}.s-icon{font-size:1.5rem;margin-bottom:6px;}.service-card h3{font-size:1rem;margin-bottom:6px;}.service-card p{font-size:.85rem;color:#555;}.back-link{display:inline-block;margin-top:30px;color:"+color+";text-decoration:none;font-weight:600;}footer{text-align:center;padding:24px 20px;color:#888;font-size:.8rem;border-top:1px solid #eee;margin-top:40px;}</style></head><body><div class=\"hero\"><h1>"+(city.h1_heading||w.business_name+" a "+city.city_name)+"</h1><p>"+(city.intro_paragraph||"")+"</p></div><div class=\"container\"><div class=\"content\">"+contentHtml+"</div>"+svcHtml+"<a class=\"back-link\" href=\"/site/"+w.slug+"\">← Retour au site principal</a></div><footer>"+w.business_name+" — "+city.city_name+" — Propulse par Quickio</footer></body></html>"); } catch(err) { console.error(err); res.status(500).send("<h1>Erreur serveur</h1>"); } });
app.get('/api/site/preview', requireAuth, async function(req, res) { try { var w=await queryOne('SELECT * FROM websites WHERE professional_id=$1', [req.session.professionalId]); if (!w) return res.status(404).send('<h1>Site introuvable</h1>'); var services=await queryAll('SELECT * FROM services_offered WHERE website_id=$1 ORDER BY display_order ASC', [w.id]); var pro=await queryOne('SELECT trade, phone FROM professionals WHERE id=$1', [req.session.professionalId]); var site={ content:{ name:w.business_name, tagline:w.tagline, description:w.description, metier:(pro&&pro.trade)||'', city:w.city||'', phone:(pro&&pro.phone)||'', email:w.contact_email||'', ctaText:w.cta_text||'', ctaUrl:w.cta_url||'', services:services.map(function(s){return{icon:s.emoji,title:s.title,desc:s.description,image:s.image_path};}), socialLinks:{facebook:w.social_facebook||'',instagram:w.social_instagram||'',whatsapp:w.social_whatsapp||''} }, design:{ primaryColor:w.brand_color||'#1A6BFF', fontFamily:w.font_family||'Syne', theme:w.theme||'light', buttonRadius:w.button_radius||50, showServices:w.show_services, showContact:w.show_contact, showReviews:w.show_reviews }, seo:{ title:w.seo_title||w.business_name, description:w.seo_description||'', keywords:w.seo_keywords||'', googleVerification:w.seo_google_verification||'' } }; res.send(renderSite(site, w.slug, w)); } catch(err) { res.status(500).send('<h1>Erreur serveur</h1>'); } });

function checkUrl(url) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const lib    = parsed.protocol === 'https:' ? https_mod : http_mod;
      const req    = lib.request({ method:'HEAD', hostname:parsed.hostname, path:parsed.pathname+parsed.search, headers:{'User-Agent':'Quickio/1.0'}, timeout:5000 }, r => resolve(r.statusCode >= 200 && r.statusCode < 400));
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    } catch { resolve(false); }
  });
}
function extractDomain(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }

// ── FAQ ───────────────────────────────────────────────────────────
app.get('/api/sites/:websiteId/faq', async function(req, res) {
  try {
    if (!req.params.websiteId || req.params.websiteId === 'undefined') return res.status(400).json({ error: 'websiteId manquant' });
    const { rows } = await pool.query(
      'SELECT w.faq_cache, w.faq_generated_at, w.business_name, p.trade, w.city FROM websites w JOIN professionals p ON p.id=w.professional_id WHERE w.id=$1',
      [req.params.websiteId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Site non trouvé' });
    const site = rows[0];
    const age  = site.faq_generated_at ? Date.now() - new Date(site.faq_generated_at).getTime() : Infinity;
    if (site.faq_cache && age < 30*24*60*60*1000) return res.json(site.faq_cache);
    const faq = await generateFaq(site);
    await pool.query('UPDATE websites SET faq_cache=$1, faq_generated_at=NOW() WHERE id=$2', [JSON.stringify(faq), req.params.websiteId]);
    res.json(faq);
  } catch(err) { console.error('[FAQ]', err); res.status(500).json({ error: 'Erreur FAQ' }); }
});

async function generateFaq({ business_name, trade, description, city }) {
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY manquante');
  const prompt = `Tu es un expert SEO spécialisé dans les sites vitrine de professionnels locaux.
Génère exactement 3 questions-réponses FAQ pour ce professionnel.
Professionnel : ${business_name}
Secteur : ${trade || 'Non précisé'}
Description : ${description || 'Non précisée'}
Ville : ${city || 'France'}
Règles :
- Questions que se posent vraiment les clients avant de contacter ce pro
- Réponses utiles, rassurantes, précises (150-250 mots)
- Intègre naturellement le secteur et la ville pour le SEO local
- Pour chaque question, propose UN lien externe vers une source officielle (service-public.fr, legifrance.fr, ademe.fr, anah.fr, ameli.fr, inrs.fr...)
- Le lien doit être pertinent avec le sujet de la question
Réponds UNIQUEMENT avec un tableau JSON valide :
[{ "question":"...","answer":"...","source_url":"https://...","source_label":"..." }]
`.trim();
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+GROQ_KEY },
    body: JSON.stringify({ model:'llama-3.3-70b-versatile', messages:[{role:'system',content:'JSON valide uniquement.'},{role:'user',content:prompt}], temperature:0.45, max_tokens:1600 })
  });
  const data = await r.json();
  if (!data.choices || !data.choices[0]) throw new Error('Groq no response');
  const raw  = data.choices[0].message.content.trim().replace(/^```json\s*/i,'').replace(/```\s*$/,'').trim();
  let items  = JSON.parse(raw);
  if (!Array.isArray(items) || items.length < 3) throw new Error('FAQ malformée');
  return Promise.all(items.slice(0,3).map(async item => {
    const entry = { question: String(item.question||'').trim(), answer: String(item.answer||'').trim(), source_url: null, source_label: null };
    if (item.source_url) {
      try { new URL(item.source_url); const ok = await checkUrl(item.source_url); if (ok) { entry.source_url = item.source_url; entry.source_label = item.source_label || extractDomain(item.source_url); } } catch {}
    }
    return entry;
  }));
}

// ── MARQUES ───────────────────────────────────────────────────────
app.get('/api/sites/:websiteId/brands', async function(req, res) {
  try {
    if (!req.params.websiteId || req.params.websiteId === 'undefined') return res.json([]);
    const { rows } = await pool.query('SELECT * FROM brands WHERE website_id=$1 ORDER BY position ASC', [req.params.websiteId]);
    res.json(rows);
  } catch(err) { console.error('[brands]', err.message); res.json([]); }
});
app.post('/api/sites/:websiteId/brands', requireAuth, async function(req, res) {
  const w = await pool.query('SELECT id FROM websites WHERE id=$1 AND professional_id=$2', [req.params.websiteId, req.session.professionalId]);
  if (!w.rows.length) return res.status(403).json({ error: 'Accès refusé' });
  const { name, logo_url, website_url } = req.body;
  const { rows } = await pool.query('INSERT INTO brands (website_id,name,logo_url,website_url) VALUES ($1,$2,$3,$4) RETURNING *', [req.params.websiteId, name, logo_url||null, website_url||null]);
  res.json(rows[0]);
});
app.delete('/api/sites/:websiteId/brands/:id', requireAuth, async function(req, res) {
  await pool.query('DELETE FROM brands WHERE id=$1 AND website_id=$2', [req.params.id, req.params.websiteId]);
  res.json({ success: true });
});

// ── CARTE OSM ─────────────────────────────────────────────────────
app.get('/api/sites/:websiteId/map-data', async function(req, res) {
  try {
    const { rows } = await pool.query('SELECT w.city, w.geocode, w.business_name FROM websites w WHERE w.id=$1', [req.params.websiteId]);
    if (!rows.length) return res.status(404).json({});
    const site = rows[0];
    let geo = site.geocode;
    if (!geo && site.city) {
      const r = await httpsGet('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(site.city + ', France'));
      const results = JSON.parse(r);
      if (results[0]) {
        geo = { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
        await pool.query('UPDATE websites SET geocode=$1 WHERE id=$2', [JSON.stringify(geo), req.params.websiteId]);
      }
    }
    res.json({ name: site.business_name, city: site.city, lat: geo&&geo.lat, lng: geo&&geo.lng, type: 'home' });
  } catch(err) { res.status(500).json({ error: 'Erreur carte' }); }
});

// ── GOOGLE RATING ────────────────────────────────────────────────
app.get('/api/sites/:websiteId/google-rating', async function(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT google_place_id,google_rating,google_review_count,google_maps_url,google_reviews,google_synced_at,opening_hours_text,opening_hours_override,w.business_name,w.city FROM websites w JOIN professionals p ON p.id=w.professional_id WHERE w.id=$1',
      [req.params.websiteId]
    );
    if (!rows.length) return res.status(404).json({});
    const row = rows[0];
    if ((Date.now() - new Date(row.google_synced_at||0)) > 86400000 && row.business_name)
      syncGoogle(req.params.websiteId, row.business_name, row.city).catch(()=>{});
    if (!row.google_rating) return res.json({ found: false });
    res.json({
      found: true,
      google_rating: row.google_rating,
      google_review_count: row.google_review_count,
      google_maps_url: row.google_maps_url,
      google_reviews: row.google_reviews || [],
      opening_hours: row.opening_hours_override || row.opening_hours_text || null,
    });
  } catch(err) { res.status(500).json({ error: 'Erreur' }); }
});

app.post('/api/sites/:websiteId/google-rating/sync', async function(req, res) {
  const { rows } = await pool.query('SELECT p.business_name, w.city FROM websites w JOIN professionals p ON p.id=w.professional_id WHERE w.id=$1 AND p.id=$2', [req.params.websiteId, req.session.professionalId]);
  if (!rows.length) return res.status(403).json({ error: 'Accès refusé' });
  const result = await syncGoogle(req.params.websiteId, req.body.business_name||rows[0].business_name, req.body.city||rows[0].city);
  if (!result) return res.status(404).json({ found: false, message: 'Aucune fiche Google trouvée.' });
  res.json({ found: true, ...result });
});

app.patch('/api/sites/:websiteId/opening-hours', requireAuth, async function(req, res) {
  await pool.query('UPDATE websites SET opening_hours_override=$1 WHERE id=$2', [req.body.opening_hours||null, req.params.websiteId]);
  res.json({ success: true });
});

async function syncGoogle(websiteId, businessName, city) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;
  try {
    const q      = encodeURIComponent((businessName+' '+(city||'')).trim());
    const found  = JSON.parse(await httpsGet('https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input='+q+'&inputtype=textquery&fields=place_id,rating,user_ratings_total&language=fr&key='+apiKey)).candidates?.[0];
    if (!found?.rating) return null;
    const detail = JSON.parse(await httpsGet('https://maps.googleapis.com/maps/api/place/details/json?place_id='+found.place_id+'&fields=reviews,url,opening_hours&language=fr&reviews_sort=newest&key='+apiKey)).result||{};
    const reviews = (detail.reviews||[]).filter(r=>r.text?.trim().length>10).slice(0,5).map(r=>({
      author_name:r.author_name, initials:r.author_name.slice(0,2).toUpperCase(),
      rating:r.rating, stars_filled:Array(r.rating).fill(null), stars_empty:Array(5-r.rating).fill(null),
      text:r.text.trim(), relative_time:r.relative_time_description||''
    }));
    const opening_hours_text = formatOpeningHours(detail.opening_hours?.periods);
    const mapsUrl = detail.url || 'https://www.google.com/maps/search/?api=1&query='+q;
    await pool.query('UPDATE websites SET google_place_id=$1,google_rating=$2,google_review_count=$3,google_maps_url=$4,google_reviews=$5,opening_hours_text=$6,google_synced_at=NOW() WHERE id=$7',
      [found.place_id, found.rating, found.user_ratings_total||0, mapsUrl, JSON.stringify(reviews), opening_hours_text, websiteId]);
    return { google_rating:found.rating, google_review_count:found.user_ratings_total, google_maps_url:mapsUrl, google_reviews:reviews, opening_hours_text };
  } catch(e) { console.error('[Google]', e); return null; }
}

function formatOpeningHours(periods) {
  if (!periods?.length) return null;
  const DAYS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const fmt  = t => { const h=parseInt(t.slice(0,2)),m=t.slice(2); return m==='00'?h+'h':h+'h'+m; };
  const byH  = {};
  for (const p of periods) {
    if (!p.open||!p.close) continue;
    const k = p.open.time+'|'+p.close.time;
    (byH[k]=byH[k]||{open:p.open.time,close:p.close.time,days:[]}).days.push(p.open.day);
  }
  return Object.values(byH).map(({open,close,days}) => {
    days.sort();
    const ranges=[]; let s=days[0],pv=days[0];
    for (let i=1;i<days.length;i++) { if(days[i]===pv+1){pv=days[i];}else{ranges.push(s===pv?DAYS[s]:DAYS[s]+'–'+DAYS[pv]);s=pv=days[i];} }
    ranges.push(s===pv?DAYS[s]:DAYS[s]+'–'+DAYS[pv]);
    return ranges.join(', ')+' '+fmt(open)+'–'+fmt(close);
  }).join(' / ');
}

// ── CONTACT LEADS ────────────────────────────────────────────────
app.post('/api/sites/:websiteId/contact', async function(req, res) {
  try {
    const { name, email, phone, message } = req.body;
    await pool.query('INSERT INTO contact_leads (website_id,name,email,phone,message) VALUES ($1,$2,$3,$4,$5)', [req.params.websiteId, name, email, phone, message]);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: 'Erreur envoi' }); }
});

// ── UPLOAD LOGO ───────────────────────────────────────────────────
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5*1024*1024 }, fileFilter: (req,file,cb) => { ['image/jpeg','image/png','image/webp','image/svg+xml'].includes(file.mimetype)?cb(null,true):cb(new Error('Format non supporté')); } });

app.post('/api/pro/sites/:websiteId/logo', requireAuth, logoUpload.single('logo'), async function(req, res) {
  try {
    const { rows } = await pool.query('SELECT id FROM websites WHERE id=$1 AND professional_id=$2', [req.params.websiteId, req.session.professionalId]);
    if (!rows.length) return res.status(403).json({ error: 'Accès refusé' });
    if (!req.file)    return res.status(400).json({ error: 'Aucun fichier' });
    const filename = 'logo_'+req.params.websiteId+'_'+Date.now();
    const ext      = req.file.mimetype === 'image/svg+xml' ? '.svg' : '.png';
    const filePath = path.join(UPLOADS_DIR_LOGO, filename+ext);
    fs.writeFileSync(filePath, req.file.buffer);
    const logo_url = '/uploads/logos/'+filename+ext;
    await pool.query('UPDATE websites SET logo_url=$1 WHERE id=$2', [logo_url, req.params.websiteId]);
    res.json({ success: true, logo_url });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/pro/sites/:websiteId/logo', requireAuth, async function(req, res) {
  const { rows } = await pool.query('SELECT logo_url FROM websites WHERE id=$1 AND professional_id=$2', [req.params.websiteId, req.session.professionalId]);
  if (!rows.length) return res.status(403).json({ error: 'Accès refusé' });
  if (rows[0].logo_url) {
    const p = path.join(__dirname,'..','public',rows[0].logo_url);
    try { fs.unlinkSync(p); } catch {}
    await pool.query('UPDATE websites SET logo_url=NULL WHERE id=$1', [req.params.websiteId]);
  }
  res.json({ success: true });
});

app.get('/api/pro/sites/:websiteId/logo', requireAuth, async function(req, res) {
  const { rows } = await pool.query('SELECT logo_url FROM websites WHERE id=$1', [req.params.websiteId]);
  res.json({ logo_url: rows[0]?.logo_url || null });
});

/* FIN QUICKIO_PATCH_V1 */

app.listen(PORT, '0.0.0.0', function() { console.log('Quickio demarre sur http://0.0.0.0:' + PORT); });

app.get('/tarifs', (req,res) => res.sendFile(path.join(__dirname,'..','public','pages','tarifs.html')));
app.get('/dashboard', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'dashboard.html'));
});

app.get('/editor', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'editor.html'));
});

app.get('/templates', function(req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'templates.html'));
});

app.post('/api/auth/onboarding', requireAuth, async function(req, res) {
  try {
    var b = req.body;
    await queryOne('UPDATE professionals SET phone=$1, address=$2, siret=$3, partners=$4, google_place_name=$5, onboarding_done=true WHERE id=$6',
      [b.phone||'', b.address||'', b.siret||'', b.partners||'', b.googlePlaceName||'', req.session.professionalId]);
    if (b.city) await queryOne('UPDATE websites SET city=$1 WHERE professional_id=$2', [b.city, req.session.professionalId]);
    res.json({ success: true });
  } catch(err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/auth/onboarding-status', requireAuth, async function(req, res) {
  try {
    var pro = await queryOne('SELECT onboarding_done FROM professionals WHERE id=$1', [req.session.professionalId]);
    res.json({ done: pro ? pro.onboarding_done : false });
  } catch(err) { res.status(500).json({ error: 'Erreur serveur' }); }
});
