import { Address, Hash, parseSignature, PublicClient, TransactionReceipt, WalletClient } from "viem"
import { waitForTransactionReceipt } from "./torus"
import { getTransactionParams } from "../utils/chainUtils"

// ERC20 Permit ABI (EIP-2612)
const erc20PermitAbi = [
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "uint8", name: "v", type: "uint8" },
      { internalType: "bytes32", name: "r", type: "bytes32" },
      { internalType: "bytes32", name: "s", type: "bytes32" },
    ],
    name: "permit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
]

export interface PermitData {
  owner: Address
  spender: Address
  value: bigint
  nonce: bigint
  deadline: bigint
}

export async function executePermit(
  token: Address,
  permit: PermitData,
  permitSignature: `0x${string}`,
  wallet: WalletClient,
  publicClient: PublicClient,
  timeoutMs?: number,
  confirmations: number = 1
): Promise<{ txHash: Hash; cb: Promise<TransactionReceipt> }> {
  const { r, s, v, yParity } = parseSignature(permitSignature)

  console.log(
    JSON.stringify({
      owner: permit.owner,
      spender: permit.spender,
      nonce: permit.nonce.toString(),
      value: permit.value.toString(),
      deadline: permit.deadline.toString(),
    })
  )

  if (!wallet.account) {
    throw new Error("Wallet account is required for permit execution")
  }

  // Get transaction parameters - exclude gas for Polkadot chains
  const txParams = getTransactionParams(wallet.chain)

  const txHash = await wallet.writeContract({
    address: token,
    abi: erc20PermitAbi,
    functionName: "permit",
    args: [permit.owner, permit.spender, permit.value, permit.deadline, v, r, s],
    account: wallet.account,
    chain: wallet.chain,
    ...txParams,
  })

  console.log("permit Tx", txHash)
  // console.log("permit", permit)

  const cb = waitForTransactionReceipt(publicClient, txHash, confirmations, timeoutMs) //FIXME: wallet.account.client might not be configured
  // await cb
  return { txHash, cb }
}
