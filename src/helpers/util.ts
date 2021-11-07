export function getEnumKeyByEnumValue(myEnum: any, enumValue: any) {
  let keys = Object.keys(myEnum).filter(x => myEnum[x] == enumValue);
  return keys.length > 0 ? keys[0] : null;
}
