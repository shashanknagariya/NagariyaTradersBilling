from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from database import get_session
from models import Transaction, Grain, Warehouse
from typing import List, Dict, Any

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
        bags = trx.number_of_bags or 0 # Handle legacy/null

        if trx.type == 'purchase':
            inventory[gid]["total_bags"] += bags
            inventory[gid]["total_quintal"] += qty
            
            # Warehouse specific
            inventory[gid]["warehouses"][wid]["bags"] += bags
            inventory[gid]["warehouses"][wid]["quintal"] += qty
            
            # Avg Price Calc (Only add purchases)
            # Use Gross Amount (Cost to Company) = Qty * Rate
            # (Previously used total_amount which was Net Payout after Labour deduction)
            inventory[gid]["purchased_value"] += (qty * trx.rate_per_quintal)
            inventory[gid]["purchased_qty"] += qty
            
        elif trx.type == 'sale':
            inventory[gid]["total_bags"] -= bags
            inventory[gid]["total_quintal"] -= qty
            
            # Warehouse specific
            inventory[gid]["warehouses"][wid]["bags"] -= bags
            inventory[gid]["warehouses"][wid]["quintal"] -= qty

    # Format result
    result = []
    for gid, data in inventory.items():
        grain_obj = grain_map.get(gid)
        if not grain_obj: continue
        
        avg_price = 0
        if data["purchased_qty"] > 0:
            avg_price = data["purchased_value"] / data["purchased_qty"]
            
        # Format warehouses list
        wh_list = []
        for wid, stats in data["warehouses"].items():
            wh_obj = wh_map.get(wid)
            if wh_obj and (stats["bags"] != 0 or stats["quintal"] != 0):
                wh_list.append({
                    "id": wid,
                    "name": wh_obj.name,
                    "bags": stats["bags"],
                    "quintal": stats["quintal"]
                })
        
        result.append({
            "grain_id": gid,
            "grain_name": grain_obj.name,
            "hindi_name": grain_obj.hindi_name,
            "total_bags": data["total_bags"],
            "total_quintal": data["total_quintal"],
            "average_price": avg_price,
            "warehouses": wh_list
        })
        
    return result
