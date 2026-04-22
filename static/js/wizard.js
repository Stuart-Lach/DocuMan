/* wizard.js — client-side logic for all wizard steps */

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

