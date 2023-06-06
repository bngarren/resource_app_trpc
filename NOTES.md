

## Viewing the Heroku postgres db
- Use pgweb as described here: https://stackoverflow.com/questions/51509499/how-do-i-view-a-postgresql-database-on-heroku-with-a-gui
- We installed via brew
- Launch it in browser via: `heroku config:get DATABASE_URL | xargs pgweb --url`