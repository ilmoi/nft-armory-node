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
      console.log(`triaging ${i+1} of ${txs.length}`)
      // console.log('selected tx', t)
      triageTx(t, owner.toBase58())
    } catch (e) {
      // console.log('uh oh', e)
    }
  })
}

function triageTx(tx: any, owner: string) {
  if (isSolanartBuyTx(tx)) {
    console.log('selected', tx.transaction.signatures[0])
    parseSolanartTx(tx, owner)
  }
}

// --------------------------------------- solanart

function isSolanartBuyTx(tx: any) {
  //check is interacting with Solanart's program
  const solanartProgram = "CJsLwbP1iu5DuUikHEJnLfANgKy6stB2uFgvBBHoyxwz"
  const passedAccs = tx.transaction.message.accountKeys;
  const isSolanart = passedAccs.at(-1).pubkey.toBase58() === solanartProgram

  //check is calling the buy instruction
  const ixData = bs58toHex(tx.transaction.message.instructions.at(-1).data);
  const ixNr = parseInt(ixData.substr(1,1))
  // const isPurchase = tx.meta.logMessages.indexOf("Program log: Instruction: Buy") > -1 //the shitty way
  const isPurchase = ixNr === 5 //the right way

  //check is not using the buy instruction to cancel
  const ixStruct = parseInt(ixData.substr(2,ixData.length))
  // const isNotCancellation = tx.meta.logMessages.indexOf("Program log: Sale cancelled by seller") == -1 //the shitty way
  const isNotCancellation = ixStruct !== 0
  return isSolanart && isPurchase && isNotCancellation
}

function parseSolanartTx(tx: any, owner: string) {
  //identify the token through postTokenBalances
  const tokenMint = tx.meta.preTokenBalances[0].mint
  //there's only one signer = the buyer, that's the acc we need
  const [buyerIdx, buyerAcc] = findSigner(tx.transaction.message.accountKeys)!
  const preBalances = tx.meta.preBalances
  const postBalances = tx.meta.postBalances
  const buyerSpent = (preBalances[buyerIdx] - postBalances[buyerIdx]) / LAMPORTS_PER_SOL
  if (buyerAcc.toBase58() === owner) {
    console.log(`Bought ${tokenMint} for ${buyerSpent} SOL on Solanart`)
  } else {
    console.log(`Sold ${tokenMint} for ${buyerSpent} SOL on Solanart`)
  }
}

// --------------------------------------- helpers

function findSigner(accKeys: any[]) {
  for (const [i, el] of accKeys.entries()) {
    if (el.signer) {
      return [i, el.pubkey]
    }
  }
}

// --------------------------------------- play

getTxHistory()

