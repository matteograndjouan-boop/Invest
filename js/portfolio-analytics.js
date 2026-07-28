// Moteur de valorisation des enveloppes (Vue globale + Analyse) — fonctions PURES uniquement,
// aucune manipulation DOM. Le modèle enveloppes+opérations (js/envelopes.js) n'a ni prix de
// marché ni "valeur actuelle" stockée : une enveloppe PEA/Compte-titres/Crypto n'a que des
// achats/ventes/mouvements d'espèces, jamais de cours du jour. La valeur d'une enveloppe se
// déduit donc en rejouant ses opérations comme un grand livre de trésorerie (_cashLedger) : le
// DERNIER prix connu par actif (celui du dernier achat/vente) tient lieu de cours courant —
// approximation assumée, cohérente avec le modèle de données déjà validé (pas de suivi FIFO par
// lot, hors périmètre : seule la valeur AGRÉGÉE de l'enveloppe est demandée, pas la plus/moins-
// value par ligne).
const PortfolioAnalytics = {
  // Types qui alimentent (+) ou retirent (-) du cash SANS créer/modifier de position — un seul
  // champ `amount` au sens variable selon le type (voir Utils.ENVELOPE_OPERATIONS/amountLabel).
  _CASH_IN: ['versement', 'depot', 'souscription', 'transfert_entrant', 'dividende'],
  _CASH_OUT: ['retrait', 'transfert_sortant'],
  // Opérations qui expriment une valeur ABSOLUE (solde/valeur totale/montant reçu constaté) et
  // non un mouvement : la trésorerie est redéfinie directement à ce montant, toute position
  // titres est vidée — ces enveloppes (assurance-vie, livret, immobilier, produit structuré) ne
  // suivent jamais de position par actif, seuls PEA/Compte-titres/Crypto le font (achat/vente).
  _ABSOLUTE_RESET: ['maj_valeur', 'maj_solde', 'maj_valeur_estimee', 'remboursement'],

  // Types qui comptent comme un "apport" (versements totaux, base de coût) — dividende en est
  // délibérément exclu : c'est un gain, pas un apport, même s'il alimente le cash de la même
  // façon dans le grand livre (_cashLedger).
  _CONTRIB_TYPES: ['versement', 'depot', 'souscription', 'transfert_entrant'],
  _WITHDRAW_TYPES: ['retrait', 'transfert_sortant'],

  // Clé de position = assetName SEUL, jamais assetName+ticker : Utils.ENVELOPE_OPERATIONS ne
  // collecte le champ `ticker` que sur les opérations "achat" PEA/Compte-titres — "vente" (tous
  // types) et achat/vente Crypto n'ont pas ce champ dans leur liste `fields`, donc `op.ticker` y
  // vaut toujours null (voir Envelopes.saveOperation : `fields.includes('ticker') ? ... : null`).
  // Clé sur assetName+ticker aurait fait d'une vente une position FANTÔME distincte de l'achat
  // correspondant (jamais décrémentée) dès que le ticker était renseigné à l'achat.
  _posKey(op) { return op.assetName || ''; },

  // Rejoue les opérations d'UNE enveloppe (déjà filtrées, pas encore triées) jusqu'à `cutoff`
  // inclus (YYYY-MM-DD ; falsy = toutes). Retourne {cash, positions} — positions est une Map
  // clé "nom|ticker" -> {qty, lastPrice, name, ticker}. Achat/vente sont neutres en valeur (le
  // cash converti en titres reste la même valeur totale au moment de l'opération) ; seule la
  // valorisation au dernier prix connu peut ensuite diverger du prix d'achat, ce qui capture la
  // plus/moins-value latente sans historique par lot.
  _cashLedger(envOps, cutoff) {
    const sorted = [...envOps]
      .filter(o => !cutoff || o.date <= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));

    let cash = 0;
    const positions = new Map();

    sorted.forEach(op => {
      if (this._CASH_IN.includes(op.type)) {
        cash += op.amount || 0;
      } else if (this._CASH_OUT.includes(op.type)) {
        cash -= op.amount || 0;
      } else if (op.type === 'achat') {
        const qty = op.quantity || 0, price = op.unitPrice || 0;
        cash -= qty * price;
        const key = this._posKey(op);
        const pos = positions.get(key) || { qty: 0, lastPrice: 0, name: op.assetName, ticker: op.ticker };
        pos.qty += qty;
        pos.lastPrice = price;
        positions.set(key, pos);
      } else if (op.type === 'vente') {
        const qty = op.quantity || 0, price = op.unitPrice || 0;
        cash += qty * price;
        const key = this._posKey(op);
        const pos = positions.get(key) || { qty: 0, lastPrice: 0, name: op.assetName, ticker: op.ticker };
        pos.qty -= qty;
        pos.lastPrice = price;
        positions.set(key, pos);
      } else if (this._ABSOLUTE_RESET.includes(op.type)) {
        cash = op.amount || 0;
        positions.clear();
      }
      // maj_capital_restant : ignoré ici (aucun effet sur la valeur d'actif) — c'est un passif,
      // voir envelopeLiability.
    });

    return { cash, positions };
  },

  // Valeur totale d'UNE enveloppe (opérations déjà filtrées) à `cutoff` (falsy = valeur actuelle,
  // toutes opérations confondues).
  _valueAtCutoff(envOps, cutoff) {
    const { cash, positions } = this._cashLedger(envOps, cutoff);
    let posValue = 0;
    positions.forEach(p => { posValue += p.qty * p.lastPrice; });
    return cash + posValue;
  },

  // API publique : filtre `allOps` sur l'enveloppe avant de valoriser, pour éviter à chaque
  // appelant de refaire ce filtre lui-même.
  envelopeValue(envelopeId, allOps, cutoff) {
    return this._valueAtCutoff(allOps.filter(o => o.envelopeId === envelopeId), cutoff);
  },

  // Somme des apports sur ]start, end] — bornes YYYY-MM-DD optionnelles (falsy = pas de borne).
  // Brut, PAS net des retraits (voir envelopeWithdrawals séparément) : "versements" doit rester
  // lisible comme "combien déposé", indépendamment de ce qui a été retiré dans le même intervalle.
  envelopeContributions(envOps, start, end) {
    return envOps
      .filter(o => this._CONTRIB_TYPES.includes(o.type))
      .filter(o => (!start || o.date >= start) && (!end || o.date <= end))
      .reduce((s, o) => s + (o.amount || 0), 0);
  },

  envelopeWithdrawals(envOps, start, end) {
    return envOps
      .filter(o => this._WITHDRAW_TYPES.includes(o.type))
      .filter(o => (!start || o.date >= start) && (!end || o.date <= end))
      .reduce((s, o) => s + (o.amount || 0), 0);
  },

  // Dernière opération d'un type donné à date <= cutoff (falsy = pas de borne) — même recette que
  // Envelopes._latestOpAmount, généralisée avec un cutoff pour pouvoir être évaluée "à une date
  // donnée" (Analyse, filtre de période) et pas seulement "aujourd'hui".
  _latestOpAmount(envOps, opType, cutoff) {
    const matches = envOps
      .filter(o => o.type === opType && o.amount != null && (!cutoff || o.date <= cutoff))
      .sort((a, b) => a.date.localeCompare(b.date));
    return matches.length ? matches[matches.length - 1].amount : null;
  },

  // Passif d'une enveloppe (capital restant dû) : dernière opération "maj_capital_restant" connue
  // à `cutoff`, sinon le champ statique saisi à la création de l'enveloppe (remainingLoanCapital)
  // — seul un type 'immobilier' peut porter un passif dans ce modèle.
  envelopeLiability(envelope, envOps, cutoff) {
    if (envelope.type !== 'immobilier') return 0;
    const fromOps = this._latestOpAmount(envOps, 'maj_capital_restant', cutoff);
    if (fromOps !== null) return fromOps;
    return envelope.remainingLoanCapital || 0;
  },

  // Gain/performance "à date" — délibérément simplifié en gain TOTAL depuis l'origine jusqu'à
  // `end` (pas de performance pondérée dans le temps / period-delta, trop complexe pour la
  // fiabilité visée ici) : valeur à `end` moins net investi depuis toujours jusqu'à `end`. gain
  // reste `null` (affiché "—" par les appelants) quand netInvested <= 0 — aucune base de coût
  // (ex. Immobilier, qui n'a jamais d'opération de versement) plutôt qu'un pourcentage trompeur.
  //
  // `start` ne sert QUE pour les champs contributions/withdrawals (période affichée) — le gain
  // reste toujours calculé depuis l'origine réelle de l'enveloppe, jamais depuis `start`.
  envelopeMetrics(envelope, allOps, start, end) {
    const envOps = allOps.filter(o => o.envelopeId === envelope.id);
    const value = this._valueAtCutoff(envOps, end);
    const netInvested = this.envelopeContributions(envOps, null, end) - this.envelopeWithdrawals(envOps, null, end);
    const gain = netInvested > 0 ? (value - netInvested) : null;
    const gainPct = gain !== null ? (gain / netInvested * 100) : null;
    return {
      value,
      netInvested,
      gain,
      gainPct,
      contributions: this.envelopeContributions(envOps, start, end),
      withdrawals: this.envelopeWithdrawals(envOps, start, end),
      liability: this.envelopeLiability(envelope, envOps, end),
    };
  },

  // Agrège les métriques de plusieurs enveloppes — gain % recalculé sur le net investi AGRÉGÉ
  // (pas une moyenne des % individuels, qui pondérerait à tort une petite enveloppe autant qu'une
  // grosse).
  aggregateMetrics(envelopes, allOps, start, end) {
    const perEnv = envelopes.map(e => this.envelopeMetrics(e, allOps, start, end));
    const value = perEnv.reduce((s, m) => s + m.value, 0);
    const netInvested = perEnv.reduce((s, m) => s + m.netInvested, 0);
    const contributions = perEnv.reduce((s, m) => s + m.contributions, 0);
    const withdrawals = perEnv.reduce((s, m) => s + m.withdrawals, 0);
    const liability = perEnv.reduce((s, m) => s + m.liability, 0);
    const gain = netInvested > 0 ? (value - netInvested) : null;
    const gainPct = gain !== null ? (gain / netInvested * 100) : null;
    return { value, netInvested, gain, gainPct, contributions, withdrawals, liability };
  },

  // Regroupe la valeur (à `cutoff`) par une clé arbitraire (type, établissement...) — donuts
  // "répartition par type"/"répartition par établissement". Ne renvoie que les groupes non nuls.
  valueByGroup(envelopes, allOps, cutoff, keyFn) {
    const totals = new Map();
    envelopes.forEach(e => {
      const key = keyFn(e);
      const value = this.envelopeValue(e.id, allOps, cutoff);
      totals.set(key, (totals.get(key) || 0) + value);
    });
    return [...totals.entries()].filter(([, v]) => v !== 0).map(([key, value]) => ({ key, value }));
  },

  // Liste de dates de fin de mois (YYYY-MM-DD) entre `fromDate` et `toDate` inclus, dernier point
  // = `toDate` lui-même (jamais un 30/31 situé dans le futur si le mois n'est pas terminé — le
  // dernier point de la série doit être la valeur À `toDate`, pas après). Un point par mois
  // calendaire. Utilisée pour les 2 courbes d'évolution (Vue globale = historique complet,
  // Analyse = période filtrée).
  monthEndDates(fromDate, toDate) {
    if (!fromDate || !toDate || fromDate > toDate) return [];
    const dates = [];
    let [y, m] = fromDate.split('-').map(Number);
    while (true) {
      const lastDay = new Date(y, m, 0).getDate();
      const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      if (monthEnd >= toDate) break;
      dates.push(monthEnd);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    dates.push(toDate);
    return dates;
  },

  // Série temporelle de la valeur agrégée d'un ensemble d'enveloppes, une valeur par date de
  // `dates` (YYYY-MM-DD, voir monthEndDates).
  valueTimeSeries(envelopes, allOps, dates) {
    return dates.map(date => ({
      date,
      value: envelopes.reduce((s, e) => s + this.envelopeValue(e.id, allOps, date), 0),
    }));
  },
};
