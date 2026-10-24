# Goose website

The public website for Goose: one page with five tabs (Overview, Features, Why Goose, Security, FAQ). Plain HTML and CSS with a few lines of script, no build step.

- `index.html` — the whole site. Colours follow the app's "Goose feather" palette; fonts are Fraunces and Geologica, as in the app.
- `img/app/` — screenshots of the app, light and dark (`*-dark.webp`), taken from a demo workspace for an invented company, Alder Ridge Consulting. Every person, client and project in them is made up.
- `img/goose.webp` — the goose mascot (transparent background), shown on Overview and Why Goose. The favicon and tiles are made from the same drawing. `img/goose.svg` is the older traced goose, no longer used by the page.

## How it is published

The workflow `.github/workflows/pages.yml` puts this folder at the root of https://flightofthegoose.com and the built app under `/app/` (the "Sign in" links go there; "Request access" is the form in the website itself, which saves the request in Supabase). It also writes the `CNAME` file for the domain.
