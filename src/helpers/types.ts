import {PublicKey} from "@solana/web3.js";
import {AccountInfo} from "@solana/spl-token";
import {
  EditionData,
  MasterEditionV1Data,
  MasterEditionV2Data,
  MetadataData
} from "@metaplex/js/lib/programs/metadata";

export interface INFT {
  //spl
  mint: PublicKey, //√
  address: PublicKey, //√
  splTokenInfo?: AccountInfo, //√
  //metadata stuff
  metadataPDA?: PublicKey, //√
  metadataOnchain: MetadataData, //√
  metadataExternal?: any //maybe one day I'll define this:) √
  //edition stuff
  editionType?: string,
  editionPDA?: PublicKey,
  editionData?: EditionData,
  masterEditionPDA?: PublicKey,
  masterEditionData?: MasterEditionV2Data | MasterEditionV1Data,
}

export interface INFTParams {
  owner?: PublicKey,
  creators?: PublicKey[],
  mint?: PublicKey,
  updateAuthority?: PublicKey,
}
