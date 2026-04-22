import os
import csv


def _full(extract_dir, rel_path):
    return os.path.normpath(os.path.join(extract_dir, *rel_path.split("/")))


def get_csv_files(extract_dir):
    """Return list of relative paths for CSV files inside extract_dir."""
    result = []
    for root, dirs, files in os.walk(extract_dir):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for f in files:
            if f.lower().endswith(".csv"):
                rel = os.path.relpath(os.path.join(root, f), extract_dir).replace("\\", "/")
                result.append(rel)
    return result


def read_csv_headers(file_path):
    """Return the first row (headers) of a CSV file."""
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace", newline="") as f:
            reader = csv.reader(f)
            return next(reader, [])
    except Exception:
        return []


def join_csv_columns(extract_dir, target_rel, external_csv_path,
                     join_key_target, join_key_external, columns_to_add):
    """
    Join columns from an external CSV into the target CSV inside extract_dir.
    Matches rows by join_key_target (in target) == join_key_external (in external).
    """
    target_path = _full(extract_dir, target_rel)

    # Read target
    with open(target_path, "r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        target_rows = list(reader)
        target_headers = list(reader.fieldnames or [])

    # Read external
    with open(external_csv_path, "r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        external_rows = list(reader)

    # Build lookup from external
    lookup = {}
    for row in external_rows:
        k = row.get(join_key_external, "")
        lookup[k] = row

    # Build new headers
    new_headers = list(target_headers)
    for col in columns_to_add:
        if col not in new_headers:
            new_headers.append(col)

    # Merge
    updated = []
    for row in target_rows:
        new_row = dict(row)
        ext_row = lookup.get(row.get(join_key_target, ""), {})
        for col in columns_to_add:
            new_row[col] = ext_row.get(col, "")
        updated.append(new_row)

    with open(target_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=new_headers)
        writer.writeheader()
        writer.writerows(updated)


def add_column(extract_dir, target_rel, column_name, default_value=""):
    """Add a new column with a default value to a CSV inside extract_dir."""
    target_path = _full(extract_dir, target_rel)

    with open(target_path, "r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        headers = list(reader.fieldnames or [])

    if column_name in headers:
        return  # already exists

    new_headers = headers + [column_name]
    for row in rows:
        row[column_name] = default_value

    with open(target_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=new_headers)
        writer.writeheader()
        writer.writerows(rows)

