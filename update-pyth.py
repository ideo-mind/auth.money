#!/usr/bin/env python3
"""
Update Pyth Price Feed Script
Fetches latest price update data from Pyth and updates the price feed on-chain

Usage:
    1. Set the EVM_PRIVATE_KEY environment variable:
       export EVM_PRIVATE_KEY=0x...your_private_key
    
    2. (Optional) Set EVM_RPC_URL for different network:
       export EVM_RPC_URL=https://sepolia.gateway.tenderly.co
    
    3. Run the script:
       python update-pyth.py

Configuration:
    Price ID: 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
    Pyth Instance: 0xDd24F84d36BF92C65F92307595335bdFab5Bbd21
"""

import os
import sys
from dotenv import load_dotenv
from eth_account import Account
from web3 import Web3
import aiohttp
import asyncio

# Load environment variables
load_dotenv()

# Configuration
PRIVATE_KEY_ENV = "EVM_PRIVATE_KEY"
PYTH_PRICE_ID = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"
PYTH_INSTANCE = "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21"

# RPC URL - defaulting to CreditCoin testnet
RPC_URL = os.getenv("EVM_RPC_URL", "https://sepolia.gateway.tenderly.co")


async def fetch_pyth_price_data(price_id: str) -> tuple[list, int]:
    """
    Fetch price update data from Pyth's Hermes public API
    
    Args:
        price_id: The price feed ID to fetch
        
    Returns:
        tuple: (price_update_data list, update_fee in wei)
    """
    try:
        # Pyth Hermes public endpoint - get latest price update data
        # Format the price ID properly (it's already hex with 0x prefix)
        clean_price_id = price_id[2:] if price_id.startswith('0x') else price_id
        
        # Try different endpoint formats
        endpoints_to_try = [
            f"https://hermes.pyth.network/v2/updates/price/latest?ids[]=0x{clean_price_id}",
            f"https://hermes.pyth.network/v2/updates/price/latest?ids[]={clean_price_id}",
            f"https://hermes.pyth.network/v2/updates/price/{price_id}",
        ]
        
        data = None
        last_error = None
        
        for api_url in endpoints_to_try:
            print(f"📡 Trying: {api_url}")
            
            async with aiohttp.ClientSession() as session:
                async with session.get(api_url) as response:
                    print(f"   Status: {response.status}")
                    
                    if response.status == 200:
                        data = await response.read()
                        print(f"✅ Fetched price update data: {len(data)} bytes")
                        break
                    else:
                        error_text = await response.text()
                        last_error = f"{response.status} - {error_text[:100]}"
                        print(f"   ❌ Failed: {last_error}")
        
        if data is None:
            raise Exception(f"Failed to fetch price data from all endpoints. Last error: {last_error}")
        
        # The update fee is typically around 0.001 ETH or less
        # We'll fetch it from the contract or use a reasonable estimate
        estimate_fee = Web3.to_wei(0.001, 'ether')
        
        return [data], estimate_fee
                
    except Exception as e:
        print(f"❌ Error fetching Pyth price data: {e}")
        import traceback
        traceback.print_exc()
        raise


def get_update_fee(w3: Web3, pyth_address: str, price_update_data: list) -> int:
    """
    Get the required fee for updating price feeds from the Pyth contract
    
    Args:
        w3: Web3 instance
        pyth_address: Pyth contract address
        price_update_data: List of price update data
        
    Returns:
        Fee amount in wei
    """
    try:
        # Minimal Pyth ABI for getUpdateFee function
        pyth_abi = [
            {
                "constant": True,
                "inputs": [{"name": "priceUpdateData", "type": "bytes[]"}],
                "name": "getUpdateFee",
                "outputs": [{"name": "", "type": "uint256"}],
                "type": "function"
            }
        ]
        
        pyth_contract = w3.eth.contract(address=Web3.to_checksum_address(pyth_address), abi=pyth_abi)
        fee = pyth_contract.functions.getUpdateFee(price_update_data).call()
        print(f"✅ Fetched update fee: {Web3.from_wei(fee, 'ether')} ETH ({fee} wei)")
        return fee
        
    except Exception as e:
        print(f"⚠️  Could not fetch update fee from contract: {e}")
        # Use reasonable estimate
        estimate = Web3.to_wei(0.001, 'ether')
        print(f"Using estimated fee: {Web3.from_wei(estimate, 'ether')} ETH")
        return estimate


def create_price_update_tx(w3: Web3, pyth_address: str, price_update_data: list, update_fee: int) -> dict:
    """
    Create a transaction to update the price feed
    
    Args:
        w3: Web3 instance
        pyth_address: Pyth contract address
        price_update_data: List of price update data
        update_fee: Fee to send with transaction
        
    Returns:
        Transaction dictionary
    """
    # Pyth ABI for updatePriceFeeds function
    pyth_abi = [
        {
            "constant": False,
            "inputs": [{"name": "priceUpdateData", "type": "bytes[]"}],
            "name": "updatePriceFeeds",
            "outputs": [],
            "payable": True,
            "stateMutability": "payable",
            "type": "function"
        }
    ]
    
    pyth_contract = w3.eth.contract(address=Web3.to_checksum_address(pyth_address), abi=pyth_abi)
    
    # Estimate gas first
    try:
        estimated_gas = pyth_contract.functions.updatePriceFeeds(price_update_data).estimate_gas({
            'from': w3.eth.default_account,
            'value': update_fee
        })
        gas_limit = int(estimated_gas * 1.2)  # Add 20% buffer
        print(f"✅ Estimated gas: {estimated_gas}, using: {gas_limit}")
    except Exception as e:
        print(f"⚠️  Could not estimate gas: {e}")
        gas_limit = 500000  # Safe default
    
    # Build the transaction
    tx = pyth_contract.functions.updatePriceFeeds(price_update_data).build_transaction({
        'from': w3.eth.default_account,
        'value': update_fee,
        'gas': gas_limit,
        'gasPrice': w3.eth.gas_price,
        'nonce': w3.eth.get_transaction_count(w3.eth.default_account, 'pending'),
        'chainId': w3.eth.chain_id
    })
    
    return tx


async def update_pyth_price():
    """Main function to update Pyth price feed"""
    try:
        # Load private key from environment
        private_key = os.getenv(PRIVATE_KEY_ENV)
        if not private_key:
            raise RuntimeError(f"{PRIVATE_KEY_ENV} environment variable is not set")
        
        # Add 0x prefix if not present
        if not private_key.startswith('0x'):
            private_key = '0x' + private_key
        
        # Create account from private key
        account = Account.from_key(private_key)
        print(f"✅ Loaded account: {account.address}")
        
        # Initialize Web3
        w3 = Web3(Web3.HTTPProvider(RPC_URL))
        w3.eth.default_account = account.address
        
        # Check connection
        if not w3.is_connected():
            raise ConnectionError(f"Failed to connect to RPC: {RPC_URL}")
        
        print(f"✅ Connected to chain: {w3.eth.chain_id}")
        
        # Fetch price update data
        print(f"📡 Fetching price data for: {PYTH_PRICE_ID}")
        price_update_data, _ = await fetch_pyth_price_data(PYTH_PRICE_ID)
        
        # Get the required update fee
        update_fee = get_update_fee(w3, PYTH_INSTANCE, price_update_data)
        
        # If fee is 0, use a small minimum to ensure transaction goes through
        # Pyth updates typically cost a small amount
        if update_fee == 0:
            update_fee = Web3.to_wei(0.0001, 'ether')  # 0.0001 ETH = small fee
            print(f"⚠️  Fee was 0, using minimum: {Web3.from_wei(update_fee, 'ether')} ETH")
        
        # Check balance
        balance = w3.eth.get_balance(account.address)
        print(f"💰 Account balance: {Web3.from_wei(balance, 'ether')} ETH")
        
        if balance < update_fee:
            raise RuntimeError(f"Insufficient balance. Need {Web3.from_wei(update_fee, 'ether')} ETH, have {Web3.from_wei(balance, 'ether')} ETH")
        
        # Create transaction
        print("📝 Creating update transaction...")
        tx = create_price_update_tx(w3, PYTH_INSTANCE, price_update_data, update_fee)
        
        # Sign and send transaction
        print("🔐 Signing transaction...")
        signed_tx = w3.eth.account.sign_transaction(tx, private_key)
        
        print("📤 Sending transaction...")
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        
        print(f"⏳ Transaction sent: {tx_hash.hex()}")
        print(f"⏳ Waiting for confirmation...")
        
        # Wait for transaction receipt
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        
        if receipt.status == 1:
            print(f"✅ Transaction confirmed!")
            print(f"   Block: {receipt.blockNumber}")
            print(f"   Gas used: {receipt.gasUsed}")
        else:
            print(f"❌ Transaction failed!")
            print(f"   Transaction hash: {tx_hash.hex()}")
            print(f"   Gas used: {receipt.gasUsed}")
            print(f"   Block: {receipt.blockNumber}")
            
            # Try to decode the failure reason
            try:
                tx = w3.eth.get_transaction(tx_hash)
                print(f"   From: {tx['from']}")
                print(f"   To: {tx['to']}")
                print(f"   Value: {Web3.from_wei(tx['value'], 'ether')} ETH")
                print(f"   Gas: {tx['gas']}")
                
                # Try to decode the error
                if receipt.gasUsed < tx['gas']:
                    print(f"   Transaction reverted (used {receipt.gasUsed} of {tx['gas']} gas)")
            except Exception as e:
                print(f"   Could not get transaction details: {e}")
            
            sys.exit(1)
            
    except Exception as e:
        print(f"❌ Error updating Pyth price: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(update_pyth_price())

