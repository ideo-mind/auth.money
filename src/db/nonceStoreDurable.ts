import type { NonceManagerSource } from "viem";
import { jsonRpc } from "viem/nonce";
import { NonceDto } from "@/durables/NonceManager";
import { NonceManagerV1 } from "@/durables";

export function nonceStoreDurable(env: Env): NonceManagerSource {
  const jsonSource = jsonRpc();

  const nonceDONamespace = env.NONCE_V1_DO;
  const version = NonceManagerV1.version; //versioning is not necessary anymore
  const urlVersion = version.replace(/\./g, "-"); //throws uncessary: error

  const doID = version;

  const stubUrl = `https://nmdo-${urlVersion}`;

  return {
    async get({ address, chainId, client }) {
      // Create a unique ID for the DO based on address and chainId.
      const id = nonceDONamespace.idFromName(`${doID}${address}:${chainId}`);
      const stub = nonceDONamespace.get(id);

      // Communicate with the DO via fetch.

      let rpcNonce = await jsonSource.get({ address, chainId, client });
      console.log("RPC nonce retrieved for address", rpcNonce);

      // return publicClient.getTransactionCount({
      //   address,
      // })

      try {
        const response = await stub.fetch(`${stubUrl}/get?action=inc`, {
          headers: { chain_id: String(chainId) },
        });
        if (response.ok) {
          const { nonce, updatedAt } = await response.json<NonceDto>();
          console.log(`NMDO getNonce(${address},${chainId})=${nonce}`);
          if (nonce && nonce >= rpcNonce) {
            // if (NonceManager.expired(nonce, updatedAt)) {
            //   throw new Error("nonce expired") #FIXME: we versioned it to the point where we dont need this
            // }

            // FIXME: this didn't work
            // if (nonce > rpcNonce + 1000) {
            //   console.error(
            //     `Nonce set is so high , must be invalid : ${nonce} > ${rpcNonce}`
            //   )
            //   return rpcNonce
            // }

            return nonce;
          }
        }
      } catch (e) {
        console.error("error: get nonce from DO", e);
      }

      return rpcNonce;
    },
    async set({ address, chainId }, nonce) {
      // console.log("skipping setting nonce=" + nonce) //FIXME: if u don't set nonce first its never set ever

      console.log(`NMDO setNonce(${nonce})`);

      const id = nonceDONamespace.idFromName(`${doID}${address}:${chainId}`);
      const stub = nonceDONamespace.get(id);

      // Send the new nonce to the DO.
      try {
        await stub.fetch(`${stubUrl}/set`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            chain_id: String(chainId),
          },
          body: JSON.stringify({ nonce: nonce }),
        });
      } catch (e) {
        console.error("error: set nonce to DO", e);
      }
    },
  };
}
