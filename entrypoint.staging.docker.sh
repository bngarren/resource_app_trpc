#!/bin/sh

### Entrypoint for our STAGING target. 

# Only need to run prisma migrations, not seed

dockerize -wait tcp://db_staging:5432 -timeout 10s echo "Postgres up. Ready to migrate."
npx dotenv -e .env.staging -- npx prisma migrate deploy
npm run start:staging