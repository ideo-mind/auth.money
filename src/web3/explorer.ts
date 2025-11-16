export function txUrl(chain: { blockExplorers?: { default?: { url: string } } }, hash: string) {
  const base = chain.blockExplorers?.default?.url
  if (!base) throw new Error("No explorer URL for chain")
  return `${base}/tx/${hash}`
}
export function addressUrl(
  chain: { blockExplorers?: { default?: { url: string } } },
  address: string
) {
  const base = chain.blockExplorers?.default?.url
  if (!base) throw new Error("No explorer URL for chain")
  return `${base}/address/${address}`
}
