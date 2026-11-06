#!/bin/bash

# Exit on error
set -e

echo "Installing dependencies..."
npm ci

echo "Deleting old .vsix files, if any..."
rm -f *.vsix

# `vsce package` runs vscode:prepublish, which compiles the extension and
# copies the grammar and JSON schemas into out/ (scripts/copy-assets.js).
echo "Packaging extension..."
npm run package

# Find the generated .vsix file
VSIX_FILE=$(ls *.vsix | head -n 1)

if [ -z "$VSIX_FILE" ]; then
    echo "Error: No .vsix file found after packaging."
    exit 1
fi

echo "Packaged: $VSIX_FILE"

read -p "Do you want to install this extension? (y/n) " -n 1 -r
echo    # move to a new line
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "Installing extension..."
    code --install-extension "$VSIX_FILE" --force
    echo "Done!"
else
    echo "Installation skipped."
fi
