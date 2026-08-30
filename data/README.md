# Data directory

This project keeps raw inputs, processed datasets, annotation files, and train/test splits under the repository-managed data tree.

## Structure

- `raw/` — original source images / telemetry / export artifacts
- `processed/` — cleaned or merged outputs
- `processed/splits/` — train/validation/test split manifests or files
- `annotations/` — labeled datasets and metadata

## Notes

- Keep all generated datasets under version control only when they are intentionally small and portable.
- Large files should be stored in external storage or mounted volumes for local runs.
