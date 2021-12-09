import {PublicKey} from "@solana/web3.js"
import {CONN, METADATA_PROGRAM_ID} from "./helpers/constants";
import axios from "axios";
import {getEnumKeyByEnumValue, okToFailAsync} from "./helpers/util";
import {deserializeTokenAccount, deserializeTokenMint} from "./helpers/spl-token";
import {EditionData, MetadataData} from "@metaplex/js/lib/programs/metadata";
import {INFT, INFTParams} from "./helpers/types";
import {
  computeCreatorOffset,
  Edition,
  MasterEdition,
  Metadata,
  MetadataKey
} from "@metaplex-foundation/mpl-token-metadata";
import {Account} from "@metaplex/js";
import {TOKEN_PROGRAM_ID} from "@solana/spl-token";
import {Buffer} from "buffer";
import bs58 from "bs58";

// --------------------------------------- get tokens

interface IToken {
  mint: PublicKey,
  address: PublicKey,
  metadataPDA?: PublicKey,
  metadataOnchain?: MetadataData,
}

const baseFilters = [
  // Filter for MetadataV1 by key
  {
    memcmp: {
      offset: 0,
      bytes: bs58.encode(Buffer.from([MetadataKey.MetadataV1])),
    },
  },
].filter(Boolean);

function deserializeMetadata(rawMetadata: any) {
  const acc = new Account(rawMetadata.pubkey, rawMetadata.account);
  return Metadata.from(acc);
}

async function metadatasToTokens(rawMetadatas: any[]): Promise<IToken[]> {
  const promises = await Promise.all(rawMetadatas.map(async m => {
    try {
      const metadata = deserializeMetadata(m);
      const mint = new PublicKey(metadata.data.mint);
      const address = await getHolderByMint(mint);
      return {
        mint,
        address,
        metadataPDA: metadata.pubkey,
        metadataOnchain: metadata.data
      } as IToken
    } catch (e) {
      console.log('failed to deserialize one of the fetched metadatas')
    }
  }));
  return promises.filter(t => !!t) as IToken[]
}

async function getHolderByMint(mint: PublicKey): Promise<PublicKey> {
  const tokens = await CONN.getTokenLargestAccounts(mint);
  return tokens.value[0].address; //since it's an NFT, we just grab the 1st account
}

async function getTokensByCreator(creator: PublicKey): Promise<IToken[]> {
  const rawMetadatas = await CONN.getProgramAccounts(METADATA_PROGRAM_ID, {
    filters: [
      ...baseFilters,
      {
        memcmp: {
          offset: computeCreatorOffset(0),
          bytes: creator.toBase58(),
        },
      },
    ],
  });
  return metadatasToTokens(rawMetadatas);
}

async function getTokensByUpdateAuthority(updateAuthority: PublicKey): Promise<IToken[]> {
  const rawMetadatas = await CONN.getProgramAccounts(METADATA_PROGRAM_ID, {
    filters: [
      ...baseFilters,
      {
        memcmp: {
          offset: 1,
          bytes: updateAuthority.toBase58(),
        },
      },
    ],
  });
  return metadatasToTokens(rawMetadatas);
}

async function getTokensByMint(mint: PublicKey): Promise<IToken[]> {
  return [{
    mint,
    address: await getHolderByMint(mint)
  }]
}

async function getTokensByOwner(owner: PublicKey): Promise<IToken[]> {
  const tokens = await CONN.getParsedTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID,
  });

  // initial filter - only tokens with 0 decimals & of which 1 is present in the wallet
  return tokens.value
    .filter((t) => {
      const amount = t.account.data.parsed.info.tokenAmount;
      return amount.decimals === 0 && amount.uiAmount === 1;
    })
    .map((t) => {
      return {
        address: new PublicKey(t.pubkey),
        mint: new PublicKey(t.account.data.parsed.info.mint)
      };
    });
}

// --------------------------------------- enrich with useful stuff

async function getMetadataByMint(mint: PublicKey, metadataPDA?: PublicKey, metadataOnchain?: MetadataData) {
  if (!metadataPDA) metadataPDA = await Metadata.getPDA(mint);
  if (!metadataOnchain) metadataOnchain = (await Metadata.load(CONN, metadataPDA)).data;
  const metadataExternal = (await axios.get(metadataOnchain.data.uri)).data;
  return {
    metadataPDA,
    metadataOnchain,
    metadataExternal,
  };
}

async function getEditionInfoByMint(mint: PublicKey) {
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

async function getParentEdition(editionData: EditionData) {
  const masterEditionPDA = new PublicKey(editionData.parent);
  const masterInfo = await Account.getInfo(CONN, masterEditionPDA);
  const masterEditionData = (new MasterEdition(masterEditionPDA, masterInfo)).data;
  return {masterEditionPDA, masterEditionData};
}

async function tokensToEnrichedNFTs(tokens: IToken[]): Promise<INFT[]> {
  return Promise.all(
    tokens.map(async t => {
      // console.log(`Processing Mint ${t.mint}`)
      return {
        mint: t.mint,
        address: t.address,
        splTokenInfo: await okToFailAsync(deserializeTokenAccount, [t.mint, t.address]),
        splMintInfo: await okToFailAsync(deserializeTokenMint, [t.mint]),
        ...(await okToFailAsync(getMetadataByMint, [t.mint, t.metadataPDA, t.metadataOnchain], true)),
        ...(await okToFailAsync(getEditionInfoByMint, [t.mint], true)),
      }
    })
  )
}

// --------------------------------------- interface

export async function getNFTs(
  {
    owner,
    creator,
    mint,
    updateAuthority
  } = {} as INFTParams): Promise<INFT[]> {
  const t1 = performance.now();

  let tokens: IToken[] = [];
  if (owner) {
    console.log('Time to get em NFTs by owner:', owner.toBase58());
    tokens = await getTokensByOwner(owner);
  } else if (creator) {
    console.log('Time to get em NFTs by creator:', creator.toBase58());
    tokens = await getTokensByCreator(creator);
  } else if (mint) {
    console.log('Time to get em NFTs by mint:', mint.toBase58());
    tokens = await getTokensByMint(mint);
  } else if (updateAuthority) {
    console.log('Time to get em NFTs by authority:', updateAuthority.toBase58());
    tokens = await getTokensByUpdateAuthority(updateAuthority);
  } else {
    throw new Error('You must pass one of owner / creator / authority / mint');
  }
  const t2 = performance.now();
  console.log(`Found ${tokens.length} tokens`)
  console.log('Time:', (t2 - t1) / 1000);

  const nfts = await tokensToEnrichedNFTs(tokens);
  const t3 = performance.now();
  console.log(`Prepared a total ${nfts.length} NFTs`)
  console.log('Time:', (t3 - t2) / 1000);

  console.log('TOTAL time:', (t3 - t1) / 1000)
  return nfts
}


// --------------------------------------- play

//todo test failure

const smb = new PublicKey("9uBX3ASjxWvNBAD1xjbVaKA74mWGZys3RGSF7DdeDD3F");
const dragons1000 = new PublicKey("DRGNjvBvnXNiQz9dTppGk1tAsVxtJsvhEmojEfBU3ezf");
const aurory10k = new PublicKey("9vwYtcJsH1MskNaixcjgNBnvBDkTBhyg25umod1rgMQL");
const degen10k = new PublicKey("9BKWqDHfHZh9j39xakYVMdr6hXmCLHH5VfCpeq2idU9L");
const solanauts500 = new PublicKey("BDYYJ1VzPDXwJoARMZNnN4MX4cZNjVvc5DfFaKzgrruz");
const marker100 = new PublicKey("5SNz7scF5xiSZxmSzgQRyVGdY8PhEHM5LDMwCKGoFQTZ");

export const owner = new PublicKey("AGsJu1jZmFcVDPdm6bbaP54S3sMEinxmdiYWhaBBDNVX");

//triage
const creator = dragons1000;

async function play() {
  // const nfts = await getNFTs({owner});
  // const nfts = await getNFTs({creator});
  const nfts = await getNFTs({updateAuthority: creator});
  // const nfts = await getNFTs({mint: new PublicKey("BWVeyQTJ4Y3om1vsq9BojSTNcPfyiXFrUEdra2uNTsaS")});

  // await writeToDisk('output', nfts);
}

play()
