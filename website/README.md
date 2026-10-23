# Goose website

The public website for Goose: one page with five tabs (Overview, Features, Why Goose, Security, FAQ). Plain HTML and CSS with a few lines of script, no build step.

- `index.html` — the whole site. Colours follow the app's "Goose feather" palette; fonts are Fraunces and Geologica, as in the app.
- `img/app/` — screenshots of the app, light and dark (`*-dark.webp`), taken from a demo workspace for an invented company, Alder Ridge Consulting. Every person, client and project in them is made up.
- `img/goose.svg` — the goose traced as a vector drawing from `public/goose-tile-512.png`, so it stays sharp at any size. The page embeds the same drawing.

## Links to the app

The "Sign in", "Get started" and "Create your workspace" buttons point to the app's current address,
https://samrivasdorado.github.io/flight-of-the-goose/. When Goose gets its own domain, change those links in `index.html`.

## Not published yet

GitHub Pages serves one site per repository, and today that site is the app. The plan for the own domain:
the website at the root of the domain and the app under `/app/` (or on `app.` + the domain). The publish workflow then copies this folder next to the built app.
