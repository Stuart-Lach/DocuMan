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


# ── CSV ─────────────────────────────────────────────────────────────────────

def _apply_csv(file_path, reps):
    with open(file_path, "r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.reader(f)
        rows = list(reader)
    if not rows:
        return
    headers = rows[0]
    for rep in reps:
        old_key = rep["key"]
        new_val = rep["new_value"]
        if old_key in headers:
            headers[headers.index(old_key)] = new_val
    rows[0] = headers
    with open(file_path, "w", encoding="utf-8", newline="") as f:
        csv.writer(f).writerows(rows)


# ── INI ──────────────────────────────────────────────────────────────────────

def _apply_ini(file_path, reps):
    config = configparser.ConfigParser()
    config.read(file_path, encoding="utf-8")
    for rep in reps:
        parts = rep["key"].split(".", 1)
        if len(parts) == 2:
            section, key = parts
            if config.has_section(section) and config.has_option(section, key):
                config.set(section, key, rep["new_value"])
    with open(file_path, "w", encoding="utf-8") as f:
        config.write(f)


# ── JSON ─────────────────────────────────────────────────────────────────────

def _apply_json(file_path, reps):
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    for rep in reps:
        _set_nested(data, rep["key"].split("."), rep["new_value"])
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _set_nested(obj, path, value):
    if not path:
        return
    key = path[0]
    # Handle array index like key[0]
    m = re.match(r"^(.*)\[(\d+)\]$", key)
    if m:
        real_key, idx = m.group(1), int(m.group(2))
        target = obj.get(real_key) if isinstance(obj, dict) and real_key else obj
        if isinstance(target, list) and idx < len(target):
            if len(path) == 1:
                target[idx] = value
            else:
                _set_nested(target[idx], path[1:], value)
    elif isinstance(obj, dict) and key in obj:
        if len(path) == 1:
            obj[key] = value
        else:
            _set_nested(obj[key], path[1:], value)


# ── YAML ─────────────────────────────────────────────────────────────────────

def _apply_yaml(file_path, reps):
    if not HAS_YAML:
        return
    with open(file_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    for rep in reps:
        _set_nested(data, rep["key"].split("."), rep["new_value"])
    with open(file_path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True)


# ── XML ──────────────────────────────────────────────────────────────────────

def _apply_xml(file_path, reps):
    tree = ET.parse(file_path)
    root = tree.getroot()

    def tag_name(elem):
        t = elem.tag
        return t.split("}")[-1] if "}" in t else t

    for rep in reps:
        key = rep["key"]
        new_val = rep["new_value"]
        if "@" in key:
            path_part, attr = key.rsplit("@", 1)
            target_tag = path_part.split("/")[-1]
            for elem in root.iter():
                if tag_name(elem) == target_tag:
                    if attr in elem.attrib:
                        elem.set(attr, new_val)
        else:
            target_tag = key.split("/")[-1]
            for elem in root.iter():
                if tag_name(elem) == target_tag:
                    elem.text = new_val
                    break

    tree.write(file_path, encoding="unicode", xml_declaration=False)


# ── TXT ──────────────────────────────────────────────────────────────────────

def _apply_txt(file_path, reps):
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    for rep in reps:
        key = rep["key"]
        new_val = rep["new_value"]
        orig_val = rep.get("original_value", "")

        # key = value
        pattern = re.compile(
            r"^(" + re.escape(key) + r"\s*=\s*)(.+)$", re.MULTILINE
        )
        if pattern.search(content):
            content = pattern.sub(r"\g<1>" + new_val.replace("\\", r"\\"), content)
            continue

        # key: value
        pattern = re.compile(
            r"^(" + re.escape(key) + r"\s*:\s*)(.+)$", re.MULTILINE
        )
        if pattern.search(content):
            content = pattern.sub(r"\g<1>" + new_val.replace("\\", r"\\"), content)
            continue

        # Heading / direct text replacement
        if orig_val and orig_val in content:
            content = content.replace(orig_val, new_val)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

