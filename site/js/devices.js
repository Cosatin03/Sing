import { PitchInput } from "./pitch.js";

export class DeviceManager {
  constructor() {
    this.context = null;
    this.permissionGranted = false;
  }

  async unlock() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Dieser Browser unterstützt keine Mikrofonaufnahme. Nutze aktuelles Chrome oder Edge über HTTPS.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    this.permissionGranted = true;
    return this.list();
  }

  async list() {
    if (!navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [] };
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: devices.filter((device) => device.kind === "audioinput"),
      outputs: devices.filter((device) => device.kind === "audiooutput"),
    };
  }

  async openInputs(deviceIds, settings = {}) {
    if (!deviceIds.length) return [];
    this.context ||= new AudioContext({ latencyHint: "interactive" });
    await this.context.resume();

    const opened = [];
    try {
      for (const deviceId of deviceIds) {
        if (!deviceId) throw new Error("Jedem Spieler muss ein Mikrofon zugewiesen sein.");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: deviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
          },
        });
        opened.push(new PitchInput(stream, this.context, settings));
      }
      return opened;
    } catch (error) {
      opened.forEach((input) => input.stop());
      throw error;
    }
  }

  async setOutput(audioElement, deviceId) {
    if (!deviceId || deviceId === "default") return { supported: true };
    if (typeof audioElement.setSinkId !== "function") return { supported: false };
    await audioElement.setSinkId(deviceId);
    return { supported: true };
  }
}

export function deviceLabel(device, index, type) {
  return device.label || `${type} ${index + 1}`;
}
