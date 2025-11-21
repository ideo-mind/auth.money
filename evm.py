#!/usr/bin/env python3
"""
Money Pot EVM End-to-End Application
Integrates with the verifier service for complete pot creation and hunting flow on EVM chains
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

# Load environment variables
load_dotenv()

# Configuration
MONEY_AUTH_URL = os.getenv("MONEY_AUTH_URL", "https://auth.money-pot.ideomind.org")
CHAIN_ID = int(os.getenv("CHAIN_ID", "102031"))  # Testnet chain ID



# Helper function to convert float values to wei (smallest unit)
def parse_token_amount(value: str, decimals: int = 6) -> int:
    try:
        # Try to parse as float first (e.g., "0.1", "100.5", "1e3")
        float_value = float(value)
        # Convert to wei: multiply by 10^decimals
        return int(float_value * (10 ** decimals))
    except ValueError:
        # If float parsing fails, try as integer (already in wei)
        return int(value)

# Parse amounts from environment with proper conversion
# Default values: 0.1 tokens = 100000000000000000 wei, 0.01 tokens = 10000000000000000 wei
ONEP_PASSWORD = os.getenv("1P_PASSWORD", "🔥")
POT_AMOUNT = parse_token_amount(os.getenv("POT_AMOUNT", "1"))
ENTRY_FEE = parse_token_amount(os.getenv("ENTRY_FEE", "0.1"))
DURATION = int(os.getenv("DURATION", "3600")) #1 hour

# Dynamic configuration (will be fetched from /chains endpoint)
EVM_RPC_URL = None
CONTRACT_ADDRESS = None
VIEM_CONFIG = None
EXPLORER_URL = None

# Load the real MoneyPot Contract ABI from JSON file
import json
import os

def load_money_pot_abi():
    """Load the real MoneyPot ABI from the JSON file"""
    abi_path = os.path.join(os.path.dirname(__file__), 'src', 'abis', 'MoneyPot.json')
    try:
        with open(abi_path, 'r') as f:
            abi_data = json.load(f)
            return abi_data['abi']
    except FileNotFoundError:
        print(f"Warning: Could not find ABI file at {abi_path}")
        print("Using simplified ABI for demo purposes")
        raise RuntimeError("abi not found")
# Load the real ABI
MONEY_POT_ABI = load_money_pot_abi()

# Minimal ERC20 ABI for approval operations
ERC20_ABI = [
    {
        "constant": False,
        "inputs": [
            {"name": "_spender", "type": "address"},
            {"name": "_value", "type": "uint256"}
        ],
        "name": "approve",
        "outputs": [{"name": "", "type": "bool"}],
        "type": "function"
    },
    {
        "constant": True,
        "inputs": [
            {"name": "_owner", "type": "address"},
            {"name": "_spender", "type": "address"}
        ],
        "name": "allowance",
        "outputs": [{"name": "", "type": "uint256"}],
        "type": "function"
    }
]


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


def load_hunter_account_from_env() -> Account:
    """Load hunter account from EVM_HUNTER_PRIVATE_KEY environment variable"""
    private_key = os.getenv("EVM_HUNTER_PRIVATE_KEY")
    if not private_key:
        raise RuntimeError("EVM_HUNTER_PRIVATE_KEY is not set")

    # Add proper 0x prefix if not present
    if not private_key.startswith('0x'):
        private_key = '0x' + private_key

    # Create account from private key
    account = Account.from_key(private_key)

    # Print the address for debugging
    print(f"✅ Loaded hunter account: {account.address} from environment variable")

    return account


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


def extract_pot_id_from_receipt(contract, receipt: Dict[str, Any]) -> Optional[int]:
    """Extract pot_id from PotCreated event in transaction receipt"""
    for log in receipt['logs']:
        try:
            decoded_log = contract.events.PotCreated().process_log(log)
            return decoded_log['args']['id']
        except:
            continue
    return None


def extract_attempt_id_from_receipt(contract, receipt: Dict[str, Any]) -> Optional[int]:
    """Extract attempt_id from PotAttempted event in transaction receipt"""
    for log in receipt['logs']:
        try:
            decoded_log = contract.events.PotAttempted().process_log(log)
            return decoded_log['args']['attemptId']
        except:
            continue
    return None


def get_pot_info(contract, pot_id: int) -> Dict[str, Any]:
    """Get pot information from contract"""
    try:
        pot_data = contract.functions.getPot(pot_id).call()
        return {
            'id': pot_data[0],
            'creator': pot_data[1],
            'amount': pot_data[2],
            'duration': pot_data[3],
            'fee': pot_data[4],
            'oneFA': pot_data[5],
            'createdAt': pot_data[6],
            'status': pot_data[7]
        }
    except Exception as e:
        print(f"Error getting pot info: {e}")
        return {}


def get_attempt_info(contract, attempt_id: int) -> Dict[str, Any]:
    """Get attempt information from contract"""
    try:
        attempt_data = contract.functions.getAttempt(attempt_id).call()
        return {
            'id': attempt_data[0],
            'potId': attempt_data[1],
            'hunter': attempt_data[2],
            'timestamp': attempt_data[3],
            'status': attempt_data[4]
        }
    except Exception as e:
        print(f"Error getting attempt info: {e}")
        return {}


def get_active_pots(contract) -> list[int]:
    """Get list of active pot IDs"""
    try:
        return contract.functions.getActivePots().call()
    except Exception as e:
        print(f"Error getting active pots: {e}")
        return []


def get_all_pots(contract) -> list[int]:
    """Get list of all pot IDs"""
    try:
        latest_pot_id = contract.functions.nextPotId().call()
        return list(range(0,latest_pot_id))
    except Exception as e:
        print(f"Error getting all pots: {e}")
        return []

def get_next_pot_id(contract) -> int:
    """Get the next available pot ID from the contract"""
    try:
        next_id = contract.functions.nextPotId().call()
        return next_id
    except Exception as e:
        print(f"Error getting next pot ID: {e}")
        return 1  # Fallback

async def fetch_chain_config(base_url: str, chain_id: int) -> Dict[str, Any]:
    """Fetch chain configuration from the /chains endpoint"""
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

class EVMVerifierServiceClient:
    """Client for interacting with the Money Pot Verifier Service (EVM version)"""

    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    def encrypt_with_rsa(self, data: str, public_key_pem: str) -> str:
        """Encrypt data with RSA public key using OAEP padding"""
        try:
            print(f"Encrypting data length: {len(data)}")
            print(f"Public key PEM (first 100 chars): {public_key_pem[:100]}...")

            # Load the public key from PEM format
            public_key = serialization.load_pem_public_key(public_key_pem.encode())

            # Encrypt the data
            encrypted = public_key.encrypt(
                data.encode('utf-8'),
                padding.OAEP(
                    mgf=padding.MGF1(algorithm=hashes.SHA256()),
                    algorithm=hashes.SHA256(),
                    label=None
                )
            )

            print(f"Encryption successful, encrypted length: {len(encrypted)}")
            # Return as hex string
            return encrypted.hex()
        except Exception as e:
            print(f"RSA encryption error: {e}")
            import traceback
            traceback.print_exc()
            # Fallback to simple hex encoding for MVP
            return data.encode().hex()

    async def health_check(self) -> Dict[str, Any]:
        """Check service health"""
        async with self.session.get(f"{self.base_url}/health") as response:
            return await response.json()

    async def get_supported_chains(self) -> Dict[str, Any]:
        """Get supported chains"""
        async with self.session.get(f"{self.base_url}/chains") as response:
            return await response.json()

    async def register_options(self) -> Dict[str, Any]:
        """Get encryption key for registration"""
        async with self.session.post(
            f"{self.base_url}/evm/register/options"
        ) as response:
            return await response.json()

    async def register_verify(self, payload_json: str, signature: str) -> Dict[str, Any]:
        """Register pot with 1P configuration"""
        # Format the request to match what the wallet authentication middleware expects
        # The wallet middleware will recover the address from the signature

        # payload_json is already a formatted JSON string that was signed
        # Don't re-serialize it!

        # Format the request for the wallet middleware
        request_payload = {
            "encrypted_payload": payload_json.encode('utf-8').hex(),  # Required by wallet auth middleware
            "signature": signature
        }

        async with self.session.post(
            f"{self.base_url}/evm/register/verify",
            json=request_payload
        ) as response:
            return await response.json()

    async def authenticate_options(self, attempt_id: str, hunter_account) -> Dict[str, Any]:
        """Get authentication challenges"""
        from eth_account.messages import encode_defunct

        # Create signature for wallet authentication
        # Sign the attempt_id directly
        message = encode_defunct(text=attempt_id)
        signature = hunter_account.sign_message(message)
        signature_hex = '0x' + signature.signature.hex() if hasattr(signature.signature, 'hex') else '0x' + str(signature.signature)

        # Create wallet payload
        wallet_payload = {
            "attempt_id": attempt_id,
            "chain_id": CHAIN_ID
        }
        # Convert to JSON for sending
        wallet_payload_json = json.dumps(wallet_payload)

        # Format request to match wallet auth middleware expectations
        request_payload = {
            "encrypted_payload": wallet_payload_json.encode('utf-8').hex(),
            "signature": signature_hex
        }

        async with self.session.post(
            f"{self.base_url}/evm/authenticate/options",
            json=request_payload
        ) as response:
            return await response.json()

    async def authenticate_verify(self, solutions: list, challenge_id: str, hunter_account) -> Dict[str, Any]:
        """Verify authentication solution with wallet authentication"""
        # Create signature for wallet authentication
        # IMPORTANT: The middleware specifically uses challenge_id as messageToVerify when challenge_id is present
        from eth_account.messages import encode_defunct

        # For authenticate_verify, only sign the challenge_id directly (as per middleware code)
        # See middleware: const messageToVerify = payload.challenge_id || JSON.stringify(payload);
        message = encode_defunct(text=challenge_id)
        signature = hunter_account.sign_message(message)
        signature_hex = '0x' + signature.signature.hex() if hasattr(signature.signature, 'hex') else '0x' + str(signature.signature)

        # Create wallet payload
        wallet_payload = {
            "challenge_id": challenge_id,
            "solutions": solutions,
            "chain_id": CHAIN_ID  # Include chain_id in signed payload
        }
        # Convert to JSON for sending
        wallet_payload_json = json.dumps(wallet_payload)

        # Format request to match middleware expectations - just encrypted_payload and signature
        request_payload = {
            "encrypted_payload": wallet_payload_json.encode('utf-8').hex(),
            "signature": signature_hex
        }

        print(f"Debug: Sending authenticate_verify with payload keys: {request_payload.keys()}")

        async with self.session.post(
            f"{self.base_url}/evm/authenticate/verify",
            json=request_payload
        ) as response:
            return await response.json()

    async def debug_get_pot(self, pot_id: str) -> Dict[str, Any]:
        """Get pot registration info for debugging"""
        async with self.session.get(
            f"{self.base_url}/evm/debug/pot/{pot_id}"
        ) as response:
            return await response.json()

    async def debug_delete_pot(self, pot_id: str) -> Dict[str, Any]:
        """Delete pot registration for debugging"""
        async with self.session.delete(
            f"{self.base_url}/evm/debug/pot/{pot_id}"
        ) as response:
            return await response.json()

class EVMMoneyPotApp:
    """Main application class for Money Pot flow on EVM"""

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
        self.chain_config = None

    def format_token_amount(self, amount_wei: int) -> str:
        """Format wei amount to human-readable token amount"""
        token_amount = amount_wei / (10 ** 18)
        if token_amount >= 1:
            return f"{token_amount:.6f}"
        else:
            return f"{token_amount:.18f}".rstrip('0').rstrip('.')

    def is_polkadot_chain(self) -> bool:
        """Check if the current chain is Polkadot (which doesn't support gas limits)"""
        if not self.chain_config:
            return False
        chain_name = self.chain_config.get('name', '').lower()
        chain_id = self.chain_config.get('chainId', 0)
        # Check by name or chain ID (Polkadot Hub Testnet has ID 420420422)
        return 'polkadot' in chain_name or chain_id == 420420422

    async def initialize(self):
        """Initialize the application"""
        print("🚀 Initializing EVM Money Pot Application...")
        print("=" * 50)

        # Initialize verifier service client first to fetch chain config
        self.verifier = EVMVerifierServiceClient(MONEY_AUTH_URL)

        # Fetch chain configuration from /chains endpoint
        print(f"📡 Fetching chain configuration for chain ID: {CHAIN_ID}")
        chain_config = await fetch_chain_config(MONEY_AUTH_URL, CHAIN_ID)

        # Extract configuration
        global EVM_RPC_URL, CONTRACT_ADDRESS, VIEM_CONFIG, EXPLORER_URL
        EVM_RPC_URL = chain_config['rpcUrl']
        CONTRACT_ADDRESS = chain_config['contractAddress']
        VIEM_CONFIG = chain_config.get('viemConfig', {})
        EXPLORER_URL = chain_config['explorerUrl']
        self.chain_config = chain_config

        print(f"✅ Chain: {chain_config['name']} ({chain_config['type']})")
        print(f"✅ Contract: {CONTRACT_ADDRESS}")
        print(f"✅ Explorer: {chain_config['explorerUrl']}")

        # Initialize Web3 with fetched RPC URL
        self.w3 = Web3(Web3.HTTPProvider(EVM_RPC_URL))
        if not self.w3.is_connected():
            raise RuntimeError(f"Failed to connect to EVM RPC: {EVM_RPC_URL}")

        print(f"✅ Connected to EVM chain: {CHAIN_ID}")

        # Load accounts from environment
        self.creator_account = load_creator_account_from_env()
        self.hunter_account = load_hunter_account_from_env()

        print(f"✅ Creator: {self.creator_account.address}")
        print(f"✅ Hunter:  {self.hunter_account.address}")

        # Initialize contract with fetched contract address
        self.contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(CONTRACT_ADDRESS),
            abi=MONEY_POT_ABI
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
            print(f"✅ Creator Balance: {self.format_token_amount(creator_balance)} {contract_symbol} ({creator_balance:,} units)")
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

            # Set default password and create legend mapping
            self.password = ONEP_PASSWORD  # Default password
            self.legend = {
                "red": self.directions.get("up", "U"),
                "green": self.directions.get("down", "D"),
                "blue": self.directions.get("left", "L"),
                "yellow": self.directions.get("right", "R")
            }
            print(f"✅ Password: {self.password}")
            print(f"✅ Legend: {self.legend}")

        print("=" * 50)

    def get_underlying_token_contract(self):
        """Get the underlying ERC20 token contract"""
        token_address = self.contract.functions.getTokenAddress().call()
        return self.w3.eth.contract(
            address=Web3.to_checksum_address(token_address),
            abi=ERC20_ABI
        )

    async def approve_token_spending(self, account: Account, amount: int, purpose: str):
        """Approve MoneyPot contract to spend tokens"""
        print(f"\n💰 Approving token spending for {purpose}")

        # Get underlying token contract
        token_contract = self.get_underlying_token_contract()
        token_address = token_contract.address

        # Check current allowance
        current_allowance = token_contract.functions.allowance(
            account.address,
            self.contract.address
        ).call()

        print(f"   Current allowance: {self.format_token_amount(current_allowance)} tokens ({current_allowance:,} units)")
        print(f"   Required amount: {self.format_token_amount(amount)} tokens ({amount:,} units)")

        if current_allowance >= amount:
            print(f"✅ Sufficient allowance already exists")
            return

        # Build approval transaction
        nonce = self.w3.eth.get_transaction_count(account.address, 'pending')
        gas_price = self.w3.eth.gas_price

        # Build transaction parameters - exclude gas limit for Polkadot
        tx_params = {
            'from': account.address,
            'gasPrice': gas_price,
            'nonce': nonce,
            'chainId': CHAIN_ID
        }
        
        # Don't pass gas limit for Polkadot chains
        if not self.is_polkadot_chain():
            tx_params['gas'] = 3000000

        approve_tx = token_contract.functions.approve(
            self.contract.address,
            amount
        ).build_transaction(tx_params)

        # Sign and send
        signed_tx = self.w3.eth.account.sign_transaction(approve_tx, account.key)
        tx_hash = self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        print(f"📝 Approval tx: 0x{tx_hash.hex()}")
        print(f"🔗 Explorer: {EXPLORER_URL}/tx/0x{tx_hash.hex()}")

        # Wait for confirmation
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        print(f"✅ Approval confirmed in block: {receipt.blockNumber}")

        if receipt.status == 0:
            raise RuntimeError("Approval transaction failed")

    async def create_pot_flow(self, amount_wei: int = None, duration_seconds: int = None, fee_wei: int = None):
        """Complete pot creation and registration flow

        Args:
            amount_wei: Amount in wei (smallest unit). Defaults to POT_AMOUNT from env
            duration_seconds: Pot duration in seconds. Defaults to DURATION from env
            fee_wei: Entry fee in wei. Defaults to ENTRY_FEE from env
        """
        # Use environment defaults if not specified
        amount_wei = amount_wei if amount_wei is not None else POT_AMOUNT
        fee_wei = fee_wei if fee_wei is not None else ENTRY_FEE
        duration_seconds = duration_seconds if duration_seconds is not None else DURATION

        print("\n📦 Creating EVM Money Pot")
        print("-" * 30)
        print(f"💰 Pot Amount: {self.format_token_amount(amount_wei)} tokens ({amount_wei} wei)")
        print(f"💸 Entry Fee: {self.format_token_amount(fee_wei)} tokens ({fee_wei} wei)")
        print(f"⏱️  Duration: {duration_seconds} seconds ({duration_seconds // 3600}h {duration_seconds % 3600 // 60}m)")

        # Get next pot ID to avoid conflicts
        next_pot_id = get_next_pot_id(self.contract)
        print(f"📋 Next pot ID: {next_pot_id}")

        # Approve token spending for pot creation
        await self.approve_token_spending(
            self.creator_account,
            amount_wei,
            f"pot creation ({self.format_token_amount(amount_wei)} tokens)"
        )

        # Build transaction with a fresh nonce
        # We'll use 'pending' to include pending transactions when calculating the nonce
        # This helps avoid the "already known" error
        nonce = self.w3.eth.get_transaction_count(self.creator_account.address, 'pending')
        gas_price = self.w3.eth.gas_price

        print(f"✅ Using nonce: {nonce} for transaction")

        # Build transaction parameters - exclude gas limit for Polkadot
        tx_params = {
            'from': self.creator_account.address,
            'gasPrice': gas_price,
            'nonce': nonce,
            'chainId': CHAIN_ID
        }
        
        # Don't pass gas limit for Polkadot chains
        if not self.is_polkadot_chain():
            tx_params['gas'] = 5000000

        transaction = self.contract.functions.createPot(
            amount_wei,
            duration_seconds,
            fee_wei,
            self.hunter_account.address  # Use hunter as 1FA address
        ).build_transaction(tx_params)

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
            raise RuntimeError("Transaction failed - check contract deployment and ABI")

        # Extract pot_id from events using utility function
        receipt_dict = get_transaction_receipt(self.w3, tx_hash.hex())
        pot_id = extract_pot_id_from_receipt(self.contract, receipt_dict)

        if pot_id is None:
            raise RuntimeError("Could not extract pot_id from creation events")

        print(f"✅ Pot ID: {pot_id}")

        # Get pot info for verification
        pot_info = get_pot_info(self.contract, pot_id)
        if pot_info:
            print(f"✅ Amount: {pot_info.get('amount')} USD")

        # Step 2: Register pot with verifier service
        print("\n🔐 Registering with verifier service...")
        async with self.verifier as verifier:
            # Get registration options
            register_options = await verifier.register_options()

            # Get the creator account address directly from the account object
            # This ensures we use the exact same address that will be recovered from the signature
            creator_address = self.creator_account.address
            print(f"✅ Creator account address from loaded private key: {creator_address}")

            # Print the private key hex (first 10 chars only for security)
            private_key_preview = self.creator_account.key.hex()[:10] + "..."
            print(f"✅ Creator account private key preview: {private_key_preview}")

            # Create payload with iss field (the address that will sign)
            current_time = int(time.time())
            payload = {
                "pot_id": str(pot_id),
                "1p": self.password,
                "legend": self.legend,
                "iat": current_time,
                "iss": creator_address,  # Use the original checksummed address
                "exp": current_time + 3600,
                "chain_id": CHAIN_ID  # Include chain_id in signed payload
            }

            print(f"✅ Created payload with issuer: {creator_address}")
            print(f"✅ Payload contents: {json.dumps(payload)[:100]}...")

            # Create signature for verification with the payload
            # This is crucial - the signature must be created with the same account that's set as issuer
            from eth_account.messages import encode_defunct

            # CRITICAL: Use compact JSON formatting to ensure 100% match with middleware
            # The middleware uses JSON.stringify() which by default adds spaces, so we match that
            # BUT - eth_account's encode_defunct expects the exact message that will be verified
            formatted_json = json.dumps(payload, separators=(',', ':'))
            print(f"Debug: JSON string being signed: {formatted_json}")

            # Create signature for the formatted JSON string
            message = encode_defunct(text=formatted_json)
            signature = self.creator_account.sign_message(message)
            signature_hex = '0x' + signature.signature.hex() if hasattr(signature.signature, 'hex') else '0x' + str(signature.signature)

            print(f"✅ Created signature: {signature_hex[:20]}...")
            print(f"✅ Signature length: {len(signature_hex)} characters")
            print(f"✅ Sending formatted JSON: {formatted_json}")

            # CRITICAL: Send the formatted JSON string (not the object) to match what was signed
            register_result = await verifier.register_verify(formatted_json, signature_hex)

            # Check if registration was successful
            if 'error' in register_result:
                if 'already registered' in register_result['error'].lower():
                    print(f"⚠️ Pot {pot_id} already registered, continuing...")
                    print(f"✅ Pot registration skipped (already exists)")
                else:
                    print(f"❌ Registration failed: {register_result['error']}")
                    raise RuntimeError(f"Pot registration failed: {register_result['error']}")
            else:
                print(f"✅ Pot registered successfully")

        return pot_id

    async def hunt_pot_flow(self, pot_id: str):
        """Complete treasure hunting flow: Request Attempt → Fail → Request Attempt → Succeed"""
        print(f"\n🎯 Hunting EVM Pot {pot_id}")
        print("-" * 30)

        # Step 1: Request First Attempt
        print("1️⃣  Request First Attempt")
        print("-" * 20)

        attempt_id1 = await self._request_attempt(pot_id)

        # Step 2: Fail First Attempt
        print("\n2️⃣  Fail First Attempt")
        print("-" * 20)

        await self._fail_attempt(attempt_id1)

        # Step 3: Request Second Attempt
        print("\n3️⃣  Request Second Attempt")
        print("-" * 20)

        attempt_id2 = await self._request_attempt(pot_id)

        # Step 4: Succeed Second Attempt
        print("\n4️⃣  Succeed Second Attempt")
        print("-" * 20)

        await self._succeed_attempt(attempt_id2)

        return attempt_id2

    async def _request_attempt(self, pot_id: str) -> int:
        """Request an attempt on the blockchain"""
        # Get pot info to determine fee
        pot_info = get_pot_info(self.contract, int(pot_id))
        fee = pot_info.get('fee', 0)

        # Approve token spending for attempt
        await self.approve_token_spending(
            self.hunter_account,
            fee,
            f"pot attempt (fee: {fee} tokens)"
        )

        # Build transaction with a fresh nonce
        # Use 'pending' to include pending transactions
        nonce = self.w3.eth.get_transaction_count(self.hunter_account.address, 'pending')
        gas_price = self.w3.eth.gas_price

        print(f"✅ Using nonce: {nonce} for attempt transaction")

        # Build transaction parameters - exclude gas limit for Polkadot
        tx_params = {
            'from': self.hunter_account.address,
            'gasPrice': gas_price,
            'nonce': nonce,
            'chainId': CHAIN_ID
        }
        
        # Don't pass gas limit for Polkadot chains
        if not self.is_polkadot_chain():
            tx_params['gas'] = 5000000

        transaction = self.contract.functions.attemptPot(int(pot_id)).build_transaction(tx_params)

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
            raise RuntimeError("Transaction failed - check contract deployment and ABI")

        # Extract attempt_id from events
        receipt_dict = get_transaction_receipt(self.w3, tx_hash.hex())
        attempt_id = extract_attempt_id_from_receipt(self.contract, receipt_dict)

        if attempt_id is None:
            raise RuntimeError("Could not extract attempt_id from attempt events")

        print(f"✅ Attempt ID: {attempt_id}")
        return attempt_id

    async def _fail_attempt(self, attempt_id: int):
        """Fail an attempt with wrong solutions"""
        async with self.verifier as verifier:
            # Get authentication challenges
            auth_options = await verifier.authenticate_options(str(attempt_id), self.hunter_account)
            print(f"✅ Got {len(auth_options.get('challenges', []))} challenges")

            # Extract challenge_id from the response
            challenge_id = auth_options.get('challenge_id')
            if not challenge_id:
                raise RuntimeError("No challenge_id returned from authenticate_options")
            print(f"✅ Challenge ID: {challenge_id}")

            # Generate wrong solutions
            challenges = auth_options.get('challenges', [])
            wrong_solutions = []

            import random
            DIRECTIONS = ["U", "D", "L", "R", "S"]

            for i, challenge in enumerate(challenges):
                # Find correct direction
                color_groups = challenge.get('colorGroups', {})
                password_color = None
                for color, chars in color_groups.items():
                    if self.password in chars:
                        password_color = color
                        break

                correct_direction = self.legend.get(password_color, "S") if password_color else "S"

                # Choose wrong direction
                wrong_directions = [d for d in DIRECTIONS if d != correct_direction]
                wrong_direction = random.choice(wrong_directions) if wrong_directions else "S"
                wrong_solutions.append(wrong_direction)

                print(f"   Challenge {i+1}: Correct={correct_direction}, Wrong={wrong_direction}")

            print(f"❌ Wrong solutions: {wrong_solutions}")

            # Verify wrong solutions (should fail)
            verify_result = await verifier.authenticate_verify(wrong_solutions, challenge_id, self.hunter_account)

            if 'error' in verify_result or not verify_result.get('success', False):
                print(f"✅ Intentional failure achieved!")
            else:
                print(f"⚠️  Unexpected success with wrong solutions!")

    async def _succeed_attempt(self, attempt_id: int):
        """Succeed an attempt with correct solutions"""
        async with self.verifier as verifier:
            # Get authentication challenges
            auth_options = await verifier.authenticate_options(str(attempt_id), self.hunter_account)
            print(f"✅ Got {len(auth_options.get('challenges', []))} challenges")

            # Extract challenge_id from the response
            challenge_id = auth_options.get('challenge_id')
            if not challenge_id:
                raise RuntimeError("No challenge_id returned from authenticate_options")
            print(f"✅ Challenge ID: {challenge_id}")

            # Generate correct solutions
            challenges = auth_options.get('challenges', [])
            correct_solutions = []

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
                    correct_solutions.append(direction)
                    print(f"   Challenge {i+1}: Password '{self.password}' → {password_color} → {direction}")
                else:
                    correct_solutions.append("S")
                    print(f"   Challenge {i+1}: Password '{self.password}' not found → Skip")

            print(f"✅ Correct solutions: {correct_solutions}")

            # Verify correct solutions (should succeed)
            verify_result = await verifier.authenticate_verify(correct_solutions, challenge_id, self.hunter_account)

            if verify_result.get('success', False):
                print(f"🎉 SUCCESS! Attempt with correct solutions succeeded!")
            else:
                print(f"❌ Unexpected failure with correct solutions!")
                print("Error: ", verify_result)

    async def display_contract_info(self):
        """Display contract information and active pots"""
        print("\n📊 Contract Information")
        print("-" * 30)

        try:
            # Get contract name and symbol
            contract_name = self.contract.functions.name().call()
            contract_symbol = self.contract.functions.symbol().call()
            print(f"Contract: {contract_name} ({contract_symbol})")

            # Get total supply
            total_supply = self.contract.functions.totalSupply().call()
            print(f"Total Supply: {self.format_token_amount(total_supply)} {contract_symbol} ({total_supply:,} units)")

            # Get active pots
            active_pots = get_active_pots(self.contract)
            print(f"Active Pots: {len(active_pots)}")

            # Get all pots
            all_pots = get_all_pots(self.contract)
            print(f"Total Pots: {len(all_pots)}")

            # Display creator and hunter balances
            creator_balance = self.contract.functions.balanceOf(self.creator_account.address).call()
            hunter_balance = self.contract.functions.balanceOf(self.hunter_account.address).call()

            print(f"Creator Balance: {self.format_token_amount(creator_balance)} {contract_symbol} ({creator_balance:,} units)")
            print(f"Hunter Balance: {self.format_token_amount(hunter_balance)} {contract_symbol} ({hunter_balance:,} units)")

            # Display native balances
            creator_native = self.w3.eth.get_balance(self.creator_account.address)
            hunter_native = self.w3.eth.get_balance(self.hunter_account.address)

            creator_native_eth = self.w3.from_wei(creator_native, 'ether')
            hunter_native_eth = self.w3.from_wei(hunter_native, 'ether')

            print(f"Creator Native: {creator_native_eth} ETH")
            print(f"Hunter Native: {hunter_native_eth} ETH")

        except Exception as e:
            print(f"⚠️  Could not get contract info: {e}")

    async def run_complete_flow(self):
        """Run the complete EVM Money Pot flow"""
        try:
            # Initialize
            await self.initialize()

            # Display contract information
            await self.display_contract_info()

            # Create pot
            pot_id = await self.create_pot_flow()

            # Hunt pot
            attempt_id = await self.hunt_pot_flow(pot_id)

            print(f"\n🎉 Complete EVM Flow Finished!")
            print("=" * 50)
            print(f"Pot ID: {pot_id}")
            print(f"Attempt ID: {attempt_id}")
            print("=" * 50)

        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()
            print(f"\n❌ EVM Integration Failed!")
            return  # Exit early on error

        print(f"\n🎉 EVM Integration Demo Complete!")

async def main():
    """Main entry point"""
    print("Money Pot EVM End-to-End Application")
    print("=" * 50)

    app = EVMMoneyPotApp()
    await app.run_complete_flow()

if __name__ == "__main__":
    asyncio.run(main())
