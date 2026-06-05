import urllib.request
import re

url = 'https://www.google.com/search?q=wholesale+electronics+Delhi&tbm=lcl&hl=en'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'})
try:
    with urllib.request.urlopen(req, timeout=12) as response:
        html = response.read().decode('utf-8')
        names = re.findall(r'<div class="OSrXXb">(.*?)</div>', html)
        if not names:
            names = re.findall(r'<div class="dbg0pd".*?>.*?<span>(.*?)</span>', html)
        if not names:
            # Let's just find anything in <div role="heading" ...>
            names = re.findall(r'<div role="heading"[^>]*><span>(.*?)</span></div>', html)
        print('Found names:', names[:10])
except Exception as e:
    print(e)
