import urllib.parse
import traceback
import re
from playwright.async_api import async_playwright

async def search_google_maps(lat: float, lng: float, query: str, city: str = None):
    """Scrape Google Maps results using Playwright Async API"""
    try:
        if city and city.strip():
            q = urllib.parse.quote(query + f" in {city.strip()}")
        else:
            q = urllib.parse.quote(query + f" near {lat},{lng}")
        url = f"https://www.google.com/maps/search/{q}/"
        print(f"Fetching {url} using Playwright")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            page = await context.new_page()
            
            await page.goto(url, timeout=30000)
            
            try:
                # Wait for the results panel to load
                await page.wait_for_selector('a[href*="/maps/place/"]', timeout=15000)
            except Exception as e:
                print("Could not find place links within timeout, will try alternative parsing")
            
            elements = await page.locator('a[href*="/maps/place/"]').all()
            
            results = []
            seen = set()
            for el in elements:
                name = await el.get_attribute("aria-label")
                if not name or name in seen:
                    continue
                seen.add(name)
                
                href = await el.get_attribute("href")
                el_lat = None
                el_lng = None
                if href:
                    match = re.search(r'@([0-9.-]+),([0-9.-]+)', href)
                    if match:
                        el_lat = float(match.group(1))
                        el_lng = float(match.group(2))
                
                results.append({
                    "name": name,
                    "address": f"Google Maps Result ({el_lat}, {el_lng})" if el_lat else f"Near {city or lat}",
                    "lat": el_lat,
                    "lng": el_lng
                })
                
                if len(results) >= 8:
                    break
                    
            await browser.close()
            print(f"Playwright returned {len(results)} results")
            return results
    except Exception as e:
        print(f"Playwright scraper crashed: {e}")
        traceback.print_exc()
        return []

if __name__ == "__main__":
    import asyncio
    res = asyncio.run(search_google_maps(28.61, 76.98, "wholesale suppliers", "Najafgarh"))
    for r in res[:10]:
        print(r)
