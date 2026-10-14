/* Connects the website to the BimTix server when one is running
   (on the laptop with `npm run dev`, and later on bimtix.com).
   On the public design preview there is no server, so the pages keep
   using the sample data in data.js. */
window.BTAPI = (function () {
  "use strict";

  const SERVER_HOSTS = ["localhost", "127.0.0.1", "bimtix.com", "www.bimtix.com"];
  const onServer = SERVER_HOSTS.includes(location.hostname);
  const base = "api/";

  async function call(path, options) {
    const opts = options || {};
    const res = await fetch(base + path, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) }
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && data.message) || "Something went wrong — please try again");
      err.code = data && data.error;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const ready = (async () => {
    if (!onServer) return false;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 2000);
      const res = await fetch(base + "health", { signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) return false;
      const health = await res.json();
      if (!health.ok) return false;
      const { events } = await call("events");
      window.BIMTIX.events = events;      // real events replace the samples
      window.BIMTIX.live = health;
      return true;
    } catch (e) {
      return false;
    }
  })();

  /* Who is signed in: { user: null } when nobody is. Asked once per page; me(true) asks again. */
  let mePromise = null;
  function me(refresh) {
    if (!mePromise || refresh) mePromise = call("me").catch(() => ({ user: null }));
    return mePromise;
  }

  return { ready, call, me, onServer };
})();
