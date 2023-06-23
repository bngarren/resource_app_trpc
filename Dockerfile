# Use an official Node runtime as the base image
FROM node:19

### DOCKERIZE
ENV DOCKERIZE_VERSION v0.7.0
RUN wget https://github.com/jwilder/dockerize/releases/download/$DOCKERIZE_VERSION/dockerize-alpine-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && tar -C /usr/local/bin -xzvf dockerize-alpine-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && rm dockerize-alpine-linux-amd64-$DOCKERIZE_VERSION.tar.gz
###

# Set the working directory in the container to /app
WORKDIR /app

# Install global dependencies
RUN npm install -g jest ts-jest supertest dotenv-cli

# Copy package.json and package-lock.json into the directory
COPY package*.json ./

# Install the application dependencies
RUN npm ci

# Copy prisma schema
COPY prisma ./prisma/

# Copy .env.test
COPY .env.test ./

# Run prisma generate 
RUN dotenv -e .env.test npx prisma generate

#RUN dockerize -wait tcp://db:5432 -timeout 10s

#RUN dotenv -e .env.test npx prisma migrate deploy
#RUN dotenv -e .env.test npx prisma db seed

# Bundle the app source inside the Docker image
COPY . .

# This is a kind of documentation that informs Docker that the application
# inside the Docker container is listening on the specified ports at runtime.
# It doesn't actually publish the port or make it accessible to the host or network.
# Rather, it serves as a kind of documentation between the person who builds the
# image and the person who runs the container, about which ports are intended to be published
EXPOSE 2024

# Define the command to run the app
#CMD ["npm", "run", "start"]
