const PeriodFilter = {
  _STORAGE_KEY: 'invest_period_filter',
  _listeners: [],

  get() {
    const saved = Storage.get(this._STORAGE_KEY);
    if (saved) return saved;
    // Default: current month
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
        return {
          start: `${y}-${String(m).padStart(2, '0')}-01`,
          end: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
        };
      }
      case 'quarter': {
        const y = s.year;
        const q = s.quarter;
        const startM = (q - 1) * 3 + 1;
        const endM = q * 3;
        const lastDay = new Date(y, endM, 0).getDate();
        return {
          start: `${y}-${String(startM).padStart(2, '0')}-01`,
          end: `${y}-${String(endM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
        };
      }
      case 'semester': {
        const y = s.year;
        const sem = s.semester;
        const startM = sem === 1 ? 1 : 7;
        const endM = sem === 1 ? 6 : 12;
        const lastDay = new Date(y, endM, 0).getDate();
        return {
          start: `${y}-${String(startM).padStart(2, '0')}-01`,
          end: `${y}-${String(endM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
        };
      }
      case 'year': {
        const y = s.year;
        return { start: `${y}-01-01`, end: `${y}-12-31` };
      }
      case 'range': {
        return { start: s.start || '', end: s.end || '' };
      }
      default: {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth() + 1;
        const last = new Date(y, m, 0).getDate();
        return {
          start: `${y}-${String(m).padStart(2, '0')}-01`,
          end: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
        };
      }
    }
  },

  getLabel() {
    const s = this.get();
    const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    switch (s.type) {
      case 'month': {
        const [y, m] = s.month.split('-').map(Number);
        return `${MONTHS_FR[m - 1]} ${y}`;
      }
      case 'quarter':
        return `T${s.quarter} ${s.year}`;
      case 'semester':
        return `S${s.semester} ${s.year}`;
      case 'year':
        return `${s.year}`;
      case 'range': {
        const fmt = (d) => d ? new Intl.DateTimeFormat('fr-FR').format(new Date(d + 'T00:00:00')) : '?';
        return `${fmt(s.start)} → ${fmt(s.end)}`;
      }
      default:
        return '';
    }
  },

  onChange(cb) {
    this._listeners.push(cb);
  },

  _notify() {
    this._listeners.forEach(cb => { try { cb(); } catch(e) { console.error(e); } });
  },

  // Navigate to previous period
  _prev() {
    const s = { ...this.get() };
    switch (s.type) {
      case 'month': {
        const [y, m] = s.month.split('-').map(Number);
        const d = new Date(y, m - 2, 1);
        s.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        break;
      }
      case 'quarter': {
        s.quarter--;
        if (s.quarter < 1) { s.quarter = 4; s.year--; }
        break;
      }
      case 'semester': {
        s.semester--;
        if (s.semester < 1) { s.semester = 2; s.year--; }
        break;
      }
      case 'year':
        s.year--;
        break;
    }
    this.set(s);
  },

  // Navigate to next period
  _next() {
    const s = { ...this.get() };
    switch (s.type) {
      case 'month': {
        const [y, m] = s.month.split('-').map(Number);
        const d = new Date(y, m, 1);
        s.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        break;
      }
      case 'quarter': {
        s.quarter++;
        if (s.quarter > 4) { s.quarter = 1; s.year++; }
        break;
      }
      case 'semester': {
        s.semester++;
        if (s.semester > 2) { s.semester = 1; s.year++; }
        break;
      }
      case 'year':
        s.year++;
        break;
    }
    this.set(s);
  },

  renderUI() {
    const container = document.getElementById('period-filter-container');
    if (!container) return;
    container.innerHTML = this._buildHTML();
    this._bindEvents(container);
    this._updateUI(container);
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
          <button class="period-arrow" id="period-prev" title="Période précédente">&#8592;</button>
          <span class="period-label" id="period-label"></span>
          <button class="period-arrow" id="period-next" title="Période suivante">&#8594;</button>
        </div>
        <div class="period-range-inputs hidden" id="period-range-inputs">
          <input type="date" id="period-range-start" class="period-range-input" title="Début">
          <span class="period-range-sep">→</span>
          <input type="date" id="period-range-end" class="period-range-input" title="Fin">
        </div>
      </div>`;
  },

  _bindEvents(container) {
    // Type buttons
    container.querySelectorAll('.period-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = { ...this.get() };
        s.type = btn.dataset.type;
        // Sync year from current selection if needed
        if (s.type === 'quarter' || s.type === 'semester' || s.type === 'year') {
          if (!s.year) s.year = new Date().getFullYear();
        }
        this.set(s);
        this._updateUI(container);
      });
    });

    // Prev/next
    document.getElementById('period-prev').addEventListener('click', () => {
      this._prev();
      this._updateUI(container);
    });
    document.getElementById('period-next').addEventListener('click', () => {
      this._next();
      this._updateUI(container);
    });

    // Range inputs
    document.getElementById('period-range-start').addEventListener('change', (e) => {
      const s = { ...this.get() };
      s.start = e.target.value;
      this.set(s);
    });
    document.getElementById('period-range-end').addEventListener('change', (e) => {
      const s = { ...this.get() };
      s.end = e.target.value;
      this.set(s);
    });
  },

  _updateUI(container) {
    const s = this.get();
    // Highlight active type button
    container.querySelectorAll('.period-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === s.type);
    });
    // Update label
    const labelEl = document.getElementById('period-label');
    if (labelEl) labelEl.textContent = this.getLabel();
    // Show/hide nav vs range
    const navRow = document.getElementById('period-nav-row');
    const rangeInputs = document.getElementById('period-range-inputs');
    if (s.type === 'range') {
      if (navRow) navRow.classList.add('hidden');
      if (rangeInputs) {
        rangeInputs.classList.remove('hidden');
        const startEl = document.getElementById('period-range-start');
        const endEl = document.getElementById('period-range-end');
        if (startEl) startEl.value = s.start || '';
        if (endEl) endEl.value = s.end || '';
      }
    } else {
      if (navRow) navRow.classList.remove('hidden');
      if (rangeInputs) rangeInputs.classList.add('hidden');
    }
  },
};
