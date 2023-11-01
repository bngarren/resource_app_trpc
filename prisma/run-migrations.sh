#!/bin/bash

##### Summary #####
# This script allows us to tack-on additional SQL to the auto-generated migration file that Prisma makes.
# For instance, to add Postgresql triggers, we can store that SQL in a separate file and it will be
# added anytime we are making a first-time/initial migration.
#
# 1. Runs `npx prisma migrate dev --create-only` to generate a new migration file based on the
# current schema. But does not run the actual sql queries yet.
# * If this is the first/initial migration:
# 2. For each file path in SQL_FILES_TO_APPEND, will append this SQL code to the end of the
# new migration.sql
# 3. Finally, run `npx prisma migrate dev` to actually run the migration.sql and update the database
#
# * If this script is run when a previous migration exists, it will still generate a new migration,
# * which may or may not be empty, dependening if there was any schema change. The appended SQL files
# * should only be in the first/initial migration!
#

# Navigate to the project root directory
cd "$(dirname "$0")/.."

# Array of SQL files to append
SQL_FILES_TO_APPEND=("prisma/triggers.sql")

npx prisma migrate dev --create-only

# Ensure prisma/migrations directory exists
if [ -d "prisma/migrations" ]; then
  # Check if there is exactly 1 migration directory (indicating it's the initial migration)
  if [ $(ls -l prisma/migrations | grep -E '^d' | wc -l) -eq 1 ]; then
    echo "🔮 This seems to be an initial migration...Will append additional SQL files..."
    # Iterate through SQL files to append
    for sql_file in "${SQL_FILES_TO_APPEND[@]}"
    do
      # Ensure SQL file exists
      if [ -f "$sql_file" ]; then
        # Append SQL file to the initial migration SQL file
        for dir in prisma/migrations/*/
        do
          # Ensure the migration.sql file exists in the directory
          if [ -f "${dir}migration.sql" ]; then
            # Append a newline and then the SQL file content to the migration file
            echo "" >> "${dir}migration.sql"
            cat "$sql_file" >> "${dir}migration.sql"
            echo "  - Appended ${sql_file} to ${dir}migration.sql."
          else
            echo "🚩 Error: ${dir}migration.sql not found."
            exit 1
          fi
        done
      else
        echo "🚩 Error: $sql_file not found."
        exit 1
      fi
    done
  fi
else
  echo "🚩 Error: prisma/migrations directory not found."
  exit 1
fi

npx prisma migrate dev
