from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from database import get_session
from models import Transaction, Grain, Warehouse
from typing import List, Dict, Any
from logger import get_logger
logger = get_logger("inventory")

router = APIRouter(prefix="/inventory", tags=["inventory"])

@router.get("/", response_model=List[Dict[str, Any]])
def get_inventory_status(session: Session = Depends(get_session)):
    transactions = session.exec(select(Transaction)).all()
    grains = session.exec(select(Grain)).all()
    warehouses = session.exec(select(Warehouse)).all()

    # Pre-fetch maps
    grain_map = {g.id: g for g in grains}
    wh_map = {w.id: w for w in warehouses}

    # Data Structure:
    # {
    #   grain_id: {
    #       total_bags: 0,
    #       total_quintal: 0,
    #       purchased_value: 0,
    #       purchased_qty: 0,
    #       warehouses: {
    #           wh_id: { bags: 0, quintal: 0 }
    #       }
    #   }
    # }
    inventory = {}

    for trx in transactions:
        gid = trx.grain_id
        wid = trx.warehouse_id
        
        if gid not in inventory:
            inventory[gid] = {
                "total_bags": 0,
                "total_quintal": 0.0,
                "purchased_value": 0.0,
                "purchased_qty": 0.0,
                "warehouses": {}
            }
        
        # Initialize warehouse entry if needed
        if wid not in inventory[gid]["warehouses"]:
            inventory[gid]["warehouses"][wid] = {"bags": 0, "quintal": 0.0}

        qty = trx.quantity_quintal
        # We ignore stored 'number_of_bags' for inventory display as per new requirement
        # We rely on Net Weight to calculate Bags + Loose dynamically

        if trx.type == 'purchase':
            inventory[gid]["total_quintal"] += qty
            
            # Warehouse specific
            inventory[gid]["warehouses"][wid]["quintal"] += qty
            
            # Avg Price Calc
            inventory[gid]["purchased_value"] += (qty * trx.rate_per_quintal)
            inventory[gid]["purchased_qty"] += qty
            
        elif trx.type == 'sale':
            inventory[gid]["total_quintal"] -= qty
            
            # Warehouse specific
            inventory[gid]["warehouses"][wid]["quintal"] -= qty
            
    # Format result
    result = []
    for gid, data in inventory.items():
        grain_obj = grain_map.get(gid)
        if not grain_obj: continue
        
        # Calculate derived bags and loose
        std_bharti = grain_obj.standard_bharti or 60.0
        
        # Total
        net_weight_kg = data["total_quintal"] * 100
        total_bags = int(net_weight_kg // std_bharti)
        loose_kg = net_weight_kg % std_bharti
        
        avg_price = 0
        if data["purchased_qty"] > 0 and data["total_quintal"] > 0.01:
            avg_price = data["purchased_value"] / data["purchased_qty"]
            
        # Format warehouses list
        wh_list = []
        for wid, stats in data["warehouses"].items():
            wh_obj = wh_map.get(wid)
            # Filter zero/near-zero
            if wh_obj and abs(stats["quintal"]) > 0.001:
                w_net_kg = stats["quintal"] * 100
                w_bags = int(w_net_kg // std_bharti)
                w_loose = w_net_kg % std_bharti
                
                wh_list.append({
                    "id": wid,
                    "name": wh_obj.name,
                    "bags": w_bags,
                    "loose_kg": round(w_loose, 2),
                    "quintal": stats["quintal"]
                })
        
        result.append({
            "grain_id": gid,
            "grain_name": grain_obj.name,
            "hindi_name": grain_obj.hindi_name,
            "total_bags": total_bags,
            "loose_kg": round(loose_kg, 2),
            "standard_bharti": std_bharti,
            "total_quintal": data["total_quintal"],
            "average_price": avg_price,
            "warehouses": wh_list
        })
        
    return result
