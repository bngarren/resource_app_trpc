# /prisma

## How does seeding work?
- In general, we use a `seed.ts/js` file that calls upon helper functions such as `seed/setupBaseSeed.ts` to make the necessary prisma calls
- How this actually happens depends on the environment:

### Development or test
- We let Prisma run the seed.ts via the package.json seed command. __See seed.ts__ below.
- In development, we can call:
    ```bash
    NODE_ENV=development npm run prisma:seed
    ```
- In test, we have a `resetPrisma()` function that we call as a part of setup and afterEach test in order to reset and re-seed the test database

### Staging or production
- We transpile the seed.ts (and the seed/ directory) during the build, as directed--currently by our single tsconfig.json file.
- Then can run
    ```
    node dist/prisma/seed.js
    ```

## seed.ts
- This file is run automatically by Prisma (manually with prisma db seed and automatically in prisma migrate dev and prisma migrate reset)
  - See https://www.prisma.io/docs/guides/migrate/seed-database#how-to-seed-your-database-in-prisma
- We can also call it manually, such as `node prisma/seed.js`
- In the development/test environments, in which all devDependencies are present, we can let Prisma run the seeding via the `seed` key in the `prisma` key of package.json
    ```json
    //package.json
    "seed": "ts-node-dev --transpile-only prisma/seed.ts"
    ```
- Importantly, this only works if we have ts-node-dev and can transpile on the fly, which we don't have in staging/production envs.