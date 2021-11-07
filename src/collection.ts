import {PublicKey} from '@solana/web3.js';

import {Data, Metadata} from './metaplex/classes';
import {METADATA_PROGRAM_ID} from './helpers/constants';
import {decodeMetadata} from './metaplex/metadata';
import axios from "axios";
import {CONN, MINT_WALLET} from "./helpers/constants";

export interface MintData {
  imageUri?: string;
  mintWalletAddress: string;
  nftData: Data;
  tokenMetadata: Metadata;
  totalSupply: number;
}

export async function retrieveMetadata(accountData: Buffer): Promise<{nftData: Data, tokenMetadata: Metadata}> {
  const tokenMetadata = decodeMetadata(accountData); //decodes on-chain metadata
  const nftData = await axios.get(tokenMetadata.data.uri) as Data; //fetches from the uri stored in the metadata

  console.log('token metadata', tokenMetadata);
  console.log('nft info response', nftData);

  return {
    nftData,
    tokenMetadata,
  };
}

async function getCollection() {
  // //fetches all accs by a specified program, in our case the metadata program
  const response = await CONN.getProgramAccounts(METADATA_PROGRAM_PK, {
    //specifically looking for wallets that match mintWalletAddress at offset 326 - I wonder what is at that offset
    filters: [
      {
        memcmp: {
          offset: 326, //I think this probably points ot mint
          bytes: MINT_WALLET.toBase58(),
        },
      },
    ],
  });

  const totalSupply = response.length;
  console.log('Mint Wallet Address: ', MINT_WALLET.toBase58());
  console.log('Total Supply: ', totalSupply);

  const mintTokenIds = [];
  const mints: MintData[] = [];

  for (const record of response) {
    const {nftData, tokenMetadata} = await retrieveMetadata(
      record.account.data
    );

    const mintData: MintData = {
      imageUri: nftData?.image,
      mintWalletAddress: MINT_WALLET.toBase58(),
      nftData,
      tokenMetadata,
      totalSupply,
    };

    mintTokenIds.push(tokenMetadata.mint);
    mints.push(mintData);
  }


}
