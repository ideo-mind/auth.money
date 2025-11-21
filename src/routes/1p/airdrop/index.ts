import { Hono } from "hono"
import { AirdropStore } from "@db/airdropStore"
import { IRunningContext } from "@/src/lib/context"
import { useWalletAuth } from "@mw/useWalletAuth"
import { Hash, Address, parseUnits, formatUnits, erc20Abi } from "viem"
import { creditcoinTestnet, getChain } from "@config/viem"
import { getWallet } from "../../../web3/walletFactory"
import { getTransactionParams } from "@/src/utils/chainUtils"

const router = new Hono<IRunningContext>()

// Apply wallet authentication middleware
router.use(useWalletAuth)

// Airdrop configuration
const AIRDROP_NATIVE_AMOUNT = parseUnits("10", 18) // 10 CTC
const AIRDROP_TOKEN_AMOUNT = parseUnits("100", 18) // 200 1P tokens
const AIRDROP_CONFIRMATION_TIMEOUT = 30 * 60 * 1000 // 30 minutes

interface AirdropRequestPayload {
  amount?: number
  message?: string
}

interface AirdropResponseDto {
  success: boolean
  message: string
  transactions?: {
    native: string
    token: string
  }
  chainId: number
  address: Address
  existingAirdrop?: any
}

interface AirdropErrorResponse {
  error: string
  airdropBalance?: string
  required?: string
  airdropTokenBalance?: string
  details?: string
  nativeTx?: string
  tokenTx?: string
  nativeStatus?: string
  tokenStatus?: string
}

/**
 * POST /evm/airdrop
 * Gives a one-time airdrop to the authenticated wallet.
 * Transfers 0.5 CTC (native) + 100 USDC (token) to the user.
 * Uses wallet signature verification for one-time claim per address.
 */
router.post("/", async (c) => {
  try {
    // Get wallet user from middleware context
    const walletUser = c.get("wallet_user") as Address
    const walletPayload = c.get("wallet_payload") as AirdropRequestPayload

    if (!walletUser) {
      return c.json({ error: "Wallet authentication required" }, 401)
    }

    console.log(`Airdrop request for wallet: ${walletUser}`)

    const chainId = c.get("chainId") as number
    const onepTokenAddress = c.get("onepTokenAddress") as string
    const publicClient = c.get("evmPublicClient")
    const store = new AirdropStore(c.env.AUTH_DB)

    // Check if user has already claimed an airdrop
    const existingRecord = await store.getAirdropRecord(walletUser, chainId)

    if (existingRecord) {
      return c.json({
        success: false,
        message: "You have already claimed the airdrop",
        chainId,
        address: walletUser,
        existingAirdrop: existingRecord,
      } as AirdropResponseDto)
    }

    // Get airdrop wallet using EVM_AIRDROP_ACCOUNT and PRIVATE_KEY_${address} pattern
    const airdropAddress = c.env.EVM_AIRDROP_ACCOUNT
    if (!airdropAddress) {
      const errorResponse: AirdropErrorResponse = {
        error: "EVM_AIRDROP_ACCOUNT not set in environment variables",
      }
      return c.json(errorResponse, 500)
    }

    // @ts-ignore
    const airdropPrivateKey = c.env[`PRIVATE_KEY_${airdropAddress}`]
    if (!airdropPrivateKey) {
      const errorResponse: AirdropErrorResponse = {
        error: `PRIVATE_KEY_${airdropAddress} not found in environment variables`,
      }
      return c.json(errorResponse, 500)
    }

    const chain = getChain(chainId)
    const airdropWallet = getWallet(airdropPrivateKey, c.env, chain)

    // Get transaction parameters - exclude gas for Polkadot chains
    const txParams = getTransactionParams(chain)

    // Execute transfers directly - no balance checking
    const transferPromises = []

    // 1. Transfer native token
    // Note: We don't pass gas limit - viem will handle it automatically
    // For Polkadot chains, gas limits are not supported and will be excluded
    const nativeTransferPromise = airdropWallet.sendTransaction({
      to: walletUser,
      value: AIRDROP_NATIVE_AMOUNT,
      account: airdropWallet.account!,
      chain: airdropWallet.chain,
      ...txParams,
    })

    // 2. Transfer OneP tokens
    if (!onepTokenAddress) {
      const errorResponse: AirdropErrorResponse = {
        error: `OneP token not deployed on chain ${chainId}`,
      }
      return c.json(errorResponse, 400)
    }

    // Note: We don't pass gas limit - viem will handle it automatically
    // For Polkadot chains, gas limits are not supported and will be excluded
    const tokenTransferPromise = airdropWallet.writeContract({
      address: onepTokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [walletUser, AIRDROP_TOKEN_AMOUNT],
      account: airdropWallet.account!,
      chain: airdropWallet.chain,
      ...txParams,
    })

    transferPromises.push(nativeTransferPromise, tokenTransferPromise)

    // Execute transfers in parallel (nonce management handles conflicts)
    console.log(`Executing parallel airdrop transfers for ${walletUser}`)
    const [nativeTxHash, tokenTxHash] = await Promise.all(transferPromises)

    // Store the airdrop record with native transaction hash
    await store.setAirdropTx(walletUser, nativeTxHash, chainId)

    // Wait for transaction confirmations
    console.log(`Waiting for airdrop transaction confirmations...`)
    const [nativeReceipt, tokenReceipt] = await Promise.all([
      publicClient.waitForTransactionReceipt({ hash: nativeTxHash }),
      publicClient.waitForTransactionReceipt({ hash: tokenTxHash }),
    ])

    // Check if transactions were successful
    if (
      nativeReceipt.status !== "success" ||
      tokenReceipt.status !== "success"
    ) {
      const errorResponse: AirdropErrorResponse = {
        error: "One or more airdrop transfers failed",
        nativeTx: nativeTxHash,
        tokenTx: tokenTxHash,
        nativeStatus: nativeReceipt.status,
        tokenStatus: tokenReceipt.status,
      }
      return c.json(errorResponse, 500)
    }

    // Update airdrop record with confirmation
    await store.confirmAirdropTx(walletUser, nativeReceipt, chainId)

    const successResponse: AirdropResponseDto = {
      success: true,
      message: "Airdrop transfer completed successfully",
      transactions: {
        native: nativeTxHash,
        token: tokenTxHash,
      },
      chainId,
      address: walletUser,
    }

    console.log(`Airdrop transfer completed for ${walletUser}:`, {
      nativeTx: nativeTxHash,
      tokenTx: tokenTxHash,
    })

    return c.json(successResponse)
  } catch (error) {
    console.error("Airdrop error:", error)

    // Just log and pass down the error - no specific error handling
    const errorResponse: AirdropErrorResponse = {
      error: "Airdrop transfer failed",
      details: error instanceof Error ? error.message : "Unknown error",
    }
    return c.json(errorResponse, 500)
  }
})

export default router
