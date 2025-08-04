import sys
import os

# Ensure project directory is on the path
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
if PROJECT_DIR not in sys.path:
    sys.path.insert(0, PROJECT_DIR)

# Expose Flask app as "application" for WSGI servers (PythonAnywhere)
from app import app as application