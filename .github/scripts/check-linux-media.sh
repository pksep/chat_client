#!/usr/bin/env bash
set -euo pipefail

image=$(realpath "$1")
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
root=$(mktemp -d "${RUNNER_TEMP:-/tmp}/sep-chat-linux-media.XXXXXX")
trap 'rm -rf -- "$root"' EXIT
chmod +x "$image"
(cd "$root" && "$image" --appimage-extract > extract.log)
export APPDIR="$root/squashfs-root"
hook="$APPDIR/apprun-hooks/linuxdeploy-plugin-gstreamer.sh"
if [[ ! -f "$hook" ]]; then
  echo 'AppImage содержит GStreamer без собственного набора плагинов' >&2
  exit 1
fi

cc "$script_dir/linux-media-probe.c" -o "$root/media-probe" $(pkg-config --cflags --libs gstreamer-1.0)
# Те же пути плагинов и scanner, что используются при обычном запуске AppRun.
# Hook допускает отсутствующий необязательный gst-ptp-helper.
source "$hook" || true
export GST_REGISTRY_1_0="$root/registry.bin"
if [[ "$GST_PLUGIN_SYSTEM_PATH_1_0" != "$APPDIR/usr/lib/gstreamer-1.0" ||
      "$GST_PLUGIN_PATH_1_0" != "$APPDIR/usr/lib/gstreamer-1.0" ||
      ! -x "$GST_PLUGIN_SCANNER_1_0" ]]; then
  echo 'AppImage не изолирует свои мультимедийные плагины от системных' >&2
  exit 1
fi
LD_LIBRARY_PATH="$APPDIR/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" "$root/media-probe" "$APPDIR/usr/lib/gstreamer-1.0/"
