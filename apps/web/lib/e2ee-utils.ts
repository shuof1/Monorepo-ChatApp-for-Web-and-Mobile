export function makeE2EEId(plainId: string, aDeviceId: string, bDeviceId: string) {
  return `e2ee:${plainId}:${[aDeviceId, bDeviceId].sort().join("_")}`;
}

/** KV 键名：建议带上「我的设备」维度，避免多设备混淆 */
export function kvKeyE2EEBind(plainId: string, myDeviceId: string) {
  return `e2ee:bind:${plainId}:${myDeviceId}`;
}

export function parseE2EEId(e2eeId: string) {
  const [prefix, plainId, devicesStr] = e2eeId.split(":");
  if (prefix !== "e2ee" || !plainId || !devicesStr) {
    throw new Error(`Bad e2eeId: ${e2eeId}`);
  }
  const devices = devicesStr.split("_");
  return { plainId, devices }; // devices 已经是排序后的两端 deviceId
}