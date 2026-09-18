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

  async openInputs(configurations, settings = {}) {
    if (!configurations.length) return [];
    this.context ||= new AudioContext({ latencyHint: "interactive" });
    await this.context.resume();

    const opened = [];
    try {
      for (const configuration of configurations) {
        const deviceId = configuration.deviceId;
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
        opened.push(new PitchInput(stream, this.context, {
          ...settings,
          inputGain: configuration.inputGain,
          monitorVolume: configuration.monitorVolume,
        }));
      }
      return opened;
    } catch (error) {
      opened.forEach((input) => input.stop());
      throw error;
    }
  }

  async setOutput(audioElement, deviceId) {
    const target = deviceId || "default";
    let mediaSupported = true;
    let monitorSupported = true;
    if (target !== "default") {
      if (typeof audioElement.setSinkId === "function") await audioElement.setSinkId(target);
      else mediaSupported = false;
      if (this.context && typeof this.context.setSinkId === "function") await this.context.setSinkId(target);
      else if (this.context) monitorSupported = false;
    }
    return { supported: mediaSupported, monitorSupported };
  }
}

export function deviceLabel(device, index, type) {
  return device.label || `${type} ${index + 1}`;
}
