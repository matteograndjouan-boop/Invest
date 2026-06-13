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

        document.getElementById('modal')?.classList.add('modal-wide');
        const apiKey = BankImport.getApiKey();
        Modal.open('Analyse du portefeuille…', `
          <div style="text-align:center;padding:52px 20px">
            <div style="font-size:52px;margin-bottom:20px">📊</div>
            <p style="font-size:15px;font-weight:700;margin-bottom:8px">Analyse en cours…</p>
            <p style="color:var(--text-muted);font-size:13px">
              ${apiKey ? 'Claude IA identifie vos positions' : 'Détection automatique des colonnes'}
            </p>
          </div>
        `);

        let mapping, aiTypes = null;

        if (apiKey) {
          try {
            const result = await this._callClaude(rows, apiKey);
            mapping = result.mapping;
            aiTypes = result.types;
          } catch (err) {
            console.warn('Claude API fallback:', err.message);
            mapping = this._guessMapping(rows[0]);
          }
        } else {
          mapping = this._guessMapping(rows[0]);
        }

        const positions = this._parseWithMapping(rows, mapping, aiTypes);

        if (!positions.length) {
          document.getElementById('modal')?.classList.remove('modal-wide');
          Modal.close();
          alert('Aucune position valide détectée.\n\nVérifiez que le fichier est bien un export de portefeuille avec des colonnes de quantité et de valeur.');
          return;
        }

        this._showPreview(positions, !apiKey || !aiTypes);

      } catch (err) {
        console.error(err);
        document.getElementById('modal')?.classList.remove('modal-wide');
        Modal.close();
        alert('Erreur lors de la lecture : ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  },

  async _callClaude(rows, apiKey) {
    const headers = rows[0];
    const sampleRows = rows.slice(1, Math.min(6, rows.length));

    const prompt = `Tu analyses un export de portefeuille boursier (PEA, assurance vie, CTO...).

En-têtes (index 0 à ${headers.length - 1}) : ${headers.map((h, i) => `${i}:"${h}"`).join(', ')}

${sampleRows.map((r, i) => `Ligne ${i + 1}: ${r.map((v, j) => `${j}:"${v}"`).join(', ')}`).join('\n')}

Identifie les colonnes pour :
- name : nom du titre / support / libellé
- isin : code ISIN (12 car., commence par code pays ex: FR, IE, LU, US)
- quantity : quantité / nombre de parts
- buyPrice : prix d'achat unitaire / PRU (prix moyen PAR titre, pas total)
- currentPrice : cours actuel / valeur liquidative (PAR titre, pas total)
- totalValue : valorisation totale (si pas de prix unitaire disponible)
- currentIsTotal : true si la colonne "valorisation/montant" est le SEUL indicateur de valeur (pas de prix par titre), false sinon

Pour chaque ligne, indique le type parmi : action, etf, obligations, immobilier, crypto, autre
Indices : ISIN IE/LU → souvent ETF ; FR → souvent action ; "WORLD","MSCI","INDEX","TRACKER" → etf ; "EURO","FONDS","SICAV" → obligations ou autre

Réponds UNIQUEMENT en JSON :
{"mapping":{"name":<idx|null>,"isin":<idx|null>,"quantity":<idx|null>,"buyPrice":<idx|null>,"currentPrice":<idx|null>,"totalValue":<idx|null>,"currentIsTotal":<bool>},"types":[${sampleRows.map(() => '"…"').join(',')}]}`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-calls': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Erreur API ${resp.status}`);
    }

    const data = await resp.json();
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Réponse invalide');
    return JSON.parse(match[0]);
  },

  _guessMapping(headerRow) {
    const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const h = headerRow.map(norm);
    const find = (...terms) => { const i = h.findIndex(c => terms.some(t => c.includes(t))); return i >= 0 ? i : null; };
    const nameIdx = find('libelle', 'support', 'designation', 'nom', 'valeur mobiliere', 'titre');
    const isinIdx = find('isin', 'code isin', 'code valeur');
    const qtyIdx  = find('quantite', 'nombre de parts', 'nombre parts', 'parts', 'qte', 'nb titres');
    const buyIdx  = find('pru', 'prix de revient', 'px revient', 'prix achat', 'pa ', 'cout unitaire');
    const curIdx  = find('cours', 'valeur liquidative', 'vl ', 'prix actuel', 'dernier cours');
    const totIdx  = find('valorisation', 'montant', 'valeur portefeuille', 'valeur totale', 'encours');
    return {
      name: nameIdx,
      isin: isinIdx,
      quantity: qtyIdx,
      buyPrice: buyIdx,
      currentPrice: curIdx,
      totalValue: totIdx,
      currentIsTotal: curIdx === null && totIdx !== null,
    };
  },

  _parseNum(val) {
    if (val === '' || val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    const s = String(val).trim().replace(/\s| /g, '').replace('%', '');
    // Remove sign prefix like "+227,50"
    const cleaned = s.replace(/\.(?=\d{3}(?:[,]|$))/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  },

  _guessType(name, isin) {
    const n = (name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const isinUpper = (isin || '').toUpperCase();
    if (/etf|tracker|world|msci|index|s&p|cac 40|stoxx|nasdaq|bloomberg/.test(n)) return 'etf';
    if (/scpi|immob|pierre|foncier/.test(n)) return 'immobilier';
    if (/bitcoin|ethereum|crypto/.test(n)) return 'crypto';
    if (/obligation|bond|livret|monetaire|tresor|corporate/.test(n)) return 'obligations';
    if (/^IE|^LU/.test(isinUpper)) return 'etf';
    if (/^FR|^US|^DE|^GB|^NL/.test(isinUpper)) return 'action';
    return 'autre';
  },

  _parseWithMapping(rows, mapping, aiTypes) {
    const positions = [];
    const existing = Storage.getInvestments();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;

      const name = mapping.name !== null ? String(row[mapping.name] || '').trim() : '';
      if (!name || name === '-') continue;

      const isin     = mapping.isin !== null ? String(row[mapping.isin] || '').trim().toUpperCase() : '';
      const quantity = mapping.quantity !== null ? this._parseNum(row[mapping.quantity]) : null;
      const buyPrice = mapping.buyPrice !== null ? this._parseNum(row[mapping.buyPrice]) : null;

      let currentPrice = null;
      if (!mapping.currentIsTotal && mapping.currentPrice !== null) {
        currentPrice = this._parseNum(row[mapping.currentPrice]);
      } else if (mapping.totalValue !== null && quantity && quantity > 0) {
        const total = this._parseNum(row[mapping.totalValue]);
        if (total !== null) currentPrice = total / quantity;
      }

      if (!quantity || quantity <= 0) continue;
      if (!currentPrice || currentPrice <= 0) continue;

      const aiType = aiTypes ? aiTypes[i - 1] : null;
      const type = (aiType && Object.keys(Utils.INVESTMENT_TYPES).includes(aiType))
        ? aiType
        : this._guessType(name, isin);

      // Detect existing match (by ISIN or name)
      const matchedExisting = isin
        ? existing.find(e => e.ticker === isin || (e.notes || '').includes(isin))
        : existing.find(e => e.name.toLowerCase() === name.toLowerCase());

      positions.push({
        name,
        isin: isin && isin !== '-' ? isin : '',
        quantity,
        buyPrice: buyPrice || currentPrice,
        currentPrice,
        type,
        existingId: matchedExisting?.id || null,
        existingName: matchedExisting?.name || null,
      });
    }

    return positions;
  },

  _showPreview(positions, noAI) {
    window._investPositions = positions;

    const accountOptions = Object.entries(Utils.INVESTMENT_ACCOUNTS)
      .map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

    const typeOptions = (selected) => Object.entries(Utils.INVESTMENT_TYPES)
      .map(([v, l]) => `<option value="${v}"${v === selected ? ' selected' : ''}>${l}</option>`).join('');

    const rows = positions.map((p, i) => {
      const isUpdate = !!p.existingId;
      const gain = ((p.currentPrice - p.buyPrice) / p.buyPrice * 100).toFixed(1);
      const gainCls = parseFloat(gain) >= 0 ? 'positive' : 'negative';
      return `<tr>
        <td><input type="checkbox" data-inv-idx="${i}" checked></td>
        <td>
          <div style="font-weight:600;font-size:12px">${p.name}</div>
          ${p.isin ? `<div style="font-size:11px;color:var(--text-muted);font-family:monospace">${p.isin}</div>` : ''}
        </td>
        <td><select data-inv-type="${i}" class="select-input" style="font-size:11px;padding:3px 5px">${typeOptions(p.type)}</select></td>
        <td style="text-align:right;font-size:12px">${p.quantity % 1 === 0 ? p.quantity : p.quantity.toFixed(4)}</td>
        <td style="text-align:right;font-size:12px">${p.buyPrice ? Utils.formatCurrency(p.buyPrice) : '—'}</td>
        <td style="text-align:right;font-size:12px">
          ${Utils.formatCurrency(p.currentPrice)}
          <div class="${gainCls}" style="font-size:10px">${parseFloat(gain) >= 0 ? '+' : ''}${gain}%</div>
        </td>
        <td style="text-align:right;font-size:12px;font-weight:600">${Utils.formatCurrency(p.quantity * p.currentPrice)}</td>
        <td>
          <span class="invest-status-badge ${isUpdate ? 'badge-update' : 'badge-new'}">
            ${isUpdate ? '↻ MAJ' : '+ Nouveau'}
          </span>
        </td>
      </tr>`;
    }).join('');

    const totalVal = positions.reduce((s, p) => s + p.quantity * p.currentPrice, 0);

    const note = noAI
      ? `<div class="bank-import-note bank-note-warn">💡 <strong>Sans clé Claude :</strong> types détectés par mots-clés. <a href="#" onclick="BankImport.openSettings();return false">Configurer l'IA →</a></div>`
      : `<div class="bank-import-note bank-note-ok">🤖 <strong>Types suggérés par Claude IA.</strong> Vérifiez avant d'importer.</div>`;

    document.getElementById('modal')?.classList.add('modal-wide');
    Modal.open(`Import portefeuille — ${positions.length} position(s)`, `
      ${note}
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:8px">
          <label style="font-size:13px;font-weight:600;white-space:nowrap">Compte :</label>
          <select id="invest-import-account" class="select-input" style="font-size:13px">${accountOptions}</select>
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
            <th class="text-right">Qté</th>
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
    const positions = window._investPositions || [];
    const checkboxes = document.querySelectorAll('[data-inv-idx]');
    const typeSelects = document.querySelectorAll('[data-inv-type]');
    const account = document.getElementById('invest-import-account')?.value || 'autre';
    const existing = Storage.getInvestments();
    let added = 0, updated = 0;

    checkboxes.forEach((cb, i) => {
      if (!cb.checked) return;
      const p = positions[i];
      const type = typeSelects[i]?.value || p.type;
      const today = new Date().toISOString().split('T')[0];

      if (p.existingId) {
        const idx = existing.findIndex(e => e.id === p.existingId);
        if (idx !== -1) {
          existing[idx].currentPrice = p.currentPrice;
          existing[idx].quantity     = p.quantity;
          if (p.buyPrice) existing[idx].buyPrice = p.buyPrice;
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
          quantity: p.quantity,
          buyPrice: p.buyPrice || p.currentPrice,
          currentPrice: p.currentPrice,
          buyDate: today,
          notes: p.isin ? `ISIN: ${p.isin}` : 'Import portefeuille',
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
