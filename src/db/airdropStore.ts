import { Address, Hash, sha256, TransactionReceipt } from "viem"

interface StoredReceipt {
  blockHash: string
  blockNumber?: string
  contractAddress?: Address | null
  from: Address
  status?: any
  to?: Address | null
  transactionHash: string
  type?: any
}

interface AirdropRecord {
  txHash: Hash
  confirmed: boolean
  receipt?: StoredReceipt
  timestamp: number
  chainId: number
}

// Store abstraction for airdrop txHashes in WalletDB (KV)
export class AirdropStore {
  private kv: KVNamespace
  static readonly PREFIX = "AIRDROP-"

  constructor(kv: KVNamespace) {
    this.kv = kv
  }

  static hash(address: Address): string {
    return sha256(address)
  }

  static key(address: Address, chainId?: number): string {
    // New per-chain key format; falls back to legacy (no chain) when chainId is undefined
    if (typeof chainId === "number") {
      return `${AirdropStore.PREFIX}${chainId}-${AirdropStore.hash(address)}`
    }
    return `${AirdropStore.PREFIX}${AirdropStore.hash(address)}`
  }

  async getAirdropRecord(
    address: Address,
    chainId: number
  ): Promise<AirdropRecord | null> {
    try {
      // Attempt to read per-chain key first
      const newKey = AirdropStore.key(address, chainId)
      let parsed = (await this.kv.get(newKey, {
        type: "json",
      })) as AirdropRecord | null

      // Legacy fallback: if not found, try old key (no chainId)
      if (!parsed) {
        const legacyData = await this.kv.get(AirdropStore.key(address), {
          type: "text",
        })
        if (!legacyData) return null

        // Handle legacy format (just txHash as string)
        if (legacyData.startsWith("0x")) {
          return {
            txHash: legacyData as Hash,
            confirmed: false,
            timestamp: Date.now(),
            chainId,
          }
        }

        // Parse legacy JSON record
        const legacyParsed = JSON.parse(legacyData) as Partial<AirdropRecord>
        parsed = {
          txHash: legacyParsed.txHash as Hash,
          confirmed: Boolean(legacyParsed.confirmed),
          receipt: legacyParsed.receipt as StoredReceipt | undefined,
          timestamp:
            typeof legacyParsed.timestamp === "number"
              ? legacyParsed.timestamp
              : Date.now(),
          chainId:
            typeof legacyParsed.chainId === "number"
              ? legacyParsed.chainId
              : chainId,
        }
      }

      return parsed
    } catch (error) {
      console.error(`Error parsing airdrop record for ${address}:`, error)
      return null
    }
  }

  async setAirdropTx(
    address: Address,
    txHash: Hash,
    chainId: number
  ): Promise<void> {
    const record: AirdropRecord = {
      txHash,
      confirmed: false,
      timestamp: Date.now(),
      chainId,
    }
    await this.kv.put(
      AirdropStore.key(address, chainId),
      JSON.stringify(record)
    )
  }

  async confirmAirdropTx(
    address: Address,
    receipt: TransactionReceipt,
    chainId: number
  ): Promise<void> {
    const record = await this.getAirdropRecord(address, chainId)
    if (!record) return

    const confirmedRecord: AirdropRecord = {
      ...record,
      confirmed: true,
      receipt: {
        blockHash: receipt.blockHash as unknown as string,
        blockNumber: receipt.blockNumber?.toString(),
        contractAddress: (receipt as any).contractAddress ?? null,
        from: receipt.from as unknown as Address,
        status: (receipt as any).status,
        to: (receipt as any).to ?? null,
        transactionHash: receipt.transactionHash as unknown as string,
        type: (receipt as any).type,
      },
      timestamp: Date.now(),
    }

    await this.kv.put(
      AirdropStore.key(address, chainId),
      JSON.stringify(confirmedRecord)
    )
  }

  async deleteAirdropTx(address: Address, chainId: number): Promise<void> {
    await this.kv.delete(AirdropStore.key(address, chainId))
  }
}
