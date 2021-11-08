import {Account, actions, Connection, MetadataJson, programs, utils, Wallet} from "@metaplex/js";
import {PublicKey} from "@solana/web3.js";
import {CONN} from "./helpers/constants";
import {editionMintDevnet, LocalWallet} from "./mint_v1";

export async function signMetadata(
  connection: Connection,
  wallet: Wallet,
  editionMetadataPDA?: PublicKey,
  editionMint?: PublicKey,
) {
  const metadata = editionMetadataPDA ? editionMetadataPDA
    : (await programs.metadata.Metadata.getPDA(editionMint!))
  const signTx = new programs.metadata.SignMetadata(
    {feePayer: wallet.publicKey},
    {
      metadata,
      creator: wallet.publicKey,
    }
  )
  // ---------------- send to metaplex
  const txId = await actions.sendTransaction({
    connection,
    signers: [],
    txs: [
      signTx,
    ],
    wallet,
  });
  console.log(txId);
  return txId
}

signMetadata(
  CONN,
  new LocalWallet(),
  undefined,
  editionMintDevnet,
)
