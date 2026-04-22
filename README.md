# ZIP Heading Editor

A local Flask web app for editing headings, keys, and CSV columns inside a ZIP archive — without extracting it manually.

---

## Features

- **Upload any ZIP** and automatically detect editable content
- **Supported file types:** `txt`, `csv`, `json`, `xml`, `ini`, `cfg`, `yaml`, `yml`
- **Multi-step wizard** with Absa-inspired UI
- **Step 1 – Upload ZIP:** drag-and-drop or browse
- **Step 2 – Replacements:** add multiple find/replace rules with autocomplete for previous values
- **Step 3 – CSV Join:** merge columns from an external CSV or add a blank column
- **Step 4 – Review:** checkbox-based confirmation before applying changes
- **Step 5 – Download:** get the patched ZIP instantly
- All processing happens **locally** — files never leave your machine

---

## Quick Start

### 1. Prerequisites

- Python 3.9+
- pip

### 2. Install dependencies

```bash
cd C:\Users\adria\DocuMan
pip install -r requirements.txt
```

### 3. Run

```bash
python app.py
```

Open your browser at: **http://127.0.0.1:5000**

---

## Project Structure

```
DocuMan/
├── app.py                  # Flask routes and session management
├── requirements.txt
├── README.md
├── utils/
│   ├── __init__.py
│   ├── zip_handler.py      # Extract / repackage ZIP
│   ├── file_scanner.py     # Detect keys, headings, CSV headers
│   ├── replacer.py         # Apply text replacements per file type
│   └── csv_joiner.py       # CSV join / add-column operations
├── templates/
│   ├── base.html           # Shared layout + wizard stepper
│   ├── index.html          # Step 1 – Upload
│   ├── step2.html          # Step 2 – Replacements
│   ├── step3.html          # Step 3 – CSV Join
│   ├── step4.html          # Step 4 – Review
│   └── step5.html          # Step 5 – Download
├── static/
│   ├── css/style.css       # Absa-inspired UI styles
│   └── js/wizard.js        # Dynamic dropdowns, autocomplete, AJAX
└── temp/                   # Auto-created; one folder per session
```

---

## How It Works

| Step | What happens |
|------|-------------|
| 1 | ZIP is saved and extracted to `temp/<session-id>/extracted/` |
| 2 | Files are scanned; you define replacement rules (file → key → new value) |
| 3 | Optionally upload an external CSV to join/merge columns |
| 4 | Review all pending changes with checkboxes; confirm to apply |
| 5 | A new ZIP is packaged from the modified files and offered for download |

---

## Detection Logic

| File Type | What is detected |
|-----------|-----------------|
| CSV | Column headers (first row) |
| INI / CFG | `[section] key = value` pairs |
| JSON | All scalar key paths (dot notation) |
| YAML / YML | All scalar key paths |
| XML | Element text content and attributes |
| TXT | `key = value`, `key: value`, and heading-like lines |

---

## Notes

- Session data is stored in `temp/` — safe to delete any subfolder to free space
- `temp/history.json` stores your previous replacement values for autocomplete across sessions
- The app runs in Flask debug mode on port 5000 by default

