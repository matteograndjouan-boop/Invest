// Factory de sélecteur de période (déclencheur compact + panneau déplié : type mois/trimestre/
// semestre/année/plage libre, navigation prev/next, mini-calendrier). PeriodFilter (plus bas) est
// l'instance globale historique (filtre partagé par Flux/Budget, + toggle Date transaction/
// effective) ; Comparisons (js/comparisons.js) en crée 2 autres instances indépendantes (une par
// période comparée), chacune avec son propre état et ses propres ids DOM (idPrefix) — pour
// pouvoir comparer par exemple un trimestre à une année, ou 2 plages libres, sans se marcher
// dessus. Composant à part (pas basé sur Dropdown, voir js/dropdown.js) — le comportement de
// l'instance globale est resté strictement inchangé par cette généralisation (mêmes ids, donc
// même CSS, même comportement).
//
// _allPickers : registre partagé de TOUTES les instances (module-level, pas par instance) — sur
// Comparaisons, 3 coexistent sur la même page (filtre global + A + B). Chaque déclencheur stoppe
// la propagation de son clic (voir _bindEvents), donc le listener document "ferme si clic dehors"
// d'UNE instance ne voit jamais le clic sur le déclencheur d'une AUTRE : sans ce registre, ouvrir
// le picker B pendant que A est encore ouvert laissait les 2 panneaux ouverts en même temps,
// superposés (retour utilisateur explicite). _openPanel() ferme donc d'abord tous les autres.
const _allPickers = [];

function createPeriodPicker(idPrefix, storageKey, opts = {}) {
  const showDateModeToggle = !!opts.showDateModeToggle;

  const P = {
    _storageKey: storageKey,
    _memState: null,       // état en mémoire quand storageKey est null (pas de persistance)
    _listeners: [],
    _dropdownYear: null,
    _dropdownOpen: false,
    _panelOpen: false,

    _id(suffix) { return `${idPrefix}-${suffix}`; },
    _el(suffix) { return document.getElementById(this._id(suffix)); },

    _defaultState() {
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

    get() {
      if (!storageKey) return this._memState || this._defaultState();
      const saved = Storage.get(storageKey);
      return saved || this._defaultState();
    },

    set(state) {
      if (storageKey) Storage.set(storageKey, state);
      else this._memState = state;
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

    // Texte du déclencheur compact : personnalisable (voir PeriodFilter plus bas — sur
    // Comparaisons, le sélecteur mois/trimestre/... global est masqué, CSS body[data-view=
    // "comparisons"], car cet onglet a ses 2 propres sélecteurs de période — afficher le libellé
    // de période globale y serait trompeur, donc on montre le mode de date à la place).
    _triggerLabel() {
      return opts.triggerLabel ? opts.triggerLabel(this) : this.getLabel();
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
      const container = document.getElementById(this._id('filter-container'));
      if (!container) return;
      container.innerHTML = this._buildHTML();
      this._bindEvents();
      this._updateLabel();
      if (showDateModeToggle) this._updateDateModeToggle();
    },

    _setDateMode(mode) {
      Storage.setDateMode(mode);
      this._updateDateModeToggle();
      this._notify();
    },

    _updateDateModeToggle() {
      const mode = Storage.getDateMode();
      const t = this._el('date-mode-transaction');
      const e = this._el('date-mode-effective');
      if (t) t.classList.toggle('active', mode === 'transaction');
      if (e) e.classList.toggle('active', mode === 'effective');
      this._refreshTrigger();
    },

    // Chevron SVG (pas un caractère Unicode ←/→) : le tracé d'un glyphe texte ne peut pas se
    // contrôler précisément (épaisseur dépendante du rendu de la police, pas franchement plus
    // épais via font-weight ; centrage optique imparfait, la police laisse un vide asymétrique
    // autour du caractère) — un viewBox+polyline donne un tracé net, aussi épais que voulu
    // (stroke-width) et strictement centré dans le carré du bouton. stroke="currentColor" suit la
    // couleur du bouton (donc son survol) sans règle CSS séparée à maintenir en phase.
    _arrowSvg(dir) {
      const points = dir === 'left' ? '15,6 9,12 15,18' : '9,6 15,12 9,18';
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="${points}"/></svg>`;
    },

    // Déclencheur compact (juste la période en cours) : le panneau complet ne s'affiche qu'au
    // clic, replié par défaut. triggerClassName/wrapClassName (voir Comparisons) permettent une
    // variante teintée (indigo/rose) sans dupliquer tout ce gabarit.
    _buildHTML() {
      const dateModeHtml = showDateModeToggle ? `
            <div class="date-mode-toggle">
              <button class="date-mode-btn" id="${this._id('date-mode-transaction')}">Transaction</button>
              <button class="date-mode-btn" id="${this._id('date-mode-effective')}">Effective</button>
            </div>` : '';
      return `
        <div class="period-compact${opts.wrapClassName ? ' ' + opts.wrapClassName : ''}">
          <button class="period-arrow" id="${this._id('trigger-prev')}" title="Période précédente">${this._arrowSvg('left')}</button>
          <button class="period-trigger${opts.triggerClassName ? ' ' + opts.triggerClassName : ''}" id="${this._id('trigger')}">
            <span class="period-trigger-ico">📅</span>
            <span class="period-trigger-label" id="${this._id('trigger-label')}"></span>
            <span class="period-trigger-chev">▾</span>
          </button>
          <button class="period-arrow" id="${this._id('trigger-next')}" title="Période suivante">${this._arrowSvg('right')}</button>
          <div class="period-panel hidden" id="${this._id('panel')}">
            <div class="period-filter">
              <div class="period-type-btns">
                <button class="period-type-btn" data-type="month">Mois</button>
                <button class="period-type-btn" data-type="quarter">Trimestre</button>
                <button class="period-type-btn" data-type="semester">Semestre</button>
                <button class="period-type-btn" data-type="year">Année</button>
                <button class="period-type-btn" data-type="range">Plage libre</button>
              </div>
              <div class="period-nav" id="${this._id('nav-row')}">
                <button class="period-arrow" id="${this._id('prev')}">${this._arrowSvg('left')}</button>
                <div class="period-label-wrap">
                  <button class="period-label-btn" id="${this._id('label-btn')}"></button>
                  <div class="period-dropdown hidden" id="${this._id('dropdown')}"></div>
                </div>
                <button class="period-arrow" id="${this._id('next')}">${this._arrowSvg('right')}</button>
              </div>${dateModeHtml}
            </div>
          </div>
        </div>`;
    },

    _bindEvents() {
      this._el('trigger').addEventListener('click', (e) => {
        e.stopPropagation();
        this._panelOpen ? this._closePanel() : this._openPanel();
      });
      this._el('panel').addEventListener('click', e => e.stopPropagation());

      // Scopé au panneau de CETTE instance (pas document.querySelectorAll global) : plusieurs
      // instances coexistent sur la page (filtre global + 2 sélecteurs de comparaison), chacune
      // avec ses propres boutons .period-type-btn.
      this._el('panel').querySelectorAll('.period-type-btn').forEach(btn => {
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

      this._el('prev').addEventListener('click', () => { this._prev(); this._closeDropdown(); });
      this._el('next').addEventListener('click', () => { this._next(); this._closeDropdown(); });

      // Flèches à côté du déclencheur compact : mêmes _prev()/_next() que celles du panneau
      // ci-dessus, mais accessibles SANS ouvrir le panneau.
      this._el('trigger-prev').addEventListener('click', (e) => { e.stopPropagation(); this._prev(); });
      this._el('trigger-next').addEventListener('click', (e) => { e.stopPropagation(); this._next(); });

      this._el('label-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this._dropdownOpen ? this._closeDropdown() : this._openDropdown();
      });

      document.addEventListener('click', () => { this._closeDropdown(); this._closePanel(); });

      // Délégué (pas d'onclick inline, qui ne pourrait référencer qu'UN SEUL nom global) : chaque
      // instance a son propre gabarit d'action, et _renderDropdown() reconstruit ce panneau à
      // chaque changement de type/année — un seul bind ici suffit pour toute la durée de
      // l'instance (survit aux remplacements d'innerHTML de ses enfants).
      this._el('dropdown').addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const value = btn.dataset.value;
        if (action === 'selectMonth') this._selectMonth(Number(value));
        else if (action === 'selectQuarter') this._selectQuarter(Number(value));
        else if (action === 'selectSemester') this._selectSemester(Number(value));
        else if (action === 'selectYear') this._selectYear(Number(value));
        else if (action === 'yearNav') this._ddYearNav(Number(value));
        else if (action === 'applyRange') this._applyRange();
      });

      if (showDateModeToggle) {
        this._el('date-mode-transaction')?.addEventListener('click', () => this._setDateMode('transaction'));
        this._el('date-mode-effective')?.addEventListener('click', () => this._setDateMode('effective'));
      }

      // Hide arrows in range mode
      this._updateArrows();
    },

    _openPanel() {
      // Un seul panneau ouvert à la fois, tous instances confondues (voir _allPickers plus haut).
      _allPickers.forEach(p => { if (p !== this) p._closePanel(); });
      this._el('panel')?.classList.remove('hidden');
      this._el('trigger')?.classList.add('active');
      this._panelOpen = true;
      this._positionPanel();
    },

    // Centre le panneau sur le déclencheur (voir CSS .period-panel : left:50% sert de repli avant
    // que ce calcul s'exécute) SAUF si ça le ferait déborder. Borne droite sur clientWidth (pas
    // getBoundingClientRect().right, la boîte de BORDURE) : .main-content a scrollbar-gutter:
    // stable, qui réserve une gouttière de scrollbar verticale même sans besoin de scroller —
    // cette gouttière fait partie de la boîte de bordure mais PAS de clientWidth. Ne touche QUE
    // `left` (jamais `transform`, laissé à l'animation d'ouverture — voir le commentaire CSS de
    // .period-panel) : un ancien `panel.style.transform = 'none'` ici annulait le glissement
    // vertical de l'ouverture en même temps qu'il neutralisait l'ancien centrage CSS par
    // translateX(-50%), le panneau apparaissait donc d'un coup plutôt que de glisser.
    _positionPanel() {
      const trigger = this._el('trigger');
      const compact = trigger?.closest('.period-compact');
      const panel = this._el('panel');
      const bounds = document.querySelector('.main-content');
      if (!trigger || !compact || !panel || !bounds) return;
      const MARGIN = 12;
      const triggerRect = trigger.getBoundingClientRect();
      const compactRect = compact.getBoundingClientRect();
      const boundsRect = bounds.getBoundingClientRect();
      const boundsRight = boundsRect.left + bounds.clientWidth;
      const panelWidth = panel.getBoundingClientRect().width;
      const idealLeft = triggerRect.left + triggerRect.width / 2 - panelWidth / 2;
      const clampedLeft = Math.min(Math.max(idealLeft, boundsRect.left + MARGIN), boundsRight - panelWidth - MARGIN);
      panel.style.left = `${clampedLeft - compactRect.left}px`;
    },

    _closePanel() {
      this._el('panel')?.classList.add('hidden');
      this._el('trigger')?.classList.remove('active');
      this._panelOpen = false;
      this._closeDropdown();
    },

    _openDropdown() {
      const s = this.get();
      if (!s.type) return; // aucun filtre actif, pas de dropdown
      if (s.type === 'month') { const [y] = s.month.split('-').map(Number); this._dropdownYear = y; }
      else this._dropdownYear = s.year || new Date().getFullYear();
      this._renderDropdown();
      this._el('dropdown').classList.remove('hidden');
      this._dropdownOpen = true;
    },

    _closeDropdown() {
      const dd = this._el('dropdown');
      if (dd) dd.classList.add('hidden');
      this._dropdownOpen = false;
    },

    _renderDropdown() {
      const s = this.get();
      const dd = this._el('dropdown');
      if (!dd) return;
      const MFR_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

      if (s.type === 'range') {
        dd.innerHTML = `
          <div class="pd-range">
            <label>Du</label>
            <input type="date" id="${this._id('range-start')}" value="${s.start||''}">
            <label>Au</label>
            <input type="date" id="${this._id('range-end')}" value="${s.end||''}">
            <button class="btn-primary btn-sm" data-action="applyRange">Appliquer</button>
          </div>`;
        return;
      }

      const yearNav = `
        <div class="pd-year-nav">
          <button data-action="yearNav" data-value="-1">&#8592;</button>
          <span>${this._dropdownYear}</span>
          <button data-action="yearNav" data-value="1">&#8594;</button>
        </div>`;

      if (s.type === 'month') {
        const [curY, curM] = s.month.split('-').map(Number);
        const btns = MFR_SHORT.map((m, i) => {
          const active = (i+1) === curM && this._dropdownYear === curY ? 'active' : '';
          return `<button class="pd-item-btn ${active}" data-action="selectMonth" data-value="${i+1}">${m}</button>`;
        }).join('');
        dd.innerHTML = yearNav + `<div class="pd-months-grid">${btns}</div>`;
      } else if (s.type === 'quarter') {
        const btns = [1,2,3,4].map(q => {
          const active = q === s.quarter && this._dropdownYear === s.year ? 'active' : '';
          return `<button class="pd-item-btn ${active}" data-action="selectQuarter" data-value="${q}">T${q}</button>`;
        }).join('');
        dd.innerHTML = yearNav + `<div class="pd-quarters-grid">${btns}</div>`;
      } else if (s.type === 'semester') {
        const btns = [1,2].map(sem => {
          const active = sem === s.semester && this._dropdownYear === s.year ? 'active' : '';
          return `<button class="pd-item-btn ${active}" data-action="selectSemester" data-value="${sem}">S${sem}</button>`;
        }).join('');
        dd.innerHTML = yearNav + `<div class="pd-semesters-grid">${btns}</div>`;
      } else if (s.type === 'year') {
        const curYear = new Date().getFullYear();
        const btns = Array.from({length:8}, (_,i) => curYear - 3 + i).map(y => {
          const active = y === s.year ? 'active' : '';
          return `<button class="pd-item-btn ${active}" data-action="selectYear" data-value="${y}">${y}</button>`;
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
      const start = this._el('range-start')?.value || '';
      const end = this._el('range-end')?.value || '';
      if (!start || !end) { alert('Veuillez saisir les deux dates.'); return; }
      if (start > end) { alert('La date de début doit être avant la date de fin.'); return; }
      const s = { ...this.get(), start, end };
      this.set(s);
      this._closeDropdown();
      this._updateLabel();
    },

    _updateLabel() {
      const btn = this._el('label-btn');
      if (btn) btn.textContent = this.getLabel() + ' ▾';
      this._refreshTrigger();
      this._updateAll();
    },

    _refreshTrigger() {
      const el = this._el('trigger-label');
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
      // posé.
      const extra = cs.boxSizing === 'border-box'
        ? parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)
        : 0;
      return Math.ceil(maxTextWidth + extra);
    },

    // Empêche à la fois le bouton du déclencheur compact ET le bouton du panneau déplié de changer
    // de largeur — que ce soit en naviguant avec les flèches voisines au sein d'un même type OU en
    // changeant de type : calcule la largeur du libellé le plus long parmi TOUTES les valeurs
    // possibles de TOUS les types à flèches réunis, et la fixe en min-width sur chacun des 2
    // boutons. Recalculé à chaque rafraîchissement plutôt que mis en cache : coût négligeable,
    // évite d'avoir à invalider un cache au changement de type/année.
    _syncTriggerWidth() {
      const triggerLabelEl = this._el('trigger-label');
      const panelLabelBtn = this._el('label-btn');
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
      this._el('panel')?.querySelectorAll('.period-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === s.type);
      });
      this._updateArrows();
    },

    _updateArrows() {
      const s = this.get();
      const prev = this._el('prev');
      const next = this._el('next');
      const triggerPrev = this._el('trigger-prev');
      const triggerNext = this._el('trigger-next');
      const hide = s.type === 'range' || !s.type;
      if (prev) prev.style.visibility = hide ? 'hidden' : '';
      if (next) next.style.visibility = hide ? 'hidden' : '';
      if (triggerPrev) triggerPrev.style.visibility = hide ? 'hidden' : '';
      if (triggerNext) triggerNext.style.visibility = hide ? 'hidden' : '';
    },
  };

  _allPickers.push(P);
  return P;
}

// Instance globale historique — mêmes ids qu'avant (idPrefix='period' → #period-trigger,
// #period-panel, #period-filter-container dans index.html...), donc 100% rétro-compatible avec le
// CSS et le reste de l'app (Flux, Budget) sans aucun changement ailleurs. Seule instance
// persistée (storageKey) et avec le toggle Date transaction/effective.
const PeriodFilter = createPeriodPicker('period', 'invest_period_filter', {
  showDateModeToggle: true,
  triggerLabel(self) {
    if (document.body.getAttribute('data-view') === 'comparisons') {
      return Storage.getDateMode() === 'effective' ? 'Date effective' : 'Date transaction';
    }
    return self.getLabel();
  },
});
