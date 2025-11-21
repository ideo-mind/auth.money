import type { DurableObjectState } from "@cloudflare/workers-types"
import { DurableObject } from "cloudflare:workers"
import { Env } from "hono"

import { INonceManager } from "./NonceManager.d"
import { creditcoinTestnet } from "@config/viem"

interface NonceDto {
  nonce: number | null
  expiresAt: number // milliseconds since epoch of last update
}

interface IState {
  nonce: number | null
  expiresAt: number
}

const MAX_RPS: Record<number, number> = {
  [creditcoinTestnet.id]: 3,
}

// Backed by KV
export class NonceManagerV1 extends DurableObject implements INonceManager {
  public static TTL = 30e3 // milliseconds (30 seconds)
  state: DurableObjectState
  public static version = "v1.9.0" // versioning for DO upgrades; only useful if persist storage
  readonly version = NonceManagerV1.version

  private incTimestamps: number[] = []

  readonly s = "state"

  private chainID: number = creditcoinTestnet.id
  public maxRatePerSec: number = MAX_RPS[creditcoinTestnet.id] //todo configureb...
  public static MAX_RATE_PER_SEC = 10

  constructor(state: DurableObjectState, env: Env) {
    // @ts-expect-error
    super(state, env)
    this.state = state
  }

  private async getState(): Promise<NonceDto> {
    const state = await this.state.storage.get<IState>(this.s, {
      allowConcurrency: false,
      noCache: true,
    })

    if (!state) {
      return { nonce: null, expiresAt: 0 }
    }

    return { nonce: state.nonce, expiresAt: state.expiresAt }
  }

  private async setNonce(newNonce: number, ttl = NonceManagerV1.TTL) {
    const current = await this.getState()

    if (current.nonce && !NonceManagerV1.expired(current.expiresAt)) {
      if (newNonce < current.nonce) throw new Error("higher nonce already set")
    }

    const expiresAt = Date.now() + ttl
    const newState: IState = {
      nonce: newNonce,
      expiresAt: expiresAt,
    }

    await this.state.storage.put(this.s, newState, {
      noCache: true,
      allowConcurrency: false,
    })
  }

  private async expired(): Promise<boolean> {
    const state = await this.state.storage.get<IState>(this.s)
    return NonceManagerV1.expired(state?.expiresAt ?? 0)
  }

  public static expired(expiresAt: number) {
    if (expiresAt == 0) return true
    const now = Date.now()
    return expiresAt <= now
  }
  // Concurrency semaphore removed; rate limiting is sufficient.

  // Time-based rate limiter (sliding window: MAX_RATE_PER_SEC per 1000ms)
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private async awaitRateSlot(): Promise<void> {
    const limit = this.maxRatePerSec
    const windowMs = 1000
    while (true) {
      let waitMs = 0
      await this.state.blockConcurrencyWhile(async () => {
        const now = Date.now()
        // prune timestamps outside the window
        while (this.incTimestamps.length && this.incTimestamps[0] <= now - windowMs) {
          this.incTimestamps.shift()
        }
        if (this.incTimestamps.length < limit) {
          this.incTimestamps.push(now)
          waitMs = 0
          return
        }
        // need to wait until the oldest expires
        waitMs = this.incTimestamps[0] + windowMs - now
      })
      if (waitMs <= 0) return
      await this.sleep(waitMs)
    }
  }

  private setChainId(chain_id: string) {
    const chainID = parseInt(chain_id)
    const maxRatePerSec = MAX_RPS[chainID]

    if (typeof maxRatePerSec === "number") {
      this.maxRatePerSec = maxRatePerSec
    } else {
      console.log("invalid maxRatePerSec", maxRatePerSec)
      this.maxRatePerSec = NonceManagerV1.MAX_RATE_PER_SEC
    }
    console.log(`RPS=${this.maxRatePerSec}`)
  }

  // The fetch handler is the entry-point for the Durable Object.
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    const headers = request.headers
    const chainId = headers.get("chain_id")

    if (typeof chainId === "string" && this.chainID != parseInt(chainId)) {
      await this.state.blockConcurrencyWhile(async () => {
        this.setChainId(chainId)
      })
    }

    // Optional ?action=inc to atomically increment and return the new nonce
    const action = url.searchParams.get("action")

    switch (path) {
      case "/get": {
        // For incrementing flows (nonce reservation for tx), gate by rate only
        if (action === "inc") {
          await this.awaitRateSlot()
        }
        // Always synchronize state changes
        const res = await this.state.blockConcurrencyWhile(async () => {
          const dto = await this.getState()

          switch (action) {
            case "inc": {
              // increment current nonce (or start from 0)
              if (dto.nonce) {
                // Use half the TTL for incremented nonces
                await this.setNonce(dto.nonce + 1, NonceManagerV1.TTL / 2)
              }
            }
          }
          return new Response(JSON.stringify(dto!), {
            headers: { "Content-Type": "application/json" },
          })
        })
        return res
      }
      case "/set": {
        if (request.method !== "POST") {
          return new Response("Method Not Allowed", { status: 405 })
        }
        const { nonce } = await request.json<{ nonce: number }>()
        if (typeof nonce !== "number") {
          return new Response("Invalid nonce in request body", { status: 400 })
        }
        return await this.state.blockConcurrencyWhile(async () => {
          try {
            await this.setNonce(nonce)
            return new Response("nonce set", { status: 204 })
          } catch (e) {
            return new Response(JSON.stringify(e), { status: 409 })
          }
        })
      }
      default:
        return new Response("Not Found", { status: 404 })
    }
  }
}
