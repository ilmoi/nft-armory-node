import {TOKEN_PROGRAM_ID} from "@solana/spl-token";
import {Connection, PublicKey} from "@solana/web3.js"
import {CONN, INFT, OWNER} from "./helpers/constants";
import {Account, AnyPublicKey, programs} from '@metaplex/js';
import axios from "axios";
import BN from "bn.js";
import {EditionData} from "@metaplex/js/lib/programs/metadata";
import {getEnumKeyByEnumValue} from "./helpers/util";

const {
  metaplex: {Store, AuctionManager,},
  metadata: {Metadata},
  auction: {Auction},
  vault: {Vault}
} = programs;

// --------------------------------------- by owner

async function getNFTsByOwner(owner: PublicKey, mint?: PublicKey) {
  //getParsedTokenAccountsByOwner is a smarter version of getTokenAccountsByOwner
  const tokens = await CONN.getParsedTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID,
    ...(mint && {mint}),
  })

  //initial filter - only tokens with 0 decimals & of which 1 is present in the wallet
  const NFTs = tokens.value.filter(t => {
    // console.log(JSON.stringify(t, null, 4))
    const amount = t.account.data.parsed.info.tokenAmount;
    return amount.decimals === 0 && amount.uiAmount === 1;
  }).map(t => ({
    pubkey: t.pubkey,
    mint: new PublicKey(t.account.data.parsed.info.mint),
    owner: new PublicKey(t.account.data.parsed.info.owner),
    amount: t.account.data.parsed.info.tokenAmount.uiAmount, //float if > 0 decimals
  } as INFT))

  //further filter - only tokens with 1 in total supply
  // todo this step is actually redundand due to the enrichment step below
  // const NFTs = await onlyTokensWithSupplyOfOne(almostNFTs);

  //enrich with metadata
  let enrichedNFTs = await axios.all(NFTs.map(fetchNFTMetadata));
  enrichedNFTs = enrichedNFTs.filter(i => i !== undefined);
  // console.log(enrichedNFTs);
  console.log(`Found a total of ${enrichedNFTs.length} NFTs for owner: ${owner.toBase58()}`)

  return enrichedNFTs;
}

//this fetches many things, including on-chain / external metadata and master struct data
export async function fetchNFTMetadata(nft: INFT): Promise<INFT | undefined> {
  const metadataPDA = await Metadata.getPDA(nft.mint);
  let onchainMetadata;
  try {
    onchainMetadata = await Metadata.load(CONN, metadataPDA);
  } catch {
    //no metadata = isn't an actual NFT!
    return;
  }
  const externalMetadata = await axios.get(onchainMetadata.data.data.uri);

  //when pulled, we don't yet know if this normal edition or master edition.
  const untriagedEditionData = await MyMetadata.getEdition(CONN, nft.mint);
  let editionData;
  let masterEditionData;
  let masterEditionPDA;
  let editionMarkerData;
  //here we triage
  if (untriagedEditionData && untriagedEditionData.data.key === 1) {
    const data = untriagedEditionData.data as EditionData;
    const masterPDA = new PublicKey(data.parent);
    const masterInfo = await Account.getInfo(CONN, masterPDA);
    masterEditionData = new programs.metadata.MasterEdition(masterPDA, masterInfo);
    masterEditionPDA = masterPDA;
    editionData = untriagedEditionData;
    //todo currently this fails because I need to pass the mint of the ME, not the PDA of the ME - and I don't know how to get it from here ¯\_(ツ)_/¯
    //editionMarkerData = await MyMetadata.getEditionMarkerData(CONN, new PublicKey(data.parent), data.edition);
  } else if (untriagedEditionData) {
    masterEditionData = untriagedEditionData;
    masterEditionPDA = await programs.metadata.Edition.getPDA(nft.mint);
  }

  return {
    ...nft,
    metadataPDA,
    onchainMetadata: onchainMetadata.data,
    externalMetadata: externalMetadata.data,
    edition: untriagedEditionData ? getEnumKeyByEnumValue(programs.metadata.MetadataKey, untriagedEditionData.data.key) : undefined,
    editionData: editionData ? editionData.data : undefined,
    masterEditionData: masterEditionData ? masterEditionData.data : undefined,
    masterEditionPDA,
    // editionMarkerData,
  } as INFT

}

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

// --------------------------------------- temp

//temp until PR gets accepted
class MyMetadata extends Metadata {
  static async getEdition(connection: Connection, mint: AnyPublicKey) {
    const pda = await programs.metadata.Edition.getPDA(mint);
    const info = await Account.getInfo(connection, pda);
    const key = info?.data[0];

    switch (key) {
      case programs.metadata.MetadataKey.EditionV1:
        return new programs.metadata.Edition(pda, info);
      case programs.metadata.MetadataKey.MasterEditionV1:
      case programs.metadata.MetadataKey.MasterEditionV2:
        return new programs.metadata.MasterEdition(pda, info);
      default:
        return;
    }
  }

  static async getEditionMarkerData(connection: Connection, masterMint: AnyPublicKey, edition: BN) {
    const pda = await programs.metadata.EditionMarker.getPDA(masterMint, edition);
    const info = await Account.getInfo(connection, pda);
    return new programs.metadata.EditionMarker(pda, info);
  }
}

//todo try every function in metadata

// getNFTsByOwner(OWNER);

getMetadataByOwner("AGsJu1jZmFcVDPdm6bbaP54S3sMEinxmdiYWhaBBDNVX").then(console.log);
