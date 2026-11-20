#!/usr/bin/env bash
set -euo pipefail

identity="$RUNNER_TEMP/chat-xcode-cache.txt"
xcodebuild -version > "$identity"
xcode-select -p >> "$identity"
xcrun --sdk macosx --show-sdk-path >> "$identity"
key="$(shasum -a 256 "$identity" | cut -d ' ' -f 1)"
printf 'key=%s\n' "$key" >> "$GITHUB_OUTPUT"
