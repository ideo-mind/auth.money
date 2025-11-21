#!/usr/bin/env python3
"""
Debug test script to test signature verification
"""

import json
import os
from dotenv import load_dotenv
from eth_account import Account
from eth_account.messages import encode_defunct
import requests

# Load environment variables
load_dotenv()

# Load account
private_key = os.getenv('EVM_CREATOR_PRIVATE_KEY')
account = Account.from_key(private_key)

print(f"Account address: {account.address}")

# Create payload
payload = {
    "onePUser": "debug_test_user",
    "1p": "A",
    "legend": {"red": "U", "green": "D", "blue": "L", "yellow": "R"},
    "iat": 1234567890,
    "iss": account.address,
    "exp": 1234567890 + 3600
}

# Create signature
payload_json = json.dumps(payload, separators=(',', ':'))
print(f"Payload JSON: {payload_json}")

message = encode_defunct(text=payload_json)
signature = account.sign_message(message)
signature_hex = '0x' + signature.signature.hex()

print(f"Signature: {signature_hex}")

# Test recovery locally
recovered = Account.recover_message(message, signature=signature.signature)
print(f"Recovered address: {recovered}")
print(f"Match: {account.address.lower() == recovered.lower()}")

# Make request to backend
request_payload = {
    "encrypted_payload": payload_json.encode('utf-8').hex(),
    "signature": signature_hex
}

print(f"\nMaking request to backend...")
print(f"Request payload keys: {request_payload.keys()}")

try:
    response = requests.post(
        "http://localhost:8787/1p/register/verify",
        json=request_payload,
        headers={"MONEYPOT_CHAIN": "102031"}
    )
    
    print(f"Response status: {response.status_code}")
    print(f"Response: {response.text}")
    
except Exception as e:
    print(f"Request failed: {e}")
