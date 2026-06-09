import asyncio
from playwright.async_api import async_playwright

async def scrape_blinkit(query):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        page = await context.new_page()
        print(f"Navigating to blinkit search for {query}...")
        # Just searching without location might prompt location modal, but blinkit usually shows some defaults.
        # Alternatively we can scrape a generic page or category. Let's try searching.
        await page.goto(f"https://blinkit.com/s/?q={query}", timeout=30000)
        await page.wait_for_timeout(3000)
        
        products = await page.locator('.Product__Container-sc-11dk8zl-0').all()
        results = []
        for el in products[:8]:
            try:
                name = await el.locator('.Product__UpdatedTitle-sc-11dk8zl-9').inner_text()
                price = await el.locator('.ProductPrice__PriceContainer-sc-1wexgdb-0 div').first.inner_text()
                results.append({"name": name, "price": price})
            except Exception as e:
                pass
        
        await browser.close()
        return results

if __name__ == "__main__":
    res = asyncio.run(scrape_blinkit("groceries"))
    print(res)
