#!/usr/bin/env python3
"""
1P Wallet Signer Interface Demo
Demonstrates Ethereum RPC provider functionality using 1P authentication
"""

import asyncio
import json
import os
import sys
from typing import Optional, Dict, Any
import aiohttp
from dotenv import load_dotenv
import base64
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

ONEP_LEGEND = {
    "red": "U",
    "green": "D",
    "blue": "L",
    "yellow": "R"
}

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

class OnePWalletProvider:
    """Ethereum RPC Provider interface using 1P authentication"""
    
    def __init__(self, base_url: str, w3: Web3, contract, username: str, password: str, legend: Dict[str, str], creator_account: Account, hunter_account: Account):
        self.base_url = base_url
        self.w3 = w3
        self.contract = contract
        self.username = username
        self.password = password
        self.legend = legend
        self.creator_account = creator_account
        self.hunter_account = hunter_account
        self.session = None
        self.custodial_address = None
    
    async def __aenter__(self):
        # Create session with better connection settings
        connector = aiohttp.TCPConnector(
            limit=100,
            limit_per_host=30,
            ttl_dns_cache=300,
            use_dns_cache=True,
        )
        timeout = aiohttp.ClientTimeout(total=60, connect=10)
        self.session = aiohttp.ClientSession(
            connector=connector,
            timeout=timeout,
            headers={'User-Agent': '1P-Wallet-Demo/1.0'}
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def _check_backend_health(self) -> bool:
        """Check if backend is healthy before making requests"""
        try:
            async with self.session.get(f"{self.base_url}/health", timeout=aiohttp.ClientTimeout(total=5)) as response:
                return response.status == 200
        except Exception as e:
            print(f"⚠️ Backend health check failed: {e}")
            return False
    
    def get_custodial_address(self) -> str:
        """Get custodial wallet address from OneP contract (eth_accounts equivalent)"""
        if self.custodial_address:
            return self.custodial_address
        
        try:
            user_profile = self.contract.functions.getUserProfile(self.username).call()
            self.custodial_address = user_profile[2]  # account field
            print(f"✅ Custodial wallet address: {self.custodial_address}")
            return self.custodial_address
        except Exception as e:
            print(f"❌ Error getting custodial address: {e}")
            return None
    
    async def authenticate_and_sign_message(self, message: str) -> Dict[str, Any]:
        """Sign a message using 1P authentication (personal_sign equivalent)"""
        print(f"\n🔐 Signing message: '{message}'")
        
        # Request attempt
        attempt_id = await self._request_attempt()
        
        # Authenticate with payload to sign
        payload_to_sign = {
            "type": "message",
            "data": {
                "message": message
            }
        }
        
        return await self._authenticate_with_payload(attempt_id, payload_to_sign)
    
    async def authenticate_and_sign_transaction(self, tx: Dict[str, Any]) -> Dict[str, Any]:
        """Sign a transaction using 1P authentication (eth_signTransaction equivalent)"""
        print(f"\n📝 Signing transaction: {tx}")
        
        # Request attempt
        attempt_id = await self._request_attempt()
        
        # Authenticate with payload to sign
        payload_to_sign = {
            "type": "transaction",
            "data": {
                "transaction": tx
            }
        }
        
        return await self._authenticate_with_payload(attempt_id, payload_to_sign)
    
    async def authenticate_and_send_transaction(self, tx: Dict[str, Any]) -> Dict[str, Any]:
        """Send a transaction using 1P authentication (eth_sendTransaction equivalent)"""
        print(f"\n📝 Sending transaction: {tx}")
        
        # Request attempt
        attempt_id = await self._request_attempt()
        
        # Authenticate with payload to sign
        payload_to_sign = {
            "type": "transaction",
            "data": {
                "transaction": tx
            }
        }
        
        return await self._authenticate_with_payload(attempt_id, payload_to_sign)
    
    async def _request_attempt(self) -> int:
        """Request an attempt on the OneP contract"""
        print("🎯 Requesting authentication attempt...")
        
        # Get attempt fee
        attempt_fee = self.contract.functions.getAttemptFee("dummy").call()
        print(f"✅ Attempt fee: {attempt_fee} 1P tokens")
        
        # Build transaction
        nonce = self.w3.eth.get_transaction_count(self.creator_account.address, 'pending')
        gas_price = self.w3.eth.gas_price
        
        transaction = self.contract.functions.requestAttempt(self.username).build_transaction({
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
        
        # Wait for transaction receipt
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        print(f"✅ Confirmed in block: {receipt.blockNumber}")
        
        if receipt.status == 0:
            raise RuntimeError("Transaction failed")
        
        # Extract attempt_id from events
        for log in receipt.logs:
            try:
                decoded_log = self.contract.events.AttemptCreated().process_log(log)
                attempt_id = decoded_log['args']['id']
                print(f"✅ Attempt ID: {attempt_id}")
                return attempt_id
            except:
                continue
        
        raise RuntimeError("Could not extract attempt_id from attempt events")
    
    async def _authenticate_with_payload(self, attempt_id: int, payload_to_sign: Dict[str, Any]) -> Dict[str, Any]:
        """Complete authentication flow with payload to sign"""
        print(f"\n🔐 Authenticating Attempt {attempt_id} with payload")
        
        # Step 1: Get authentication challenges
        print("1️⃣  Getting authentication challenges")
        
        from eth_account.messages import encode_defunct
        message = encode_defunct(text=str(attempt_id))
        signature = self.hunter_account.sign_message(message)
        signature_hex = '0x' + signature.signature.hex() if hasattr(signature.signature, 'hex') else '0x' + str(signature.signature)
        
        auth_options = await self._authenticate_options(str(attempt_id), signature_hex)
        print(f"✅ Got {len(auth_options.get('challenges', []))} challenges")
        
        # Step 2: Solve challenges
        print("\n2️⃣  Solving challenges")
        
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
        
        # Step 3: Verify solutions with payload to sign
        print("\n3️⃣  Verifying solutions with payload")
        
        verify_result = await self._authenticate_verify(solutions, str(attempt_id), payload_to_sign)
        
        if verify_result.get('success', False):
            print(f"🎉 SUCCESS! Authentication succeeded!")
            print(f"✅ Message: {verify_result.get('message', 'No message')}")
            
            signed_data = verify_result.get('signed')
            if signed_data:
                print(f"✅ Signed result:")
                print(f"   Type: {signed_data.get('type')}")
                print(f"   Signer: {signed_data.get('signer')}")
                if 'signature' in signed_data:
                    print(f"   Signature: {signed_data['signature'][:20]}...")
                if 'txHash' in signed_data:
                    print(f"   Transaction Hash: {signed_data['txHash']}")
                if 'receipt' in signed_data:
                    receipt = signed_data['receipt']
                    print(f"   Block Number: {receipt.get('blockNumber')}")
                    print(f"   Gas Used: {receipt.get('gasUsed')}")
        else:
            print(f"❌ Authentication failed!")
            print(f"❌ Error: {verify_result.get('error', 'Unknown error')}")
        
        return verify_result
    
    async def _authenticate_options(self, attempt_id: str, signature: str) -> Dict[str, Any]:
        """Get authentication challenges"""
        max_retries = 3
        retry_delay = 1
        
        request_payload = {
            "payload": {
                "attempt_id": attempt_id,
                "signature": signature
            }
        }

        headers = {"MONEYPOT_CHAIN": str(CHAIN_ID)}
        
        for attempt in range(max_retries):
            try:
                # Check backend health before making request
                if attempt > 0:  # Only check health on retries
                    if not await self._check_backend_health():
                        print(f"⚠️ Backend not healthy, retrying in {retry_delay}s...")
                        await asyncio.sleep(retry_delay)
                        retry_delay *= 2
                        continue
                
                async with self.session.post(
                    f"{self.base_url}/1p/authenticate/options",
                    json=request_payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise RuntimeError(f"Failed to get authentication options: {error_text}")
                    
                    return await response.json()
            except (aiohttp.ClientOSError, aiohttp.ServerDisconnectedError, ConnectionResetError) as e:
                print(f"⚠️ Network error (attempt {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                    continue
                else:
                    raise RuntimeError(f"Failed to get authentication options after {max_retries} attempts: {e}")
            except Exception as e:
                print(f"❌ Error getting authentication options: {e}")
                raise
    
    async def _authenticate_verify(self, solutions: list, challenge_id: str, payload_to_sign: Dict[str, Any]) -> Dict[str, Any]:
        """Verify authentication solution with payload to sign"""
        from eth_account.messages import encode_defunct

        # Sign the challenge_id for wallet authentication
        message = encode_defunct(text=challenge_id)
        signature = self.hunter_account.sign_message(message)
        signature_hex = '0x' + signature.signature.hex() if hasattr(signature.signature, 'hex') else '0x' + str(signature.signature)

        # Create wallet payload with payloadToSign
        wallet_payload = {
            "challenge_id": challenge_id,
            "solutions": solutions,
            "payloadToSign": payload_to_sign
        }
        
        wallet_payload_json = json.dumps(wallet_payload)

        # Format request to match middleware expectations
        request_payload = {
            "encrypted_payload": wallet_payload_json.encode('utf-8').hex(),
            "signature": signature_hex
        }

        headers = {"MONEYPOT_CHAIN": str(CHAIN_ID)}
        
        max_retries = 3
        retry_delay = 1
        
        for attempt in range(max_retries):
            try:
                # Check backend health before making request
                if attempt > 0:  # Only check health on retries
                    if not await self._check_backend_health():
                        print(f"⚠️ Backend not healthy, retrying in {retry_delay}s...")
                        await asyncio.sleep(retry_delay)
                        retry_delay *= 2
                        continue
                
                async with self.session.post(
                    f"{self.base_url}/1p/authenticate/verify",
                    json=request_payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise RuntimeError(f"Failed to verify authentication: {error_text}")
                    
                    return await response.json()
            except (aiohttp.ClientOSError, aiohttp.ServerDisconnectedError, ConnectionResetError) as e:
                print(f"⚠️ Network error (attempt {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                    continue
                else:
                    raise RuntimeError(f"Failed to verify authentication after {max_retries} attempts: {e}")
            except Exception as e:
                print(f"❌ Error verifying authentication: {e}")
                raise

class OnePWalletDemo:
    """Demo application showing 1P wallet functionality"""
    
    def __init__(self):
        self.w3 = None
        self.contract = None
        self.creator_account = None
        self.hunter_account = None
        self.username = None
        self.password = None
        self.legend = None
    
    async def initialize(self):
        """Initialize the demo application"""
        print("🚀 Initializing 1P Wallet Demo...")
        print("=" * 50)
        
        # Fetch chain configuration
        chain_config = await fetch_chain_config(MONEY_AUTH_URL, CHAIN_ID)
        
        global EVM_RPC_URL, ONEP_CONTRACT_ADDRESS, VIEM_CONFIG, EXPLORER_URL
        EVM_RPC_URL = chain_config['rpcUrl']
        ONEP_CONTRACT_ADDRESS = chain_config['custom']['onep']['address']
        VIEM_CONFIG = chain_config.get('viemConfig', {})
        EXPLORER_URL = chain_config['explorerUrl']
        
        print(f"✅ Chain: {chain_config['name']} ({chain_config['type']})")
        print(f"✅ OneP Contract: {ONEP_CONTRACT_ADDRESS}")
        print(f"✅ Explorer: {chain_config['explorerUrl']}")
        
        # Initialize Web3
        self.w3 = Web3(Web3.HTTPProvider(EVM_RPC_URL))
        if not self.w3.is_connected():
            raise RuntimeError(f"Failed to connect to EVM RPC: {EVM_RPC_URL}")
        
        print(f"✅ Connected to EVM chain: {CHAIN_ID}")
        
        # Load accounts
        self.creator_account = load_creator_account_from_env()
        self.hunter_account = load_creator_account_from_env()
        
        # Verify accounts are loaded correctly
        print(f"✅ Creator account loaded: {self.creator_account.address}")
        print(f"✅ Hunter account loaded: {self.hunter_account.address}")
        
        # Ensure both accounts are the same for this demo
        if self.creator_account.address != self.hunter_account.address:
            print(f"⚠️  Warning: Creator and Hunter accounts are different!")
            print(f"   Creator: {self.creator_account.address}")
            print(f"   Hunter:  {self.hunter_account.address}")
        
        print(f"✅ Creator: {self.creator_account.address}")
        print(f"✅ Hunter:  {self.hunter_account.address}")
        
        # Initialize contract
        self.contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(ONEP_CONTRACT_ADDRESS),
            abi=ONEP_ABI
        )
        
        # Use configured user instead of generating random one
        self.username = ONEP_USER
        self.password = ONEP_PASSWORD
        self.legend = ONEP_LEGEND
        
        print(f"✅ Username: {self.username}")
        print(f"✅ Password: {self.password}")
        print(f"✅ Legend: {self.legend}")
        
        print("=" * 50)
    
    async def register_user(self):
        """Register user with 1P"""
        print("\n👤 Registering 1P User")
        print("-" * 30)
        
        # Register on OneP contract
        print("1️⃣  Registering user on OneP contract")
        nonce = self.w3.eth.get_transaction_count(self.creator_account.address, 'pending')
        gas_price = self.w3.eth.gas_price

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
        
        signed_txn = self.w3.eth.account.sign_transaction(transaction, self.creator_account.key)
        tx_hash = self.w3.eth.send_raw_transaction(signed_txn.raw_transaction)
        print(f"📝 Transaction: 0x{tx_hash.hex()}")
        
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        print(f"✅ Confirmed in block: {receipt.blockNumber}")
        
        if receipt.status == 0:
            raise RuntimeError("Transaction failed")
        
        print(f"✅ User registered on OneP contract")
        
        # Register with verifier service
        print("\n2️⃣  Registering with verifier service...")
        
        # Get registration options
        async with aiohttp.ClientSession() as session:
            headers = {"MONEYPOT_CHAIN": str(CHAIN_ID)}
            async with session.post(f"{MONEY_AUTH_URL}/1p/register/options", headers=headers) as response:
                register_options = await response.json()
        
        # Create payload
        current_time = int(time.time())
        payload = {
            "onePUser": self.username,
            "1p": self.password,
            "legend": self.legend,
            "iat": current_time,
            "iss": self.creator_account.address,
            "exp": current_time + 3600
        }
        
        # Create signature
        from eth_account.messages import encode_defunct
        # Use the same format that the middleware expects (JSON.stringify with compact formatting)
        payload_json = json.dumps(payload, separators=(',', ':'))
        print(f"Debug: Creating signature from payload JSON: {payload_json}")
        message = encode_defunct(text=payload_json)
        signature = self.creator_account.sign_message(message)
        signature_hex = '0x' + signature.signature.hex() if hasattr(signature.signature, 'hex') else '0x' + str(signature.signature)
        
        print(f"✅ Created signature: {signature_hex[:20]}...")
        print(f"✅ Signature length: {len(signature_hex)} characters")
        print(f"✅ Signing with account: {self.creator_account.address}")
        print(f"✅ Payload issuer (iss): {payload['iss']}")
        
        # Register with verifier
        request_payload = {
            "encrypted_payload": json.dumps(payload).encode('utf-8').hex(),
            "signature": signature_hex
        }
        
        print(f"Debug: Request payload keys: {request_payload.keys()}")
        print(f"Debug: Encrypted payload length: {len(request_payload['encrypted_payload'])}")
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{MONEY_AUTH_URL}/1p/register/verify",
                json=request_payload,
                headers=headers
            ) as response:
                register_result = await response.json()
                
                if 'error' in register_result:
                    if 'already registered' in register_result['error'].lower():
                        print(f"⚠️ User {self.username} already registered, continuing...")
                    else:
                        print(f"❌ Registration failed: {register_result['error']}")
                        raise RuntimeError(f"User registration failed: {register_result['error']}")
                else:
                    print(f"✅ User registered successfully")
                    if 'custodialWallet' in register_result:
                        print(f"✅ Custodial wallet: {register_result['custodialWallet']['address']}")
        
    async def get_user_profile(self):
        """Get existing user profile and custodial wallet address"""
        print("\n👤 Getting 1P User Profile")
        print("-" * 30)
        
        try:
            # Get user profile from OneP contract
            user_profile = get_user_profile(self.contract, self.username)
            
            if not user_profile or user_profile.get('account') == "0x0000000000000000000000000000000000000000":
                print(f"❌ User {self.username} not found or has no custodial wallet")
                print("💡 Make sure the user is registered and has a custodial wallet attached")
                raise RuntimeError(f"User {self.username} not found or has no custodial wallet")
            
            self.custodial_address = user_profile['account']
            print(f"✅ User Profile Found:")
            print(f"   Name: {user_profile['name']}")
            print(f"   Image: {user_profile['img']}")
            print(f"   Custodial Address: {self.custodial_address}")
            
            # Get user state
            user_state = get_user_state(self.contract, self.username)
            if user_state:
                print(f"✅ User State:")
                print(f"   Total Attempts: {user_state['totalAttempts']}")
                print(f"   Successful Attempts: {user_state['successfulAttempts']}")
                print(f"   Failed Attempts: {user_state['failedAttempts']}")
            
            return self.custodial_address
            
        except Exception as e:
            print(f"❌ Error getting user profile: {e}")
            raise
    
    async def demo_wallet_functionality(self):
        """Demonstrate wallet functionality"""
        print("\n🔐 1P Wallet Functionality Demo")
        print("=" * 50)
        
        async with OnePWalletProvider(MONEY_AUTH_URL, self.w3, self.contract, self.username, self.password, self.legend, self.creator_account, self.hunter_account) as provider:
            # Use the custodial address from user profile
            custodial_address = self.custodial_address
            if not custodial_address:
                print("❌ Could not get custodial address")
                return

            print(f"✅ Custodial wallet address: {custodial_address}")
            print(f"✅ User's account (custodial wallet): {custodial_address}")
            
            # Demo 1: Sign a message (personal_sign equivalent)
            print("\n📝 Demo 1: Sign Message")
            print("-" * 20)
            message_result = await provider.authenticate_and_sign_message("Hello, 1P Wallet!")
            
            # Demo 2: Sign Transaction
            print("\n📝 Demo 2: Sign Transaction")
            print("-" * 20)
            
            # Add a small delay between demos to reduce backend load
            print("⏳ Waiting 2 seconds before transaction demo...")
            await asyncio.sleep(2)
            
            # Create a simple transaction to sign
            tx = {
                "to": "0x1234567890123456789012345678901234567890",  # Dummy recipient
                "value": "0x16345785d8a0000",  # 0.1 ETH in hex
                "gas": "0x5208",  # 21000 gas
                "gasPrice": "0x3b9aca00"  # 1 gwei
            }
            
            tx_result = await provider.authenticate_and_sign_transaction(tx)
            
            if tx_result.get('success', False):
                print(f"🎉 Transaction signed successfully!")
                signed_data = tx_result.get('signed')
                if signed_data and 'signedTransaction' in signed_data:
                    signed_tx = signed_data['signedTransaction']
                    print(f"✅ Signed Transaction: {signed_tx[:50]}...")
                    print(f"✅ Signer: {signed_data['signer']}")
                    
                    # Broadcast the signed transaction
                    print(f"\n📡 Broadcasting transaction...")
                    try:
                        tx_hash = self.w3.eth.send_raw_transaction(signed_tx)
                        print(f"🎉 Transaction broadcasted successfully!")
                        print(f"✅ Transaction Hash: 0x{tx_hash.hex()}")
                        print(f"🔗 Explorer: {EXPLORER_URL}/tx/0x{tx_hash.hex()}")
                        
                        # Wait for transaction confirmation
                        print(f"⏳ Waiting for confirmation...")
                        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
                        print(f"✅ Transaction confirmed in block: {receipt.blockNumber}")
                        print(f"✅ Gas used: {receipt.gasUsed}")
                        print(f"✅ Status: {'Success' if receipt.status == 1 else 'Failed'}")
                        
                    except Exception as e:
                        print(f"❌ Failed to broadcast transaction: {e}")
                        print(f"💡 You can manually broadcast the signed transaction:")
                        print(f"   Raw Transaction: {signed_tx}")
                else:
                    print(f"⚠️ No signed transaction data received")
            else:
                print(f"❌ Transaction signing failed!")
                print(f"❌ Error: {tx_result.get('error', 'Unknown error')}")
    
    async def run_demo(self):
        """Run the complete demo"""
        try:
            # Initialize
            await self.initialize()
            
            # Get user profile (skip registration)
            await self.get_user_profile()
            
            # Demo wallet functionality
            await self.demo_wallet_functionality()
            
            print(f"\n🎉 1P Wallet Demo Complete!")
            print("=" * 50)
            
        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()
            print(f"\n❌ Demo Failed!")

async def main():
    """Main entry point"""
    print("1P Wallet Signer Interface Demo")
    print("=" * 50)
    
    demo = OnePWalletDemo()
    await demo.run_demo()

if __name__ == "__main__":
    asyncio.run(main())
