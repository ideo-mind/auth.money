#!/usr/bin/env python3
"""
Money Pot End-to-End Application
Integrates with the verifier service for complete pot creation and hunting flow
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

# Load environment variables
load_dotenv()

# Aptos SDK imports
from aptos_sdk.account import Account
from aptos_sdk.async_client import RestClient as AsyncRestClient
from aptos_sdk.bcs import Serializer
from aptos_sdk.transactions import (
    EntryFunction,
    TransactionArgument,
    TransactionPayload,
    SignedTransaction,
)
from aptos_sdk.account_address import AccountAddress

# Configuration
MONEY_AUTH_URL = os.getenv("MONEY_AUTH_URL","https://auth.money-pot.ideomind.org/")
NODE_URL = os.getenv("RPC_URL", "https://fullnode.testnet.aptoslabs.com/v1")
MODULE_ADDR = os.getenv("MONEY_POT_ADDRESS", "0xea89ef9798a210009339ea6105c2008d8e154f8b5ae1807911c86320ea03ff3f")
MODULE_QN = f"{MODULE_ADDR}::money_pot_manager"

PASSWORD = os.getenv("PASSWORD", "🔥")

def load_main_account_from_env() -> Account:
    """Load account from APTOS_PRIVATE_KEY environment variable"""
    private_key = os.getenv("APTOS_PRIVATE_KEY")
    if not private_key:
        raise RuntimeError("APTOS_PRIVATE_KEY is not set")
    return Account.load_key(private_key)


def load_hunter_account_from_env() -> Account:
    """Load hunter account from HUNTER_PRIVATE_KEY environment variable"""
    private_key = os.getenv("HUNTER_PRIVATE_KEY")
    if not private_key:
        raise RuntimeError("HUNTER_PRIVATE_KEY is not set")
    return Account.load_key(private_key)


async def create_account(client: AsyncRestClient, creator: Account, new_account: Account) -> str:
    """Create a new account"""
    entry = EntryFunction.natural(
        "0x1::aptos_account",
        "create_account",
        [],
        [
            TransactionArgument(new_account.account_address, lambda s, addr: addr.serialize(s)),
        ],
    )

    payload = TransactionPayload(entry)
    return await submit_transaction(client, creator, payload)


async def fund_account(client: AsyncRestClient, sender: Account, receiver: AccountAddress, amount: int) -> str:
    """Fund an account with APT tokens"""
    entry = EntryFunction.natural(
        "0x1::aptos_account",
        "transfer",
        [],
        [
            TransactionArgument(receiver, lambda s, addr: addr.serialize(s)),
            TransactionArgument(amount, Serializer.u64),
        ],
    )

    payload = TransactionPayload(entry)
    return await submit_transaction(client, sender, payload)


async def fund_fungible_asset(client: AsyncRestClient, sender: Account, receiver: AccountAddress, token_address: str, amount: int) -> str:
    """Fund an account with fungible assets"""
    from aptos_sdk.transactions import TypeTag, StructTag

    token_addr = AccountAddress.from_str(token_address)

    # Create the type argument for the fungible asset
    type_arg = TypeTag(StructTag(
        AccountAddress.from_str("0x1"),
        "fungible_asset",
        "FungibleAsset",
        [TypeTag(StructTag(token_addr, "", "", []))]
    ))

    entry = EntryFunction.natural(
        "0x1::primary_fungible_store",
        "transfer",
        [type_arg],
        [
            TransactionArgument(receiver, lambda s, addr: addr.serialize(s)),
            TransactionArgument(amount, Serializer.u64),
        ],
    )

    payload = TransactionPayload(entry)
    return await submit_transaction(client, sender, payload)


async def submit_transaction(client: AsyncRestClient, account: Account, payload: TransactionPayload) -> str:
    """Submit a transaction and return the hash"""
    # Create and sign the transaction using the SDK method
    signed_txn = await client.create_bcs_signed_transaction(account, payload)

    # Submit and wait
    result = await client.submit_and_wait_for_bcs_transaction(signed_txn)
    return result["hash"]


async def get_transaction_events(client: AsyncRestClient, tx_hash: str) -> list[Dict[str, Any]]:
    """Get events from a transaction"""
    tx = await client.transaction_by_hash(tx_hash)
    return tx.get("events", [])


def extract_pot_id_from_events(events: list[Dict[str, Any]]) -> Optional[int]:
    """Extract pot_id from PotEvent with event_type 'created'"""
    for event in events:
        if event.get("type") == f"{MODULE_ADDR}::money_pot_manager::PotEvent":
            data = event.get("data", {})
            event_type_hex = data.get("event_type", "")
            if event_type_hex:
                try:
                    event_type = bytes.fromhex(event_type_hex[2:]).decode()  # Remove '0x' prefix
                    if event_type == "created":
                        return int(data.get("id", 0))
                except:
                    continue
    return None


def extract_attempt_id_from_events(events: list[Dict[str, Any]]) -> Optional[int]:
    """Extract attempt_id from PotEvent with event_type 'attempted'"""
    for event in events:
        if event.get("type") == f"{MODULE_ADDR}::money_pot_manager::PotEvent":
            data = event.get("data", {})
            event_type_hex = data.get("event_type", "")
            if event_type_hex:
                try:
                    event_type = bytes.fromhex(event_type_hex[2:]).decode()  # Remove '0x' prefix
                    if event_type == "attempted":
                        return int(data.get("id", 0))
                except:
                    continue
    return None


async def view_function(client: AsyncRestClient, func_qn: str, args: list[bytes]) -> list:
    return await client.view(func_qn, [], args)


async def create_pot(
    client: AsyncRestClient,
    creator: Account,
    amount: int,
    duration_seconds: int,
    fee: int,
    one_fa_address: AccountAddress,
) -> str:
    """Create pot and return transaction hash"""
    # Use TransactionArgument objects with correct encoders
    entry = EntryFunction.natural(
        MODULE_QN,
        "create_pot_entry",
        [],
        [
            TransactionArgument(amount, Serializer.u64),
            TransactionArgument(duration_seconds, Serializer.u64),
            TransactionArgument(fee, Serializer.u64),
            TransactionArgument(one_fa_address, lambda s, addr: addr.serialize(s)),
        ],
    )

    payload = TransactionPayload(entry)
    return await submit_transaction(client, creator, payload)


async def attempt_pot(client: AsyncRestClient, hunter: Account, pot_id: int) -> str:
    """Attempt pot and return transaction hash"""
    entry = EntryFunction.natural(
        MODULE_QN,
        "attempt_pot_entry",
        [],
        [TransactionArgument(pot_id, Serializer.u64)],
    )

    payload = TransactionPayload(entry)
    return await submit_transaction(client, hunter, payload)


async def attempt_completed(
    client: AsyncRestClient, oracle: Account, attempt_id: int, status: bool
) -> str:
    """Mark attempt as completed and return transaction hash"""
    entry = EntryFunction.natural(
        MODULE_QN,
        "attempt_completed",
        [],
        [
            TransactionArgument(attempt_id, Serializer.u64),
            TransactionArgument(status, Serializer.bool),
        ],
    )

    payload = TransactionPayload(entry)
    return await submit_transaction(client, oracle, payload)


async def get_active_pots(client: AsyncRestClient) -> list[int]:
    res = await view_function(client, f"{MODULE_QN}::get_active_pots", [])
    return [int(x) for x in res]


async def get_pots(client: AsyncRestClient) -> list[int]:
    res = await view_function(client, f"{MODULE_QN}::get_pots", [])
    return [int(x) for x in res]


async def get_attempt(client: AsyncRestClient, attempt_id: int) -> dict:
    ser = Serializer()
    ser.u64(attempt_id)
    res = await view_function(client, f"{MODULE_QN}::get_attempt", [ser.output()])
    return res  # SDK returns decoded fields; keep generic

class VerifierServiceClient:
    """Client for interacting with the Money Pot Verifier Service"""

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

    async def register_options(self) -> Dict[str, Any]:
        """Get registration options"""
        async with self.session.post(f"{self.base_url}/aptos/register/options") as response:
            return await response.json()

    async def register_verify(self, payload: Dict[str, Any], signature: str) -> Dict[str, Any]:
        """Register pot with 1P configuration"""
        request_payload = {
            "payload": payload,
            "signature": signature
        }
        async with self.session.post(
            f"{self.base_url}/aptos/register/verify",
            json=request_payload
        ) as response:
            return await response.json()

    async def authenticate_options(self, attempt_id: str, signature: str) -> Dict[str, Any]:
        """Get authentication challenges"""
        payload = {
            "payload": {"attempt_id": attempt_id, "signature": signature},
            "public_key": signature  # The endpoint expects public_key field
        }
        async with self.session.post(
            f"{self.base_url}/aptos/authenticate/options",
            json=payload
        ) as response:
            return await response.json()

    async def authenticate_verify(self, solutions: list, challenge_id: str) -> Dict[str, Any]:
        """Verify authentication solution"""
        payload = {
            "solutions": solutions,
            "challenge_id": challenge_id
        }
        async with self.session.post(
            f"{self.base_url}/aptos/authenticate/verify",
            json=payload
        ) as response:
            return await response.json()

class MoneyPotApp:
    """Main application class for Money Pot flow"""

    def __init__(self):
        self.client = None
        self.creator_account = None
        self.hunter_account = None
        self.verifier = None
        self.colors = None
        self.directions = None
        self.password = None
        self.legend = None

    async def initialize(self):
        """Initialize the application"""
        print("🚀 Initializing Money Pot Application...")

        # Initialize Aptos client
        self.client = AsyncRestClient(NODE_URL)

        # Load accounts from environment
        self.creator_account = load_main_account_from_env()
        self.hunter_account = load_hunter_account_from_env()

        print(f"✅ Creator account: {self.creator_account.account_address}")
        print(f"✅ Hunter account: {self.hunter_account.account_address}")

        # Initialize verifier service client
        self.verifier = VerifierServiceClient(MONEY_AUTH_URL)

        # Check verifier service health and get configuration
        async with self.verifier as verifier:
            health = await verifier.health_check()
            print(f"✅ Verifier service: {health['status']}")

            # Get colors and directions from register options
            register_options = await verifier.register_options()
            self.colors = register_options.get('colors', {})
            self.directions = register_options.get('directions', {})
            print(f"✅ Colors: {self.colors}")
            print(f"✅ Directions: {self.directions}")

            # Store color hex codes for UI rendering
            self.color_hex_codes = self.colors  # The API now returns hex codes directly

            # Set default password and create legend mapping
            self.password = PASSWORD  # Default password
            self.legend = {
                "red": self.directions.get("up", "U"),
                "green": self.directions.get("down", "D"),
                "blue": self.directions.get("left", "L"),
                "yellow": self.directions.get("right", "R")
            }
            print(f"✅ Legend: {self.legend}")

            # Store direction mappings for later use
            self.direction_mappings = self.directions

    async def create_pot_flow(self, amount: int = 10000, duration_seconds: int = 360, fee: int = 100):
        """Complete pot creation and registration flow"""
        print("\n📦 Creating Money Pot...")

        # Step 1: Create pot on blockchain
        print("1. Creating pot on blockchain...")
        create_tx_hash = await create_pot(
            self.client,
            self.creator_account,
            amount,
            duration_seconds,
            fee,
            self.hunter_account.account_address  # Use hunter as 1FA address
        )
        print(f"   Transaction: {create_tx_hash}")

        # Extract pot_id from events
        create_events = await get_transaction_events(self.client, create_tx_hash)
        pot_id = extract_pot_id_from_events(create_events)
        if pot_id is None:
            raise RuntimeError("Could not extract pot_id from creation events")
        print(f"   ✅ Pot ID: {pot_id}")

        # Step 2: Register pot with verifier service
        print("2. Registering pot with verifier service...")
        async with self.verifier as verifier:
            # Get registration options
            register_options = await verifier.register_options()
            print(f"   ✅ Got registration options")

            # Create 1P configuration payload
            current_time = int(asyncio.get_event_loop().time())
            payload = {
                "pot_id": str(pot_id),
                "1p": self.password,  # Dynamic password
                "legend": self.legend,  # Dynamic legend from register options
                "iat": current_time,
                "iss": str(self.creator_account.account_address),
                "exp": current_time + 3600
            }

            # Create signature for verification (simplified for MVP)
            signature = "mock_signature"  # Simplified for MVP

            register_result = await verifier.register_verify(payload, signature)
            print(f"   ✅ Pot registered: {register_result}")

        return pot_id

    async def hunt_pot_flow(self, pot_id: str):
        """Complete treasure hunting flow"""
        print(f"\n🎯 Hunting Pot {pot_id}...")

        # Step 1: Attempt pot on blockchain
        print("1. Attempting pot on blockchain...")
        attempt_tx_hash = await attempt_pot(self.client, self.hunter_account, int(pot_id))
        print(f"   Transaction: {attempt_tx_hash}")

        # Extract attempt_id from events
        attempt_events = await get_transaction_events(self.client, attempt_tx_hash)
        attempt_id = extract_attempt_id_from_events(attempt_events)
        if attempt_id is None:
            raise RuntimeError("Could not extract attempt_id from attempt events")
        print(f"   ✅ Attempt ID: {attempt_id}")

        # Step 2: Get authentication challenges
        print("2. Getting authentication challenges...")
        async with self.verifier as verifier:
            # Use hunter's address as the signature since that's what was used in pot creation
            hunter_address = str(self.hunter_account.account_address)
            print(f"   Debug: Hunter address: {hunter_address}")

            # Use the address directly as the signature
            hunter_signature = hunter_address
            auth_options = await verifier.authenticate_options(str(attempt_id), hunter_signature)
            print(f"   ✅ Got {len(auth_options.get('challenges', []))} challenges")

            # Update color and direction mappings from authenticate response if available
            if 'colors' in auth_options:
                self.colors = auth_options.get('colors')
                print(f"   ✅ Updated colors from authenticate: {self.colors}")

            if 'directions' in auth_options:
                self.directions = auth_options.get('directions')
                print(f"   ✅ Updated directions from authenticate: {self.directions}")

            # Step 3: Solve challenges based on strategy
            print("3. Solving challenges...")
            # Use direction mappings from the API
            DIRECTIONS = [
                self.directions.get("up", "U"),
                self.directions.get("down", "D"),
                self.directions.get("left", "L"),
                self.directions.get("right", "R"),
                self.directions.get("skip", "S")
            ]

            # Get strategy from environment variable
            strategy = os.getenv("STRATEGY", "intelligent").lower()
            print(f"   Strategy: {strategy}")

            # Get the challenges and solve them based on strategy
            challenges = auth_options.get('challenges', [])
            solutions = []

            if strategy == "random":
                # Random strategy: generate random solutions
                import random
                solutions = [random.choice(DIRECTIONS) for _ in range(len(challenges))]
                print(f"   Random solutions: {solutions}")
            else:
                # Intelligent strategy: solve based on color groups and legend
                # We know the password is "A" and use the legend from initialization
                password = self.password
                legend = self.legend  # Use the legend we created during initialization

                for i, challenge in enumerate(challenges):
                    print(f"   Challenge {i+1}: {challenge}")

                    # Get the color groups for this challenge
                    color_groups = challenge.get('colorGroups', {})

                    # Find which color group contains our password character
                    password_color = None
                    for color, chars in color_groups.items():
                        if password in chars:
                            password_color = color
                            break

                    if password_color:
                        # Map color to direction using our legend
                        direction = legend.get(password_color, "S")
                        solutions.append(direction)
                        print(f"   Password '{password}' is in {password_color} group -> {direction}")
                    else:
                        # Fallback to Skip if password not found
                        solutions.append("S")
                        print(f"   Password '{password}' not found in color groups -> Skip")

            print(f"   Solutions: {solutions}")

            # Step 4: Verify solutions
            print("4. Verifying solutions...")
            verify_result = await verifier.authenticate_verify(solutions, str(attempt_id))
            print(f"   ✅ Authentication result: {verify_result}")

        return attempt_id

    async def run_complete_flow(self):
        """Run the complete Money Pot flow"""
        try:
            # Initialize
            await self.initialize()

            # Create pot
            pot_id = await self.create_pot_flow()

            # Hunt pot
            attempt_id = await self.hunt_pot_flow(pot_id)

            print(f"\n🎉 Complete flow finished!")
            print(f"   Pot ID: {pot_id}")
            print(f"   Attempt ID: {attempt_id}")

        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()

        finally:
            if self.client:
                await self.client.close()

async def main():
    """Main entry point"""
    print("Money Pot End-to-End Application")
    print("=" * 40)

    app = MoneyPotApp()
    await app.run_complete_flow()

if __name__ == "__main__":
    asyncio.run(main())
