// Authentification et autorisation des modifications.
//
// Cloudflare Access se place devant le Worker : il connecte la personne puis ajoute à chaque
// requête l'en-tête Cf-Access-Jwt-Assertion, un jeton signé par Cloudflare.
// Le Worker ne fait pas confiance à l'en-tête tel quel : il vérifie lui-même la signature
// (clés publiques de l'équipe Access), l'émetteur, l'audience et l'expiration, puis
// l'autorisation (adresse e-mail présente dans la variable EDITEURS).
//
// Réglages lus dans l'environnement du Worker (aucun n'est secret) :
//   ACCESS_TEAM_DOMAIN  ex. « mon-equipe.cloudflareaccess.com »
//   ACCESS_AUD          « Application Audience (AUD) Tag » de l'application Access
//   EDITEURS            adresses autorisées à modifier, séparées par des virgules
// Tant que l'un d'eux manque, les modifications sont désactivées.

const DUREE_CACHE_CLES = 10 * 60 * 1000;
let cacheCles = { domaine: null, cles: null, expire: 0 };

function domaineEquipe(env) {
  const brut = String(env.ACCESS_TEAM_DOMAIN || '').trim().toLowerCase()
    .replace(/^https:\/\//, '').replace(/\/+$/, '');
  return /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(brut) ? brut : null;
}

export function listeEditeurs(env) {
  return String(env.EDITEURS || '').split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
}

// Raison pour laquelle les modifications sont désactivées, ou null si la protection est configurée.
export function protectionManquante(env) {
  if (!env.FICHES) return 'le bucket R2 (liaison FICHES) n\'est pas relié au Worker';
  if (!domaineEquipe(env)) return 'ACCESS_TEAM_DOMAIN n\'est pas configuré';
  if (!String(env.ACCESS_AUD || '').trim()) return 'ACCESS_AUD n\'est pas configuré';
  if (!listeEditeurs(env).length) return 'EDITEURS n\'est pas configuré';
  return null;
}

function base64UrlEnOctets(texte) {
  const b64 = texte.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (texte.length % 4)) % 4);
  const bin = atob(b64);
  const octets = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
  return octets;
}

function decoderJson(partie) {
  return JSON.parse(new TextDecoder().decode(base64UrlEnOctets(partie)));
}

async function clesPubliques(domaine, forcer) {
  if (!forcer && cacheCles.domaine === domaine && cacheCles.expire > Date.now()) return cacheCles.cles;
  const reponse = await fetch(`https://${domaine}/cdn-cgi/access/certs`);
  if (!reponse.ok) throw new Error('clés Access indisponibles');
  const { keys } = await reponse.json();
  cacheCles = { domaine, cles: Array.isArray(keys) ? keys : [], expire: Date.now() + DUREE_CACHE_CLES };
  return cacheCles.cles;
}

const refus = (status, code, message, extra = {}) => ({ ok: false, status, code, message, ...extra });

// Renvoie { ok: true, email } ou { ok: false, status, code, message }.
export async function verifierAcces(request, env) {
  const domaine = domaineEquipe(env);
  const jeton = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jeton) return refus(401, 'non_authentifie', 'Connexion Cloudflare Access requise.');

  let entete, contenu, signature, signe;
  try {
    const parties = jeton.split('.');
    if (parties.length !== 3) throw new Error();
    entete = decoderJson(parties[0]);
    contenu = decoderJson(parties[1]);
    signature = base64UrlEnOctets(parties[2]);
    signe = new TextEncoder().encode(parties[0] + '.' + parties[1]);
  } catch (e) {
    return refus(401, 'jeton_invalide', 'Jeton d\'accès illisible.');
  }
  if (entete.alg !== 'RS256' || !entete.kid) return refus(401, 'jeton_invalide', 'Algorithme de jeton non accepté.');

  let jwk;
  try {
    jwk = (await clesPubliques(domaine, false)).find(k => k.kid === entete.kid);
    if (!jwk) jwk = (await clesPubliques(domaine, true)).find(k => k.kid === entete.kid);
  } catch (e) {
    return refus(503, 'cles_indisponibles', 'Impossible de vérifier la connexion pour le moment.');
  }
  if (!jwk) return refus(401, 'jeton_invalide', 'Clé de signature inconnue.');

  let valide = false;
  try {
    const cle = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    valide = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cle, signature, signe);
  } catch (e) {
    valide = false;
  }
  if (!valide) return refus(401, 'jeton_invalide', 'Signature du jeton invalide.');

  const maintenant = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(contenu.aud) ? contenu.aud : [contenu.aud];
  if (contenu.iss !== `https://${domaine}`) return refus(401, 'jeton_invalide', 'Émetteur du jeton inattendu.');
  if (!audiences.includes(String(env.ACCESS_AUD).trim())) return refus(401, 'jeton_invalide', 'Jeton destiné à une autre application.');
  if (typeof contenu.exp !== 'number' || contenu.exp <= maintenant) return refus(401, 'jeton_expire', 'Connexion expirée, reconnecte-toi.');
  if (typeof contenu.nbf === 'number' && contenu.nbf > maintenant + 60) return refus(401, 'jeton_invalide', 'Jeton pas encore valable.');

  const email = typeof contenu.email === 'string' ? contenu.email.trim().toLowerCase() : '';
  if (!email || !listeEditeurs(env).includes(email)) {
    return refus(403, 'non_autorise', 'Ce compte n\'est pas autorisé à modifier les fiches.', { email: email || null });
  }
  return { ok: true, email };
}
