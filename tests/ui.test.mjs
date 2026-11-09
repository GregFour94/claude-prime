// Tests de la page outils.html dans un vrai navigateur (Chromium via Playwright).
// Le serveur de test sert la page et transmet /api/* au code du Worker (R2 en mémoire, Access simulé).
// Lancement : npm run test:ui   (en local : npx playwright install chromium la première fois)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { demarrerServeur } from './helpers/serveur.mjs';
import { R2Memoire } from './helpers/r2-memoire.mjs';
import { preparerAcces, envProtege, EDITEUR, AUTRE_PERSONNE } from './helpers/acces.mjs';
import { OUTILS_INITIAUX } from '../outils-data.js';
import { ficheInitiale } from '../outils-schema.js';

const A = OUTILS_INITIAUX[0]; // Aider
const B = OUTILS_INITIAUX[1]; // Claude Code
const cle = id => `fiches/${id}.json`;

let navigateur, acces;
before(async () => {
  acces = await preparerAcces();
  navigateur = await chromium.launch();
});
after(async () => {
  await navigateur?.close();
  acces?.restaurer();
});

function r2Initialise({ persoA = false } = {}) {
  const r2 = new R2Memoire();
  for (const o of OUTILS_INITIAUX) r2.ecrireJson(cle(o.outilId), ficheInitiale(o, '2026-11-01T00:00:00.000Z'));
  if (persoA) {
    const f = r2.lireJson(cle(A.outilId));
    Object.assign(f.champs, { gratuit: false, note: 0, testeLe: '2026-11-01', langages: ['Python', 'JavaScript'], remarque: 'Ligne 1\nLigne 2', documentation: 'https://aider.chat/docs/' });
    Object.assign(f.types, { gratuit: 'booleen', note: 'nombre', testeLe: 'date', langages: 'liste', remarque: 'texteLong', documentation: 'url' });
    r2.ecrireJson(cle(A.outilId), f);
  }
  return r2;
}

// Ouvre la page sur un serveur de test ; renvoie { page, serveur, erreurs, r2 }.
// Le serveur et la page sont fermés à la fin du test, même s'il échoue (sinon Node resterait bloqué).
async function ouvrir(t, { r2 = r2Initialise(), env, utilisateur = EDITEUR, sansApi = false } = {}) {
  const serveur = await demarrerServeur({ env: env || envProtege(r2), jeton: acces.jeton, utilisateur, sansApi });
  const page = await navigateur.newPage();
  t.after(async () => { await page.close(); await serveur.fermer(); });
  page.setDefaultTimeout(10000);
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(serveur.adresse + '/outils.html');
  await page.waitForFunction(() => !document.getElementById('statut').textContent.includes('Chargement'));
  return { page, serveur, erreurs, r2 };
}

const carte = (page, id) => page.locator(`.card[data-outil-id="${id}"]`);

describe('page outils.html dans le navigateur', { timeout: 60000 }, () => {
  it('liste, filtres et liens d\'origine conservés', async t => {
    const { page, erreurs } = await ouvrir(t);
    assert.equal(await page.locator('.card').count(), 71);
    assert.equal(await page.innerText('#count'), '71 outils');
    await page.click('.chip:has-text("Composants UI")');
    assert.equal(await page.innerText('#count'), '8 outils');
    await page.click('.chip:has-text("Tous")');
    await page.fill('#search', 'animation');
    assert.equal(await page.innerText('#count'), '6 outils');
    await page.fill('#search', 'zzzz');
    assert.equal(await page.innerText('.empty'), 'Aucun outil ne correspond à ta recherche.');
    await page.fill('#search', '');
    assert.equal(await page.locator('.card h3 a').count(), 68, '68 outils avec lien, 3 sans');
    assert.equal(await carte(page, A.outilId).locator('h3 a').getAttribute('href'), A.url);
    assert.equal(await page.locator('a.back').getAttribute('href'), 'index.html');
    await page.goto(page.url().replace('outils.html', 'index.html'));
    await page.click('text=Ouvrir l\'outil');
    assert.ok(page.url().endsWith('/outils.html'));
    assert.deepEqual(erreurs, []);
  });

  it('protection non configurée : modifications désactivées', async t => {
    const r2 = r2Initialise();
    const { page } = await ouvrir(t, { env: { FICHES: r2 } });
    assert.match(await page.innerText('#statut'), /Modifications désactivées : ACCESS_TEAM_DOMAIN n'est pas configuré/);
    assert.equal(await page.locator('.card-actions button:enabled').count(), 0);
    assert.equal(await page.locator('.card-actions button:disabled').count(), 142);
  });

  it('serveur injoignable : liste d\'origine en lecture seule', async t => {
    const { page, erreurs } = await ouvrir(t, { sansApi: true });
    assert.equal(await page.locator('.card').count(), 71);
    assert.match(await page.innerText('#statut'), /Serveur des fiches injoignable/);
    assert.equal(await page.locator('.card-actions button:enabled').count(), 0);
    assert.deepEqual(erreurs, []);
  });

  it('non connecté : lien de connexion, boutons désactivés', async t => {
    const { page } = await ouvrir(t, { utilisateur: null });
    assert.match(await page.innerText('#statut'), /Connecte-toi pour modifier/);
    assert.equal(await page.locator('#statut a').getAttribute('href'), '/api/admin/connexion');
    assert.equal(await page.locator('.card-actions button:enabled').count(), 0);
  });

  it('connecté mais non autorisé : boutons désactivés', async t => {
    const { page } = await ouvrir(t, { utilisateur: AUTRE_PERSONNE });
    assert.match(await page.innerText('#statut'), /non autorisé/);
    assert.equal(await page.locator('.card-actions button:enabled').count(), 0);
  });

  it('initialisation unique depuis la page, sans écraser une fiche déjà modifiée', async t => {
    const r2 = new R2Memoire();
    r2.ecrireJson(cle(A.outilId), { ...ficheInitiale(A), version: 4, champs: { ...ficheInitiale(A).champs, nom: 'Aider déjà modifié' } });
    const { page } = await ouvrir(t, { r2 });
    assert.equal(await carte(page, B.outilId).getByText('Modifier la fiche').isDisabled(), true, 'fiche non initialisée');
    await page.click('#initialiser');
    await page.waitForSelector('#statut >> text=Initialisation');
    assert.match(await page.innerText('#statut'), /70 fiches créées, 1 déjà présente/);
    assert.equal(await page.locator('#initialiser').count(), 0);
    assert.equal(r2.lireJson(cle(A.outilId)).champs.nom, 'Aider déjà modifié');
    await page.reload();
    await page.waitForSelector('#statut >> text=71 fiches');
    assert.match(await carte(page, A.outilId).innerText(), /Aider déjà modifié/);
  });

  it('modifier tous les champs (y compris personnalisés), recharger, types préservés', async t => {
    const { page, r2, erreurs } = await ouvrir(t, { r2: r2Initialise({ persoA: true }) });
    await carte(page, A.outilId).getByText('Modifier la fiche').click();
    // Tous les champs existants sont ouverts et préremplis.
    assert.equal(await page.inputValue('#champ-nom'), A.nom);
    assert.equal(await page.inputValue('#champ-url'), A.url);
    assert.equal(await page.inputValue('#champ-description'), A.description);
    assert.equal(await page.inputValue('#champ-categorie'), A.categorie);
    assert.equal(await page.inputValue('#champ-type'), A.type);
    assert.equal(await page.isChecked('#champ-gratuit'), false);
    assert.equal(await page.inputValue('#champ-note'), '0');
    assert.equal(await page.inputValue('#champ-testeLe'), '2026-11-01');
    assert.equal(await page.inputValue('#champ-langages'), 'Python\nJavaScript');
    assert.equal(await page.inputValue('#champ-remarque'), 'Ligne 1\nLigne 2');
    assert.equal(await page.inputValue('#champ-documentation'), 'https://aider.chat/docs/');

    await page.fill('#champ-nom', 'Aider (modifié)');
    await page.fill('#champ-url', 'https://aider.chat/');
    await page.fill('#champ-description', 'Nouvelle description.');
    await page.selectOption('#champ-categorie', 'learning');
    await page.fill('#champ-type', 'Terminal');
    await page.check('#champ-gratuit');
    await page.fill('#champ-note', '4.5');
    await page.fill('#champ-testeLe', '2026-12-24');
    await page.fill('#champ-langages', 'Go\n  Rust  \n');
    await page.fill('#champ-remarque', 'Une remarque');
    await page.fill('#champ-documentation', 'http://exemple.org/doc');
    await page.click('#fiche-enregistrer');
    await page.waitForSelector('#statut >> text=enregistrée');

    const f = r2.lireJson(cle(A.outilId));
    assert.deepEqual(f.champs, {
      nom: 'Aider (modifié)', url: 'https://aider.chat/', description: 'Nouvelle description.', categorie: 'learning', type: 'Terminal',
      gratuit: true, note: 4.5, testeLe: '2026-12-24', langages: ['Go', 'Rust'], remarque: 'Une remarque', documentation: 'http://exemple.org/doc'
    });
    assert.equal(f.types.gratuit, 'booleen');
    assert.equal(f.version, 2);

    await page.reload();
    await page.waitForSelector('#statut >> text=lus depuis le serveur');
    const c = carte(page, A.outilId);
    assert.equal(await c.locator('h3 a').innerText(), 'Aider (modifié) ↗');
    assert.equal(await c.locator('h3 a').getAttribute('href'), 'https://aider.chat/');
    assert.match(await c.innerText(), /Nouvelle description\.[\s\S]*Apprendre[\s\S]*Terminal/);
    assert.match(await c.locator('.extras').innerText(), /gratuit\s+Oui[\s\S]*note\s+4\.5[\s\S]*langages\s+Go, Rust/);
    await page.click('.chip:has-text("Apprendre")');
    assert.equal(await carte(page, A.outilId).count(), 1, 'le filtre utilise la catégorie enregistrée');
    assert.deepEqual(erreurs, []);
  });

  it('commenter A sans toucher B ; le texte s\'affiche comme du texte, jamais comme du HTML', async t => {
    const { page, r2, erreurs } = await ouvrir(t);
    const etagA = r2.etag(cle(A.outilId)), etagB = r2.etag(cle(B.outilId));
    const piege = '<img src=x onerror="window.__xss=1"><b>gras</b>';
    await carte(page, A.outilId).getByText('Ajouter un commentaire').click();
    await page.fill('#comm-texte', piege);
    await page.click('#comm-envoyer');
    await page.waitForSelector('#statut >> text=Commentaire ajouté');

    await page.reload();
    await page.waitForSelector('#statut >> text=1 commentaire');
    const cA = carte(page, A.outilId);
    await cA.locator('summary').click();
    assert.equal(await cA.locator('.commentaires p').innerText(), piege);
    assert.equal(await cA.locator('img, b').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await carte(page, B.outilId).locator('details').count(), 0);
    assert.equal(r2.etag(cle(A.outilId)), etagA);
    assert.equal(r2.etag(cle(B.outilId)), etagB);
    assert.deepEqual(erreurs, []);
  });

  it('changer l\'URL de A sans perdre ses commentaires', async t => {
    const { page } = await ouvrir(t);
    for (const texte of ['Premier avis', 'Second avis']) {
      await carte(page, A.outilId).getByText('Ajouter un commentaire').click();
      await page.fill('#comm-texte', texte);
      await page.click('#comm-envoyer');
      await page.waitForSelector(`#statut >> text=Commentaire ajouté`);
    }
    await carte(page, A.outilId).getByText('Modifier la fiche').click();
    await page.fill('#champ-url', 'https://nouvelle-adresse.example/');
    await page.click('#fiche-enregistrer');
    await page.waitForSelector('#statut >> text=enregistrée');
    await page.reload();
    await page.waitForSelector('#statut >> text=2 commentaires');
    const c = carte(page, A.outilId);
    assert.equal(await c.locator('h3 a').getAttribute('href'), 'https://nouvelle-adresse.example/');
    await c.locator('summary').click();
    assert.deepEqual(await c.locator('.commentaires p').allInnerTexts(), ['Premier avis', 'Second avis']);
  });

  it('envoi invalide refusé : rien n\'est enregistré', async t => {
    const { page, r2, serveur } = await ouvrir(t);
    const avant = r2.ecritures;
    await carte(page, A.outilId).getByText('Modifier la fiche').click();
    await page.fill('#champ-url', 'javascript:alert(1)');
    await page.fill('#champ-nom', '');
    await page.click('#fiche-enregistrer');
    assert.match(await page.innerText('#err-url'), /http/);
    assert.match(await page.innerText('#err-nom'), /obligatoire/);
    assert.equal(serveur.etat.requetesApi.filter(r => r.startsWith('PUT')).length, 0);
    await page.click('#fiche-annuler');

    await carte(page, A.outilId).getByText('Ajouter un commentaire').click();
    await page.fill('#comm-texte', '    ');
    await page.click('#comm-envoyer');
    assert.match(await page.innerText('#comm-alerte'), /vide/);
    await page.click('#comm-annuler');

    // Même en contournant la page, le serveur refuse.
    const r = await page.evaluate(async id => {
      const rep = await fetch(`/api/admin/fiches/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 1, champs: { nom: 'x' }, types: { nom: 'texte' } }) });
      return rep.status;
    }, A.outilId);
    assert.equal(r, 400);
    assert.equal(r2.ecritures, avant);
  });

  it('conflit signalé, la fiche plus récente n\'est pas écrasée', async t => {
    const { page, r2 } = await ouvrir(t);
    await carte(page, A.outilId).getByText('Modifier la fiche').click();
    // Pendant ce temps, un autre éditeur enregistre une version 2.
    const autre = r2.lireJson(cle(A.outilId));
    r2.ecrireJson(cle(A.outilId), { ...autre, version: 2, champs: { ...autre.champs, nom: 'Nom de l\'autre éditeur' } });

    await page.fill('#champ-nom', 'Mon nom');
    await page.click('#fiche-enregistrer');
    await page.waitForSelector('#fiche-alerte >> text=Conflit');
    assert.match(await page.innerText('#fiche-alerte'), /version 1 → 2/);
    assert.equal(r2.lireJson(cle(A.outilId)).champs.nom, 'Nom de l\'autre éditeur');
    await page.click('#fiche-alerte >> text=Charger la version enregistrée');
    assert.equal(await page.inputValue('#champ-nom'), 'Nom de l\'autre éditeur');
    assert.match(await page.innerText('#fiche-meta'), /version 2/);
  });

  it('connexion perdue avant l\'envoi : refus serveur, rien n\'est écrit', async t => {
    const { page, r2, serveur } = await ouvrir(t);
    const avant = r2.ecritures;
    await carte(page, A.outilId).getByText('Modifier la fiche').click();
    serveur.etat.utilisateur = null; // la session Access a expiré
    await page.fill('#champ-nom', 'Tentative');
    await page.click('#fiche-enregistrer');
    await page.waitForSelector('#fiche-alerte >> text=reconnecte-toi');
    serveur.etat.utilisateur = AUTRE_PERSONNE; // connecté avec un compte non autorisé
    await page.click('#fiche-enregistrer');
    await page.waitForSelector('#fiche-alerte >> text=autorisé');
    assert.equal(r2.ecritures, avant);
    assert.equal(r2.lireJson(cle(A.outilId)).champs.nom, A.nom);
  });
});
