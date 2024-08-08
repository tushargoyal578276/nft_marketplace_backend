import express, { Request, Response } from 'express';
import { initializeKeypair } from "./initializeKeypair"
import web3, { Connection, clusterApiUrl, PublicKey, Signer, Transaction, sendAndConfirmTransaction} from "@solana/web3.js"
import {
  Metaplex,
  keypairIdentity,
  bundlrStorage,
  toMetaplexFile,
  NftWithToken,
} from "@metaplex-foundation/js"

import {
  createMint,
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
  transfer,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

import {
  createCreateMetadataAccountV2Instruction,
  DataV2,
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
} from '@metaplex-foundation/mpl-token-metadata';

import * as fs from "fs"
import bodyParser from 'body-parser';
const app = express();
const port = process.env.PORT || 3000;
app.use(bodyParser.json());
app.use(express.json());

interface NftData {
  name: string
  symbol: string
  description: string
  sellerFeeBasisPoints: number
  imageFile: string
}

interface CollectionNftData {
  name: string
  symbol: string
  description: string
  sellerFeeBasisPoints: number
  imageFile: string
  isCollection: boolean
  collectionAuthority: Signer
}

// example data for a new NFT
const nftData = {
  name: "Name",
  symbol: "SYMBOL",
  description: "Description",
  sellerFeeBasisPoints: 0,
  imageFile: "gallery-nft-02.png",
}

// example data for updating an existing NFT
const updateNftData = {
  name: "Update",
  symbol: "UPDATE",
  description: "Update Description",
  sellerFeeBasisPoints: 100,
  imageFile: "gallery-nft-01.png",
}

async function uploadMetadata(
  metaplex: Metaplex,
  nftData: NftData
): Promise<string> {
  // file to buffer
  const buffer = fs.readFileSync("src/gallery/" + nftData.imageFile)

  // buffer to metaplex file
  const file = toMetaplexFile(buffer, nftData.imageFile)

  // upload image and get image uri
  const imageUri = await metaplex.storage().upload(file)
  console.log("image uri:", imageUri)

  // upload metadata and get metadata uri (off chain metadata)
  const { uri } = await metaplex.nfts().uploadMetadata({
    name: nftData.name,
    symbol: nftData.symbol,
    description: nftData.description,
    image: imageUri,
  })

  console.log("metadata uri:", uri)
  return uri
}

async function createNft(
  metaplex: Metaplex,
  uri: string,
  nftData: NftData,
  collectionMint: PublicKey
): Promise<NftWithToken> {
  const { nft } = await metaplex.nfts().create(
    {
      uri: uri, // metadata URI
      name: nftData.name,
      sellerFeeBasisPoints: nftData.sellerFeeBasisPoints,
      symbol: nftData.symbol,
      collection: collectionMint,
    },
    { commitment: "finalized" }
  )

  console.log(
    `Token Mint: https://explorer.solana.com/address/${nft.address.toString()}?cluster=devnet`
  )

  await metaplex.nfts().verifyCollection({
    //this is what verifies our collection as a Certified Collection
    mintAddress: nft.mint.address,
    collectionMintAddress: collectionMint,
    isSizedCollection: true,
  })

  return nft
}

async function createCollectionNft(
  metaplex: Metaplex,
  uri: string,
  data: CollectionNftData
): Promise<NftWithToken> {
  const { nft } = await metaplex.nfts().create(
    {
      uri: uri,
      name: data.name,
      sellerFeeBasisPoints: data.sellerFeeBasisPoints,
      symbol: data.symbol,
      isCollection: true,
    },
    { commitment: "finalized" }
  )

  console.log(
    `Collection Mint: https://explorer.solana.com/address/${nft.address.toString()}?cluster=devnet`
  )

  return nft
}

// helper function update NFT
async function updateNftUri(
  metaplex: Metaplex,
  uri: string,
  mintAddress: PublicKey
) {
  // fetch NFT data using mint address
  const nft = await metaplex.nfts().findByMint({ mintAddress })

  // update the NFT metadata
  const { response } = await metaplex.nfts().update(
    {
      nftOrSft: nft,
      uri: uri,
    },
    { commitment: "finalized" }
  )

  console.log(
    `Token Mint: https://explorer.solana.com/address/${nft.address.toString()}?cluster=devnet`
  )

  console.log(
    `Transaction: https://explorer.solana.com/tx/${response.signature}?cluster=devnet`
  )
}

const connection = new Connection(clusterApiUrl("devnet"))

app.get('/create-nft', async (req: Request, res: Response) => {
  try {
    const user = await initializeKeypair(connection);

    console.log("PublicKey:", user.publicKey.toBase58());

    const metaplex = Metaplex.make(connection)
      .use(keypairIdentity(user))
      .use(
        bundlrStorage({
          address: "https://devnet.bundlr.network",
          providerUrl: "https://api.devnet.solana.com",
          timeout: 60000,
        })
      );

    const collectionNftData = {
      name: "TYCHO_TECH",
      symbol: "TECH",
      description: "Test Description Collection",
      sellerFeeBasisPoints: 0,
      imageFile: "gallery-nft-03.png",
      isCollection: true,
      collectionAuthority: user,
    };

    const collectionUri = await uploadMetadata(metaplex, collectionNftData);
    const collectionNft = await createCollectionNft(metaplex, collectionUri, collectionNftData);
    const uri = await uploadMetadata(metaplex, collectionNftData);
    const nft = await createNft(metaplex, uri, collectionNftData, collectionNft.mint.address);

    console.log("Finished successfully");
    res.json({ message: "NFT created successfully" });
  } catch (error) {
    res.status(500).json({ error: error });
  }
});

app.post('/transfer-nft', async (req: Request, res: Response) => {
  try {
    const { nftMintAddress, fromPublicKey, toPublicKey } = req.body;

    const fromKeypair = await initializeKeypair(connection);

    const nftMint = new PublicKey(nftMintAddress);
    const fromPubKey = new PublicKey(fromPublicKey);
    const toPubKey = new PublicKey(toPublicKey);

    const transaction = new Transaction().add(
      createTransferInstruction(
        
        nftMint,
        toPubKey,
        fromPubKey,
        1,
        [],
        TOKEN_PROGRAM_ID,
      )
    );

    await sendAndConfirmTransaction(connection, transaction, [fromKeypair]);

    console.log("NFT transferred successfully");
    res.json({ message: "NFT transferred successfully" });
  } catch (error) {
    res.status(500).json({ error: error });
  }
});

app.get('/create-Token', async (req: Request, res: Response) => {
  try {
    const owner = await initializeKeypair(connection)

    // Create a new token
    const mint = await createMint(
      connection,
      owner,
      owner.publicKey,
      null,
      9 // Decimals
    );
    console.log(`Token created: ${mint.toBase58()}`);

  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    owner,
    mint,
    owner.publicKey
  );
  console.log(`Token account created: ${tokenAccount.address.toBase58()}`);

 // Mint 1 token to the token account
 await mintTo(
  connection,
  owner,
  mint,
  tokenAccount.address,
  owner.publicKey,
  100000000000
);
console.log('Token minted to account');

  // Remove the minting authority
  await setAuthority(
    connection,
    owner,
    mint,
    owner.publicKey,
    0, // 0 represents MintTokens authority
    null
  );
  console.log('Minting authority removed');

  // // Metadata details
  // const metadataPDA = (
  //   await PublicKey.findProgramAddress(
  //     [
  //       Buffer.from('metadata'),
  //       TOKEN_METADATA_PROGRAM_ID.toBuffer(),
  //       mint.toBuffer(),
  //     ],
  //     TOKEN_METADATA_PROGRAM_ID
  //   )
  // )[0];

  // const metadataData = {
  //   name: 'Your Token Name',
  //   symbol: 'YTN',
  //   uri: '', // Add a URI to your metadata if you have one
  //   sellerFeeBasisPoints: 0, // 0 for no fee
  //   creators: null,
  // } as DataV2;

  // const createMetadataTx = new Transaction().add(
  //   createCreateMetadataAccountV2Instruction(
  //     {
  //       metadata: metadataPDA,
  //       mint,
  //       mintAuthority: owner.publicKey,
  //       payer: owner.publicKey,
  //       updateAuthority: owner.publicKey,
  //     },
  //     {
  //       createMetadataAccountArgsV2: {
  //         data: metadataData,
  //         isMutable: true,
  //       },
  //     }
  //   )
  // );

  // await sendAndConfirmTransaction(connection, createMetadataTx, [owner]);

  // console.log('Metadata created and associated with the token');


  // Transfer 1 token to another account (create another account first)
  const recipientPublicKey = new PublicKey('Ba3zYX1ohQciYZrZsjXZL13gkuZuA7ute5AGpZh5QX5T');
  const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    owner,
    mint,
    recipientPublicKey
  );
  await transfer(
    connection,
    owner,
    tokenAccount.address,
    recipientTokenAccount.address,
    owner.publicKey,
    10000000000
  );
  console.log("Transferred 1 token to Ba3zYX1ohQciYZrZsjXZL13gkuZuA7ute5AGpZh5QX5T");

  }
  catch(error){
  }
})
// async function main() {
//   // create a new connection to the cluster's API
//   const connection = new Connection(clusterApiUrl("devnet"))

//   // initialize a keypair for the user
//   const user = await initializeKeypair(connection)

//   console.log("PublicKey:", user.publicKey.toBase58())

//   // metaplex set up
//   const metaplex = Metaplex.make(connection)
//     .use(keypairIdentity(user))
//     .use(
//       bundlrStorage({
//         address: "https://devnet.bundlr.network",
//         providerUrl: "https://api.devnet.solana.com",
//         timeout: 60000,
//       })
//     )

//   const collectionNftData = {
//     name: "TYCHO_TECH",
//     symbol: "TECH",
//     description: "Test Description Collection",
//     sellerFeeBasisPoints: 0,
//     imageFile: "gallery-nft-03.png",
//     isCollection: true,
//     collectionAuthority: user,
//   }

//   // upload data for the collection NFT and get the URI for the metadata
//   const collectionUri = await uploadMetadata(metaplex, collectionNftData)

//   // create a collection NFT using the helper function and the URI from the metadata
//   const collectionNft = await createCollectionNft(
//     metaplex,
//     collectionUri,
//     collectionNftData
//   )

//   // upload the NFT data and get the URI for the metadata
//   const uri = await uploadMetadata(metaplex, collectionNftData)

//   // create an NFT using the helper function and the URI from the metadata
//   const nft = await createNft(
//     metaplex,
//     uri,
//     collectionNftData,
//     collectionNft.mint.address
//   )

//   // upload updated NFT data and get the new URI for the metadata
//   // const updatedUri = await uploadMetadata(metaplex, updateNftData)

//   // update the NFT using the helper function and the new URI from the metadata
//   // await updateNftUri(metaplex, updatedUri, nft.address)
// }

// main()
//   .then(() => {
//     console.log("Finished successfully")
//     process.exit(0)
//   })
//   .catch((error) => {
//     console.log(error)
//     process.exit(1)
//   })

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });