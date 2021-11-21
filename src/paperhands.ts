import {Connection, LAMPORTS_PER_SOL, PublicKey} from "@solana/web3.js";
import {bs58toHex, okToFailAsync} from "./helpers/util";
import axios from "axios";
import {CONN} from "./helpers/constants";
import {programs} from "@metaplex/js";
import fs from "fs";

const {
  metaplex: {Store, AuctionManager,},
  metadata: {Metadata},
  auction: {Auction},
  vault: {Vault}
} = programs;

// const owner = new PublicKey("3xY1KD9NxoDa1WphejAhirGakjxSqhWi2SYppGCoACVj")
const owner = new PublicKey("5u1vB9UeQSCzzwEhmKPhmQH1veWP9KZyZ8xFxFrmj8CK")

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

function findOrCreateNFTEntry(mint: string, props: any) {
  allNFTs.forEach(nft => {
    if (nft.mint === mint) {
      for (const [key, value] of Object.entries(props)) {
        (nft as any)[key] = value;
      }
      return;
    }
  })
  allNFTs.push({
    mint,
    ...props,
  })
}

// --------------------------------------- get tx history

interface IStats {
  floor: number,
  mean: number,
  median: number,
}

enum PriceMethod {
  floor = 'floor',
  mean = 'mean',
  median = 'median',
}

interface INFTData {
  mint: string,
  boughtAt?: number
  soldAt?: number,
  onchainMetadata?: any,
  externalMetadata?: any,
  currentPrices?: IStats,
  paperhanded?: number,
  diamondhanded?: number,
}

let currentNFTMints: string[] = []
let allNFTs: INFTData[] = []
let spent = 0;
let earned = 0;

async function getTxHistory(conn: Connection) {
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
  console.log('inventory:', currentNFTMints)
  // console.log('all NFTs:', allNFTs)
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
    currentNFTMints.push(tokenMint)
    findOrCreateNFTEntry(tokenMint, {boughtAt: buyerSpent})
  } else {
    console.log(`Sold ${tokenMint} for ${buyerSpent} SOL on ${exchange}`)
    earned += buyerSpent
    currentNFTMints = removeItemOnce(currentNFTMints, tokenMint)
    findOrCreateNFTEntry(tokenMint, {soldAt: buyerSpent})
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

// --------------------------------------- fetch prices

const collections = {
  //creator's address goes here
  '9BKWqDHfHZh9j39xakYVMdr6hXmCLHH5VfCpeq2idU9L': {
    'SA': 'degenape',
    'DE': 'Degenerate%20Ape%20Academy',
    'ME': 'degenerate_ape_academy',
  },
  '9uBX3ASjxWvNBAD1xjbVaKA74mWGZys3RGSF7DdeDD3F': {
    'DE': 'Solana%20Monkey%20Business',
    'ME': 'solana_monkey_business',
  },
  'DRGNjvBvnXNiQz9dTppGk1tAsVxtJsvhEmojEfBU3ezf': {
    'ME': 'boryoku_dragonz',
  },
  'BHVPUojZvH2mWo5T6ZCJQnyqMTe4McHsXGSJutezTPGE': {
    'SA': 'saibagang',
    'ME': 'saiba_gang',
  },
  'F5FKqzjucNDYymjHLxMR2uBT43QmaqBAMJwjwkvRRw4A': {
    'SA': 'solpunks',
    'ME': 'solpunks',
  },
  'AvkbtawpmMSy571f71WsWEn41ATHg5iHw27LoYJdk8QA': {
    'SA': 'thugbirdz',
    'DE': 'Thugbirdz',
    'ME': 'thugbirdz',
  },
  'Bhr9iWx7vAZ4JDD5DVSdHxQLqG9RvCLCSXvu6yC4TF6c': {
    'SA': 'skeletoncrew',
    'DE': 'Skeleton%20Crew%20SKULLS',
    'ME': 'skeleton_crew_skulls',
  }
}

const collectionCache = {}

function initPricesFromCache(creator: string) {
  const existingCache = (collectionCache as any)[creator];
  return existingCache ?? [];
}

function updateCache(creator: string, prices: number[]) {
  (collectionCache as any)[creator] = prices;
}

function calcMedian(values: number[]) {
  if (values.length === 0) throw new Error("No inputs");
  values.sort(function (a, b) {
    return a - b;
  });
  const half = Math.floor(values.length / 2);
  if (values.length % 2)
    return values[half];
  return (values[half - 1] + values[half]) / 2.0;
}

function calcStats(prices: number[]): IStats {
  let floor: number | null = null;
  let total = 0;
  let count = prices.length;

  prices.forEach(p => {
    //update floor
    if (floor === null) {
      floor = p;
    } else if (p < floor) {
      floor = p
    }
    //update total
    total += p
  })
  const mean = total / count;
  const median = calcMedian(prices)
  return {floor: floor!, mean: mean, median}
}

async function fetchSolanartPrices(collection: string) {
  const collectionName = (collections as any)[collection]['SA']
  if (!collectionName) return;
  const apiLink = 'https://qzlsklfacc.medianetwork.cloud'
  const link = `${apiLink}/nft_for_sale?collection=${collectionName}`
  const headers = {
    'user-agent': 'Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.193 Safari/537.36'
  }
  const {data} = await axios.get(link, {headers})
  // console.log(data)
  return data.map((d: any) => d.price)
}

async function fetchDigitalEyezPrices(collection: string) {
  const collectionName = (collections as any)[collection]['DE']
  if (!collectionName) return;
  const apiLink = 'https://us-central1-digitaleyes-prod.cloudfunctions.net'
  const link = `${apiLink}/offers-retriever?collection=${collectionName}`
  const headers = {
    'user-agent': 'Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.193 Safari/537.36'
  }
  const {data} = await axios.get(link, {headers})
  // console.log(data)
  return data.offers.map((d: any) => d.price / LAMPORTS_PER_SOL)
}

async function fetchMagicEdenPrices(collection: string) {
  const collectionName = (collections as any)[collection]['ME']
  if (!collectionName) return;
  const apiLink = 'https://api-mainnet.magiceden.io/rpc'
  const link = `${apiLink}/getListedNFTsByQuery?q=%7B%22$match%22:%7B%22collectionSymbol%22:%22${collectionName}%22%7D,%22$sort%22:%7B%22takerAmount%22:1,%22createdAt%22:-1%7D,%22$skip%22:0,%22$limit%22:20%7D`
  const headers = {
    'user-agent': 'Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.193 Safari/537.36'
  }
  const {data} = await axios.get(link, {headers})
  // console.log(data)
  return data.results.map((d: any) => d.price)
}

async function fetchAndCalcStats(creator: string): Promise<IStats | undefined> {
  const prices: number[] = initPricesFromCache(creator);

  if (!prices.length) {
    const responses = await Promise.all([
      okToFailAsync(fetchSolanartPrices, [creator]),
      okToFailAsync(fetchDigitalEyezPrices, [creator]),
      okToFailAsync(fetchMagicEdenPrices, [creator])
    ])
    responses.forEach(r => {
      if (r) {
        prices.push(...r)
      }
    })
    console.log(`fetched prices for ${creator} creator are:`, prices)
    updateCache(creator, prices);
  }

  //if we failed to get prices from cache AND failed to get from mps - quit
  if (!prices.length) {
    return;
  }

  const stats = calcStats(prices)
  console.log(`final stats for ${creator} creator are:`, stats)
  return stats;
}

async function populateNFTsWithPriceStats(nfts: INFTData[]) {
  const promises: any[] = []
  nfts.forEach(nft => promises.push(fetchAndCalcStats(nft.onchainMetadata.data.creators[0].address)))
  const responses = await Promise.all(promises);
  responses.forEach((r, i) => {
    nfts[i].currentPrices = r
  })
  console.log('Price Stats populated!')
}

// --------------------------------------- get NFT metadata

export async function fetchNFTMetadata(mint: string, conn: Connection) {
  console.log('Pulling metadata for:', mint)
  const metadataPDA = await Metadata.getPDA(mint);
  let onchainMetadata: any;
  try {
    onchainMetadata = (await Metadata.load(conn, metadataPDA)).data;
  } catch {
    //no metadata = isn't an actual NFT!
    return;
  }
  const {data: externalMetadata} = await axios.get(onchainMetadata!.data.uri);
  // const creator = onchainMetadata.data.creators[0].address
  // console.log('onchain', onchainMetadata)
  // console.log('external', externalMetadata)
  return {
    onchainMetadata,
    externalMetadata,
  }
}

async function populateNFTsWithMetadata(nfts: INFTData[], conn: Connection) {
  const promises: any[] = []
  nfts.forEach(nft => promises.push(fetchNFTMetadata(nft.mint, conn)))
  const responses = await Promise.all(promises);
  responses.forEach((r, i) => {
    nfts[i].onchainMetadata = r.onchainMetadata;
    nfts[i].externalMetadata = r.externalMetadata;
  })
  console.log('Metadata populated!')
}

// --------------------------------------- calc paperhands

//todo if someone bought / sold the same nft multiple times, that'd be a problem

function calcPaperDiamondHands(nft: INFTData, method: PriceMethod): [number | undefined, number | undefined] {
  let paper: number | undefined;
  let diamond: number | undefined;
  if (nft.soldAt) {
    paper = nft.soldAt - (nft.currentPrices as any)[method]
  } else {
    diamond = (nft.currentPrices as any)[method] - nft.boughtAt!
  }
  return [paper, diamond]
}

function populateNFTsWithPapersAndDiamonds(nfts: INFTData[], method: PriceMethod) {
  for (const nft of nfts) {
    if (!nft.currentPrices) {
      continue;
    }
    const [paper, diamond] = calcPaperDiamondHands(nft, method)
    nft.paperhanded = paper;
    nft.diamondhanded = diamond;
  }
}

// --------------------------------------- play

function writeToDisk(dir: string, arr: any[]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  arr.forEach(i => {
    const data = JSON.stringify(i, (k, v) => {
      return v instanceof PublicKey ? v.toBase58() : v
    }, 2);
    fs.writeFile(`${dir}/nft-${i.mint}.json`, data, (err) => {
      if (err) {
        console.log('Write error:', err);
      }
    });
  })
  console.log('Done writing!')
}

async function play() {
  // const conn = new Connection("https://api.mainnet-beta.solana.com")
  const conn = CONN
  await getTxHistory(conn)
  await populateNFTsWithMetadata(allNFTs, conn);
  await populateNFTsWithPriceStats(allNFTs)
  populateNFTsWithPapersAndDiamonds(allNFTs, PriceMethod.median)
  console.log(allNFTs)
  writeToDisk('paperhands', allNFTs)
}

play()
