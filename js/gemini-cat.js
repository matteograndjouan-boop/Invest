// Module de catégorisation automatique via Google Gemini (gratuit)
//
// CONFIDENTIALITÉ : seuls les libellés/descriptions des transactions sont envoyés
// à l'API Gemini. Jamais les montants, dates, soldes, numéros de compte,
// noms de titulaires ou toute autre information personnelle ou financière.
// Tout le reste reste strictement en local dans le navigateur.
const GeminiCat = {
  _CACHE_KEY:  'invest_gemini_cache',
  _CATMAP_KEY: 'invest_cat_map_cache', // correspondances « catégorie du fichier » → catégorie de l'app
  _MODEL:     'gemini-2.0-flash-lite', // modèle gratuit Google AI Studio

  getApiKey() { return localStorage.getItem('gemini_api_key') || ''; },
  saveApiKey(key) {
    if (key) localStorage.setItem('gemini_api_key', key);
    else localStorage.removeItem('gemini_api_key');
  },

  _getCache() {
    try { return JSON.parse(localStorage.getItem(this._CACHE_KEY) || '{}'); }
    catch { return {}; }
  },
  _saveCache(cache) {
    try { localStorage.setItem(this._CACHE_KEY, JSON.stringify(cache)); }
    catch (e) { console.warn('[GeminiCat] Erreur cache:', e); }
  },

  // Clé de cache = libellé DÉJÀ nettoyé en amont (BankImport._cleanLabel : dates et
  // numéros de carte retirés), simplement mis en minuscules et espaces normalisés.
  // On ne re-décode rien ici — le nettoyage est fait une seule fois, avant l'appel.
  _normalize(label) {
    return String(label || '').toLowerCase().replace(/\s+/g, ' ').trim();
  },

  // Apprend une correction manuelle et l'enregistre dans le cache.
  // Appelé quand l'utilisateur modifie manuellement la catégorie d'une transaction.
  learn(rawLabel, category, subcategory) {
    const key = this._normalize(rawLabel);
    if (!key) return;
    const cache = this._getCache();
    cache[key] = { category, subcategory: subcategory || '' };
    this._saveCache(cache);
  },

  // Point d'entrée principal : catégorise un tableau de libellés.
  // Retourne un objet { "libellé": { category, subcategory } }
  // 1. Vérifie le cache → 2. Appelle Gemini pour les inconnus → 3. Fallback mots-clés
  async categorize(labels, userCategories) {
    const cache   = this._getCache();
    const result  = {};
    const toFetch = [];

    // Séparation : libellés connus (cache) vs inconnus (à envoyer à Gemini)
    for (const label of labels) {
      const key = this._normalize(label);
      if (cache[key]) {
        result[label] = cache[key];
      } else {
        result[label] = null;
        toFetch.push(label);
      }
    }

    if (!toFetch.length) return result;

    const apiKey = this.getApiKey();
    if (apiKey) {
      try {
        const geminiResult = await this._callGemini(toFetch, userCategories);
        const updatedCache = this._getCache();
        for (const label of toFetch) {
          const cat = geminiResult[label] || { category: guessCategory(label), subcategory: '' };
          result[label] = cat;
          const key = this._normalize(label);
          if (key) updatedCache[key] = cat;
        }
        this._saveCache(updatedCache);
      } catch (err) {
        console.warn('[GeminiCat] Fallback mots-clés (' + err.message + ')');
        for (const label of toFetch) {
          result[label] = { category: guessCategory(label), subcategory: '' };
        }
      }
    } else {
      // Pas de clé API → fallback silencieux sur la détection par mots-clés
      for (const label of toFetch) {
        result[label] = { category: guessCategory(label), subcategory: '' };
      }
    }

    return result;
  },

  clearCache() {
    localStorage.removeItem(this._CACHE_KEY);
  },

  // Appel effectif à l'API Gemini.
  // SEULS les libellés (texte du libellé bancaire) sont transmis — rien d'autre.
  async _callGemini(labels, userCategories) {
    // Liste des catégories (et sous-catégories) de l'app — SANS table de synonymes
    // ni descriptions codées en dur : Gemini comprend les libellés bruts tout seul.
    const catBlock = (userCategories.length && typeof userCategories[0] === 'object')
      ? userCategories.map(c => {
          const subs = (c.subcategories || []).join(', ');
          return subs ? `• ${c.name} (sous-catégories : ${subs})` : `• ${c.name}`;
        }).join('\n')
      : userCategories.map(c => `• ${c}`).join('\n');

    const labelLines = labels.map((l, i) => `${i + 1}. "${l}"`).join('\n');

    const prompt =
`Voici une liste de libellés de transactions bancaires françaises.
Pour chacun, retourne LA catégorie et LA sous-catégorie les plus adaptées,
choisies UNIQUEMENT parmi cette liste :
${catBlock}

Si aucune sous-catégorie ne convient, laisse "s" vide.

Libellés :
${labelLines}

Réponds UNIQUEMENT en JSON valide, sans aucun texte autour :
{"r":[{"i":1,"c":"catégorie","s":"sous-catégorie ou vide"}]}`;


    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this._MODEL}:generateContent?key=${this.getApiKey()}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      }
    );

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini HTTP ${resp.status}`);
    }

    const data  = await resp.json();
    const text  = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Réponse Gemini non-JSON');

    const parsed  = JSON.parse(match[0]);
    const results = {};
    (parsed.r || []).forEach(item => {
      const label = labels[item.i - 1];
      if (label) results[label] = { category: item.c || '', subcategory: item.s || '' };
    });
    return results;
  },

  // ── CORRESPONDANCE DE CATÉGORIES (import : colonne « Catégorie » du fichier) ──
  //
  // CONFIDENTIALITÉ : seul le NOM de catégorie du fichier (1-3 mots) + la liste des
  // catégories de l'app sont envoyés à Gemini. Aucun montant, date, libellé ni
  // donnée personnelle — encore plus restreint que la catégorisation par libellé.

  _normCat(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ').trim();
  },
  getCatMapCache() {
    try { return JSON.parse(localStorage.getItem(this._CATMAP_KEY) || '{}'); }
    catch { return {}; }
  },
  _saveCatMapCache(cache) {
    try { localStorage.setItem(this._CATMAP_KEY, JSON.stringify(cache)); }
    catch (e) { console.warn('[GeminiCat] Erreur cache cat-map:', e); }
  },
  clearCatMapCache() { localStorage.removeItem(this._CATMAP_KEY); },

  // Mémorise une correspondance (trouvée par Gemini ou corrigée à la main).
  learnCatMatch(fileCat, category, subcategory) {
    const key = this._normCat(fileCat);
    if (!key || !category) return;
    const cache = this.getCatMapCache();
    cache[key] = { category, subcategory: subcategory || '', original: cache[key]?.original || String(fileCat).trim() };
    this._saveCatMapCache(cache);
  },

  // Renvoie { "<nom fichier>": "<catégorie app>" } pour les noms demandés.
  // 1) cache → 2) Gemini pour les inconnus. Sans clé/erreur : les inconnus restent absents.
  async matchCategories(fileCatNames, userCategories) {
    const cache  = this.getCatMapCache();
    const result = {};
    const toFetch = [];
    for (const name of fileCatNames) {
      const key = this._normCat(name);
      if (cache[key]) result[name] = cache[key].category;
      else if (!toFetch.includes(name)) toFetch.push(name);
    }
    if (!toFetch.length || !this.getApiKey()) return result;
    try {
      const fetched = await this._callGeminiCatMatch(toFetch, userCategories);
      const updated = this.getCatMapCache();
      for (const name of toFetch) {
        const appCat = fetched[name];
        if (appCat) {
          result[name] = appCat;
          updated[this._normCat(name)] = { category: appCat, subcategory: '', original: String(name).trim() };
        }
      }
      this._saveCatMapCache(updated);
    } catch (err) {
      console.warn('[GeminiCat] matchCategories fallback (' + err.message + ')');
    }
    return result;
  },

  async _callGeminiCatMatch(names, userCategories) {
    const appList = userCategories.map(c => (typeof c === 'object' ? c.name : c)).join(', ');
    const lines   = names.map((n, i) => `${i + 1}. "${n}"`).join('\n');
    const prompt =
`On importe des transactions dont les catégories viennent d'un autre outil.
Catégories disponibles dans l'app : ${appList}.

Pour chaque catégorie ci-dessous, donne la catégorie de l'app la plus proche PAR LE SENS
(ex : "Salaire"→"Revenus", "Vacances"→"Loisir", "Médecin"→"Santé").
Utilise UNIQUEMENT une catégorie de la liste ci-dessus. Si vraiment aucune ne convient, mets "".

${lines}

Réponds UNIQUEMENT en JSON valide : {"r":[{"i":1,"c":"catégorie app ou vide"}]}`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this._MODEL}:generateContent?key=${this.getApiKey()}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      }
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini HTTP ${resp.status}`);
    }
    const data  = await resp.json();
    const text  = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Réponse Gemini non-JSON');
    const parsed  = JSON.parse(match[0]);
    const results = {};
    (parsed.r || []).forEach(item => {
      const name = names[item.i - 1];
      if (name && item.c) results[name] = item.c;
    });
    return results;
  },
};
