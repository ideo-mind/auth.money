#!/usr/bin/env python3
"""
Expire Pots EVM - Script to expire all eligible active pots
Attempts to expire every active pot that has passed its expiration time
"""

import asyncio
import json
import os
import sys
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv
from web3 import Web3
import time
from datetime import datetime

# Load environment variables
load_dotenv()

# Configuration
MONEY_AUTH_URL = os.getenv("MONEY_AUTH_URL", "https://auth.money-pot.ideomind.org")
CHAIN_ID = int(os.getenv("CHAIN_ID", "102031"))  # Testnet chain ID

EVM_PRIVATE_KEY = os.getenv("EVM_PRIVATE_KEY")

# Dynamic configuration (will be fetched from /chains endpoint)
EVM_RPC_URL = None
CONTRACT_ADDRESS = None
EXPLORER_URL = None

# Load the real MoneyPot Contract ABI from JSON file
def load_money_pot_abi():
    """Load the real MoneyPot ABI from the JSON file"""
    abi_path = os.path.join(os.path.dirname(__file__), '..', 'src', 'abis', 'MoneyPot.json')
    try:
        with open(abi_path, 'r') as f:
            abi_data = json.load(f)
            return abi_data['abi']
    except FileNotFoundError:
        print(f"Warning: Could not find ABI file at {abi_path}")
        print("Using simplified ABI for demo purposes")
        raise RuntimeError("abi not found")

MONEY_POT_ABI = load_money_pot_abi()

def get_transaction_receipt(w3: Web3, tx_hash: str) -> Dict[str, Any]:
    """Get transaction receipt and return as dictionary"""
    receipt = w3.eth.get_transaction_receipt(tx_hash)
    return {
        'transactionHash': receipt.transactionHash.hex(),
        'blockNumber': receipt.blockNumber,
        'status': receipt.status,
        'gasUsed': receipt.gasUsed,
        'logs': receipt.logs
    }

def get_pot_info(contract, pot_id: int) -> Dict[str, Any]:
    """Get pot information from contract"""
    try:
        pot_data = contract.functions.getPot(pot_id).call()
        return {
            'id': pot_data[0],
            'creator': pot_data[1],
            'amount': pot_data[2],
            'fee': pot_data[3],
            'createdAt': pot_data[4],
            'expiresAt': pot_data[5],
            'isActive': pot_data[6],
            'attemptsCount': pot_data[7],
            'oneFaAddress': pot_data[8]
        }
    except Exception as e:
        print(f"Error getting pot info: {e}")
        return {}

def get_active_pots(contract) -> list[int]:
    """Get list of active pot IDs"""
    try:
        return contract.functions.getActivePots().call()
    except Exception as e:
        print(f"Error getting active pots: {e}")
        return []

async def fetch_chain_config(base_url: str, chain_id: int) -> Dict[str, Any]:
    """Fetch chain configuration from the /chains endpoint"""
    import aiohttp
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{base_url}/chains") as response:
            if response.status != 200:
                raise RuntimeError(f"Failed to fetch chains info: {response.status}")
            
            chains_data = await response.json()
            supported_chains = chains_data.get('supportedChains', [])
            
            # Find the chain configuration for the specified chain ID
            for chain in supported_chains:
                if chain['chainId'] == chain_id:
                    return chain
            
            raise RuntimeError(f"Chain ID {chain_id} not found in supported chains")

def load_account_from_env(key_name: str) -> Optional[Any]:
    """Load account from environment variable"""
    from eth_account import Account
    
    private_key = os.getenv(key_name)
    if not private_key:
        print(f"⚠️  {key_name} is not set")
        return None

    # Add proper 0x prefix if not present
    if not private_key.startswith('0x'):
        private_key = '0x' + private_key

    # Create account from private key
    account = Account.from_key(private_key)
    print(f"✅ Loaded account: {account.address} from {key_name}")
    return account

def format_token_amount(amount_wei: int) -> str:
    """Format wei amount to human-readable token amount"""
    token_amount = amount_wei / (10 ** 18)
    if token_amount >= 1:
        return f"{token_amount:.6f}"
    else:
        return f"{token_amount:.18f}".rstrip('0').rstrip('.')

def format_timestamp(timestamp: int) -> str:
    """Format Unix timestamp to readable datetime"""
    return datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S')

class ExpirePotsApp:
    """Application class for expiring pots on EVM"""
    
    def __init__(self):
        self.w3 = None
        self.contract = None
        self.account = None
        self.results = []
    
    def format_token_amount(self, amount_wei: int) -> str:
        """Format wei amount to human-readable token amount"""
        token_amount = amount_wei / (10 ** 18)
        if token_amount >= 1:
            return f"{token_amount:.6f}"
        else:
            return f"{token_amount:.18f}".rstrip('0').rstrip('.')
    
    async def initialize(self):
        """Initialize the application"""
        print("🚀 Initializing Expire Pots EVM Application...")
        print("=" * 50)
        
        # Fetch chain configuration from /chains endpoint
        print(f"📡 Fetching chain configuration for chain ID: {CHAIN_ID}")
        chain_config = await fetch_chain_config(MONEY_AUTH_URL, CHAIN_ID)
        
        # Extract configuration
        global EVM_RPC_URL, CONTRACT_ADDRESS, EXPLORER_URL
        EVM_RPC_URL = chain_config['rpcUrl']
        CONTRACT_ADDRESS = chain_config['contractAddress']
        EXPLORER_URL = chain_config['explorerUrl']
        
        print(f"✅ Chain: {chain_config['name']} ({chain_config['type']})")
        print(f"✅ Contract: {CONTRACT_ADDRESS}")
        print(f"✅ Explorer: {EXPLORER_URL}")
        
        # Initialize Web3 with fetched RPC URL
        self.w3 = Web3(Web3.HTTPProvider(EVM_RPC_URL))
        if not self.w3.is_connected():
            raise RuntimeError(f"Failed to connect to EVM RPC: {EVM_RPC_URL}")
        
        print(f"✅ Connected to EVM chain: {CHAIN_ID}")
        
        # Try to load account (any account that has permission to expire)
        self.account = load_account_from_env("EVM_PRIVATE_KEY")
        
        if not self.account:
            print("⚠️  No account configured for expiring pots")
            print("   Set EVM_PRIVATE_KEY to expire pots")
        
        # Initialize contract with fetched contract address
        self.contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(CONTRACT_ADDRESS),
            abi=MONEY_POT_ABI
        )
        
        print("=" * 50)
    
    def check_pot_expired(self, pot_info: Dict[str, Any]) -> bool:
        """Check if a pot has expired based on its expiresAt timestamp"""
        current_time = int(time.time())
        expires_at = pot_info.get('expiresAt', 0)
        
        # Pot is expired if current time >= expiresAt
        return current_time >= expires_at
    
    async def attempt_expire_pot(self, pot_id: int) -> Dict[str, Any]:
        """Attempt to expire a pot"""
        result = {
            'pot_id': pot_id,
            'status': 'skipped',
            'reason': '',
            'tx_hash': None,
            'error': None
        }
        
        if not self.account:
            result['reason'] = 'No account configured'
            return result
        
        try:
            # Get pot info
            pot_info = get_pot_info(self.contract, pot_id)
            if not pot_info:
                result['reason'] = 'Could not fetch pot info'
                return result
            
            # Check if pot is active
            if not pot_info.get('isActive', False):
                result['reason'] = 'Pot not active'
                return result
            
            # Build and send transaction
            nonce = self.w3.eth.get_transaction_count(self.account.address, 'pending')
            gas_price = self.w3.eth.gas_price

            transaction = self.contract.functions.expirePot(pot_id).build_transaction({
                'from': self.account.address,
                'gas': 300000,
                'gasPrice': gas_price,
                'nonce': nonce,
                'chainId': CHAIN_ID
            })
            
            # Sign and send transaction
            signed_txn = self.w3.eth.account.sign_transaction(transaction, self.account.key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_txn.raw_transaction)
            
            result['status'] = 'success'
            result['tx_hash'] = f"0x{tx_hash.hex()}"
            
            # Wait for confirmation
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
            result['block_number'] = receipt.blockNumber
            result['gas_used'] = receipt.gasUsed
            
            if receipt.status == 0:
                result['status'] = 'failed'
                result['reason'] = 'Transaction failed'
            
        except Exception as e:
            result['status'] = 'failed'
            result['error'] = str(e)
            result['reason'] = f"Error: {e}"
        
        return result
    
    async def run_expire_flow(self):
        """Run the complete expire pots flow"""
        try:
            # Initialize
            await self.initialize()
            
            # Get all active pots
            print("\n📋 Fetching active pots...")
            active_pots = get_active_pots(self.contract)
            print(f"✅ Found {len(active_pots)} active pots")
            
            if not active_pots:
                print("✅ No active pots to process")
                return
            
            # Process each pot
            print("\n⏳ Processing pots...")
            print("-" * 50)
            
            current_time = int(time.time())
            
            for pot_id in active_pots:
                print(f"\n🔍 Processing pot {pot_id}...")
                
                # Get pot info
                pot_info = get_pot_info(self.contract, pot_id)
                if not pot_info:
                    self.results.append({
                        'pot_id': pot_id,
                        'status': 'error',
                        'reason': 'Could not fetch pot info'
                    })
                    continue
                
                # Check if pot has expired
                is_expired = self.check_pot_expired(pot_info)
                
                if is_expired:
                    print(f"   ⏰ Expired: expiresAt={format_timestamp(pot_info.get('expiresAt', 0))}")
                    
                    # Attempt to expire
                    result = await self.attempt_expire_pot(pot_id)
                    result['pot_info'] = pot_info
                    result['expires_at'] = pot_info.get('expiresAt', 0)
                    
                    if result['status'] == 'success':
                        print(f"   ✅ Successfully expired! TX: {result.get('tx_hash', 'N/A')}")
                        print(f"   🔗 Explorer: {EXPLORER_URL}/tx/{result.get('tx_hash', '')}")
                    else:
                        print(f"   ❌ Failed to expire: {result.get('reason', 'Unknown error')}")
                    
                    self.results.append(result)
                else:
                    expires_at = pot_info.get('expiresAt', 0)
                    time_left = expires_at - current_time
                    hours_left = time_left // 3600
                    minutes_left = (time_left % 3600) // 60
                    
                    print(f"   ⏳ Not expired yet (expires in {hours_left}h {minutes_left}m)")
                    self.results.append({
                        'pot_id': pot_id,
                        'status': 'not_expired',
                        'expires_at': expires_at,
                        'time_left': f"{hours_left}h {minutes_left}m",
                        'pot_info': pot_info
                    })
            
            # Display results table
            print("\n" + "=" * 80)
            print("📊 Results Summary")
            print("=" * 80)
            self.display_results_table()
            
        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()
    
    def display_results_table(self):
        """Display results in a formatted table"""
        if not self.results:
            print("No results to display")
            return
        
        # Prepare table data
        table_data = []
        
        for result in self.results:
            pot_info = result.get('pot_info', {})
            pot_id = result.get('pot_id', 'N/A')
            status = result.get('status', 'unknown')
            
            # Create status emoji
            status_emoji = {
                'success': '✅',
                'not_expired': '⏳',
                'skipped': '⏭️',
                'failed': '❌',
                'error': '⚠️'
            }.get(status, '❓')
            
            # Format amount
            amount = pot_info.get('amount', 0)
            amount_formatted = self.format_token_amount(amount) if amount > 0 else '0'
            
            # Format expires time
            expires_at = result.get('expires_at', 0)
            if expires_at > 0:
                expires_str = format_timestamp(expires_at)
            else:
                expires_str = 'N/A'
            
            # Get attempt count
            attempts = pot_info.get('attemptsCount', 0)
            
            # Get creator address (shortened)
            creator = pot_info.get('creator', 'N/A')
            creator_short = f"{creator[:6]}...{creator[-4:]}" if len(creator) > 10 else creator
            
            # Get transaction hash (shortened)
            tx_hash = result.get('tx_hash', '')
            tx_hash_short = f"{tx_hash[:10]}..." if len(tx_hash) > 10 else tx_hash
            
            table_data.append([
                str(pot_id),
                f"{status_emoji} {status}",
                amount_formatted,
                expires_str,
                str(attempts),
                creator_short,
                tx_hash_short
            ])
        
        # Create table headers
        headers = ['Pot ID', 'Status', 'Amount', 'Expires At', 'Attempts', 'Creator', 'TX Hash']
        
        # Display table with custom formatting
        self._print_table(headers, table_data)
    
    def _print_table(self, headers, rows):
        """Print a simple table without external dependencies"""
        # Calculate column widths
        col_widths = []
        for i, header in enumerate(headers):
            max_width = len(header)
            for row in rows:
                if i < len(row):
                    max_width = max(max_width, len(str(row[i])))
            col_widths.append(max_width + 2)  # Add padding
        
        # Print top border
        border = '+' + '+'.join(['-' * (w) for w in col_widths]) + '+'
        print(border)
        
        # Print header
        header_row = '|' + '|'.join([f" {headers[i]:<{col_widths[i]-1}}" for i in range(len(headers))]) + '|'
        print(header_row)
        
        # Print separator
        separator = '+' + '+'.join(['-' * (w) for w in col_widths]) + '+'
        print(separator)
        
        # Print rows
        for row in rows:
            padded_row = []
            for i in range(len(col_widths)):
                if i < len(row):
                    padded_row.append(f" {str(row[i]):<{col_widths[i]-1}}")
                else:
                    padded_row.append(" " * col_widths[i])
            print('|' + '|'.join(padded_row) + '|')
        
        # Print bottom border
        print(border)
        
        # Summary statistics
        print("\n📈 Summary Statistics:")
        print(f"   Total Pots Processed: {len(self.results)}")
        
        success_count = len([r for r in self.results if r.get('status') == 'success'])
        not_expired_count = len([r for r in self.results if r.get('status') == 'not_expired'])
        failed_count = len([r for r in self.results if r.get('status') == 'failed'])
        
        print(f"   ✅ Successfully Expired: {success_count}")
        print(f"   ⏳ Not Yet Expired: {not_expired_count}")
        print(f"   ❌ Failed to Expire: {failed_count}")
        
        # Total gas used
        total_gas = sum([r.get('gas_used', 0) for r in self.results if r.get('gas_used')])
        if total_gas > 0:
            print(f"   💸 Total Gas Used: {total_gas:,}")
        
        print("=" * 80)

async def main():
    """Main entry point"""
    print("Expire Pots EVM - Script")
    print("=" * 80)
    
    app = ExpirePotsApp()
    await app.run_expire_flow()
    
    print("\n✅ Script completed!")

if __name__ == "__main__":
    asyncio.run(main())

