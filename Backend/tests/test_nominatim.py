import urllib.request
import urllib.parse
import json
import math

def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0  # Earth's radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

lat = 28.7041
lng = 77.1025
query = 'electronics'

url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(query + ' Delhi')}&format=json&limit=15&lat={lat}&lon={lng}"
req = urllib.request.Request(url, headers={'User-Agent': 'RetixApp/1.0'})
try:
    with urllib.request.urlopen(req, timeout=12) as response:
        res_data = json.loads(response.read().decode('utf-8'))
        print('Nominatim unbounded found:', len(res_data))
        for place in res_data:
            name = place.get("name")
            if not name:
                continue
            el_lat = float(place.get("lat"))
            el_lon = float(place.get("lon"))
            distance = calculate_haversine_distance(lat, lng, el_lat, el_lon)
            print(f"{name} ({distance:.0f}m): {place.get('display_name')}")
except Exception as e:
    print(e)
