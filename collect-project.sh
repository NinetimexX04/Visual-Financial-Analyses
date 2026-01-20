#!/bin/bash

# Collect important project files for context sharing
# Usage: ./collect-project.sh | pbcopy  (or just ./collect-project.sh if pbcopy is in the script)

OUTPUT=""

# Function to add file with header
add_file() {
    if [ -f "$1" ]; then
        OUTPUT+="
=== $1 ===
"
        OUTPUT+="$(cat "$1")"
        OUTPUT+="
"
    fi
}

# Root config files
add_file "firebase.json"
add_file "README.md"

# Client source files
add_file "client/src/App.jsx"
add_file "client/src/api.js"
add_file "client/src/firebase.js"
add_file "client/src/main.jsx"
add_file "client/src/index.css"
add_file "client/src/App.css"

# Client pages
add_file "client/src/pages/Dashboard.jsx"
add_file "client/src/pages/Login.jsx"
add_file "client/src/pages/Profile.jsx"

# Client config
add_file "client/package.json"
add_file "client/vite.config.js"

# Functions (backend)
add_file "functions/index.js"
add_file "functions/package.json"

# Functions config
add_file "functions/src/config/aws.js"

# Functions routes
add_file "functions/src/routes/correlations.js"
add_file "functions/src/routes/profile.js"
add_file "functions/src/routes/stocks.js"
add_file "functions/src/routes/watchlist.js"

# Functions services
add_file "functions/src/services/correlations.js"
add_file "functions/src/services/newsAnalysis.js"
add_file "functions/src/services/s3.js"
add_file "functions/src/services/stockData.js"

# Copy to clipboard (macOS)
echo "$OUTPUT" | pbcopy

echo "✅ Copied to clipboard! Files included:"
echo "- Root configs"
echo "- Client: App, pages, api, firebase config"
echo "- Functions: routes, services, AWS config"