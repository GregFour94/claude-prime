// Imitation en mémoire de la liaison R2 utilisée par le Worker (get, head, put avec onlyIf, list, delete).
// Suffisante pour les tests : même forme de réponses que R2, écriture conditionnelle par etag.
import { randomUUID } from 'node:crypto';

export class R2Memoire {
  constructor() {
    this.objets = new Map();
    this.ecritures = 0;
    // Appelé juste avant chaque put : permet de simuler une écriture concurrente.
    this.avantPut = null;
  }

  #vue(key, o) {
    return {
      key, etag: o.etag, httpEtag: `"${o.etag}"`, size: o.corps.length, uploaded: o.uploaded,
      text: async () => o.corps,
      json: async () => JSON.parse(o.corps)
    };
  }

  async get(key) {
    const o = this.objets.get(key);
    return o ? this.#vue(key, o) : null;
  }

  async head(key) {
    const o = this.objets.get(key);
    return o ? { key, etag: o.etag, size: o.corps.length, uploaded: o.uploaded } : null;
  }

  async put(key, valeur, options = {}) {
    if (this.avantPut) {
      const f = this.avantPut;
      this.avantPut = null;
      await f(key);
    }
    const actuel = this.objets.get(key);
    const si = options.onlyIf || {};
    if (si.etagMatches !== undefined && (!actuel || actuel.etag !== si.etagMatches)) return null;
    if (si.etagDoesNotMatch !== undefined && actuel && actuel.etag === si.etagDoesNotMatch) return null;
    const o = { corps: String(valeur), etag: randomUUID().replace(/-/g, ''), uploaded: new Date() };
    this.objets.set(key, o);
    this.ecritures++;
    return { key, etag: o.etag };
  }

  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    const cles = [...this.objets.keys()].filter(k => k.startsWith(prefix)).sort();
    const debut = cursor ? Number(cursor) : 0;
    const page = cles.slice(debut, debut + limit);
    const truncated = debut + limit < cles.length;
    return {
      objects: page.map(k => ({ key: k, etag: this.objets.get(k).etag, size: this.objets.get(k).corps.length })),
      truncated,
      cursor: truncated ? String(debut + limit) : undefined,
      delimitedPrefixes: []
    };
  }

  async delete(key) {
    this.objets.delete(key);
  }

  // Raccourcis pour les tests.
  lireJson(key) {
    const o = this.objets.get(key);
    return o ? JSON.parse(o.corps) : null;
  }

  etag(key) {
    return this.objets.get(key)?.etag;
  }

  ecrireJson(key, valeur) {
    this.objets.set(key, { corps: JSON.stringify(valeur), etag: randomUUID().replace(/-/g, ''), uploaded: new Date() });
  }
}
