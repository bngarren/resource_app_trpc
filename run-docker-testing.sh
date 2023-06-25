#!/bin/sh

# This script is a helper to get our Docker container for testing up and running.
#
# Our container is "app_testing", as defined in the compose.yaml file
#
#
echo
echo

echo "Do you wish to rebuild the Docker images? [y/n]"

read answer

if [ "$answer" != "${answer#[Yy]}" ] ;then
    echo "Rebuilding Docker images..."
    docker-compose down
    docker-compose build app_testing
fi

echo
echo "Starting app_testing container..."
echo

docker-compose up -d app_testing

echo
echo "Container is READY."
echo
echo "Don't forget to shutdown afterwards with docker-compose down"

while true; do
    echo
    echo "Select an option:"
    echo "1. Bash"
    echo "2. Run one-off test suite"
    echo "3. Exit"
    echo

    read -p "Choose option: " option

    case $option in
        1)
            echo "Starting bash..."
            docker-compose exec app_testing /bin/bash
            ;;
        2)
            echo "Running test suite..."
            docker-compose exec app_testing npm run test:docker
            ;;
        3)
            echo "All done..."
            break
            ;;
        *)
            echo "Invalid option. Please enter a number between 1 and 3."
            ;;
    esac
done