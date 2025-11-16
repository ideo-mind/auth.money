import { recoverMessageAddress, recoverTypedDataAddress } from 'viem';
import { AptosAccount, HexString } from 'aptos';

export type SignatureType = 'aptos' | 'evm';

/**
 * Auto-detect signature type based on signature format
 */
export function detectSignatureType(signature: string): SignatureType {
  // EVM signatures are typically 132 characters (0x + 130 hex chars)
  // Aptos signatures are typically 128 characters (64 hex chars)
  
  const cleanSignature = signature.startsWith('0x') ? signature.slice(2) : signature;
  
  if (cleanSignature.length === 130) {
    return 'evm';
  } else if (cleanSignature.length === 128) {
    return 'aptos';
  }
  
  // Default to EVM for unknown formats
  return 'evm';
}

/**
 * Recover address from signature (auto-detects type)
 * Handles both plain messages and Ethereum signed messages (encode_defunct format)
 */
export async function recoverAddress(message: string, signature: string): Promise<string | null> {
  try {
    console.log("Debug: recoverAddress called with:", {
      message: message.substring(0, 100) + "...",
      signature: signature.substring(0, 20) + "...",
      signatureLength: signature.length
    });
    
    const signatureType = detectSignatureType(signature);
    console.log("Debug: Detected signature type:", signatureType);
    
    switch (signatureType) {
      case 'evm':
        // Try Ethereum signed message format (what encode_defunct creates)
        // This handles the "\x19Ethereum Signed Message:\n" prefix
        try {
          console.log('Debug: Trying Ethereum signed message format');
          return await recoverMessageAddress({
            message,
            signature: signature as `0x${string}`,
          });
        } catch (ethError) {
          console.log('Ethereum signed message recovery failed, trying raw message:', ethError);
          try {
            // Fallback to raw message recovery
            console.log('Debug: Trying raw message recovery');
            return await recoverMessageAddress({
              message: message as `0x${string}`,
              signature: signature as `0x${string}`,
            });
          } catch (rawError) {
            console.error('Both signature recovery methods failed:', { ethError, rawError });
            return null;
          }
        }
      
      case 'aptos':
        // For Aptos, we need to verify the signature and extract the address
        // This is a simplified approach - in practice, you'd need the public key
        // For now, we'll return null and handle verification differently
        return null;
      
      default:
        return null;
    }
  } catch (error) {
    console.error('Error recovering address:', error);
    return null;
  }
}

/**
 * Verify signature and check if it matches expected address
 */
export async function verifySignature(
  message: string, 
  signature: string, 
  expectedAddress: string
): Promise<boolean> {
  try {
    // Verify signature
    
    // Simple EVM signature recovery - just like in the example
    const recoveredAddress = await recoverMessageAddress({
      message: JSON.stringify(JSON.parse(message)), // Ensure it's properly formatted JSON
      signature: signature as `0x${string}`,
    });
    
    const isValid = recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    
    return isValid;
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

/**
 * Verify Aptos signature with public key
 */
export function verifyAptosSignature(
  message: string,
  signature: string,
  publicKey: string
): boolean {
  try {
    // Ensure public key has 0x prefix
    const publicKeyWithPrefix = publicKey.startsWith('0x') ? publicKey : `0x${publicKey}`;
    
    // Create Aptos account from public key
    const account = new AptosAccount(undefined, publicKeyWithPrefix);
    
    // Verify signature
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = HexString.ensure(signature);
    
    return account.verifySignature(HexString.fromUint8Array(messageBytes), signatureBytes);
  } catch (error) {
    console.error('Error verifying Aptos signature:', error);
    return false;
  }
}

/**
 * Get address from Aptos public key
 */
export function getAptosAddressFromPublicKey(publicKey: string): string {
  try {
    const publicKeyWithPrefix = publicKey.startsWith('0x') ? publicKey : `0x${publicKey}`;
    const account = new AptosAccount(undefined, publicKeyWithPrefix);
    return account.address().toString();
  } catch (error) {
    console.error('Error getting Aptos address from public key:', error);
    return '';
  }
}
