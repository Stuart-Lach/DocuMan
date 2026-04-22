import os
import uuid
import json
import shutil

from flask import (
    Flask, render_template, request, session,
    redirect, url_for, send_file, jsonify
)

from utils.zip_handler import extract_zip, repackage_zip
from utils.file_scanner import scan_zip_contents
from utils.replacer import apply_replacements
from utils.csv_joiner import get_csv_files, read_csv_headers, join_csv_columns, add_column

app = Flask(__name__)
app.secret_key = "zip-heading-editor-local-2024"

TEMP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp")
HISTORY_FILE = os.path.join(TEMP_DIR, "history.json")
os.makedirs(TEMP_DIR, exist_ok=True)


# ── Session helpers ──────────────────────────────────────────────────────────

def get_sid():
    return session.get("session_id")


def sid_path(sid, *parts):
    return os.path.join(TEMP_DIR, sid, *parts)


def load_data(sid):
    p = sid_path(sid, "data.json")
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_data(sid, data):
    p = sid_path(sid, "data.json")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_history():
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_history(values):
    existing = load_history()
    for v in values:
        if v and v not in existing:
            existing.append(v)
    existing = existing[-200:]  # keep last 200
    os.makedirs(TEMP_DIR, exist_ok=True)
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False)


# ── Step 1 – Upload ──────────────────────────────────────────────────────────

@app.route("/")
def index():
    session.clear()
    return render_template("index.html", step=1)


@app.route("/upload", methods=["POST"])
def upload():
    if "zip_file" not in request.files:
        return render_template("index.html", step=1, error="No file selected.")

    f = request.files["zip_file"]
    if not f.filename or not f.filename.lower().endswith(".zip"):
        return render_template("index.html", step=1, error="Please upload a valid .zip file.")

    sid = str(uuid.uuid4())
    session["session_id"] = sid
    os.makedirs(sid_path(sid), exist_ok=True)

    zip_path = sid_path(sid, "original.zip")
    f.save(zip_path)

    extract_dir = sid_path(sid, "extracted")
    try:
        extract_zip(zip_path, extract_dir)
    except Exception as e:
        shutil.rmtree(sid_path(sid), ignore_errors=True)
        return render_template("index.html", step=1, error=f"Failed to extract ZIP: {e}")

    scan_results = scan_zip_contents(extract_dir)

    data = {
        "zip_name": f.filename,
        "scan_results": scan_results,
        "selected_files": None,          # None = all selected (set after /select-files)
        "replacements": [],
        "csv_operation": {"operation": "skip"},
        "previous_values": load_history(),
    }
    save_data(sid, data)

    return redirect(url_for("select_files"))


# ── Step 1b – File Selection ─────────────────────────────────────────────────

def build_file_groups(scan_results):
    """Group scan_results by their top-level directory for the file-tree UI."""
    from collections import OrderedDict
    groups = OrderedDict()
    for sr in scan_results:
        parts = sr["file"].split("/")
        top = parts[0] if len(parts) > 1 else "__root__"
        if top not in groups:
            groups[top] = {
                "name": top if top != "__root__" else "Root",
                "is_root": top == "__root__",
                "files": [],
            }
        subpath = "/".join(parts[1:-1])
        groups[top]["files"].append({
            "file":      sr["file"],
            "name":      parts[-1],
            "subpath":   (subpath + "/") if subpath else "",
            "type":      sr["type"],
            "key_count": len(sr.get("keys", [])),
        })
    return list(groups.values())


@app.route("/select-files", methods=["GET"])
def select_files():
    sid = get_sid()
    if not sid:
        return redirect(url_for("index"))
    data        = load_data(sid)
    scan_results = data.get("scan_results", [])
    prev_sel     = data.get("selected_files", None)
    # Default: everything selected; preserve Back-button state if previously set
    selected_set = set(prev_sel) if prev_sel is not None else {sr["file"] for sr in scan_results}
    return render_template(
        "select_files.html",
        step=1,
        file_groups=build_file_groups(scan_results),
        selected_set=selected_set,
        total_files=len(scan_results),
        zip_name=data.get("zip_name", ""),
    )


@app.route("/select-files", methods=["POST"])
def select_files_post():
    sid = get_sid()
    if not sid:
        return redirect(url_for("index"))
    selected = request.form.getlist("selected_file")
    data = load_data(sid)
    data["selected_files"] = selected
    save_data(sid, data)
    return redirect(url_for("step2"))


# ── Step 2 – Replacements ────────────────────────────────────────────────────

@app.route("/step2", methods=["GET"])
def step2():
    sid = get_sid()
    if not sid:
        return redirect(url_for("index"))
    data         = load_data(sid)
    scan_results = data.get("scan_results", [])
    selected     = data.get("selected_files", None)
    # Filter to only the files the user chose on the selection screen
    if selected is not None:
        sel_set      = set(selected)
        scan_results = [r for r in scan_results if r["file"] in sel_set]
    return render_template(
        "step2.html",
        step=2,
        scan_results=scan_results,
        previous_values=data.get("previous_values", []),
    )


@app.route("/step2", methods=["POST"])
def step2_post():
    sid = get_sid()
    if not sid:
        return redirect(url_for("index"))

    rep_files      = request.form.getlist("rep_file")
    rep_keys       = request.form.getlist("rep_key")        # from dropdown (specific file)
    rep_keys_all   = request.form.getlist("rep_key_text")   # from text input  (All mode)
    rep_find_vals  = request.form.getlist("rep_find_value")
    rep_values     = request.form.getlist("rep_new_value")
    rep_types      = request.form.getlist("rep_file_type")

    data            = load_data(sid)
    all_scan        = data.get("scan_results", [])
    selected        = data.get("selected_files", None)
    active_files    = set(selected) if selected is not None else {r["file"] for r in all_scan}
    file_type_map   = {r["file"]: r["type"] for r in all_scan}
    previous_values = data.get("previous_values", [])
    replacements    = []

    for i in range(len(rep_files)):
        # Resolve key: prefer the text-input value when in "All" mode
        target = rep_files[i] if i < len(rep_files) else ""
        key    = (rep_keys_all[i] if i < len(rep_keys_all) else "").strip() \
                 if target == "_ALL_" else \
                 (rep_keys[i] if i < len(rep_keys) else "").strip()
        val       = (rep_values[i]    if i < len(rep_values)    else "").strip()
        find_val  = (rep_find_vals[i] if i < len(rep_find_vals) else "").strip()

        if not key or not val:
            continue

        if target == "_ALL_":
            # Expand to every active file
            for sel_file in sorted(active_files):
                replacements.append({
                    "file":           sel_file,
                    "key":            key,
                    "find_value":     find_val,
                    "original_value": find_val,
                    "new_value":      val,
                    "file_type":      file_type_map.get(sel_file, ""),
                })
        else:
            replacements.append({
                "file":           target,
                "key":            key,
                "find_value":     find_val,
                "original_value": find_val,
                "new_value":      val,
                "file_type":      rep_types[i] if i < len(rep_types) else "",
            })

        if val not in previous_values:
            previous_values.append(val)

    data["replacements"] = replacements
    data["previous_values"] = previous_values
    save_data(sid, data)
    save_history(previous_values)

    return redirect(url_for("step3"))


# ── Step 3 – CSV Join ────────────────────────────────────────────────────────

@app.route("/step3", methods=["GET"])
def step3():
    sid = get_sid()
    if not sid:
        return redirect(url_for("index"))
    extract_dir = sid_path(sid, "extracted")
    csv_files = get_csv_files(extract_dir) if os.path.exists(extract_dir) else []
    return render_template("step3.html", step=3, csv_files=csv_files)


@app.route("/api/upload-external-csv", methods=["POST"])
def api_upload_external_csv():
    sid = get_sid()
    if not sid:
        return jsonify({"success": False, "error": "Session expired"})
    if "csv_file" not in request.files:
        return jsonify({"success": False, "error": "No file provided"})
    f = request.files["csv_file"]
    path = sid_path(sid, "external.csv")
    f.save(path)
    headers = read_csv_headers(path)
    return jsonify({"success": True, "headers": headers})


@app.route("/api/zip-csv-headers")
def api_zip_csv_headers():
    sid = get_sid()
    if not sid:
        return jsonify({"headers": []})
    file_rel = request.args.get("file", "")
    extract_dir = sid_path(sid, "extracted")
    full = os.path.normpath(os.path.join(extract_dir, *file_rel.split("/")))
    if os.path.exists(full):
        return jsonify({"headers": read_csv_headers(full)})
    return jsonify({"headers": []})


@app.route("/step3", methods=["POST"])
def step3_post():
    sid = get_sid()
    if not sid:
        return redirect(url_for("index"))

    operation = request.form.get("csv_operation", "skip")
    csv_op = {"operation": operation}

    if operation == "join":
        csv_op["target_csv"] = request.form.get("target_csv", "")
        csv_op["join_key_target"] = request.form.get("join_key_target", "")
        csv_op["join_key_external"] = request.form.get("join_key_external", "")
        csv_op["columns_to_add"] = request.form.getlist("columns_to_add")
    elif operation == "add_column":
        csv_op["target_csv"] = request.form.get("target_csv", "")
        csv_op["new_column_name"] = request.form.get("new_column_name", "")
        csv_op["default_value"] = request.form.get("default_value", "")

    data = load_data(sid)
    data["csv_operation"] = csv_op
    save_data(sid, data)

    return redirect(url_for("step4"))


# ── Step 4 – Review ──────────────────────────────────────────────────────────

@app.route("/step4", methods=["GET"])
def step4():
    sid = get_sid()
    if not sid:
        return redirect(url_for("index"))
    data = load_data(sid)
    return render_template(
        "step4.html",
        step=4,
        replacements=data.get("replacements", []),
        csv_operation=data.get("csv_operation", {"operation": "skip"}),
    )


@app.route("/step4", methods=["POST"])
def step4_post():
    sid = get_sid()
    if not sid:
        return redirect(url_for("index"))

    data = load_data(sid)
    extract_dir = sid_path(sid, "extracted")
    all_reps = data.get("replacements", [])
    csv_op = data.get("csv_operation", {"operation": "skip"})

    checked = set(int(i) for i in request.form.getlist("checked_replacement"))
    active_reps = [r for i, r in enumerate(all_reps) if i in checked]

    if active_reps:
        apply_replacements(extract_dir, active_reps)

    if csv_op.get("operation") == "join":
        ext_csv = sid_path(sid, "external.csv")
        if os.path.exists(ext_csv):
            join_csv_columns(
                extract_dir,
                csv_op["target_csv"],
                ext_csv,
                csv_op["join_key_target"],
                csv_op["join_key_external"],
                csv_op["columns_to_add"],
            )
    elif csv_op.get("operation") == "add_column":
        add_column(
            extract_dir,
            csv_op["target_csv"],
            csv_op["new_column_name"],
            csv_op.get("default_value", ""),
        )

    output_zip = sid_path(sid, "output.zip")
    repackage_zip(extract_dir, output_zip)

    data["output_zip"] = output_zip
    save_data(sid, data)

    return redirect(url_for("step5"))


# ── Step 5 – Download ────────────────────────────────────────────────────────

@app.route("/step5", methods=["GET"])
def step5():
    sid = get_sid()
    if not sid:
        return redirect(url_for("index"))
    data = load_data(sid)
    zip_name = data.get("zip_name", "output.zip")
    return render_template("step5.html", step=5,
                           output_name="updated_" + zip_name,
                           zip_name=zip_name)


@app.route("/download")
def download():
    sid = get_sid()
    if not sid:
        return redirect(url_for("index"))
    data = load_data(sid)
    output_zip = data.get("output_zip", "")
    zip_name = data.get("zip_name", "output.zip")
    if not output_zip or not os.path.exists(output_zip):
        return redirect(url_for("step4"))
    return send_file(output_zip, as_attachment=True,
                     download_name="updated_" + zip_name)


# ── Reset ────────────────────────────────────────────────────────────────────

@app.route("/reset")
def reset():
    sid = get_sid()
    if sid:
        shutil.rmtree(sid_path(sid), ignore_errors=True)
    session.clear()
    return redirect(url_for("index"))


if __name__ == "__main__":
    app.run(debug=True, port=5000)

