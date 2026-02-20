"""Shared test fixtures for backend tests."""

import sys
import os

# Add the backend directory to the Python path so we can import modules directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
