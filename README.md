# Monsoon Mode

Live rain and weather for Chennai, Madurai, Trichy and Bengaluru, in plain words. Made for phones first, and readable for every age.

**Status:** Today and This week (with the live map) are built. Be ready is next.

## What the Today page does

| Part | What it shows |
|---|---|
| Welcome and location | Your name, and your neighbourhood (with location on) or your chosen city |
| Alerts bell and banner | Warnings worked out from the forecast, plus links to official alerts |
| Verdict | One plain sentence, such as "Carry an umbrella", chosen by rules from the live data |
| Current weather | Temperature, condition, rain chance, humidity, wind. "Read more" adds the next 6 hours and what each number means |
| Rain news | The latest local rain headlines, with the outlet's name and a link |
| Live sky | The background matches the real weather: clouds, rain at the real intensity, and a soft glow during thunderstorms |

## What the This week page does

| Part | What it shows |
|---|---|
| Live map | Windy's live weather map centred on your place, with a layer menu (rain and thunder, wind, temperature, clouds, rain total, humidity) and a colour scale matching Windy's |
| Rain chart | Expected rain for the next 6 days, drawn by hand in SVG, with the chance of rain above each bar and IMD's heavy-rain line |
| Day list | Tomorrow plus 5 days: condition, high and low, rain chance. Tap a day for a frosted pop-up with humidity, gusts, feels-like, how the day changes (morning, afternoon, evening, night) and sunrise and sunset |

On a laptop the map and the report sit side by side. On a phone the map has its own tab.

## Where the data comes from

- **Weather:** [Open-Meteo](https://open-meteo.com/), free, no key.
- **Place names:** [BigDataCloud](https://www.bigdatacloud.com/) free reverse geocoding, called only with the user's own location.
- **Rain categories:** India Meteorological Department (IMD) 24-hour rainfall scale.
- **Live map:** [Windy](https://www.windy.com/) free embed.
- **News:** Google News search feeds, collected by a GitHub Action every 30 minutes (`scripts/fetch_news.py`), because a browser can't read news feeds from other sites directly.

Warnings in the app are estimates from forecast data, not official alerts. The app links to SACHET (NDMA), IMD Chennai and INCOIS for those.

## Privacy

Only your name, your chosen city and your °C/°F choice are saved, in your own browser. There are no accounts.

## Publish on GitHub Pages

1. Push this folder to a GitHub repo.
2. In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` publishes the site and refreshes the news every 30 minutes.

Opened straight from your computer, everything works except the news, which needs the Action.

## Built with

Plain HTML, CSS and JavaScript. Font: Google Sans Flex. Every icon is drawn in code.

## Author

Shreya, first-year B.Tech CSE at SRM University, Ramapuram. Built with Claude as a pair programmer.
