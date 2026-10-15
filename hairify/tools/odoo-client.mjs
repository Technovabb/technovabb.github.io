/**
 * A small Odoo JSON-RPC client.
 *
 * Odoo's external API is a single POST endpoint. Everything below is either
 * `common.authenticate` (to get a uid) or `object.execute_kw` (to call a method
 * on a model), so the whole client is two shapes of the same request.
 *
 * Credentials come from the environment and are never written to disk or logged:
 *   ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY
 */

export class OdooError extends Error {
  constructor(message, data) {
    super(message);
    this.name = 'OdooError';
    this.data = data;
  }
}

export class Odoo {
  constructor({ url, db, username, apiKey, dryRun = false, log = () => {} }) {
    this.url = String(url || '').replace(/\/$/, '');
    this.db = db;
    this.username = username;
    this.apiKey = apiKey;
    this.dryRun = dryRun;
    this.log = log;
    this.uid = null;
    this.writes = [];
  }

  static fromEnv(options = {}) {
    const missing = ['ODOO_URL', 'ODOO_DB', 'ODOO_USERNAME', 'ODOO_API_KEY'].filter(
      (name) => !process.env[name],
    );
    if (missing.length && !options.dryRun) {
      throw new OdooError(
        `Missing ${missing.join(', ')}. Add them to the environment — see README → Odoo.`,
      );
    }
    return new Odoo({
      url: process.env.ODOO_URL || 'https://hairify.odoo.com',
      db: process.env.ODOO_DB || 'hairify',
      username: process.env.ODOO_USERNAME,
      apiKey: process.env.ODOO_API_KEY,
      ...options,
    });
  }

  async rpc(service, method, args) {
    const response = await fetch(`${this.url}/jsonrpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: { service, method, args },
        id: Math.floor(Math.random() * 1e9),
      }),
    });

    if (!response.ok) {
      throw new OdooError(`Odoo replied ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    if (payload.error) {
      const data = payload.error.data || {};
      // Odoo puts the useful sentence in data.message and the stack in data.debug.
      throw new OdooError(data.message || payload.error.message || 'Odoo rejected the call', data);
    }
    return payload.result;
  }

  async authenticate() {
    if (this.uid) return this.uid;
    const uid = await this.rpc('common', 'authenticate', [this.db, this.username, this.apiKey, {}]);
    if (!uid) {
      throw new OdooError(
        'Odoo refused those credentials. Check ODOO_USERNAME is the email you sign in with and ' +
          'that ODOO_API_KEY is a current API key (My Profile → Account Security → New API Key).',
      );
    }
    this.uid = uid;
    return uid;
  }

  /** Calls a method on a model. Reads always run; writes respect --dry-run. */
  async call(model, method, args = [], kwargs = {}) {
    await this.authenticate();
    return this.rpc('object', 'execute_kw', [this.db, this.uid, this.apiKey, model, method, args, kwargs]);
  }

  async searchRead(model, domain = [], fields = ['id'], options = {}) {
    return this.call(model, 'search_read', [domain, fields], options);
  }

  async searchOne(model, domain, fields = ['id']) {
    const rows = await this.searchRead(model, domain, fields, { limit: 1 });
    return rows[0] || null;
  }

  async create(model, values, { label } = {}) {
    this.writes.push({ model, action: 'create', label: label || values.name, values });
    if (this.dryRun) {
      this.log(`  would create ${model}: ${label || values.name || JSON.stringify(values).slice(0, 60)}`);
      // A negative id makes it obvious in a dry run that nothing real was made.
      return -this.writes.length;
    }
    const id = await this.call(model, 'create', [values]);
    this.log(`  created ${model} #${id}: ${label || values.name || ''}`);
    return id;
  }

  async write(model, ids, values, { label } = {}) {
    const idList = Array.isArray(ids) ? ids : [ids];
    this.writes.push({ model, action: 'write', label, ids: idList, values });
    if (this.dryRun) {
      this.log(`  would update ${model} ${idList.join(',')}: ${label || Object.keys(values).join(', ')}`);
      return true;
    }
    await this.call(model, 'write', [idList, values]);
    this.log(`  updated ${model} ${idList.join(',')}: ${label || Object.keys(values).join(', ')}`);
    return true;
  }

  /**
   * The backbone of a re-runnable sync: find a record by `domain`, create it if
   * it is missing, and bring it up to date if `update` is set.
   */
  async ensure(model, domain, values, { label, update = false, fields = ['id'] } = {}) {
    const existing = this.dryRun ? null : await this.searchOne(model, domain, fields);
    if (existing) {
      if (update) await this.write(model, existing.id, values, { label });
      else this.log(`  have ${model} #${existing.id}: ${label || values.name || ''}`);
      return existing.id;
    }
    return this.create(model, values, { label });
  }

  /** Which of the apps this setup needs are actually installed. */
  async installedModules(names) {
    const rows = await this.searchRead(
      'ir.module.module',
      [
        ['name', 'in', names],
        ['state', '=', 'installed'],
      ],
      ['name'],
    );
    return new Set(rows.map((row) => row.name));
  }

  summary() {
    const byModel = new Map();
    for (const entry of this.writes) {
      const key = `${entry.model} ${entry.action}`;
      byModel.set(key, (byModel.get(key) || 0) + 1);
    }
    return [...byModel].map(([key, count]) => `${count} × ${key}`);
  }
}
