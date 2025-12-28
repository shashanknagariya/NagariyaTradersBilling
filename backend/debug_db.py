import os
from dotenv import load_dotenv
from sqlalchemy.engine.url import make_url

load_dotenv()

url_str = os.getenv("DATABASE_URL")
if not url_str:
    print("DATABASE_URL not found in .env")
    exit()

try:
    url = make_url(url_str)
    print(f"Parsed Host: '{url.host}'")
    print(f"Parsed Port: '{url.port}'")
    print(f"Parsed User: '{url.username}'")
    print(f"Parsed Database: '{url.database}'")
    
    if url.password:
        masked = url.password[0] + "*" * (len(url.password)-2) + url.password[-1] if len(url.password) > 2 else "***"
        print(f"Parsed Password (Masked): {masked}")
    else:
        print("No password found")
        
except Exception as e:
    print(f"Error parsing URL: {e}")
