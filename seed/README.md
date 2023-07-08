# /seed

## Overview
- The contents of this directory all relate to making database calls to seed the database
- These modules are tightly coupled to using Prisma

## Considerations
- An alternative to seeding our static game data (rather than just seeding test/development data), is to write out raw SQL queries that could be run from bash scripts. This might make it easier to deploy a database in any given environment without being so tightly coupled to the typescript or transpiled javascript code that currently performs our seeding via Prisma.

## Potential Issues
- Our test suites all rely on a 'base' seeded database from which tests are performed, new data is added/removed, etc. If the seed data is changed, this could cause tests to fail, or worse, continue passing but not be testing what we think we're testing. See below regarding perhaps needing to separate the 'base seed' from the 'test seed'...
- Currently, our 'seed' data is the same for our development, testing, staging, and production environments. All of these are ultimately calling `setupBaseSeed.ts`. While all of these need some basic game data that is rather static, such as Resources, ResourceRarity, etc., it may not be true in the future that they should have the same seeding function