#!/bin/sh

LIGHT_BLUE='\033[1;34m'
PURPLE_WHITE='\033[35;47m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

PREFIX="${PURPLE_WHITE}run-docker-staging: ${NC} "

printf "\n\n"

printf "${PREFIX}${PURPLE}- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ${NC}\n\n"

printf "${PREFIX}${LIGHT_BLUE}Do you wish to rebuild the Docker images? [y/n]${NC} "

read answer

printf "${PREFIX}${LIGHT_BLUE}Do you wish to rebuild the database volume? [y/n]${NC} "

read answer2

if [ "$answer2" != "${answer2#[Yy]}" ] ;then
    printf "${PREFIX}${LIGHT_BLUE}Removing volume (resource_app_trpc_dbdata_staging)...${NC}\n"
    docker volume rm resource_app_trpc_dbdata_staging
fi

if [ "$answer" != "${answer#[Yy]}" ] ;then

    printf "${PREFIX}${LIGHT_BLUE}Rebuilding Docker images...${NC}\n"
    docker-compose down
    docker-compose build app_staging
fi

printf "\n${PREFIX}${LIGHT_BLUE}Starting app_staging container...${NC}\n\n"

docker-compose up -d app_staging --wait

printf "\n${PREFIX}${LIGHT_BLUE}Container is READY.${NC}\n\n"

while true; do
    printf "\n${PREFIX}${LIGHT_BLUE}Select an option:${NC}\n"
    printf "${PURPLE}1. Bash${NC}\n"
    printf "${PURPLE}2. Reset database${NC}\n"
    printf "${PURPLE}3. Seed database${NC}\n"
    printf "${PURPLE}4. Log (follow)${NC}\n"
    printf "${PURPLE}*Press enter to exit with docker-compose down${NC}\n\n"

    read -p "Choose option: " option
    printf "\n"

    case $option in
        1)
            printf "${PREFIX}${LIGHT_BLUE}Starting bash...${NC}\n"
            docker-compose exec app_staging /bin/bash
            ;;
        2)
            docker-compose exec app_staging npx prisma migrate reset --skip-seed
            ;;
        3)
            docker-compose exec app_staging node dist/prisma/seed.js
            ;;
        4)
            # Run docker-compose logs
            docker-compose logs --timestamps --follow
            ;;
        *)
            printf "${PREFIX}${LIGHT_BLUE}See ya! Docker-compose down...${NC}\n\n"
            docker-compose down --remove-orphans
            printf "${PREFIX}${LIGHT_BLUE}Clearing app_staging.log...${NC}\n\n"
            rm -i ./logs/app_staging.log
            break
            ;;
    esac
done
