// Module de catégorisation automatique via Google Gemini (gratuit)
//
// CONFIDENTIALITÉ : seuls les libellés/descriptions des transactions sont envoyés
// à l'API Gemini. Jamais les montants, dates, soldes, numéros de compte,
// noms de titulaires ou toute autre information personnelle ou financière.
// Tout le reste reste strictement en local dans le navigateur.
const GeminiCat = {
  _CACHE_KEY: 'invest_gemini_cache',
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

  // Normalise un libellé pour la clé de cache :
  // supprime les dates et codes de référence qui varient à chaque transaction
  // pour que "CB CARREFOUR 01/06" et "CB CARREFOUR 15/07" matchent la même entrée
  _normalize(label) {
    return String(label).toUpperCase()
      .replace(/\b\d{2}[\/\-]\d{2}([\/\-]\d{2,4})?\b/g, '') // dates JJ/MM ou JJ/MM/AAAA
      .replace(/\b[A-Z0-9*]{8,}\b/g, '')                      // codes de référence longs
      .replace(/\b\d+\b/g, '')                                 // autres chiffres isolés
      .replace(/\s+/g, ' ')
      .trim();
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

  // Appel effectif à l'API Gemini.
  // SEULS les libellés (texte du libellé bancaire) sont transmis — rien d'autre.
  async _callGemini(labels, userCategories) {
    const catList   = userCategories.join(', ');
    // On envoie uniquement les libellés, numérotés, sans aucune autre donnée
    const labelLines = labels.map((l, i) => `${i + 1}. "${l}"`).join('\n');

    const prompt =
`Tu es un assistant de catégorisation de transactions bancaires françaises.
Catégories disponibles : ${catList}

Associe chaque libellé à la catégorie la plus appropriée.
Indique une sous-catégorie si elle est évidente (ex : "Courses", "Train", "Loyer").

Libellés :
${labelLines}

Réponds UNIQUEMENT en JSON valide, sans aucun texte autour :
{"r":[{"i":1,"c":"catégorie","s":"sous-catégorie ou vide"},{"i":2,"c":"...","s":"..."}]}`;

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
};
