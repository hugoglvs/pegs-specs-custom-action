#!/bin/bash

# Compile the action
echo "Building action..."
npm run build
npm run package

# Setup local gem environment to avoid permission issues
export GEM_HOME="$(pwd)/.gem"
export PATH="$GEM_HOME/bin:$PATH"

echo "GEM_HOME is set to: $GEM_HOME"
mkdir -p "$GEM_HOME/bin"
echo "Installing Asciidoctor gems locally..."
gem install asciidoctor asciidoctor-pdf asciidoctor-diagram asciidoctor-diagram-plantuml --no-document --install-dir "$GEM_HOME" --bindir "$GEM_HOME/bin" --no-user-install

if [ ! -f "$GEM_HOME/bin/asciidoctor-pdf" ]; then
    echo "Error: asciidoctor-pdf binary not found in $GEM_HOME/bin"
    ls -R .gem
    exit 1
fi

echo "Extensions installed."
asciidoctor-pdf -v


export INPUT_REQUIREMENTS_PATH="requirements.csv"
export INPUT_OUTPUT_DIR="docs/build"
export INPUT_PROJECT_NAME="PEGS Demo Project"
export INPUT_AUTHORS="Hugo, Léa"
export INPUT_LOGO_PATH="assets/image.svg"
export INPUT_PDF_THEME_PATH="resources/theme/pegs-theme.yml"

# Set GITHUB_WORKSPACE to current directory
export GITHUB_WORKSPACE="$(pwd)"

# Create output directory if it doesn't exist
mkdir -p docs/build

# Run the action locally
echo "Running action locally..."
node dist/index.js
