import {Connection, Keypair, PublicKey} from "@solana/web3.js";
import {ASSOCIATED_TOKEN_PROGRAM_ID, MintLayout, Token, TOKEN_PROGRAM_ID} from "@solana/spl-token";
import {Account, AnyPublicKey, programs} from '@metaplex/js';
import BN from "bn.js";
import {mintNFT, sendTransaction} from "@metaplex/js/lib/actions";
import {lookup} from "@metaplex/js/lib/utils/metadata";
import {Transaction} from "@metaplex/js/src/Transaction";
import {CONN} from "./helpers/constants";
import * as fs from "fs";

const {
  metaplex: {Store, AuctionManager,},
  metadata: {Metadata},
  auction: {Auction},
  vault: {Vault}
} = programs;

class LocalWallet {
  keypair: Keypair;
  publicKey: PublicKey;

  constructor() {
    this.keypair = loadKeypairSync("/Users/ilmoi/.config/solana/id.json");
    this.publicKey = this.keypair.publicKey;
  }

  async signTransaction(tx: Transaction): Promise<Transaction> {
    tx.partialSign(this.keypair);
    return tx;
  };
  async signAllTransactions(txs: Transaction[]): Promise<Transaction[]> {
    txs.forEach(this.signTransaction)
    return txs;
  };
}

export function loadKeypairSync(path: string): Keypair {
  const secretKey = JSON.parse(fs.readFileSync(path, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

// --------------------------------------- v2

async function mintNewNFT() {
  await mintNFT({
    connection: CONN,
    wallet: new LocalWallet(),
    uri: "https://gateway.pinata.cloud/ipfs/QmUSzTgAUTpsWCHSgbPdnuRhsX6fuiqgrQrusq4DUvum13",
    maxSupply: 10,
  })
}

// --------------------------------------- mint e2e v1

// interface MintNFTParams {
//   connection: Connection;
//   wallet: Keypair;
//   uri: string;
//   maxSupply: number;
// }
//
// interface MintNFTResponse {
//   txId: string;
//   mint: PublicKey;
//   metadata: PublicKey;
//   edition: PublicKey;
// }
//
// export const mintNFT = async ({
//   connection,
//   wallet,
//   uri,
//   maxSupply,
// }: MintNFTParams): Promise<MintNFTResponse> => {
//   const mint = Keypair.generate();
//
//   const metadataPDA = await Metadata.getPDA(mint.publicKey);
//   const editionPDA = await programs.metadata.MasterEdition.getPDA(mint.publicKey);
//
//   const mintRent = await connection.getMinimumBalanceForRentExemption(MintLayout.span);
//
//   const {
//     name,
//     symbol,
//     seller_fee_basis_points,
//     properties: { creators },
//   } = await lookup(uri);
//
//   const creatorsData = creators.reduce<programs.metadata.Creator[]>((memo, { address, share }) => {
//     const verified = address === wallet.publicKey.toString();
//
//     const creator = new programs.metadata.Creator({
//       address,
//       share,
//       verified,
//     });
//
//     memo = [...memo, creator];
//
//     return memo;
//   }, []);
//
//   const createMintTx = new programs.CreateMint(
//     { feePayer: wallet.publicKey },
//     {
//       newAccountPubkey: mint.publicKey,
//       lamports: mintRent,
//     },
//   );
//
//   const metadataData = new programs.metadata.MetadataDataData({
//     name,
//     symbol,
//     uri,
//     sellerFeeBasisPoints: seller_fee_basis_points,
//     creators: creatorsData,
//   });
//
//   const createMetadataTx = new programs.metadata.CreateMetadata(
//     {
//       feePayer: wallet.publicKey,
//     },
//     {
//       metadata: metadataPDA,
//       metadataData,
//       updateAuthority: wallet.publicKey,
//       mint: mint.publicKey,
//       mintAuthority: wallet.publicKey,
//     },
//   );
//
//   const recipient = await Token.getAssociatedTokenAddress(
//     ASSOCIATED_TOKEN_PROGRAM_ID,
//     TOKEN_PROGRAM_ID,
//     mint.publicKey,
//     wallet.publicKey,
//   );
//
//   const createAssociatedTokenAccountTx = new programs.CreateAssociatedTokenAccount(
//     { feePayer: wallet.publicKey },
//     {
//       associatedTokenAddress: recipient,
//       splTokenMintAddress: mint.publicKey,
//     },
//   );
//
//   const mintToTx = new programs.MintTo(
//     { feePayer: wallet.publicKey },
//     {
//       mint: mint.publicKey,
//       dest: recipient,
//       amount: 1,
//     },
//   );
//
//   const masterEditionTx = new programs.metadata.CreateMasterEdition(
//     { feePayer: wallet.publicKey },
//     {
//       edition: editionPDA,
//       metadata: metadataPDA,
//       updateAuthority: wallet.publicKey,
//       mint: mint.publicKey,
//       mintAuthority: wallet.publicKey,
//       maxSupply: new BN(maxSupply),
//     },
//   );
//
//   const txId = await sendTransaction({
//     connection,
//     signers: [mint],
//     txs: [
//       createMintTx,
//       createMetadataTx,
//       createAssociatedTokenAccountTx,
//       mintToTx,
//       masterEditionTx,
//     ],
//     wallet,
//   });
//
//   return {
//     txId,
//     mint: mint.publicKey,
//     metadata: metadataPDA,
//     edition: editionPDA,
//   };
// };
//
//
// export const sendTransactionKeypair = async ({
//   connection,
//   wallet,
//   txs,
//   signers = [],
//   options,
// }: any): Promise<string> => {
//   let tx = Transaction.fromCombined(txs, { feePayer: wallet.publicKey });
//   tx.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
//
//   if (signers.length) {
//     tx.partialSign(...signers);
//   }
//   tx = await wallet.signTransaction(tx);
//
//   return connection.sendRawTransaction(tx.serialize(), options);
// };
