import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MANIFEST_PATH = os.path.join(BASE_DIR, 'public/manifest.json')

with open(MANIFEST_PATH, encoding='utf-8') as manifest_file:
    manifest = json.load(manifest_file)

print("%s_%s.zip" % (os.path.basename(BASE_DIR), manifest.get('version')))
