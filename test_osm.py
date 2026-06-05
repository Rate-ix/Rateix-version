import urllib.request
import urllib.parse
import json

lat = 28.7041
lng = 77.1025
radius = 5000

osm_filters = ['node["shop"="electronics"]']
clauses = ''
for f in osm_filters:
    clauses += f'  {f}(around:{radius},{lat},{lng});\n'

overpass_query = f'''[out:json][timeout:15];
(
{clauses}
);
out center;'''

req_url = 'https://overpass-api.de/api/interpreter'
data = urllib.parse.urlencode({'data': overpass_query}).encode('utf-8')
req = urllib.request.Request(req_url, data=data, headers={'User-Agent': 'RetixApp/1.0'})
try:
    with urllib.request.urlopen(req, timeout=12) as response:
        res_data = json.loads(response.read().decode('utf-8'))
        print("Found elements:", len(res_data.get('elements', [])))
except Exception as e:
    print(e)
