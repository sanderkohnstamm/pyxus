"""
bootstrap.py — Python startup script for embedded iOS backend.

Called by PythonRunner.swift after CPython is initialized.
Uses PYXUS_DATA_DIR (set by Swift) to locate the bundled backend,
then starts uvicorn serving the FastAPI app.
"""

import os
import sys


def main():
    data_dir = os.environ.get("PYXUS_DATA_DIR")
    if data_dir:
        backend_dir = os.path.join(data_dir, "backend")
    else:
        bundle_dir = os.path.dirname(os.path.abspath(__file__))
        backend_dir = os.path.join(bundle_dir, "..", "backend")

    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)

    os.chdir(backend_dir)

    import uvicorn
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        log_level="info",
        workers=1,
        reload=False,
    )


if __name__ == "__main__":
    main()
