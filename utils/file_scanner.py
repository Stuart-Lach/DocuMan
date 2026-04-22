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

SUPPORTED_EXTENSIONS = {".txt", ".csv", ".json", ".xml", ".ini", ".cfg", ".yaml", ".yml"}
MAX_KEYS = 200  # safety cap per file


def scan_zip_contents(extract_dir):
    """Walk extract_dir and return a list of file-info dicts."""
    results = []
    for root, dirs, files in os.walk(extract_dir):
        # Skip hidden/system directories
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext not in SUPPORTED_EXTENSIONS:
                continue
            file_path = os.path.join(root, file)
            rel = os.path.relpath(file_path, extract_dir).replace("\\", "/")
            try:
                info = _scan_file(file_path, rel, ext)
                if info and info.get("keys"):
                    results.append(info)
            except Exception:
                pass
    return results


def _scan_file(file_path, relative_path, ext):
    if ext == ".csv":
        return _scan_csv(file_path, relative_path)
    elif ext in (".ini", ".cfg"):
        return _scan_ini(file_path, relative_path)
    elif ext == ".json":
        return _scan_json(file_path, relative_path)
    elif ext in (".yaml", ".yml"):
        return _scan_yaml(file_path, relative_path)
    elif ext == ".xml":
        return _scan_xml(file_path, relative_path)
    elif ext == ".txt":
        return _scan_txt(file_path, relative_path)
    return None


# ── CSV ─────────────────────────────────────────────────────────────────────

def _scan_csv(file_path, relative_path):
    with open(file_path, "r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.reader(f)
        headers = next(reader, [])
    keys = [
        {"key": h, "original_value": h, "display": f"Column: {h}"}
        for h in headers if h.strip()
    ]
    return {"file": relative_path, "type": "csv", "keys": keys[:MAX_KEYS]}


# ── INI / CFG ────────────────────────────────────────────────────────────────

def _scan_ini(file_path, relative_path):
    config = configparser.ConfigParser()
    config.read(file_path, encoding="utf-8")
    keys = []
    for section in config.sections():
        for key, value in config.items(section):
            keys.append({
                "key": f"{section}.{key}",
                "original_value": value,
                "display": f"[{section}] {key} = {value}"
            })
    return {"file": relative_path, "type": "ini", "keys": keys[:MAX_KEYS]} if keys else None


# ── JSON ─────────────────────────────────────────────────────────────────────

def _scan_json(file_path, relative_path):
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        data = json.load(f)
    keys = []

    def flatten(obj, prefix=""):
        if isinstance(obj, dict):
            for k, v in obj.items():
                nk = f"{prefix}.{k}" if prefix else str(k)
                if isinstance(v, (str, int, float, bool, type(None))):
                    keys.append({"key": nk, "original_value": str(v) if v is not None else "",
                                 "display": f"{nk} = {v}"})
                else:
                    if len(keys) < MAX_KEYS:
                        flatten(v, nk)
        elif isinstance(obj, list):
            for i, item in enumerate(obj[:20]):
                if len(keys) >= MAX_KEYS:
                    break
                flatten(item, f"{prefix}[{i}]")

    flatten(data)
    return {"file": relative_path, "type": "json", "keys": keys[:MAX_KEYS]} if keys else None


# ── YAML ─────────────────────────────────────────────────────────────────────

def _scan_yaml(file_path, relative_path):
    if not HAS_YAML:
        return None
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        data = yaml.safe_load(f)
    if not data:
        return None
    keys = []

    def flatten(obj, prefix=""):
        if isinstance(obj, dict):
            for k, v in obj.items():
                nk = f"{prefix}.{k}" if prefix else str(k)
                if isinstance(v, (str, int, float, bool, type(None))):
                    keys.append({"key": nk, "original_value": str(v) if v is not None else "",
                                 "display": f"{nk}: {v}"})
                else:
                    if len(keys) < MAX_KEYS:
                        flatten(v, nk)
        elif isinstance(obj, list):
            for i, item in enumerate(obj[:20]):
                if len(keys) >= MAX_KEYS:
                    break
                flatten(item, f"{prefix}[{i}]")

    flatten(data)
    return {"file": relative_path, "type": "yaml", "keys": keys[:MAX_KEYS]} if keys else None


# ── XML ──────────────────────────────────────────────────────────────────────

def _scan_xml(file_path, relative_path):
    tree = ET.parse(file_path)
    root = tree.getroot()
    keys = []

    def traverse(elem, prefix=""):
        if len(keys) >= MAX_KEYS:
            return
        raw_tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
        path = f"{prefix}/{raw_tag}" if prefix else raw_tag
        if elem.text and elem.text.strip():
            keys.append({"key": path, "original_value": elem.text.strip(),
                         "display": f"{path} = {elem.text.strip()}"})
        for attr_k, attr_v in elem.attrib.items():
            keys.append({"key": f"{path}@{attr_k}", "original_value": attr_v,
                         "display": f"{path}@{attr_k} = {attr_v}"})
        for child in elem:
            traverse(child, path)

    traverse(root)
    return {"file": relative_path, "type": "xml", "keys": keys[:MAX_KEYS]} if keys else None


# ── TXT ──────────────────────────────────────────────────────────────────────

def _scan_txt(file_path, relative_path):
    keys = []
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            if len(keys) >= MAX_KEYS:
                break
            line = line.rstrip("\n\r")
            stripped = line.strip()
            if not stripped:
                continue
            # key = value
            m = re.match(r"^([A-Za-z_][A-Za-z0-9_.\s\-]*?)\s*=\s*(.+)$", stripped)
            if m:
                keys.append({"key": m.group(1).strip(), "original_value": m.group(2).strip(),
                             "display": stripped})
                continue
            # key: value
            m = re.match(r"^([A-Za-z_][A-Za-z0-9_.\s\-]*?)\s*:\s*(.+)$", stripped)
            if m:
                keys.append({"key": m.group(1).strip(), "original_value": m.group(2).strip(),
                             "display": stripped})
                continue
            # Markdown heading
            if re.match(r"^#{1,6}\s+.+", stripped):
                keys.append({"key": stripped, "original_value": stripped,
                             "display": f"Heading: {stripped}"})
            # ALL-CAPS heading
            elif re.match(r"^[A-Z][A-Z\s\-_]{3,}$", stripped):
                keys.append({"key": stripped, "original_value": stripped,
                             "display": f"Heading: {stripped}"})
    return {"file": relative_path, "type": "txt", "keys": keys} if keys else None

