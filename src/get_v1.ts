import {TOKEN_PROGRAM_ID} from "@solana/spl-token";
import {Connection, PublicKey} from "@solana/web3.js"
import {CONN, OWNER} from "./helpers/constants";
import {Account, AnyPublicKey, programs} from '@metaplex/js';
import axios from "axios";
import BN from "bn.js";
import {getEnumKeyByEnumValue} from "./helpers/util";
import {
  EditionData,
  EditionMarkerData,
  MasterEditionV1Data,
  MasterEditionV2Data,
  MetadataData
} from "@metaplex/js/lib/programs/metadata";
import {deserializeTokenMint} from "./helpers/spl-token";

const {
  metaplex: {Store, AuctionManager,},
  metadata: {Metadata},
  auction: {Auction},
  vault: {Vault}
} = programs;

interface INFT {
  pubkey: PublicKey,
  mint: PublicKey,
  owner: PublicKey,
  amount: number,
  supply: BN,
  mintAuthority?: PublicKey,
  freezeAuthority?: PublicKey,
  metadataPDA?: PublicKey,
  onchainMetadata?: MetadataData,
  externalMetadata?: any //maybe one day I'll define this:)
  edition?: string,
  editionData?: EditionData,
  masterEditionData?: MasterEditionV2Data | MasterEditionV1Data,
  masterEditionPDA?: PublicKey,
  editionMarkerData?: EditionMarkerData,
}

export async function onlyTokensWithSupplyOfOne(tokens: INFT[]) {
  const responses = await axios.all(tokens.map(t => deserializeTokenMint(t.mint)));
  // console.log(responses)

  const filteredTokens = tokens.map((t, i) => ({
    ...t,
    supply: responses[i].supply,
    mintAuthority: responses[i].mintAuthority,
    freezeAuthority: responses[i].freezeAuthority,
  } as INFT))

  return filteredTokens.filter(t => t.supply.eq(new BN(1)));
}

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
  console.log(enrichedNFTs);
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
    const data = untriagedEditionData.data as programs.metadata.EditionData;
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

// --------------------------------------- call stuff

getNFTsByOwner(OWNER);
