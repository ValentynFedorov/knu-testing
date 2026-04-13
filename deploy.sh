#!/bin/bash
set -e

echo "=== KNU Testing Platform - Deploy ==="

# Check .env.production exists
if [ ! -f .env.production ]; then
  echo "ERROR: .env.production not found!"
  echo "Copy .env.production.example to .env.production and fill in values:"
  echo "  cp .env.production.example .env.production"
  exit 1
fi

# Load env
export $(grep -v '^#' .env.production | xargs)

echo "1. Building and starting containers..."
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

echo ""
echo "2. Waiting for services to start..."
sleep 10

echo ""
echo "3. Installing Piston language runtimes..."
# Install runtimes in Piston (only if not already installed)
docker exec knu-piston bash -c '
  installed=$(piston ppman list 2>/dev/null || echo "")
  for pkg in python:3.10.0 node:18.15.0 typescript:5.0.3 java:15.0.2 gcc:10.2.0; do
    lang=${pkg%%:*}
    ver=${pkg##*:}
    if echo "$installed" | grep -q "$lang"; then
      echo "  $lang already installed"
    else
      echo "  Installing $lang $ver..."
      piston ppman install "$lang" "$ver" 2>&1 | tail -1
    fi
  done
'

echo ""
echo "=== Deploy complete! ==="
echo "App running at: ${NEXTAUTH_URL:-http://localhost}"
echo ""
echo "Useful commands:"
echo "  docker compose -f docker-compose.prod.yml logs -f        # View logs"
echo "  docker compose -f docker-compose.prod.yml restart         # Restart all"
echo "  docker compose -f docker-compose.prod.yml down            # Stop all"
