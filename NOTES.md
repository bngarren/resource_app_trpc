

## Viewing the Heroku postgres db
- Use pgweb as described here: https://stackoverflow.com/questions/51509499/how-do-i-view-a-postgresql-database-on-heroku-with-a-gui
- We installed via brew
- Launch it in browser via: `heroku config:get DATABASE_URL | xargs pgweb --url`

## Code Quality
- Ensuring high code quality is essential for long-term maintainability of the project.

### ESLint
- ESLint is a static analysis tool that helps identify problematic patterns in JavaScript/TypeScript code.
- The ESLint configuration is extended with TypeScript recommended rules and Prettier rules, ensuring TypeScript best practices and consistent formatting.
- The ESLint rule for Prettier is set to "warn" instead of "error". This allows Prettier formatting inconsistencies to appear as warnings, which do not break the build but still highlight areas that need attention.

### Prettier
- Prettier is an opinionated code formatter
- The Prettier configuration defaults to .prettierrc

### VSCode settings
- The settings enable ESLint to automatically fix identified issues on save
- ESLint is set as the default formatter for JavaScript and TypeScript files
- Using a specific .vscode/settings.json file for these configurations allows project-specific settings without affecting the global VSCode settings.