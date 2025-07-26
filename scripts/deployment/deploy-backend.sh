#!/bin/bash
set -e

cd "$(dirname "$0")"

# Load environment variables from .env file
if [ -f "../../.env" ]; then
    set -a
    source ../../.env
    set +a
fi

cd ../../backend
yarn install
yarn infra:deploy
