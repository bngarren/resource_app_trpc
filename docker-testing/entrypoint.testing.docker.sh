#!/bin/sh

### Entrypoint for our TESTING target. 

# For testing environment, can run prisma reset here. 

dockerize -wait tcp://db_testing:5432 -timeout 10s echo "Postgres up. Now resetting database..."
npx dotenv -e .env.test -- npx prisma migrate reset --force --skip-seed --skip-generate
#npx dotenv -e .env.test -- npx prisma migrate deploy
echo
echo "Ready to run testing suite."
tail -f /dev/null #Hack to keep the container running so we can bash in or keep runnings tests...