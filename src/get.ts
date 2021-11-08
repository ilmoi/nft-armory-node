import {PublicKey} from "@solana/web3.js"
import {CONN, CREATOR, OWNER} from "./helpers/constants";
import {Account, AnyPublicKey, programs} from '@metaplex/js';
import axios from "axios";
import {getEnumKeyByEnumValue, joinArraysOnKey, okToFailAsync} from "./helpers/util";
import {deserializeTokenAccount} from "./helpers/spl-token";
import {EditionData} from "@metaplex/js/lib/programs/metadata";
import {INFT, INFTParams} from "./helpers/types";
import fs from 'fs'

const {
  metaplex: {Store, AuctionManager,},
  metadata: {Metadata},
  auction: {Auction},
  vault: {Vault}
} = programs;

// --------------------------------------- getters

//will fetch all the editions from master's PDA. Can be long!
export async function getEditionsFromMaster(masterPDA: AnyPublicKey) {
  const masterInfo = await Account.getInfo(CONN, masterPDA);
  const me = new programs.metadata.MasterEdition(masterPDA, masterInfo);
  const foundEditions = await me.getEditions(CONN);
  console.log(`Found a total of ${foundEditions.length} Editions for ME: ${masterPDA}`);
  return foundEditions;
}

//returns metadatas for all NFTs where EITHER of the creators is listed
//so if one has 9 and other 2, total will be 11
export async function getMetadataByCreators(creators: AnyPublicKey[]) {
  const nfts = await Metadata.findMany(CONN, {
    creators,
  })
  console.log(`Found a total of ${nfts.length} NFTs for creators: ${creators}`);
  return nfts;
}

export async function getMetadataByUpdateAuthority(updateAuthority: AnyPublicKey) {
  const nfts = await Metadata.findMany(CONN, {
    updateAuthority,
  })
  console.log(`Found a total of ${nfts.length} NFTs for authority: ${updateAuthority}`);
  return nfts;
}

export async function getMetadataByMint(mint: AnyPublicKey) {
  const nfts = await Metadata.findMany(CONN, {
    mint,
  })
  console.log(`Found a total of ${nfts.length} NFTs for mint: ${mint}`);
  return nfts;
}

export async function getMetadataByOwner(owner: AnyPublicKey) {
  const nfts = await Metadata.findByOwnerV2(CONN, owner);
  console.log(`Found a total of ${nfts.length} NFTs for owner: ${owner}`);
  return nfts;
}

export async function getHolderByMint(mint: PublicKey) {
  const tokens = await CONN.getTokenLargestAccounts(mint);
  if (tokens && tokens.value.length > 0) {
    return tokens.value[0].address; //since it's an NFT, we just grab the 1st account
  }
}

export async function getExternalMetadata(uri: string) {
  const response = await axios.get(uri);
  if (response) {
    return response.data;
  }
}

async function getEditionInfoByMint(mint: PublicKey) {
  //untriaged
  const pda = await programs.metadata.Edition.getPDA(mint);
  const info = await Account.getInfo(CONN, pda);
  const key = info?.data[0];

  const editionType = getEnumKeyByEnumValue(programs.metadata.MetadataKey, key);
  let editionPDA;
  let editionData;
  let masterEditionPDA;
  let masterEditionData;

  //triaged
  switch (key) {
    case programs.metadata.MetadataKey.EditionV1:
      editionPDA = pda;
      editionData = new programs.metadata.Edition(pda, info);
      // we can further get master edition info, since we know the parent
      ({masterEditionPDA, masterEditionData} = await okToFailAsync(getParentEdition, [editionData.data]));
      break;
    case programs.metadata.MetadataKey.MasterEditionV1:
    case programs.metadata.MetadataKey.MasterEditionV2:
      masterEditionData = new programs.metadata.MasterEdition(pda, info);
      masterEditionPDA = pda;
      break;
  }

  return {
    editionType,
    editionPDA,
    editionData,
    masterEditionPDA,
    masterEditionData,
  }
}

export async function getParentEdition(editionData: EditionData) {
  const masterEditionPDA = new PublicKey(editionData.parent);
  const masterInfo = await Account.getInfo(CONN, masterEditionPDA);
  const masterEditionData = new programs.metadata.MasterEdition(masterEditionPDA, masterInfo);
  return {masterEditionPDA, masterEditionData};
}

// --------------------------------------- deserializers

export function deserializeMetadataOnchain(metadatas: programs.metadata.Metadata[]): INFT[] {
  return metadatas.map(m => ({
    mint: new PublicKey(m.data.mint),
    metadataPDA: m.pubkey,
    metadataOnchain: m.data,
  } as INFT))
}

// --------------------------------------- together

export async function turnMetadatasIntoNFTs(metadatas: programs.metadata.Metadata[]): Promise<INFT[]> {
  let NFTs = deserializeMetadataOnchain(metadatas);

  //todo temp
  // NFTs = NFTs.slice(0, 100);

  const enrichedNFTs = await Promise.all(
    NFTs.map(async n => {
      console.log(`Processing NFT ${n.mint}`)
      const address = await okToFailAsync(getHolderByMint, [new PublicKey(n.metadataOnchain.mint)]);
      return {
        mint: n.mint,
        address,
        splTokenInfo: await okToFailAsync(deserializeTokenAccount, [n.mint, address]),
        metadataExternal: await okToFailAsync(getExternalMetadata, [n.metadataOnchain.data.uri]),
        ...(await okToFailAsync(getEditionInfoByMint, [n.mint], true)),
      }
    })
  )
  NFTs = joinArraysOnKey(NFTs, enrichedNFTs, "mint");
  console.log(`Prepared a total of ${NFTs.length} NFTs`);
  return NFTs
}

export async function getNFTs(
  {
    owner,
    creators,
    mint,
    updateAuthority
  } = {} as INFTParams): Promise<INFT[]> {
  let metadatas;
  if (owner) {
    metadatas = await getMetadataByOwner(owner);
  } else if (creators && creators.length > 0) {
    metadatas = await getMetadataByCreators(creators);
  } else if (mint) {
    metadatas = await getMetadataByMint(mint);
  } else if (updateAuthority) {
    metadatas = await getMetadataByUpdateAuthority(updateAuthority);
  } else {
    throw new Error("You must pass one of owner / creators / mint / updateAuthority");
  }
  return turnMetadatasIntoNFTs(metadatas);
}

// --------------------------------------- fs

async function writeToDisk(nfts: INFT[]) {
  nfts.forEach(n => {
    const data = JSON.stringify(n, (k, v) => {return v instanceof PublicKey ? v.toBase58() : v}, 2);
    fs.writeFile(`output/nft-${n.mint.toBase58()}.json`, data, (err) => {
      if (err) {
        console.log('Write error:', err);
      }
    });
  })
  console.log('Done writing!')
}

// --------------------------------------- play

const auroryCreator = new PublicKey("9vwYtcJsH1MskNaixcjgNBnvBDkTBhyg25umod1rgMQL");
const degenCreator = new PublicKey("9BKWqDHfHZh9j39xakYVMdr6hXmCLHH5VfCpeq2idU9L");
const sneksCreator = new PublicKey("AuTF3kgAyBzsfjGcNABTSzzXK4bVcZcyZJtpCrayxoVp");
const solanautsCreator = new PublicKey("BDYYJ1VzPDXwJoARMZNnN4MX4cZNjVvc5DfFaKzgrruz");

const ownerMainnet = new PublicKey("5u1vB9UeQSCzzwEhmKPhmQH1veWP9KZyZ8xFxFrmj8CK");

//triage
const creator = auroryCreator;
const owner = ownerMainnet;

async function play() {
  const startTime = performance.now();
  const nfts = await getNFTs({owner}); //x => console.log(JSON.stringify(x, null, 4))
  // const nfts = await getNFTs({creators: [creator]});
  // const nfts = await getNFTs({updateAuthority: creator});
  // const nfts = await await getNFTs({mint: new PublicKey("2tUJ84YLqEUqZHuMkV31PWM4nkfGWu39b73kvV6Ca8n2")});
  const endTime = performance.now();
  console.log(`Total time: ${(endTime - startTime)/1000}s`)
  await writeToDisk(nfts);
}

play()
