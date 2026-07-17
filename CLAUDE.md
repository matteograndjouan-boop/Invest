# InvestTrack

## Objectif

Application de suivi financier personnel (patrimoine, investissements, dépenses/revenus,
budgets) **100 % front-end, 100 % locale** : aucun backend, aucune base de données.
Toutes les données vivent dans le `localStorage` du navigateur de l'utilisateur.

Le seul appel réseau « métier » de l'app est l'envoi du **libellé nettoyé** d'une
transaction (jamais le montant, la date, le solde, le numéro de compte ou toute autre
donnée personnelle) à l'API Google Gemini pour suggérer une catégorie. Un mode IA existe
aussi en dernier recours, opt-in, pour les PDF trop atypiques — il envoie alors le texte
complet du relevé à Gemini (même clé API), avec confirmation explicite de l'utilisateur.

## Architecture

- **Pas de build tool, pas de bundler.** `index.html` + `css/style.css` + `js/*.js`
  chargés via `<script src="js/...">` dans l'ordre indiqué en bas de `index.html`.
  Toutes les données vivent dans des objets globaux (`Storage`, `Utils`, `Modal`,
  `BankImport`, etc.) — pas de modules ES, pas d'imports.
- **`build.py`** génère `investtrack-standalone.html` : il inline `css/style.css` et
  tous les `js/*.js` référencés dans `index.html` (dans l'ordre des balises
  `<script src="js/...">`) directement dans le HTML. C'est ce fichier standalone qui
  est destiné à être déposé/partagé tel quel (un seul fichier, aucune dépendance
  locale). **Toujours lancer `python3 build.py` après une modif de JS/CSS/HTML.**
  Important : tout nouveau fichier JS doit être ajouté comme
  `<script src="js/nouveau.js"></script>` dans `index.html` pour être repris par le
  build (le script scanne ces balises, dans l'ordre).
- **Déploiement** : GitHub Pages servi depuis la branche `gh-pages`. C'est la branche
  de développement principale du projet (pas de branche `main` séparée à ce stade).
- **Dépendances CDN** (pas de npm) : Chart.js, SheetJS (`xlsx`), `pdfjs-dist@3.11.174`.
- **Persistance** : `localStorage` uniquement, via l'objet `Storage` (`js/storage.js`)
  — clés `invest_investments`, `invest_expenses`, `invest_budgets`, `invest_patrimony`,
  `invest_revenues`, `invest_categories_v2`, `invest_budgets_v2`, `invest_date_mode`.
  Catégories par défaut : Abonnements, Alimentation, Divers, Epargne, Logement, Loisir,
  Revenus, Santé, Shopping, Transport (chacune avec ses sous-catégories).

### Fichiers principaux

| Fichier | Rôle |
|---|---|
| `index.html` | Squelette de page, nav latérale, une `<section>` par onglet, modal générique, ordre des `<script>`. |
| `build.py` | Génère `investtrack-standalone.html` (CSS + JS inlinés). |
| `js/storage.js` | Accès `localStorage` (get/save par domaine), catégories par défaut. |
| `js/utils.js` | Helpers partagés (formatage date/devise, génération d'ID, picker mois/année, listes de catégories legacy). |
| `js/app.js` | `Modal` (ouverture/fermeture modale générique), `Dashboard`, routing (`navigateTo`), init globale. |
| `js/charts.js` | Wrapper Chart.js (`Charts.create/destroy` par id de canvas, configs des graphiques). |
| `js/period-filter.js` | Filtre de période global (mois/trimestre/semestre/année/plage libre), dropdown, `onChange` listeners. |
| `js/investments.js` | Onglet Portefeuille (positions, allocation, performeurs). |
| `js/expenses.js`, `js/revenues.js` | Onglets Dépenses / Revenus (tableaux, filtres, CRUD manuel). |
| `js/flux.js` | Onglet Flux (vue cash-flow, cross-filtering façon Power BI sur les catégories). |
| `js/comparisons.js` | Comparaison entre deux périodes. |
| `js/budget.js` | Budgets par thème, suivi de consommation. |
| `js/categories.js` | CRUD des catégories/sous-catégories (drag & drop pour réordonner) + **renommage à portée datée** (`_applyRename` : toutes / date charnière (sens `from` ≥ D ou `until` ≤ D) / période ; **lignée datée** `cat.lineage` + `validFrom`/`validTo` portés par la nouvelle version, l'ancienne servant de « base » hors fenêtre — l'import choisit le bon nom selon la date de la dépense via `BankImport._versionedPick`). Mémorise les anciens noms en `aliases` pour la correspondance d'import, exposés par un **badge d'historique 🕘** dans le header de chaque catégorie (toujours visible dès qu'un alias existe ; survol = anciens noms, clic = fenêtre de gestion `_openHistoryModal`/`_histAdd`/`_histRemove`/`_addAliasValue`). Indispensable pour les catégories renommées avant l'ajout de cette mémoire (l'ancien nom doit alors être déclaré manuellement). |
| `js/data-entry.js` | Onglet « Données » : table unifiée dépenses+revenus, recherche, sélection multiple, filtre « Toutes les lignes / Catégorie réaffectée / Sous-catégorie réaffectée » (`_reassignScope`, aussi source du badge de ligne). En mode sélection, la barre groupée propose Modifier (actif sur exactement 1 ligne — réutilise le formulaire d'édition), Réaffecter (dès 1 ligne — voir ci-dessous) et Supprimer. Une icône 🏷️ par ligne (colonne Actions, à côté de ✏️/🗑️) réaffecte rapidement une seule ligne sans passer par la sélection (`reassignOne`, même modale). Une ligne réaffectée porte un badge 🏷️ à côté de sa catégorie ou de sa sous-catégorie selon la portée réellement appliquée (survol = valeur précédente, clic = annuler via `undoReassign`, un seul niveau) ; le marqueur `reassignedFrom` est effacé par toute édition manuelle ultérieure (`save` remplace l'objet entier). **Réaffecter** change catégorie et/ou sous-catégorie de toutes les lignes ciblées en une fois — dépenses, revenus et investissements (Épargne), via un sélecteur de Type qui suit `Categories._TYPES` (les mêmes thèmes que l'onglet Catégories : un thème ajouté là-bas apparaît ici sans code supplémentaire). Basculer entre le thème Revenus et un thème Dépense/Investissement déplace l'enregistrement entre `invest_expenses` et `invest_revenues` (nouvel id, comme `save` pour un changement de type manuel ; `effectiveDate` abandonné en entrant dans Revenus) — `undoReassign` sait refaire la bascule en sens inverse. |
| `js/patrimony.js` | Onglet Patrimoine (actifs/passifs manuels + valorisation du portefeuille). |
| `js/invest-import.js` | Import de positions de portefeuille depuis un export courtier (CSV/Excel). |
| `js/gemini-cat.js` | `GeminiCat` — catégorisation via l'API Gemini. **N'envoie jamais que le libellé**, avec cache local (`invest_gemini_cache`) et apprentissage des corrections manuelles (`learn()`). |
| `js/bank-import.js` | `BankImport` — pipeline d'import de relevé bancaire (CSV/Excel + PDF) en **3 fenêtres** : (1) mapping/encadrement, (2) **revue 100 % locale** (`_showPreview` stage `'local'` : date, mois effectif, montant, **libellé nettoyé** `descriptionClean` via `_cleanLabel` — retire dates (y compris 6/8 chiffres et marqueur « DU JJMMAA »), n° de carte, codes de référence longs (`_looksLikeCode`) et étiquettes SEPA ; AUCUN envoi), (3) **étape IA explicite** (`_runAiStep` → stage `'ai'`) : seuls les libellés nettoyés cochés partent à Gemini, qui renvoie `{name, category, subcategory}` (nom du commerçant mis en forme + catégorie) → import. `_cleanLabels` partagé PDF/tableur. Cache Gemini indexé par `descriptionClean` ; fallback `_smartGuess` sans clé. Conserve `descriptionRaw` ; `needsReview` si plus aucune lettre. |
| `js/pdf-zones.js` | `PdfZones` — méthode principale d'extraction des relevés PDF : l'utilisateur encadre les colonnes (Date, Date 2 optionnelle, Montant unique ou Débit/Crédit, Libellé) sur la page rendue par pdf.js ; extraction 100 % locale, gabarit mémorisé par banque. |
| `css/style.css` | Toutes les feuilles de style (un seul fichier, pas de préprocesseur). |

## Fonctionnalités déjà implémentées

- **Dashboard** : vue d'ensemble (solde du mois, épargne, tendances).
- **Portefeuille** : positions, allocation, valorisation, import de positions courtier.
- **Flux** : cash-flow par catégorie avec cross-filtering, filtre de période global partagé entre onglets.
- **Comparaisons** : deux périodes côte à côte.
- **Budgets** : par thème, suivi de consommation.
- **Dépenses / Revenus / Données** : CRUD manuel, recherche, filtres, sélection multiple, édition en masse, tri.
- **Catégories** : CRUD complet avec sous-catégories, réordonnancement par drag & drop.
- **Patrimoine** : actifs/passifs manuels + valorisation auto du portefeuille.
- **Import bancaire (CSV/Excel)** : détection automatique de la ligne d'en-tête, mapping de colonnes (assisté + mémorisable par profil de banque), gestion date unique ou Jour/Mois/Année séparés, montant signé ou Débit/Crédit séparés, détection de doublons (date+libellé+montant).
- **Import bancaire (PDF) — méthode principale** : encadrement de zones par l'utilisateur (`js/pdf-zones.js`), pré-rempli automatiquement par détection de clusters x (dates/montants), mémorisation du gabarit par banque (signature = en-tête + dimensions de page), badge « Format reconnu », extraction multi-pages, détection des PDF scannés (pas d'OCR, message explicite).
- **Import bancaire (PDF) — dernier recours** : envoi du texte complet du relevé à Gemini (même clé API que la catégorisation, via `GeminiCat._generate`), opt-in explicite + confirmation, accessible depuis l'écran d'encadrement quand l'extraction locale échoue.
- **Catégorisation automatique** : Gemini (libellé uniquement) avec cache local et apprentissage des corrections ; fallback local par mots-clés (`guessCategory` dans `app.js`/`_smartGuess` dans `bank-import.js`) si pas de clé API ou erreur réseau.
- **Correspondance des catégories à l'import (tableur)** : si le fichier a une colonne « Catégorie » (et/ou « Sous-catégorie »), correspondance exacte (insensible casse/accents/espaces, **reconnaît aussi les anciens noms `aliases`** d'une catégorie renommée, en priorisant les catégories actives ; pour une catégorie renommée à portée datée, `_versionedPick` choisit la version selon la **date de la dépense**) → sinon Gemini sur le **seul nom de catégorie** (`GeminiCat.matchCategories`, cache `invest_cat_map_cache` consultable/éditable dans les paramètres) → sinon fallback sur le libellé. Origine indiquée dans l'aperçu par pastille (🟢 fichier · 🟡 approchée · 🔵 IA · ⚪ à catégoriser).
- **Date effective** (période réellement concernée, granularité mois `YYYY-MM`) : champ `effectiveDate` mappable à l'import (wizard + édition par ligne dans l'aperçu), éditable dans Données, et toggle global « Date comptable / Date effective » (`Storage.getDateMode` + `Utils.getExpenseDate`) respecté par Flux, Budget et Comparaisons.
- **Confidentialité par construction** : seul le libellé nettoyé (ou, pour la correspondance de catégories, le seul nom de catégorie) part vers Gemini ; toute autre donnée (montant, date, solde, IBAN, titulaire...) reste strictement locale, sauf opt-in explicite pour le mode IA de dernier recours (PDF → Gemini).

## Conventions de code

- **Vanilla JS, objets globaux** (`const Module = { ... }`), pas de classes ES, pas de framework, pas de build step pour le JS lui-même (seul `build.py` inline les fichiers).
- **Style des modules** : chaque fichier `js/xxx.js` expose un seul objet global en `PascalCase` (`Storage`, `BankImport`, `PdfZones`, `GeminiCat`...) avec des méthodes publiques sans préfixe et des méthodes privées préfixées par `_` (ex. `_cleanLabel`, `_matchCat`, `_renderEditor`).
- **Commentaires en français**, concis, uniquement quand le pourquoi n'est pas évident (contrainte cachée, contournement, comportement surprenant) — pas de commentaires qui répètent ce que le code dit déjà.
- **Pas de dépendances ajoutées sans nécessité** : tout passe par CDN (`<script src="https://...">`), jamais de `npm install`/`package.json`.
- **Confidentialité non négociable** : toute nouvelle fonctionnalité qui touche à l'IA doit respecter la règle « seul le libellé part vers Gemini » ; tout envoi de données plus large (comme le mode PDF dernier recours) doit rester strictement opt-in avec confirmation explicite affichée à l'utilisateur.
- **Pièges connus à éviter** :
  - Un `<select>` dont aucune `<option>` n'a `selected` retombe silencieusement sur la première option — toujours normaliser/matcher (voir `_matchCat`/`_matchSubcat` dans `bank-import.js`) avant de construire les options, sous peine de catégorisation silencieusement fausse.
  - Toute donnée financière sensible (montant, date, IBAN...) ne doit jamais transiter par une requête réseau, même indirectement via un libellé mal nettoyé.
- **Après toute modification de `index.html`, `css/style.css` ou `js/*.js`** : relancer `python3 build.py` pour régénérer `investtrack-standalone.html` (sinon les deux fichiers divergent).

## Ce qui reste à faire / pistes connues

- **Tests manuels PDF zones non faits** : `js/pdf-zones.js` (encadrement, drag souris/tactile, extraction multi-pages) n'a jamais été testé dans un vrai navigateur sur un relevé réel — à valider en priorité avant de considérer la fonctionnalité comme fiable (golden path + relevés à 2 colonnes de date, Débit/Crédit séparés, multi-pages, PDF scanné).
- **OCR non géré** : les PDF scannés (sans couche texte) sont détectés et signalés à l'utilisateur, mais aucun traitement OCR n'est implémenté — hors périmètre pour l'instant si le besoin se confirme.
- **Modèle de données Revenus dupliqué** : `js/utils.js` (`Utils.REVENUE_CATEGORIES` : Salaire/Freelance/Remboursement/Loyer perçu/Autre) reste utilisé par l'ancienne page `js/revenues.js` et par le formulaire d'ajout/édition d'`js/data-entry.js` (`_form`/`save`, champ `rev_category`), séparément de la vraie catégorie « Revenus » de `Storage.getCategories()` utilisée par le pipeline d'import bancaire (`_revenueCat`/`_revenueSubcats` dans `bank-import.js`) et par **Réaffecter** (`js/data-entry.js`, qui peut donc migrer une ligne du modèle legacy vers le vrai). Une unification propre (faire pointer `_form`/`revenues.js` sur les vraies catégories/sous-catégories) clarifierait le modèle.
- **Pas de README** séparé — ce fichier `CLAUDE.md` fait office de point d'entrée technique ; à scinder si le projet grossit encore (ex. un `README.md` côté utilisateur + ce `CLAUDE.md` côté développement).
- **Pas de tests automatisés** (unitaires ou e2e) sur le projet — à évaluer si la complexité de l'extraction PDF/catégorisation justifie d'en ajouter.
