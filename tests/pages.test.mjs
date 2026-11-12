// Tests du pied de page commun et des pages d'information.
// Lancement : node --test tests/pages.test.mjs
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { demarrerServeur, PAGES } from './helpers/serveur.mjs';
import { R2Memoire } from './helpers/r2-memoire.mjs';

const LIENS_ATTENDUS = [
  ['Contact', 'aide.html#contact'],
  ['Aide', 'aide.html'],
  ['Info site', 'info-site.html'],
  ['Accessibilité : non conforme', 'accessibilite.html'],
  ['Site de Grégoire F.', 'index.html'],
  ['Cookies / Données personnelles', 'donnees-personnelles.html'],
  ['Mentions légales', 'mentions-legales.html']
];
const lire = nom => readFile(new URL('../' + nom, import.meta.url), 'utf8');
const piedDe = html => {
  const m = html.match(/<footer class="pied">[\s\S]*?<\/footer>/g);
  return m;
};

describe('pied de page commun (fichiers)', () => {
  it('chaque page a exactement un pied de page, identique partout', async () => {
    const pieds = [];
    for (const nom of PAGES) {
      const html = await lire(nom);
      const trouves = piedDe(html);
      assert.equal(trouves?.length, 1, `${nom} : un seul <footer class="pied">`);
      assert.equal((html.match(/<footer/g) || []).length, 1, `${nom} : pas d'autre <footer>`);
      pieds.push(trouves[0]);
    }
    assert.equal(new Set(pieds).size, 1, 'pied de page identique sur toutes les pages');
  });

  it('nav « Pied de page » avec les 7 liens demandés, dans l\'ordre, vers des pages existantes', async () => {
    const pied = piedDe(await lire('index.html'))[0];
    assert.match(pied, /<nav aria-label="Pied de page">/);
    const liens = [...pied.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map(m => [m[2], m[1]]);
    assert.deepEqual(liens, LIENS_ATTENDUS);
    for (const [, cible] of liens) {
      const [fichier, ancre] = cible.split('#');
      assert.ok(existsSync(new URL('../' + fichier, import.meta.url)), `${fichier} existe`);
      if (ancre) assert.match(await lire(fichier), new RegExp(`id="${ancre}"`), `ancre #${ancre}`);
    }
  });

  it('pages d\'information : valeurs fournies, rien d\'externe, aucun script', async () => {
    const valeurs = { editeur: '[Claude-code]', hebergeur: '[cloudflare]', duree: '[5 ans]', traceurs: '[aucun traceur]' };
    const mentions = await lire('mentions-legales.html');
    assert.ok(mentions.includes(valeurs.editeur) && mentions.includes(valeurs.hebergeur));
    const donnees = await lire('donnees-personnelles.html');
    for (const v of Object.values(valeurs)) assert.ok(donnees.includes(v), `données personnelles : ${v}`);
    assert.match(await lire('accessibilite.html'), /<strong>non conforme<\/strong>/);
    for (const nom of ['aide.html', 'info-site.html', 'accessibilite.html', 'donnees-personnelles.html', 'mentions-legales.html']) {
      const html = await lire(nom);
      assert.doesNotMatch(html, /<script/i, `${nom} : aucun script`);
      assert.match(html, /<html lang="fr">/);
      assert.match(html, /<link rel="stylesheet" href="site.css">/);
    }
  });

  it('aucun traceur ni stockage navigateur dans le code du site', async () => {
    // Code seulement : fichiers JS et blocs <script> des pages (le texte des pages peut citer ces mots).
    const codes = [];
    for (const nom of PAGES) {
      for (const m of (await lire(nom)).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) codes.push([nom, m[1]]);
    }
    for (const nom of ['outils.js', 'outils-data.js', 'outils-schema.js']) codes.push([nom, await lire(nom)]);
    for (const [nom, code] of codes) {
      assert.doesNotMatch(code, /document\.cookie|localStorage|sessionStorage|indexedDB|navigator\.sendBeacon/, nom);
    }
  });
});

describe('pages dans le navigateur', { timeout: 60000 }, () => {
  let navigateur, serveur;
  before(async () => {
    navigateur = await chromium.launch();
    serveur = await demarrerServeur({ env: { FICHES: new R2Memoire() } });
  });
  after(async () => {
    await navigateur?.close();
    await serveur?.fermer();
  });

  it('chaque page ne charge rien depuis un autre domaine et ne dépose ni cookie ni stockage', async t => {
    const contexte = await navigateur.newContext();
    t.after(() => contexte.close());
    const hotes = new Set();
    contexte.on('request', r => hotes.add(new URL(r.url()).host));
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    for (const nom of PAGES) {
      await page.goto(`${serveur.adresse}/${nom}`, { waitUntil: 'networkidle' });
      const stockage = await page.evaluate(() => ({ cookie: document.cookie, local: localStorage.length, session: sessionStorage.length }));
      assert.deepEqual(stockage, { cookie: '', local: 0, session: 0 }, nom);
    }
    assert.deepEqual([...hotes], [new URL(serveur.adresse).host], 'seule l\'adresse du site est contactée');
    assert.deepEqual(await contexte.cookies(), []);
    assert.deepEqual(erreurs, []);
  });

  it('les liens du pied de page mènent aux bonnes pages, sans défilement horizontal sur téléphone', async t => {
    const page = await navigateur.newPage({ viewport: { width: 375, height: 800 } });
    t.after(() => page.close());
    for (const nom of PAGES) {
      await page.goto(`${serveur.adresse}/${nom}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${nom} : pas de défilement horizontal`);
      const nav = page.getByRole('navigation', { name: 'Pied de page' });
      assert.equal(await nav.getByRole('link').count(), 7, nom);
    }
    for (const [texte, cible] of LIENS_ATTENDUS) {
      await page.goto(`${serveur.adresse}/outils.html`);
      await page.getByRole('navigation', { name: 'Pied de page' }).getByRole('link', { name: texte, exact: true }).click();
      await page.waitForLoadState();
      assert.ok(page.url().endsWith('/' + cible), `${texte} → ${page.url()}`);
      assert.equal(await page.locator('h1').count(), 1);
    }
  });
});
