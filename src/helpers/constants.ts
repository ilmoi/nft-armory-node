import {Connection, PublicKey} from "@solana/web3.js";
import BN from "bn.js";
import {
  EditionData, EditionMarkerData,
  MasterEditionV1Data,
  MasterEditionV2Data,
  MetadataData
} from "@metaplex/js/lib/programs/metadata";

export const OWNER = new PublicKey("AGsJu1jZmFcVDPdm6bbaP54S3sMEinxmdiYWhaBBDNVX");
export const MINT_WALLET = new PublicKey("AGsJu1jZmFcVDPdm6bbaP54S3sMEinxmdiYWhaBBDNVX");
export const CONN = new Connection("https://api.devnet.solana.com");
export const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

export interface INFT {
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
