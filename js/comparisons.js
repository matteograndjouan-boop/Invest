const Comparisons = {
  periodA: '',
  periodB: '',

  init() {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = now.getMonth() === 0
      ? `${now.getFullYear() - 1}-12`
      : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

    this.periodA = lastMonth;
    this.periodB = thisMonth;

    const selA = document.getElementById('comp-period-a');
    const selB = document.getElementById('comp-period-b');
    if (selA) {
      selA.value = this.periodA;
      selA.addEventListener('change', (e) => { this.periodA = e.target.value; this.render(); });
    }
    if (selB) {
      selB.value = this.periodB;
      selB.addEventListener('change', (e) => { this.periodB = e.target.value; this.render(); });
    }
  },

  render() {
    const expenses = Storage.getExpenses();
    const expA = expenses.filter(e => Utils.getExpenseMonth(e) === this.periodA);
    const expB = expenses.filter(e => Utils.getExpenseMonth(e) === this.periodB);

    const totalA = expA.reduce((s, e) => s + e.amount, 0);
    const totalB = expB.reduce((s, e) => s + e.amount, 0);
    const totalDiff = totalB - totalA;
    const totalPct = totalA > 0 ? ((totalDiff / totalA) * 100) : (totalB > 0 ? 100 : 0);

    document.getElementById('comp-total-a').textContent = Utils.formatCurrency(totalA);
    document.getElementById('comp-total-b').textContent = Utils.formatCurrency(totalB);
    const diffEl = document.getElementById('comp-total-diff');
    diffEl.textContent = (totalDiff >= 0 ? '+' : '') + Utils.formatCurrency(totalDiff) + ' (' + (totalDiff >= 0 ? '+' : '') + totalPct.toFixed(1) + '%)';
    diffEl.className = 'kpi-value ' + (totalDiff <= 0 ? 'positive' : 'negative');
    document.getElementById('comp-total-diff-card').className = 'kpi-card ' + (totalDiff <= 0 ? 'success' : 'danger');

    this._renderTable(expA, expB);
    Charts.comparisonBar(expA, expB, this.periodA, this.periodB);
  },

  _renderTable(expA, expB) {
    const tbody = document.getElementById('comp-tbody');
    const allCategories = new Set([...expA.map(e => e.category), ...expB.map(e => e.category)]);

    if (!allCategories.size) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding:24px">Aucune dépense pour ces périodes</td></tr>';
      return;
    }

    const rows = [...allCategories].sort().map(cat => {
      const amtA = expA.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
      const amtB = expB.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
      const diff = amtB - amtA;
      const pct = amtA > 0 ? ((diff / amtA) * 100) : (amtB > 0 ? 100 : 0);
      const cls = diff <= 0 ? 'positive' : 'negative';
      const sign = diff >= 0 ? '+' : '';
      return `<tr>
        <td><span class="badge badge-category">${cat}</span></td>
        <td>${Utils.formatCurrency(amtA)}</td>
        <td>${Utils.formatCurrency(amtB)}</td>
        <td class="${cls}">${sign}${Utils.formatCurrency(diff)}</td>
        <td class="${cls}">${sign}${pct.toFixed(1)}%</td>
      </tr>`;
    });

    // Total row
    const totalA = expA.reduce((s, e) => s + e.amount, 0);
    const totalB = expB.reduce((s, e) => s + e.amount, 0);
    const totalDiff = totalB - totalA;
    const totalPct = totalA > 0 ? ((totalDiff / totalA) * 100) : (totalB > 0 ? 100 : 0);
    const totalSign = totalDiff >= 0 ? '+' : '';
    const totalCls = totalDiff <= 0 ? 'positive' : 'negative';

    rows.push(`<tr style="font-weight:700;border-top:2px solid var(--border)">
      <td>Total</td>
      <td>${Utils.formatCurrency(totalA)}</td>
      <td>${Utils.formatCurrency(totalB)}</td>
      <td class="${totalCls}">${totalSign}${Utils.formatCurrency(totalDiff)}</td>
      <td class="${totalCls}">${totalSign}${totalPct.toFixed(1)}%</td>
    </tr>`);

    tbody.innerHTML = rows.join('');
  },
};
