#!/bin/bash

# Ensure the Elasticsearch variables are set
if [ -z "$ELASTICSEARCH_HOST" ] || [ -z "$ELASTICSEARCH_USERNAME" ] || [ -z "$ELASTICSEARCH_PASSWORD" ]; then
  echo "Elasticsearch environment variables are not set. Exiting."
  exit 1
fi

# Directory containing the ingest pipeline files
PIPELINE_DIR="./ingest-pipelines"

# Loop over each .json file in the ingest-pipelines directory
for pipeline_file in "$PIPELINE_DIR"/*.json; do
  # Extract the filename without the path and .json extension to use as the pipeline name
  pipeline_name=$(basename "$pipeline_file" .json)

  echo "Checking if ingest pipeline $pipeline_name exists..."

  # Send a GET request to Elasticsearch to check if the ingest pipeline exists
  response=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$ELASTICSEARCH_HOST/_ingest/pipeline/$pipeline_name" \
    -u "$ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD")

  if [ "$response" -eq 200 ]; then
    echo "Ingest pipeline $pipeline_name already exists."
    read -p "Do you want to overwrite it? [y/N]: " answer
    if [ "$answer" != "${answer#[Yy]}" ]; then
      echo "Overwriting ingest pipeline $pipeline_name..."
    else
      echo "Skipping ingest pipeline $pipeline_name."
      continue
    fi
  elif [ "$response" -eq 404 ]; then
    echo "Ingest pipeline $pipeline_name does not exist. It will be created."
  else
    echo "Failed to check if ingest pipeline exists: HTTP status $response"
    exit 1
  fi

  # Send a PUT request to Elasticsearch to create or update the ingest pipeline
  echo "Creating/updating ingest pipeline $pipeline_name..."
  result=$(curl -s -X PUT "$ELASTICSEARCH_HOST/_ingest/pipeline/$pipeline_name" \
    -H 'Content-Type: application/json' \
    -u "$ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD" \
    -d @"$pipeline_file")

  # Print the result
  echo "$result"

  # Check if the request was successful
  if echo "$result" | grep -q '"acknowledged":true'; then
    echo "Ingest pipeline $pipeline_name created/updated successfully."
  else
    echo "Failed to create/update ingest pipeline $pipeline_name."
  fi
done
