/* wizard.js — client-side logic for all wizard steps */

// ── Shared helper ─────────────────────────────────────────────────────────────

/**
 * Parse "old value -> new value" into { old, new }.
 * The separator is  ' -> '  (space-arrow-space).
 * If no separator is found, the whole string is treated as the new value.
 */
function parseChangeString(text) {
  const SEP = ' -> ';
  const idx = text.indexOf(SEP);
  if (idx !== -1) {
    return { old: text.slice(0, idx).trim(), nw: text.slice(idx + SEP.length).trim() };
  }
  return { old: '', nw: text.trim() };
}


// ── Step 2: Replacements ─────────────────────────────────────────────────────

function initStep2() {
  updateRowCount();
  addReplacementRow();   // always start with one row
}

function getFileInfo(filePath) {
  if (typeof SCAN_RESULTS === 'undefined') return null;
  return SCAN_RESULTS.find(r => r.file === filePath) || null;
}

function addReplacementRow() {
  const container = document.getElementById('replacements-container');
  if (!container) return;

  const clone = document.getElementById('row-template').content.cloneNode(true);
  const row   = clone.querySelector('.replacement-row');

  row.querySelector('.row-number').textContent = container.children.length + 1;

  // ── File dropdown ──────────────────────────────────────────────────────────
  const fileSelect = row.querySelector('.rep-file-select');

  const allOpt       = document.createElement('option');
  allOpt.value       = '_ALL_';
  allOpt.textContent = '\u2295  All selected files';
  fileSelect.appendChild(allOpt);

  const hasScan = typeof SCAN_RESULTS !== 'undefined' && SCAN_RESULTS.length > 0;
  if (hasScan) {
    const sep      = document.createElement('option');
    sep.disabled   = true;
    sep.textContent = '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
    fileSelect.appendChild(sep);

    SCAN_RESULTS.forEach(sr => {
      const opt       = document.createElement('option');
      opt.value       = sr.file;
      opt.textContent = sr.file + '  [' + sr.type.toUpperCase() + ']';
      fileSelect.appendChild(opt);
    });
  }

  fileSelect.addEventListener('change', function () { onFileChange(this); });

  // ── Key dropdown / text field ──────────────────────────────────────────────
  row.querySelector('.rep-key-dropdown').addEventListener('change', function () {
    // When a specific key is selected, pre-fill the change input with a hint
    const chosen = this.options[this.selectedIndex];
    const sample = chosen ? (chosen.dataset.origVal || '') : '';
    const ci     = row.querySelector('.rep-change-input');
    // Only pre-fill if the input is still empty
    if (ci && !ci.value && sample) {
      ci.value = sample + ' -> ';
      ci.setSelectionRange(ci.value.length, ci.value.length);
    }
    updatePreview(row);
  });

  row.querySelector('.rep-key-textfield').addEventListener('input', function () {
    updatePreview(row);
  });

  // ── Change input ───────────────────────────────────────────────────────────
  row.querySelector('.rep-change-input').setAttribute('list', 'prev-changes-list');
  row.querySelector('.rep-change-input').addEventListener('input', function () {
    updatePreview(this.closest('.replacement-row'));
  });

  container.appendChild(clone);

  fileSelect.selectedIndex = hasScan ? 2 : 0;
  onFileChange(fileSelect);

  updateRowCount();
  renumberRows();
}

function onFileChange(select) {
  const row          = select.closest('.replacement-row');
  const keyDropdown  = row.querySelector('.rep-key-dropdown');
  const keyTextField = row.querySelector('.rep-key-textfield');
  const fileTypeInp  = row.querySelector('.rep-file-type');

  if (select.value === '_ALL_') {
    keyDropdown.style.display  = 'none';
    keyTextField.style.display = '';
    keyTextField.value         = '';
    fileTypeInp.value          = 'all';
    row.classList.add('all-files-mode');
    updatePreview(row);
    return;
  }

  keyTextField.style.display = 'none';
  keyDropdown.style.display  = '';
  row.classList.remove('all-files-mode');

  const info = getFileInfo(select.value);
  fileTypeInp.value = info ? info.type : '';

  keyDropdown.innerHTML = '<option value="">— select field / column —</option>';

  if (info && info.keys && info.keys.length > 0) {
    info.keys.forEach(k => {
      const opt           = document.createElement('option');
      opt.value           = k.key;
      opt.dataset.origVal = k.original_value || '';
      opt.textContent     = k.display || k.key;
      keyDropdown.appendChild(opt);
    });
    keyDropdown.selectedIndex = 1;
    // Pre-fill change input with sample  "sample -> "
    const first = keyDropdown.options[1];
    const ci    = row.querySelector('.rep-change-input');
    if (first && first.dataset.origVal && ci && !ci.value) {
      ci.value = first.dataset.origVal + ' -> ';
      ci.setSelectionRange(ci.value.length, ci.value.length);
    }
  }

  updatePreview(row);
}

function updatePreview(row) {
  const isAllMode  = row.classList.contains('all-files-mode');
  const keyEl      = isAllMode
    ? row.querySelector('.rep-key-textfield')
    : row.querySelector('.rep-key-dropdown');
  const changeInput = row.querySelector('.rep-change-input');
  const previewBar  = row.querySelector('.row-preview');

  const key     = keyEl      ? keyEl.value.trim()      : '';
  const parsed  = changeInput ? parseChangeString(changeInput.value) : { old: '', nw: '' };

  if (!key || (!parsed.old && !parsed.nw)) {
    previewBar.style.display = 'none';
    return;
  }

  const fileSelect = row.querySelector('.rep-file-select');
  const scope      = fileSelect && fileSelect.value === '_ALL_'
    ? 'all files'
    : (fileSelect ? fileSelect.value.split('/').pop() : '');

  previewBar.style.display = 'flex';
  previewBar.querySelector('.preview-key').textContent =
    scope ? key + '  (' + scope + ')' : key;
  previewBar.querySelector('.preview-old').textContent = parsed.old || '(any match)';
  previewBar.querySelector('.preview-new').textContent = parsed.nw  || '\u2026';
}

function removeReplacementRow(btn) {
  btn.closest('.replacement-row').remove();
  renumberRows();
  updateRowCount();
}

function renumberRows() {
  document.querySelectorAll('#replacements-container .replacement-row')
    .forEach((row, i) => {
      const num = row.querySelector('.row-number');
      if (num) num.textContent = i + 1;
    });
}

function updateRowCount() {
  const counter = document.getElementById('row-count');
  if (!counter) return;
  const n = document.querySelectorAll('#replacements-container .replacement-row').length;
  counter.textContent = n + ' rule' + (n === 1 ? '' : 's');
}


// ── Step 3: CSV Join ──────────────────────────────────────────────────────────

function initStep3() { onCsvOpChange(); }

function onCsvOpChange() {
  const radios = document.querySelectorAll('input[name="csv_operation"]');
  let selected = 'skip';
  radios.forEach(r => { if (r.checked) selected = r.value; });
  const joinSection   = document.getElementById('join-section');
  const addColSection = document.getElementById('add-col-section');
  if (joinSection)   joinSection.style.display  = selected === 'join'       ? '' : 'none';
  if (addColSection) addColSection.style.display = selected === 'add_column' ? '' : 'none';
}

async function uploadExternalCsv(input) {
  if (!input.files.length) return;
  const status = document.getElementById('ext-csv-status');
  if (status) status.textContent = 'Uploading...';
  const formData = new FormData();
  formData.append('csv_file', input.files[0]);
  try {
    const resp = await fetch('/api/upload-external-csv', { method: 'POST', body: formData });
    const data = await resp.json();
    if (data.success) {
      if (status) status.textContent = 'Loaded (' + data.headers.length + ' columns)';
      populateExtHeaders(data.headers);
      document.getElementById('ext-join-row').style.display = '';
    } else {
      if (status) status.textContent = 'Upload failed: ' + (data.error || 'Unknown error');
    }
  } catch (e) {
    if (status) status.textContent = 'Upload failed.';
  }
}

function populateExtHeaders(headers) {
  [document.getElementById('join-ext-key'),
   document.getElementById('columns-to-add')].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '';
    headers.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h; opt.textContent = h;
      sel.appendChild(opt);
    });
  });
}

async function fetchZipCsvHeaders(fileRel, targetSelectId) {
  if (!fileRel) return;
  const sel = document.getElementById(targetSelectId);
  if (!sel) return;
  try {
    const resp = await fetch('/api/zip-csv-headers?file=' + encodeURIComponent(fileRel));
    const data = await resp.json();
    sel.innerHTML = '<option value="">— select column —</option>';
    (data.headers || []).forEach(h => {
      const opt = document.createElement('option');
      opt.value = h; opt.textContent = h;
      sel.appendChild(opt);
    });
  } catch (e) { /* ignore */ }
}


// ── Step 2: Replacements ─────────────────────────────────────────────────────

function initStep2() {
  updateRowCount();
  // Always add one starter row (even with no scan results — "All" mode still works)
  addReplacementRow();
}

function getFileInfo(filePath) {
  if (typeof SCAN_RESULTS === 'undefined') return null;
  return SCAN_RESULTS.find(r => r.file === filePath) || null;
}

function addReplacementRow() {
  const container = document.getElementById('replacements-container');
  if (!container) return;

  const template = document.getElementById('row-template');
  const clone    = template.content.cloneNode(true);
  const row      = clone.querySelector('.replacement-row');

  row.querySelector('.row-number').textContent = container.children.length + 1;

  // ── Build file dropdown ──────────────────────────────────────────────────
  const fileSelect = row.querySelector('.rep-file-select');

  // "All selected files" is always the first option
  const allOpt       = document.createElement('option');
  allOpt.value       = '_ALL_';
  allOpt.textContent = '⊕  All selected files';
  fileSelect.appendChild(allOpt);

  const hasScan = typeof SCAN_RESULTS !== 'undefined' && SCAN_RESULTS.length > 0;
  if (hasScan) {
    const sep      = document.createElement('option');
    sep.disabled   = true;
    sep.textContent = '──────────────────────────';
    fileSelect.appendChild(sep);
    SCAN_RESULTS.forEach(sr => {
      const opt       = document.createElement('option');
      opt.value       = sr.file;
      opt.textContent = sr.file + '  [' + sr.type.toUpperCase() + ']';
      fileSelect.appendChild(opt);
    });
  }

  fileSelect.addEventListener('change', function () { onFileChange(this); });

  // ── Key dropdown (specific-file mode, name="rep_key") ────────────────────
  const keyDropdown = row.querySelector('.rep-key-dropdown');
  keyDropdown.addEventListener('change', function () {
    const chosen = this.options[this.selectedIndex];
    row.querySelector('.rep-find-input').value = chosen ? (chosen.dataset.origVal || '') : '';
    updatePreview(row);
  });

  // ── Key text input (All-files mode, name="rep_key_text") ─────────────────
  row.querySelector('.rep-key-textfield').addEventListener('input', function () {
    updatePreview(row);
  });

  // ── Autocomplete + preview ────────────────────────────────────────────────
  row.querySelector('.rep-value-input').setAttribute('list', 'prev-values-list');
  row.querySelector('.rep-find-input').addEventListener('input', function () {
    updatePreview(this.closest('.replacement-row'));
  });
  row.querySelector('.rep-value-input').addEventListener('input', function () {
    updatePreview(this.closest('.replacement-row'));
  });

  container.appendChild(clone);

  // Default to first real file if available, else stay on "All"
  fileSelect.selectedIndex = hasScan ? 2 : 0;
  onFileChange(fileSelect);

  updateRowCount();
  renumberRows();
}

function onFileChange(select) {
  const row          = select.closest('.replacement-row');
  const keyDropdown  = row.querySelector('.rep-key-dropdown');
  const keyTextField = row.querySelector('.rep-key-textfield');
  const fileTypeInp  = row.querySelector('.rep-file-type');
  const findInput    = row.querySelector('.rep-find-input');

  findInput.value = '';

  if (select.value === '_ALL_') {
    // ── All-files mode: free-text key input ──────────────────────────────
    keyDropdown.style.display  = 'none';
    keyTextField.style.display = '';
    keyTextField.value         = '';
    fileTypeInp.value          = 'all';
    row.classList.add('all-files-mode');
    updatePreview(row);
    return;
  }

  // ── Specific-file mode: populated dropdown ────────────────────────────────
  keyTextField.style.display = 'none';
  keyDropdown.style.display  = '';
  row.classList.remove('all-files-mode');

  const info = getFileInfo(select.value);
  fileTypeInp.value = info ? info.type : '';

  keyDropdown.innerHTML = '<option value="">— select key / column —</option>';

  if (info && info.keys && info.keys.length > 0) {
    info.keys.forEach(k => {
      const opt           = document.createElement('option');
      opt.value           = k.key;
      opt.dataset.origVal = k.original_value || '';
      opt.textContent     = k.display || k.key;
      keyDropdown.appendChild(opt);
    });
    keyDropdown.selectedIndex = 1;
    const first = keyDropdown.options[1];
    if (first) findInput.value = first.dataset.origVal || '';
  }

  updatePreview(row);
}

function updatePreview(row) {
  const isAllMode  = row.classList.contains('all-files-mode');
  const keyEl      = isAllMode
    ? row.querySelector('.rep-key-textfield')
    : row.querySelector('.rep-key-dropdown');
  const findInput  = row.querySelector('.rep-find-input');
  const newInput   = row.querySelector('.rep-value-input');
  const previewBar = row.querySelector('.row-preview');

  const key    = keyEl     ? keyEl.value.trim()    : '';
  const oldVal = findInput ? findInput.value.trim() : '';
  const newVal = newInput  ? newInput.value.trim()  : '';

  if (!key || (!oldVal && !newVal)) {
    previewBar.style.display = 'none';
    return;
  }

  const fileSelect = row.querySelector('.rep-file-select');
  const fileLabel  = fileSelect && fileSelect.value === '_ALL_'
    ? 'all files'
    : (fileSelect ? fileSelect.value.split('/').pop() : '');

  previewBar.style.display = 'flex';
  previewBar.querySelector('.preview-key').textContent =
    fileLabel ? key + '  (' + fileLabel + ')' : key;
  previewBar.querySelector('.preview-old').textContent = oldVal || '(any)';
  previewBar.querySelector('.preview-new').textContent = newVal || '…';
}

function removeReplacementRow(btn) {
  btn.closest('.replacement-row').remove();
  renumberRows();
  updateRowCount();
}

function renumberRows() {
  document.querySelectorAll('#replacements-container .replacement-row')
    .forEach((row, i) => {
      const num = row.querySelector('.row-number');
      if (num) num.textContent = i + 1;
    });
}

function updateRowCount() {
  const counter = document.getElementById('row-count');
  if (!counter) return;
  const n = document.querySelectorAll('#replacements-container .replacement-row').length;
  counter.textContent = n + ' rule' + (n === 1 ? '' : 's');
}


// ── Step 3: CSV Join ──────────────────────────────────────────────────────────

function initStep3() { onCsvOpChange(); }

function onCsvOpChange() {
  const radios = document.querySelectorAll('input[name="csv_operation"]');
  let selected = 'skip';
  radios.forEach(r => { if (r.checked) selected = r.value; });
  const joinSection   = document.getElementById('join-section');
  const addColSection = document.getElementById('add-col-section');
  if (joinSection)   joinSection.style.display  = selected === 'join'       ? '' : 'none';
  if (addColSection) addColSection.style.display = selected === 'add_column' ? '' : 'none';
}

async function uploadExternalCsv(input) {
  if (!input.files.length) return;
  const status = document.getElementById('ext-csv-status');
  if (status) status.textContent = 'Uploading…';
  const formData = new FormData();
  formData.append('csv_file', input.files[0]);
  try {
    const resp = await fetch('/api/upload-external-csv', { method: 'POST', body: formData });
    const data = await resp.json();
    if (data.success) {
      if (status) status.textContent = '✓ Loaded (' + data.headers.length + ' columns)';
      populateExtHeaders(data.headers);
      document.getElementById('ext-join-row').style.display = '';
    } else {
      if (status) status.textContent = 'Upload failed: ' + (data.error || 'Unknown error');
    }
  } catch (e) {
    if (status) status.textContent = 'Upload failed.';
  }
}

function populateExtHeaders(headers) {
  [document.getElementById('join-ext-key'),
   document.getElementById('columns-to-add')].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '';
    headers.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h; opt.textContent = h;
      sel.appendChild(opt);
    });
  });
}

async function fetchZipCsvHeaders(fileRel, targetSelectId) {
  if (!fileRel) return;
  const sel = document.getElementById(targetSelectId);
  if (!sel) return;
  try {
    const resp = await fetch('/api/zip-csv-headers?file=' + encodeURIComponent(fileRel));
    const data = await resp.json();
    sel.innerHTML = '<option value="">— select column —</option>';
    (data.headers || []).forEach(h => {
      const opt = document.createElement('option');
      opt.value = h; opt.textContent = h;
      sel.appendChild(opt);
    });
  } catch (e) { /* ignore */ }
}

// ── Step 2: Replacements ─────────────────────────────────────────────────────

function initStep2() {
  updateRowCount();
  if (typeof SCAN_RESULTS !== 'undefined' && SCAN_RESULTS.length > 0) {
    addReplacementRow();
  }
}

function getFileInfo(filePath) {
  if (typeof SCAN_RESULTS === 'undefined') return null;
  return SCAN_RESULTS.find(r => r.file === filePath) || null;
}

function addReplacementRow() {
  const container = document.getElementById('replacements-container');
  if (!container) return;

  const template = document.getElementById('row-template');
  const clone    = template.content.cloneNode(true);
  const row      = clone.querySelector('.replacement-row');

  row.querySelector('.row-number').textContent = container.children.length + 1;

  // Build file dropdown
  const fileSelect = row.querySelector('.rep-file-select');
  if (typeof SCAN_RESULTS !== 'undefined') {
    SCAN_RESULTS.forEach(sr => {
      const opt = document.createElement('option');
      opt.value       = sr.file;
      opt.textContent = `${sr.file}  [${sr.type}]`;
      fileSelect.appendChild(opt);
    });
  }

  fileSelect.addEventListener('change', function () { onFileChange(this); });

  const keySelect = row.querySelector('.rep-key-select');
  keySelect.addEventListener('change', function () { onKeyChange(this); });

  // Wire up autocomplete
  row.querySelector('.rep-value-input').setAttribute('list', 'prev-values-list');

  // Wire up live preview triggers
  row.querySelector('.rep-find-input').addEventListener('input', function () {
    updatePreview(this.closest('.replacement-row'));
  });
  row.querySelector('.rep-value-input').addEventListener('input', function () {
    updatePreview(this.closest('.replacement-row'));
  });

  container.appendChild(clone);

  if (fileSelect.options.length > 0) onFileChange(fileSelect);

  updateRowCount();
  renumberRows();
}

function onFileChange(select) {
  const row          = select.closest('.replacement-row');
  const keySelect    = row.querySelector('.rep-key-select');
  const fileTypeInp  = row.querySelector('.rep-file-type');
  const findInput    = row.querySelector('.rep-find-input');
  const info         = getFileInfo(select.value);

  keySelect.innerHTML = '<option value="">— select key —</option>';
  fileTypeInp.value   = info ? info.type : '';
  findInput.value     = '';

  if (info && info.keys.length > 0) {
    info.keys.forEach(k => {
      const opt = document.createElement('option');
      opt.value            = k.key;
      opt.dataset.origVal  = k.original_value || '';
      opt.textContent      = k.display || k.key;
      keySelect.appendChild(opt);
    });
    // Auto-select first key
    keySelect.selectedIndex = 1;
    onKeyChange(keySelect);
  }

  updatePreview(row);
}

function onKeyChange(select) {
  const row       = select.closest('.replacement-row');
  const chosen    = select.options[select.selectedIndex];
  const origVal   = chosen ? (chosen.dataset.origVal || '') : '';
  const findInput = row.querySelector('.rep-find-input');

  // Pre-fill Old Value with the scanned sample value
  findInput.value = origVal;

  updatePreview(row);
}

function updatePreview(row) {
  const keySelect  = row.querySelector('.rep-key-select');
  const findInput  = row.querySelector('.rep-find-input');
  const newInput   = row.querySelector('.rep-value-input');
  const previewBar = row.querySelector('.row-preview');

  const key     = keySelect ? keySelect.value : '';
  const oldVal  = findInput ? findInput.value.trim() : '';
  const newVal  = newInput  ? newInput.value.trim()  : '';

  if (!key || (!oldVal && !newVal)) {
    previewBar.style.display = 'none';
    return;
  }

  previewBar.style.display = 'flex';
  previewBar.querySelector('.preview-key').textContent  = key;
  previewBar.querySelector('.preview-old').textContent  = oldVal  || '(any)';
  previewBar.querySelector('.preview-new').textContent  = newVal  || '…';
}

function removeReplacementRow(btn) {
  btn.closest('.replacement-row').remove();
  renumberRows();
  updateRowCount();
}

function renumberRows() {
  document.querySelectorAll('#replacements-container .replacement-row')
    .forEach((row, i) => {
      const num = row.querySelector('.row-number');
      if (num) num.textContent = i + 1;
    });
}

function updateRowCount() {
  const counter = document.getElementById('row-count');
  if (!counter) return;
  const n = document.querySelectorAll('#replacements-container .replacement-row').length;
  counter.textContent = `${n} rule${n === 1 ? '' : 's'}`;
}


// ── Step 3: CSV Join ──────────────────────────────────────────────────────────

function initStep3() {
  onCsvOpChange();
}

function onCsvOpChange() {
  const radios = document.querySelectorAll('input[name="csv_operation"]');
  let selected = 'skip';
  radios.forEach(r => { if (r.checked) selected = r.value; });

  const joinSection   = document.getElementById('join-section');
  const addColSection = document.getElementById('add-col-section');

  if (joinSection)   joinSection.style.display   = selected === 'join'       ? '' : 'none';
  if (addColSection) addColSection.style.display  = selected === 'add_column' ? '' : 'none';
}

async function uploadExternalCsv(input) {
  if (!input.files.length) return;
  const status = document.getElementById('ext-csv-status');
  if (status) status.textContent = 'Uploading…';

  const formData = new FormData();
  formData.append('csv_file', input.files[0]);

  try {
    const resp = await fetch('/api/upload-external-csv', { method: 'POST', body: formData });
    const data = await resp.json();
    if (data.success) {
      if (status) status.textContent = `✓ Loaded (${data.headers.length} columns)`;
      populateExtHeaders(data.headers);
      document.getElementById('ext-join-row').style.display = '';
    } else {
      if (status) status.textContent = 'Upload failed: ' + (data.error || 'Unknown error');
    }
  } catch (e) {
    if (status) status.textContent = 'Upload failed.';
  }
}

function populateExtHeaders(headers) {
  const joinKeySelect   = document.getElementById('join-ext-key');
  const colsToAddSelect = document.getElementById('columns-to-add');

  [joinKeySelect, colsToAddSelect].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '';
    headers.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h; opt.textContent = h;
      sel.appendChild(opt);
    });
  });
}

async function fetchZipCsvHeaders(fileRel, targetSelectId) {
  if (!fileRel) return;
  const sel = document.getElementById(targetSelectId);
  if (!sel) return;
  try {
    const resp = await fetch('/api/zip-csv-headers?file=' + encodeURIComponent(fileRel));
    const data = await resp.json();
    sel.innerHTML = '<option value="">— select column —</option>';
    (data.headers || []).forEach(h => {
      const opt = document.createElement('option');
      opt.value = h; opt.textContent = h;
      sel.appendChild(opt);
    });
  } catch (e) { /* ignore */ }
}


// ── Step 2: Replacements ─────────────────────────────────────────────────────

function initStep2() {
  updateRowCount();
  // Start with one row if the scan found files
  if (typeof SCAN_RESULTS !== 'undefined' && SCAN_RESULTS.length > 0) {
    addReplacementRow();
  }
}

function getFileInfo(filePath) {
  if (typeof SCAN_RESULTS === 'undefined') return null;
  return SCAN_RESULTS.find(r => r.file === filePath) || null;
}

function addReplacementRow() {
  const container = document.getElementById('replacements-container');
  if (!container) return;

  const template = document.getElementById('row-template');
  const clone = template.content.cloneNode(true);

  const row = clone.querySelector('.replacement-row');
  const idx = container.children.length + 1;

  // Set row number
  row.querySelector('.row-number').textContent = idx;

  // Build file dropdown
  const fileSelect = row.querySelector('.rep-file-select');
  if (typeof SCAN_RESULTS !== 'undefined') {
    SCAN_RESULTS.forEach(sr => {
      const opt = document.createElement('option');
      opt.value = sr.file;
      opt.textContent = `${sr.file}  [${sr.type}]`;
      fileSelect.appendChild(opt);
    });
  }

  fileSelect.addEventListener('change', function () { onFileChange(this); });

  const keySelect = row.querySelector('.rep-key-select');
  keySelect.addEventListener('change', function () { onKeyChange(this); });

  // Wire up autocomplete datalist to new value input
  const valInput = row.querySelector('.rep-value-input');
  valInput.setAttribute('list', 'prev-values-list');

  container.appendChild(clone);

  // Trigger population for the first file
  if (fileSelect.options.length > 0) {
    onFileChange(fileSelect);
  }

  updateRowCount();
  renumberRows();
}

function onFileChange(select) {
  const row = select.closest('.replacement-row');
  const keySelect = row.querySelector('.rep-key-select');
  const fileTypeInput = row.querySelector('.rep-file-type');
  const hint = row.querySelector('.current-value-hint');

  const info = getFileInfo(select.value);

  keySelect.innerHTML = '<option value="">— select key —</option>';
  fileTypeInput.value = info ? info.type : '';
  if (hint) hint.textContent = '';
  row.querySelector('.rep-orig-value').value = '';

  if (info && info.keys.length > 0) {
    info.keys.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k.key;
      opt.dataset.origVal = k.original_value || '';
      opt.textContent = k.display || k.key;
      keySelect.appendChild(opt);
    });
  }
}

function onKeyChange(select) {
  const row = select.closest('.replacement-row');
  const chosen = select.options[select.selectedIndex];
  const origVal = chosen ? (chosen.dataset.origVal || '') : '';

  row.querySelector('.rep-orig-value').value = origVal;

  const hint = row.querySelector('.current-value-hint');
  if (hint) {
    hint.textContent = origVal ? `Current: "${origVal}"` : '';
  }
}

function removeReplacementRow(btn) {
  btn.closest('.replacement-row').remove();
  renumberRows();
  updateRowCount();
}

function renumberRows() {
  const rows = document.querySelectorAll('#replacements-container .replacement-row');
  rows.forEach((row, i) => {
    const num = row.querySelector('.row-number');
    if (num) num.textContent = i + 1;
  });
}

function updateRowCount() {
  const counter = document.getElementById('row-count');
  if (!counter) return;
  const n = document.querySelectorAll('#replacements-container .replacement-row').length;
  counter.textContent = `${n} rule${n === 1 ? '' : 's'}`;
}


// ── Step 3: CSV Join ──────────────────────────────────────────────────────────

function initStep3() {
  onCsvOpChange();
}

function onCsvOpChange() {
  const radios = document.querySelectorAll('input[name="csv_operation"]');
  let selected = 'skip';
  radios.forEach(r => { if (r.checked) selected = r.value; });

  const joinSection   = document.getElementById('join-section');
  const addColSection = document.getElementById('add-col-section');

  if (joinSection)   joinSection.style.display   = selected === 'join'       ? '' : 'none';
  if (addColSection) addColSection.style.display  = selected === 'add_column' ? '' : 'none';
}

async function uploadExternalCsv(input) {
  if (!input.files.length) return;
  const status = document.getElementById('ext-csv-status');
  if (status) status.textContent = 'Uploading…';

  const formData = new FormData();
  formData.append('csv_file', input.files[0]);

  try {
    const resp = await fetch('/api/upload-external-csv', { method: 'POST', body: formData });
    const data = await resp.json();

    if (data.success) {
      if (status) status.textContent = `✓ Loaded (${data.headers.length} columns)`;
      populateExtHeaders(data.headers);
      document.getElementById('ext-join-row').style.display = '';
    } else {
      if (status) status.textContent = 'Upload failed: ' + (data.error || 'Unknown error');
    }
  } catch (e) {
    if (status) status.textContent = 'Upload failed.';
  }
}

function populateExtHeaders(headers) {
  const joinKeySelect   = document.getElementById('join-ext-key');
  const colsToAddSelect = document.getElementById('columns-to-add');

  [joinKeySelect, colsToAddSelect].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '';
    headers.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h; opt.textContent = h;
      sel.appendChild(opt);
    });
  });
}

async function fetchZipCsvHeaders(fileRel, targetSelectId) {
  if (!fileRel) return;
  const sel = document.getElementById(targetSelectId);
  if (!sel) return;

  try {
    const resp = await fetch('/api/zip-csv-headers?file=' + encodeURIComponent(fileRel));
    const data = await resp.json();
    sel.innerHTML = '<option value="">— select column —</option>';
    (data.headers || []).forEach(h => {
      const opt = document.createElement('option');
      opt.value = h; opt.textContent = h;
      sel.appendChild(opt);
    });
  } catch (e) { /* silently ignore */ }
}

