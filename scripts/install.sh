#!/bin/sh
# Install the standalone `bpl` executable from a GitHub release:
#
#   curl -fsSL https://raw.githubusercontent.com/pr0h0/bpl3/master/scripts/install.sh | sh
#
# BPL_VERSION      release to install, e.g. 0.1.5 (default: the latest release)
# BPL_INSTALL_DIR  where to put `bpl` (default: $HOME/.local/bin)
# BPL_DOWNLOAD_BASE  base URL holding the release assets (for mirrors and tests)
#
# The executable needs no Bun or checkout; compiling programs needs clang.
set -eu

repository="https://github.com/pr0h0/bpl3"

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) echo "bpl: unsupported operating system $(uname -s); build from source instead" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) echo "bpl: unsupported architecture $(uname -m); build from source instead" >&2; exit 1 ;;
esac
asset="bpl-$os-$arch"

if [ -n "${BPL_DOWNLOAD_BASE:-}" ]; then
  base="$BPL_DOWNLOAD_BASE"
elif [ -n "${BPL_VERSION:-}" ]; then
  base="$repository/releases/download/v${BPL_VERSION#v}"
else
  base="$repository/releases/latest/download"
fi
install_dir="${BPL_INSTALL_DIR:-$HOME/.local/bin}"

download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$1" -O "$2"
  else
    echo "bpl: curl or wget is required" >&2
    exit 1
  fi
}

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT INT TERM

echo "Downloading $asset from $base"
download "$base/$asset" "$workdir/$asset"
download "$base/SHA256SUMS" "$workdir/SHA256SUMS"

expected=$(awk -v name="$asset" '$2 == name { print $1 }' "$workdir/SHA256SUMS")
if [ -z "$expected" ]; then
  echo "bpl: SHA256SUMS has no entry for $asset" >&2
  exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$workdir/$asset" | awk '{ print $1 }')
else
  actual=$(shasum -a 256 "$workdir/$asset" | awk '{ print $1 }')
fi
if [ "$actual" != "$expected" ]; then
  echo "bpl: checksum mismatch for $asset (expected $expected, got $actual)" >&2
  exit 1
fi

mkdir -p "$install_dir"
chmod +x "$workdir/$asset"
mv "$workdir/$asset" "$install_dir/bpl"
echo "Installed bpl to $install_dir/bpl"
case ":$PATH:" in
  *":$install_dir:"*) ;;
  *) echo "Add $install_dir to PATH to run bpl." ;;
esac
