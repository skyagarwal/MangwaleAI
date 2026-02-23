import mysql.connector
import re

def parse_wkt(wkt):
    if not wkt or not wkt.startswith('POLYGON'):
        return []
    content = wkt.replace('POLYGON((', '').replace('))', '')
    points = []
    for pair in content.split(','):
        parts = pair.strip().split(' ')
        points.append((float(parts[0]), float(parts[1])))
    return points

def is_point_in_polygon(x, y, polygon):
    inside = False
    n = len(polygon)
    p1x, p1y = polygon[0]
    for i in range(n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

try:
    conn = mysql.connector.connect(
        host=os.getenv("MYSQL_HOST", "103.86.176.59"),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", "root_password"),
        database=os.getenv("MYSQL_DATABASE", "mangwale_db")
    )
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, ST_AsText(coordinates) as coordinates FROM zones WHERE status = 1")
    rows = cursor.fetchall()
    
    lat = 19.9975
    lon = 73.7898
    print(f"Checking point: {lat}, {lon}")
    
    found_zone = None
    for row in rows:
        poly = parse_wkt(row['coordinates'])
        if is_point_in_polygon(lon, lat, poly):
            print(f"Point is in Zone ID: {row['id']}")
            found_zone = row['id']
            break
            
    if not found_zone:
        print("Point is NOT in any zone.")
        
    conn.close()

except Exception as e:
    print(f"Error: {e}")
