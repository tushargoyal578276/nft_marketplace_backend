import { initializeKeypair } from "./initializeKeypair"
import { Connection, clusterApiUrl, PublicKey, Signer } from "@solana/web3.js"
import {
  Metaplex,
  keypairIdentity,
  bundlrStorage,
} from "@metaplex-foundation/js"
async function getTransactionHistory() {
    try {
  
      const connection = new Connection(clusterApiUrl("devnet"));
  
      // console.log("connection",connection);
      const mintAddress = new PublicKey('8V8dHYSL7DqTfGwswg1rB8pBn6m4LSJE8TEqAs6viRgz');
  
      const user = await initializeKeypair(connection)
      const metaplex = Metaplex.make(connection)
      .use(keypairIdentity(user))
      .use(
        bundlrStorage({
          address: "https://devnet.bundlr.network",
          providerUrl: "https://api.devnet.solana.com",
          timeout: 60000,
        })
      )
  
      console.log("mintAddress",mintAddress);
  
      const nft = await metaplex.nfts().findByMint({ mintAddress });
          console.log(nft);
      } catch (error) {
          console.error('Error fetching metadata details:', error);
      }
    }

    getTransactionHistory();
    