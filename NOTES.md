
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

### Getting testing up and running
- I made a helper script `run-docker-testing.sh` that spins up a new app_testing container
- `docker-compose up app_testing -d` - this should spin up the app_testing container, including the db_testing postgres container that it depends on. It should remain running.
- `docker exec -it app_testing /bin/bash` - this starts an interactive shell inside the app_testing container. From here we can run npm run test:docker as many times as needed
- `docker-compose exec app_testing npm run test:docker` - this executes the script inside the app_testing container

### Cleaning up
- `docker rmi $(docker images -q -f dangling=true)` - removes dangling images

### Attaching a debugger
- We expose the "debugging" port in the compose file
  - ```yaml
    app_testing:
    container_name: app_testing
    build:
      context: .
      target: testing
    entrypoint: ["/bin/bash", "./entrypoint.testing.docker.sh"]
    ports:
      - "2025:2025"
      - "9229:9229" #expose the debug port to the outside world
      ```
- Can then run the following command to setup a debugger while running jest tests:
  ```bash
  node --inspect-brk=0.0.0.0:9229 --nolazy -r ./node_modules/ts-node/register ./node_modules/jest/bin/jest.js --runInBand
  ```
  - I've included this command in the `run-docker-testing.sh` script for easy access
  - Within VSCode, we add a launch configuration in launch.json (within .vscode/) that resembles this:
  ```json
  {
            "type": "node",
            "name": "docker-jest",
            "request": "attach",
            "address": "0.0.0.0",
            "port": 9229,
            "localRoot": "${workspaceFolder}",
            "remoteRoot": "/app", // Will depend on your setup
            "skipFiles": [
              "<node_internals>/**/*.js",
              "${workspaceFolder}/node_modules/**/*.js"
            ],
            "internalConsoleOptions": "neverOpen",
            "presentation": {
              "reveal": "silent"
            }
          }
  ```
  - See https://stackoverflow.com/a/67213840

### The "Dockerization" of My App

### Multistage Docker Build
- I'm leveraging Docker's multistage build to create separate images for different environments (staging and testing), sharing a common base image.
- The base image has the application dependencies and common setup, ensuring consistency across stages.
- In the 'build' stage, you transpile TypeScript to JavaScript and generate Prisma client based on the staging environment.
- The 'staging' stage uses the transpiled code from the 'build' stage and only installs production dependencies. This build mimics a "production-like" build.
- The 'testing' stage uses the base image and installs dev dependencies for testing.

### Docker Compose
- Using Docker Compose to manage multiple containers together.
- Each service (app_staging, app_testing, db_staging, db_testing) is defined in the docker-compose file and can be spun up with a single command.
- Separate Postgres containers are used for the staging and testing environment to avoid data contamination.
- The depends_on directive ensures that the app services wait for their corresponding Postgres service to be ready before they start.

### Dockerize
- Dockerize is used to wait for the Postgres services to be up before proceeding. This is important to avoid race conditions where the app starts before the database is ready.

### Environment-Specific Entry Point Scripts
- Different entry point scripts are used for the staging and testing environment.
- The scripts include database migration steps and the seeding step for the testing environment.
- The scripts use dotenv-cli to ensure that the right environment variables are set for each context (staging and testing).

### Environment Variables
- Separate .env files are used for staging and testing environments. These are passed to the Docker services via the env_file directive in the Docker Compose file.

### Volumes
- In the testing environment, volumes are used to sync the tests and src directories from the host to the Docker container.
 - This allows for real-time reflection of changes made in these directories on the host in the Docker container, without the need for rebuilding the image.

### Exposed ports
- The EXPOSE instruction in your Dockerfile and the ports key in your docker-compose.yml file are used to expose ports from the Docker container to the host machine.
- In our case, EXPOSE 2024 in the Dockerfile is indicating that the application inside the Docker container will be listening on port 2024. (This EXPOSE command doesn't actually do anything) The port is only exposed to other Docker containers, not to the host machine.
- The ports key in compose.yaml is what actually maps this port to a port on the host machine. The line - "2024:2024" under ports is mapping port 2024 from the Docker container to port 2024 on the host machine. This means that the application will be accessible on localhost:2024 on the host machine.


