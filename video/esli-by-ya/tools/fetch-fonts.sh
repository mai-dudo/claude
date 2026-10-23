#!/usr/bin/env bash
# Downloads Google Sans and Material Symbols Rounded from Google Fonts into scene/fonts/
# (the files are not committed). Run once before rendering.
set -euo pipefail
cd "$(dirname "$0")/../scene"
mkdir -p fonts
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

# Icon names must be sorted for the icon_names subset parameter.
# Icons used as plain strings in app.js (arrays and maps) are listed in EXTRA.
EXTRA="assignment_turned_in balance badge cleaning_services elderly gavel park water_drop"
ICONS=$( { grep -ohE '"icon": "[a-z0-9_]+"|icon\("[a-z0-9_]+"' ../story.json app.js | grep -oE '"[a-z0-9_]+"$' | tr -d '"'; \
  tr ' ' '\n' <<< "$EXTRA"; } | sort -u | paste -sd, -)
echo "icons: $ICONS"

fetch_css() { # $1 = css2 query, $2 = output css file
  curl -sS -A "$UA" "https://fonts.googleapis.com/css2?$1&display=block" > "fonts/$2.src.css"
  python3 - "fonts/$2.src.css" "fonts/$2.css" <<'EOF'
import re, sys, urllib.request, hashlib, os
src, dst = sys.argv[1], sys.argv[2]
css = open(src).read()
blocks = re.findall(r'(/\* ([\w-]+) \*/\s*)?(@font-face \{.*?\})', css, re.S)
keep = []
for _, subset, block in blocks:
    if subset and subset not in ('latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'):
        continue
    url = re.search(r'url\((https://[^)]+)\)', block).group(1)
    name = hashlib.sha1(url.encode()).hexdigest()[:12] + '.woff2'
    path = os.path.join(os.path.dirname(dst), name)
    if not os.path.exists(path):
        urllib.request.urlretrieve(url, path)
    keep.append(block.replace(url, name))
open(dst, 'w').write('\n'.join(keep) + '\n')
os.remove(src)
print(dst, len(keep), 'faces')
EOF
}

fetch_css "family=Google+Sans:wght@400;500;700" google-sans
fetch_css "family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400..600,0..1,0&icon_names=$ICONS" symbols
cat fonts/google-sans.css fonts/symbols.css > fonts/fonts.css
echo "fonts ready in scene/fonts/"
