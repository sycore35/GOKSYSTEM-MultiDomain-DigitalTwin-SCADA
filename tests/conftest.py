"""Test isolation: platform databases go to a temp dir, never into the project's data/ folder."""
import os
import tempfile

os.environ.setdefault("GOKSYSTEM_DATA_DIR", tempfile.mkdtemp(prefix="goksystem_test_"))
