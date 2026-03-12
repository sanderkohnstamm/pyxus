"""
bootstrap.py — Python startup script for embedded iOS backend.

Called by PythonRunner.swift after CPython is initialized.
Configures sys.path to include the bundled backend directory,
then starts uvicorn serving the FastAPI app.

Phase 2: This will run inside the embedded CPython interpreter.
For now it serves as documentation of the intended startup sequence.
"""

import os
import sys


def main():
    # The backend/ directory is bundled as a resource in the app
    bundle_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(bundle_dir, "..", "backend")

    # Add backend to Python path so imports work (drone, mission, weather, etc.)
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)

    # Set working directory to backend so relative paths (settings.json etc.) work
    os.chdir(backend_dir)

    # Start uvicorn
    import uvicorn
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        log_level="info",
        # Single worker on mobile — no need for multiprocessing
        workers=1,
        # Disable reload on mobile
        reload=False,
    )


if __name__ == "__main__":
    main()
