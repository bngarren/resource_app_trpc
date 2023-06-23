# entrypoint.docker.sh

dockerize -wait tcp://db:5432 -timeout 10s echo "Postgres up. Ready to migrate/seed."
npx prisma migrate deploy
npx prisma db seed
npm run start