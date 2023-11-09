#!/bin/bash

# Ensure the Elasticsearch variables are set
if [ -z "$ELASTICSEARCH_HOST" ] || [ -z "$ELASTICSEARCH_USERNAME" ] || [ -z "$ELASTICSEARCH_PASSWORD" ]; then
  echo "Elasticsearch environment variables are not set. Exiting."
  exit 1
fi

# Directory containing the index template files
TEMPLATE_DIR="./index-templates"

# Loop over each .json file in the index-templates directory
for template_file in "$TEMPLATE_DIR"/*.json; do
  # Extract the filename without the path and .json extension to use as the template name
  template_name=$(basename "$template_file" .json)

  echo "Creating index template: $template_name"

  # Send a PUT request to Elasticsearch to create the index template
  response=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$ELASTICSEARCH_HOST/_index_template/$template_name" \
    -H 'Content-Type: application/json' \
    -u "$ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD" \
    -d @"$template_file")

    if [ "$response" -eq 200 ]; then
    echo "Index template $template_name already exists."
    read -p "Do you want to overwrite it? [y/N]: " answer
    if [ "$answer" != "${answer#[Yy]}" ]; then
      echo "Overwriting index template $template_name..."
    else
      echo "Skipping index template $template_name..."
      continue
    fi
  elif [ "$response" -eq 404 ]; then
    echo "Index template $template_name does not exist. It will be created."
  else
    echo "Failed to check if index template exists: HTTP status $response"
    exit 1
  fi

  # Send a PUT request to Elasticsearch to create or update the index template
  result=$(curl -s -X PUT "$ELASTICSEARCH_HOST/_index_template/$template_name" \
    -H 'Content-Type: application/json' \
    -u "$ELASTICSEARCH_USERNAME:$ELASTICSEARCH_PASSWORD" \
    -d @"$template_file")

  # Print the result
  echo "$result"

  # Check if the request was successful
  if echo "$result" | grep -q '"acknowledged":true'; then
    echo "Index template $template_name created/updated successfully."
  else
    echo "Failed to create/update index template $template_name."
  fi
done
