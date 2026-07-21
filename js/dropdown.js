// Dropdown : liste déroulante custom (pilule fermée en dégradé accent + panneau flottant sombre
// animé) qui remplace les <select> natifs partout dans l'app SAUF le filtre de période
// (js/period-filter.js, laissé inchangé à la demande explicite — c'est un composant totalement
// à part, pas basé sur Dropdown). Un <select> natif ne peut pas avoir de coins arrondis/ombre/
// animation sur sa liste déroulante ouverte (popup rendu par l'OS, hors de portée du CSS) —
// Dropdown.render() produit donc un markup custom, mais garde un <input type="hidden"> avec le
// MÊME id/name que l'ancien <select> pour que tout le code existant (FormData, document.
// getElementById(id).value, attribut onchange="...") continue de fonctionner sans changement.
// Panneau en position:fixed, repositionné en JS à chaque ouverture (Dropdown._open) : échappe à
// tout ancêtre overflow:hidden/auto (tableau à défilement, modale...), contrairement à
// position:absolute qui resterait piégé dans le premier ancêtre positionné.
const Dropdown = {
  _openEl: null,
  _bound: false,

  // Parse une chaîne "<option value=...>Label</option>..." via un <select> hors-DOM — réutilise
  // le parsing HTML natif du navigateur plutôt qu'un regex, et préserve le comportement du
  // <select> sans option "selected" (1re option gagne silencieusement), pour un comportement
  // strictement inchangé par rapport à l'ancien <select>.
  _parseOptionsHtml(html) {
    const tmp = document.createElement('select');
    tmp.innerHTML = html;
    return [...tmp.options].map(o => ({ value: o.value, label: o.textContent, selected: o.selected, disabled: o.disabled }));
  },

  _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  _optsHtml(items) {
    if (!items.length) return `<span class="dd-empty">Aucune option</span>`;
    const sel = items.find(o => o.selected) || items[0];
    return items.map(o => `<button type="button" class="dd-opt${o.value === sel.value ? ' active' : ''}" data-value="${this._esc(o.value)}"${o.disabled ? ' disabled' : ''}>${this._esc(o.label)}</button>`).join('');
  },

  // options : soit la même chaîne "<option>...</option>" qu'avant (parsée telle quelle), soit un
  // tableau [{value,label,selected,disabled}] déjà prêt.
  // opts : { id, name, className, disabled, required, small (variante compacte, tableaux
  // denses), onchange (chaîne, même style que l'attribut onchange="..." d'avant — s'exécute
  // avec this = le <input hidden>, donc this.value reste valide) }
  render(nameOrId, options, opts = {}) {
    const items = typeof options === 'string' ? this._parseOptionsHtml(options) : (options || []);
    const selectedItem = items.find(o => o.selected) || items[0] || { value: '', label: '' };
    const id = opts.id || nameOrId;
    const name = opts.name !== undefined ? opts.name : nameOrId;
    const cls = ['dd'];
    if (opts.small) cls.push('dd-sm');
    if (opts.className) cls.push(opts.className);
    if (opts.disabled) cls.push('dd-disabled');
    const onchangeAttr = opts.onchange ? ` onchange="${this._esc(opts.onchange)}"` : '';
    const extraAttrs = opts.dataAttrs ? Object.entries(opts.dataAttrs).map(([k, v]) => ` data-${k}="${this._esc(v)}"`).join('') : '';

    return `<div class="${cls.join(' ')}"${extraAttrs}>
      <button type="button" class="dd-trigger"${opts.disabled ? ' disabled' : ''}>
        <span class="dd-trigger-label">${this._esc(selectedItem.label || '')}</span>
        <span class="dd-trigger-chev">▾</span>
      </button>
      <input type="hidden" id="${this._esc(id)}" name="${this._esc(name)}" value="${this._esc(selectedItem.value)}"${onchangeAttr}${opts.required ? ' required' : ''}>
      <div class="dd-panel">${this._optsHtml(items)}</div>
    </div>`;
  },

  _wrapOf(id) {
    const input = document.getElementById(id);
    return input && input.closest('.dd');
  },

  // Pour les dropdowns "filtre" recréés à chaque render() : si un listener externe a été
  // attaché une fois sur l'élément (ex. document.getElementById('x').addEventListener('change',
  // ...) au chargement), remplacer le noeud via render()+innerHTML le détacherait silencieusement
  // à la 1re reconstruction. mount() met à jour EN PLACE (setOptions, garde le même <input>) si le
  // dropdown existe déjà, et ne fait un render() complet que la toute première fois.
  mount(slotId, name, options, opts = {}) {
    const id = opts.id || name;
    if (document.getElementById(id)) {
      this.setOptions(id, options, opts.silent);
      if (opts.disabled !== undefined) this.setDisabled(id, opts.disabled);
    } else {
      const slot = document.getElementById(slotId);
      if (slot) slot.innerHTML = this.render(name, options, opts);
    }
  },

  // Reconstruit les options d'un dropdown déjà rendu — équivalent de l'ancien
  // `select.innerHTML = newOptionsHtml` pour les cascades catégorie -> sous-catégorie. `id` =
  // id de l'ancien <select> (porté aujourd'hui par le <input hidden>). Redéclenche 'change' si
  // la valeur effectivement sélectionnée diffère de l'ancienne (nouvelle liste ne contenant
  // plus l'ancienne valeur, ex. changement de catégorie qui vide la sous-catégorie).
  setOptions(id, options, silent = false) {
    const wrap = this._wrapOf(id);
    if (!wrap) return;
    const input = document.getElementById(id);
    const items = typeof options === 'string' ? this._parseOptionsHtml(options) : (options || []);
    const selectedItem = items.find(o => o.selected) || items[0] || { value: '', label: '' };
    const panel = wrap.querySelector('.dd-panel');
    if (panel) panel.innerHTML = this._optsHtml(items);
    const label = wrap.querySelector('.dd-trigger-label');
    if (label) label.textContent = selectedItem.label || '';
    const changed = input.value !== selectedItem.value;
    input.value = selectedItem.value;
    if (changed && !silent) input.dispatchEvent(new Event('change', { bubbles: true }));
  },

  // Change juste la valeur sélectionnée sans toucher à la liste d'options (équivalent de
  // `select.value = x`).
  setValue(id, value, silent = false) {
    const wrap = this._wrapOf(id);
    if (!wrap) return;
    const input = document.getElementById(id);
    const opt = [...wrap.querySelectorAll('.dd-opt')].find(o => o.dataset.value === String(value));
    wrap.querySelectorAll('.dd-opt').forEach(o => o.classList.toggle('active', o === opt));
    const label = wrap.querySelector('.dd-trigger-label');
    if (label && opt) label.textContent = opt.textContent;
    const changed = input.value !== value;
    input.value = value;
    if (changed && !silent) input.dispatchEvent(new Event('change', { bubbles: true }));
  },

  // (Dés)active un dropdown déjà rendu (équivalent de `select.disabled = bool`).
  setDisabled(id, disabled) {
    const wrap = this._wrapOf(id);
    if (!wrap) return;
    wrap.classList.toggle('dd-disabled', !!disabled);
    const trigger = wrap.querySelector('.dd-trigger');
    if (trigger) trigger.disabled = !!disabled;
    if (disabled && this._openEl === wrap) this._closeAll();
  },

  _closeAll() {
    if (this._openEl) { this._openEl.classList.remove('open'); this._openEl = null; }
  },

  _open(wrap) {
    const trigger = wrap.querySelector('.dd-trigger');
    const panel = wrap.querySelector('.dd-panel');
    if (!trigger || !panel || trigger.disabled) return;
    const r = trigger.getBoundingClientRect();
    const width = Math.max(r.width, 170);
    panel.style.width = width + 'px';
    panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) + 'px';
    const panelH = Math.min(panel.scrollHeight || 200, 280);
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < panelH + 12 && r.top > spaceBelow;
    if (openUp) { panel.style.top = ''; panel.style.bottom = (window.innerHeight - r.top + 8) + 'px'; }
    else { panel.style.bottom = ''; panel.style.top = (r.bottom + 8) + 'px'; }
    wrap.classList.add('open');
    this._openEl = wrap;
  },

  init() {
    if (this._bound) return;
    this._bound = true;

    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('.dd-trigger');
      if (trigger) {
        e.stopPropagation();
        const wrap = trigger.closest('.dd');
        if (!wrap || wrap.classList.contains('dd-disabled') || trigger.disabled) return;
        if (this._openEl === wrap) this._closeAll();
        else { this._closeAll(); this._open(wrap); }
        return;
      }
      const opt = e.target.closest('.dd-opt');
      if (opt && !opt.disabled) {
        e.stopPropagation();
        const wrap = opt.closest('.dd');
        const input = wrap.querySelector('input[type="hidden"]');
        const label = wrap.querySelector('.dd-trigger-label');
        const value = opt.dataset.value;
        wrap.querySelectorAll('.dd-opt').forEach(o => o.classList.toggle('active', o === opt));
        if (label) label.textContent = opt.textContent;
        const changed = input.value !== value;
        input.value = value;
        this._closeAll();
        if (changed) input.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      if (this._openEl && !this._openEl.contains(e.target)) this._closeAll();
    });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._closeAll(); });
    // Un scroll (page ou conteneur interne, d'où `true` = phase de capture) ou un resize rend la
    // position déjà calculée du panneau obsolète — le refermer est plus simple/sûr que la
    // recalculer en continu.
    window.addEventListener('scroll', () => this._closeAll(), true);
    window.addEventListener('resize', () => this._closeAll());
  },
};
