// Imitation de Cloudflare Access pour les tests : une paire de clés RSA de test,
// des jetons signés comme ceux d'Access, et la réponse de l'adresse des clés publiques.
// Aucune donnée réelle : domaine, audience et adresses sont fictifs.

export const DOMAINE_TEST = 'equipe-test.cloudflareaccess.com';
export const AUD_TEST = 'aud-de-test-0123456789';
export const EDITEUR = 'prof@ecole.example';
export const AUTRE_PERSONNE = 'eleve@ecole.example';

const b64url = octets => Buffer.from(octets).toString('base64url');

async function creerCle(kid) {
  const paire = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']
  );
  const jwk = await crypto.subtle.exportKey('jwk', paire.publicKey);
  return { kid, prive: paire.privateKey, jwkPublic: { ...jwk, kid, alg: 'RS256', use: 'sig' } };
}

export async function preparerAcces() {
  const bonne = await creerCle('cle-test-1');
  const pirate = await creerCle('cle-test-1'); // même kid, autre clé : signature invalide
  let appelsCles = 0;

  // Le Worker télécharge les clés publiques avec fetch : on répond à sa place.
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url, ...reste) => {
    if (String(url) === `https://${DOMAINE_TEST}/cdn-cgi/access/certs`) {
      appelsCles++;
      return new Response(JSON.stringify({ keys: [bonne.jwkPublic] }), { headers: { 'content-type': 'application/json' } });
    }
    return fetchOriginal(url, ...reste);
  };

  async function jeton({ email = EDITEUR, aud = AUD_TEST, iss = `https://${DOMAINE_TEST}`, exp, nbf, cle = bonne, kid } = {}) {
    const maintenant = Math.floor(Date.now() / 1000);
    const entete = { alg: 'RS256', kid: kid || cle.kid, typ: 'JWT' };
    const contenu = { aud: [aud], email, iss, iat: maintenant, exp: exp ?? maintenant + 3600, sub: 'utilisateur-test' };
    if (nbf !== undefined) contenu.nbf = nbf;
    const corps = b64url(JSON.stringify(entete)) + '.' + b64url(JSON.stringify(contenu));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cle.prive, new TextEncoder().encode(corps));
    return corps + '.' + b64url(new Uint8Array(sig));
  }

  return { jeton, bonne, pirate, appelsCles: () => appelsCles, restaurer: () => { globalThis.fetch = fetchOriginal; } };
}

export function envProtege(r2, extra = {}) {
  return {
    FICHES: r2,
    ACCESS_TEAM_DOMAIN: DOMAINE_TEST,
    ACCESS_AUD: AUD_TEST,
    EDITEURS: `${EDITEUR}, autre-editeur@ecole.example`,
    ORIGINES_LECTURE: 'https://gregfour94.github.io',
    ...extra
  };
}
