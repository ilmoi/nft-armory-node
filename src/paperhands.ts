import {Connection, LAMPORTS_PER_SOL, PublicKey} from "@solana/web3.js";
import {bs58toHex, writeTxsToDisk} from "./helpers/util";

// const owner = new PublicKey("3xY1KD9NxoDa1WphejAhirGakjxSqhWi2SYppGCoACVj")
const owner = new PublicKey("5u1vB9UeQSCzzwEhmKPhmQH1veWP9KZyZ8xFxFrmj8CK")

let inventory: string[] = []
let spent = 0;
let earned = 0;

async function getTxHistory() {
  const conn = new Connection("https://api.mainnet-beta.solana.com")
  let txInfos = await conn.getSignaturesForAddress(owner);
  console.log(`got ${txInfos.length} txs to process`)

  //reverse the array, we want to start with historic transactions not other way around
  txInfos = txInfos.reverse()

  const sigs = txInfos.map(i => i.signature)

  let i = 1;
  while (true) {
    const sigsToProcess = sigs.splice(0, 220)
    if (!sigsToProcess.length) {
      console.log('no more sigs to process!')
      break;
    }

    console.log(`processing another ${sigsToProcess.length} sigs`)
    const txs = await conn.getParsedConfirmedTransactions(sigsToProcess)
    console.log('got txs')
    // console.log(txs)
    // writeTxsToDisk('txs', txs)
    txs.forEach(t => {
      try {
        console.log(`triaging ${i} of ${txInfos.length}`)
        // console.log('selected tx', t)
        triageTxByExchange(t, owner.toBase58())
      } catch (e) {
        console.log('uh oh', e)
      } finally {
        i += 1;
      }
    })
  }

  console.log('FINALS:')
  console.log('inventory:', inventory)
  console.log('spent:', spent)
  console.log('earned:', earned)
  console.log('profit:', earned - spent)
}

function triageTxByExchange(tx: any, owner: string) {
  const progId = tx.transaction.message.instructions.at(-1).programId.toBase58();
  const sig = tx.transaction.signatures[0];
  let exchange;

  switch (progId) {
    case "CJsLwbP1iu5DuUikHEJnLfANgKy6stB2uFgvBBHoyxwz":
      exchange = 'Solanart'
      console.log(`tx ${sig} is ${exchange}`)
      if (isSolanartPurchaseTx(tx)) {
        parseTx(tx, owner, exchange)
      }
      return;
    case "MEisE1HzehtrDpAAT8PnLHjpSSkRYakotTuJRPjTpo8":
      exchange = 'MagicEden'
      console.log(`tx ${sig} is ${exchange}`)
      if (isMagicEdenPurchaseTx(tx)) {
        parseTx(tx, owner, exchange)
      }
      return;
    case "A7p8451ktDCHq5yYaHczeLMYsjRsAkzc3hCXcSrwYHU7":
      exchange = 'DigitalEyez'
      console.log(`tx ${sig} is ${exchange}`)
      if (isDigitalEyezPurchaseTx(tx)) {
        parseTx(tx, owner, exchange)
      }
      return;
    case "HZaWndaNWHFDd9Dhk5pqUUtsmoBCqzb1MLu3NAh1VX6B":
      exchange = 'AlphaArt'
      console.log(`tx ${sig} is ${exchange}`)
      if (isAlphaArtPurchaseTx(tx)) {
        parseTx(tx, owner, exchange)
      }
      return;
    case "AmK5g2XcyptVLCFESBCJqoSfwV3znGoVYQnqEnaAZKWn":
      exchange = 'ExchangeArt'
      console.log(`tx ${sig} is ${exchange}`)
      if (isExchangeArtPurchaseTx(tx)) {
        parseTx(tx, owner, exchange)
      }
      return;
    case "617jbWo616ggkDxvW1Le8pV38XLbVSyWY8ae6QUmGBAU":
      exchange = 'SolSea'
      console.log(`tx ${sig} is ${exchange}`)
      if (isSolSeaPurchaseTx(tx)) {
        parseTx(tx, owner, exchange)
      }
      return;
    case "GvQVaDNLV7zAPNx35FqWmgwuxa4B2h5tuuL73heqSf1C":
      exchange = 'SMB marketplace'
      console.log(`tx ${sig} is ${exchange}`)
      //NOTE: this is NOT a mistake. The SMB market uses the same codebase as DE!
      if (isDigitalEyezPurchaseTx(tx)) {
        parseTx(tx, owner, exchange)
      }
      return;
  }
}

function parseTx(tx: any, owner: string, exchange: string) {
  //identify the token through postTokenBalances
  const tokenMint = tx.meta.preTokenBalances[0].mint
  //there's only one signer = the buyer, that's the acc we need
  const [buyerIdx, buyerAcc] = findSigner(tx.transaction.message.accountKeys)!
  const preBalances = tx.meta.preBalances
  const postBalances = tx.meta.postBalances
  const buyerSpent = (preBalances[buyerIdx] - postBalances[buyerIdx]) / LAMPORTS_PER_SOL
  if (buyerAcc.toBase58() === owner) {
    console.log(`Bought ${tokenMint} for ${buyerSpent} SOL on ${exchange}`)
    spent += buyerSpent
    inventory.push(tokenMint)
  } else {
    console.log(`Sold ${tokenMint} for ${buyerSpent} SOL on ${exchange}`)
    earned += buyerSpent
    inventory = removeItemOnce(inventory, tokenMint)
  }
}

// --------------------------------------- marketplace specific identifiers

function isSolSeaPurchaseTx(tx: any) {
  const ixData = extractIxData(tx);
  //check is calling the buy instruction
  const ixNr = parseInt(ixData.substr(0, 2))
  return ixNr === 2
}

function isExchangeArtPurchaseTx(tx: any) {
  const ixData = extractIxData(tx);
  //check is calling the buy instruction
  const ixNr = parseInt(ixData.substr(0, 2))
  return ixNr === 1
}

function isAlphaArtPurchaseTx(tx: any) {
  const ixData = extractIxData(tx);
  //check is calling the buy instruction
  const ixNr = parseInt(ixData.substr(0, 2))
  return ixNr === 2
}

function isDigitalEyezPurchaseTx(tx: any) {
  const ixData = extractIxData(tx);
  //check is calling the buy instruction
  const ixNr = parseInt(ixData.substr(0, 2))
  const isPurchase = ixNr === 1
  //check is not using the buy instruction to cancel
  //todo not great to rely on logs (especially with a typo) but I can't think of a better way
  // both their purchase and cancel txs have the exact same data signatures
  const isNotCancellation = tx.meta.logMessages.indexOf("Program log: Transfering sales tax") > -1
  return isPurchase && isNotCancellation
}

function isMagicEdenPurchaseTx(tx: any) {
  const ixData = extractIxData(tx);
  //check is calling the buy instruction
  const ixNr = parseInt(ixData.substr(0, 3))
  return ixNr === 438
}

function isSolanartPurchaseTx(tx: any) {
  const ixData = extractIxData(tx);
  //check is calling the buy instruction
  const ixNr = parseInt(ixData.substr(0, 2))
  const isPurchase = ixNr === 5 //the right way
  //check is not using the buy instruction to cancel
  const ixStruct = ixData.substr(2, ixData.length)
  const isNotCancellation = ixStruct !== '0000000000000000'
  return isPurchase && isNotCancellation
}

// --------------------------------------- helpers

function findSigner(accKeys: any[]) {
  for (const [i, el] of accKeys.entries()) {
    if (el.signer) {
      return [i, el.pubkey]
    }
  }
}

function extractIxData(tx: any): string {
  return bs58toHex(tx.transaction.message.instructions.at(-1).data);
}

function removeItemOnce(arr: any[], value: number) {
  const index = arr.indexOf(value);
  if (index > -1) {
    arr.splice(index, 1);
  }
  return arr;
}

// --------------------------------------- play

getTxHistory()

