const Categories = {
  _dnd: null,
  _editingCatId: null,        // catégorie en mode édition
  _openOld: new Set(),        // catégories dont les anciens noms sont dépliés à droite (par id de la version active)
  _TYPES: [
    { key: 'expense',    label: 'Dépenses',      icon: '💳' },
    { key: 'revenue',    label: 'Revenus',        icon: '💰' },
    { key: 'investment', label: 'Investissement', icon: '📈' },
  ],

  render() {
    const cats = Storage.getCategories();
    const container = document.getElementById('categories-container');
    if (!container) return;

    const subEl = document.getElementById('cat-subtitle');
    if (subEl) {
      const nSub = cats.reduce((s, c) => s + c.subcategories.length, 0);
      subEl.textContent = `${cats.length} catégorie${cats.length > 1 ? 's' : ''} · ${nSub} sous-catégorie${nSub > 1 ? 's' : ''}`;
    }

    // Replie les lignées de renommage daté en une unité, puis répartit dans les
    // 3 types (dépense / revenu / investissement).
    const units = this._displayUnits(cats);
    const byType = { expense: [], revenue: [], investment: [] };
    units.forEach(u => { (byType[this._catType(u.primary)] || byType.expense).push(u); });

    container.innerHTML = this._TYPES.map(T => {
      const cards = byType[T.key].map(u => this._renderUnit(u)).join('');
      const addCard = `<div class="category-card card-new" onclick="Categories.openAddModal('${T.key}')"><div class="new-plus">＋</div><span class="new-label">Nouvelle catégorie</span></div>`;
      return `<section class="cat-type-section">
        <h2 class="cat-type-head"><span class="cat-type-ic">${T.icon}</span>${T.label}<span class="cat-type-count">${byType[T.key].length}</span></h2>
        <div class="categories-grid">${cards}${addCard}</div>
      </section>`;
    }).join('');
  },

  // Une carte = la version ACTIVE d'une catégorie. Ses éventuelles versions datées
  // (renommage à portée) sont repliées dans un volet, plus en cartes grisées.
  _renderUnit(unit) {
    const cat = unit.primary;
    const editing = this._editingCatId === cat.id;
    const m = this._meta(cat.name);
    const icon = cat.icon || m.icon;
    const sc = m.scheme;
    const vars = `--cat-bar:linear-gradient(90deg,${sc.bar});--cat-dot:${sc.dot};--cat-ico:${sc.bg};--cat-cnt:${sc.count}`;
    const n = cat.subcategories.length;
    const oldItems = this._oldItems(unit);   // anciens noms (versions datées ou alias)
    const openOld = this._openOld.has(cat.id);

    const iconHtml = editing
      ? `<button class="cat-icon cat-icon-edit" onclick="Categories._openIconPicker('${cat.id}')" title="Changer l'icône">${icon}</button>`
      : `<div class="cat-icon">${icon}</div>`;
    // Un seul badge 🕘 : il déplie / replie les anciens noms à droite (au lieu d'ouvrir une modale).
    const oldBadge = oldItems.length
      ? `<button class="cat-stack-badge${openOld ? ' open' : ''}" onclick="Categories._toggleOld('${cat.id}')" title="Anciens noms — afficher / masquer">🕘 ${oldItems.length}<span class="cat-stack-chev">${openOld ? '▾' : '▸'}</span></button>` : '';
    // Effet « pile » seulement quand c'est replié (laisse deviner qu'il y a des cartes derrière).
    const stackCls = (oldItems.length && !openOld) ? ' has-versions' : '';
    // Hors édition : le compteur laisse place à un bouton Modifier (icône seule) dans l'en-tête —
    // le bouton pleine largeur du pied de carte disparaît (plus de place vide en dessous des
    // pastilles). En édition, le compteur reste (on est déjà dans l'édition, inutile d'y remener).
    const topRight = editing
      ? `<span class="cat-count">${n}</span>`
      : `${oldBadge}<button class="cat-edit-btn" onclick="Categories._startEdit('${cat.id}')" title="Modifier">✎</button>`;
    const top = `
      <div class="card-top" onmousedown="Categories._dndStart(event,'cat','${cat.id}',null)" ontouchstart="Categories._dndStart(event,'cat','${cat.id}',null)" title="Glisser pour réordonner ou changer de type">
        <div class="cat-left">${iconHtml}<span class="cat-name" title="${cat.name}">${cat.name}</span></div>
        <div class="cat-top-right">${topRight}</div>
      </div>`;

    if (!editing) {
      // Cartes larges (4 par ligne) : toutes les sous-catégories tiennent d'un coup d'œil,
      // plus besoin de tronquer à 3 + bouton déplier.
      const shown = cat.subcategories.map(s => `<div class="sub-row"><span class="sub-dot"></span><span class="sub-txt" title="${s}">${s}</span></div>`).join('');
      const body = n ? `<div class="subs">${shown}</div>` : '<div class="subs-empty">Aucune sous-catégorie</div>';
      const activeCard = `<div class="category-card${stackCls}${openOld ? ' old-open' : ''}" data-cat-id="${cat.id}" id="cat-${cat.id}" style="${vars}">
        ${top}${body}
      </div>`;
      // Quand c'est déplié, les anciens noms suivent la carte active dans la grille (donc à sa droite).
      return activeCard + (openOld ? this._renderOldCards(unit, oldItems) : '');
    }

    const subEdit = cat.subcategories.map((s, idx) => `
      <div class="subcat-item sub-edit" data-cat-id="${cat.id}" data-subcat-idx="${idx}"
           onmousedown="Categories._dndStart(event,'subcat','${cat.id}',${idx})" ontouchstart="Categories._dndStart(event,'subcat','${cat.id}',${idx})" title="Glisser pour déplacer">
        <span class="sub-txt" title="${s}">${s}</span>
        <button class="sub-x" onclick="Categories.deleteSubcat('${cat.id}',${idx})" title="Supprimer">×</button>
      </div>`).join('');
    const curType = this._catType(cat);
    const typeSel = this._TYPES.map(T =>
      `<button class="cat-type-btn${curType === T.key ? ' active' : ''}" onclick="Categories._setType('${cat.id}','${T.key}')">${T.icon} ${T.label}</button>`).join('');
    return `<div class="category-card editing${stackCls}" data-cat-id="${cat.id}" id="cat-${cat.id}" style="${vars}">
      ${top}
      <div class="cat-type-pick">${typeSel}</div>
      <div class="edit-bar"><button class="btn-rename" onclick="Categories._openRenameCat('${cat.id}')">✎ Renommer</button></div>
      <div class="subs subcat-list" data-cat-id="${cat.id}">${subEdit || '<div class="subs-empty">Aucune sous-catégorie</div>'}</div>
      <button class="btn-addsub" onclick="Categories._openAddSubcatModal('${cat.id}')">＋ Sous-catégorie</button>
      <div class="edit-footer">
        <button class="btn-delfull" onclick="Categories.deleteCategory('${cat.id}')">🗑 Supprimer</button>
        <button class="btn-done" onclick="Categories._stopEdit()">✓ Terminer</button>
      </div>
    </div>`;
  },

  // Déplie / replie les anciens noms d'une catégorie : ils apparaissent comme des cartes
  // sœurs à droite (même grille), teintées « historique » pour montrer que c'est la même
  // catégorie sous d'anciens noms. Clé = id de la version active.
  _toggleOld(catId) {
    if (this._openOld.has(catId)) this._openOld.delete(catId);
    else this._openOld.add(catId);
    this.render();
  },

  // Anciens noms d'une unité : versions datées (cartes riches) ou, à défaut, alias d'un
  // renommage global (seul le nom a changé). Renvoie [] si rien à montrer.
  _oldItems(unit) {
    const cat = unit.primary;
    if (unit.dated) return unit.versions.filter(v => v.id !== cat.id).map(v => ({ kind: 'version', v }));
    return (cat.aliases || []).map((a, i) => ({ kind: 'alias', name: a, idx: i }));
  },

  // Cartes des anciens noms, insérées dans la grille juste après la carte active + une
  // petite carte « Déclarer un ancien nom » (rouvre la gestion d'historique).
  _renderOldCards(unit, oldItems) {
    const cards = oldItems.map(it => this._renderOldCard(it, unit.primary)).join('');
    const add = `<div class="category-card cat-ver-add" onclick="Categories._openHistoryModal('${unit.primary.id}')" title="Déclarer un ancien nom (utile pour l'import)">
        <div class="cat-ver-add-plus">＋</div><span class="cat-ver-add-lbl">Déclarer un ancien nom</span></div>`;
    return cards + add;
  },

  // Une carte « ancien nom » : même famille de couleur que l'active mais teinte atténuée,
  // header dédié (🕘 Ancien nom) et lien « ↳ aujourd'hui : … » vers le nom actuel.
  _renderOldCard(it, primary) {
    const sc = this._meta(primary.name).scheme;   // couleur de la lignée = celle de l'active
    const vars = `--cat-bar:linear-gradient(90deg,${sc.bar});--cat-dot:${sc.dot};--cat-ico:${sc.bg};--cat-cnt:${sc.count}`;
    const name = it.kind === 'version' ? it.v.name : it.name;
    const icon = it.kind === 'version' ? (it.v.icon || this._meta(name).icon) : this._meta(name).icon;
    const note = it.kind === 'version' ? (it.v.versionNote || 'Ancienne version datée')
                                       : 'Renommage global — seul le nom a changé';
    let body;
    if (it.kind === 'version' && it.v.subcategories.length) {
      const subs = it.v.subcategories.slice(0, 3)
        .map(s => `<div class="sub-row"><span class="sub-dot"></span><span class="sub-txt" title="${s}">${s}</span></div>`).join('');
      const extra = it.v.subcategories.length - 3;
      body = `<div class="subs">${subs}</div>${extra > 0 ? `<div class="more">+${extra} autre${extra > 1 ? 's' : ''}</div>` : ''}`;
    } else {
      body = `<div class="ver-old-samesubs">↔ Mêmes sous-catégories que « ${primary.name} »</div>`;
    }
    const del = it.kind === 'version'
      ? `<button class="btn-edit ver-old-del" onclick="Categories._delVersion('${primary.lineage}','${it.v.id}')" title="Supprimer cette version datée">🗑 Supprimer la version</button>`
      : `<button class="btn-edit ver-old-del" onclick="Categories._histRemove('${primary.id}',${it.idx})" title="Retirer cet ancien nom">🗑 Retirer ce nom</button>`;
    return `<div class="category-card cat-ver-old" style="${vars}">
      <div class="ver-old-flag">🕘 Ancien nom</div>
      <div class="card-top ver-old-top">
        <div class="cat-left"><div class="cat-icon">${icon}</div><span class="cat-name" title="${name}">${name}</span></div>
      </div>
      <div class="ver-old-link">↳ aujourd'hui : <strong>${primary.name}</strong></div>
      <div class="ver-old-note">${note}</div>
      ${body}
      <div class="card-footer ver-old-footer">${del}</div>
    </div>`;
  },

  // Supprime une version datée d'une lignée puis rafraîchit. Si la lignée n'a plus qu'une
  // version, il n'y a plus rien à déplier : on referme le volet de sa carte.
  _delVersion(lin, id) {
    const cats = Storage.getCategories();
    const cat = cats.find(c => c.id === id);
    if (!cat || !confirm(`Supprimer la version « ${cat.name} » ?`)) return;
    const rest = cats.filter(c => c.id !== id);
    Storage.saveCategories(rest);
    const remain = rest.filter(c => c.lineage === lin);
    if (remain.length < 2 && remain[0]) this._openOld.delete(remain[0].id);
    this.render();
  },

  // Type d'une catégorie : explicite (cat.type) sinon déduit du nom.
  _catType(cat) {
    if (cat.type === 'revenue' || cat.type === 'investment' || cat.type === 'expense') return cat.type;
    const n = String(cat.name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/revenu|salaire|paie/.test(n)) return 'revenue';
    if (/epargne|invest|bourse|action|etf|crypto|\bpea\b|assurance vie|livret|placement/.test(n)) return 'investment';
    return 'expense';
  },

  // Replie les lignées de renommage daté : 1 unité/catégorie, la version couvrant
  // aujourd'hui (ou la 1re active) servant de carte principale.
  _displayUnits(cats) {
    const today = new Date().toISOString().slice(0, 10);
    const covers = c => (!c.validFrom || today >= c.validFrom) && (!c.validTo || today <= c.validTo);
    const seen = new Set(); const units = [];
    cats.forEach(cat => {
      if (!cat.lineage) { units.push({ primary: cat, versions: [cat], dated: false }); return; }
      if (seen.has(cat.lineage)) return;
      seen.add(cat.lineage);
      const sibs = cats.filter(c => c.lineage === cat.lineage);
      const primary = sibs.find(c => !c.obsolete && covers(c)) || sibs.find(c => !c.obsolete) || sibs[0];
      units.push({ primary, versions: sibs, dated: sibs.length > 1 });
    });
    return units;
  },

  _setType(catId, type) {
    const cats = Storage.getCategories();
    const cat = cats.find(c => c.id === catId);
    if (!cat) return;
    cat.type = type;
    Storage.saveCategories(cats);
    this.render();
  },

  // Palette de couleurs des cartes (barre du haut, pastille, fond d'icône, compteur).
  _PALETTE: [
    { bar: '#6c63ff,#9c95ff', dot: '#7f77dd', bg: '#ede9ff', count: '#6c63ff' },
    { bar: '#1a9e6e,#5dcaa5', dot: '#1d9e75', bg: '#e1f5ee', count: '#0f6e56' },
    { bar: '#ef9f27,#fac775', dot: '#ba7517', bg: '#faeeda', count: '#854f0b' },
    { bar: '#378add,#85b7eb', dot: '#378add', bg: '#e6f1fb', count: '#185fa5' },
    { bar: '#d4537e,#ed93b1', dot: '#d4537e', bg: '#fbeaf0', count: '#993556' },
    { bar: '#e24b4a,#f09595', dot: '#e24b4a', bg: '#fcebeb', count: '#a32d2d' },
    { bar: '#888780,#b4b2a9', dot: '#888780', bg: '#f1efe8', count: '#5f5e5a' },
    { bar: '#7c4dff,#b39ddb', dot: '#7c4dff', bg: '#efe7ff', count: '#5e35b1' },
  ],
  // Icône + couleur par mots-clés du nom (repli : couleur stable par hash + 🏷️).
  _CATMETA: [
    { kw: ['aliment', 'course', 'nourrit', 'epicerie'], icon: '🛒', p: 1 },
    { kw: ['transport', 'vehicul', 'voiture', 'bus', 'train', 'metro', 'mobilit'], icon: '🚌', p: 3 },
    { kw: ['logement', 'loyer', 'immobil', 'habitat'], icon: '🏠', p: 3 },
    { kw: ['sante', 'medical', 'medecin', 'pharmaci'], icon: '❤️', p: 5 },
    { kw: ['loisir', 'sortie', 'divertiss', 'sport', 'culture'], icon: '🎯', p: 4 },
    { kw: ['shopping', 'vetement', 'mode'], icon: '🛍️', p: 0 },
    { kw: ['abonnement', 'telephon', 'internet', 'stream'], icon: '📶', p: 0 },
    { kw: ['epargne', 'econom', 'invest', 'livret', 'placement'], icon: '🐷', p: 2 },
    { kw: ['revenu', 'salaire', 'paie', 'gain'], icon: '💰', p: 1 },
    { kw: ['divers', 'autre', 'frais', 'banqu'], icon: '📦', p: 6 },
    { kw: ['restau', 'resto', 'cafe'], icon: '🍽️', p: 2 },
    { kw: ['voyage', 'vacance', 'hotel'], icon: '✈️', p: 3 },
    { kw: ['educ', 'ecole', 'etude', 'formation'], icon: '🎓', p: 3 },
    { kw: ['enfant', 'famille', 'bebe'], icon: '👶', p: 4 },
    { kw: ['animal', 'chien', 'chat'], icon: '🐾', p: 2 },
    { kw: ['cadeau'], icon: '🎁', p: 4 },
    { kw: ['impot', 'taxe', 'assurance'], icon: '🧾', p: 6 },
    { kw: ['beaute', 'coiffure'], icon: '💄', p: 4 },
  ],
  _meta(name) {
    const n = String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const m of this._CATMETA) if (m.kw.some(k => n.includes(k))) return { icon: m.icon, scheme: this._PALETTE[m.p] };
    let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
    return { icon: '🏷️', scheme: this._PALETTE[h % this._PALETTE.length] };
  },

  _startEdit(catId) { this._editingCatId = catId; this.render(); },
  _stopEdit()       { this._editingCatId = null;  this.render(); },

  // ---- Icône personnalisée d'une catégorie (mode édition) ----
  _ICON_CHOICES: ['🏷️','🛒','🍽️','🥖','☕','🍔','🍷','🛍️','👕','👟','💄','🏠','💡','🔥','🚰','🚌','🚆','🚗','✈️','⛽','❤️','💊','🦷','🏥','🎯','🎬','🎮','🎵','📚','🏋️','⚽','🐷','💰','💳','🏦','📈','🎁','🐾','👶','🎓','🧾','🛡️','📶','📱','💻','🌍','🎉','🔧','✂️','📦','💼','🌱','🧹','⚡'],
  _openIconPicker(catId) {
    const cat = Storage.getCategories().find(c => c.id === catId);
    if (!cat) return;
    const grid = this._ICON_CHOICES.map(e =>
      `<button class="icon-pick${cat.icon === e ? ' active' : ''}" onclick="Categories._setIcon('${catId}','${e}')">${e}</button>`).join('');
    Modal.open(`Icône de « ${cat.name} »`, `
      <p class="rename-hint" style="margin-bottom:10px">Choisis une icône pour cette catégorie.</p>
      <div class="icon-picker-grid">${grid}</div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="Categories._setIcon('${catId}','')">↺ Icône auto</button>
        <button type="button" class="btn-secondary" onclick="Modal.close()">Fermer</button>
      </div>`);
  },
  _setIcon(catId, icon) {
    const cats = Storage.getCategories();
    const cat = cats.find(c => c.id === catId);
    if (!cat) return;
    if (icon) cat.icon = icon; else delete cat.icon;
    Storage.saveCategories(cats);
    Modal.close();
    this._editingCatId = catId; // on reste en édition
    this.render();
  },

  // ---- Renommage d'une catégorie, avec portée DATÉE ----
  //
  // 3 portées (date comptable de chaque transaction) :
  //  • Toutes               : renommage simple, toutes les transactions migrent ; alias = ancien nom.
  //  • Date charnière D     : sens 'from' (≥ D → nouveau, < D → ancien INACTIVE) ou 'until'
  //                           (≤ D → nouveau INACTIVE, > D → ancien actif), au choix.
  //  • Sur une période [from,to] : dans la plage → nouveau nom ; en dehors → ancien
  //                           (les deux restent actives).
  // La « lignée datée » (cat.lineage + validFrom/validTo sur la nouvelle version) permet à
  // l'import de choisir AUTOMATIQUEMENT le bon nom selon la date de la dépense
  // (BankImport._versionedPick) — c'est ce qui faisait défaut auparavant.
  _openRenameCat(catId) {
    const cat = Storage.getCategories().find(c => c.id === catId);
    if (!cat) return;
    const today = new Date().toISOString().slice(0, 10);
    Modal.open(`Renommer « ${cat.name} »`, `
      <form onsubmit="Categories._confirmRename(event,'${catId}')">
        <div class="form-group">
          <label>Nouveau nom</label>
          <input name="newname" class="form-input" required autofocus value="${cat.name}" style="width:100%">
        </div>
        <div class="form-group">
          <label>Appliquer le nouveau nom à :</label>
          <label class="rename-scope"><input type="radio" name="scope" value="all" checked> <span><strong>Toutes</strong> les transactions <small>— renommage simple</small></span></label>
          <label class="rename-scope"><input type="radio" name="scope" value="date"> <span><strong>À une date charnière</strong> — nouveau nom <select name="dir" class="rename-dir"><option value="after">à partir du (inclus)</option><option value="before">jusqu'au (inclus)</option></select> <input type="date" name="fromdate" value="${today}"> <small>— l'autre côté garde l'ancien nom (imports compris)</small></span></label>
          <label class="rename-scope"><input type="radio" name="scope" value="period"> <span><strong>Sur une période</strong> du <input type="date" name="pfrom"> au <input type="date" name="pto"> <small>— dans la plage : nouveau nom · en dehors : ancien</small></span></label>
        </div>
        <p class="rename-hint">↪ Le découpage utilise la date comptable de chaque transaction. À l'import, le bon nom est choisi automatiquement selon la date de la dépense.</p>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">Appliquer</button>
        </div>
      </form>`);
  },

  _confirmRename(event, catId) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const newName = (fd.get('newname') || '').trim();
    const scope = fd.get('scope');
    if (scope === 'date') {
      const from = fd.get('fromdate');
      if (!from) { alert('Choisissez une date.'); return; }
      this._applyRename(catId, newName, fd.get('dir') === 'before' ? 'until' : 'from', from, null);
    } else if (scope === 'period') {
      const from = fd.get('pfrom'), to = fd.get('pto');
      if (!from || !to) { alert('Choisissez une date de début et de fin.'); return; }
      if (from > to)    { alert('La date de début doit précéder la date de fin.'); return; }
      this._applyRename(catId, newName, 'period', from, to);
    } else {
      this._applyRename(catId, newName, 'all');
    }
  },

  _applyRename(catId, newName, scope, from, to) {
    const cats = Storage.getCategories();
    const cat  = cats.find(c => c.id === catId);
    if (!cat) return;
    const oldName = cat.name;
    if (!newName || newName === oldName) { Modal.close(); return; }
    if (cats.some(c => c.id !== catId && c.name.toLowerCase() === newName.toLowerCase())) {
      alert('Une catégorie porte déjà ce nom.'); return;
    }

    const fmt      = d => Utils.formatDate(d);
    const expenses = Storage.getExpenses();
    const revenues = Storage.getRevenues();
    const td       = t => t.date; // date comptable (cohérent avec la résolution d'import)
    const nn = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const mergeAliases = (list, selfName) => {
      const out = [];
      list.forEach(a => { if (!a || nn(a) === nn(selfName) || out.some(x => nn(x) === nn(a))) return; out.push(a); });
      return out;
    };

    if (scope === 'all') {
      cat.aliases = mergeAliases([...(cat.aliases || []), oldName], newName);
      cat.name = newName;
      delete cat.obsolete; delete cat.versionNote; delete cat.lineage; delete cat.validFrom; delete cat.validTo;
      [expenses, revenues].forEach(arr => arr.forEach(t => { if (t.category === oldName) t.category = newName; }));
    } else {
      // Portée datée : lignée partagée ; la NOUVELLE version porte la fenêtre [validFrom,validTo],
      // l'ancienne devient la « base » (hors fenêtre). L'import choisit selon la date (_versionedPick).
      const lineage = cat.lineage || ('lin_' + Date.now());
      cat.lineage = lineage;
      delete cat.validFrom; delete cat.validTo;
      const newCat = { id: 'cat_' + Date.now(), name: newName, subcategories: [...cat.subcategories], lineage };
      let inScope;

      if (scope === 'from') {
        inScope = t => td(t) >= from;
        newCat.validFrom = from; newCat.validTo = null;
        cat.obsolete = true; // l'ancien (avant D) n'est plus proposé aux nouvelles saisies
        cat.versionNote    = `Avant le ${fmt(from)} — remplacée par « ${newName} »`;
        newCat.versionNote = `À partir du ${fmt(from)} (remplace « ${oldName} »)`;
      } else if (scope === 'until') {
        inScope = t => td(t) <= from;            // 'from' porte la date charnière
        newCat.validFrom = null; newCat.validTo = from;
        newCat.obsolete = true; delete cat.obsolete; // le nouveau couvre le passé → l'ancien reste actif
        cat.versionNote    = `Après le ${fmt(from)} — garde « ${oldName} »`;
        newCat.versionNote = `Jusqu'au ${fmt(from)} (remplace « ${oldName} »)`;
      } else { // period
        inScope = t => { const d = td(t); return d >= from && d <= to; };
        newCat.validFrom = from; newCat.validTo = to;
        delete cat.obsolete;
        cat.versionNote    = `Hors période ${fmt(from)} – ${fmt(to)}`;
        newCat.versionNote = `Valable du ${fmt(from)} au ${fmt(to)} (remplace « ${oldName} »)`;
      }

      // Réaffecte les transactions existantes de la portée vers le nouveau nom.
      [expenses, revenues].forEach(arr => arr.forEach(t => { if (t.category === oldName && inScope(t)) t.category = newName; }));
      // Lien visuel (badge 🕘) + repli de correspondance : l'ancien nom devient alias du nouveau.
      newCat.aliases = mergeAliases([...(cat.aliases || []), oldName], newName);

      const idx = cats.findIndex(c => c.id === catId);
      cats.splice(idx + 1, 0, newCat);
    }

    Storage.saveCategories(cats);
    Storage.saveExpenses(expenses);
    Storage.saveRevenues(revenues);
    Modal.close();
    this.render();
    if (typeof Expenses !== 'undefined' && Expenses._populateCatFilter) Expenses._populateCatFilter();
  },

  // ---- Historique / anciens noms (alias) d'une catégorie ----
  // Le badge 🕘 du header ouvre cette fenêtre. Les anciens noms déclarés alimentent la
  // correspondance d'import (_matchCat) : indispensable pour les catégories renommées
  // AVANT que l'app ne mémorise l'ancien nom automatiquement (l'ancien nom a alors
  // disparu des données et ne peut être retrouvé que déclaré ici).
  _openHistoryModal(catId) {
    const cat = Storage.getCategories().find(c => c.id === catId);
    if (!cat) return;
    const aliases = cat.aliases || [];
    const chips = aliases.length
      ? aliases.map((a, i) => `<span class="cat-alias-chip">${a}<button onclick="Categories._histRemove('${catId}',${i},true)" title="Retirer">✕</button></span>`).join(' ')
      : '<span class="cat-alias-empty">Aucun ancien nom déclaré pour l\'instant.</span>';
    Modal.open(`Historique de « ${cat.name} »`, `
      <p class="rename-hint" style="margin-bottom:12px">Déclare les <strong>anciens noms</strong> de cette catégorie. À l'import, une dépense étiquetée (ou devinée) avec l'un de ces noms sera automatiquement classée dans « ${cat.name} » (et plus dans « Abonnements »).</p>
      <div class="cat-hist-list">${chips}</div>
      <form onsubmit="Categories._histAdd(event,'${catId}')" class="cat-hist-form">
        <input name="alias" class="form-input" required placeholder="ex : Alimentation" autofocus>
        <button type="submit" class="btn-primary">Ajouter</button>
      </form>
      <div class="form-actions" style="margin-top:14px">
        <button type="button" class="btn-secondary" onclick="Modal.close()">Fermer</button>
      </div>`);
  },

  _histAdd(event, catId) {
    event.preventDefault();
    const alias = (new FormData(event.target).get('alias') || '').trim();
    if (this._addAliasValue(catId, alias)) this._openHistoryModal(catId); // ré-affiche la liste à jour
  },

  _histRemove(catId, idx, fromModal) {
    const cats = Storage.getCategories();
    const cat  = cats.find(c => c.id === catId);
    if (cat && cat.aliases) {
      cat.aliases.splice(idx, 1);
      if (!cat.aliases.length) { delete cat.aliases; this._openOld.delete(catId); }
      Storage.saveCategories(cats);
      this.render();
    }
    if (fromModal) this._openHistoryModal(catId);  // ré-affiche la liste seulement depuis la modale
  },

  // Ajoute un ancien nom (dédup casse/accents + garde-fous). Renvoie true si ajouté.
  _addAliasValue(catId, alias) {
    if (!alias) return false;
    const cats = Storage.getCategories();
    const cat  = cats.find(c => c.id === catId);
    if (!cat) return false;
    const nn = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    if (nn(alias) === nn(cat.name)) { alert('C\'est déjà le nom actuel de la catégorie.'); return false; }
    if ((cat.aliases || []).some(a => nn(a) === nn(alias))) return false; // doublon silencieux
    if (cats.some(c => c.id !== catId && nn(c.name) === nn(alias))) {
      if (!confirm(`« ${alias} » est le nom d'une autre catégorie existante. L'ajouter comme ancien nom de « ${cat.name} » redirigera vers ici les imports portant ce nom. Continuer ?`)) return false;
    }
    cat.aliases = [...(cat.aliases || []), alias];
    Storage.saveCategories(cats);
    this.render();
    return true;
  },

  _openAddSubcatModal(catId) {
    const cat = Storage.getCategories().find(c => c.id === catId);
    if (!cat) return;
    Modal.open(`Ajouter une sous-catégorie à "${cat.name}"`, `
      <form onsubmit="Categories._confirmAddSubcat(event,'${catId}')">
        <div class="form-group">
          <label>Nom de la sous-catégorie</label>
          <input name="subcat_name" required autofocus placeholder="ex: Boulangerie" style="width:100%">
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">Ajouter</button>
        </div>
      </form>`);
  },

  _confirmAddSubcat(event, catId) {
    event.preventDefault();
    const name = new FormData(event.target).get('subcat_name').trim();
    if (!name) return;
    const cats = Storage.getCategories();
    const cat = cats.find(c => c.id === catId);
    if (!cat) return;
    if (cat.subcategories.includes(name)) { alert('Cette sous-catégorie existe déjà.'); return; }
    cat.subcategories.push(name);
    Storage.saveCategories(cats);
    Modal.close();
    this._editingCatId = catId;
    this.render();
  },

  // ---- Drag & Drop ----

  _dndStart(e, type, catId, subcatIdx) {
    // Un clic sur un bouton dans la zone de saisie (× supprimer, 🕘 historique)
    // ne doit PAS démarrer un glissement — on laisse le clic suivre son cours.
    if (e.target.closest('button')) return;
    if (e.cancelable) e.preventDefault();
    const isTouch = !!e.touches;
    const px = isTouch ? e.touches[0].clientX : e.clientX;
    const py = isTouch ? e.touches[0].clientY : e.clientY;

    const el = type === 'cat'
      ? e.currentTarget.closest('.category-card')
      : e.currentTarget.closest('.subcat-item');
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const clone = el.cloneNode(true);
    clone.style.cssText = `position:fixed;z-index:9999;pointer-events:none;opacity:0.88;
      width:${rect.width}px;left:${rect.left}px;top:${rect.top}px;
      box-shadow:0 12px 32px rgba(0,0,0,0.22);transform:rotate(1.5deg);transition:none;`;
    document.body.appendChild(clone);
    el.classList.add('dnd-ghost');

    this._dnd = { type, catId, subcatIdx, el, clone,
      ox: px - rect.left, oy: py - rect.top, isTouch, dropInfo: null };

    const onMove = (e) => this._dndMove(e);
    const onEnd  = (e) => {
      this._dndEnd(e);
      document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onMove);
      document.removeEventListener(isTouch ? 'touchend'  : 'mouseup',   onEnd);
    };
    document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove, { passive: false });
    document.addEventListener(isTouch ? 'touchend'  : 'mouseup',   onEnd);
  },

  _dndMove(e) {
    if (!this._dnd) return;
    if (e.cancelable) e.preventDefault();
    const px = e.touches ? e.touches[0].clientX : e.clientX;
    const py = e.touches ? e.touches[0].clientY : e.clientY;
    const { clone, ox, oy } = this._dnd;
    clone.style.left = (px - ox) + 'px';
    clone.style.top  = (py - oy) + 'px';

    clone.style.display = 'none';
    const over = document.elementFromPoint(px, py);
    clone.style.display = '';

    document.querySelectorAll('.dnd-over, .dnd-over-after').forEach(el => {
      el.classList.remove('dnd-over', 'dnd-over-after');
    });

    if (!over) { this._dnd.dropInfo = null; return; }

    if (this._dnd.type === 'cat') {
      const card = over.closest('.category-card[data-cat-id]');
      if (card && card !== this._dnd.el) {
        const rect = card.getBoundingClientRect();
        const insertAfter = px >= rect.left + rect.width / 2;
        card.classList.add(insertAfter ? 'dnd-over-after' : 'dnd-over');
        this._dnd.dropInfo = { catId: card.dataset.catId, insertAfter };
      } else {
        this._dnd.dropInfo = null;
      }
    } else {
      const item = over.closest('.subcat-item[data-cat-id]');
      const list = over.closest('.subcat-list[data-cat-id]');
      if (item && item !== this._dnd.el) {
        const rect = item.getBoundingClientRect();
        const insertAfter = py >= rect.top + rect.height / 2;
        item.classList.add(insertAfter ? 'dnd-over-after' : 'dnd-over');
        this._dnd.dropInfo = {
          type: 'item', catId: item.dataset.catId,
          subcatIdx: parseInt(item.dataset.subcatIdx), insertAfter
        };
      } else if (list) {
        list.classList.add('dnd-over');
        this._dnd.dropInfo = { type: 'list', catId: list.dataset.catId };
      } else {
        this._dnd.dropInfo = null;
      }
    }
  },

  _dndEnd(e) {
    if (!this._dnd) return;
    const { type, catId, subcatIdx, el, clone, dropInfo } = this._dnd;

    clone.remove();
    el.classList.remove('dnd-ghost');
    document.querySelectorAll('.dnd-over, .dnd-over-after').forEach(el => {
      el.classList.remove('dnd-over', 'dnd-over-after');
    });
    this._dnd = null;

    if (!dropInfo) return;
    const cats = Storage.getCategories();

    if (type === 'cat') {
      const { catId: tgtId, insertAfter } = dropInfo;
      if (tgtId === catId) return;
      const si = cats.findIndex(c => c.id === catId);
      const [moved] = cats.splice(si, 1);
      let ti = cats.findIndex(c => c.id === tgtId);
      if (insertAfter) ti++;
      cats.splice(ti, 0, moved);
      // Déposée dans la section d'un autre type → la catégorie change de type.
      const tgt = cats.find(c => c.id === tgtId);
      if (tgt) moved.type = this._catType(tgt);

    } else {
      const srcCat = cats.find(c => c.id === catId);
      if (!srcCat) return;

      if (dropInfo.type === 'list') {
        const tgtCat = cats.find(c => c.id === dropInfo.catId);
        if (!tgtCat) return;
        const [movedSub] = srcCat.subcategories.splice(subcatIdx, 1);
        tgtCat.subcategories.push(movedSub);
      } else {
        const tgtCatId = dropInfo.catId;
        const tgtCat = cats.find(c => c.id === tgtCatId);
        if (!tgtCat) return;
        const [movedSub] = srcCat.subcategories.splice(subcatIdx, 1);
        let ti = dropInfo.subcatIdx;
        if (tgtCatId === catId && ti > subcatIdx) ti--;
        if (dropInfo.insertAfter) ti++;
        tgtCat.subcategories.splice(ti, 0, movedSub);
      }
    }

    Storage.saveCategories(cats);
    this.render();
  },

  // ---- CRUD ----

  openAddModal(type) {
    const t = ['expense', 'revenue', 'investment'].includes(type) ? type : 'expense';
    const typePick = this._TYPES.map(T =>
      `<label class="cat-type-btn"><input type="radio" name="cat_type" value="${T.key}"${T.key === t ? ' checked' : ''}>${T.icon} ${T.label}</label>`).join('');
    Modal.open('Nouvelle catégorie', `
      <form onsubmit="Categories._confirmAdd(event)">
        <div class="form-group">
          <label>Nom de la catégorie</label>
          <input name="cat_name" class="form-input" required autofocus placeholder="ex: Transport, Loisirs, Santé…">
        </div>
        <div class="form-group">
          <label>Type</label>
          <div class="cat-type-pick">${typePick}</div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">Créer la catégorie</button>
        </div>
      </form>`);
  },

  _confirmAdd(event) {
    event.preventDefault();
    const fd = new FormData(event.target);
    const name = (fd.get('cat_name') || '').trim();
    if (!name) return;
    const cats = Storage.getCategories();
    if (cats.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      alert('Cette catégorie existe déjà.');
      return;
    }
    cats.push({ id: 'cat_' + Date.now(), name, subcategories: [], type: fd.get('cat_type') || 'expense' });
    Storage.saveCategories(cats);
    Modal.close();
    this.render();
    Expenses._populateCatFilter();
  },

  deleteCategory(id) {
    const cats = Storage.getCategories();
    const cat = cats.find(c => c.id === id);
    if (!cat) return;
    if (!confirm(`Supprimer la catégorie "${cat.name}" et toutes ses sous-catégories ?`)) return;
    Storage.saveCategories(cats.filter(c => c.id !== id));
    this._editingCatId = null;
    this.render();
    Expenses._populateCatFilter();
  },

  addSubcat(catId) { this._openAddSubcatModal(catId); },

  deleteSubcat(catId, idx) {
    const cats = Storage.getCategories();
    const cat = cats.find(c => c.id === catId);
    if (!cat) return;
    const name = cat.subcategories[idx];
    if (!confirm(`Supprimer la sous-catégorie « ${name} » ?`)) return;
    cat.subcategories.splice(idx, 1);
    Storage.saveCategories(cats);
    this.render();
  },

  resetToDefaults() {
    if (!confirm('Réinitialiser toutes les catégories aux valeurs par défaut ?')) return;
    Storage.saveCategories([]);
    Storage.getCategories();
    this._editingCatId = null;
    this.render();
  },

  getCategoryNames() { return Storage.getCategories().map(c => c.name); },
  getSubcats(categoryName) {
    const cat = Storage.getCategories().find(c => c.name === categoryName);
    return cat ? cat.subcategories : [];
  },
};
