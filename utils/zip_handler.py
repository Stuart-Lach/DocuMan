import zipfile
import os


def extract_zip(zip_path, extract_dir):
    """Extract a ZIP archive to extract_dir, preserving structure."""
    os.makedirs(extract_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(extract_dir)


def repackage_zip(source_dir, output_zip_path):
    """Re-pack all files under source_dir into a new ZIP at output_zip_path."""
    with zipfile.ZipFile(output_zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(source_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, source_dir).replace("\\", "/")
                z.write(file_path, arcname)

