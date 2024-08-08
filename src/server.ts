import express, { Request, Response } from 'express';
import cors from 'cors';
import { Connection, clusterApiUrl, PublicKey } from '@solana/web3.js';
import {
  Metaplex,
  keypairIdentity,
  bundlrStorage,
} from '@metaplex-foundation/js';
import { initializeKeypair } from './initializeKeypair';
import fetch from 'node-fetch-commonjs';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/api/transaction-history', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }
    console.log("walletAddress--",walletAddress);
    let allMetadata: any[] = [];
    const connection = new Connection(clusterApiUrl('devnet'));
    const mintAddress = new PublicKey('8VWvqewtnhWpTbYPfUdpADtmBWC6aNKFhmpQJryWi6AC');
    // const walletAddress = new PublicKey('4PXWU3s25TR8fdf1tCR9TGy9dVJcCTtosjjrA2k8fiib');

    const user = await initializeKeypair(connection);
    const metaplex = Metaplex.make(connection)
      .use(keypairIdentity(user))
      .use(
        bundlrStorage({
          address: 'https://devnet.bundlr.network',
          providerUrl: 'https://api.devnet.solana.com',
          timeout: 60000,
        })
      );

    console.log('mintAddress', mintAddress);

    const nfts = await metaplex.nfts().findAllByOwner({ owner: walletAddress });
    console.log(`Total number of NFTs: ${nfts.length}`);

    for (const nft of nfts) {
      allMetadata.push({
        mintAddress: nft.address.toString(),
        uri: nft.uri,
      });
    };
    // Fetch metadata from the URIs
    const detailedMetadata = await Promise.all(
        allMetadata.map(async (nft) => {
            const response = await fetch(nft.uri);
            const metadata = await response.json();
            console.log("metadata--",metadata);
            return {
                mintAddress: nft.mintAddress,
                metadata,
            };
        })
    );

    console.log('detailedMetadata--', detailedMetadata);

    res.json(detailedMetadata);
  } catch (error) {
    console.error('Error fetching metadata details:', error);
    res.status(500).json({ error: 'Error fetching metadata details' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
