#!/usr/bin/env bash
set -euo pipefail

exec /usr/bin/sudo -iu orbit -- \
  /bin/bash /var/www/orbit/infra/scripts/deploy-personal-server.sh "$@"
