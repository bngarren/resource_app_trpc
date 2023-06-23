
## Package.json

- **"prisma"** - Prisma's integrated seeding functionality expects a command in the "seed" key within this "prisma" key. **Seeding** populates the database with initial data for testing and development purposes.
  - `"seed": "ts-node-dev --transpile-only prisma/seed.ts"`
  - Uses ts-node-dev to compile the seed.ts to javascript and then run it
  - `--transpile-only` means don't do typechecking, just transpiile it

### Scripts
- **`prisma:generate`**: Generates Prisma Client JavaScript code based on our Prisma schema (`prisma/schema.prisma`).
  - This client is then used in our application code to interact with our database.
- **`prisma:migrate:dev`**: Applies database migrations in a development environment.
  - This command updates the database schema to match the Prisma schema, generates a new migration in the `prisma/migrations` folder, and generates or updates the Prisma Client as needed.
- **`prisma:migrate:deploy`**: Applies database migrations in a production environment.
  - This is similar to `prisma:migrate:dev`, but it does not create new migrations or modify existing ones.
- **`prisma:push`**: Pushes the Prisma schema state to the database without creating a migration.
  - This command is typically used in development or testing environments, not in production.
- **`prisma:reset`**: Resets the database, applies any migrations and then pushes the schema state (so...development only), and then seeds the database.



## Viewing the Heroku postgres db
- Use pgweb as described here: https://stackoverflow.com/questions/51509499/how-do-i-view-a-postgresql-database-on-heroku-with-a-gui
- We installed via brew
- Launch it in browser via: `heroku config:get DATABASE_URL | xargs pgweb --url`

## Code Quality
- Ensuring high code quality is essential for long-term maintainability of the project.

### ESLint
- ESLint is a static analysis tool that helps identify problematic patterns in JavaScript/TypeScript code.
- The ESLint configuration is extended with TypeScript recommended rules and Prettier rules, ensuring TypeScript best practices and consistent formatting.
- The ESLint rule for Prettier is set to "warn" instead of "error". This allows Prettier formatting inconsistencies to appear as warnings, which do not break the build but still highlight areas that need attention.

### Prettier
- Prettier is an opinionated code formatter
- The Prettier configuration defaults to .prettierrc

### VSCode settings
- The settings enable ESLint to automatically fix identified issues on save
- ESLint is set as the default formatter for JavaScript and TypeScript files
- Using a specific .vscode/settings.json file for these configurations allows project-specific settings without affecting the global VSCode settings.

## Dockerized E2E testing

### Exposed ports
- The EXPOSE instruction in your Dockerfile and the ports key in your docker-compose.yml file are used to expose ports from your Docker container to your host machine.
- In your case, EXPOSE 2023 in your Dockerfile is indicating that your application inside the Docker container is listening on port 2023. However, this port is only exposed to other Docker containers, not to your host machine.
- The ports key in docker-compose.yml is what actually maps this port to a port on your host machine. The line - "2023:2023" under ports is mapping port 2023 from your Docker container to port 2023 on your host machine. This means that your application will be accessible on localhost:2023 on your host machine.