#!/bin/sh

### Entrypoint for our STAGING target. 

# Only need to run prisma migrations, not seed

dockerize -wait tcp://db_staging:5432 -timeout 10s printf "\n\nPostgres up. Ready to migrate.\n\n"
npx dotenv -e .env.staging -- npx prisma migrate deploy

printf "\n\nUse \`ps aux\` to find the node process\n\n"
npm run start:staging
