import {loadFromDisk} from "./helpers/util";

function isPresent(dictKey: any, dict: any):boolean {
  return dictKey in dict
}

const isIterable = (value:any) => {
  return Symbol.iterator in Object(value);
}

function countAttributes(files: any[]) {
  const counterDicts: any = {};
  for (const f of files) {
    const attributes = f.metadataExternal.attributes
    if (!isIterable(attributes)) {
      continue
    }

    for (const attribute of attributes) {
      const dictName = attribute.trait_type;
      const dictEntry = attribute.value;

      if (isPresent(dictName, counterDicts)) {
        if (isPresent(dictEntry, counterDicts[dictName])) {
          counterDicts[dictName][dictEntry] += 1;
        } else {
          counterDicts[dictName][dictEntry] = 1;
        }
      } else {
        counterDicts[dictName] = {}
        counterDicts[dictName][dictEntry] = 1;
      }
    }
  }
  // console.log(counterDicts)
  return counterDicts
}

function calcRarityScores(counterDicts: any, fileCount: number) {
  console.log('length is', fileCount)
  const rarityScoreDicts: any = {};
  for (const [attrName, attrDict] of Object.entries(counterDicts)) {
    rarityScoreDicts[attrName] = {}
    for (const [attrEntry, attrCount] of Object.entries(attrDict as any)) {
      rarityScoreDicts[attrName][attrEntry] = 1/(attrCount as any / fileCount)
    }
  }
  // console.log(rarityScoreDicts)
  return rarityScoreDicts
}

function rankFilesByRarity(files: any[], rarityDicts: any) {
  const scoredFiles = [...files];
  for (const f of scoredFiles) {
    let totalScore = 0;
    const attributes = f.metadataExternal.attributes
    if (!isIterable(attributes)) {
      continue
    }

    for (const attribute of attributes) {
      totalScore += rarityDicts[attribute.trait_type][attribute.value]
    }
    f.totalScore = totalScore;
  }
  const sortedScoredFiles = scoredFiles.sort((first, second) => {
    return second.totalScore - first.totalScore;
  })
  for (const [i, el] of sortedScoredFiles.entries()) {
    el.rarityRank = i;
  }
  console.log(sortedScoredFiles.splice(0, 10))
  return sortedScoredFiles
}

const files = loadFromDisk('smb')
const t1 = performance.now()

const attrs = countAttributes(files)
const t2 = performance.now()

const rarityDicts = calcRarityScores(attrs, files.length)
const t3 = performance.now()

rankFilesByRarity(files, rarityDicts)
const t4 = performance.now()

console.log('time to count attrs', (t2-t1)/1000)
console.log('time to count rarity scores', (t3-t2)/1000)
console.log('time to rank files', (t4-t3)/1000)
console.log('tital time', (t4-t1)/1000)
