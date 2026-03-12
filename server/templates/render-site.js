// server/templates/render-site.js
// Remplace renderSite() — prépare les données et appelle le moteur de templates

const engine = require('./engine');

function renderSite(site, slug, websiteRow) {
  const c   = site.content;
  const d   = site.design;
  const seo = site.seo;
  const w   = websiteRow || {};

  // Couleurs
  const primary = d.primaryColor || '#1A6BFF';
  const accent  = shiftColor(primary, 20);

  // Services (3 premiers utilisés dans le template)
  const svcs = (c.services || []).slice(0, 6);
  const s1   = svcs[0] || {};
  const s2   = svcs[1] || {};
  const s3   = svcs[2] || {};

  // Étoiles Google
  const rating = parseFloat(w.google_rating) || 0;
  const stars_filled = Array(Math.round(rating)).fill(null);
  const stars_empty  = Array(5 - Math.round(rating)).fill(null);

  // Horaires
  const opening_hours = w.opening_hours_override || w.opening_hours_text || null;

  // Services footer
  const services_footer = svcs.slice(0, 4).map(s => ({
    label: s.title || s.icon || '',
    url:   '#services'
  }));

  const data = {
    // SEO
    seo_title:        seo.title || c.name,
    meta_description: seo.description || '',
    canonical_url:    'https://' + slug + '.quickio.fr',
    site_base_url:    'https://' + slug + '.quickio.fr',
    hero_image:       '/uploads/hero-default.jpg',
    department_code:  '',
    is_local_page:    false,
    local_city:       '',
    local_lat:        '',
    local_lng:        '',
    specialty_label:  c.metier || '',
    specialty_slug:   (c.metier || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),

    // Schémas
    opening_hours_schema: JSON.stringify([]),
    faq_schema_items:     null,

    // Couleurs
    primary_color: primary,
    accent_color:  accent,

    // Contenu
    business_name:       c.name || '',
    business_name_short: (c.name || '').split(' ')[0],
    city:                c.city || '',
    phone:               c.phone || '',
    cta_text:            c.ctaText || 'Prendre RDV gratuitement',
    cta_url:             c.ctaUrl  || '#contact',
    zone:                c.city || 'France',
    profession:          c.metier || 'professionnel',
    experience:          w.experience || '10 ans',
    logo_url:            w.logo_url || null,

    // Hero
    headline:          c.name || '',
    headline_location: c.metier ? c.metier + (c.city ? ' à ' + c.city : '') : c.city || '',
    hero_subtitle:     c.tagline || '',
    address:           c.city || '',
    postal_code:       '',
    lat:               w.geocode ? (w.geocode.lat || '') : '',
    lng:               w.geocode ? (w.geocode.lng || '') : '',

    // Services
    services_intro:        'Des prestations adaptées à vos besoins.',
    service_1_title:       s1.title || '',
    service_1_description: s1.desc  || '',
    service_1_image:       s1.image || '/uploads/service-default.jpg',
    service_1_point_1:     'Qualité',
    service_1_point_2:     'Rapidité',
    service_1_point_3:     'Garantie',
    service_1_short:       s1.title || 'service',
    service_2_title:       s2.title || '',
    service_2_description: s2.desc  || '',
    service_2_image:       s2.image || '/uploads/service-default.jpg',
    service_2_point_1:     'Sur mesure',
    service_2_point_2:     'Professionnel',
    service_2_point_3:     'Certifié',
    service_2_short:       s2.title || 'service',
    service_3_title:       s3.title || '',
    service_3_description: s3.desc  || '',
    service_3_image:       s3.image || '/uploads/service-default.jpg',
    service_3_point_1:     'Devis gratuit',
    service_3_point_2:     'Intervention rapide',
    service_3_point_3:     'Assurance pro',
    service_4_title:       (svcs[3] || {}).title || '',
    service_4_description: (svcs[3] || {}).desc  || '',
    service_4_image:       (svcs[3] || {}).image || '/uploads/service-default.jpg',
    service_5_title:       (svcs[4] || {}).title || '',
    service_5_description: (svcs[4] || {}).desc  || '',
    service_5_image:       (svcs[4] || {}).image || '/uploads/service-default.jpg',
    service_6_title:       (svcs[5] || {}).title || '',
    service_6_description: (svcs[5] || {}).desc  || '',
    service_6_image:       (svcs[5] || {}).image || '/uploads/service-default.jpg',
    all_services:          svcs,

    // Google
    google_rating:        w.google_rating || null,
    google_review_count:  w.google_review_count || 0,
    google_maps_url:      w.google_maps_url || '#',
    google_reviews:       w.google_reviews || [],
    google_stars_filled:  stars_filled,
    google_stars_empty:   stars_empty,

    // Modules
    modules: {
      gallery:      !!(w.modules && w.modules.gallery),
      brands:       true,  // toujours actif (chargé dynamiquement)
      contact_form: true
    },
    gallery:      [],
    brands:       [],
    brands_intro: 'Nous travaillons avec des partenaires sélectionnés pour leur qualité.',

    // Horaires
    opening_hours: opening_hours,

    // Atouts
    atout_1_text: 'Des années de pratique au service de votre satisfaction.',
    atout_2_text: 'Chaque intervention est réalisée avec soin et professionnalisme.',

    // Contact/footer
    specialty:          c.metier || '',
    footer_description: c.tagline || ('Professionnel ' + (c.metier || '') + ' à ' + (c.city || 'votre service')),
    services_footer:    services_footer,

    // ID site pour JS
    website_id: w.id || '',
  };

  // window.QUICKIO_SITE injecté pour le JS client
  const siteJs = `<script>window.QUICKIO_SITE=${JSON.stringify({
    website_id:    w.id,
    business_name: c.name,
    city:          c.city,
    lat:           data.lat,
    lng:           data.lng,
    page_type:     'home',
    address:       c.city || ''
  })};</script>`;

  const templateName = w.template || 'moderne';
  let html;
  try {
    html = engine.render(templateName, data);
  } catch(e) {
    console.error('[Template] Fallback moderne:', e.message);
    html = engine.render('moderne', data);
  }

  // Injecter window.QUICKIO_SITE avant </body>
  return html.replace('</body>', siteJs + '\n</body>');
}

function shiftColor(hex, amount) {
  // Assombrit légèrement la couleur primaire pour l'accent
  try {
    const n = parseInt(hex.replace('#',''), 16);
    const r = Math.min(255, (n >> 16) + amount);
    const g = Math.min(255, ((n >> 8) & 0xff) + amount);
    const b = Math.min(255, (n & 0xff) + amount);
    return '#' + [r,g,b].map(x => x.toString(16).padStart(2,'0')).join('');
  } catch { return hex; }
}

module.exports = { renderSite };
