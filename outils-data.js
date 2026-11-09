// Liste de départ des outils (anciennement écrite directement dans outils.html).
// Elle sert :
//  - à afficher la page quand le Worker ne répond pas ;
//  - à l'initialisation unique des fiches dans R2 (jamais pour écraser une fiche existante).
//
// outilId est l'identifiant technique stable de chaque outil : il a été tiré au hasard
// une seule fois et ne dépend ni du nom, ni de l'URL, ni de la position dans la liste.
// Ne jamais le modifier ni le réutiliser pour un autre outil.

export const CATEGORIES = {
  code: 'Code et édition',
  apps: 'Prototypage d\'applications',
  context: 'Contexte et intégrations',
  quality: 'Tests et sécurité',
  delivery: 'Déploiement',
  operations: 'Espaces de travail',
  inspiration: 'Inspiration design',
  ui: 'Composants UI',
  motion: 'Animations et effets',
  learning: 'Apprendre'
};

export const OUTILS_INITIAUX = [
  { outilId: 'o-d9c99e37', nom: 'Aider', url: 'https://github.com/Aider-AI/aider', description: 'Pair programming en terminal avec des modèles cloud ou locaux et une intégration Git.', categorie: 'code', type: 'CLI' },
  { outilId: 'o-60a70acc', nom: 'Claude Code', url: 'https://code.claude.com/docs/en/overview', description: 'Assistant de code agentique en terminal et par projet.', categorie: 'code', type: 'CLI' },
  { outilId: 'o-c850ac52', nom: 'Cline', url: 'https://github.com/cline/cline', description: 'Agent de code pour IDE, terminal et desktop, avec outils fichiers, commandes et navigateur.', categorie: 'code', type: 'IDE' },
  { outilId: 'o-8fb64e8e', nom: 'Cursor', url: 'https://www.cursor.com/', description: 'Éditeur et agent de code pour implémenter, déboguer et relire.', categorie: 'code', type: 'IDE' },
  { outilId: 'o-207a0e7b', nom: 'Gemini CLI', url: 'https://github.com/google-gemini/gemini-cli', description: 'Agent de code open source en terminal (clé API ou Vertex).', categorie: 'code', type: 'CLI' },
  { outilId: 'o-4fa5adf1', nom: 'GitHub Copilot', url: 'https://github.com/features/copilot', description: 'Assistance au code et agents dans GitHub et les IDE.', categorie: 'code', type: 'IDE' },
  { outilId: 'o-b43b820c', nom: 'Goose', url: 'https://github.com/aaif-goose/goose', description: 'Agent local extensible avec interfaces desktop et CLI, et outils MCP.', categorie: 'code', type: 'CLI' },
  { outilId: 'o-38ec0656', nom: 'Kiro', url: 'https://kiro.dev', description: 'Agent de code AWS avec spécifications et tests.', categorie: 'code', type: 'IDE' },
  { outilId: 'o-8776af9e', nom: 'OpenAI Codex CLI', url: 'https://openai.com/codex/', description: 'Agent de code OpenAI qui tourne en local dans le terminal.', categorie: 'code', type: 'CLI' },
  { outilId: 'o-381e0bad', nom: 'Pi', url: 'https://github.com/earendil-works/pi', description: 'Agent de code en terminal, extensible, sous licence MIT.', categorie: 'code', type: 'CLI' },

  { outilId: 'o-83f1548b', nom: 'Bolt.new', url: 'https://bolt.new/', description: 'Créer des applications en langage naturel, par StackBlitz.', categorie: 'apps', type: 'Web' },
  { outilId: 'o-8e16ba15', nom: 'Dyad', url: 'https://github.com/dyad-sh/dyad', description: 'Créer des applications en local avec le modèle de ton choix.', categorie: 'apps', type: 'Desktop' },
  { outilId: 'o-13281cef', nom: 'Lovable', url: 'https://lovable.dev/', description: 'Générer des applications full-stack avec Supabase.', categorie: 'apps', type: 'Web' },
  { outilId: 'o-fdf4c9b5', nom: 'Onlook', url: 'https://www.onlook.com/', description: 'Modifier visuellement une interface tout en travaillant sur le code.', categorie: 'apps', type: 'Web' },
  { outilId: 'o-53aba60b', nom: 'Replit', url: 'https://replit.com/', description: 'Créer et faire évoluer des applications avec Replit Agent.', categorie: 'apps', type: 'Web' },
  { outilId: 'o-3440258d', nom: 'v0', url: 'https://v0.app/', description: 'L\'IA de Vercel pour générer des interfaces et du React.', categorie: 'apps', type: 'Web' },

  { outilId: 'o-f3528fba', nom: 'Caliber', url: 'https://github.com/caliber-ai-org/ai-setup', description: 'Génère et synchronise les configurations d\'agents (Claude Code, Cursor, Codex).', categorie: 'context', type: 'CLI' },
  { outilId: 'o-16747a94', nom: 'Context7', url: 'https://github.com/upstash/context7', description: 'Donne la documentation à jour des bibliothèques à ton agent.', categorie: 'context', type: 'MCP' },
  { outilId: 'o-258fbfea', nom: 'Filesystem MCP', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem', description: 'Accès contrôlé aux fichiers du projet pour les agents.', categorie: 'context', type: 'MCP' },
  { outilId: 'o-af3e37d5', nom: 'GitHub MCP', url: 'https://github.com/github/github-mcp-server', description: 'Connecte dépôts, issues et pull requests à ton agent.', categorie: 'context', type: 'MCP' },
  { outilId: 'o-ecc08c65', nom: 'Neon', url: 'https://github.com/neondatabase/mcp-server-neon', description: 'Connecte ton agent aux bases de données Neon.', categorie: 'context', type: 'MCP' },
  { outilId: 'o-92fa52d0', nom: 'Notion MCP', url: 'https://developers.notion.com/guides/mcp/overview', description: 'Chercher, lire et mettre à jour du contenu Notion.', categorie: 'context', type: 'MCP' },
  { outilId: 'o-b75751ba', nom: 'OpenSpec', url: 'https://github.com/Fission-AI/OpenSpec', description: 'Développement piloté par les spécifications pour assistants IA.', categorie: 'context', type: 'CLI' },
  { outilId: 'o-3f65c9ed', nom: 'Supabase MCP', url: 'https://github.com/supabase/mcp', description: 'Schémas, requêtes et configuration de projets Supabase.', categorie: 'context', type: 'MCP' },
  { outilId: 'o-7e0622fb', nom: 'DESIGN.md', url: '', description: 'Des design systems écrits en Markdown que ton agent peut lire.', categorie: 'context', type: 'Markdown' },

  { outilId: 'o-10b528aa', nom: 'Agent QA', url: 'https://github.com/vostride/agent-qa', description: 'Écrire et lancer des tests web et mobile en langage naturel.', categorie: 'quality', type: 'MCP' },
  { outilId: 'o-092615c5', nom: 'Playwright MCP', url: 'https://github.com/microsoft/playwright-mcp', description: 'Automatisation officielle du navigateur par Microsoft.', categorie: 'quality', type: 'MCP' },
  { outilId: 'o-1b8952da', nom: 'PR-Agent', url: 'https://github.com/The-PR-Agent/pr-agent', description: 'Relecteur de pull requests maintenu par la communauté.', categorie: 'quality', type: 'CLI' },
  { outilId: 'o-60b23528', nom: 'Prbl', url: 'https://getprbl.com', description: 'Trouve les failles fréquentes du code généré par IA. Scan gratuit.', categorie: 'quality', type: 'Web' },
  { outilId: 'o-b611f758', nom: 'Qodo', url: 'https://www.qodo.ai', description: 'Revue de code par IA (anciennement CodiumAI).', categorie: 'quality', type: 'Web' },
  { outilId: 'o-76918df9', nom: 'Semgrep MCP', url: 'https://github.com/semgrep/semgrep/tree/develop/cli/src/semgrep/mcp', description: 'Analyse de sécurité du code via Semgrep.', categorie: 'quality', type: 'MCP' },
  { outilId: 'o-edb20d0a', nom: 'Sentry', url: 'https://github.com/getsentry/sentry-mcp', description: 'Inspecter les erreurs d\'une application et diagnostiquer les échecs.', categorie: 'quality', type: 'MCP' },

  { outilId: 'o-c3699dc4', nom: 'Cloudflare', url: 'https://github.com/cloudflare/mcp-server-cloudflare', description: 'Gérer le déploiement d\'applications et les ressources cloud.', categorie: 'delivery', type: 'MCP' },
  { outilId: 'o-46056b1e', nom: 'E2B', url: 'https://github.com/e2b-dev/E2B', description: 'Sandbox cloud sécurisée pour agents IA.', categorie: 'delivery', type: 'Cloud' },
  { outilId: 'o-c27b2346', nom: 'Publish.my', url: 'https://publish.my/', description: 'Publier des sites statiques depuis un agent.', categorie: 'delivery', type: 'Web' },
  { outilId: 'o-5050c390', nom: 'XcodeBuildMCP', url: 'https://github.com/getsentry/XcodeBuildMCP', description: 'Compiler, lancer et déboguer des projets Apple.', categorie: 'delivery', type: 'MCP' },

  { outilId: 'o-1cdf3b0c', nom: 'Delta (Zed)', url: 'https://delta.dev/', description: 'Espace de travail multijoueur pour agents de code, avec revue par fils.', categorie: 'operations', type: 'Desktop' },
  { outilId: 'o-a202d37a', nom: 'Duckweed', url: 'https://github.com/MusicMaster4/Duckweed', description: 'Agents, shells et diffs Git dans un espace de travail local.', categorie: 'operations', type: 'Desktop' },
  { outilId: 'o-f75f3d5c', nom: 'llm.log', url: 'https://github.com/lanesket/llm.log', description: 'Voir les coûts, tokens et requêtes des modèles via un proxy local.', categorie: 'operations', type: 'CLI' },
  { outilId: 'o-385c3943', nom: 'Parallel Code', url: 'https://github.com/johannesjo/parallel-code', description: 'Agents en parallèle dans des worktrees Git isolés.', categorie: 'operations', type: 'Desktop' },
  { outilId: 'o-25e308ef', nom: 'Shep', url: 'https://github.com/shep-ai/shep', description: 'Orchestrer des agents en parallèle jusqu\'aux brouillons de PR.', categorie: 'operations', type: 'CLI' },
  { outilId: 'o-597fedc9', nom: 'Superagent', url: 'https://github.com/pungme/superagent-desktop', description: 'Claude Code ou Codex dans un espace de travail macOS.', categorie: 'operations', type: 'Desktop' },
  { outilId: 'o-3d60003f', nom: 'usage', url: 'https://github.com/aqua5230/usage', description: 'Voir les quotas de tes agents de code depuis la barre de menu.', categorie: 'operations', type: 'Desktop' },
  { outilId: 'o-06eaf181', nom: 'Warp Terminal', url: 'https://www.warp.dev/terminal', description: 'Terminal pensé pour travailler avec des agents.', categorie: 'operations', type: 'Desktop' },

  { outilId: 'o-436f0944', nom: 'Minimal Gallery', url: 'https://minimal.gallery', description: 'Sites haut de gamme sélectionnés pour nourrir ton agent.', categorie: 'inspiration', type: 'Galerie' },
  { outilId: 'o-93e281aa', nom: 'Godly', url: 'https://godly.website', description: 'Sites choisis à la main pour la qualité de leur design.', categorie: 'inspiration', type: 'Galerie' },
  { outilId: 'o-bf94ad9e', nom: 'Refero Styles', url: 'https://styles.refero.design', description: 'Plus de 2 000 styles de vrais produits, avec typographie.', categorie: 'inspiration', type: 'Galerie' },
  { outilId: 'o-628d2462', nom: 'Component Gallery', url: 'https://component.gallery', description: 'Plus de 3 000 exemples : comment les grands design systems résolvent le même élément.', categorie: 'inspiration', type: 'Galerie' },
  { outilId: 'o-54e206fb', nom: 'Mobbin', url: 'https://mobbin.com', description: 'Les parcours d\'applications réelles, écran par écran.', categorie: 'inspiration', type: 'Galerie' },
  { outilId: 'o-dd487df7', nom: 'Awwwards', url: 'https://www.awwwards.com', description: 'Les sites qui ont vraiment gagné des prix.', categorie: 'inspiration', type: 'Galerie' },

  { outilId: 'o-7ee6adf7', nom: 'shadcn/ui', url: 'https://ui.shadcn.com', description: 'Toujours la référence pour une UI propre et réutilisable.', categorie: 'ui', type: 'React' },
  { outilId: 'o-4deaf7d9', nom: '21st.dev', url: 'https://21st.dev', description: 'Registre de composants qui se branche à ton agent via MCP.', categorie: 'ui', type: 'MCP' },
  { outilId: 'o-7986a1dc', nom: 'Aceternity UI', url: 'https://ui.aceternity.com', description: 'Plus de 200 composants React/Tailwind animés.', categorie: 'ui', type: 'React' },
  { outilId: 'o-066ca553', nom: 'Magic UI', url: 'https://magicui.design', description: 'Composants soignés pour les applications web modernes.', categorie: 'ui', type: 'React' },
  { outilId: 'o-d3e5f43c', nom: 'Uiverse', url: 'https://uiverse.io', description: 'Éléments d\'interface créés par la communauté.', categorie: 'ui', type: 'CSS' },
  { outilId: 'o-7483da13', nom: 'Shadcn Blocks', url: 'https://www.shadcnblocks.com', description: 'Des sections complètes, pas seulement des boutons.', categorie: 'ui', type: 'React' },
  { outilId: 'o-f334ec3b', nom: 'mapcn', url: 'https://mapcn.dev', description: 'Composants de cartes : marqueurs, itinéraires, popups.', categorie: 'ui', type: 'React' },
  { outilId: 'o-c70776db', nom: '3D Icons', url: 'https://3dicons.co', description: 'Bibliothèque d\'icônes 3D gratuites pour les interfaces modernes.', categorie: 'ui', type: 'Icônes' },

  { outilId: 'o-5e440414', nom: 'Motion Primitives', url: 'https://motion-primitives.com', description: 'Composants d\'animation et d\'interaction prêts à l\'emploi.', categorie: 'motion', type: 'React' },
  { outilId: 'o-47b2aeaf', nom: 'Gradient Buttons', url: 'https://gradientbuttons.colorion.co', description: 'Styles et effets de boutons en dégradé.', categorie: 'motion', type: 'CSS' },
  { outilId: 'o-d9c2663b', nom: 'Shadertoy', url: 'https://www.shadertoy.com', description: 'Des shaders à étudier et à remixer.', categorie: 'motion', type: 'WebGL' },
  { outilId: 'o-16791d18', nom: 'Anime.js', url: 'https://animejs.com', description: 'Bibliothèque JavaScript légère pour animer le web.', categorie: 'motion', type: 'JS' },
  { outilId: 'o-06343ed3', nom: 'Liquid Glass', url: '', description: 'Composants et effets de verre avec réfraction.', categorie: 'motion', type: 'CSS' },
  { outilId: 'o-3151bfba', nom: 'CSS Text Effects', url: '', description: 'Animations et effets de texte créatifs en CSS.', categorie: 'motion', type: 'CSS' },

  { outilId: 'o-bc472bd0', nom: 'Vibe Coding with Confidence', url: 'https://zalt.me/guides/vibe-coding', description: 'Manuel avec chapitres d\'introduction gratuits (en anglais).', categorie: 'learning', type: 'Guide' },
  { outilId: 'o-40cf5167', nom: 'Agentic Coding (Armin Ronacher)', url: 'https://lucumr.pocoo.org/2025/6/12/agentic-coding/', description: 'Conseils pratiques pour travailler avec des agents et tester.', categorie: 'learning', type: 'Guide' },
  { outilId: 'o-065c6f85', nom: 'Simon Willison : LLMs pour coder', url: 'https://simonwillison.net/2025/Mar/11/using-llms-for-code/', description: 'Pratiques itératives de code et de vérification.', categorie: 'learning', type: 'Guide' },
  { outilId: 'o-f8c33f54', nom: 'Secure Vibe Coding Guide (CSA)', url: 'https://cloudsecurityalliance.org/blog/2025/04/09/secure-vibe-coding-guide', description: 'Checklist sécurité : secrets, autorisations, validation, revue.', categorie: 'learning', type: 'Guide' },
  { outilId: 'o-76017c9e', nom: 'Context Engineering Intro', url: 'https://github.com/coleam00/context-engineering-intro', description: 'Exemples de contexte et d\'instructions pour agents de code.', categorie: 'learning', type: 'Guide' },
  { outilId: 'o-ca872825', nom: 'Model Context Protocol', url: 'https://modelcontextprotocol.io/', description: 'Introduction officielle à MCP, qui connecte les agents aux outils.', categorie: 'learning', type: 'Guide' },
  { outilId: 'o-3db987b1', nom: 'VDLC (Roboco)', url: 'https://vdlc.roboco.io/', description: 'Cycle de vie du vibe coding en six étapes, avec validation humaine.', categorie: 'learning', type: 'Guide' }
];
