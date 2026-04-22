import os
import csv
import json
import re
import configparser
from xml.etree import ElementTree as ET

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False


def _full(extract_dir, rel_path):
    """Convert a forward-slash relative path to an OS absolute path."""
    return os.path.normpath(os.path.join(extract_dir, *rel_path.split("/")))


def _fv(rep):
    """Return the find_value for a replacement, falling back to original_value."""
    return rep.get("find_value") or rep.get("original_value") or ""


def apply_replacements(extract_dir, replacements):
    """Apply a list of replacement dicts to files inside extract_dir."""
    by_file = {}
    for r in replacements:
        by_file.setdefault(r["file"], []).append(r)

    for rel_path, reps in by_file.items():
        full_path = _full(extract_dir, rel_path)
        if not os.path.exists(full_path):
            continue
        ext = os.path.splitext(rel_path)[1].lower()
        try:
            if ext == ".csv":
                _apply_csv(full_path, reps)
            elif ext in (".ini", ".cfg"):
                _apply_ini(full_path, reps)
            elif ext == ".json":
                _apply_json(full_path, reps)
            elif ext in (".yaml", ".yml"):
                _apply_yaml(full_path, reps)
            elif ext == ".xml":
                _apply_xml(full_path, reps)
            elif ext == ".txt":
                _apply_txt(full_path, reps)
        except Exception:
            pass


# ── CSV helpers (mirrors file_scanner) ───────────────────────────────────────

def _csv_encoding(file_path):
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            with open(file_path, "r", encoding=enc, errors="strict", newline="") as f:
                f.read(8192)
            return enc
        except (UnicodeDecodeError, UnicodeError):
            continue
    return "latin-1"


def _csv_dialect(file_path, encoding):
    try:
        with open(file_path, "r", encoding=encoding, errors="replace", newline="") as f:
            sample = f.read(8192)
        return csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        return None


# ── CSV ──────────────────────────────────────────────────────────────────────
# Strategy:
#   • key        = column name
#   • find_value = cell value to search for within that column
#   • new_value  = replacement cell value
#   • If find_value == key  → rename the header itself
#   • Otherwise             → replace matching cell values inside that column only

def _apply_csv(file_path, reps):
    enc     = _csv_encoding(file_path)
    dialect = _csv_dialect(file_path, enc)

    with open(file_path, "r", encoding=enc, errors="replace", newline="") as f:
        reader  = csv.DictReader(f, dialect=dialect) if dialect else csv.DictReader(f)
        rows    = list(reader)
        headers = list(reader.fieldnames or [])

    for rep in reps:
        col      = rep["key"]
        find_val = _fv(rep)
        new_val  = rep["new_value"]

        if col not in headers:
            continue

        if find_val == col or not find_val:
            # ── Rename the column header ──
            idx = headers.index(col)
            headers[idx] = new_val
            for row in rows:
                if col in row:
                    row[new_val] = row.pop(col)
        else:
            # ── Replace matching cell values inside this column only ──
            for row in rows:
                if row.get(col) == find_val:
                    row[col] = new_val

    with open(file_path, "w", encoding=enc, newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers,
                                **({"dialect": dialect} if dialect else {}))
        writer.writeheader()
        writer.writerows(rows)


# ── INI ───────────────────────────────────────────────────────────────────────

def _apply_ini(file_path, reps):
    config = configparser.ConfigParser()
    config.read(file_path, encoding="utf-8")
    for rep in reps:
        parts = rep["key"].split(".", 1)
        if len(parts) != 2:
            continue
        section, key = parts
        if not (config.has_section(section) and config.has_option(section, key)):
            continue
        find_val = _fv(rep)
        current  = config.get(section, key)
        # Only replace if find_value matches (or was not specified)
        if not find_val or current == find_val:
            config.set(section, key, rep["new_value"])
    with open(file_path, "w", encoding="utf-8") as f:
        config.write(f)


# ── JSON ──────────────────────────────────────────────────────────────────────

def _apply_json(file_path, reps):
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    for rep in reps:
        _set_nested(data, rep["key"].split("."), rep["new_value"], _fv(rep))
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _set_nested(obj, path, value, find_val=""):
    if not path:
        return
    key = path[0]
    m = re.match(r"^(.*)\[(\d+)\]$", key)
    if m:
        real_key, idx = m.group(1), int(m.group(2))
        target = obj.get(real_key) if isinstance(obj, dict) and real_key else obj
        if isinstance(target, list) and idx < len(target):
            if len(path) == 1:
                if not find_val or str(target[idx]) == find_val:
                    target[idx] = value
            else:
                _set_nested(target[idx], path[1:], value, find_val)
    elif isinstance(obj, dict) and key in obj:
        if len(path) == 1:
            if not find_val or str(obj[key]) == find_val:
                obj[key] = value
        else:
            _set_nested(obj[key], path[1:], value, find_val)


# ── YAML ──────────────────────────────────────────────────────────────────────

def _apply_yaml(file_path, reps):
    if not HAS_YAML:
        return
    with open(file_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    for rep in reps:
        _set_nested(data, rep["key"].split("."), rep["new_value"], _fv(rep))
    with open(file_path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True)


# ── XML ───────────────────────────────────────────────────────────────────────

def _apply_xml(file_path, reps):
    tree = ET.parse(file_path)
    root = tree.getroot()

    def tag_name(elem):
        t = elem.tag
        return t.split("}")[-1] if "}" in t else t

    for rep in reps:
        key      = rep["key"]
        new_val  = rep["new_value"]
        find_val = _fv(rep)

        if "@" in key:
            path_part, attr = key.rsplit("@", 1)
            target_tag = path_part.split("/")[-1]
            for elem in root.iter():
                if tag_name(elem) == target_tag and attr in elem.attrib:
                    if not find_val or elem.attrib[attr] == find_val:
                        elem.set(attr, new_val)
        else:
            target_tag = key.split("/")[-1]
            for elem in root.iter():
                if tag_name(elem) == target_tag:
                    if not find_val or (elem.text and elem.text.strip() == find_val):
                        elem.text = new_val
                        break

    tree.write(file_path, encoding="unicode", xml_declaration=False)


# ── TXT ───────────────────────────────────────────────────────────────────────
# Strategy:
#   1. Try  key = find_value  →  key = new_value   (exact value match)
#   2. Try  key: find_value   →  key: new_value
#   3. If find_value not given, replace whatever value the key currently has.
#   4. For headings (key IS the text), do a whole-line exact match only.
#   ⚠ NO global content.replace() fallback — prevents unintended replacements.

def _apply_txt(file_path, reps):
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    for rep in reps:
        key      = rep["key"]
        new_val  = rep["new_value"]
        find_val = _fv(rep)

        # Build value sub-pattern: exact find_val or any non-empty value
        val_pat = re.escape(find_val) if find_val else r".+"

        # ── key = value ──
        pat = re.compile(
            r"^(" + re.escape(key) + r"\s*=\s*)" + val_pat + r"(\s*)$",
            re.MULTILINE,
        )
        if pat.search(content):
            content = pat.sub(lambda m: m.group(1) + new_val + m.group(2), content)
            continue

        # ── key: value ──
        pat = re.compile(
            r"^(" + re.escape(key) + r"\s*:\s*)" + val_pat + r"(\s*)$",
            re.MULTILINE,
        )
        if pat.search(content):
            content = pat.sub(lambda m: m.group(1) + new_val + m.group(2), content)
            continue

        # ── Heading: whole-line exact match only ──
        if find_val and key == find_val:
            pat = re.compile(r"^" + re.escape(find_val) + r"\s*$", re.MULTILINE)
            content = pat.sub(new_val, content)
        # ← No fallback global replace.

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
