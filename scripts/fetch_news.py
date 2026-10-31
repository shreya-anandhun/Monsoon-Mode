"""
fetch_news.py - collects rain and weather headlines for each city.

Why this exists: a website on GitHub Pages runs only in the browser, and
browsers are not allowed to read news feeds from other sites directly.
So a GitHub Action runs this script on GitHub's computers every 30
minutes, saves the headlines into data/news.json, and the website reads
that file. No API keys are needed.

Source: Google News RSS search. We keep only the headline, the outlet's
name, the link and the time, and always link back to the original story.
"""
import json
import os
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

CITIES = {
    "chennai": "Chennai",
    "madurai": "Madurai",
    "trichy": "Trichy OR Tiruchirappalli",
    "bengaluru": "Bengaluru OR Bangalore",
}
TOPIC = "(rain OR flood OR waterlogging OR cyclone OR IMD OR thunderstorm)"
PER_CITY = 6
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "news.json")


def feed_url(city_query):
    q = f"({city_query}) {TOPIC} when:2d"
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": q, "hl": "en-IN", "gl": "IN", "ceid": "IN:en"}
    )


def parse(xml_bytes):
    """Turn an RSS feed into a list of simple dicts."""
    items = []
    root = ET.fromstring(xml_bytes)
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        source = (item.findtext("source") or "").strip()
        # Google adds " - Outlet name" to the end of every headline
        if source and title.endswith(" - " + source):
            title = title[: -len(" - " + source)]
        try:
            published = parsedate_to_datetime(item.findtext("pubDate")).astimezone(timezone.utc).isoformat()
        except (TypeError, ValueError):
            continue
        items.append({
            "title": title,
            "source": source or "News",
            "link": (item.findtext("link") or "").strip(),
            "published": published,
        })
    # newest first, no repeated headlines
    items.sort(key=lambda n: n["published"], reverse=True)
    seen, unique = set(), []
    for n in items:
        key = n["title"].lower()
        if key not in seen:
            seen.add(key)
            unique.append(n)
    return unique[:PER_CITY]


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "MonsoonMode/1.0 (student project)"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()


def main():
    data = {"updated": datetime.now(timezone.utc).isoformat(), "cities": {}}
    for key, query in CITIES.items():
        try:
            data["cities"][key] = parse(fetch(feed_url(query)))
            print(f"{key}: {len(data['cities'][key])} headlines")
        except Exception as err:  # one city failing should not stop the rest
            print(f"{key}: failed ({err})")
            data["cities"][key] = None  # None = "couldn't check", [] = "no news"
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
