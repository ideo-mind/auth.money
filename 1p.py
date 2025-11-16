#!/usr/bin/env python3
"""
1P Protocol End-to-End Application
Integrates with the verifier service for complete 1P authentication flow on EVM chains
"""

import asyncio
import json
import os
import sys
from typing import Optional, Dict, Any
import aiohttp
from dotenv import load_dotenv
import base64
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from eth_account import Account
from web3 import Web3
import time
import random
import string

# Load environment variables
load_dotenv()

# Configuration
MONEY_AUTH_URL = os.getenv("MONEY_AUTH_URL", "https://auth.1p.ideomind.org")
CHAIN_ID = int(os.getenv("CHAIN_ID", "102031"))  # Creditcoin Testnet

ONEP_USER = os.getenv("1P_USER", "hiro1")
ONEP_PASSWORD = os.getenv("1P_PASSWORD", "1")

# Dynamic configuration (will be fetched from /chains endpoint)
EVM_RPC_URL = None
ONEP_CONTRACT_ADDRESS = None
VIEM_CONFIG = None
EXPLORER_URL = None

# Load the real OneP Contract ABI from JSON file
def load_onep_abi():
    """Load the real OneP ABI from the JSON file"""
    abi_path = os.path.join(os.path.dirname(__file__), 'src', 'abis', 'OneP.json')
    try:
        with open(abi_path, 'r') as f:
            abi_data = json.load(f)
            return abi_data['abi']
    except FileNotFoundError:
        print(f"Warning: Could not find ABI file at {abi_path}")
        print("Using simplified ABI for demo purposes")
        raise RuntimeError("abi not found")

# Load the real ABI
ONEP_ABI = load_onep_abi()

def load_creator_account_from_env() -> Account:
    """Load creator account from EVM_CREATOR_PRIVATE_KEY environment variable"""
    private_key = os.getenv("EVM_CREATOR_PRIVATE_KEY")
    if not private_key:
        raise RuntimeError("EVM_CREATOR_PRIVATE_KEY is not set")

    # Add proper 0x prefix if not present
    if not private_key.startswith('0x'):
        private_key = '0x' + private_key

    # Create account from private key
    account = Account.from_key(private_key)

    # Print the address for debugging
    print(f"✅ Loaded creator account: {account.address} from environment variable")

    return account

def generate_random_username() -> str:
    """Generate a random 1P username"""
    # Generate a random username with letters and numbers
    username = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"user_{username}"

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

def extract_attempt_id_from_receipt(contract, receipt: Dict[str, Any]) -> Optional[int]:
    """Extract attempt_id from AttemptCreated event in transaction receipt"""
    for log in receipt['logs']:
        try:
            decoded_log = contract.events.AttemptCreated().process_log(log)
            return decoded_log['args']['id']
        except:
            continue
    return None

def get_user_profile(contract, username: str) -> Dict[str, Any]:
    """Get user profile from OneP contract"""
    try:
        profile_data = contract.functions.getUserProfile(username).call()
        return {
            'name': profile_data[0],
            'img': profile_data[1],
            'account': profile_data[2]
        }
    except Exception as e:
        print(f"Error getting user profile: {e}")
        return {}

def get_user_state(contract, username: str) -> Dict[str, Any]:
    """Get user state from OneP contract"""
    try:
        state_data = contract.functions.getUserState(username).call()
        return {
            'totalAttempts': state_data[0],
            'successfulAttempts': state_data[1],
            'failedAttempts': state_data[2]
        }
    except Exception as e:
        print(f"Error getting user state: {e}")
        return {}

def get_attempt_info(contract, attempt_id: int) -> Dict[str, Any]:
    """Get attempt information from OneP contract"""
    try:
        attempt_data = contract.functions.getAttempt(attempt_id).call()
        return {
            'id': attempt_data[0],
            'onePUser': attempt_data[1],
            'hotWallet': attempt_data[2],
            'difficulty': attempt_data[3],
            'status': attempt_data[4],
            'createdAt': attempt_data[5],
            'expiresAt': attempt_data[6]
        }
    except Exception as e:
        print(f"Error getting attempt info: {e}")
        return {}

def get_attempt_fee(contract) -> int:
    """Get the attempt fee from OneP contract"""
    try:
        # The getAttemptFee function requires a username parameter
        # We'll use a dummy username for now since we just need the fee
        return contract.functions.getAttemptFee("dummy").call()
    except Exception as e:
        print(f"Error getting attempt fee: {e}")
        return 0

async def fetch_chain_config(base_url: str, chain_id: int) -> Dict[str, Any]:
    """Fetch chain configuration from the /1p/chains endpoint"""
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{base_url}/1p/chains") as response:
            if response.status != 200:
                raise RuntimeError(f"Failed to fetch 1P chains info: {response.status}")
            
            chains_data = await response.json()
            supported_chains = chains_data.get('supportedChains', [])
            
            # Find the chain configuration for the specified chain ID
            for chain in supported_chains:
                if chain['chainId'] == chain_id:
                    return chain
            
            raise RuntimeError(f"Chain ID {chain_id} not found in 1P supported chains")

class OnePVerifierServiceClient:
    """Client for interacting with the 1P Protocol Verifier Service"""
    
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def health_check(self) -> Dict[str, Any]:
        """Check service health"""
        async with self.session.get(f"{self.base_url}/health") as response:
            return await response.json()
    
    async def get_supported_chains(self) -> Dict[str, Any]:
        """Get supported chains"""
        async with self.session.get(f"{self.base_url}/chains") as response:
            return await response.json()
    
    async def register_options(self) -> Dict[str, Any]:
        """Get registration options (colors and directions)"""
        headers = {"MONEYPOT_CHAIN": str(CHAIN_ID)}
        async with self.session.post(
            f"{self.base_url}/1p/register/options",
            headers=headers
        ) as response:
            return await response.json()
    
    async def register_verify(self, payload: Dict[str, Any], signature: str) -> Dict[str, Any]:
        """Register user with 1P configuration"""
        # Convert payload to JSON string (same format the middleware will verify)
        payload_json = json.dumps(payload)
        
        # Format the request for the wallet middleware
        request_payload = {
            "encrypted_payload": payload_json.encode('utf-8').hex(),  # Required by wallet auth middleware
            "signature": signature
        }

        headers = {"MONEYPOT_CHAIN": str(CHAIN_ID)}
        async with self.session.post(
            f"{self.base_url}/1p/register/verify",
            json=request_payload,
            headers=headers
        ) as response:
            return await response.json()
    
    async def authenticate_options(self, attempt_id: str, signature: str) -> Dict[str, Any]:
        """Get authentication challenges"""
        # Format request to match server expectations
        request_payload = {
            "payload": {
                "attempt_id": attempt_id,
                "signature": signature
            }
        }

        headers = {"MONEYPOT_CHAIN": str(CHAIN_ID)}
        async with self.session.post(
            f"{self.base_url}/1p/authenticate/options",
            json=request_payload,
            headers=headers
        ) as response:
            return await response.json()
    
    async def authenticate_verify(self, solutions: list, challenge_id: str, hunter_account) -> Dict[str, Any]:
        """Verify authentication solution with wallet authentication"""
        # Create signature for wallet authentication
        from eth_account.messages import encode_defunct

        # For authenticate_verify, only sign the challenge_id directly (as per middleware code)
        message = encode_defunct(text=challenge_id)
        signature = hunter_account.sign_message(message)
        signature_hex = '0x' + signature.signature.hex() if hasattr(signature.signature, 'hex') else '0x' + str(signature.signature)

        # Create wallet payload
        wallet_payload = {
            "challenge_id": challenge_id,
            "solutions": solutions
        }
        # Convert to JSON for sending
        wallet_payload_json = json.dumps(wallet_payload)

        # Format request to match middleware expectations
        request_payload = {
            "encrypted_payload": wallet_payload_json.encode('utf-8').hex(),
            "signature": signature_hex
        }

        print(f"Debug: Sending authenticate_verify with payload keys: {request_payload.keys()}")

        headers = {"MONEYPOT_CHAIN": str(CHAIN_ID)}
        async with self.session.post(
            f"{self.base_url}/1p/authenticate/verify",
            json=request_payload,
            headers=headers
        ) as response:
            return await response.json()
    
    async def airdrop(self, hunter_account) -> Dict[str, Any]:
        """Request airdrop (CTC + 1P tokens)"""
        # Create signature for wallet authentication
        from eth_account.messages import encode_defunct

        # Create a simple message for airdrop
        message_text = f"airdrop_{int(time.time())}"
        message = encode_defunct(text=message_text)
        signature = hunter_account.sign_message(message)
        signature_hex = '0x' + signature.signature.hex() if hasattr(signature.signature, 'hex') else '0x' + str(signature.signature)

        # Create wallet payload
        wallet_payload = {
            "message": message_text
        }
        wallet_payload_json = json.dumps(wallet_payload)

        # Format request to match middleware expectations
        request_payload = {
            "encrypted_payload": wallet_payload_json.encode('utf-8').hex(),
            "signature": signature_hex
        }

        headers = {"MONEYPOT_CHAIN": str(CHAIN_ID)}
        async with self.session.post(
            f"{self.base_url}/1p/airdrop",
            json=request_payload,
            headers=headers
        ) as response:
            return await response.json()

class OnePProtocolApp:
    """Main application class for 1P Protocol flow"""
    
    def __init__(self):
        self.w3 = None
        self.contract = None
        self.creator_account = None
        self.hunter_account = None
        self.verifier = None
        self.colors = None
        self.directions = None
        self.password = None
        self.legend = None
        self.username = None
    
    async def initialize(self):
        """Initialize the application"""
        print("🚀 Initializing 1P Protocol Application...")
        print("=" * 50)
        
        # Initialize verifier service client first to fetch chain config
        self.verifier = OnePVerifierServiceClient(MONEY_AUTH_URL)
        
        # Fetch chain configuration from /1p/chains endpoint
        print(f"📡 Fetching chain configuration for chain ID: {CHAIN_ID}")
        chain_config = await fetch_chain_config(MONEY_AUTH_URL, CHAIN_ID)
        
        # Extract configuration
        global EVM_RPC_URL, ONEP_CONTRACT_ADDRESS, VIEM_CONFIG, EXPLORER_URL
        EVM_RPC_URL = chain_config['rpcUrl']
        # For 1P, we need to get the OneP contract address from the config
        # Assuming it's in the viemConfig or we'll use the hardcoded address

        # Get the OneP contract address from the chain config
        ONEP_CONTRACT_ADDRESS = chain_config['custom']['onep']['address']  # From viem.ts
        VIEM_CONFIG = chain_config.get('viemConfig', {})
        EXPLORER_URL = chain_config['explorerUrl']
        
        print(f"✅ Chain: {chain_config['name']} ({chain_config['type']})")
        print(f"✅ OneP Contract: {ONEP_CONTRACT_ADDRESS}")
        print(f"✅ Explorer: {chain_config['explorerUrl']}")
        
        # Initialize Web3 with fetched RPC URL
        self.w3 = Web3(Web3.HTTPProvider(EVM_RPC_URL))
        if not self.w3.is_connected():
            raise RuntimeError(f"Failed to connect to EVM RPC: {EVM_RPC_URL}")
        
        print(f"✅ Connected to EVM chain: {CHAIN_ID}")
        
        # Load accounts from environment
        self.creator_account = load_creator_account_from_env()
        self.hunter_account = load_creator_account_from_env()  # Generate a random hunter account
        
        print(f"✅ Creator: {self.creator_account.address}")
        print(f"✅ Hunter:  {self.hunter_account.address}")
        
        # Initialize contract with OneP contract address
        self.contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(ONEP_CONTRACT_ADDRESS),
            abi=ONEP_ABI
        )
        
        # Check contract details and token balance
        try:
            # Get contract name and symbol
            contract_name = self.contract.functions.name().call()
            contract_symbol = self.contract.functions.symbol().call()
            
            # Check creator's token balance
            creator_balance = self.contract.functions.balanceOf(self.creator_account.address).call()
            
            # Check creator's native balance (CTC)
            creator_native_balance = self.w3.eth.get_balance(self.creator_account.address)
            creator_native_balance_eth = self.w3.from_wei(creator_native_balance, 'ether')
            
            print(f"✅ Contract: {contract_name} ({contract_symbol})")
            print(f"✅ Creator Balance: {creator_balance:,} {contract_symbol}")
            print(f"✅ Creator Native: {creator_native_balance_eth} CTC")
                
        except Exception as e:
            print(f"⚠️  Could not check contract details: {e}")
        
        # Check verifier service health and get configuration
        async with self.verifier as verifier:
            health = await verifier.health_check()
            print(f"✅ Verifier Service: {health['status']}")
            
            # Get colors and directions from register options
            register_options = await verifier.register_options()
            self.colors = register_options.get('colors', {})
            self.directions = register_options.get('directions', {})

            # Generate random username and set default password
            self.username =  ONEP_USER
            self.password = ONEP_PASSWORD # Default password
            self.legend = {
                "red": self.directions.get("up", "U"),
                "green": self.directions.get("down", "D"),
                "blue": self.directions.get("left", "L"),
                "yellow": self.directions.get("right", "R")
            }
            print(f"✅ Username: {self.username}")
            print(f"✅ Password: {self.password}")
            print(f"✅ Legend: {self.legend}")
        
        print("=" * 50)
    
    async def register_user_flow(self):
        """Complete user registration flow"""
        print("\n👤 Registering 1P User")
        print("-" * 30)
        
        # Step 1: Register user on OneP contract
        print("1️⃣  Registering user on OneP contract")
        print("-" * 20)
        
        # Build transaction with a fresh nonce
        nonce = self.w3.eth.get_transaction_count(self.creator_account.address, 'pending')
        gas_price = self.w3.eth.gas_price

        print(f"✅ Using nonce: {nonce} for registration transaction")

        transaction = self.contract.functions.register(
            self.username,
            f"User {self.username}",
            f"https://example.com/avatar/{self.username}.png"
        ).build_transaction({
            'from': self.creator_account.address,
            'gas': 500000,
            'gasPrice': gas_price,
            'nonce': nonce,
            'chainId': CHAIN_ID
        })
        
        # Sign and send transaction
        signed_txn = self.w3.eth.account.sign_transaction(transaction, self.creator_account.key)
        tx_hash = self.w3.eth.send_raw_transaction(signed_txn.raw_transaction)
        print(f"📝 Transaction: 0x{tx_hash.hex()}")
        print(f"🔗 Explorer: {EXPLORER_URL}/tx/0x{tx_hash.hex()}")
        
        # Wait for transaction receipt
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        print(f"✅ Confirmed in block: {receipt.blockNumber}")
        
        # Check if transaction failed
        if receipt.status == 0:
            print(f"❌ Transaction failed!")
            print(f"❌ Gas used: {receipt.gasUsed}")
            print(f"❌ Transaction hash: 0x{tx_hash.hex()}")
            # Try to get more details about the failure
            try:
                tx = self.w3.eth.get_transaction(tx_hash)
                print(f"❌ Transaction details: {tx}")
            except Exception as e:
                print(f"❌ Could not get transaction details: {e}")
            raise RuntimeError("Transaction failed - check contract deployment and ABI")
        
        print(f"✅ User registered on OneP contract")
        
        # Wait a moment for the transaction to be processed
        await asyncio.sleep(2)
        
        # Verify user profile was created
        user_profile = get_user_profile(self.contract, self.username)
        if user_profile:
            print(f"✅ User profile verified: {user_profile.get('name', 'N/A')}")
            print(f"✅ User account: {user_profile.get('account', 'N/A')}")
        else:
            print(f"⚠️  User profile not found immediately after registration")
        
        # Step 2: Register user with verifier service
        print("\n2️⃣  Registering with verifier service...")
        async with self.verifier as verifier:
            # Get registration options
            register_options = await verifier.register_options()
            
            # Get the creator account address directly from the account object
            creator_address = self.creator_account.address
            print(f"✅ Creator account address from loaded private key: {creator_address}")

            # Create payload with iss field (the address that will sign)
            current_time = int(time.time())
            payload = {
                "onePUser": self.username,
                "1p": self.password,
                "legend": self.legend,
                "iat": current_time,
                "iss": creator_address,  # Use the original checksummed address
                "exp": current_time + 3600
            }

            print(f"✅ Created payload with issuer: {creator_address}")
            print(f"✅ Payload contents: {json.dumps(payload)[:100]}...")

            # Create signature for verification with the payload
            from eth_account.messages import encode_defunct
            payload_json = json.dumps(payload)
            print(f"Debug: Creating signature from payload JSON: {payload_json}")

            # Use explicit string formatting to ensure 100% match with middleware
            formatted_json = json.dumps(payload, separators=(',', ':'))
            print(f"Debug: Explicit JSON string being signed: {formatted_json}")

            # Create signature for the EXPLICITLY formatted JSON string
            message = encode_defunct(text=formatted_json)
            signature = self.creator_account.sign_message(message)
            signature_hex = '0x' + signature.signature.hex() if hasattr(signature.signature, 'hex') else '0x' + str(signature.signature)

            print(f"✅ Created signature: {signature_hex[:20]}...")
            print(f"✅ Signature length: {len(signature_hex)} characters")

            register_result = await verifier.register_verify(payload, signature_hex)
            
            # Check if registration was successful
            if 'error' in register_result:
                if 'already registered' in register_result['error'].lower():
                    print(f"⚠️ User {self.username} already registered, continuing...")
                    print(f"✅ User registration skipped (already exists)")
                else:
                    print(f"❌ Registration failed: {register_result['error']}")
                    raise RuntimeError(f"User registration failed: {register_result['error']}")
            else:
                print(f"✅ User registered successfully")
        
        return self.username
    
    async def fund_hunter_account(self):
        """Fund hunter account with native tokens for gas"""
        print("\n💰 Funding Hunter Account")
        print("-" * 30)
        
        # Check hunter balance
        hunter_balance = self.w3.eth.get_balance(self.hunter_account.address)
        hunter_balance_eth = hunter_balance / 10**18
        print(f"✅ Hunter balance: {hunter_balance_eth:.6f} CTC")
        
        if hunter_balance_eth < 0.1:  # Need at least 0.1 CTC for gas
            print(f"💡 Funding hunter account with 1 CTC...")
            
            # Send 1 CTC from creator to hunter
            nonce = self.w3.eth.get_transaction_count(self.creator_account.address, 'pending')
            gas_price = self.w3.eth.gas_price
            
            fund_amount = self.w3.to_wei(1, 'ether')  # 1 CTC
            
            fund_tx = {
                'from': self.creator_account.address,
                'to': self.hunter_account.address,
                'value': fund_amount,
                'gas': 21000,
                'gasPrice': gas_price,
                'nonce': nonce,
                'chainId': CHAIN_ID
            }
            
            signed_fund_txn = self.w3.eth.account.sign_transaction(fund_tx, self.creator_account.key)
            fund_tx_hash = self.w3.eth.send_raw_transaction(signed_fund_txn.raw_transaction)
            print(f"📝 Fund Transaction: 0x{fund_tx_hash.hex()}")
            print(f"🔗 Explorer: {EXPLORER_URL}/tx/0x{fund_tx_hash.hex()}")
            
            fund_receipt = self.w3.eth.wait_for_transaction_receipt(fund_tx_hash)
            if fund_receipt.status == 1:
                print(f"✅ Hunter account funded successfully")
                # Check new balance
                new_balance = self.w3.eth.get_balance(self.hunter_account.address)
                new_balance_eth = new_balance / 10**18
                print(f"✅ New hunter balance: {new_balance_eth:.6f} CTC")
            else:
                print(f"❌ Hunter funding failed")
                return False
        else:
            print(f"✅ Hunter account has sufficient balance")
        
        return True
    
    async def fund_hunter_with_tokens(self):
        """Fund hunter account with 1P tokens for attempt fee"""
        print("\n🪙 Funding Hunter with 1P Tokens")
        print("-" * 30)
        
        # Check hunter token balance
        hunter_token_balance = self.contract.functions.balanceOf(self.hunter_account.address).call()
        hunter_token_balance_formatted = hunter_token_balance / 10**18
        print(f"✅ Hunter token balance: {hunter_token_balance_formatted:.2f} 1P tokens")
        
        # Get attempt fee
        attempt_fee = get_attempt_fee(self.contract)
        attempt_fee_formatted = attempt_fee / 10**18
        print(f"✅ Attempt fee: {attempt_fee_formatted:.2f} 1P tokens")
        
        if hunter_token_balance < attempt_fee * 2:  # Need at least 2x the fee for safety
            print(f"💡 Funding hunter with 100 1P tokens...")
            
            # Check creator balance first
            creator_balance = self.contract.functions.balanceOf(self.creator_account.address).call()
            creator_balance_formatted = creator_balance / 10**18
            print(f"✅ Creator token balance: {creator_balance_formatted:.2f} 1P tokens")
            
            # Transfer 100 1P tokens from creator to hunter
            nonce = self.w3.eth.get_transaction_count(self.creator_account.address, 'pending')
            gas_price = self.w3.eth.gas_price
            
            transfer_amount = self.w3.to_wei(100, 'ether')  # 100 1P tokens
            
            # Check if creator has enough tokens
            if creator_balance < transfer_amount:
                print(f"❌ Creator doesn't have enough tokens: {creator_balance_formatted:.2f} < 100.00")
                return False
            
            transfer_tx = self.contract.functions.transfer(
                self.hunter_account.address,
                transfer_amount
            ).build_transaction({
                'from': self.creator_account.address,
                'gas': 50000,
                'gasPrice': gas_price,
                'nonce': nonce,
                'chainId': CHAIN_ID
            })
            
            signed_transfer_txn = self.w3.eth.account.sign_transaction(transfer_tx, self.creator_account.key)
            transfer_tx_hash = self.w3.eth.send_raw_transaction(signed_transfer_txn.raw_transaction)
            print(f"📝 Token Transfer Transaction: 0x{transfer_tx_hash.hex()}")
            print(f"🔗 Explorer: {EXPLORER_URL}/tx/0x{transfer_tx_hash.hex()}")
            
            transfer_receipt = self.w3.eth.wait_for_transaction_receipt(transfer_tx_hash)
            print(f"✅ Transfer confirmed in block: {transfer_receipt.blockNumber}")
            if transfer_receipt.status == 1:
                print(f"✅ Hunter funded with 1P tokens successfully")
                # Check new balance
                new_balance = self.contract.functions.balanceOf(self.hunter_account.address).call()
                new_balance_formatted = new_balance / 10**18
                print(f"✅ New hunter token balance: {new_balance_formatted:.2f} 1P tokens")
            else:
                print(f"❌ Hunter token funding failed!")
                print(f"❌ Gas used: {transfer_receipt.gasUsed}")
                print(f"❌ Transaction hash: 0x{transfer_tx_hash.hex()}")
                return False
        else:
            print(f"✅ Hunter account has sufficient 1P tokens")
        
        return True
    
    async def request_attempt_flow(self) -> int:
        """Request an attempt on the OneP contract"""
        print("\n🎯 Requesting Authentication Attempt")
        print("-" * 30)
        
        # Get attempt fee
        attempt_fee = get_attempt_fee(self.contract)
        print(f"✅ Attempt fee: {attempt_fee} 1P tokens")
        
        # Build transaction with a fresh nonce
        nonce = self.w3.eth.get_transaction_count(self.hunter_account.address, 'pending')
        gas_price = self.w3.eth.gas_price

        print(f"✅ Using nonce: {nonce} for attempt transaction")

        transaction = self.contract.functions.requestAttempt(self.username).build_transaction({
            'from': self.hunter_account.address,
            'gas': 500000,
            'gasPrice': gas_price,
            'nonce': nonce,
            'chainId': CHAIN_ID
        })
        
        # Sign and send transaction
        signed_txn = self.w3.eth.account.sign_transaction(transaction, self.hunter_account.key)
        tx_hash = self.w3.eth.send_raw_transaction(signed_txn.raw_transaction)
        print(f"📝 Transaction: 0x{tx_hash.hex()}")
        print(f"🔗 Explorer: {EXPLORER_URL}/tx/0x{tx_hash.hex()}")
        
        # Wait for transaction receipt
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        print(f"✅ Confirmed in block: {receipt.blockNumber}")
        
        # Check if transaction failed
        if receipt.status == 0:
            print(f"❌ Transaction failed!")
            print(f"❌ Gas used: {receipt.gasUsed}")
            print(f"❌ Transaction hash: 0x{tx_hash.hex()}")
            # Try to get more details about the failure
            try:
                tx = self.w3.eth.get_transaction(tx_hash)
                print(f"❌ Transaction details: {tx}")
            except Exception as e:
                print(f"❌ Could not get transaction details: {e}")
            raise RuntimeError("Transaction failed - check contract deployment and ABI")
        
        # Extract attempt_id from events
        receipt_dict = get_transaction_receipt(self.w3, tx_hash.hex())
        attempt_id = extract_attempt_id_from_receipt(self.contract, receipt_dict)
        
        if attempt_id is None:
            raise RuntimeError("Could not extract attempt_id from attempt events")
        
        print(f"✅ Attempt ID: {attempt_id}")
        
        # Get attempt info for verification
        attempt_info = get_attempt_info(self.contract, attempt_id)
        if attempt_info:
            print(f"✅ Difficulty: {attempt_info.get('difficulty')}")
            print(f"✅ Status: {attempt_info.get('status')} (0=Pending)")
        
        return attempt_id
    
    async def authenticate_flow(self, attempt_id: int):
        """Complete authentication flow: Get challenges → Solve → Verify"""
        print(f"\n🔐 Authenticating Attempt {attempt_id}")
        print("-" * 30)
        
        async with self.verifier as verifier:
            # Step 1: Get authentication challenges
            print("1️⃣  Getting authentication challenges")
            print("-" * 20)
            
            from eth_account.messages import encode_defunct
            message = encode_defunct(text=str(attempt_id))
            signature = self.hunter_account.sign_message(message)
            signature_hex = '0x' + signature.signature.hex() if hasattr(signature.signature, 'hex') else '0x' + str(signature.signature)
            
            auth_options = await verifier.authenticate_options(str(attempt_id), signature_hex)
            print(f"✅ Got {len(auth_options.get('challenges', []))} challenges")
            
            # Step 2: Solve challenges
            print("\n2️⃣  Solving challenges")
            print("-" * 20)
            
            challenges = auth_options.get('challenges', [])
            solutions = []
            
            for i, challenge in enumerate(challenges):
                color_groups = challenge.get('colorGroups', {})
                
                # Find which color group contains our password character
                password_color = None
                for color, chars in color_groups.items():
                    if self.password in chars:
                        password_color = color
                        break
                
                if password_color:
                    direction = self.legend.get(password_color, "S")
                    solutions.append(direction)
                    print(f"   Challenge {i+1}: Password '{self.password}' → {password_color} → {direction}")
                else:
                    solutions.append("S")
                    print(f"   Challenge {i+1}: Password '{self.password}' not found → Skip")
            
            print(f"✅ Solutions: {solutions}")
            
            # Step 3: Verify solutions
            print("\n3️⃣  Verifying solutions")
            print("-" * 20)
            
            verify_result = await verifier.authenticate_verify(solutions, str(attempt_id), self.hunter_account)
            
            if verify_result.get('success', False):
                print(f"🎉 SUCCESS! Authentication succeeded!")
                print(f"✅ Message: {verify_result.get('message', 'No message')}")
            else:
                print(f"❌ Authentication failed!")
                print(f"❌ Error: {verify_result.get('error', 'Unknown error')}")
            
            return verify_result.get('success', False)
    
    async def airdrop_flow(self):
        """Request airdrop flow"""
        print("\n💰 Requesting Airdrop")
        print("-" * 30)
        
        async with self.verifier as verifier:
            airdrop_result = await verifier.airdrop(self.hunter_account)
            
            if airdrop_result.get('success', False):
                print(f"🎉 Airdrop successful!")
                print(f"✅ Message: {airdrop_result.get('message', 'No message')}")
                if 'transactions' in airdrop_result:
                    txs = airdrop_result['transactions']
                    print(f"✅ Native TX: {txs.get('native', 'N/A')}")
                    print(f"✅ Token TX: {txs.get('token', 'N/A')}")
            else:
                print(f"❌ Airdrop failed!")
                print(f"❌ Error: {airdrop_result.get('error', 'Unknown error')}")
            
            return airdrop_result.get('success', False)
    
    async def display_contract_info(self):
        """Display contract information and user stats"""
        print("\n📊 Contract Information")
        print("-" * 30)
        
        try:
            # Get contract name and symbol
            contract_name = self.contract.functions.name().call()
            contract_symbol = self.contract.functions.symbol().call()
            print(f"Contract: {contract_name} ({contract_symbol})")
            
            # Get total supply
            total_supply = self.contract.functions.totalSupply().call()
            print(f"Total Supply: {total_supply:,} {contract_symbol}")
            
            # Get attempt fee
            attempt_fee = get_attempt_fee(self.contract)
            print(f"Attempt Fee: {attempt_fee} {contract_symbol}")
            
            # Display creator and hunter balances
            creator_balance = self.contract.functions.balanceOf(self.creator_account.address).call()
            hunter_balance = self.contract.functions.balanceOf(self.hunter_account.address).call()
            
            print(f"Creator Balance: {creator_balance:,} {contract_symbol}")
            print(f"Hunter Balance: {hunter_balance:,} {contract_symbol}")
            
            # Display native balances
            creator_native = self.w3.eth.get_balance(self.creator_account.address)
            hunter_native = self.w3.eth.get_balance(self.hunter_account.address)
            
            creator_native_eth = self.w3.from_wei(creator_native, 'ether')
            hunter_native_eth = self.w3.from_wei(hunter_native, 'ether')
            
            print(f"Creator Native: {creator_native_eth} CTC")
            print(f"Hunter Native: {hunter_native_eth} CTC")
            
            # Display user profile and state
            if self.username:
                user_profile = get_user_profile(self.contract, self.username)
                user_state = get_user_state(self.contract, self.username)
                
                if user_profile:
                    print(f"User Profile: {user_profile.get('name', 'N/A')}")
                    print(f"User Account: {user_profile.get('account', 'N/A')}")
                
                if user_state:
                    print(f"Total Attempts: {user_state.get('totalAttempts', 0)}")
                    print(f"Successful Attempts: {user_state.get('successfulAttempts', 0)}")
                    print(f"Failed Attempts: {user_state.get('failedAttempts', 0)}")
            
        except Exception as e:
            print(f"⚠️  Could not get contract info: {e}")
    
    async def run_complete_flow(self):
        """Run the complete 1P Protocol flow"""
        try:
            # Initialize
            await self.initialize()
            
            # Display contract information
            await self.display_contract_info()
            
            # Register user
            username = await self.register_user_flow()
            
            # Request airdrop for hunter
            await self.airdrop_flow()
            
            # Check hunter token balance after airdrop
            hunter_token_balance = self.contract.functions.balanceOf(self.hunter_account.address).call()
            hunter_token_balance_formatted = hunter_token_balance / 10**18
            print(f"✅ Hunter token balance after airdrop: {hunter_token_balance_formatted:.2f} 1P tokens")
            
            # Get attempt fee for comparison
            attempt_fee = get_attempt_fee(self.contract)
            attempt_fee_formatted = attempt_fee / 10**18
            print(f"✅ Attempt fee: {attempt_fee_formatted:.2f} 1P tokens")
            
            # Fund hunter account for gas
            await self.fund_hunter_account()
            
            # Fund hunter with 1P tokens for attempt fee (always do this for now due to airdrop issue)
            print(f"💡 Manually funding hunter with 1P tokens (airdrop issue)...")
            await self.fund_hunter_with_tokens()
            
            # Request attempt
            attempt_id = await self.request_attempt_flow()
            
            # Authenticate
            success = await self.authenticate_flow(attempt_id)
            
            # Display final stats
            await self.display_contract_info()
            
            print(f"\n🎉 Complete 1P Protocol Flow Finished!")
            print("=" * 50)
            print(f"Username: {username}")
            print(f"Attempt ID: {attempt_id}")
            print(f"Authentication: {'SUCCESS' if success else 'FAILED'}")
            print("=" * 50)
            
        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()
            print(f"\n❌ 1P Protocol Integration Failed!")
            return  # Exit early on error
            
        print(f"\n🎉 1P Protocol Demo Complete!")

async def main():
    """Main entry point"""
    print("1P Protocol End-to-End Application")
    print("=" * 50)
    
    app = OnePProtocolApp()
    await app.run_complete_flow()

if __name__ == "__main__":
    asyncio.run(main())
