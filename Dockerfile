# Use an official Node runtime as the base image

### BASE IMAGE ###
FROM node:19-alpine as base
ENV NPM_CONFIG_LOGLEVEL warn
# Add bash to alpine build
RUN apk add --no-cache bash
# DOCKERIZE
ENV DOCKERIZE_VERSION v0.7.0
RUN wget https://github.com/jwilder/dockerize/releases/download/$DOCKERIZE_VERSION/dockerize-alpine-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && tar -C /usr/local/bin -xzvf dockerize-alpine-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && rm dockerize-alpine-linux-amd64-$DOCKERIZE_VERSION.tar.gz
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
RUN npm install typescript -D
# Copy prisma schema
COPY prisma ./prisma/
# Copy .env file
COPY .env.staging ./
# Run prisma generate # Have to use dotenv-cli to force prisma to use this specific .env file
RUN dotenv -e .env.staging npx prisma generate
COPY . .
# Run the build script to compile the TypeScript code
RUN npm run build

### STAGING TARGET ###
FROM base as staging
WORKDIR /app
# Copy over the compiled code and package*.json files from the build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./

# Entrypoint scripts are copied to the Docker image during build and have the execute permission
COPY entrypoint.staging.docker.sh ./
RUN chmod +x entrypoint.staging.docker.sh

EXPOSE 2024


## Lastly, docker-compose will start from the entrypoint.sh

### TESTING TARGET ###
FROM base as testing
WORKDIR /app

# Install dev dependencies
RUN npm install -D
# Copy prisma schema
COPY prisma ./prisma/
# Copy .env file
COPY .env.test ./
# Run prisma generate 
RUN dotenv -e .env.test npx prisma generate

COPY entrypoint.testing.docker.sh ./
RUN chmod +x entrypoint.testing.docker.sh

COPY . .

EXPOSE 2025
## Lastly, docker-compose will start from the entrypoint.sh







