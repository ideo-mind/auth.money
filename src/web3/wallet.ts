import { creditcoinTestnet } from "@config/viem"
import { nonceStoreDurable } from "@db/nonceStoreDurable"
import { Address, Chain, createNonceManager, createWalletClient, http, WalletClient } from "viem"
import { privateKeyToAccount } from "viem/accounts"

//FIXME: Its a bad idea, the env changes so the cache is not valid //NEVER use it
const requestCache = new Map<string, WalletClient>()

// TODO: techdebt support multichain
export function getWallet(
  privateKey: string,
  env: Env,
  chain: Chain = creditcoinTestnet
): WalletClient {
  // const existing = requestCache.get(privateKey)
  // if (existing) return existing

  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error(`Invalid private key format: ${privateKey}`)
  }

  // nonceManager already supports chainId
  const nonceManager = createNonceManager({
    source: nonceStoreDurable(env),
  })
  const account = privateKeyToAccount(privateKey as `0x${string}`, {
    nonceManager,
  })

  const wallet = createWalletClient({
    account,
    chain: chain,
    transport: http(chain.rpcUrls.default.http[0]),
  })

  // requestCache.set(privateKey, wallet) //FIXME: may be request cache is a bad idea
  return wallet
}

export function getPaymaster(paymaster: Address, env: Env,chain:Chain): WalletClient {
  // @ts-ignore
  return getWallet(env[`PRIVATE_KEY_${paymaster}`] ?? env.ORACLE_PRIVATE_KEY_EVM, env)
}

export function getPrimaryWallet(env: Env, chain: Chain = creditcoinTestnet): WalletClient {
  return getWallet(env.ORACLE_PRIVATE_KEY_EVM, env, chain)
  // return getPaymaster("0xBAf5a46a2153207ff97993AC5c94179d2956ddF8",env,chain)
}
