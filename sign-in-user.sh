#!/bin/bash

# Check if a command line argument is provided
if [ -z "$1" ]
then
  echo "No UID provided as a command line argument."
  exit 1
fi

# Assign the first command line argument to a variable
uid=$1

# Run the command with the UID
dotenv -e .env.test -- npx ts-node ./src/auth/signInUser.ts $uid