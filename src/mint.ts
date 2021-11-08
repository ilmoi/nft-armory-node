import {Account, AnyPublicKey, programs, actions, utils} from '@metaplex/js';
import {Transaction} from "@metaplex/js/src/Transaction";

import {Keypair, PublicKey} from "@solana/web3.js";
import {CONN} from "./helpers/constants";
import {loadKeypairSync, stringifyPubkeysInObject} from "./helpers/util";

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



// --------------------------------------- mint

async function mintNewNFT() {
  const result = await actions.mintNFT({
    connection: CONN,
    wallet: new LocalWallet(),
    uri: "https://ipfs.io/ipfs/QmTA8bzAdsSPMUVM9gUoi3WcRphEXznPkqUH3uvjA9fHw9",
    maxSupply: 10,
  })
  console.log('Minted a new NFT!', stringifyPubkeysInObject(result));
  return result
}





// --------------------------------------- new editions via token

// --------------------------------------- play

mintNewNFT()

