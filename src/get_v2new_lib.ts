import {PublicKey} from "@solana/web3.js"
import {CONN} from "./helpers/constants";
import axios from "axios";
import {
  getEnumKeyByEnumValue,
  joinArraysOnKey,
  okToFailAsync,
  stringifyPubkeysInArray,
  writeToDisk
} from "./helpers/util";
import {deserializeTokenAccount, deserializeTokenMint} from "./helpers/spl-token";
import {EditionData} from "@metaplex/js/lib/programs/metadata";
import {INFT, INFTParams} from "./helpers/types";
import {
  Edition,
  MasterEdition,
  Metadata,
  MetadataKey
} from "@metaplex-foundation/mpl-token-metadata";
import {Account, AnyPublicKey} from "@metaplex/js";

// --------------------------------------- getters

//will fetch all the editions from master's PDA. Can be long!
export async function getEditionsFromMaster(masterPDA: AnyPublicKey) {
  const masterInfo = await Account.getInfo(CONN, masterPDA);
  const me = new MasterEdition(masterPDA, masterInfo);
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

export async function getEditionInfoByMint(mint: PublicKey) {
  //untriaged
  const pda = await Edition.getPDA(mint);
  const info = await Account.getInfo(CONN, pda);
  const key = info?.data[0];

  const editionType = getEnumKeyByEnumValue(MetadataKey, key);
  let editionPDA;
  let editionData;
  let masterEditionPDA;
  let masterEditionData;

  //triaged
  switch (key) {
    case MetadataKey.EditionV1:
      editionPDA = pda;
      editionData = (new Edition(pda, info)).data;
      // we can further get master edition info, since we know the parent
      ({
        masterEditionPDA,
        masterEditionData
      } = await okToFailAsync(getParentEdition, [editionData]));
      break;
    case MetadataKey.MasterEditionV1:
    case MetadataKey.MasterEditionV2:
      masterEditionData = (new MasterEdition(pda, info)).data;
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
  const masterEditionData = (new MasterEdition(masterEditionPDA, masterInfo)).data;
  return {masterEditionPDA, masterEditionData};
}

// --------------------------------------- deserializers

export function deserializeMetadataOnchain(metadatas: Metadata[]): INFT[] {
  return metadatas.map(m => ({
    mint: new PublicKey(m.data.mint),
    metadataPDA: m.pubkey,
    metadataOnchain: m.data,
  } as INFT))
}

// --------------------------------------- together

export async function turnMetadatasIntoNFTs(metadatas: Metadata[]): Promise<INFT[]> {
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
        splMintInfo: await okToFailAsync(deserializeTokenMint, [n.mint]),
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
  const t1 = performance.now();

  let metadatas;
  if (owner) {
    console.log('Time to get em NFTs by owner:', owner.toBase58());
    metadatas = await getMetadataByOwner(owner);
  } else if (creators && creators.length > 0 && creators[0] !== null) {
    console.log('Time to get em NFTs by creators:', stringifyPubkeysInArray(creators));
    metadatas = await getMetadataByCreators(creators);
  } else if (mint) {
    console.log('Time to get em NFTs by mint:', mint.toBase58());
    metadatas = await getMetadataByMint(mint);
  } else if (updateAuthority) {
    console.log('Time to get em NFTs by authority:', updateAuthority.toBase58());
    metadatas = await getMetadataByUpdateAuthority(updateAuthority);
  } else {
    throw new Error('You must pass one of owner / creator / authority / mint');
  }

  console.log(`got ${metadatas.length} metadatas`)
  const t2 = performance.now();

  const nfts = await turnMetadatasIntoNFTs(metadatas);

  const t3 = performance.now();
  console.log('Time to find NFTs:', (t2 - t1) / 1000);
  console.log('Time to fetch Metadata:', (t3 - t2) / 1000);
  console.log('TOTAL',(t3-t1)/1000)

  return nfts
}


// --------------------------------------- play

const auroryCreator = new PublicKey("9vwYtcJsH1MskNaixcjgNBnvBDkTBhyg25umod1rgMQL");
const degenCreator = new PublicKey("9BKWqDHfHZh9j39xakYVMdr6hXmCLHH5VfCpeq2idU9L");
const sneksCreator = new PublicKey("AuTF3kgAyBzsfjGcNABTSzzXK4bVcZcyZJtpCrayxoVp");
const solanautsCreator = new PublicKey("BDYYJ1VzPDXwJoARMZNnN4MX4cZNjVvc5DfFaKzgrruz");
const creator100 = new PublicKey("5SNz7scF5xiSZxmSzgQRyVGdY8PhEHM5LDMwCKGoFQTZ");

export const ownerMainnet = new PublicKey("AGsJu1jZmFcVDPdm6bbaP54S3sMEinxmdiYWhaBBDNVX");
export const ownerDevnet = new PublicKey("AGsJu1jZmFcVDPdm6bbaP54S3sMEinxmdiYWhaBBDNVX");
export const creatorDevnet = new PublicKey("75ErM1QcGjHiPMX7oLsf9meQdGSUs4ZrwS2X8tBpsZhA");

//triage
const creator = creator100;
const owner = ownerMainnet;

async function play() {
  const nfts = await getNFTs({owner});
  // const nfts = await getNFTs({creators: [creator]});
  // const nfts = await getNFTs({updateAuthority: creator});
  // const nfts = await getNFTs({mint: new PublicKey("Ep6YXiX9tEvhvFpNkDAXLd3yk35Y9kom5nBXFk2ZtV9L")});

  // await writeToDisk('output', nfts);
}

play()
