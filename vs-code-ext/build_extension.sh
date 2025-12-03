#!/bin/bash
set -e

echo "Building BPL VS Code Extension..."

# 0. Auto-bump client package.json version (patch) and clean old VSIX
echo "Auto-bumping version and cleaning old VSIX..."
CLIENT_DIR="client"
PKG_JSON="$CLIENT_DIR/package.json"

if [[ -f "$PKG_JSON" ]]; then
	CURRENT_VERSION=$(grep -m1 '"version"' "$PKG_JSON" | sed -E 's/.*"version"\s*:\s*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/')
	if [[ -n "$CURRENT_VERSION" ]]; then
		IFS='.' read -r MAJOR MINOR PATCH <<<"$CURRENT_VERSION"
		PATCH=$((PATCH + 1))
		NEW_VERSION="$MAJOR.$MINOR.$PATCH"
		echo "Current version: $CURRENT_VERSION -> New version: $NEW_VERSION"
		# Update JSON in place
		sed -i -E "s/(\"version\"\s*:\s*\")$CURRENT_VERSION(\")/\1$NEW_VERSION\2/" "$PKG_JSON"
	else
		echo "Warning: Could not determine current version from $PKG_JSON"
	fi
else
	echo "Error: $PKG_JSON not found"
	exit 1
fi

# Remove old packaged VSIX files
rm -f "$CLIENT_DIR"/*.vsix || true

# 1. Build Server
echo "Building Server..."
cd server
npm install
npm run compile
cd ..

# 2. Build Client
echo "Building Client..."
cd client
npm install
npm run compile

# 3. Copy Server to Client
echo "Copying Server to Client..."
mkdir -p server
cp -r ../server/out server/
cp ../server/package.json server/
# We need to install server dependencies in the copied folder for production
cd server
npm install --production
cd ..

# 4. Package
echo "Packaging..."
vsce package
cd ..

echo "Done! VSIX is in vs-code-ext/client/"

# 5. Prompt to install extension
LATEST_VSIX=$(ls -t "$CLIENT_DIR"/*.vsix 2>/dev/null | head -n 1)
if [[ -n "$LATEST_VSIX" ]]; then
	echo "Found package: $LATEST_VSIX"
	read -p "Install this VSIX into VS Code now? [y/N] " RESP
	case "$RESP" in
		y|Y|yes|YES)
			echo "Installing $LATEST_VSIX..."
			code --install-extension "$LATEST_VSIX" || {
				echo "Failed to install via 'code'. Ensure VS Code CLI is available."
				exit 1
			}
			echo "Installed successfully."
			;;
		*)
			echo "Skipping installation. You can install later with:"
			echo "  code --install-extension $LATEST_VSIX"
			;;
	esac
else
	echo "Warning: No VSIX found in $CLIENT_DIR/. Packaging may have failed."
fi
