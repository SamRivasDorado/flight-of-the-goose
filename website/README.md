# Goose website

The public website for Goose: one page with five tabs (Overview, Features, Why Goose, Security, FAQ). Plain HTML and CSS with a few lines of script, no build step.

- `index.html` — the whole site. Colours follow the app's "Goose feather" palette; fonts are Fraunces and Geologica, as in the app.
- `img/app/` — screenshots of the app, light and dark (`*-dark.webp`), taken from a demo workspace for an invented company, Alder Ridge Consulting. Every person, client and project in them is made up.
- `img/goose.svg` — the goose traced as a vector drawing from `public/goose-tile-512.png`, so it stays sharp at any size. The page embeds the same drawing.

## How it is published

The workflow `.github/workflows/pages.yml` puts this folder at the root of https://flightofthegoose.com and the built app under `/app/` (the "Sign in" and "Get started" buttons link there). It also writes the `CNAME` file for the domain.
