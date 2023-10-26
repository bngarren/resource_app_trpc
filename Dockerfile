# Use an official Node runtime as the base image

### BASE IMAGE ###
FROM node:19 as base
ENV NPM_CONFIG_LOGLEVEL warn

RUN apt-get update
RUN apt-get install -y openssl wget

ENV DOCKERIZE_VERSION v0.7.0
RUN wget https://github.com/jwilder/dockerize/releases/download/$DOCKERIZE_VERSION/dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && tar -C /usr/local/bin -xzvf dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && rm dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz

# Set the working directory in the container to /app
WORKDIR /app
# Copy package.json and package-lock.json into the directory
COPY package*.json ./
# Install global dependencies
RUN npm install -g dotenv-cli
# Install only production dependencies
RUN npm ci --omit=dev

### BUILD TARGET - for compiling ###
FROM base as build
WORKDIR /app
RUN npm install --save-dev typescript
# Copy prisma schema
COPY prisma ./prisma/
# Copy .env file
COPY .env.common .env.staging ./
# Run prisma generate # Have to use dotenv-cli to force prisma to use this specific .env file
RUN dotenv -e .env.staging npx prisma generate
COPY . .
# Run the build script to compile the TypeScript code
RUN npm run build


### STAGING TARGET ###
FROM base as staging
WORKDIR /app

ENV NODE_ENV staging

# Copy over the compiled code and package*.json files from the build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./

# Copy prisma schema
COPY prisma ./prisma/
# Copy .env file
COPY .env.common .env.staging ./
# Run prisma generate # Have to use dotenv-cli to force prisma to use this specific .env file
RUN dotenv -e .env.staging npx prisma generate

# Copy our certificates for HTTPS
COPY resource_app_trpc_https.cert resource_app_trpc_https.key ./

# Entrypoint scripts are copied to the Docker image during build and have the execute permission
COPY entrypoint.staging.docker.sh ./
RUN chmod +x entrypoint.staging.docker.sh

EXPOSE 2024


## Lastly, docker-compose will start from the entrypoint.sh

### TESTING TARGET ###
FROM base as testing
WORKDIR /app

ENV NODE_ENV test

# Install dev dependencies
RUN npm install -D
# Copy prisma schema
COPY prisma ./prisma/
# Copy .env file
COPY .env.common .env.test ./
# Run prisma generate 
RUN dotenv -e .env.test npx prisma generate

COPY docker-testing/entrypoint.testing.docker.sh ./docker-testing/
RUN chmod +x ./docker-testing/entrypoint.testing.docker.sh

COPY . .

EXPOSE 2025
## Lastly, docker-compose will start from the entrypoint.sh







