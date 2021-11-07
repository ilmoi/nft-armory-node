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

export async function okToFailAsync(callback: any, args: any[], wantObject=false) {
  try {
    //mandatory await here, can't just pass down (coz we need to catch error in this scope)
    return await callback(...args);
  } catch (e) {
    console.log(`Oh no! ${callback.name} called with ${args} blew up!`);
    console.log("Full error:", e);
    return wantObject ? {} : undefined;
  }
}

export function okToFailSync(callback: any, args: any[], wantObject=false) {
  try {
    return callback(...args);
  } catch (e) {
    console.log(`Oh no! ${callback.name} called with ${args} blew up!`);
    console.log("Full error:", e);
    return wantObject ? {} : undefined;
  }
}
