#!/bin/bash
set -euo pipefail

package_dir=$(cd -P "$(dirname "$0")" && pwd)
source_dist="$package_dir/dist"
plugins_dir="${HOME:?}/Library/Application Support/LearnHarness/data/plugins"
plugin_dir="$plugins_dir/learning-calendar"
installed="$plugin_dir/dist"
transaction="$plugin_dir/.calendar-update"

fail() { printf '%s\n' "$*" >&2; exit 1; }

for file in manifest.json main.js backend.cjs styles.css; do
  [[ -f "$source_dist/$file" && ! -L "$source_dist/$file" ]] ||
    fail "Extract the entire Learning calendar ZIP and run the updater beside its dist folder."
done

manifest_id() { /usr/bin/plutil -extract id raw -o - "$1"; }
[[ "$(manifest_id "$source_dist/manifest.json")" == "learning-calendar" ]] ||
  fail "This package does not contain the Learning calendar plugin."

# Only replace code under dist. The plugin's data and the host's enabled setting live elsewhere.
for path in "$plugins_dir" "$plugin_dir" "$installed"; do
  [[ ! -L "$path" ]] || fail "The updater cannot replace a linked folder: $path"
done
if [[ -e "$installed" ]]; then
  [[ -d "$installed" && -f "$installed/manifest.json" && ! -L "$installed/manifest.json" ]] ||
    fail "The existing dist folder has no readable plugin manifest: $installed"
  [[ "$(manifest_id "$installed/manifest.json")" == "learning-calendar" ]] ||
    fail "The installed manifest identifies a different plugin: $installed"
fi
/bin/mkdir -p "$plugin_dir"
if ! /bin/mkdir "$transaction"; then
  if [[ -d "$transaction" ]]; then
    fail "Another update is in progress or was interrupted. Recovery files may be in $transaction"
  fi
  fail "The Learning calendar plugin folder could not be updated: $plugin_dir"
fi

cleanup() {
  result=$?
  trap - EXIT HUP INT TERM
  if [[ -d "$transaction/previous" && ! -e "$installed" && ! -L "$installed" ]]; then
    if ! /bin/mv "$transaction/previous" "$installed"; then
      fail "The old plugin files could not be restored. They are still in $transaction/previous"
    fi
  fi
  /bin/rm -rf "$transaction"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

/bin/mkdir "$transaction/new"
for file in manifest.json main.js backend.cjs styles.css; do
  /bin/cp "$source_dist/$file" "$transaction/new/$file"
  /usr/bin/cmp -s "$source_dist/$file" "$transaction/new/$file" ||
    fail "Could not verify the staged copy of $file."
done
if [[ -d "$installed" ]]; then
  /bin/mv "$installed" "$transaction/previous"
fi
/bin/mv "$transaction/new" "$installed"

printf 'Learning calendar installed at %s\n' "$plugin_dir"
printf 'Quit and reopen LearnHarness to load the update. For a first installation, enable Learning calendar in Settings → Community plugins.\n'
