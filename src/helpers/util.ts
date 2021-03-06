import {Keypair, PublicKey} from "@solana/web3.js";
import bs58 from "bs58";
import fs from "fs";

export function getEnumKeyByEnumValue(myEnum: any, enumValue: any) {
  let keys = Object.keys(myEnum).filter(x => myEnum[x] == enumValue);
  return keys.length > 0 ? keys[0] : null;
}

//NOTE: the first array *must* be the longer of the two
export function joinArraysOnKey(arr1: any[], arr2: any[], key: string) {
  let merged = [];
  for (let i = 0; i < arr1.length; i++) {
    merged.push({
        ...arr1[i],
        ...(arr2.find((itmInner) => itmInner[key] === arr1[i][key]))
      }
    );
  }
  return merged;
}

export async function okToFailAsync(callback: any, args: any[], wantObject = false) {
  try {
    //mandatory await here, can't just pass down (coz we need to catch error in this scope)
    return await callback(...args);
  } catch (e) {
    console.log(`Oh no! ${callback.name} called with ${args} blew up!`);
    // console.log("Full error:", e);
    return wantObject ? {} : undefined;
  }
}

export function okToFailSync(callback: any, args: any[], wantObject = false) {
  try {
    return callback(...args);
  } catch (e) {
    console.log(`Oh no! ${callback.name} called with ${args} blew up!`);
    // console.log("Full error:", e);
    return wantObject ? {} : undefined;
  }
}

export function loadKeypairSync(path: string): Keypair {
  const secretKey = JSON.parse(fs.readFileSync(path, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

export function stringifyPubkeysInObject(o: any): any {
  const newO = {...o};
  for (const [k, v] of Object.entries(newO)) {
    if (v instanceof PublicKey) {
      newO[k] = v.toBase58();
    } else if (parseType(v) === 'array') {
      newO[k] = stringifyPubkeysInArray(v as any);
    } else if (parseType(v) === 'dict') {
      newO[k] = stringifyPubkeysInObject(v);
    } else {
      newO[k] = v;
    }
  }
  return newO;
}

export function stringifyPubkeysInArray(a: any[]): any[] {
  const newA = [];
  for (const i of a) {
    if (parseType(i) === 'array') {
      newA.push(stringifyPubkeysInArray(i));
    } else if (parseType(i) === 'dict') {
      newA.push(stringifyPubkeysInObject(i));
    } else {
      newA.push(i);
    }
  }
  return newA;
}

export function parseType<T>(v: T): string {
  if (v === null || v === undefined) {
    return 'null';
  } else if (typeof (v) === 'object') {
    if (v instanceof Array) {
      return 'array';
    } else if (v instanceof Date) {
      return 'date'
    }
    return 'dict'
  }
  return typeof (v)
}

export function writeToDisk(dir: string, arr: any[]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  arr.forEach(i => {
    const data = JSON.stringify(i, (k, v) => {
      return v instanceof PublicKey ? v.toBase58() : v
    }, 2);
    fs.writeFile(`${dir}/nft-${i.mint.toBase58()}.json`, data, (err) => {
      if (err) {
        console.log('Write error:', err);
      }
    });
  })
  console.log('Done writing!')
}

export function writeTxsToDisk(dir: string, arr: any[]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  arr.forEach(i => {
    const data = JSON.stringify(i, (k, v) => {
      return v instanceof PublicKey ? v.toBase58() : v
    }, 2);
    fs.writeFile(`${dir}/${i.transaction.signatures[0]}.json`, data, (err) => {
      if (err) {
        console.log('Write error:', err);
      }
    });
  })
  console.log('Done writing!')
}

export function loadFromDisk(dir: string) {
  const files = fs.readdirSync(dir)
  const parsedFiles: any[] = []
  files.forEach(f => {
    try {
      parsedFiles.push(JSON.parse(fs.readFileSync(`${dir}/${f}`, `utf8`)))
    } catch (e) {
      console.log('failed to parse file with error', e)
      console.log('file was', f)
    }
  })
  return parsedFiles
}

export function bs58toHex(bString: string): string {
  const bytes = bs58.decode(bString)
  return bytes.toString('hex')
}
