import json
import urllib.request
import urllib.error

BASE_URL = "http://127.0.0.1:8000"

def test_analytics():
    print("Testing Analytics API (via urllib)...")
    
    # 1. Test Profit Summary (No Grouping)
    payload = {
        "report_type": "profit",
        "group_by": "none"
    }
    
    try:
        req = urllib.request.Request(
            f"{BASE_URL}/analytics/query", 
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                body = response.read().decode('utf-8')
                print("PASS: Profit Summary Response:")
                print(json.dumps(json.loads(body), indent=2))
            else:
                print(f"FAIL: {response.status}")
            
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.read().decode()}")
    except Exception as e:
        print(f"ERROR: {e}")

    # 2. Test Group By Grain
    print("\nTesting Group By Grain...")
    payload["group_by"] = "grain"
    try:
        req = urllib.request.Request(
            f"{BASE_URL}/analytics/query", 
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                if len(data["groups"]) > 0:
                    print(f"PASS: Got {len(data['groups'])} groups.")
                    print("Sample Group:", data["groups"][0])
                else:
                     print("WARN: No groups returned (maybe no sales data?)")
        
    except urllib.error.HTTPError as e:
         print(f"HTTP Error: {e.code} - {e.read().decode()}")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    test_analytics()
