/** A small cookie reader, so the app needs no cookie-parser dependency. */

export function cookieParser(req, res, next) {
  req.cookies = {};
  const header = req.headers.cookie;
  if (header) {
    for (const part of header.split(';')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const name = part.slice(0, eq).trim();
      if (!name) continue;
      try {
        req.cookies[name] = decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        // A malformed cookie value is simply ignored rather than failing the request.
      }
    }
  }
  next();
}
