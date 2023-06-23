#!/bin/sh

### Entrypoint for our TESTING target. 

# For testing environment, need to run prisma migrations and seed

dockerize -wait tcp://db_testing:5432 -timeout 10s echo "Postgres up. Ready to migrate/seed."
dotenv -e .env.test npx prisma migrate deploy
dotenv -e .env.test npx prisma db seed
echo "Ready to run testing suite."
tail -f /dev/null