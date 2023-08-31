
## Package.json

- **"prisma"** - Prisma's integrated seeding functionality expects a command in the "seed" key within this "prisma" key. **Seeding** populates the database with initial data for testing and development purposes, as well as staging and production, since some static data such as Resources need to be present at runtime if the database has been reset
  - `"seed": "ts-node-dev --transpile-only prisma/seed.ts"`
    - Uses ts-node-dev to compile the seed.ts to javascript and then run it
    - `--transpile-only` means don't do typechecking, just transpiile it
  - Refer to README in /seed

### Scripts
#### Prisma scripts
We prefix each prisma related script with `dotenv -e .env.${NODE_ENV}` so that the schema.prisma has access to an appropriate DATABASE_URL. This would typically be found in a .env file, but since we are using multiple .env files (i.e. .env.test, .env.development), we need to specify where to look. Dotenv can be used to provide a specific .env file here based on the current NODE_ENV variable. 
- **`prisma:generate`**: Generates Prisma Client JavaScript code based on our Prisma schema (`prisma/schema.prisma`).
  - This client is then used in our application code to interact with our database.
- **`prisma:migrate:dev`**: Applies database migrations in a development environment.
  - This command updates the database schema to match the Prisma schema, generates a new migration in the `prisma/migrations` folder, and generates or updates the Prisma Client as needed.
- **`prisma:migrate:deploy`**: Applies database migrations in a production environment.
  - This is similar to `prisma:migrate:dev`, but it does not create new migrations or modify existing ones.
- **`prisma:push`**: Pushes the Prisma schema state to the database without creating a migration.
  - This command is typically used in development or testing environments, not in production.
- **`prisma:seed`**: calls npx prisma db seed, which causes the prisma → seed command in package.json to fire
- **`prisma:reset`**: Resets the database, applies any migrations and then pushes the schema state, and then seeds the database.
  - can skip seeding with `--skip-seed` flag



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

## App Structure/Philosophy
- API requests are handled by an Express app which designates TRPC to handle most routes
- TRPC provides type safety and input validation for the routes (procedures)
- Theses procedures call various modules in the "service layer", e.g. scanService, userService, to handle the request. The services provide the business logic of our app. The services make calls to a "query layer", e.g. queryResource, queryUserInventoryItem, which represent the database/ORM layer. Therefore, service code should be database/ORM agnostic, and the query modules represent the actual database/ORM implementation, e.g. Prisma related calls.

## Dockerized integration testing

### Getting testing up and running
- I made a helper script **`run-docker-testing.sh`** that spins up a new app_testing container, and similarly, **`run-docker-staging.sh`** for an app_staging container
- Although the above bash scripts perform these functions, some example docker compose commands:
  - `docker-compose up app_testing -d` - this should spin up the app_testing container, including the db_testing postgres container that it depends on. It should remain running in the background with the -d flag (detached).
  - `docker exec -it app_testing /bin/bash` - this starts an interactive shell inside the app_testing container. From here we can run npm run test:docker as many times as needed, or simply examine the container's files
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
- This means that the debugging server is "listening" on port 9229 within the container, which is exposed to the host machine on port 9229
- Can then run the following command to setup a debugger while running jest tests:
  ```bash
  node --inspect-brk=0.0.0.0:9229 --nolazy -r ./node_modules/ts-node/register ./node_modules/jest/bin/jest.js --runInBand
  ```
  - The 'inspect-brk' option tells Node.js to start the debugger and stop execution on the first line of the script. 
  - 0.0.0.0:9229 is the address and port where the debugging server will listen. This particular address means the server will be accessible from any IP address, not just localhost. The server is listening for a connection from the client (i.e. VSCode debug session). Once the connection is established, the client can sends commands to the server to control the execution of the code
  - --nolazy: This flag disables the v8 engine's script parsing lazy feature. It ensures all the scripts are compiled completely before the code starts running
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
- In the 'build' stage, we transpile TypeScript to JavaScript and generate Prisma client based on the staging environment.
- The **'staging'** stage uses the transpiled code from the 'build' stage and only installs production dependencies. This build mimics a "production-like" build.
- The **'testing'** stage uses the base image and installs dev dependencies for testing.

### Docker Compose
- Using Docker Compose to manage multiple containers together.
- Each service (app_staging, app_testing, db_staging, db_testing) is defined in the docker-compose file and can be spun up with a single command.
- Separate Postgres containers are used for the staging and testing environment to avoid data contamination.
- The depends_on directive ensures that the app services wait for their corresponding Postgres service to be ready before they start.

### Dockerize
- Dockerize is used to wait for the Postgres services to be up before proceeding. This is important to avoid race conditions where the app starts before the database is ready.
- The Dockerize code is installed in our base image in the Dockerfile:
  ```
  ENV DOCKERIZE_VERSION v0.7.0
  RUN wget https://github.com/jwilder/dockerize/releases/download/$DOCKERIZE_VERSION/dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
      && tar -C /usr/local/bin -xzvf dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
      && rm dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz
  ```

### Environment-Specific Entry Point Scripts
- Different entry point scripts are used for the staging and testing environment.
- The scripts include database migration steps and specific start commands, if needed
- The scripts use dotenv-cli to ensure that the right environment variables are set for each context (staging and testing).

### Environment Variables
- We specifically declare the NODE_ENV variable in the Dockerfile for each build, i.e. test for testing, staging for staging. Having this variable set during image building is important for any commands that need access to NODE_ENV during container start up
- Separate .env files are used for staging and testing environments. These are passed to the Docker services via the env_file directive in the Docker Compose file.

### Volumes
- In the testing environment, volumes are used to sync the tests and src directories from the host to the Docker container.
 - This allows for real-time reflection of changes made in these directories on the host in the Docker container, without the need for rebuilding the image.
- In both testing and staging, we also map the /logs directory so that logs can be examined from outside the container

### Exposed ports
- The EXPOSE instruction in the Dockerfile and the ports key in your docker-compose.yml file are used to expose ports from the Docker container to the host machine.
- In our case, EXPOSE 2024 in the Dockerfile is indicating that the application inside the Docker container will be listening on port 2024. (This EXPOSE command doesn't actually do anything) The port is only exposed to other Docker containers, not to the host machine.
- The ports key in compose.yaml is what actually maps this port to a port on the host machine. The line - "2024:2024" under ports is mapping port 2024 from the Docker container to port 2024 on the host machine. This means that the application will be accessible on localhost:2024 on the host machine.

## Heroku Deployment

- We are using a Heroku pipeline setup which can enable us to deploy different app stages in the future
- Currently, only deploying 1 heroku app as our "development" build and development environment. This is the original "resource-app-backend" named app on Heroku. It is setup to use heroku buildpacks to compile the typescript and uses NODE_ENV=development
- We only have 1 heroku postgres database, so it is being used for development currently. Will have to figure out how to handle staging/production builds
  - **One issue that will arise**: Seeding the staging/production database. Though this would happening infrequently (much less for production), currently we rely on typescript to perform the seeding, i.e. prisma db seed will call "ts-node-dev --transpile-only prisma/seed.ts". This will not work in env's without typescript. Refer to the README in /seed for details about seeding.

### Heroku Config Vars
- These 'config vars' are injected into the app as environmental variables at runtime, i.e. process.env.VARIABLE.
- Details
  - **DATABASE_URL** - points to the remote database URL. Heroku manages this and can change it.
  - **FIREBASE_SERVICE_ACCT_KEY** - private key used to authenticate with Google services, e.g. Firebase stuff
  - **IS_REMOTE_HOST** - used as a flag (always true) so the app knows it is being run on Heroku. This is important for deciding whether to create a HTTPS server (local only) or just an HTTP server and let Heroku handle the HTTPS stuff
  - **LOG_LEVEL** - can set the LOG_LEVEL (if local, this would be set in an .env file)
  - **NODE_ENV** - the NODE env to run in. Since we use Heroku as a development server as well, this can be development. 
  - **NPM_CONFIG_PRODUCTION** - settings this to false allows us to run Heroku according to the environment set in NODE_ENV, otherwise it defaults everything to 'production' and will prune devDependencies (which we don't want when in development as we need the typescript compiler and stuff)

### Development
- The resource-app-backend app is set to auto-deploy on every push to our github development branch.
- Our app only have 1 Procfile and it currently runs:
  ```
  release: npm run heroku:prisma:migrate:deploy
  web: node dist/src/main.js
  ```
- Notably, 'migrate deploy' only applies new migrations; it does not look for schema drift, reset the data, or apply seeds
- We can run the following command to tell heroku to reset our heroku postgres db:
  ```bash
  heroku restart && heroku pg:reset
  ```
- Then we can manually call our prisma seeding:
  ```bash
  npx prisma db seed
  ```

  ### Staging/Production
  - Not yet fleshed out for Heroku and part of the pipeline. I imagine we will need a separate database, at least for production. And the production code will not include typescript compilation, thus we have to figure out how to seed the database.


