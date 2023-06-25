#!/bin/sh

echo "Do you wish to rebuild the Docker images? [y/n]"

read answer

if [ "$answer" != "${answer#[Yy]}" ] ;then
    echo "Rebuilding Docker images..."
    docker-compose down
    docker-compose build app_testing
fi

echo "Starting app_testing container..."

docker-compose up -d app_testing

echo
echo "Ready to run tests."
echo
echo "Don't forget to shutdown afterwards with docker-compose down"

while true; do
    echo
    echo "Select an option:"
    echo "1. Start bash within container"
    echo "2. Run one-off test suite"
    echo "3. Exit"
    echo

    read -p "Enter the number of your option: " option

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