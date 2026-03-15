"""
Bootstrap script for embedded CPython on iOS.
Executed by PythonRunner.swift via PyRun_SimpleString.
Starts uvicorn with the FastAPI app.
"""
import uvicorn
from main import app

uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
