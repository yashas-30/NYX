#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# bootstrap-secrets.sh
#
# One-time setup to encrypt secrets for a new cluster.
# Requires: kubeseal, helm, kubectl, cluster access.
# ──────────────────────────────────────────────────────────────
set -euo pipefail

echo "==> Installing Sealed Secrets controller..."
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets 2>/dev/null || true
helm upgrade --install sealed-secrets sealed-secrets/sealed-secrets \
  --namespace kube-system --wait

echo ""
echo "==> Sealing nyx-secrets..."
if [ ! -f k8s/secret.yml ]; then
  echo "ERROR: k8s/secret.yml not found. Create it from the template first."
  exit 1
fi

# Validate no placeholders remain
if grep -q '""' k8s/secret.yml; then
  echo "ERROR: k8s/secret.yml still has empty values. Fill them in before sealing."
  exit 1
fi

kubeseal --format yaml < k8s/secret.yml > k8s/sealed-secret.yml
echo "==> SealedSecret written to k8s/sealed-secret.yml"
echo ""
echo "==> Applying to cluster..."
kubectl apply -f k8s/sealed-secret.yml
echo "==> Done. The Sealed Secrets controller will decrypt this into a regular Secret."
echo ""
echo "Next: delete k8s/secret.yml or revert it to the template (no plaintext in Git)."
