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
echo "Ready to run tests. You can run the test suite with the following command:"
echo
echo "docker-compose exec app_testing npm run test:docker"
echo
echo "Don't forget to shutdown afterwards with docker-compose down"
echo