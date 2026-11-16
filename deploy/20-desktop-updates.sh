#!/bin/sh
set -eu
resolver=$(awk '/^nameserver / { print $2; exit }' /etc/resolv.conf)
search=$(awk '/^search / { print $2; exit }' /etc/resolv.conf)
upstream=sep-chat-desktop-updates
if [ -n "$search" ]; then upstream="$upstream.$search"; fi
printf 'resolver %s valid=30s ipv6=off;\nset $desktop_updates http://%s;\n' "$resolver" "$upstream" > /etc/nginx/desktop-upstream.conf
