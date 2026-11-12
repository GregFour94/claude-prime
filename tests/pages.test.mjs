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

  it('lien d\'évitement en premier, visible au focus ; menu principal identique ; contenu principal identifié', async t => {
    const page = await navigateur.newPage();
    t.after(() => page.close());
    const menus = new Set();
    for (const nom of PAGES) {
      await page.goto(`${serveur.adresse}/${nom}`);
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const a = document.activeElement, r = a.getBoundingClientRect();
        return { texte: a.textContent, href: a.getAttribute('href'), visible: r.top >= 0 && r.height > 0 };
      });
      assert.deepEqual(focus, { texte: 'Aller au contenu principal', href: '#contenu', visible: true }, nom);
      assert.equal(await page.locator('main#contenu').count(), 1, `${nom} : <main id="contenu">`);
      const menu = page.getByRole('navigation', { name: 'Menu principal' });
      menus.add(JSON.stringify(await menu.getByRole('link').evaluateAll(l => l.map(a => [a.textContent, a.getAttribute('href')]))));
      const courant = await menu.locator('[aria-current="page"]').evaluateAll(l => l.map(a => a.getAttribute('href')));
      assert.deepEqual(courant, ['index.html', 'outils.html', 'plan-du-site.html'].includes(nom) ? [nom] : [], `${nom} : page courante`);
    }
    assert.equal(menus.size, 1, 'mêmes liens, même ordre sur toutes les pages');
  });

  // Contraste de chaque texte affiché, en mode clair et en mode sombre (critère 3.2).
  // Les boutons désactivés et le texte réservé aux lecteurs d'écran ne sont pas concernés.
  for (const theme of ['light', 'dark']) {
    it(`contrastes du texte ≥ 4,5:1 (3:1 en grande taille), mode ${theme === 'light' ? 'clair' : 'sombre'}`, async t => {
      const page = await navigateur.newPage({ colorScheme: theme });
      t.after(() => page.close());
      const defauts = [];
      for (const nom of PAGES) {
        await page.goto(`${serveur.adresse}/${nom}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
        defauts.push(...(await page.evaluate(nomPage => {
          const rgb = c => c.match(/[\d.]+/g).map(Number);
          const lum = ([r, g, b]) => [r, g, b].map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
            .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
          const fond = el => {
            for (let n = el; n; n = n.parentElement) {
              const c = rgb(getComputedStyle(n).backgroundColor);
              if (c[3] === undefined || c[3] === 1) return c.slice(0, 3);
            }
            return [255, 255, 255];
          };
          const res = [];
          const marche = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let t = marche.nextNode(); t; t = marche.nextNode()) {
            const el = t.parentElement;
            if (!t.textContent.trim() || el.closest('.sr-only, [disabled], dialog:not([open]), script, style')) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none' || !el.getClientRects().length) continue;
            const a = lum(rgb(cs.color)), b = lum(fond(el));
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            const taille = parseFloat(cs.fontSize), gras = Number(cs.fontWeight) >= 700;
            const seuil = taille >= 24 || (gras && taille >= 18.66) ? 3 : 4.5;
            if (ratio < seuil) res.push(`${nomPage} « ${t.textContent.trim().slice(0, 30)} » ${ratio.toFixed(2)} < ${seuil}`);
          }
          return res;
        }, nom)));
      }
      assert.deepEqual(defauts, []);
    });
  }

  it('les liens du pied de page mènent aux bonnes pages, sans défilement horizontal à 320 px', async t => {
    const page = await navigateur.newPage({ viewport: { width: 320, height: 800 } });
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
