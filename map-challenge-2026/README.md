# Map challenge gallery

`map-challenge-2026.qmd` builds its grid from `maps.json`. One entry per day.

## Add a day

1. Make two JPEGs from the full PNG and put them in `img/`:

   ```sh
   sips -s format jpeg -s formatOptions 80 -Z 800  day04.png --out img/day04-thumb.jpg
   sips -s format jpeg -s formatOptions 82 -Z 2000 day04.png --out img/day04.jpg
   ```

2. Edit that day's entry in `maps.json`:

   ```json
   {
     "day": 4,
     "theme": "Clusters",
     "date": "2026-11-04",
     "title": "Map title",
     "blurb": "One or two sentences on what the map shows.",
     "alt": "What the image looks like, for screen readers.",
     "tags": ["Infra"],
     "image": "map-challenge-2026/img/day04.jpg",
     "thumb": "map-challenge-2026/img/day04-thumb.jpg",
     "live": null,
     "post": null,
     "status": "published"
   }
   ```

   `live` and `post` take a URL or `null`. Their buttons only appear when set. Tag chips are built from the tags on published days.

3. Render the page: `quarto render map-challenge-2026.qmd`.

Deep links: `map-challenge-2026.html#day-04`.
