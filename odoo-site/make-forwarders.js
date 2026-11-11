// Switch-over day: turn the old GitHub Pages copies of the 27 pages into forwarding pages.
//
// The bare domain technovabb.com stays on GitHub Pages (Namecheap's redirect and Odoo
// cannot give it an https certificate). Each old page file is overwritten with a tiny
// page that sends visitors and Google to the same page on https://www.technovabb.com
// (served by Odoo). A 404.html catches any other old link and forwards it too.
// assets/, bimtix/, CNAME and the client demo repos are left alone.
//
// Usage (in a checkout of main, after www.technovabb.com works on Odoo):
//   node odoo-site/make-forwarders.js <repo root>
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || '.');
const WWW = 'https://www.technovabb.com';
const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'odoo-site', 'payload.json'), 'utf8'));
const verify = (payload.headCode.match(/google-site-verification" content="([^"]+)"/) || [])[1] || '';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const page = (to, title) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
${verify ? `<meta name="google-site-verification" content="${verify}">\n` : ''}<link rel="canonical" href="${to}">
<meta http-equiv="refresh" content="0; url=${to}">
<script>location.replace(${JSON.stringify(to)} + location.search + location.hash);</script>
</head><body style="font-family:system-ui,sans-serif;padding:24px">
<p>Tech Nova has moved to <a href="${to}">${esc(to)}</a>.</p>
</body></html>
`;

const map = {}; // old path -> new path, for 404.html
let written = 0;
for (const p of payload.pages) {
  const to = WWW + (p.url === '/' ? '/' : p.url);
  fs.writeFileSync(path.join(ROOT, p.file), page(to, p.metaTitle || 'Tech Nova'));
  written++;
  map['/' + p.file] = p.url;
  if (p.file.endsWith('/index.html')) map['/' + p.file.slice(0, -'index.html'.length)] = p.url;
}

// Anything else (old links with extra bits, typos) goes to the same path on www.
const notFound = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Tech Nova</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>
(function () {
  var m = ${JSON.stringify(map)};
  var p = location.pathname;
  var to = m[p] || m[p + '/'] || p.replace(/\\/index\\.html$/, '/').replace(/\\.html$/, '');
  location.replace(${JSON.stringify(WWW)} + to + location.search + location.hash);
})();
</script>
</head><body style="font-family:system-ui,sans-serif;padding:24px">
<p>Tech Nova has moved to <a href="${WWW}/">${WWW}</a>.</p>
</body></html>
`;
fs.writeFileSync(path.join(ROOT, '404.html'), notFound);

fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${WWW}/sitemap.xml\n`);
const sitemap = path.join(ROOT, 'sitemap.xml');
if (fs.existsSync(sitemap)) fs.unlinkSync(sitemap);

console.log(`forwarding pages ${written}, 404.html, robots.txt; sitemap.xml removed`);
