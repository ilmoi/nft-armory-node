import {Connection, LAMPORTS_PER_SOL, PublicKey} from "@solana/web3.js";
import {bs58toHex, writeTxsToDisk} from "./helpers/util";

// const owner = new PublicKey("3xY1KD9NxoDa1WphejAhirGakjxSqhWi2SYppGCoACVj")
const owner = new PublicKey("5u1vB9UeQSCzzwEhmKPhmQH1veWP9KZyZ8xFxFrmj8CK")

async function getTxHistory() {
  const conn = new Connection("https://api.mainnet-beta.solana.com")
  const txInfos = await conn.getSignaturesForAddress(owner);
  console.log('got sigs')
  // console.log(sigs)
  const sigs = txInfos.map(i => i.signature).splice(0, 220)
  // const sigs = ["vuQMCEaqC5X6tTxW8q5HXU1U5KhhXs3TYXGyXi25FUarh4gsZYSXRi26by81x1wsUDxEEnwCf4kQWs5UdAeR4Qp"]
  const txs = await conn.getParsedConfirmedTransactions(sigs)
  console.log('got txs')
  // console.log(txs)
  // writeTxsToDisk('txs', txs)
  txs.forEach((t, i) => {
    try {
      console.log(`triaging ${i + 1} of ${txs.length}`)
      // console.log('selected tx', t)
      triageTxByExchange(t, owner.toBase58())
    } catch (e) {
      console.log('uh oh', e)
    }
  })
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
  } else {
    console.log(`Sold ${tokenMint} for ${buyerSpent} SOL on ${exchange}`)
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
  const ixStruct = parseInt(ixData.substr(2, ixData.length))
  const isNotCancellation = ixStruct !== 0
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

// --------------------------------------- play

getTxHistory()

