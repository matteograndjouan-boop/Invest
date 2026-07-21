const InvestImport = {
  init() {
    document.getElementById('invest-import-file')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.handleFile(file);
      e.target.value = '';
    });
    document.getElementById('invest-import-btn')?.addEventListener('click', () => {
      document.getElementById('invest-import-file')?.click();
    });
  },

  // Find the actual header row — brokers often add title/metadata rows before the real columns
  _findHeaderRow(rows) {
    // Score each row: strings = good, numbers = bad (headers are text, data has numbers)
    let bestIdx = 0, bestScore = -Infinity;
    for (let i = 0; i < Math.min(12, rows.length); i++) {
      const row = rows[i];
      const nonEmpty = row.filter(c => c !== '' && c !== null && c !== undefined);
      if (nonEmpty.length < 2) continue;
      const strings = nonEmpty.filter(c => typeof c === 'string').length;
      const nums    = nonEmpty.filter(c => typeof c === 'number').length;
      const score   = strings * 2 - nums * 4;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    return bestIdx;
  },

  async handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      alert('Format non supporté. Utilisez un fichier CSV ou Excel (.xlsx / .xls).');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array', codepage: 1252 });
        const ws = wb.Sheets[wb.SheetNames[0]];
        let rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        rows = rows.filter(r => r.some(c => c !== '' && c !== null && c !== undefined));

        if (rows.length < 2) { alert('Fichier vide ou aucune donnée détectée.'); return; }

        // Auto-detect the real header row (skips title/metadata rows at the top)
        const headerRowIdx = this._findHeaderRow(rows);
        const headerRow    = rows[headerRowIdx];
        const dataRows     = rows.slice(headerRowIdx + 1);

        if (!dataRows.length) {
          alert('Aucune ligne de données trouvée sous les en-têtes.');
          return;
        }

        document.getElementById('modal')?.classList.add('modal-wide');
        Modal.open('Analyse du portefeuille…', `
          <div style="text-align:center;padding:52px 20px">
            <div style="font-size:52px;margin-bottom:20px">📊</div>
            <p style="font-size:15px;font-weight:700;margin-bottom:8px">Analyse en cours…</p>
            <p style="color:var(--text-muted);font-size:13px">Détection automatique des colonnes</p>
          </div>
        `);

        const mapping = this._guessMapping(headerRow);

        console.log('[InvestImport] header row', headerRowIdx, headerRow);
        console.log('[InvestImport] mapping', mapping);

        const positions = this._parseWithMapping(dataRows, mapping);

        if (!positions.length) {
          document.getElementById('modal')?.classList.remove('modal-wide');
          Modal.close();
          alert(
            'Aucune position valide détectée.\n\n' +
            'En-têtes trouvés (ligne ' + (headerRowIdx + 1) + ') :\n' +
            headerRow.filter(Boolean).join(', ')
          );
          return;
        }

        this._showPreview(positions);

      } catch (err) {
        console.error(err);
        document.getElementById('modal')?.classList.remove('modal-wide');
        Modal.close();
        alert('Erreur lors de la lecture : ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  },

  _guessMapping(headerRow) {
    const n = s => String(s).toLowerCase()
      .replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[îï]/g, 'i')
      .replace(/[ôö]/g, 'o').replace(/[ùûü]/g, 'u').replace(/ç/g, 'c')
      .trim();
    const h = headerRow.map(n);
    const find = (...terms) => { const i = h.findIndex(c => terms.some(t => c.includes(t))); return i >= 0 ? i : null; };

    // 'placement' volontairement absent — c'est le libellé de l'enveloppe (PEA, AV...) pas le nom du fonds
    // 'nom du' matche "Nom du support" (Linxea) sans matcher "Placement"
    // 'support' matche "Nom du support" sans matcher d'autres colonnes Linxea
    const nameIdx = find('nom du', 'libelle', 'designation', 'valeur mobiliere', 'support', 'actif', 'intitule', 'titre');
    const isinIdx = find('isin', 'code isin', 'code valeur', 'code titre');
    // 'nbre de parts' en premier pour matcher Linxea ("Nbre de parts")
    const qtyIdx  = find('nbre de parts', 'nombre de parts', 'nombre parts', 'nb parts', 'nb titres', 'quantite', 'parts', 'qte');
    const buyIdx  = find('pru', 'prix de revient', 'px revient', 'prix achat', 'cout unitaire', 'valeur achat', 'prix moyen');
    // 'cotation' en premier pour matcher "Dernière cotation" (Linxea)
    const curIdx  = find('cotation', 'valeur liquidative', 'cours actuel', 'dernier cours', 'cours', 'vl ', 'prix actuel');
    // 'somme en compte' + 'somme' pour Linxea ; 'montant'/'valorisation' pour Boursorama
    const totIdx  = find('somme en compte', 'valorisation', 'montant', 'valeur portefeuille', 'valeur totale', 'encours', 'epargne acquise', 'somme', 'capital');

    return {
      name:          nameIdx,   // null = on cherchera la 1ère cellule texte dans _parseWithMapping
      isin:          isinIdx,
      quantity:      qtyIdx,
      buyPrice:      buyIdx,
      currentPrice:  curIdx,
      totalValue:    totIdx,
      currentIsTotal: curIdx === null && totIdx !== null,
    };
  },

  _parseNum(val) {
    if (val === '' || val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    const s = String(val).trim()
      .replace(/[ \s]/g, '')  // remove non-breaking & regular spaces
      .replace('%', '')
      .replace(/^[+]/, '');
    // French number format: 1.234,56 → 1234.56
    const cleaned = s.replace(/\.(?=\d{3}(?:[,]|$))/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  },

  _guessType(name, isin) {
    const nm = (name || '').toLowerCase()
      .replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[îï]/g, 'i')
      .replace(/[ôö]/g, 'o').replace(/[ùûü]/g, 'u').replace(/ç/g, 'c');
    const is = (isin || '').toUpperCase();
    if (/etf|tracker|world|msci|index|s&p|cac 40|stoxx|nasdaq|bloomberg/.test(nm)) return 'etf';
    if (/scpi|immob|pierre|foncier/.test(nm)) return 'immobilier';
    if (/bitcoin|ethereum|crypto/.test(nm)) return 'crypto';
    if (/obligation|bond|monetaire|tresor|corporate/.test(nm)) return 'obligations';
    if (/fonds euro|fond euro|fonds en euro|capital garanti|actif general/.test(nm)) return 'autre';
    if (/^IE|^LU/.test(is)) return 'etf';
    if (/^FR|^US|^DE|^GB|^NL/.test(is)) return 'action';
    return 'autre';
  },

  _parseWithMapping(dataRows, mapping) {
    const positions = [];
    const existing  = Storage.getInvestments();

    dataRows.forEach((row) => {
      if (!row || row.every(c => c === '' || c === null || c === undefined)) return;

      // Si mapping.name est null, prendre la première cellule texte longue (> 3 chars)
      const nameCol = mapping.name ?? row.findIndex(c => typeof c === 'string' && c.trim().length > 3 && !/^\d/.test(c.trim()));
      const name = nameCol >= 0 ? String(row[nameCol] ?? '').trim() : '';
      if (!name || name === '-' || /^\d+$/.test(name)) return;

      const isin     = mapping.isin !== null ? String(row[mapping.isin] ?? '').trim().toUpperCase() : '';
      const quantity = mapping.quantity !== null ? this._parseNum(row[mapping.quantity]) : null;
      const buyPrice = mapping.buyPrice !== null ? this._parseNum(row[mapping.buyPrice]) : null;
      const totVal   = mapping.totalValue !== null ? this._parseNum(row[mapping.totalValue]) : null;

      let currentPrice = null;

      if (!mapping.currentIsTotal && mapping.currentPrice !== null) {
        currentPrice = this._parseNum(row[mapping.currentPrice]);
      }

      // If currentPrice still null, derive from totalValue / quantity
      if ((currentPrice === null || currentPrice <= 0) && totVal && quantity && quantity > 0) {
        currentPrice = totVal / quantity;
      }

      // Last resort: if still no quantity/price but we have a totalValue, treat as 1-unit position
      let finalQty = quantity;
      if ((!finalQty || finalQty <= 0) && totVal && totVal > 0) {
        finalQty = 1;
        currentPrice = totVal;
      }

      if (!finalQty || finalQty <= 0) return;
      if (!currentPrice || currentPrice <= 0) return;

      const type = this._guessType(name, isin);

      const cleanIsin = isin && isin !== '-' && /^[A-Z]{2}/.test(isin) ? isin : '';

      const matchedExisting = cleanIsin
        ? existing.find(e => e.ticker === cleanIsin || (e.notes || '').includes(cleanIsin))
        : existing.find(e => e.name.toLowerCase() === name.toLowerCase());

      positions.push({
        name,
        isin:        cleanIsin,
        quantity:    finalQty,
        buyPrice:    buyPrice || currentPrice,
        currentPrice,
        type,
        existingId:   matchedExisting?.id   || null,
        existingName: matchedExisting?.name || null,
      });
    });

    return positions;
  },

  _showPreview(positions) {
    window._investPositions = positions;

    const accountOptions = Object.entries(Utils.INVESTMENT_ACCOUNTS)
      .map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

    const typeOptions = (selected) => Object.entries(Utils.INVESTMENT_TYPES)
      .map(([v, l]) => `<option value="${v}"${v === selected ? ' selected' : ''}>${l}</option>`).join('');

    const rows = positions.map((p, i) => {
      const isUpdate = !!p.existingId;
      const gainPct  = p.buyPrice > 0 ? ((p.currentPrice - p.buyPrice) / p.buyPrice * 100).toFixed(1) : null;
      const gainCls  = gainPct !== null && parseFloat(gainPct) >= 0 ? 'positive' : 'negative';
      const qtyFmt   = p.quantity % 1 === 0 ? p.quantity.toLocaleString('fr-FR') : p.quantity.toFixed(4);
      return `<tr>
        <td><input type="checkbox" data-inv-idx="${i}" checked></td>
        <td>
          <div style="font-weight:600;font-size:12px">${p.name}</div>
          ${p.isin ? `<div style="font-size:10px;color:var(--text-muted);font-family:monospace">${p.isin}</div>` : ''}
        </td>
        <td>${Dropdown.render('inv-type-' + i, typeOptions(p.type), { small: true })}</td>
        <td style="text-align:right;font-size:12px">${qtyFmt}</td>
        <td style="text-align:right;font-size:12px">${p.buyPrice !== p.currentPrice ? Utils.formatCurrency(p.buyPrice) : '—'}</td>
        <td style="text-align:right;font-size:12px">
          ${Utils.formatCurrency(p.currentPrice)}
          ${gainPct !== null ? `<div class="${gainCls}" style="font-size:10px">${parseFloat(gainPct) >= 0 ? '+' : ''}${gainPct}%</div>` : ''}
        </td>
        <td style="text-align:right;font-size:12px;font-weight:600">${Utils.formatCurrency(p.quantity * p.currentPrice)}</td>
        <td><span class="invest-status-badge ${isUpdate ? 'badge-update' : 'badge-new'}">${isUpdate ? '↻ MAJ' : '+ Nouveau'}</span></td>
      </tr>`;
    }).join('');

    const totalVal = positions.reduce((s, p) => s + p.quantity * p.currentPrice, 0);
    const note = `<div class="bank-import-note bank-note-warn">💡 Types de titres détectés automatiquement d'après le nom et l'ISIN — vérifiez avant d'importer.</div>`;

    document.getElementById('modal')?.classList.add('modal-wide');
    Modal.open(`Import portefeuille — ${positions.length} position(s)`, `
      ${note}
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:8px">
          <label style="font-size:13px;font-weight:600;white-space:nowrap">Compte :</label>
          ${Dropdown.render('invest-import-account', accountOptions)}
        </div>
        <div style="margin-left:auto;font-size:13px;color:var(--text-muted)">
          Valorisation totale : <strong style="color:var(--text)">${Utils.formatCurrency(totalVal)}</strong>
        </div>
      </div>
      <div class="bank-preview-wrap">
        <table class="data-table bank-preview-table">
          <thead><tr>
            <th style="width:32px"><input type="checkbox" id="invest-check-all" checked></th>
            <th>Position</th><th>Type</th>
            <th class="text-right">Qté / Parts</th>
            <th class="text-right">PRU</th>
            <th class="text-right">Cours actuel</th>
            <th class="text-right">Valorisation</th>
            <th>Statut</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="form-actions bank-preview-actions">
        <button class="btn-secondary" onclick="InvestImport._cancelPreview()">Annuler</button>
        <button class="btn-primary" onclick="InvestImport._confirmImport()">Importer les sélectionnées</button>
      </div>
    `);

    document.getElementById('invest-check-all')?.addEventListener('change', (e) => {
      document.querySelectorAll('[data-inv-idx]').forEach(cb => { cb.checked = e.target.checked; });
    });
  },

  _cancelPreview() {
    window._investPositions = null;
    document.getElementById('modal')?.classList.remove('modal-wide');
    Modal.close();
  },

  _confirmImport() {
    const positions  = window._investPositions || [];
    const checkboxes = document.querySelectorAll('[data-inv-idx]');
    const account    = document.getElementById('invest-import-account')?.value || 'autre';
    const existing   = Storage.getInvestments();
    let added = 0, updated = 0;

    checkboxes.forEach((cb, i) => {
      if (!cb.checked) return;
      const p    = positions[i];
      const type = document.getElementById('inv-type-' + i)?.value || p.type;
      const today = new Date().toISOString().split('T')[0];

      if (p.existingId) {
        const idx = existing.findIndex(e => e.id === p.existingId);
        if (idx !== -1) {
          existing[idx].currentPrice = p.currentPrice;
          existing[idx].quantity     = p.quantity;
          if (p.buyPrice !== p.currentPrice) existing[idx].buyPrice = p.buyPrice;
          existing[idx].type = type;
          updated++;
        }
      } else {
        existing.push({
          id: Utils.generateId(),
          name: p.name,
          ticker: p.isin || '',
          type,
          account,
          quantity:     p.quantity,
          buyPrice:     p.buyPrice || p.currentPrice,
          currentPrice: p.currentPrice,
          buyDate:      today,
          notes:        p.isin ? `ISIN: ${p.isin}` : 'Import portefeuille',
        });
        added++;
      }
    });

    Storage.saveInvestments(existing);
    window._investPositions = null;
    document.getElementById('modal')?.classList.remove('modal-wide');
    Modal.close();
    navigateTo('portfolio');
    alert(`Import terminé ✓\n${added} position(s) ajoutée(s), ${updated} mise(s) à jour.`);
  },
};
