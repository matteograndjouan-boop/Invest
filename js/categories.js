const Categories = {
  _dnd: null,
  _editingCatId: null,        // catégorie en mode édition
  _expanded: new Set(),       // catégories dont la liste de sous-catégories est dépliée

  render() {
    const cats = Storage.getCategories();
    const container = document.getElementById('categories-container');
    if (!container) return;

    const subEl = document.getElementById('cat-subtitle');
    if (subEl) {
      const nSub = cats.reduce((s, c) => s + c.subcategories.length, 0);
      subEl.textContent = `${cats.length} catégorie${cats.length > 1 ? 's' : ''} · ${nSub} sous-catégorie${nSub > 1 ? 's' : ''}`;
    }

    if (!cats.length) {
      container.innerHTML = `<div class="category-card card-new" onclick="Categories.openAddModal()"><div class="new-plus">＋</div><span class="new-label">Nouvelle catégorie</span></div>`;
      return;
    }

    const MAX_VIEW = 3; // sous-catégories visibles avant « +N autres »

    const cards = cats.map(cat => {
      const editing = this._editingCatId === cat.id;
      const m  = this._meta(cat.name);
      const sc = m.scheme;
      const icon = cat.icon || m.icon;
      const vars = `--cat-bar:linear-gradient(90deg,${sc.bar});--cat-dot:${sc.dot};--cat-ico:${sc.bg};--cat-cnt:${sc.count}`;
      const n = cat.subcategories.length;
      const aliases = cat.aliases || [];

      // 🕘 = simple indicateur passif des anciens noms (mémorisés AUTO au renommage).
      const histInline = aliases.length
        ? `<span class="cat-hist-mini" title="Anciens noms : ${aliases.join(' · ')}">🕘 ${aliases.length}</span>` : '';
      const obsoleteBadge = cat.obsolete ? '<span class="cat-obsolete-badge" title="Ne reçoit plus de nouvelles transactions">Inactive</span>' : '';
      // En mode édition, l'icône devient un bouton (clic = choisir une autre icône).
      const iconHtml = editing
        ? `<button class="cat-icon cat-icon-edit" onclick="Categories._openIconPicker('${cat.id}')" title="Changer l'icône">${icon}</button>`
        : `<div class="cat-icon">${icon}</div>`;

      const top = `
        <div class="card-top" onmousedown="Categories._dndStart(event,'cat','${cat.id}',null)" ontouchstart="Categories._dndStart(event,'cat','${cat.id}',null)" title="Glisser pour réordonner">
          <div class="cat-left">
            ${iconHtml}
            <span class="cat-name" title="${cat.name}">${cat.name}</span>
          </div>
          <div class="cat-top-right">
            ${!editing ? histInline : ''}${obsoleteBadge}
            <span class="cat-count">${n}</span>
          </div>
        </div>`;
      const note = cat.versionNote ? `<div class="cat-version-note">↪ ${cat.versionNote}</div>` : '';

      if (!editing) {
        const expanded = this._expanded.has(cat.id);
        const list = expanded ? cat.subcategories : cat.subcategories.slice(0, MAX_VIEW);
        const shown = list.map(s =>
          `<div class="sub-row"><span class="sub-dot"></span><span class="sub-txt" title="${s}">${s}</span></div>`).join('');
        let moreLink = '';
        if (n > MAX_VIEW) {
          moreLink = expanded
            ? `<div class="more more-link" onclick="Categories._toggleExpand('${cat.id}')">▲ Réduire</div>`
            : `<div class="more more-link" onclick="Categories._toggleExpand('${cat.id}')">+${n - MAX_VIEW} autre${n - MAX_VIEW > 1 ? 's' : ''}</div>`;
        }
        const body = n ? `<div class="subs">${shown}</div>${moreLink}` : '<div class="subs-empty">Aucune sous-catégorie</div>';
        return `
          <div class="category-card${cat.obsolete ? ' cat-obsolete' : ''}" data-cat-id="${cat.id}" id="cat-${cat.id}" style="${vars}">
            ${top}${note}${body}
            <div class="card-footer">
              <button class="btn-edit" onclick="Categories._startEdit('${cat.id}')">✎ Modifier</button>
            </div>
          </div>`;
      }

      // Mode édition
      const subEdit = cat.subcategories.map((s, idx) => `
        <div class="subcat-item sub-edit" data-cat-id="${cat.id}" data-subcat-idx="${idx}"
             onmousedown="Categories._dndStart(event,'subcat','${cat.id}',${idx})" ontouchstart="Categories._dndStart(event,'subcat','${cat.id}',${idx})" title="Glisser pour déplacer">
          <span class="sub-txt" title="${s}">${s}</span>
          <button class="sub-x" onclick="Categories.deleteSubcat('${cat.id}',${idx})" title="Supprimer">×</button>
        </div>`).join('');
      return `
        <div class="category-card editing${cat.obsolete ? ' cat-obsolete' : ''}" data-cat-id="${cat.id}" id="cat-${cat.id}" style="${vars}">
          ${top}
          <div class="edit-bar">
            <button class="btn-rename" onclick="Categories._openRenameCat('${cat.id}')">✎ Renommer</button>
          </div>
          ${note}
          <div class="subs subcat-list" data-cat-id="${cat.id}">
            ${subEdit || '<div class="subs-empty">Aucune sous-catégorie</div>'}
          </div>
          <button class="btn-addsub" onclick="Categories._openAddSubcatModal('${cat.id}')">＋ Sous-catégorie</button>
          <div class="edit-footer">
            <button class="btn-delfull" onclick="Categories.deleteCategory('${cat.id}')">🗑 Supprimer</button>
            <button class="btn-done" onclick="Categories._stopEdit()">✓ Terminer</button>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = cards +
      `<div class="category-card card-new" onclick="Categories.openAddModal()"><div class="new-plus">＋</div><span class="new-label">Nouvelle catégorie</span></div>`;
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

  _toggleExpand(catId) {
    if (this._expanded.has(catId)) this._expanded.delete(catId);
    else this._expanded.add(catId);
    this.render();
  },

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
      ? aliases.map((a, i) => `<span class="cat-alias-chip">${a}<button onclick="Categories._histRemove('${catId}',${i})" title="Retirer">✕</button></span>`).join(' ')
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

  _histRemove(catId, idx) {
    const cats = Storage.getCategories();
    const cat  = cats.find(c => c.id === catId);
    if (cat && cat.aliases) {
      cat.aliases.splice(idx, 1);
      if (!cat.aliases.length) delete cat.aliases;
      Storage.saveCategories(cats);
      this.render();
    }
    this._openHistoryModal(catId);
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

  openAddModal() {
    Modal.open('Nouvelle catégorie', `
      <form onsubmit="Categories._confirmAdd(event)">
        <div class="form-group">
          <label>Nom de la catégorie</label>
          <input name="cat_name" class="form-input" required autofocus placeholder="ex: Transport, Loisirs, Santé…">
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="Modal.close()">Annuler</button>
          <button type="submit" class="btn-primary">Créer la catégorie</button>
        </div>
      </form>`);
  },

  _confirmAdd(event) {
    event.preventDefault();
    const name = new FormData(event.target).get('cat_name').trim();
    if (!name) return;
    const cats = Storage.getCategories();
    if (cats.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      alert('Cette catégorie existe déjà.');
      return;
    }
    cats.push({ id: 'cat_' + Date.now(), name, subcategories: [] });
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
