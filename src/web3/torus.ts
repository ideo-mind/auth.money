import { Hash, PublicClient, TransactionReceipt } from "viem"
import TimedCache from "timed-cache"
import { creditcoinTestnet } from "@config/viem"
// Cache average block time (in ms) per chain for 5 minutes (using timed-cache)

// Track number of in-flight waits per chain to scale timeout proportionally
const chainConcurrency = new Map<string, number>()

const cache_ttl = 5 * 1000 //5s

const averageBlockTimeMsCache = new TimedCache<string, number>({ defaultTtl: cache_ttl })

function getChainKey(client: PublicClient): string {
  // Fall back to Torus mainnet if client lacks chain info
  return String(client.chain?.id ?? creditcoinTestnet.id)
}

// gets: BlockTime in ms
export async function getAverageBlockTime(
  publicClient: PublicClient,
  blockCount: number = 30
): Promise<number> {
  const chainKey = getChainKey(publicClient)
  const cached = averageBlockTimeMsCache.get(chainKey)
  if (cached !== undefined) return cached

  const latestBlock = await publicClient.getBlock({ blockTag: "latest" })

  const count = BigInt(blockCount)
  const fromBlockNumber = latestBlock.number > count ? latestBlock.number - count : 0n
  const fromBlock = await publicClient.getBlock({
    blockNumber: fromBlockNumber,
  })

  const timeDiff = latestBlock.timestamp - fromBlock.timestamp // seconds
  const averageSecondsPerBlock = timeDiff / count
  const averageMs = Math.ceil(Number(averageSecondsPerBlock) * 1e3)

  // cache for 5 minutes (default TTL)
  averageBlockTimeMsCache.put(chainKey, averageMs)

  console.debug(
    `[web3/torus] averageBlockTimeMs chain=${chainKey} blocks=${blockCount} ms=${averageMs}`
  )

  return averageMs
}

// timeoutMs: to averageBlockTime
export async function waitForTransactionReceipt(
  client: PublicClient,
  txHash: Hash,
  confirmations?: number,
  timeoutMs?: number
): Promise<TransactionReceipt> {
  const chainKey = getChainKey(client)
  const inFlight = (chainConcurrency.get(chainKey) ?? 0) + 1
  chainConcurrency.set(chainKey, inFlight)

  try {
    let effectiveTimeout = timeoutMs
    if (!effectiveTimeout) {
      const averageMs = await getAverageBlockTime(client, 50)
      // Preserve baseline of ~20 blocks, scaled by number of concurrent waits on this chain
      const BASE_BLOCKS = 100
      const blocksToWait = BASE_BLOCKS * Math.max(inFlight, 1)
      effectiveTimeout = Math.ceil(averageMs * blocksToWait)
      effectiveTimeout = Math.max(effectiveTimeout, 300e3)
    }

    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      confirmations: confirmations ?? 1,
      timeout: effectiveTimeout,
    })

    console.debug(
      `[web3/torus] (${txHash}) confirmed in block ${receipt.blockNumber} ` +
        `(chain=${chainKey}, confirmations=${confirmations ?? 1}, timeoutMs=${effectiveTimeout})`
    )

    return receipt
  } catch (error) {
    console.error(
      `[web3/torus] waitForTransactionReceipt error (chain=${chainKey}, tx=${txHash}):`,
      error
    )
    throw error
  } finally {
    // Decrease the concurrency counter for this chain
    const current = chainConcurrency.get(chainKey) ?? 1
    const next = current - 1
    if (next > 0) chainConcurrency.set(chainKey, next)
    else chainConcurrency.delete(chainKey)
  }
}
