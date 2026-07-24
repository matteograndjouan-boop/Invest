const PeriodFilter = {
  _STORAGE_KEY: 'invest_period_filter',
  _listeners: [],
  _dropdownYear: null,
  _dropdownOpen: false,
  _panelOpen: false,

  get() {
    const saved = Storage.get(this._STORAGE_KEY);
    if (saved) return saved;
    const now = new Date();
    return {
      type: 'month',
      year: now.getFullYear(),
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      quarter: Math.ceil((now.getMonth() + 1) / 3),
      semester: now.getMonth() < 6 ? 1 : 2,
      start: '',
      end: '',
    };
  },

  set(state) {
    Storage.set(this._STORAGE_KEY, state);
    this._notify();
  },

  getDateRange() {
    const s = this.get();
    switch (s.type) {
      case 'month': {
        const [y, m] = s.month.split('-').map(Number);
        const last = new Date(y, m, 0).getDate();
        return { start: `${y}-${String(m).padStart(2,'0')}-01`, end: `${y}-${String(m).padStart(2,'0')}-${String(last).padStart(2,'0')}` };
      }
      case 'quarter': {
        const y = s.year, q = s.quarter;
        const sm = (q - 1) * 3 + 1, em = q * 3;
        return { start: `${y}-${String(sm).padStart(2,'0')}-01`, end: `${y}-${String(em).padStart(2,'0')}-${String(new Date(y,em,0).getDate()).padStart(2,'0')}` };
      }
      case 'semester': {
        const y = s.year, sm = s.semester === 1 ? 1 : 7, em = s.semester === 1 ? 6 : 12;
        return { start: `${y}-${String(sm).padStart(2,'0')}-01`, end: `${y}-${String(em).padStart(2,'0')}-${String(new Date(y,em,0).getDate()).padStart(2,'0')}` };
      }
      case 'year':
        return { start: `${s.year}-01-01`, end: `${s.year}-12-31` };
      case 'range':
        return { start: s.start || '', end: s.end || '' };
      default: {
        const now = new Date(), y = now.getFullYear(), m = now.getMonth() + 1;
        return { start: `${y}-${String(m).padStart(2,'0')}-01`, end: `${y}-${String(m).padStart(2,'0')}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}` };
      }
    }
  },

  getLabel() {
    const s = this.get();
    const MFR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    switch (s.type) {
      case 'month': { const [y,m] = s.month.split('-').map(Number); return `${MFR[m-1]} ${y}`; }
      case 'quarter': return `T${s.quarter} ${s.year}`;
      case 'semester': return `S${s.semester} ${s.year}`;
      case 'year': return `${s.year}`;
      case 'range': {
        const fmt = d => d ? new Intl.DateTimeFormat('fr-FR').format(new Date(d+'T00:00:00')) : '?';
        return s.start || s.end ? `${fmt(s.start)} → ${fmt(s.end)}` : 'Choisir une plage';
      }
      default: {
        const now = new Date();
        return `${MFR[now.getMonth()]} ${now.getFullYear()}`;
      }
    }
  },

  // Texte du déclencheur compact : sur Comparaisons, le sélecteur mois/trimestre/... est masqué
  // (CSS body[data-view="comparisons"]) car cet onglet a ses 2 propres sélecteurs de période —
  // afficher le libellé de période globale y serait trompeur, donc on montre le mode de date à
  // la place (seul réglage encore pertinent dans le panneau sur cet onglet).
  _triggerLabel() {
    if (document.body.getAttribute('data-view') === 'comparisons') {
      return Storage.getDateMode() === 'effective' ? 'Date effective' : 'Date transaction';
    }
    return this.getLabel();
  },

  onChange(cb) { this._listeners.push(cb); },
  _notify() { this._listeners.forEach(cb => { try { cb(); } catch(e) { console.error(e); } }); },

  _prev() {
    const s = { ...this.get() };
    switch (s.type) {
      case 'month': { const [y,m] = s.month.split('-').map(Number); const d = new Date(y,m-2,1); s.month=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; s.year=d.getFullYear(); break; }
      case 'quarter': { s.quarter--; if (s.quarter<1){s.quarter=4;s.year--;} break; }
      case 'semester': { s.semester--; if (s.semester<1){s.semester=2;s.year--;} break; }
      case 'year': s.year--; break;
    }
    this.set(s);
    this._updateLabel();
  },

  _next() {
    const s = { ...this.get() };
    switch (s.type) {
      case 'month': { const [y,m] = s.month.split('-').map(Number); const d = new Date(y,m,1); s.month=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; s.year=d.getFullYear(); break; }
      case 'quarter': { s.quarter++; if (s.quarter>4){s.quarter=1;s.year++;} break; }
      case 'semester': { s.semester++; if (s.semester>2){s.semester=1;s.year++;} break; }
      case 'year': s.year++; break;
    }
    this.set(s);
    this._updateLabel();
  },

  renderUI() {
    const container = document.getElementById('period-filter-container');
    if (!container) return;
    container.innerHTML = this._buildHTML();
    this._bindEvents();
    this._updateLabel();
    this._updateDateModeToggle();
  },

  _setDateMode(mode) {
    Storage.setDateMode(mode);
    this._updateDateModeToggle();
    this._notify();
  },

  _updateDateModeToggle() {
    const mode = Storage.getDateMode();
    const t = document.getElementById('date-mode-transaction');
    const e = document.getElementById('date-mode-effective');
    if (t) t.classList.toggle('active', mode === 'transaction');
    if (e) e.classList.toggle('active', mode === 'effective');
    this._refreshTrigger();
  },

  // Déclencheur compact (juste la période en cours) : le panneau complet — jusqu'ici affiché en
  // permanence en pleine largeur — ne s'affiche plus qu'au clic, replié par défaut pour ne pas
  // encombrer le haut de page.
  _buildHTML() {
    return `
      <div class="period-compact">
        <button class="period-arrow" id="period-trigger-prev" title="Période précédente">&#8592;</button>
        <button class="period-trigger" id="period-trigger">
          <span class="period-trigger-ico">📅</span>
          <span id="period-trigger-label"></span>
          <span class="period-trigger-chev">▾</span>
        </button>
        <button class="period-arrow" id="period-trigger-next" title="Période suivante">&#8594;</button>
        <div class="period-panel hidden" id="period-panel">
          <div class="period-filter">
            <div class="period-type-btns">
              <button class="period-type-btn" data-type="month">Mois</button>
              <button class="period-type-btn" data-type="quarter">Trimestre</button>
              <button class="period-type-btn" data-type="semester">Semestre</button>
              <button class="period-type-btn" data-type="year">Année</button>
              <button class="period-type-btn" data-type="range">Plage libre</button>
            </div>
            <div class="period-nav" id="period-nav-row">
              <button class="period-arrow" id="period-prev">&#8592;</button>
              <div class="period-label-wrap">
                <button class="period-label-btn" id="period-label-btn"></button>
                <div class="period-dropdown hidden" id="period-dropdown"></div>
              </div>
              <button class="period-arrow" id="period-next">&#8594;</button>
            </div>
            <div class="date-mode-toggle">
              <button class="date-mode-btn" id="date-mode-transaction" onclick="PeriodFilter._setDateMode('transaction')">Transaction</button>
              <button class="date-mode-btn" id="date-mode-effective" onclick="PeriodFilter._setDateMode('effective')">Effective</button>
            </div>
          </div>
        </div>
      </div>`;
  },

  _bindEvents() {
    document.getElementById('period-trigger').addEventListener('click', (e) => {
      e.stopPropagation();
      this._panelOpen ? this._closePanel() : this._openPanel();
    });
    document.getElementById('period-panel').addEventListener('click', e => e.stopPropagation());

    document.querySelectorAll('.period-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = { ...this.get() };
        if (s.type === btn.dataset.type) {
          // Déjà actif → désactive (aucun filtre, label = mois courant)
          s.type = null;
        } else {
          // Réactive ce type avec la dernière valeur mémorisée
          s.type = btn.dataset.type;
          if (!s.year) s.year = new Date().getFullYear();
        }
        this.set(s);
        this._closeDropdown();
        this._updateLabel();
      });
    });

    document.getElementById('period-prev').addEventListener('click', () => { this._prev(); this._closeDropdown(); });
    document.getElementById('period-next').addEventListener('click', () => { this._next(); this._closeDropdown(); });

    // Flèches à côté du déclencheur compact : mêmes _prev()/_next() que celles du panneau
    // ci-dessus, mais accessibles SANS ouvrir le panneau — naviguer d'un mois (ou trimestre...)
    // sur l'autre sans déplier tout le sélecteur. stopPropagation : ces flèches sont hors du
    // panneau (donc pas couvertes par le e => e.stopPropagation() posé dessus un peu plus bas),
    // sans ça le clic remonterait jusqu'au listener global qui referme panneau/dropdown — sans
    // effet ici (déjà fermés) mais plus sûr d'arrêter la propagation explicitement.
    document.getElementById('period-trigger-prev').addEventListener('click', (e) => { e.stopPropagation(); this._prev(); });
    document.getElementById('period-trigger-next').addEventListener('click', (e) => { e.stopPropagation(); this._next(); });

    document.getElementById('period-label-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this._dropdownOpen ? this._closeDropdown() : this._openDropdown();
    });

    document.addEventListener('click', () => { this._closeDropdown(); this._closePanel(); });
    document.getElementById('period-dropdown').addEventListener('click', e => e.stopPropagation());

    // Hide arrows in range mode
    this._updateArrows();
  },

  _openPanel() {
    document.getElementById('period-panel')?.classList.remove('hidden');
    document.getElementById('period-trigger')?.classList.add('active');
    this._panelOpen = true;
    this._positionPanel();
  },

  // Centre le panneau sur le déclencheur (voir CSS .period-panel : left:50%+transform sert de
  // repli avant que ce calcul s'exécute) SAUF si ça le ferait déborder — le déclencheur est aligné
  // à droite de la topbar (voir .global-period-bar), avec une largeur minimale posée par
  // _syncTriggerWidth pour ne jamais varier ; l'espace à sa droite (jusqu'au bord de .main-content)
  // est donc structurellement plus étroit que la moitié du panneau (jusqu'à 480px), quelle que soit
  // la largeur de fenêtre — un centrage pur déborderait systématiquement à droite. Bornes sur
  // .main-content (pas window.innerWidth) : reflète la zone de contenu réellement visible (gouttière
  // de scrollbar comprise), pas la largeur théorique du viewport. Mesuré en JS (comme
  // _syncTriggerWidth) plutôt qu'en CSS pur : position du déclencheur et largeur du panneau ne sont
  // connues qu'à l'exécution.
  _positionPanel() {
    const trigger = document.getElementById('period-trigger');
    const compact = trigger?.closest('.period-compact');
    const panel = document.getElementById('period-panel');
    const bounds = document.querySelector('.main-content');
    if (!trigger || !compact || !panel || !bounds) return;
    const MARGIN = 12;
    const triggerRect = trigger.getBoundingClientRect();
    const compactRect = compact.getBoundingClientRect();
    const boundsRect = bounds.getBoundingClientRect();
    const panelWidth = panel.getBoundingClientRect().width;
    const idealLeft = triggerRect.left + triggerRect.width / 2 - panelWidth / 2;
    const clampedLeft = Math.min(Math.max(idealLeft, boundsRect.left + MARGIN), boundsRect.right - panelWidth - MARGIN);
    panel.style.left = `${clampedLeft - compactRect.left}px`;
    panel.style.transform = 'none';
  },

  _closePanel() {
    document.getElementById('period-panel')?.classList.add('hidden');
    document.getElementById('period-trigger')?.classList.remove('active');
    this._panelOpen = false;
    this._closeDropdown();
  },

  _openDropdown() {
    const s = this.get();
    if (!s.type) return; // aucun filtre actif, pas de dropdown
    if (s.type === 'month') { const [y] = s.month.split('-').map(Number); this._dropdownYear = y; }
    else this._dropdownYear = s.year || new Date().getFullYear();
    this._renderDropdown();
    document.getElementById('period-dropdown').classList.remove('hidden');
    this._dropdownOpen = true;
  },

  _closeDropdown() {
    const dd = document.getElementById('period-dropdown');
    if (dd) dd.classList.add('hidden');
    this._dropdownOpen = false;
  },

  _renderDropdown() {
    const s = this.get();
    const dd = document.getElementById('period-dropdown');
    if (!dd) return;
    const MFR_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

    if (s.type === 'range') {
      dd.innerHTML = `
        <div class="pd-range">
          <label>Du</label>
          <input type="date" id="pd-range-start" value="${s.start||''}">
          <label>Au</label>
          <input type="date" id="pd-range-end" value="${s.end||''}">
          <button class="btn-primary btn-sm" onclick="PeriodFilter._applyRange()">Appliquer</button>
        </div>`;
      return;
    }

    const yearNav = `
      <div class="pd-year-nav">
        <button onclick="PeriodFilter._ddYearNav(-1)">&#8592;</button>
        <span id="pd-dropdown-year">${this._dropdownYear}</span>
        <button onclick="PeriodFilter._ddYearNav(1)">&#8594;</button>
      </div>`;

    if (s.type === 'month') {
      const [curY, curM] = s.month.split('-').map(Number);
      const btns = MFR_SHORT.map((m, i) => {
        const active = (i+1) === curM && this._dropdownYear === curY ? 'active' : '';
        return `<button class="pd-item-btn ${active}" onclick="PeriodFilter._selectMonth(${i+1})">${m}</button>`;
      }).join('');
      dd.innerHTML = yearNav + `<div class="pd-months-grid">${btns}</div>`;
    } else if (s.type === 'quarter') {
      const btns = [1,2,3,4].map(q => {
        const active = q === s.quarter && this._dropdownYear === s.year ? 'active' : '';
        return `<button class="pd-item-btn ${active}" onclick="PeriodFilter._selectQuarter(${q})">T${q}</button>`;
      }).join('');
      dd.innerHTML = yearNav + `<div class="pd-quarters-grid">${btns}</div>`;
    } else if (s.type === 'semester') {
      const btns = [1,2].map(sem => {
        const active = sem === s.semester && this._dropdownYear === s.year ? 'active' : '';
        return `<button class="pd-item-btn ${active}" onclick="PeriodFilter._selectSemester(${sem})">S${sem}</button>`;
      }).join('');
      dd.innerHTML = yearNav + `<div class="pd-semesters-grid">${btns}</div>`;
    } else if (s.type === 'year') {
      const curYear = new Date().getFullYear();
      const btns = Array.from({length:8}, (_,i) => curYear - 3 + i).map(y => {
        const active = y === s.year ? 'active' : '';
        return `<button class="pd-item-btn ${active}" onclick="PeriodFilter._selectYear(${y})">${y}</button>`;
      }).join('');
      dd.innerHTML = `<div class="pd-years-grid">${btns}</div>`;
    }
  },

  _ddYearNav(dir) {
    this._dropdownYear += dir;
    this._renderDropdown();
  },

  _selectMonth(m) {
    const s = { ...this.get() };
    s.month = `${this._dropdownYear}-${String(m).padStart(2,'0')}`;
    s.year = this._dropdownYear;
    this.set(s);
    this._closeDropdown();
    this._updateLabel();
  },

  _selectQuarter(q) {
    const s = { ...this.get() };
    s.quarter = q; s.year = this._dropdownYear;
    this.set(s);
    this._closeDropdown();
    this._updateLabel();
  },

  _selectSemester(sem) {
    const s = { ...this.get() };
    s.semester = sem; s.year = this._dropdownYear;
    this.set(s);
    this._closeDropdown();
    this._updateLabel();
  },

  _selectYear(y) {
    const s = { ...this.get() };
    s.year = y;
    this.set(s);
    this._closeDropdown();
    this._updateLabel();
  },

  _applyRange() {
    const start = document.getElementById('pd-range-start')?.value || '';
    const end = document.getElementById('pd-range-end')?.value || '';
    if (!start || !end) { alert('Veuillez saisir les deux dates.'); return; }
    if (start > end) { alert('La date de début doit être avant la date de fin.'); return; }
    const s = { ...this.get(), start, end };
    this.set(s);
    this._closeDropdown();
    this._updateLabel();
  },

  _updateLabel() {
    const btn = document.getElementById('period-label-btn');
    if (btn) btn.textContent = this.getLabel() + ' ▾';
    this._refreshTrigger();
    this._updateAll();
  },

  _refreshTrigger() {
    const el = document.getElementById('period-trigger-label');
    if (el) el.textContent = this._triggerLabel();
    this._syncTriggerWidth();
  },

  // Libellés possibles pour un type de période donné — seulement les types où les flèches de
  // navigation sont visibles (voir _updateArrows : mois/trimestre/semestre/année). "Plage libre"
  // et "aucun filtre" n'ont pas de flèches, donc pas de risque de "saut" de taille en cliquant
  // dessus, pas besoin de les couvrir ici.
  _labelsForType(type, year) {
    const MFR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    switch (type) {
      case 'month': return MFR.map(m => `${m} ${year}`);
      case 'quarter': return [1,2,3,4].map(q => `T${q} ${year}`);
      case 'semester': return [1,2].map(sem => `S${sem} ${year}`);
      case 'year': return [`${year}`];
      default: return null;
    }
  },

  // Largeur nécessaire pour que TOUS les candidats tiennent dans la police déjà appliquée à `el`
  // (mesurée via un élément hors-écran temporaire, avec CETTE police précise — le déclencheur
  // compact et le bouton du panneau déplié n'ont pas la même taille/graisse de police, donc pas
  // la même largeur cible pour un même texte).
  _widestLabelWidth(el, candidates) {
    const cs = getComputedStyle(el);
    const measureEl = document.createElement('span');
    measureEl.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:${cs.fontSize};font-weight:${cs.fontWeight};font-family:${cs.fontFamily};`;
    document.body.appendChild(measureEl);
    const maxTextWidth = Math.max(...candidates.map(c => { measureEl.textContent = c; return measureEl.getBoundingClientRect().width; }));
    measureEl.remove();
    // min-width s'applique à la boîte de BORDURE en box-sizing:border-box — sans réintégrer le
    // padding/bordure horizontaux de `el`, le texte le plus long déborde quand même du min-width
    // posé (mesuré sur #period-label-btn, qui a son propre padding 16px+16px et bordure 2px+2px :
    // min-width calculé sur le texte seul, "Septembre 2026 ▾" débordait de 36px malgré un
    // min-width en apparence correct — #period-trigger-label, un <span> sans padding propre, n'a
    // pas ce problème, extra vaut alors ~0).
    const extra = cs.boxSizing === 'border-box'
      ? parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)
      : 0;
    return Math.ceil(maxTextWidth + extra);
  },

  // Empêche à la fois le bouton du déclencheur compact ET le bouton du panneau déplié de changer
  // de largeur — que ce soit en naviguant avec les flèches voisines au sein d'un même type (ex.
  // en mois, "Mars 2026" est bien plus court que "Septembre 2026") OU en changeant de type
  // (Trimestre/Semestre/Année sont des libellés bien plus courts que certains mois) : calcule la
  // largeur du libellé le plus long parmi TOUTES les valeurs possibles de TOUS les types à
  // flèches réunis (pas seulement celles du type courant), et la fixe en min-width sur chacun des
  // 2 boutons — un seul et même gabarit de largeur par bouton, quel que soit le type actif.
  // Recalculé à chaque rafraîchissement plutôt que mis en cache : coût négligeable (une
  // quarantaine de mesures de chaînes courtes au total), évite d'avoir à invalider un cache au
  // changement de type/année.
  _syncTriggerWidth() {
    const triggerLabelEl = document.getElementById('period-trigger-label');
    const panelLabelBtn = document.getElementById('period-label-btn');
    const s = this.get();
    const hasArrows = s.type && s.type !== 'range';
    const base = hasArrows
      ? ['month', 'quarter', 'semester', 'year'].flatMap(t => this._labelsForType(t, s.year || new Date().getFullYear()))
      : null;

    if (triggerLabelEl) triggerLabelEl.style.minWidth = base ? `${this._widestLabelWidth(triggerLabelEl, base)}px` : '';
    // Le bouton du panneau affiche toujours un " ▾" à la suite (voir _updateLabel) : mesuré avec
    // ce même suffixe pour que la largeur réservée corresponde exactement à ce qui est rendu.
    if (panelLabelBtn) panelLabelBtn.style.minWidth = base ? `${this._widestLabelWidth(panelLabelBtn, base.map(c => c + ' ▾'))}px` : '';
  },

  _updateAll() {
    // Highlight active type button
    const s = this.get();
    document.querySelectorAll('.period-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === s.type);
    });
    this._updateArrows();
  },

  _updateArrows() {
    const s = this.get();
    const prev = document.getElementById('period-prev');
    const next = document.getElementById('period-next');
    const triggerPrev = document.getElementById('period-trigger-prev');
    const triggerNext = document.getElementById('period-trigger-next');
    const hide = s.type === 'range' || !s.type;
    if (prev) prev.style.visibility = hide ? 'hidden' : '';
    if (next) next.style.visibility = hide ? 'hidden' : '';
    if (triggerPrev) triggerPrev.style.visibility = hide ? 'hidden' : '';
    if (triggerNext) triggerNext.style.visibility = hide ? 'hidden' : '';
  },
};
