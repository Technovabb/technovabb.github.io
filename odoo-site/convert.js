// Turns the static technovabb.com pages into a payload for Odoo's website builder.
//
//   node odoo-site/convert.js <repo root> <folder holding node_modules>
//
// Output: odoo-site/payload.json. It holds every page's body as XHTML (for the
// QWeb view arch), its SEO fields, the scoped site CSS for website.custom_code_head,
// the shared scripts for website.custom_code_footer, the list of images to upload
// and the old-URL -> new-URL redirects. Image links are left as placeholders:
//   tnasset:photos/x.jpg     -> /web/image/<id>/<name>       (filled in inside Odoo)
//   tnassetabs:photos/x.jpg  -> https://www.technovabb.com/web/image/<id>/<name>
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(process.argv[2] || '.');
const NM = process.argv[3] ? path.resolve(process.argv[3]) : null;
const need = (m) => require(NM ? path.join(NM, 'node_modules', m) : m);
const { JSDOM } = need('jsdom');
const postcss = need('postcss');
const prefixer = need('postcss-prefix-selector');

const OLD = 'https://technovabb.com';
const NEW = 'https://www.technovabb.com';
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const warnings = [];

// ---------- Pages and their new addresses ----------
const files = execSync('git ls-files "*.html"', { cwd: ROOT }).toString().trim().split('\n')
  .filter((f) => !f.startsWith('bimtix/'));
const newUrl = (f) => {
  if (f === 'index.html') return '/';
  if (f === 'terms.html') return '/terms-of-service'; // Odoo already owns /terms
  if (f.endsWith('/index.html')) return '/' + f.slice(0, -'/index.html'.length);
  return '/' + f.replace(/\.html$/, '');
};
const OLD2NEW = {};
const redirects = [];
for (const f of files) {
  const to = newUrl(f);
  OLD2NEW['/' + f] = to;
  if (f.endsWith('index.html')) OLD2NEW['/' + f.slice(0, -'index.html'.length)] = to;
  // Old addresses that need a 301 once the domain points at Odoo.
  if (to !== '/' + f) redirects.push({ from: '/' + f, to });
  if (f.endsWith('/index.html')) redirects.push({ from: '/' + f.slice(0, -'index.html'.length), to });
}

const assets = new Set();
const assetRef = (p, abs) => { assets.add(p); return (abs ? 'tnassetabs:' : 'tnasset:') + p; };

// Map one href/src as written in <file> to its Odoo address.
function mapUrl(href, file, opts = {}) {
  if (!href) return href;
  if (href === '#top') return '#tn-top';
  if (/^(#|tel:|mailto:|javascript:|data:|sms:)/i.test(href)) return href;
  let u;
  try { u = new URL(href, OLD + '/' + file); } catch { return href; }
  if (!/^(www\.)?technovabb\.com$/.test(u.host)) return href;
  const p = u.pathname;
  if (p.startsWith('/assets/')) return assetRef(p.slice('/assets/'.length), opts.abs);
  const to = OLD2NEW[p];
  if (to === undefined) { warnings.push(`${file}: no new address for ${href}`); return href; }
  const hash = u.hash === '#top' ? '#tn-top' : u.hash;
  return (opts.abs ? NEW + (to === '/' ? '/' : to) : to) + u.search + hash;
}

function mapCssUrls(css, file) {
  return css.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => {
    if (/^(data:|https?:\/\/fonts\.)/.test(u)) return m;
    return `url('${mapUrl(u, file)}')`;
  });
}

// Class and id names that Odoo's own CSS/JS already uses.
const CLASS_RENAMES = { badge: 'tn-badge', content: 'tn-content', logo: 'tn-logo', show: 'tn-show' };
const renameClass = (c) => (/^btn(-|$)/.test(c) ? 'tn-' + c : CLASS_RENAMES[c] || c);
function renameCssNames(css) {
  return css
    .replace(/\.btn((?:-[\w-]+)?)(?![\w-])/g, '.tn-btn$1')
    .replace(/\.(badge|content|logo|show)(?![\w-])/g, '.tn-$1')
    .replace(/#top(?![\w-])/g, '#tn-top');
}

// ---------- page.js (inner pages) ----------
const pageJs = read('assets/page.js');
const PH = JSON.parse(pageJs.match(/const ph=(\{[\s\S]*?\});/)[1]);

// ---------- The contact form, rebuilt as an Odoo website form (creates CRM leads) ----------
function odooContactForm(doc, old) {
  const topics = [...old.querySelectorAll('#cf-topic option')].map((o) => o.textContent);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const field = (inner, extra = '', type = 'char') =>
    `<div class="cf-fld s_website_form_field ${extra}" data-type="${type}" data-name="Field">${inner}</div>`;
  const label = (id, text) => `<label class="s_website_form_label" for="${id}"><span class="s_website_form_label_content">${text}</span></label>`;
  const html =
    `<form class="contact-form s_website_form" id="contactForm" action="/website/form/" method="post" enctype="multipart/form-data" data-model_name="crm.lead" data-success-mode="message" data-success-page="" novalidate="novalidate">` +
    `<h3>Send us a message</h3>` +
    // New leads go to the Sales team (id 1) and Juwan (user 2), so Odoo emails him about each one.
    `<input type="hidden" name="team_id" value="1"><input type="hidden" name="user_id" value="2">` +
    field(label('cf-name', 'Name') + `<input class="s_website_form_input" id="cf-name" name="contact_name" type="text" autocomplete="name" required="required">`, 's_website_form_required') +
    `<div class="cf-row">` +
    field(label('cf-email', 'Email') + `<input class="s_website_form_input" id="cf-email" name="email_from" type="email" autocomplete="email" required="required">`, 's_website_form_required', 'email') +
    field(label('cf-phone', 'Phone') + `<input class="s_website_form_input" id="cf-phone" name="phone" type="tel" autocomplete="tel">`, '', 'tel') +
    `</div>` +
    field(label('cf-topic', 'What do you need?') + `<select class="s_website_form_input" id="cf-topic" name="name" required="required">${topics.map((t) => `<option>${esc(t)}</option>`).join('')}</select>`, 's_website_form_required s_website_form_model_required', 'selection') +
    field(label('cf-message', 'Message') + `<textarea class="s_website_form_input" id="cf-message" name="description" required="required" placeholder="Tell us a little about your business and what you're looking for."></textarea>`, 's_website_form_required', 'text') +
    `<div class="s_website_form_submit"><button class="tn-btn tn-btn-orange s_website_form_send" type="submit" id="cfBtn">Send message →</button><span id="s_website_form_result"></span></div>` +
    `<p class="cf-note">Prefer email? Reach us any time at <a href="mailto:admin@technovabb.com">admin@technovabb.com</a></p>` +
    `</form>` +
    `<div class="contact-form s_website_form_end_message d-none"><h3>Message sent</h3><p class="cf-status tn-show ok">Thanks — your message has been sent. We’ll be in touch within one business day.</p><p class="cf-note">Anything urgent? Call or WhatsApp <a href="tel:+12462308303">(246) 230-8303</a>.</p></div>`;
  const tpl = doc.createElement('template');
  tpl.innerHTML = html;
  old.replaceWith(tpl.content);
}

// ---------- Support (Odoo Helpdesk) ----------
// The menu and footer link to /support, a page with a Helpdesk ticket form (team 1,
// "Tech Nova Support"). Clients follow their tickets from the emailed link or /my/tickets.
const HELPDESK_TEAM_ID = 1;
function addSupportLinks(doc, isHome) {
  const link = () => { const a = doc.createElement('a'); a.setAttribute('href', '/support'); a.textContent = 'Support'; return a; };
  if (isHome) {
    for (const a of doc.querySelectorAll('a')) if (a.textContent.trim() === 'Support') a.setAttribute('href', '/support');
    return;
  }
  const links = doc.querySelector('nav .links');
  if (links && ![...links.children].some((a) => a.textContent.trim() === 'Support')) links.appendChild(link());
  const explore = [...doc.querySelectorAll('footer h4')].find((h) => h.textContent.trim() === 'Explore');
  if (explore && ![...explore.parentElement.querySelectorAll('a')].some((a) => a.textContent.trim() === 'Support')) explore.parentElement.appendChild(link());
}

function supportPage(template, heroStyle) {
  const dom = new JSDOM(`<!doctype html><body>${template.arch}</body>`);
  const doc = dom.window.document;
  const wrap = doc.getElementById('wrap');
  wrap.setAttribute('data-page', 'support');
  for (const s of [...wrap.querySelectorAll('script')]) s.remove();
  const hero = doc.querySelector('header.subhero');
  if (heroStyle) hero.setAttribute('style', heroStyle);
  hero.querySelector('.crumb').textContent = 'Home / Support';
  hero.querySelector('h1').textContent = 'Support';
  hero.querySelector('p').textContent = "Report a problem or ask for help. We'll keep you updated by email until it's fixed.";
  const field = (id, label, input, extra = '', type = 'char') =>
    `<div class="tk-fld s_website_form_field ${extra}" data-type="${type}" data-name="Field">` +
    `<label class="s_website_form_label" for="${id}"><span class="s_website_form_label_content">${label}</span></label>${input}</div>`;
  const req = 's_website_form_required';
  doc.querySelector('.tn-main').innerHTML =
    `<section class="tn-content"><div class="shell content-grid"><div>` +
    `<h2>Open a support ticket</h2>` +
    `<p>Tell us what's wrong. Your ticket goes straight to our team, and we email you a link to follow its progress.</p>` +
    `<form class="tk-form s_website_form" id="ticketForm" action="/website/form/" method="post" enctype="multipart/form-data" data-model_name="helpdesk.ticket" data-success-mode="message" data-success-page="" novalidate="novalidate">` +
    `<input type="hidden" name="team_id" value="${HELPDESK_TEAM_ID}">` +
    `<div class="tk-row">` +
    field('tk-name', 'Your name', `<input class="s_website_form_input" id="tk-name" name="partner_name" type="text" autocomplete="name" required="required">`, req) +
    field('tk-company', 'Company', `<input class="s_website_form_input" id="tk-company" name="partner_company_name" type="text" autocomplete="organization">`) +
    `</div><div class="tk-row">` +
    field('tk-email', 'Email', `<input class="s_website_form_input" id="tk-email" name="partner_email" type="email" autocomplete="email" required="required">`, req, 'email') +
    field('tk-phone', 'Phone', `<input class="s_website_form_input" id="tk-phone" name="partner_phone" type="tel" autocomplete="tel">`, '', 'tel') +
    `</div>` +
    field('tk-subject', 'Subject', `<input class="s_website_form_input" id="tk-subject" name="name" type="text" required="required" placeholder="e.g. Wi-Fi down in the back office">`, `${req} s_website_form_model_required`) +
    field('tk-desc', "What's happening?", `<textarea class="s_website_form_input" id="tk-desc" name="description" required="required" placeholder="What stopped working, when it started, and where (site or room)."></textarea>`, req, 'text') +
    field('tk-file', 'Photo or file (optional)', `<input class="s_website_form_input" id="tk-file" name="attachment" type="file" multiple="multiple" data-max-files-number="5" data-max-file-size="10">`, '', 'binary') +
    `<div class="s_website_form_submit"><button class="tn-btn s_website_form_send" type="submit">Submit ticket →</button><span id="s_website_form_result"></span></div>` +
    `</form>` +
    `<div class="tk-form tk-end s_website_form_end_message d-none"><h3>Ticket received</h3>` +
    `<p>Thanks. We've emailed you your ticket number and a link to follow its progress. We'll be in touch within one business day.</p>` +
    `<p>Urgent? Call or WhatsApp <a href="tel:+12462308303">(246) 230-8303</a>.</p></div>` +
    `</div><aside class="side">` +
    `<h3>Track your tickets</h3>` +
    `<p class="tk-side-note">Every update is emailed to you. Have a Tech Nova account? See all your tickets in one place.</p>` +
    `<a href="/my/tickets">My tickets →</a>` +
    `<h3 class="tk-side-gap">Urgent?</h3>` +
    `<a href="tel:+12462308303">Call (246) 230-8303 →</a>` +
    `<a href="https://wa.me/12462308303?text=Hi%20Tech%20Nova%2C%20I%20need%20support.">WhatsApp us →</a>` +
    `<a href="/#plans">Support plans →</a>` +
    `</aside></div></section>`;
  const arch = new dom.window.XMLSerializer().serializeToString(wrap).replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
  return {
    file: '(support)', url: '/support', name: 'Support', arch,
    metaTitle: 'Support | Tech Nova',
    metaDescription: 'Open a support ticket with Tech Nova and follow its progress online. For urgent help, call or WhatsApp (246) 230-8303.',
    ogImage: template.ogImage,
  };
}

const SUPPORT_CSS = `
.tn-inner .tk-form{background:#fff;border:1px solid var(--line);border-radius:6px;padding:28px 26px;box-shadow:0 14px 34px rgba(3,23,42,.08);margin-top:24px}
.tn-inner .tk-form h3{font-family:'Sora',Arial,sans-serif;font-size:19px;text-transform:uppercase;margin:0 0 12px}
.tn-inner .tk-form label{display:block;text-transform:uppercase;letter-spacing:.5px;font-size:10px;font-weight:900;color:var(--muted);margin-bottom:6px}
.tn-inner .tk-form input:not([type=hidden]):not([type=file]),.tn-inner .tk-form textarea{width:100%;padding:12px 13px;border:1px solid var(--line);border-radius:3px;font-family:inherit;font-size:14px;color:var(--ink);background:#fff;transition:.15s}
.tn-inner .tk-form input:focus,.tn-inner .tk-form textarea:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 3px rgba(8,124,240,.13)}
.tn-inner .tk-form textarea{resize:vertical;min-height:130px}
.tn-inner .tk-form input[type=file]{font-size:13px;color:var(--muted)}
.tn-inner .tk-fld{margin-bottom:15px}
.tn-inner .tk-row{display:flex;gap:12px}
.tn-inner .tk-row .tk-fld{flex:1}
.tn-inner .tk-form button{width:100%;border:0;cursor:pointer;margin-top:4px}
.tn-inner .tk-form .is-invalid{border-color:#d3452e}
.tn-inner #s_website_form_result{display:block;margin-top:10px;font-size:13px;color:#d3452e}
.tn-inner .tk-end a{color:var(--blue);font-weight:600}
.tn-inner .tk-side-note{font-size:13px;line-height:1.6;color:var(--muted);margin:0 0 8px}
.tn-inner .side .tk-side-gap{margin-top:26px}
@media(max-width:700px){.tn-inner .tk-row{display:block}}
/* Odoo's own pages (client portal, /my/tickets) use the site footer inside Odoo's footer block. */
#footer .tn-odoo-footer a{color:inherit}
.o_footer_copyright{display:none}
`;

// ---------- Convert every page ----------
const pages = [];
const footerScripts = new Map();
for (const file of files) {
  const src = read(file);
  const isHome = file === 'index.html';
  const usesPageJs = /assets\/page\.js/.test(src);
  const dom = new JSDOM(src, { runScripts: usesPageJs ? 'outside-only' : undefined });
  const { document: doc } = dom.window;

  if (usesPageJs) {
    dom.window.eval(pageJs);
    const key = doc.body.dataset.page;
    const sub = doc.querySelector('.subhero');
    if (sub && PH[key]) {
      const f = PH[key].includes('/') ? PH[key] : 'photos/' + PH[key];
      sub.setAttribute('style', `background-image:linear-gradient(120deg,rgba(3,23,42,.9),rgba(8,59,102,.58)),url('${'../assets/' + f}')`);
    }
  }

  // SEO fields
  const meta = (sel) => (doc.querySelector(sel) || {}).content || '';
  const title = doc.title.trim();
  const description = meta('meta[name="description"]');
  const ogImage = meta('meta[property="og:image"]');
  const name = (doc.querySelector('h1') || {}).textContent || title.split(' | ')[0];

  // Keep JSON-LD (moved into the body), drop every other script. Behaviour scripts that
  // matter go into custom_code_footer once, for the whole site.
  const jsonld = [...doc.querySelectorAll('script[type="application/ld+json"]')].map((s) => {
    const txt = s.textContent.replace(/https:\/\/technovabb\.com(\/[^"\s]*)?/g, (m, p) => mapUrl(p || '/', file, { abs: true }));
    s.remove();
    return txt;
  });
  for (const s of [...doc.querySelectorAll('script')]) {
    const t = s.textContent;
    if (/cf-topic/.test(t)) {
      // Odoo's form calls form.reset() when it starts, so also make the picked topic the default option.
      const keep = 'for(var k=0;k<sel.options.length;k++)sel.options[k].defaultSelected=(k===i);sel.selectedIndex=i;';
      const fixed = t.trim().replace('sel.selectedIndex=i;', keep);
      if (fixed === t.trim()) warnings.push('topic picker: could not patch selectedIndex');
      footerScripts.set('topic', fixed);
    }
    else if (/\.ba-range/.test(t)) footerScripts.set('ba', t.trim());
    s.remove();
  }

  if (isHome) odooContactForm(doc, doc.getElementById('contactForm'));

  // Links, images and inline background images
  const body = doc.body;
  for (const a of body.querySelectorAll('[href]')) a.setAttribute('href', mapUrl(a.getAttribute('href'), file));
  for (const i of body.querySelectorAll('[src]')) i.setAttribute('src', mapUrl(i.getAttribute('src'), file));
  for (const e of body.querySelectorAll('[style]')) e.setAttribute('style', mapCssUrls(e.getAttribute('style'), file));
  for (const e of body.querySelectorAll('[class]')) e.setAttribute('class', e.getAttribute('class').split(/\s+/).filter(Boolean).map(renameClass).join(' '));
  const top = doc.getElementById('top');
  if (top) top.id = 'tn-top';
  for (const m of [...doc.querySelectorAll('main')]) {
    const d = doc.createElement('div');
    for (const at of m.attributes) d.setAttribute(at.name, at.value);
    d.classList.add('tn-main');
    while (m.firstChild) d.appendChild(m.firstChild);
    m.replaceWith(d);
  }
  addSupportLinks(doc, isHome);

  // Wrap the body in Odoo's #wrap
  const wrap = doc.createElement('div');
  wrap.id = 'wrap';
  wrap.className = isHome ? 'tn-home' : 'tn-inner';
  if (doc.body.dataset.page) wrap.setAttribute('data-page', doc.body.dataset.page);
  for (const t of jsonld) {
    const s = doc.createElement('script');
    s.setAttribute('type', 'application/ld+json');
    s.textContent = t;
    wrap.appendChild(s);
  }
  while (doc.body.firstChild) wrap.appendChild(doc.body.firstChild);

  let xhtml = new dom.window.XMLSerializer().serializeToString(wrap)
    .replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
  pages.push({
    file, url: newUrl(file), name: name.trim(), metaTitle: title, metaDescription: description,
    ogImage: ogImage ? mapUrl(ogImage, file) : '', arch: xhtml,
  });
}
{
  const tpl = pages.find((p) => p.url === '/privacy');
  const managedIt = pages.find((p) => p.url === '/services/managed-it');
  const heroStyle = managedIt && (managedIt.arch.match(/<header class="subhero" style="([^"]*)"/) || [])[1];
  pages.push(supportPage(tpl, heroStyle && heroStyle.replace(/&amp;/g, '&')));
}

// ---------- CSS ----------
const RESET = `
/* Undo Bootstrap's defaults inside our pages, so they look as they did on GitHub Pages. */
:where(.tn-home,.tn-inner){line-height:normal;font-size:16px;text-align:left}
:where(.tn-home,.tn-inner) :is(p){margin:1em 0}
:where(.tn-home,.tn-inner) :is(h1,h2,h3,h4,h5,h6){font-weight:bold;line-height:normal;color:inherit}
:where(.tn-home,.tn-inner) :is(h1){font-size:2em;margin:.67em 0}
:where(.tn-home,.tn-inner) :is(h2){font-size:1.5em;margin:.83em 0}
:where(.tn-home,.tn-inner) :is(h3){font-size:1.17em;margin:1em 0}
:where(.tn-home,.tn-inner) :is(h4){font-size:1em;margin:1.33em 0}
:where(.tn-home,.tn-inner) :is(ul,ol){margin:1em 0;padding-left:40px}
:where(.tn-home,.tn-inner) :is(figure){margin:1em 40px}
:where(.tn-home,.tn-inner) :is(label){display:inline;margin:0}
:where(.tn-home,.tn-inner) :is(img,svg){vertical-align:baseline}
:where(.tn-home,.tn-inner) :is(small){font-size:smaller}
:where(.tn-home,.tn-inner) :is(a){color:inherit}
:where(.tn-home,.tn-inner) :is(a:hover){color:inherit}
.tn-home .contact-form .is-invalid{border-color:#d3452e}
.tn-home #s_website_form_result{display:block;margin-top:10px;font-size:13px;color:#d3452e}
`;

function scopeCss(css, prefix, file) {
  css = css.replace(/@import\s+url\([^)]*\)\s*;/g, '');
  css = renameCssNames(mapCssUrls(css, file));
  return postcss([prefixer({
    prefix,
    transform(pfx, selector, prefixed) {
      if (/^html$/.test(selector)) return selector; // scroll-behaviour etc. stays global
      if (/^(:root|body|html body)$/.test(selector)) return pfx;
      if (/^body[.\[:#]/.test(selector)) return pfx + selector.slice(4);
      if (/^body\s/.test(selector)) return pfx + selector.slice(4);
      if (selector === '*') return `${pfx}, ${pfx} *`;
      return prefixed;
    },
  })]).process(css, { from: undefined }).css;
}

const homeCss = read('index.html').match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
const css = RESET + scopeCss(homeCss, '.tn-home', 'index.html') + '\n' + scopeCss(read('assets/page.css'), '.tn-inner', 'assets/page.css') + SUPPORT_CSS;

const homeDoc = new JSDOM(read('index.html')).window.document;
const verify = homeDoc.querySelector('meta[name="google-site-verification"]').content;
const theme = homeDoc.querySelector('meta[name="theme-color"]').content;
const headCode =
  `<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin=""/>` +
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=Sora:wght@600;700;800&amp;display=swap"/>` +
  `<meta name="google-site-verification" content="${verify}"/><meta name="theme-color" content="${theme}"/>` +
  `<style>${css}</style>`;
const footerCode = [...footerScripts.values()].map((s) => `<script>${s}</script>`).join('\n');

const commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
const out = { source: `Technovabb/technovabb.github.io@${commit}`, assets: [...assets].sort(), headCode, footerCode, pages, redirects, warnings };
fs.writeFileSync(path.join(ROOT, 'odoo-site', 'payload.json'), JSON.stringify(out));
console.log(`pages ${pages.length}, assets ${assets.size}, redirects ${redirects.length}, css ${css.length} chars, footer scripts ${footerScripts.size}`);
if (warnings.length) console.log('warnings:\n' + warnings.join('\n'));
