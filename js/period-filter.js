const PeriodFilter = {
  _STORAGE_KEY: 'invest_period_filter',
  _listeners: [],
  _dropdownYear: null,
  _dropdownOpen: false,

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
      default: return '';
    }
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
  },

  _buildHTML() {
    return `
      <div class="period-filter">
        <span class="period-filter-label">Période :</span>
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
      </div>`;
  },

  _bindEvents() {
    document.querySelectorAll('.period-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = { ...this.get() };
        const now = new Date();
        if (s.type === btn.dataset.type) {
          // Déjà actif → reset au mois courant
          s.type = 'month';
          s.year = now.getFullYear();
          s.month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        } else {
          s.type = btn.dataset.type;
          if (!s.year) s.year = now.getFullYear();
        }
        this.set(s);
        this._closeDropdown();
        this._updateLabel();
      });
    });

    document.getElementById('period-prev').addEventListener('click', () => { this._prev(); this._closeDropdown(); });
    document.getElementById('period-next').addEventListener('click', () => { this._next(); this._closeDropdown(); });

    document.getElementById('period-label-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this._dropdownOpen ? this._closeDropdown() : this._openDropdown();
    });

    document.addEventListener('click', () => this._closeDropdown());
    document.getElementById('period-dropdown').addEventListener('click', e => e.stopPropagation());

    // Hide arrows in range mode
    this._updateArrows();
  },

  _openDropdown() {
    const s = this.get();
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
    this._updateAll();
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
    const nav = document.getElementById('period-nav-row');
    if (!nav) return;
    const prev = document.getElementById('period-prev');
    const next = document.getElementById('period-next');
    const hide = s.type === 'range';
    if (prev) prev.style.visibility = hide ? 'hidden' : '';
    if (next) next.style.visibility = hide ? 'hidden' : '';
  },
};
