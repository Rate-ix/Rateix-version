import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

req = urllib.request.Request(
    'https://blinkit.com/v1/search/search_results?q=electronics',
    headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'app_client': 'consumer_web'
    }
)

try:
    with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
        data = json.loads(response.read().decode('utf-8'))
        print(data.keys())
        print("Success")
except Exception as e:
    print(f"Error: {e}")
