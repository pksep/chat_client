#!/usr/bin/env bash
set -euo pipefail

version=${1:?version}
channel=${2:?channel}
source_dir=${3:?source directory}
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?$ ]] || exit 2
[[ "$channel" == stable || "$channel" == beta ]] || exit 2
[[ -f "$source_dir/publish/$channel/latest.json" ]] || exit 2
upload_root=$(realpath "$HOME/sep-chat-desktop-upload")
resolved_source=$(realpath "$source_dir")
[[ "$resolved_source" == "$upload_root/"*/desktop-upload ]] || { echo 'Unexpected upload directory'; exit 2; }
export KUBECONFIG=${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}

# Размещаем хранилище рядом с ai-client; исходный Deployment чата не меняем.
namespace=${DESKTOP_KUBE_NAMESPACE:-erp}
kubectl -n "$namespace" get deployment ai-client -o name
kubectl -n "$namespace" apply -f "$source_dir/deploy/desktop-updates.yaml"
kubectl -n "$namespace" rollout status deployment/sep-chat-desktop-updates --timeout=180s
pod=$(kubectl -n "$namespace" get pod -l app=sep-chat-desktop-updates -o jsonpath='{.items[0].metadata.name}')
staging="/srv/desktop/.incoming-$version-${GITHUB_RUN_ID:-manual}"
kubectl -n "$namespace" exec "$pod" -- mkdir -p "$staging"
kubectl -n "$namespace" cp "$source_dir/packages/." "$pod:$staging/"
kubectl -n "$namespace" cp "$source_dir/publish/$channel/latest.json" "$pod:$staging/latest.json"

# Сначала все неизменяемые пакеты; latest.json переключается одним rename.
kubectl -n "$namespace" exec "$pod" -- sh -eu -c '
  staging=$1; version=$2; channel=$3
  root=/srv/desktop
  mkdir -p "$root/releases" "$root/$channel"
  cp "$staging/latest.json" "$root/$channel/latest.json.next"
  rm "$staging/latest.json"
  chmod -R u=rwX,go=rX "$staging"
  if [ -e "$root/releases/$version" ]; then
    diff -qr "$staging" "$root/releases/$version" || {
      echo "Different packages already published for this version"; exit 1
    }
    rm -rf -- "$staging"
  else
    mv "$staging" "$root/releases/$version"
  fi
  chmod 644 "$root/$channel/latest.json.next"
  mv "$root/$channel/latest.json.next" "$root/$channel/latest.json"
' sh "$staging" "$version" "$channel"

echo "Published SEP Chat $version ($channel)"
rm -rf -- "$resolved_source"
