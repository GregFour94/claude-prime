// Petit serveur local pour les tests dans le navigateur (et pour essayer la page à la main).
// - sert les fichiers du site (index.html, outils.html, outils.js…) ;
// - transmet /api/* au vrai code du Worker, avec un R2 en mémoire ;
// - imite Cloudflare Access : si `utilisateur` est défini, ajoute un jeton signé à chaque requête /api/admin/*.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../worker/src/index.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
export const PAGES = ['index.html', 'outils.html', 'aide.html', 'info-site.html', 'accessibilite.html', 'donnees-personnelles.html', 'mentions-legales.html'];
const PUBLICS = new Set([...PAGES, 'site.css', 'outils.js', 'outils-data.js', 'outils-schema.js', 'README.md']);

export async function demarrerServeur({ env, jeton = null, utilisateur = null, sansApi = false } = {}) {
  const etat = { env, utilisateur, sansApi, requetesApi: [] };

  const serveur = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/') && !etat.sansApi) {
        etat.requetesApi.push(`${req.method} ${url.pathname}`);
        const corps = await new Promise(ok => { const m = []; req.on('data', c => m.push(c)); req.on('end', () => ok(Buffer.concat(m))); });
        const entetes = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') entetes.set(k, v);
        entetes.delete('cf-access-jwt-assertion'); // seul « Access » (ici le serveur de test) peut le poser
        if (url.pathname.startsWith('/api/admin/') && etat.utilisateur && jeton) {
          entetes.set('Cf-Access-Jwt-Assertion', await jeton({ email: etat.utilisateur }));
        }
        const requete = new Request(url, {
          method: req.method, headers: entetes,
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : corps
        });
        const reponse = await worker.fetch(requete, etat.env);
        res.writeHead(reponse.status, Object.fromEntries(reponse.headers));
        res.end(Buffer.from(await reponse.arrayBuffer()));
        return;
      }
      const nom = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      if (!PUBLICS.has(nom)) { res.writeHead(404); res.end('Introuvable'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(nom)] || 'application/octet-stream' });
      res.end(await readFile(path.join(RACINE, nom)));
    } catch (e) {
      res.writeHead(500); res.end(String(e));
    }
  });

  await new Promise(ok => serveur.listen(0, '127.0.0.1', ok));
  const adresse = `http://127.0.0.1:${serveur.address().port}`;
  return { adresse, etat, fermer: () => new Promise(ok => serveur.close(ok)) };
}

// Lancement manuel : node tests/helpers/serveur.mjs  (R2 en mémoire, éditeur fictif connecté)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { R2Memoire } = await import('./r2-memoire.mjs');
  const { preparerAcces, envProtege, EDITEUR } = await import('./acces.mjs');
  const acces = await preparerAcces();
  const { adresse } = await demarrerServeur({ env: envProtege(new R2Memoire()), jeton: acces.jeton, utilisateur: EDITEUR });
  console.log(`Page de test : ${adresse}/outils.html (connecté en tant que ${EDITEUR}, données en mémoire)`);
}
