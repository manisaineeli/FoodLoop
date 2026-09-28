# FoodLoop

FoodLoop is a browser-based prototype for the Food Waste Reduction Platform described in `OOADUML_final.pptx`. It represents the main OOAD flows in a lightweight, dependency-free interface:

- food providers publish surplus listings;
- NGOs and community partners send donation requests;
- teams coordinate pickups;
- waste entries and impact reports make the outcome visible.

## Live site

https://manisaineeli.github.io/FoodLoop/

The site is published with GitHub Pages from the `master` branch. Every push to `master` rebuilds and republishes automatically.

## Run it

Open `index.html` in a browser. No build step or dependency installation is required.

The interface is responsive and keeps newly created listings in the current session. The demo data is defined in `app.js`, making it easy to connect the screens to a Node/Express and MongoDB backend later.
