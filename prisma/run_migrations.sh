#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/.."

npx prisma migrate dev --create-only
./prisma/append_trigger_migration.sh
npx prisma migrate dev