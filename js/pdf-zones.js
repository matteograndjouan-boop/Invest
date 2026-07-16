// Module d'extraction PDF assistée par encadrement de zones (100 % local).
//
// Principe : l'utilisateur trace/ajuste des cadres sur la page du relevé pour
// délimiter les colonnes (Date, Montant, Libellé...) et le corps du tableau
// (hors en-tête/pied de page). L'extraction du texte se fait ensuite
// entièrement en local via pdf.js. Seul le libellé nettoyé (nom du commerçant)
// est ensuite transmis à Gemini pour la catégorisation — jamais les montants,
// dates ni aucune autre donnée du relevé.
const PdfZones = {
  _TPL_KEY: 'invest_pdf_zone_templates',
  _ROW_TOL: 0.0095, // tolérance de regroupement par ligne (fraction de la hauteur de page)

  // ── ENTRÉE PRINCIPALE ─────────────────────────────────────────────────────

  async start(file) {
    try {
      if (typeof pdfjsLib === 'undefined') { alert('pdf.js non disponible.'); return; }
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

      Modal.open('Lecture du PDF…', `
        <div style="text-align:center;padding:52px 20px">
          <div style="font-size:52px;margin-bottom:20px">\u{1F4C4}</div>
          <p style="font-size:15px;font-weight:700">Chargement du relevé…</p>
          <p style="color:var(--text-muted);font-size:13px">Traitement 100 % local — rien n'est envoyé sur internet.</p>
        </div>
      `);

      const buffer = await file.arrayBuffer();
      const pdf    = await pdfjsLib.getDocument({ data: buffer }).promise;
      const page1  = await pdf.getPage(1);
      const vp1    = page1.getViewport({ scale: 1 });
      const content1 = await page1.getTextContent();
      const items1 = content1.items.filter(it => it.str && it.str.trim());

      if (!items1.length) {
        Modal.close();
        alert('📄 Ce PDF semble être un scan (image) sans texte extractible.\n\n' +
          'L\'extraction par cadrage nécessite un PDF « texte » (export natif de votre banque). ' +
          'L\'OCR n\'est pas pris en charge pour le moment — essayez plutôt un export CSV/Excel si votre banque le propose.');
        return;
      }

      const fracItems1  = items1.map(it => ({ ...this._itemFrac(vp1, it), str: it.str }));
      const headerLines = this._firstLines(fracItems1, 6);
      const sig = this._signature(headerLines, vp1);
      const tpl = this._getTemplates()[sig];

      this._state = { file, pdf, sig, recognized: !!tpl, pageNum: 1, mode: null, zonesByPage: {} };
      await this._buildAllZones(tpl, fracItems1);
      Modal.close();
      await this._renderEditor();
    } catch (err) {
      console.error(err);
      Modal.close();
      alert('Erreur lors de la lecture du PDF : ' + err.message);
    }
  },

  // ── GÉOMÉTRIE / CONVERSION DE COORDONNÉES ───────────────────────────────

  // Convertit un point en espace PDF vers une fraction (0–1) de la page,
  // indépendamment du zoom d'affichage — utilisé pour stocker des zones
  // réutilisables quel que soit le rendu (et sur toutes les pages du document).
  _fracXY(viewport, x, y) {
    const [cx, cy] = viewport.convertToViewportPoint(x, y);
    return { fx: cx / viewport.width, fy: cy / viewport.height };
  },

  // Position fractionnelle d'un élément de texte pdf.js (centre horizontal).
  _itemFrac(viewport, item) {
    const x0 = item.transform[4], y0 = item.transform[5];
    const x1 = x0 + (item.width || 0);
    const p0 = viewport.convertToViewportPoint(x0, y0);
    const p1 = viewport.convertToViewportPoint(x1, y0);
    return { fx: ((p0[0] + p1[0]) / 2) / viewport.width, fy: p0[1] / viewport.height };
  },

  _firstLines(fracItems, n) {
    const byRow = new Map();
    for (const it of fracItems) {
      const key = Math.round(it.fy / this._ROW_TOL);
      if (!byRow.has(key)) byRow.set(key, []);
      byRow.get(key).push(it);
    }
    const keys = [...byRow.keys()].sort((a, b) => a - b).slice(0, n);
    return keys.map(k => byRow.get(k).sort((a, b) => a.fx - b.fx).map(i => i.str).join(' '));
  },

  // ── DÉTECTION AUTOMATIQUE (pré-remplissage des cadres) ──────────────────

  _defaultZones() {
    return {
      top: 0.12, bottom: 0.92,
      date: { x0: 0.04, x1: 0.18 }, date2: null, date2Enabled: false, dateChoice: 'date',
      amountMode: 'single', amount: { x0: 0.72, x1: 0.92 }, debit: null, credit: null,
      libelle: { x0: 0.20, x1: 0.70 },
    };
  },

  _clusterX(xs, gapThresh) {
    if (!xs.length) return [];
    const clusters = [[xs[0]]];
    for (let i = 1; i < xs.length; i++) {
      if (xs[i] - xs[i - 1] > gapThresh) clusters.push([]);
      clusters[clusters.length - 1].push(xs[i]);
    }
    return clusters;
  },

  _padBand(xs, pad = 0.015) {
    if (!xs || !xs.length) return { x0: 0.7, x1: 0.9 };
    return { x0: Math.max(0, Math.min(...xs) - pad), x1: Math.min(1, Math.max(...xs) + pad) };
  },

  // Repère les lignes "transaction" (date + montant) sur la page 1 pour en
  // déduire la position des colonnes — l'utilisateur n'a plus qu'à ajuster.
  _autoDetect(fracItems) {
    const dateRe = /^\d{1,2}[\/\.\-]\d{1,2}(?:[\/\.\-]\d{2,4})?$/;
    const amtRe  = /^-?\d{1,3}(?:[\s ]\d{3})*,\d{2}-?$/;

    const byRow = new Map();
    for (const it of fracItems) {
      const key = Math.round(it.fy / this._ROW_TOL);
      if (!byRow.has(key)) byRow.set(key, []);
      byRow.get(key).push(it);
    }
    const txnRows = [];
    for (const rowItems of byRow.values()) {
      const dates = rowItems.filter(i => dateRe.test(i.str.trim()));
      const amts  = rowItems.filter(i => amtRe.test(i.str.trim()));
      if (dates.length && amts.length) txnRows.push({ dates, amts, fy: rowItems[0].fy });
    }
    if (txnRows.length < 2) return null;

    const fys    = txnRows.map(r => r.fy);
    const top    = Math.max(0, Math.min(...fys) - 0.02);
    const bottom = Math.min(1, Math.max(...fys) + 0.02);

    const dateXs = txnRows.flatMap(r => r.dates.map(d => d.fx)).sort((a, b) => a - b);
    const dateClusters = this._clusterX(dateXs, 0.05);
    const dateBand  = this._padBand(dateClusters[0]);
    const date2Band = dateClusters.length > 1 ? this._padBand(dateClusters[1]) : null;

    const amtXs = txnRows.flatMap(r => r.amts.map(a => a.fx)).sort((a, b) => a - b);
    const amtClusters = this._clusterX(amtXs, 0.04);
    const amountMode = amtClusters.length >= 2 ? 'split' : 'single';
    let amountBand = null, debitBand = null, creditBand = null;
    if (amountMode === 'split') {
      debitBand  = this._padBand(amtClusters[0]);
      creditBand = this._padBand(amtClusters[amtClusters.length - 1]);
    } else {
      amountBand = this._padBand(amtClusters[0] || amtXs);
    }

    const dateEnd  = date2Band ? Math.max(dateBand.x1, date2Band.x1) : dateBand.x1;
    const amtStart = amountMode === 'split' ? debitBand.x0 : amountBand.x0;
    const libelleBand = {
      x0: Math.min(dateEnd + 0.01, amtStart - 0.01),
      x1: Math.max(amtStart - 0.01, dateEnd + 0.01),
    };

    return {
      top, bottom,
      date: dateBand, date2: date2Band, date2Enabled: !!date2Band, dateChoice: 'date',
      amountMode, amount: amountBand, debit: debitBand, credit: creditBand,
      libelle: libelleBand,
    };
  },

  // ── ZONES PAR PAGE ───────────────────────────────────────────────────────

  _curZones() { return this._state.zonesByPage[this._state.pageNum]; },

  async _pageFracItems(pageNum) {
    const page     = await this._state.pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const content  = await page.getTextContent();
    return content.items
      .filter(it => it.str && it.str.trim())
      .map(it => ({ ...this._itemFrac(viewport, it), str: it.str }));
  },

  // Construit une géométrie de cadres propre à CHAQUE page : sur un relevé, le
  // tableau n'est pas au même endroit selon les pages (en-tête volumineux en
  // page 1, etc.). Les options sémantiques (montant unique/split, 2ᵉ date, date
  // retenue) restent GLOBALES et cohérentes sur tout le document — sinon
  // l'extraction mélangerait des conventions différentes d'une page à l'autre.
  async _buildAllZones(tpl, fracItems1) {
    const { pdf } = this._state;
    const tplPage1 = tpl ? (tpl.page1 || tpl) : null; // compat gabarits legacy (objet unique)
    const tplRest  = tpl ? (tpl.rest  || null) : null;

    const z1 = tplPage1
      ? JSON.parse(JSON.stringify(tplPage1))
      : (this._autoDetect(fracItems1) || this._defaultZones());

    // Le mode global est défini par la page 1, puis imposé aux autres pages.
    this._state.mode = {
      amountMode:   z1.amountMode || 'single',
      date2Enabled: !!z1.date2Enabled,
      dateChoice:   z1.dateChoice || 'date',
    };
    this._coerceMode(z1, this._state.mode);
    this._state.zonesByPage[1] = z1;

    for (let p = 2; p <= pdf.numPages; p++) {
      let zp;
      if (tplRest) {
        zp = JSON.parse(JSON.stringify(tplRest));
      } else {
        const frac = await this._pageFracItems(p);
        zp = this._autoDetect(frac) || JSON.parse(JSON.stringify(z1));
      }
      this._coerceMode(zp, this._state.mode);
      this._state.zonesByPage[p] = zp;
    }
  },

  // Aligne les drapeaux de mode d'une page sur le mode global et garantit que
  // les bandes nécessaires existent : une page mal détectée pourrait n'avoir ni
  // Débit/Crédit ni Date 2 alors que le mode global les requiert.
  _coerceMode(z, mode) {
    z.amountMode   = mode.amountMode;
    z.date2Enabled = mode.date2Enabled;
    z.dateChoice   = mode.dateChoice;

    if (mode.amountMode === 'split') {
      if (!z.debit || !z.credit) {
        const base = z.amount || { x0: 0.70, x1: 0.92 };
        const mid  = (base.x0 + base.x1) / 2;
        z.debit  = z.debit  || { x0: base.x0, x1: mid };
        z.credit = z.credit || { x0: mid,    x1: base.x1 };
      }
    } else if (!z.amount) {
      z.amount = { x0: z.debit ? z.debit.x0 : 0.72, x1: z.credit ? z.credit.x1 : 0.92 };
    }

    if (mode.date2Enabled && !z.date2) {
      z.date2 = { x0: Math.min(0.95, z.date.x1 + 0.02), x1: Math.min(1, z.date.x1 + 0.14) };
    }
  },

  // ── GABARIT PAR BANQUE (mémorisation locale) ────────────────────────────

  _getTemplates() {
    try { return JSON.parse(localStorage.getItem(this._TPL_KEY) || '{}'); } catch { return {}; }
  },
  _saveTemplate(sig, zones) {
    const all = this._getTemplates();
    all[sig] = zones;
    try { localStorage.setItem(this._TPL_KEY, JSON.stringify(all)); } catch (e) {}
  },
  // Signature = dimensions de page + texte d'en-tête normalisé (chiffres neutralisés
  // pour que deux relevés de la même banque à des dates différentes matchent).
  _signature(headerLines, viewport) {
    const norm = headerLines.join(' ').toLowerCase()
      .replace(/[0-9]/g, '#').replace(/\s+/g, ' ').trim().slice(0, 200);
    return `${Math.round(viewport.width)}x${Math.round(viewport.height)}|${norm}`;
  },

  // ── INTERFACE D'ENCADREMENT ──────────────────────────────────────────────

  async _renderEditor() {
    const { pdf, pageNum, recognized } = this._state;
    const page    = await pdf.getPage(pageNum);
    const vpBase  = page.getViewport({ scale: 1 });
    const containerW = Math.min(760, Math.max(320, window.innerWidth - 80));
    const scale   = containerW / vpBase.width;
    const viewport = page.getViewport({ scale });

    const aiFallbackAvailable = BankImport._getPdfAiEnabled() && !!GeminiCat.getApiKey();

    document.getElementById('modal')?.classList.add('modal-wide');
    Modal.open('Encadrement du relevé PDF', this._editorHTML(pdf.numPages, recognized, aiFallbackAvailable));

    const canvas = document.getElementById('pdfz-canvas');
    canvas.width  = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    const stage = document.getElementById('pdfz-stage');
    stage.style.width  = canvas.width + 'px';
    stage.style.height = canvas.height + 'px';

    document.getElementById('pdfz-pagenum').textContent = String(pageNum);
    this._refreshOverlay();
    this._attachDrag();
    this._attachControls();
  },

  _editorHTML(numPages, recognized, aiFallbackAvailable) {
    return `
      <div class="pdfz-wrap">
        <div class="pdfz-toolbar">
          <span class="pdfz-badge ${recognized ? 'pdfz-badge-ok' : 'pdfz-badge-new'}">
            ${recognized ? '✓ Format reconnu — zones appliquées' : 'Nouveau format — ajustez les cadres si besoin'}
          </span>
          ${numPages > 1 ? `
            <span class="pdfz-pageinfo">Page <span id="pdfz-pagenum">1</span>/${numPages}</span>
            <button type="button" class="btn-sm" id="pdfz-prev">‹ Page préc.</button>
            <button type="button" class="btn-sm" id="pdfz-next">Page suiv. ›</button>
          ` : `<span class="pdfz-pageinfo">Page <span id="pdfz-pagenum">1</span>/1</span>`}
        </div>

        <p class="pdfz-hint">
          Ajustez les cadres : <b style="color:#2563eb">Date</b>, <b style="color:#16a34a">Montant</b> /
          <b style="color:#dc2626">Débit</b> / <b style="color:#16a34a">Crédit</b>, le reste (catch-all) part dans
          <b style="color:#ea580c">Libellé</b>. Les lignes grisées délimitent le corps du tableau (en-tête et pied
          de page exclus, donc jamais extraits).
        </p>

        <div class="pdfz-options">
          <label class="mapping-radio-lbl">
            <input type="checkbox" id="pdfz-date2-toggle"> 2ᵉ colonne date (opération / valeur)
          </label>
          <span id="pdfz-date2-which" style="display:none">
            Utiliser :
            <label class="mapping-radio-lbl"><input type="radio" name="pdfz-which-date" value="1" checked> Date 1</label>
            <label class="mapping-radio-lbl"><input type="radio" name="pdfz-which-date" value="2"> Date 2</label>
          </span>
        </div>
        <div class="mapping-amount-type">
          <label class="mapping-radio-lbl"><input type="radio" name="pdfz-amt-mode" value="single" checked> Colonne unique (+/−)</label>
          <label class="mapping-radio-lbl"><input type="radio" name="pdfz-amt-mode" value="split"> Débit / Crédit séparés</label>
        </div>

        <div class="pdfz-stage-scroll">
          <div class="pdfz-stage" id="pdfz-stage">
            <canvas id="pdfz-canvas"></canvas>
            <div class="pdfz-overlay" id="pdfz-overlay"></div>
          </div>
        </div>

        <div class="form-actions" style="margin-top:14px">
          <button class="btn-secondary" onclick="PdfZones.cancel()">Annuler</button>
          ${aiFallbackAvailable ? `<button type="button" class="btn-sm" style="margin-right:auto;color:var(--text-muted);background:transparent;border:1px solid var(--border);padding:6px 12px;border-radius:6px;cursor:pointer" onclick="PdfZones.useAiFallback()">PDF trop complexe ? IA en dernier recours →</button>` : ''}
          <button class="btn-primary" onclick="PdfZones.confirm()">Valider l'encadrement →</button>
        </div>
      </div>
    `;
  },

  _overlayHTML(zones) {
    const pct = v => (Math.max(0, Math.min(1, v)) * 100).toFixed(2) + '%';
    const bandDiv = (col, label, cls) => zones[col] ? `
      <div class="pdfz-band pdfz-band-${cls}" style="left:${pct(zones[col].x0)};width:${pct(Math.max(0, zones[col].x1 - zones[col].x0))}" data-drag="${col}-move">
        <span class="pdfz-band-label">${label}</span>
        <div class="pdfz-handle pdfz-handle-l" data-drag="${col}-l"></div>
        <div class="pdfz-handle pdfz-handle-r" data-drag="${col}-r"></div>
      </div>` : '';

    let html = '';
    html += `<div class="pdfz-shade" style="top:0;height:${pct(zones.top)}"></div>`;
    html += `<div class="pdfz-shade" style="top:${pct(zones.bottom)};height:${pct(1 - zones.bottom)}"></div>`;
    html += `<div class="pdfz-line" style="top:${pct(zones.top)}" data-drag="top"><span class="pdfz-line-label">Haut du tableau</span></div>`;
    html += `<div class="pdfz-line" style="top:${pct(zones.bottom)}" data-drag="bottom"><span class="pdfz-line-label">Bas du tableau</span></div>`;
    html += bandDiv('date', 'Date', 'date');
    if (zones.date2Enabled) html += bandDiv('date2', 'Date 2', 'date2');
    if (zones.amountMode === 'single') html += bandDiv('amount', 'Montant', 'amount');
    else { html += bandDiv('debit', 'Débit', 'debit'); html += bandDiv('credit', 'Crédit', 'credit'); }
    html += bandDiv('libelle', 'Libellé', 'libelle');
    return html;
  },

  _refreshOverlay() {
    const el = document.getElementById('pdfz-overlay');
    if (el) el.innerHTML = this._overlayHTML(this._curZones());
  },

  // ── INTERACTIONS (souris + tactile via Pointer Events) ──────────────────

  _attachDrag() {
    const stage = document.getElementById('pdfz-stage');
    if (!stage || stage._pdfzBound) return;
    stage._pdfzBound = true;

    stage.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('[data-drag]');
      if (!handle) return;
      e.preventDefault();
      const kind = handle.dataset.drag;
      const startRect  = stage.getBoundingClientRect();
      const startZones = JSON.parse(JSON.stringify(this._curZones()));
      const startX = e.clientX, startY = e.clientY;
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}

      const onMove = (ev) => {
        const dxF = (ev.clientX - startX) / startRect.width;
        const dyF = (ev.clientY - startY) / startRect.height;
        this._applyDrag(kind, startZones, dxF, dyF);
        this._refreshOverlay();
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  },

  _applyDrag(kind, startZones, dxF, dyF) {
    const z = this._curZones();
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    if (kind === 'top')    { z.top    = clamp(startZones.top    + dyF, 0, startZones.bottom - 0.02); return; }
    if (kind === 'bottom') { z.bottom = clamp(startZones.bottom + dyF, startZones.top + 0.02, 1);    return; }
    const m = /^(date2?|amount|debit|credit|libelle)-(l|r|move)$/.exec(kind);
    if (!m) return;
    const [, col, mode] = m;
    const band = startZones[col];
    if (!band) return;
    if (mode === 'l')      z[col].x0 = clamp(band.x0 + dxF, 0, band.x1 - 0.01);
    else if (mode === 'r') z[col].x1 = clamp(band.x1 + dxF, band.x0 + 0.01, 1);
    else {
      const w = band.x1 - band.x0;
      const nx0 = clamp(band.x0 + dxF, 0, 1 - w);
      z[col].x0 = nx0; z[col].x1 = nx0 + w;
    }
  },

  _attachControls() {
    const mode = this._state.mode;
    // Un changement de mode est global : on le réimpose à toutes les pages
    // (création des bandes manquantes), puis on rafraîchit la page courante.
    const applyMode = () => {
      Object.values(this._state.zonesByPage).forEach(z => this._coerceMode(z, mode));
      this._refreshOverlay();
    };

    const date2Toggle = document.getElementById('pdfz-date2-toggle');
    if (date2Toggle) {
      date2Toggle.checked = mode.date2Enabled;
      document.getElementById('pdfz-date2-which').style.display = mode.date2Enabled ? '' : 'none';
      date2Toggle.addEventListener('change', e => {
        mode.date2Enabled = e.target.checked;
        document.getElementById('pdfz-date2-which').style.display = mode.date2Enabled ? '' : 'none';
        applyMode();
      });
    }
    document.querySelectorAll('input[name="pdfz-which-date"]').forEach(r => {
      r.checked = (r.value === '2') === (mode.dateChoice === 'date2');
      r.addEventListener('change', e => {
        if (!e.target.checked) return;
        mode.dateChoice = e.target.value === '2' ? 'date2' : 'date';
      });
    });
    document.querySelectorAll('input[name="pdfz-amt-mode"]').forEach(r => {
      r.checked = r.value === mode.amountMode;
      r.addEventListener('change', e => {
        if (!e.target.checked) return;
        mode.amountMode = e.target.value;
        applyMode();
      });
    });

    if (this._state.pdf.numPages > 1) {
      document.getElementById('pdfz-prev')?.addEventListener('click', () => this._gotoPage(-1));
      document.getElementById('pdfz-next')?.addEventListener('click', () => this._gotoPage(1));
    }
  },

  _gotoPage(delta) {
    const n = Math.max(1, Math.min(this._state.pdf.numPages, this._state.pageNum + delta));
    if (n === this._state.pageNum) return;
    this._state.pageNum = n;
    this._renderEditor();
  },

  // ── EXTRACTION LOCALE (toutes les pages, mêmes zones) ───────────────────

  _assignCol(fx, zones) {
    const within = z => z && fx >= z.x0 && fx <= z.x1;
    if (within(zones.date)) return 'date';
    if (zones.date2Enabled && within(zones.date2)) return 'date2';
    if (zones.amountMode === 'single' && within(zones.amount)) return 'amount';
    if (zones.amountMode === 'split' && within(zones.debit)) return 'debit';
    if (zones.amountMode === 'split' && within(zones.credit)) return 'credit';
    return 'libelle'; // catch-all : tout texte non assigné devient libellé
  },

  async _extract() {
    const { pdf, zonesByPage, mode } = this._state;
    const allRows = [];
    let sawAnyText = false;

    for (let p = 1; p <= pdf.numPages; p++) {
      const zones    = zonesByPage[p];
      const page     = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content  = await page.getTextContent();
      const items    = content.items.filter(it => it.str && it.str.trim());
      if (items.length) sawAnyText = true;

      const byRow = new Map();
      for (const it of items) {
        const { fx, fy } = this._itemFrac(viewport, it);
        if (fy < zones.top - 0.002 || fy > zones.bottom + 0.002) continue;
        const key = Math.round(fy / this._ROW_TOL);
        if (!byRow.has(key)) byRow.set(key, []);
        byRow.get(key).push({ fx, str: it.str });
      }

      [...byRow.keys()].sort((a, b) => a - b).forEach(key => {
        const cols = { date: [], date2: [], amount: [], debit: [], credit: [], libelle: [] };
        byRow.get(key).sort((a, b) => a.fx - b.fx).forEach(w => {
          cols[this._assignCol(w.fx, zones)].push(w.str);
        });
        allRows.push({
          date:    cols.date.join(' ').trim(),
          date2:   cols.date2.join(' ').trim(),
          amount:  cols.amount.join(' ').trim(),
          debit:   cols.debit.join(' ').trim(),
          credit:  cols.credit.join(' ').trim(),
          libelle: cols.libelle.join(' ').trim(),
        });
      });
    }

    if (!sawAnyText) return { scanned: true, transactions: [] };

    // Une ligne avec une date ouvre une transaction ; les lignes suivantes sans
    // date (ni date2) sont rattachées au libellé de la transaction en cours.
    const blocks = [];
    let cur = null;
    for (const row of allRows) {
      const hasDate = !!(row.date || row.date2);
      if (hasDate) {
        if (cur) blocks.push(cur);
        const rawDate = (mode.date2Enabled && mode.dateChoice === 'date2')
          ? (row.date2 || row.date) : (row.date || row.date2);
        cur = { rawDate, amount: row.amount, debit: row.debit, credit: row.credit, libelle: [row.libelle] };
      } else if (cur) {
        if (row.libelle) cur.libelle.push(row.libelle);
        if (!cur.amount && row.amount) cur.amount = row.amount;
        if (!cur.debit  && row.debit)  cur.debit  = row.debit;
        if (!cur.credit && row.credit) cur.credit = row.credit;
      }
    }
    if (cur) blocks.push(cur);

    const allCats = Storage.getCategories();
    const transactions = [];
    for (const b of blocks) {
      const dateStr = BankImport._parseDate((b.rawDate || '').trim());
      if (!dateStr) continue;

      let amount = null, isRevenue = false;
      if (mode.amountMode === 'single') {
        const a = BankImport._parseAmount(b.amount);
        if (a === null || a === 0) continue;
        amount = Math.abs(a); isRevenue = a > 0;
      } else {
        const d = BankImport._parseAmount(b.debit);
        const c = BankImport._parseAmount(b.credit);
        if (d && Math.abs(d) > 0)      { amount = Math.abs(d); isRevenue = false; }
        else if (c && Math.abs(c) > 0) { amount = Math.abs(c); isRevenue = true; }
        else continue;
      }

      // Libellé brut : la réduction au commerçant (étape 2) est faite ensuite dans
      // BankImport.finishPdfExtraction (après extraction, avant catégorisation).
      // On conserve même les libellés pauvres : ils seront marqués « à catégoriser ».
      const rawLabel = b.libelle.join(' ').replace(/\s+/g, ' ').trim();

      const guess = isRevenue
        ? { category: BankImport._revenueCat(allCats).name, subcategory: BankImport._defaultRevenueCat(allCats) }
        : BankImport._smartGuess(rawLabel, allCats);
      transactions.push({ date: dateStr, description: rawLabel, amount, isRevenue,
        category: guess.category, subcategory: guess.subcategory });
    }

    return { scanned: false, transactions };
  },

  // ── ACTIONS ───────────────────────────────────────────────────────────────

  async confirm() {
    const { sig, zonesByPage } = this._state;
    Modal.open('Extraction…', `
      <div style="text-align:center;padding:52px 20px">
        <div style="font-size:52px;margin-bottom:20px">\u{1F4C4}</div>
        <p style="font-size:15px;font-weight:700">Extraction locale en cours…</p>
      </div>
    `);
    try {
      const { scanned, transactions } = await this._extract();
      if (scanned) {
        Modal.close();
        alert('📄 Ce PDF semble être un scan sans texte extractible — l\'OCR n\'est pas pris en charge pour le moment.');
        return;
      }
      if (!transactions.length) {
        alert('Aucune transaction détectée avec cet encadrement.\nAjustez les cadres (notamment Haut/Bas du tableau et Montant) et réessayez.');
        await this._renderEditor();
        return;
      }
      // Gabarit : page 1 (souvent spécifique) + un représentant des pages
      // suivantes (mise en page uniforme) — robuste à un nombre de pages variable.
      this._saveTemplate(sig, { page1: zonesByPage[1], rest: zonesByPage[2] || zonesByPage[1] });
      this._state = null;
      await BankImport.finishPdfExtraction(transactions);
    } catch (err) {
      console.error(err);
      Modal.close();
      alert('Erreur lors de l\'extraction : ' + err.message);
    }
  },

  cancel() {
    this._state = null;
    document.getElementById('modal')?.classList.remove('modal-wide');
    Modal.close();
  },

  // Dernier recours, opt-in : envoie le texte complet du relevé à Gemini.
  async useAiFallback() {
    const file = this._state?.file;
    this._state = null;
    if (!file) return;
    const go = confirm(
      '⚠️ Envoyer le contenu complet du relevé (montants, dates, données personnelles) à Gemini ?\n\n' +
      'Confirmez seulement si vous acceptez l\'envoi de vos données financières.'
    );
    if (!go) return;
    Modal.open('Extraction IA…', `<div style="text-align:center;padding:40px"><p>Lecture du PDF…</p></div>`);
    try {
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      let fullText = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        const page    = await pdf.getPage(p);
        const content = await page.getTextContent();
        fullText += content.items.map(i => i.str).join(' ') + '\n';
      }
      await BankImport._parsePDFWithAI(fullText);
    } catch (err) {
      console.error(err);
      Modal.close();
      alert('Erreur : ' + err.message);
    }
  },
};
